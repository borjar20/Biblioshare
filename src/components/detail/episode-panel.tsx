"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { SeriesEpisodeContext } from "./series-episode-context";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import {
  setEpisodeWatched,
  rateEpisode,
  markEpisodesWatched,
} from "@/lib/series/episode-actions";
import { averageRating } from "@/lib/series/rating-scale";
import { CheckIcon } from "@/components/ui/icons";
import { EpisodeGrid, type SeasonGroup } from "./episode-grid";
import { EpisodeList } from "./episode-list";
import { EpisodeDetailColumn } from "./episode-detail-column";
import { SeasonIndex, SeasonRail, type SeasonStat } from "./season-index";
import { SeriesFollowCard } from "./series-follow-card";
import { useItemStatus } from "./item-status-context";
import {
  episodesUpTo,
  hasNewEpisodesAfter,
  seasonToMark,
} from "@/lib/series/follow-state";
import { EpisodeRating } from "./episode-rating";
import { todayISO } from "@/lib/stats/dates";
import { checkCelebrations } from "@/lib/celebrations/preference";


export function episodeKey(ep: { season: number; episode: number }): string {
  return `${ep.season}:${ep.episode}`;
}

// Un solo cursor y una sola capa de escrituras para la cabecera, su acción
// compacta y el explorador de temporadas. La selección y el borrador también
// son únicos: el ancho disponible decide dónde se monta el editor de reseñas.
export function EpisodePanel({
  children,
  seriesId,
  airing,
  nextAirDate,
  pass,
  seasons,
  isLoggedIn,
}: {
  children: ReactNode;
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
  const tRail = useTranslations("detail.rail");
  const [watchError, setWatchError] = useState(false);
  const [unratedOnly, setUnratedOnly] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [browserElement, setBrowserElement] = useState<HTMLDivElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

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
  const reviewFocused = useRef(false);
  const breakpointAtLastEvent = useRef(isDesktop);

  // Token que empuja el foco a la cabecera de la columna de detalle (PC).
  // Solo cambia dentro de `select()` cuando el usuario elige un episodio EN
  // PC — nunca al montar, al hidratar ni al cambiar de temporada desde el
  // raíl — así el teclado no tiene que recorrer el resto de filas.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Nivel abierto en MÓVIL: null = índice de temporadas (E3), un número = esa
  // temporada (E2). En PC no hay niveles, así que null se lee como "la del
  // cursor" y el raíl siempre tiene una encendida. Un solo estado para los dos
  // breakpoints; lo que cambia es cómo se interpreta el null.
  const [openSeason, setOpenSeason] = useState<number | null>(seasons.length === 1 ? seasons[0].season : null);

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
    if (!ep.aired || isSaving || isPending) return;
    const own = ownOf(ep);
    setWatchError(false);
    const next = !own.watched;
    // #1194: desmarcar borra la fila del pase, y con ella la nota y la reseña.
    // Si hay algo que perder, se pregunta antes (mismo patrón que «dejar de
    // seguir» en la ficha).
    if (!next && (own.rating !== null || own.review) && !window.confirm(t("unwatchConfirm")))
      return;
    setSaving(true);
    patch(ep, next ? { watched: true } : { watched: false, rating: null, review: null, reviewIsSpoiler: false });
    startTransition(async () => {
      // Fecha LOCAL (todayISO de stats/dates): la del servidor es UTC y un
      // episodio de madrugada caería en el día anterior de la racha.
      try {
        await setEpisodeWatched(seriesId, ep.season, ep.episode, next, todayISO());
      } catch (error) {
        unstable_rethrow(error);
        patch(ep, own);
        setWatchError(true);
        return;
      } finally {
        setSaving(false);
      }
      // Marcar puede ganar celebraciones (primera actividad, racha): que el
      // provider las drene, como tras guardar una sesión.
      if (next) checkCelebrations();
      else setQuickRateKey((key) => key === episodeKey(ep) ? null : key);
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
          .map((e) => own(e).rating)
          .filter((r): r is number => r !== null);
        const aired = s.episodes.filter((e) => e.aired);
        return {
          season: s.season,
          total: aired.length,
          watched: aired.filter((e) => own(e).watched).length,
          avg: averageRating(ratings),
        };
      }),
    [seasons, ownPatches],
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

  const interactive = isLoggedIn && Boolean(pass);

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
  const { status: passStatus, isSaving, setSaving } = useItemStatus();
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

  const groups = unratedOnly ? seasons.map((group) => ({
    ...group, episodes: group.episodes.filter((ep) => {
      const own = ownOf(ep);
      return ep.aired && own.watched && own.rating === null;
    }),
  })).filter((group) => group.episodes.length > 0) : activeGroup ? [activeGroup] : [];
  const selectedEpisode = selectedKey ? allEpisodesFind(groups, selectedKey) : null;

  const handleReviewFocusChange = (focused: boolean) => {
    if (focused) {
      reviewFocused.current = true;
      return;
    }
    if (!reviewFocused.current) return;
    reviewFocused.current = false;
    if (!selectedEpisode) return;
    if (draft.trim() === (ownOf(selectedEpisode).review ?? "").trim()) return;
    saveReview(selectedEpisode);
  };

  // El detalle cambia de sitio cuando hay espacio para tres columnas. Mide el
  // panel real: en escritorio también puede vivir junto al resumen de comunidad.
  const onBrowserResize = useEffectEvent((width: number) => {
    const wide = width >= 760;
    if (breakpointAtLastEvent.current === wide) return;
    breakpointAtLastEvent.current = wide;
    handleReviewFocusChange(false);
    setIsDesktop(wide);
  });
  useEffect(() => {
    if (!browserElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => onBrowserResize(entry.contentRect.width));
    observer.observe(browserElement);
    return () => observer.disconnect();
  }, [browserElement]);

  const feedback = (
    <>
      {watchError && <p role="alert" className="text-sm text-status-dropped">{t("watchError")}</p>}
      {quickRateEpisode &&
        ownOf(quickRateEpisode).watched && (
          <div
            role="group"
            aria-label={t("quickRateTitle", {
              code: t("code", { s: quickRateEpisode.season, e: quickRateEpisode.episode }),
            })}
            className="flex w-full flex-wrap items-center gap-3 border-t border-border pt-3"
          >
            <span role="status" className="text-xs text-muted-foreground">
              {t("quickRateTitle", {
                code: t("code", { s: quickRateEpisode.season, e: quickRateEpisode.episode }),
              })}
            </span>
            {ownOf(quickRateEpisode).rating === null && (
              <EpisodeRating
                rating={null}
                onRate={(rating) => rate(quickRateEpisode, rating)}
                disabled={isPending}
                size={12}
              />
            )}
            <button type="button" disabled={isPending} onClick={() => toggleWatched(quickRateEpisode)}
              className="text-xs font-semibold text-foreground underline underline-offset-2">
              {t("undoWatch")}
            </button>
            <button
              type="button"
              onClick={() => setQuickRateKey(null)}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("quickRateSkip")}
            </button>
          </div>
        )}
    </>
  );
  const primary = nextEpisode ? (
    <button
      type="button"
      onClick={() => markNext(nextEpisode)}
      disabled={isPending || isSaving}
      className="inline-flex w-full items-center justify-center gap-2 rounded-[9px] bg-accent px-4 py-[11px] text-[13px] font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
    >
      <CheckIcon className="h-3.5 w-3.5" />
      <span className="min-w-0">
        {t("markNextEpisode", {
          code: t("code", { s: nextEpisode.season, e: nextEpisode.episode }),
        })}
        {nextEpisode.title && (
          <span className="font-normal opacity-80"> · {nextEpisode.title}</span>
        )}
      </span>
    </button>
  ) : seasons.length > 0 ? (
    <p className="text-sm font-semibold">{total === 0 ? t("upcoming") : airing ? t("upToDate") : t("seriesComplete")}</p>
  ) : null;
  const browser = seasons.length > 0 && <EpisodeGrid seasons={seasons} />;
  const journal = interactive && activeGroup && activeStat && (
    <div ref={setBrowserElement} role="region" aria-label={t("personalEpisodes")} aria-busy={isPending} className="@container/episodes min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold">{t("personalEpisodes")}</h2>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={unratedOnly} onChange={(event) => setUnratedOnly(event.target.checked)} />
          {t("unratedOnly")}
        </label>
      </div>
      <div className="@min-[760px]/episodes:grid @min-[760px]/episodes:grid-cols-[180px_minmax(0,1fr)_260px] @min-[760px]/episodes:overflow-hidden @min-[760px]/episodes:rounded-[14px] @min-[760px]/episodes:border @min-[760px]/episodes:border-border @min-[760px]/episodes:bg-surface">
        {!unratedOnly && <SeasonRail
          stats={stats}
          activeSeason={activeSeason}
          isLoggedIn={isLoggedIn}
          onSelect={setOpenSeason}
          className="hidden @min-[760px]/episodes:block @min-[760px]/episodes:border-r @min-[760px]/episodes:border-border"
        />}

        {!unratedOnly && <SeasonIndex
          stats={stats}
          activeSeason={cursorSeason}
          isLoggedIn={isLoggedIn}
          onSelect={setOpenSeason}
          className={openSeason === null ? "@min-[760px]/episodes:hidden" : "hidden"}
        />}

        <div className={unratedOnly ? "@min-[760px]/episodes:col-span-2" : openSeason === null ? "hidden @min-[760px]/episodes:block" : ""}>
          {groups.length === 0 && <p role="status" className="p-3 text-sm text-muted-foreground">{t("noUnrated")}</p>}
          {groups.map((group) => <EpisodeList
            key={group.season}
            group={group}
            stat={stats.find((stat) => stat.season === group.season)!}
            source="mine"
            isLoggedIn={isLoggedIn}
            interactive={interactive}
            isPending={isPending}
            ownOf={ownOf}
            selectedKey={selectedKey}
            onSelect={select}
            onToggleWatched={toggleWatched}
            onRate={rate}
            onBack={unratedOnly ? undefined : () => setOpenSeason(null)}
            draft={draft}
            onDraftChange={setDraft}
            onReviewFocusChange={handleReviewFocusChange}
            onSaveReview={saveReview}
            seasonPendingCount={unratedOnly ? 0 : seasonPending(group.season).length}
            onMarkSeason={() => markMany(seasonPending(group.season))}
            upToPendingCount={(ep) => upToPending(ep).length}
            onMarkUpTo={(ep) => markMany(upToPending(ep))}
            inlineDetail={!isDesktop}
            itemId={seriesId}
          />)}
        </div>

        <div
          id="episode-detail-column"
          data-testid="episode-detail-column"
          role="region"
          aria-label={t("detailRegion")}
          className="hidden @min-[760px]/episodes:block @min-[760px]/episodes:max-h-[560px] @min-[760px]/episodes:overflow-y-auto @min-[760px]/episodes:border-l @min-[760px]/episodes:border-border"
        >
          <EpisodeDetailColumn
            episode={isDesktop ? selectedEpisode : null}
            own={isDesktop && selectedEpisode ? ownOf(selectedEpisode) : null}
            source="mine"
            interactive={
              interactive && Boolean(selectedEpisode?.aired)
            }
            isPending={isPending}
            draft={draft}
            onDraftChange={setDraft}
            onReviewFocusChange={handleReviewFocusChange}
            onSave={(spoiler) => selectedEpisode && saveReview(selectedEpisode, spoiler)}
            markUpToCount={
              interactive && selectedEpisode?.aired ? upToPending(selectedEpisode).length : 0
            }
            onMarkUpTo={() => selectedEpisode && markMany(upToPending(selectedEpisode))}
            itemId={seriesId}
            focusKey={focusKey}
            onFocused={() => setFocusKey(null)}
          />
        </div>

      </div>
    </div>
  );

  return (
    <SeriesEpisodeContext.Provider value={{
      browser, journal, primary, feedback: <>{followCard}{feedback}</>, upToDate,
      progress: total > 0 ? { left: tRail("episodes", { watched, total }), percent, right: String(percent) + "%" } : null,
      sticky: nextEpisode && (
        <button type="button" disabled={isPending || isSaving} onClick={() => markNext(nextEpisode)}
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60">
          {t("markNextEpisode", { code: t("code", { s: nextEpisode.season, e: nextEpisode.episode }) })}
        </button>
      ),
    }}>
      {children}
    </SeriesEpisodeContext.Provider>
  );
}

function allEpisodesFind(seasons: SeasonGroup[], key: string): EpisodeRow | null {
  for (const s of seasons) for (const e of s.episodes) if (episodeKey(e) === key) return e;
  return null;
}
