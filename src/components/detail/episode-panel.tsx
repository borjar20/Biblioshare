"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import {
  setEpisodeWatched,
  rateEpisode,
  markEpisodesWatched,
} from "@/lib/series/episode-actions";
import { averageRating } from "@/lib/series/rating-scale";
import { CheckIcon } from "@/components/ui/icons";
import { EpisodeGrid, type SeasonGroup, type GridSource } from "./episode-grid";
import { EpisodeList } from "./episode-list";
import { EpisodeDetailColumn } from "./episode-detail-column";
import { SeasonIndex, SeasonRail, type SeasonStat } from "./season-index";
import { SeriesFollowCard } from "./series-follow-card";
import { useItemStatus } from "./item-status-context";
import { useIsDesktop } from "@/lib/ui/use-is-desktop";
import {
  episodesUpTo,
  hasNewEpisodesAfter,
  seasonToMark,
} from "@/lib/series/follow-state";
import { EpisodeRating } from "./episode-rating";
import { todayISO } from "@/lib/stats/dates";
import { checkCelebrations } from "@/lib/celebrations/preference";

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
  airing,
  nextAirDate,
  pass,
  seasons,
  isLoggedIn,
}: {
  seriesId: string;
  /** TMDB la da por en emisión (estado CONOCIDO y no terminado): sin siguiente
   *  episodio se lee «Al día», no «Serie completa». */
  airing: boolean;
  /** Siguiente episodio anunciado (YYYY-MM-DD) o null. */
  nextAirDate: string | null;
  /** Pase activo (id y nota de la serie), o null si no la sigues. */
  pass: { id: string; rating: number | null } | null;
  seasons: SeasonGroup[];
  isLoggedIn: boolean;
}) {
  const t = useTranslations("episode");
  const [view, setView] = useState<View>("list");
  const [source, setSource] = useState<GridSource>(
    isLoggedIn ? "mine" : "community",
  );
  const [isPending, startTransition] = useTransition();
  const isDesktop = useIsDesktop();

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

  // Token que empuja el foco a la cabecera de la columna de detalle (PC).
  // Solo cambia dentro de `select()` cuando el usuario elige un episodio EN
  // PC — nunca al montar, al hidratar ni al cambiar de temporada desde el
  // raíl — así el teclado no tiene que recorrer el resto de filas.
  const [focusKey, setFocusKey] = useState<string | null>(null);

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
    // Token único por click: garantiza que el efecto de foco de la columna
    // se dispare aunque se reelija el mismo episodio tras deseleccionarlo.
    if (isDesktop) setFocusKey(`${k}:${Date.now()}`);
  };

  const patch = (ep: EpisodeRow, p: Partial<OwnWatch>) =>
    setOwnPatches((prev) => ({
      ...prev,
      [episodeKey(ep)]: { ...prev[episodeKey(ep)], ...p },
    }));

  // Puntuación rápida (fase 3): tras marcar desde la cabecera, una fila de dots
  // «¿Qué tal?» bajo ella. Opcional y sin modal: se ignora sin coste y se
  // sustituye al marcar el siguiente.
  const [quickRateKey, setQuickRateKey] = useState<string | null>(null);

  const toggleWatched = (ep: EpisodeRow) => {
    // Un anunciado no se puede marcar (#1193): la UI ya no ofrece la casilla,
    // esto es la red por si algún camino la invoca igual.
    if (!ep.aired) return;
    const own = ownOf(ep);
    const next = !own.watched;
    // #1194: desmarcar borra la fila del pase, y con ella la nota y la reseña.
    // Si hay algo que perder, se pregunta antes (mismo patrón que «dejar de
    // seguir» en la ficha).
    if (!next && (own.rating !== null || own.review) && !window.confirm(t("unwatchConfirm")))
      return;
    patch(ep, next ? { watched: true } : { watched: false, rating: null, review: null, reviewIsSpoiler: false });
    startTransition(async () => {
      // Fecha LOCAL (todayISO de stats/dates): la del servidor es UTC y un
      // episodio de madrugada caería en el día anterior de la racha.
      await setEpisodeWatched(seriesId, ep.season, ep.episode, next, todayISO());
      // Marcar puede ganar celebraciones (primera actividad, racha): que el
      // provider las drene, como tras guardar una sesión.
      if (next) checkCelebrations();
    });
  };

  const rate = (ep: EpisodeRow, rating: number) => {
    if (!ep.aired) return;
    // Si el episodio está seleccionado, la nota arrastra el borrador escrito
    // (comportamiento de siempre: puntuar guardaba lo que hubiera en el
    // textarea); si no, conserva la reseña ya guardada.
    const review =
      selectedKey === episodeKey(ep) ? draft : (ownOf(ep).review ?? "");
    const reviewIsSpoiler = Boolean(review.trim()) && ownOf(ep).reviewIsSpoiler;
    patch(ep, { watched: true, rating, review: review || null, reviewIsSpoiler });
    startTransition(() =>
      rateEpisode(seriesId, ep.season, ep.episode, rating, review || null, reviewIsSpoiler, todayISO()),
    );
  };

  // Marcado masivo: el servidor vuelve a filtrar (existe, emitido, no visto),
  // esto solo pinta el optimista.
  const markMany = (eps: EpisodeRow[]) => {
    if (eps.length === 0) return;
    setOwnPatches((prev) => {
      const nextPatches = { ...prev };
      for (const e of eps)
        nextPatches[episodeKey(e)] = { ...prev[episodeKey(e)], watched: true };
      return nextPatches;
    });
    startTransition(async () => {
      await markEpisodesWatched(
        seriesId,
        eps.map((e) => ({ season: e.season, episode: e.episode })),
        todayISO(),
      );
      checkCelebrations();
    });
  };

  const markNext = (ep: EpisodeRow) => {
    toggleWatched(ep);
    setQuickRateKey(episodeKey(ep));
  };

  // `spoiler` llega solo al tocar la casilla (se guarda al instante, como la
  // nota); al soltar el cuadro se conserva la marca que ya tenía.
  const saveReview = (ep: EpisodeRow, spoiler?: boolean) => {
    const reviewIsSpoiler = Boolean(draft.trim()) && (spoiler ?? ownOf(ep).reviewIsSpoiler);
    patch(ep, { watched: true, review: draft || null, reviewIsSpoiler });
    startTransition(() =>
      rateEpisode(seriesId, ep.season, ep.episode, ownOf(ep).rating, draft || null, reviewIsSpoiler, todayISO()),
    );
  };

  // El contador vive sobre la capa optimista: marcar un episodio lo mueve al
  // instante, sin esperar la revalidación. Solo cuenta lo EMITIDO (#1193): los
  // anunciados están en la lista pero no se pueden ver todavía.
  const { total, watched } = useMemo(() => {
    const all = seasons.flatMap((s) => s.episodes).filter((e) => e.aired);
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
        const aired = s.episodes.filter((e) => e.aired);
        return {
          season: s.season,
          total: aired.length,
          watched: aired.filter((e) => own(e).watched).length,
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
        if (ep.aired && !{ ...ep.own, ...ownPatches[episodeKey(ep)] }.watched)
          return ep;
    return null;
  }, [seasons, ownPatches]);

  // Sin siguiente, el cursor se queda en la última temporada con algo EMITIDO:
  // abrir la ficha en una temporada anunciada vacía no dice nada.
  const lastAiredSeason = [...seasons]
    .reverse()
    .find((s) => s.episodes.some((e) => e.aired))?.season;
  const cursorSeason =
    nextEpisode?.season ?? lastAiredSeason ?? seasons[seasons.length - 1]?.season ?? 1;
  const activeSeason = openSeason ?? cursorSeason;
  const activeGroup =
    seasons.find((s) => s.season === activeSeason) ?? seasons[0];
  const activeStat =
    stats.find((s) => s.season === activeSeason) ?? stats[0];

  const interactive = source === "mine" && isLoggedIn;

  // Lo que ofrecen «Marcar temporada vista» y «Vistos hasta aquí», sobre la
  // capa optimista. Orden cronológico = el de `seasons`.
  const markable = seasons.flatMap((s) =>
    s.episodes.map((e) => ({ ...e, watched: ownOf(e).watched })),
  );
  const seasonPending = (season: number) => seasonToMark(markable, season);
  const upToPending = (ep: EpisodeRow) => episodesUpTo(markable, ep);
  const quickRateEpisode = quickRateKey
    ? allEpisodesFind(seasons, quickRateKey)
    : null;

  // Estado de seguimiento (fase 2). El estado del pase se lee del contexto
  // compartido con la píldora del hero, así que «Seguir con la T5» cambia las
  // dos cosas en el mismo commit optimista.
  const { status: passStatus } = useItemStatus();
  const allEpisodes = seasons.flatMap((s) => s.episodes);
  const upToDate =
    passStatus === "in_progress" && airing && total > 0 && nextEpisode === null;
  const newEpisodesAfterFinish =
    passStatus === "completed" &&
    hasNewEpisodesAfter(
      allEpisodes.map((e) => ({
        season: e.season,
        episode: e.episode,
        aired: e.aired,
        watched: ownOf(e).watched,
      })),
    );
  const episodesAverage = averageRating(
    allEpisodes
      .map((e) => ownOf(e).rating)
      .filter((r): r is number => r !== null),
  );
  // Primer episodio nuevo tras lo último visto: su temporada es la del botón.
  const continueSeason = (() => {
    if (!newEpisodesAfterFinish) return null;
    let furthest = -1;
    allEpisodes.forEach((e, i) => {
      if (ownOf(e).watched) furthest = i;
    });
    return allEpisodes.slice(furthest + 1).find((e) => e.aired)?.season ?? null;
  })();
  const followCard =
    isLoggedIn && pass && (upToDate || newEpisodesAfterFinish) ? (
      <SeriesFollowCard
        seriesId={seriesId}
        passId={pass.id}
        passRating={pass.rating}
        mode={upToDate ? "upToDate" : "newEpisodes"}
        nextAirDate={nextAirDate}
        continueSeason={continueSeason}
        episodesAverage={episodesAverage}
      />
    ) : null;
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

  // El episodio anclado en la tercera columna (PC). Solo si es de la temporada
  // que se está viendo: al cambiar de temporada en el raíl, la columna vuelve a
  // su estado vacío en vez de enseñar un episodio que ya no está en la lista.
  const selectedEpisode =
    activeGroup.episodes.find((e) => episodeKey(e) === selectedKey) ?? null;

  return (
    <div className="flex flex-col">
      {/* `.btop` de los frames móviles: contador con la cifra en serif y los
          conmutadores a la derecha. En PC con lista el contador se calla — la
          barra de resumen de abajo lo dice mejor y con más contexto. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Con sesión el recuento lo dice la cabecera de seguimiento de abajo. */}
        {!isLoggedIn && (
          <p className="text-[13px] text-foreground">
            {t("episodeCount", { count: total })}
          </p>
        )}
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

      {/* Cabecera de seguimiento (fase 3; era el `.epsum` solo de PC y solo de
          la lista): dónde estás, cuánto llevas y el gesto de casi siempre —
          marcar el siguiente—, ahora en los dos breakpoints y las dos vistas. */}
      {isLoggedIn && (
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] border border-border bg-surface px-[18px] py-[15px]">
          <span className="inline-flex shrink-0 items-center gap-[7px] text-[13px] font-semibold text-foreground">
            <i aria-hidden className="h-2 w-2 rounded-full bg-status-in-progress" />
            {/* Sin siguiente emitido: si sigue en emisión, «Al día»; si terminó
                (o no se sabe), completa. */}
            {nextEpisode
              ? t("watchingSeason", { n: cursorSeason })
              : airing
                ? t("upToDate")
                : t("seriesComplete")}
          </span>
          <span className="shrink-0 font-serif text-[18px] font-semibold whitespace-nowrap text-foreground">
            {watched}
            <small className="text-[13px] font-normal text-muted-foreground">
              {" "}
              / {t("watchedOfTotal", { total })}
            </small>
          </span>
          <span className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-surface-muted">
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
              onClick={() => markNext(nextEpisode)}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[9px] bg-accent px-4 py-[11px] text-[13px] font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60 sm:w-auto sm:shrink-0"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              <span className="truncate">
                {t("markNextEpisode", {
                  code: t("code", { s: nextEpisode.season, e: nextEpisode.episode }),
                })}
                {nextEpisode.title && (
                  <span className="font-normal opacity-80"> · {nextEpisode.title}</span>
                )}
              </span>
            </button>
          )}
          {interactive &&
            quickRateEpisode &&
            ownOf(quickRateEpisode).watched &&
            ownOf(quickRateEpisode).rating === null && (
              <div
                role="group"
                aria-label={t("quickRateTitle", {
                  code: t("code", { s: quickRateEpisode.season, e: quickRateEpisode.episode }),
                })}
                className="flex w-full flex-wrap items-center gap-3 border-t border-border pt-3"
              >
                <span className="text-xs text-muted-foreground">
                  {t("quickRateTitle", {
                    code: t("code", { s: quickRateEpisode.season, e: quickRateEpisode.episode }),
                  })}
                </span>
                <EpisodeRating
                  rating={null}
                  onRate={(r) => {
                    rate(quickRateEpisode, r);
                    setQuickRateKey(null);
                  }}
                  disabled={isPending}
                  size={12}
                />
                <button
                  type="button"
                  onClick={() => setQuickRateKey(null)}
                  className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {t("quickRateSkip")}
                </button>
              </div>
            )}
        </div>
      )}

      {followCard}

      {view === "grid" ? (
        <EpisodeGrid
          seasons={seasons}
          source={source}
          selectedKey={selectedKey}
          // La rejilla es la vista de análisis: tocar una celda lleva al MISMO
          // detalle que la lista (nota, reseña, «vistos hasta aquí»), abierto.
          onSelect={(ep) => {
            setView("list");
            setOpenSeason(ep.season);
            setSelectedKey(episodeKey(ep));
            setDraft(ownOf(ep).review ?? "");
            // Mismo criterio que la selección desde la fila: en PC, elegir
            // una celda de la rejilla también debe llevar el foco al título
            // de la columna de detalle, no dejarlo en el body.
            if (isDesktop) setFocusKey(`${episodeKey(ep)}:${Date.now()}`);
          }}
        />
      ) : (
        <>
          {/* El marco `.ep3` del frame PC·1: temporadas | episodios | detalle.
              En julio se quedó en dos columnas porque el cuerpo de la ficha
              medía 771px (plan 06 §6e); con el contenedor de la ficha
              cinemática la tercera vuelve a caber. En móvil no hay marco: cada
              nivel ocupa la pantalla por turnos y el detalle se abre bajo su
              fila. */}
          <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)_340px] lg:overflow-hidden lg:rounded-[14px] lg:border lg:border-border lg:bg-surface">
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
                seasonPendingCount={seasonPending(activeGroup.season).length}
                onMarkSeason={() => markMany(seasonPending(activeGroup.season))}
                upToPendingCount={(ep) => upToPending(ep).length}
                onMarkUpTo={(ep) => markMany(upToPending(ep))}
                inlineDetail={!isDesktop}
              />
            </div>

            <div
              id="episode-detail-column"
              data-testid="episode-detail-column"
              role="region"
              aria-label={t("detailRegion")}
              className="hidden lg:block lg:max-h-[560px] lg:overflow-y-auto lg:border-l lg:border-border"
            >
              <EpisodeDetailColumn
                episode={isDesktop ? selectedEpisode : null}
                own={isDesktop && selectedEpisode ? ownOf(selectedEpisode) : null}
                source={source}
                interactive={
                  interactive && Boolean(selectedEpisode?.aired)
                }
                isPending={isPending}
                draft={draft}
                onDraftChange={setDraft}
                onSave={(spoiler) => selectedEpisode && saveReview(selectedEpisode, spoiler)}
                markUpToCount={
                  interactive && selectedEpisode?.aired ? upToPending(selectedEpisode).length : 0
                }
                onMarkUpTo={() => selectedEpisode && markMany(upToPending(selectedEpisode))}
                focusKey={focusKey}
                onFocused={() => setFocusKey(null)}
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

function allEpisodesFind(seasons: SeasonGroup[], key: string): EpisodeRow | null {
  for (const s of seasons) for (const e of s.episodes) if (episodeKey(e) === key) return e;
  return null;
}
