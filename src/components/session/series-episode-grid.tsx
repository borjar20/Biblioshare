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
  /** El footer de SessionSheet pinta «Guardar · N episodios» con este número.
      Se llama desde los manejadores de evento, NUNCA desde un efecto: eso
      sería setState del padre durante un efecto del hijo. */
  onNewlyMarkedChange: (count: number) => void;
}) {
  const t = useTranslations("session");
  const tEpisode = useTranslations("episode");
  const gridRef = useRef<HTMLDivElement>(null);

  const [season, setSeason] = useState(initialSeason);

  function watchedSetFor(n: number): Set<number> {
    const group = seasons.find((s) => s.season === n);
    return new Set((group?.episodes ?? []).filter((e) => e.watched).map((e) => e.episode));
  }

  // `initialWatched` es la foto de "ya visto" al abrir: no cambia con los
  // clics, y es lo que distingue "visto antes" de "esta sesión".
  const [initialWatched, setInitialWatched] = useState<Set<number>>(() =>
    watchedSetFor(initialSeason),
  );
  const [selected, setSelected] = useState<Set<number>>(() => watchedSetFor(initialSeason));

  // Cambiar de temporada resetea a lo ya visto de la NUEVA — no arrastra
  // marcas de la anterior. Manejador de evento, no efecto. Notifica al padre
  // aquí mismo (nunca desde un efecto): el nuevo delta es 0 tras un reseteo.
  function handleSeasonChange(next: number) {
    setSeason(next);
    const watched = watchedSetFor(next);
    setInitialWatched(watched);
    setSelected(watched);
    onNewlyMarkedChange(0);
  }

  // Manejador de evento: calcula el siguiente set a partir del `selected` del
  // closure (no del updater funcional de setState) precisamente para poder
  // llamar a onNewlyMarkedChange justo aquí, de forma síncrona y una sola vez
  // — un updater funcional puede invocarse más de una vez por la misma
  // actualización y duplicaría o desincronizaría el aviso al padre.
  function toggle(episode: number) {
    const next = new Set(selected);
    if (next.has(episode)) next.delete(episode);
    else next.add(episode);
    setSelected(next);
    onNewlyMarkedChange([...next].filter((e) => !initialWatched.has(e)).length);
  }

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

  const newlyMarked = [...selected].filter((e) => !initialWatched.has(e));

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
            const watched = s.episodes.filter((e) => e.watched).length;
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
              const st = episodeState(ep.episode, initialWatched, selected);
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

        {/* Los hidden inputs viajan como valores repetidos de "episodes";
            addSession los lee con formData.getAll (actions.ts:137-141). */}
        <input type="hidden" name="season" value={season} />
        {[...selected].map((ep) => (
          <input key={ep} type="hidden" name="episodes" value={ep} />
        ))}

        {newlyMarked.length > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11px] text-green">
            {t("episodesDelta", {
              count: newlyMarked.length,
              season,
              episode: Math.max(...selected),
            })}
          </span>
        )}
      </div>
    </div>
  );
}
