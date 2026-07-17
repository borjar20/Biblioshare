"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import { formatDots } from "@/lib/rating/dots";
import { CheckIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { EpisodeRating } from "./episode-rating";
import { EpisodeInlineDetail } from "./episode-detail";
import { episodeKey } from "./episode-panel";
import { ProgressRing, seasonPercent, type SeasonStat } from "./season-index";
import type { GridSource } from "./episode-grid";

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function formatAired(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

// Los episodios de UNA temporada. Es el nivel 2 del móvil (frame E2, con su
// vuelta al índice y su cabecera de temporada) y a la vez la columna central de
// PC (frame PC·1, con la cabecera `.lh` pegajosa). Un solo componente para los
// dos: las filas son idénticas en ambos frames, y duplicarlas por breakpoint
// habría duplicado también la lista larga.
export type EpisodeListProps = {
  group: { season: number; episodes: EpisodeRow[] };
  stat: SeasonStat;
  source: GridSource;
  isLoggedIn: boolean;
  interactive: boolean;
  isPending: boolean;
  ownOf: (ep: EpisodeRow) => OwnWatch;
  selectedKey: string | null;
  onSelect: (ep: EpisodeRow) => void;
  onToggleWatched: (ep: EpisodeRow) => void;
  onRate: (ep: EpisodeRow, rating: number) => void;
  onBack: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveReview: (ep: EpisodeRow) => void;
};

export function EpisodeList(props: EpisodeListProps) {
  const t = useTranslations("episode");
  const { group, stat, isLoggedIn, onBack } = props;
  const remaining = stat.total - stat.watched;

  return (
    <div className="lg:max-h-[560px] lg:overflow-y-auto">
      {/* Cabecera del nivel 2 en móvil: volver al índice y el resumen de la
          temporada. En PC no hay nivel 2 — el raíl de la izquierda ya dice
          dónde estás — así que esto no se pinta. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={onBack}
          className="mb-3.5 inline-flex items-center gap-[7px] font-mono text-[11px] font-medium text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          {t("allSeasons")}
        </button>

        <h3 className="font-serif text-[20px] font-semibold text-foreground">
          {t("season", { n: group.season })}
        </h3>
        <p className="mt-1.5 mb-2.5 flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
          <span>{t("episodeCount", { count: stat.total })}</span>
          {stat.avg !== null && (
            <>
              <span aria-hidden>·</span>
              <i aria-hidden className="h-[4px] w-[4px] rounded-full bg-gold" />
              <span>{formatDots(stat.avg)}</span>
            </>
          )}
        </p>

        {isLoggedIn && (
          <div className="mb-2 flex items-center gap-2.5">
            <ProgressRing
              percent={seasonPercent(stat)}
              label={
                stat.total > 0 && stat.watched === stat.total
                  ? "✓"
                  : `${stat.watched}/${stat.total}`
              }
              size="lg"
            />
            <div className="flex-1">
              <p className="font-serif text-[15px] font-semibold text-foreground">
                {t("yourProgress")}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {t("remaining", { count: remaining })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* `.lh` de PC·1: rótulo pegajoso de la columna central. */}
      <div className="sticky top-0 hidden border-b border-border bg-surface px-4 pt-3.5 pb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase lg:block">
        {t("season", { n: group.season })}
        {isLoggedIn && ` · ${stat.watched}/${stat.total}`}
        {stat.avg !== null && ` · ${formatDots(stat.avg)}`}
      </div>

      <ul>
        {group.episodes.map((ep) => (
          <EpisodeItem key={ep.episode} episode={ep} {...props} />
        ))}
      </ul>
    </div>
  );
}

function EpisodeItem({
  episode,
  source,
  interactive,
  isPending,
  ownOf,
  selectedKey,
  onSelect,
  onToggleWatched,
  onRate,
  draft,
  onDraftChange,
  onSaveReview,
}: EpisodeListProps & { episode: EpisodeRow }) {
  const t = useTranslations("episode");
  const tPasses = useTranslations("passes");
  const own = ownOf(episode);
  const selected = selectedKey === episodeKey(episode);
  const displayRating = source === "mine" ? own.rating : episode.avgRating;

  const meta = [
    t("episodeShort", { n: episode.episode }),
    episode.runtimeMinutes ? t("runtime", { n: episode.runtimeMinutes }) : null,
    formatAired(episode.airDate),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="border-t border-border first:border-t-0 lg:border-t-0 lg:border-b">
      <div
        className={`flex items-center gap-3 px-[15px] py-[11px] lg:gap-[11px] lg:px-4 ${
          // En PC la fila seleccionada se tiñe del acento (frame PC·1): señala
          // qué episodio está anclado en la columna de detalle. En móvil el
          // desplegable inline ya lo dice solo.
          selected ? "lg:bg-type-series/7" : ""
        }`}
      >
        {interactive ? (
          <button
            type="button"
            onClick={() => onToggleWatched(episode)}
            disabled={isPending}
            aria-label={t("watched")}
            className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors disabled:opacity-60 ${
              own.watched
                ? "border-type-series bg-type-series text-white"
                : "border-border text-transparent hover:border-type-series hover:text-type-series/40"
            }`}
          >
            <CheckIcon className="h-3 w-3" />
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}

        {/* El fotograma llega del catálogo; sin él, el hueco se queda como
            superficie hundida para que la rejilla de la fila no baile. */}
        <button
          type="button"
          onClick={() => onSelect(episode)}
          aria-expanded={selected}
          className="flex min-w-0 flex-1 items-center gap-3 text-left lg:gap-[11px]"
        >
          <span className="relative block h-[34px] w-[58px] shrink-0 overflow-hidden rounded-[5px] bg-surface-3 lg:h-[38px] lg:w-16">
            {episode.stillUrl && (
              <Image
                src={episode.stillUrl}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span
                className={`truncate text-[12.5px] lg:text-[13px] ${
                  own.watched
                    ? "font-medium text-foreground lg:font-semibold"
                    : "font-medium text-muted-foreground"
                }`}
              >
                {episode.title ?? t("untitled")}
              </span>
              {/* Capa "visto alguna vez" (Tarea 8, hub): visto en un pase
                  distinto del activo o en una fila legado sin pase — atenuado
                  a propósito, no es el cursor. */}
              {source === "mine" && episode.own.seenBefore && (
                <span
                  title={tPasses("seenBefore")}
                  className="shrink-0 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/70"
                >
                  {tPasses("seenBefore")}
                </span>
              )}
            </span>
            <span className="mt-[3px] block font-mono text-[9.5px] text-muted-foreground">
              {meta}
            </span>
          </span>
        </button>

        <EpisodeRating
          rating={displayRating}
          onRate={interactive ? (r) => onRate(episode, r) : undefined}
          disabled={isPending}
          size={7}
        />
      </div>

      {/* El nivel 3, bajo su fila y en los dos breakpoints: el detalle no tiene
          columna propia (ver el porqué en episode-panel.tsx), así que se abre
          donde estás mirando. */}
      {selected && (
        <div className="border-t border-border pr-[15px] pb-3.5 pl-[49px] lg:pl-[57px]">
          <EpisodeInlineDetail
            episode={episode}
            own={own}
            source={source}
            interactive={interactive}
            isPending={isPending}
            draft={draft}
            onDraftChange={onDraftChange}
            onSave={() => onSaveReview(episode)}
          />
        </div>
      )}
    </li>
  );
}
