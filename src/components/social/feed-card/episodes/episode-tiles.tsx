"use client";

import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { bestEpisodes, episodeCode } from "./episode-stats";

// Fichas de 2-3 episodios (spec 2026-10-05-feed-episodios-curva): con tan pocos
// puntos una curva no tiene forma, así que cada episodio es una ficha con su
// nota grande. En el post, más grandes y con el título entero.
export function EpisodeTiles({
  episodes,
  itemType,
  size,
}: {
  episodes: FeedEpisode[];
  itemType: ItemType;
  size: "feed" | "post";
}) {
  const t = useTranslations("feed");
  const best = bestEpisodes(episodes);
  const post = size === "post";
  return (
    <ul className={`grid gap-1.5 ${episodes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {episodes.map((e) => {
        const isBest = best.has(e);
        return (
          <li
            key={episodeCode(e)}
            className={`min-w-0 rounded-lg border ${post ? "px-3 py-2.5" : "px-2 py-1.5"} ${isBest ? "border-[var(--type-series)] bg-surface-muted" : "border-border bg-surface-muted/60"}`}
          >
            <p className={`font-mono text-[9.5px] ${isBest ? "text-gold-ink" : "text-muted-foreground"}`}>
              {episodeCode(e)}
              {isBest && " ★"}
            </p>
            {e.rating != null ? (
              <>
                <p className={`font-bold leading-tight text-[var(--type-series)] ${post ? "text-[28px]" : "text-[20px]"}`}>
                  {formatDots(e.rating)}
                  <span className="text-[10px] font-normal text-muted-foreground">{t("card.outOf5")}</span>
                </p>
                <RatingDots value={e.rating} size="sm" itemType={itemType} />
              </>
            ) : (
              <p className={`font-bold leading-tight text-muted-foreground ${post ? "text-[20px]" : "text-[16px]"}`}>
                —<span className="ml-1 text-[10px] font-normal">{t("card.noRatingShort")}</span>
              </p>
            )}
            {e.title && (
              <p className={`mt-1 text-[11px] leading-snug text-foreground ${post ? "text-[13px]" : "line-clamp-2"}`}>{e.title}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
