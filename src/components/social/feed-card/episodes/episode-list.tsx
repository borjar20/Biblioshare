"use client";

import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { bestEpisodes, episodeCode, seasonsOf } from "./episode-stats";

// Lista de episodios del post (4-12, o desplegada desde «Ver los N»): una fila
// por episodio, en 2 columnas desde `sm` y de arriba abajo por columna.
export function EpisodeList({ episodes, itemType }: { episodes: FeedEpisode[]; itemType: ItemType }) {
  const best = bestEpisodes(episodes);
  // Con varias temporadas, «E4» solo no basta: dos filas podrían llamarse igual.
  const longCode = seasonsOf(episodes).length > 1;
  return (
    <ul className="gap-x-6 sm:columns-2">
      {episodes.map((e) => (
        <EpisodeRow key={episodeCode(e)} episode={e} itemType={itemType} best={best.has(e)} longCode={longCode} />
      ))}
    </ul>
  );
}

export function EpisodeRow({
  episode: e,
  itemType,
  best = false,
  longCode = false,
}: {
  episode: FeedEpisode;
  itemType: ItemType;
  best?: boolean;
  longCode?: boolean;
}) {
  const t = useTranslations("feed");
  return (
    <li className={`flex break-inside-avoid items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px] ${best ? "bg-surface-muted" : ""}`}>
      <span className={`shrink-0 font-mono text-[10.5px] text-muted-foreground ${longCode ? "w-11" : "w-8"}`}>{episodeCode(e, !longCode)}</span>
      <span className="min-w-0 flex-1 truncate">
        {e.title}
        {best && (
          <span role="img" aria-label={t("card.bestLine")} className="ml-1 text-gold-ink">
            ★
          </span>
        )}
      </span>
      {e.rating != null ? (
        <>
          <RatingDots value={e.rating} size="sm" itemType={itemType} />
          <span className="w-7 shrink-0 text-right font-mono text-[11px] text-[var(--type-series)]">{formatDots(e.rating)}</span>
        </>
      ) : (
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{t("card.noRatingShort")}</span>
      )}
    </li>
  );
}
