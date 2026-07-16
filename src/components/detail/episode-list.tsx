"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import { averageRating } from "@/lib/series/rating-scale";
import { formatDots } from "@/lib/rating/dots";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { EpisodeRating } from "./episode-rating";
import { EpisodeInlineDetail } from "./episode-detail";
import { episodeKey } from "./episode-panel";
import type { SeasonGroup, GridSource } from "./episode-grid";

// Lista por temporadas colapsables (`.season` de los frames 4 y 11): cabecera
// con la temporada en serif y su media/vistos en mono, filas de episodio con
// visto, dots y desplegable. El estado propio de cada episodio llega del
// panel (ownOf) — ver el porqué en episode-panel.tsx.
export type EpisodeListProps = {
  seasons: SeasonGroup[];
  source: GridSource;
  isLoggedIn: boolean;
  interactive: boolean;
  isPending: boolean;
  ownOf: (ep: EpisodeRow) => OwnWatch;
  selectedKey: string | null;
  onSelect: (ep: EpisodeRow) => void;
  onToggleWatched: (ep: EpisodeRow) => void;
  onRate: (ep: EpisodeRow, rating: number) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveReview: (ep: EpisodeRow) => void;
};

export function EpisodeList(props: EpisodeListProps) {
  return (
    <div className="flex flex-col gap-3">
      {props.seasons.map((s, i) => (
        <SeasonSection
          key={s.season}
          group={s}
          // El presente abierto, el pasado plegado (frame 4): las temporadas
          // llegan de más reciente a más antigua, así que la primera es donde
          // está el cursor.
          defaultOpen={i === 0}
          {...props}
        />
      ))}
    </div>
  );
}

function SeasonSection({
  group,
  defaultOpen,
  ...props
}: EpisodeListProps & { group: SeasonGroup; defaultOpen: boolean }) {
  const t = useTranslations("episode");
  const [open, setOpen] = useState(defaultOpen);
  const { source, isLoggedIn, ownOf } = props;

  const { watched, avg } = useMemo(() => {
    const watchedCount = group.episodes.filter((e) => ownOf(e).watched).length;
    const ratings = group.episodes
      .map((e) => (source === "mine" ? ownOf(e).rating : e.avgRating))
      .filter((r): r is number => r !== null);
    return { watched: watchedCount, avg: averageRating(ratings) };
    // ownOf cambia de identidad con cada parche del panel: es la dependencia
    // que refresca media y recuento al marcar/puntuar.
  }, [group.episodes, source, ownOf]);

  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-[15px] py-[13px] text-left"
      >
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
        <h3 className="font-serif text-[15px] font-semibold text-foreground">
          {t("season", { n: group.season })}
        </h3>
        <span className="ml-auto flex items-center gap-2.5 font-mono text-[10px] text-muted-foreground">
          {avg !== null && (
            <span className="flex items-center gap-1">
              {/* El dot oro es el glifo de nota de Paper (nada de ★). */}
              <i aria-hidden className="h-[5px] w-[5px] rounded-full bg-gold" />
              {formatDots(avg)}
            </span>
          )}
          {isLoggedIn && (
            <span aria-label={t("watchedCount", { watched, total: group.episodes.length })}>
              {watched}/{group.episodes.length}
            </span>
          )}
        </span>
      </button>

      {open && (
        <ul>
          {group.episodes.map((ep) => (
            <EpisodeItem key={ep.episode} episode={ep} {...props} />
          ))}
        </ul>
      )}
    </section>
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

  return (
    <li className="border-t border-border">
      <div
        className={`flex items-center gap-3 px-[15px] py-[11px] ${
          // En PC la fila seleccionada se tiñe del acento (frame 11): señala
          // qué episodio está anclado en la tarjeta de la derecha. En móvil el
          // desplegable inline ya lo dice solo.
          selected ? "lg:bg-type-series/5" : ""
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

        <span className="w-[34px] shrink-0 font-mono text-[10.5px] text-muted-foreground">
          {t("episodeShort", { n: episode.episode })}
        </span>

        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-foreground">
            {episode.title ?? t("untitled")}
          </span>
          {/* Capa "visto alguna vez" (Tarea 8, hub): visto en un pase distinto
              del activo o en una fila legado sin pase — atenuado a propósito,
              no es el cursor. */}
          {source === "mine" && episode.own.seenBefore && (
            <span
              title={tPasses("seenBefore")}
              className="shrink-0 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/70"
            >
              {tPasses("seenBefore")}
            </span>
          )}
        </span>

        <EpisodeRating
          rating={displayRating}
          onRate={interactive ? (r) => onRate(episode, r) : undefined}
          disabled={isPending}
          size={7}
        />

        <button
          type="button"
          onClick={() => onSelect(episode)}
          aria-label={t("details")}
          aria-expanded={selected}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition-transform ${selected ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Desplegable inline SOLO en móvil (`.epi-detail` del frame 4): en PC
          este mismo contenido vive en la tarjeta fija de la derecha, y
          duplicarlo abierto sería enseñarlo dos veces. */}
      {selected && (
        <div className="border-t border-border pr-[15px] pb-3.5 pl-[49px] lg:hidden">
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
