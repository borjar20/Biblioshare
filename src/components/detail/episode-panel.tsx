"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import { setEpisodeWatched, rateEpisode } from "@/lib/series/episode-actions";
import { averageRating } from "@/lib/series/rating-scale";
import { CheckIcon } from "@/components/ui/icons";
import { EpisodeGrid, type SeasonGroup, type GridSource } from "./episode-grid";
import { EpisodeList } from "./episode-list";
import { SeasonIndex, SeasonRail, type SeasonStat } from "./season-index";

type View = "grid" | "list";

export function episodeKey(ep: { season: number; episode: number }): string {
  return `${ep.season}:${ep.episode}`;
}

// Contenedor de la pestaña Episodios. Su trabajo es que la ficha NO crezca con
// la serie: con 12 temporadas la lista plana era un scroll interminable, así
// que el contenido se organiza en tres niveles —temporadas, episodios de una,
// detalle de uno— y cada breakpoint enseña los que le caben. El móvil los
// recorre de uno en uno (frames E3 → E2); PC los enseña los tres a la vez en
// columnas (frame PC·1).
//
// El estado "mío" de cada episodio (visto/nota/reseña) vive AQUÍ y no en cada
// fila: el detalle está anclado en una columna en PC y desplegado inline en
// móvil, y son el mismo dato — con copias locales por fila, puntuar desde el
// detalle y desde la fila habrían divergido. La capa es de parches optimistas
// sobre los props del servidor, mismo criterio que el resto de la app.
export function EpisodePanel({
  seriesId,
  seasons,
  isLoggedIn,
}: {
  seriesId: string;
  seasons: SeasonGroup[];
  isLoggedIn: boolean;
}) {
  const t = useTranslations("episode");
  const [view, setView] = useState<View>("list");
  const [source, setSource] = useState<GridSource>(
    isLoggedIn ? "mine" : "community",
  );
  const [isPending, startTransition] = useTransition();

  const [ownPatches, setOwnPatches] = useState<
    Record<string, Partial<OwnWatch>>
  >({});
  const ownOf = (ep: EpisodeRow): OwnWatch => ({
    ...ep.own,
    ...ownPatches[episodeKey(ep)],
  });

  // Selección única: en móvil abre el desplegable inline bajo la fila, en PC
  // enciende la tercera columna. El borrador de reseña acompaña a la selección
  // — es EL texto del episodio seleccionado, venga de donde venga.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Nivel abierto en MÓVIL: null = índice de temporadas (E3), un número = esa
  // temporada (E2). En PC no hay niveles, así que null se lee como "la del
  // cursor" y el raíl siempre tiene una encendida. Un solo estado para los dos
  // breakpoints; lo que cambia es cómo se interpreta el null.
  const [openSeason, setOpenSeason] = useState<number | null>(null);

  const select = (ep: EpisodeRow) => {
    const k = episodeKey(ep);
    if (selectedKey === k) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(k);
    setDraft(ownOf(ep).review ?? "");
  };

  const patch = (ep: EpisodeRow, p: Partial<OwnWatch>) =>
    setOwnPatches((prev) => ({
      ...prev,
      [episodeKey(ep)]: { ...prev[episodeKey(ep)], ...p },
    }));

  const toggleWatched = (ep: EpisodeRow) => {
    const next = !ownOf(ep).watched;
    patch(ep, next ? { watched: true } : { watched: false, rating: null, review: null });
    startTransition(() =>
      setEpisodeWatched(seriesId, ep.season, ep.episode, next),
    );
  };

  const rate = (ep: EpisodeRow, rating: number) => {
    // Si el episodio está seleccionado, la nota arrastra el borrador escrito
    // (comportamiento de siempre: puntuar guardaba lo que hubiera en el
    // textarea); si no, conserva la reseña ya guardada.
    const review =
      selectedKey === episodeKey(ep) ? draft : (ownOf(ep).review ?? "");
    patch(ep, { watched: true, rating, review: review || null });
    startTransition(() =>
      rateEpisode(seriesId, ep.season, ep.episode, rating, review || null),
    );
  };

  const saveReview = (ep: EpisodeRow) => {
    patch(ep, { watched: true, review: draft || null });
    startTransition(() =>
      rateEpisode(seriesId, ep.season, ep.episode, ownOf(ep).rating, draft || null),
    );
  };

  // El contador vive sobre la capa optimista: marcar un episodio lo mueve al
  // instante, sin esperar la revalidación.
  const { total, watched } = useMemo(() => {
    const all = seasons.flatMap((s) => s.episodes);
    return {
      total: all.length,
      watched: all.filter(
        (e) => ({ ...e.own, ...ownPatches[episodeKey(e)] }).watched,
      ).length,
    };
  }, [seasons, ownPatches]);

  // Resumen por temporada para el índice y el raíl (media según la fuente
  // elegida, progreso siempre del pase activo).
  const stats: SeasonStat[] = useMemo(
    () =>
      seasons.map((s) => {
        const own = (e: EpisodeRow) => ({ ...e.own, ...ownPatches[episodeKey(e)] });
        const ratings = s.episodes
          .map((e) => (source === "mine" ? own(e).rating : e.avgRating))
          .filter((r): r is number => r !== null);
        return {
          season: s.season,
          total: s.episodes.length,
          watched: s.episodes.filter((e) => own(e).watched).length,
          avg: averageRating(ratings),
        };
      }),
    [seasons, ownPatches, source],
  );

  // El cursor: el primer episodio sin ver en orden cronológico. De él salen la
  // temporada por defecto, la píldora de estado y "marcar próximo".
  const nextEpisode = useMemo(() => {
    for (const s of seasons)
      for (const ep of s.episodes)
        if (!{ ...ep.own, ...ownPatches[episodeKey(ep)] }.watched) return ep;
    return null;
  }, [seasons, ownPatches]);

  const cursorSeason =
    nextEpisode?.season ?? seasons[seasons.length - 1]?.season ?? 1;
  const activeSeason = openSeason ?? cursorSeason;
  const activeGroup =
    seasons.find((s) => s.season === activeSeason) ?? seasons[0];
  const activeStat =
    stats.find((s) => s.season === activeSeason) ?? stats[0];

  const interactive = source === "mine" && isLoggedIn;
  const percent = total === 0 ? 0 : Math.round((watched / total) * 100);

  const sourceToggle = isLoggedIn && (
    <Segmented
      value={source}
      onChange={(v) => setSource(v as GridSource)}
      options={[
        { value: "mine", label: t("sourceMine") },
        { value: "community", label: t("sourceCommunity") },
      ]}
    />
  );

  if (!activeGroup || !activeStat) return null;

  return (
    <div className="flex flex-col">
      {/* `.btop` de los frames móviles: contador con la cifra en serif y los
          conmutadores a la derecha. En PC con lista el contador se calla — la
          barra de resumen de abajo lo dice mejor y con más contexto. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p
          className={`text-[13px] text-foreground ${view === "list" ? "lg:hidden" : ""}`}
        >
          {isLoggedIn
            ? t.rich("watchedProgress", {
                watched,
                total,
                b: (chunks) => (
                  <b className="font-serif text-lg font-semibold">{chunks}</b>
                ),
              })
            : t("episodeCount", { count: total })}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden lg:block">{sourceToggle}</div>
          <Segmented
            value={view}
            onChange={(v) => setView(v as View)}
            options={[
              { value: "list", label: t("viewList") },
              { value: "grid", label: t("viewGrid") },
            ]}
          />
        </div>
      </div>
      {isLoggedIn && <div className="mb-4 lg:hidden">{sourceToggle}</div>}

      {view === "grid" ? (
        <EpisodeGrid
          seasons={seasons}
          source={source}
          selectedKey={selectedKey}
          onSelect={select}
        />
      ) : (
        <>
          {/* `.epsum` de PC·1: dónde estás, cuánto llevas y el único gesto que
              hace falta la mayoría de las veces — marcar el siguiente. */}
          {isLoggedIn && (
            <div className="mb-5 hidden items-center gap-5 rounded-[14px] border border-border bg-surface px-[18px] py-[15px] lg:flex">
              <span className="inline-flex shrink-0 items-center gap-[7px] text-[13px] font-semibold text-foreground">
                <i
                  aria-hidden
                  className="h-2 w-2 rounded-full bg-status-in-progress"
                />
                {nextEpisode
                  ? t("watchingSeason", { n: cursorSeason })
                  : t("seriesComplete")}
              </span>
              <span className="shrink-0 font-serif text-[18px] font-semibold whitespace-nowrap text-foreground">
                {watched}
                <small className="text-[13px] font-normal text-muted-foreground">
                  {" "}
                  / {t("watchedOfTotal", { total })}
                </small>
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className="block h-full rounded-full bg-type-series"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="shrink-0 font-mono text-xs font-medium text-type-series">
                {percent}%
              </span>
              {interactive && nextEpisode && (
                <button
                  type="button"
                  onClick={() => toggleWatched(nextEpisode)}
                  disabled={isPending}
                  className="inline-flex shrink-0 items-center gap-2 rounded-[9px] bg-accent px-4 py-[11px] text-[13px] font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  {t("markNext")}
                </button>
              )}
            </div>
          )}

          {/* El marco `.ep3` del frame PC·1, con dos columnas y no tres: el
              cuerpo de la ficha está topado en 771px por el raíl lateral de la
              portada, y las 340 del detalle dejaban la lista en ~200px (títulos
              partidos letra a letra). Los niveles 1 y 2 conviven en PC —que es
              lo que arreglaba la escala— y el 3 se despliega bajo su fila, el
              mismo gesto que en móvil. En móvil no hay marco: cada nivel ocupa
              la pantalla entera por turnos. */}
          <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:overflow-hidden lg:rounded-[14px] lg:border lg:border-border lg:bg-surface">
            <SeasonRail
              stats={stats}
              activeSeason={activeSeason}
              isLoggedIn={isLoggedIn}
              onSelect={setOpenSeason}
              className="hidden lg:block lg:border-r lg:border-border"
            />

            <SeasonIndex
              stats={stats}
              activeSeason={cursorSeason}
              isLoggedIn={isLoggedIn}
              onSelect={setOpenSeason}
              className={openSeason === null ? "lg:hidden" : "hidden"}
            />

            <div className={openSeason === null ? "hidden lg:block" : ""}>
              <EpisodeList
                group={activeGroup}
                stat={activeStat}
                source={source}
                isLoggedIn={isLoggedIn}
                interactive={interactive}
                isPending={isPending}
                ownOf={ownOf}
                selectedKey={selectedKey}
                onSelect={select}
                onToggleWatched={toggleWatched}
                onRate={rate}
                onBack={() => setOpenSeason(null)}
                draft={draft}
                onDraftChange={setDraft}
                onSaveReview={saveReview}
              />
            </div>

          </div>
        </>
      )}
    </div>
  );
}

// `.ep-tg` del frame: píldora sobre --surface-2 con la opción activa en
// --surface y una sombra corta — el mismo lenguaje que las subtabs de
// Colección.
function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-[8px] bg-surface-muted p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-[6px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
            value === o.value
              ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(60,35,15,.1)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
