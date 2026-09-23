"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { SessionSeason } from "@/lib/sessions/load-context";
import { episodeState, firstUnwatchedIndex } from "@/lib/sessions/episode-grid";

// Tope de la rejilla: 4 filas de 2 columnas. Sin él, una temporada de 24
// episodios convierte la hoja en un scroll interminable (D6).
const GRID_MAX_HEIGHT = "17rem";

export function SeriesEpisodeGrid({
  seasons,
  initialSeason,
  onNewlyMarkedChange,
}: {
  seasons: SessionSeason[];
  initialSeason: number;
  /** El footer de SessionSheet pinta «Guardar · N episodios» con el número, y
      el compositor ancla la nota en `last`. Se llama desde los manejadores de
      evento, NUNCA desde un efecto. */
  onNewlyMarkedChange: (
    count: number,
    last: { season: number; episode: number } | null,
  ) => void;
}) {
  const t = useTranslations("session");
  const tEpisode = useTranslations("episode");
  const gridRef = useRef<HTMLDivElement>(null);

  const [season, setSeason] = useState(initialSeason);

  // Fase 4 del rediseño de series: la hoja deja marcar en VARIAS temporadas.
  // Antes cambiar de temporada reseteaba lo marcado en la anterior, así que
  // registrar «el final de la T1 y el principio de la T2» eran dos hojas.
  //
  // Todo va por clave "temporada:episodio". `initialWatched` es la foto de "ya
  // visto" al abrir (no cambia con los clics: distingue "visto antes" de "esta
  // vez"); `selected` es lo visto + lo marcado ahora, en todas las temporadas.
  const key = (s: number, e: number) => `${s}:${e}`;
  const [initialWatched] = useState<Set<string>>(
    () =>
      new Set(
        seasons.flatMap((s) =>
          s.episodes.filter((e) => e.watched).map((e) => key(s.season, e.episode)),
        ),
      ),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialWatched));

  const newlyOf = (set: Set<string>) =>
    [...set]
      .filter((k) => !initialWatched.has(k))
      .map((k) => {
        const [s, e] = k.split(":").map(Number);
        return { season: s, episode: e };
      })
      .sort((a, b) => a.season - b.season || a.episode - b.episode);

  // Cambiar de temporada ya no toca lo marcado: solo cambia qué se ve.
  function handleSeasonChange(next: number) {
    setSeason(next);
  }

  // Manejador de evento: calcula el siguiente set a partir del `selected` del
  // closure (no del updater funcional de setState) precisamente para poder
  // llamar a onNewlyMarkedChange justo aquí, de forma síncrona y una sola vez
  // — un updater funcional puede invocarse más de una vez por la misma
  // actualización y duplicaría o desincronizaría el aviso al padre.
  function toggle(episode: number) {
    const k = key(season, episode);
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
    const newly = newlyOf(next);
    onNewlyMarkedChange(newly.length, newly.at(-1) ?? null);
  }

  // Vistas de la temporada abierta sobre las claves: lo que ya pintaba la
  // rejilla (episodeState) sigue trabajando con números de episodio.
  const seasonSet = (set: Set<string>, n: number) =>
    new Set(
      [...set]
        .filter((k) => k.startsWith(`${n}:`))
        .map((k) => Number(k.split(":")[1])),
    );
  const initialWatchedHere = seasonSet(initialWatched, season);
  const selectedHere = seasonSet(selected, season);

  // useMemo (no solo `?? []`) porque el fallback crea un array nuevo en cada
  // render: sin memorizar, el useEffect de más abajo (que depende de
  // `episodes`) se dispararía en cada render y no solo al cambiar de
  // temporada, reposicionando el scroll de más.
  const episodes = useMemo(
    () => seasons.find((s) => s.season === season)?.episodes ?? [],
    [seasons, season],
  );

  // Posicionar el scroll en el primer episodio sin ver. Es manipulación
  // imperativa del DOM (scrollTop), no setState: no choca con la regla de
  // set-state-in-effect.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const index = firstUnwatchedIndex(episodes);
    const row = Math.floor(index / 2);
    const tile = grid.children[index] as HTMLElement | undefined;
    grid.scrollTop = row === 0 || !tile ? 0 : tile.offsetTop - grid.offsetTop;
  }, [season, episodes]);

  const newlyMarked = newlyOf(selected);
  const furthest = [...selected]
    .map((k) => k.split(":").map(Number) as [number, number])
    .reduce(
      (best, [s, e]) =>
        s > best.season || (s === best.season && e > best.episode)
          ? { season: s, episode: e }
          : best,
      { season: 0, episode: 0 },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="flex justify-between font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("season")}
          <span className="normal-case tracking-normal">
            {t("seasonsCount", { n: seasons.length })}
          </span>
        </span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {seasons.map((s) => {
            // Lo visto + lo marcado en esta hoja: la cifra se mueve al marcar.
            const watched = seasonSet(selected, s.season).size;
            const on = s.season === season;
            return (
              <button
                key={s.season}
                type="button"
                aria-pressed={on}
                onClick={() => handleSeasonChange(s.season)}
                className={`min-w-[60px] shrink-0 rounded-[10px] border px-3 py-2.5 text-center ${
                  on
                    ? "border-type-series bg-type-series/8 text-type-series"
                    : "border-border bg-surface"
                }`}
              >
                <span className="block font-serif text-[16px] leading-none font-semibold">
                  {s.season}
                </span>
                <span className="mt-1 block font-mono text-[9.5px] text-muted-foreground">
                  {watched}/{s.episodes.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex justify-between font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("episodesLabel")}
          <span className="normal-case tracking-normal">{t("episodesMark")}</span>
        </span>

        {episodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("episodesEmpty")}</p>
        ) : (
          <div
            ref={gridRef}
            data-testid="episode-grid"
            style={{ maxHeight: GRID_MAX_HEIGHT }}
            className="grid grid-cols-2 gap-2.5 overflow-y-auto"
          >
            {episodes.map((ep) => {
              const st = episodeState(ep.episode, initialWatchedHere, selectedHere);
              return (
                <button
                  key={ep.episode}
                  type="button"
                  aria-pressed={st !== "unseen"}
                  onClick={() => toggle(ep.episode)}
                  className={`flex items-center gap-2.5 rounded-[11px] border p-2 text-left ${
                    st === "unseen"
                      ? "border-border bg-surface"
                      : "border-type-series bg-type-series/7"
                  }`}
                >
                  {/* El 5 % de episodios sin still_url cae al bloque neutro:
                      nunca un hueco roto ni un <Image> con src vacío. */}
                  <span className="relative h-8 w-[46px] shrink-0 overflow-hidden rounded-md bg-surface-muted">
                    {ep.stillUrl && (
                      <Image
                        src={ep.stillUrl}
                        alt=""
                        fill
                        sizes="46px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[12px] font-semibold">
                      {tEpisode("episodeShort", { n: ep.episode })}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {t(`epState.${st}`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Solo lo marcado AHORA, de cualquier temporada, como
            "temporada:episodio"; addSession los lee con formData.getAll. Lo ya
            visto no se reenvía: el servidor lo descartaría igual. */}
        {newlyMarked.map((e) => (
          <input
            key={`${e.season}:${e.episode}`}
            type="hidden"
            name="episodeKeys"
            value={`${e.season}:${e.episode}`}
          />
        ))}

        {newlyMarked.length > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11px] text-green">
            {/* «Vas por T·E» = lo más avanzado de TODO lo visto + marcado, en
                cualquier temporada: es donde queda el pase (rollSeriesProgress
                toma el más avanzado del pase y nunca retrocede). Antes, con una
                sola temporada por hoja, la chapa solo miraba la abierta y podía
                decir T1 con el pase ya en T2. `count` es otra pregunta —cuántos
                marcas ahora— y sale de `newlyMarked`. */}
            {t("episodesDelta", {
              count: newlyMarked.length,
              season: furthest.season,
              episode: furthest.episode,
            })}
          </span>
        )}
      </div>
    </div>
  );
}
