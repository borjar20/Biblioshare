"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import {
  RATING_TIERS,
  ratingColor,
  averageRating,
} from "@/lib/series/rating-scale";

export type SeasonGroup = { season: number; episodes: EpisodeRow[] };
export type GridSource = "mine" | "community";

// Valor y metadatos de una celda según la fuente seleccionada.
function cellData(ep: EpisodeRow, source: GridSource) {
  if (source === "mine") {
    return {
      rating: ep.own.rating,
      present: ep.own.watched,
      hasNote: Boolean(ep.own.review),
    };
  }
  return { rating: ep.avgRating, present: ep.ratingCount > 0, hasNote: false };
}

// Rejilla temporada × episodio (§7.36): temporadas en filas, episodios en
// columnas. Celdas coloreadas por tramo de nota (escala de 6), con panel de
// detalle al pasar el ratón. La fuente (mis notas / comunidad) la controla el
// contenedor.
export function EpisodeGrid({
  seasons,
  source,
}: {
  seasons: SeasonGroup[];
  source: GridSource;
}) {
  const t = useTranslations("episode");
  const tLegend = useTranslations("detail.grid.legend");
  const [hover, setHover] = useState<EpisodeRow | null>(null);

  const maxEpisodes = seasons.reduce(
    (max, s) => Math.max(max, ...s.episodes.map((e) => e.episode)),
    0,
  );
  const columns = Array.from({ length: maxEpisodes }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <tbody>
            {seasons.map((s) => {
              const ratings = s.episodes
                .map((e) => cellData(e, source).rating)
                .filter((r): r is number => r !== null);
              const avg = averageRating(ratings);
              const byEpisode = new Map(s.episodes.map((e) => [e.episode, e]));
              return (
                <tr key={s.season}>
                  <th className="pr-2 text-left align-middle">
                    <span className="block font-mono text-xs font-semibold text-foreground">
                      {t("seasonShort", { n: s.season })}
                    </span>
                    {avg !== null && (
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {t("avgShort", { value: avg.toFixed(1) })}
                      </span>
                    )}
                  </th>
                  {columns.map((epNum) => {
                    const ep = byEpisode.get(epNum);
                    if (!ep)
                      return <td key={epNum} className="min-w-[2.5rem]" />;
                    const { rating, present, hasNote } = cellData(ep, source);
                    const color = ratingColor(rating);
                    return (
                      <td key={epNum} className="min-w-[2.5rem]">
                        <button
                          type="button"
                          onMouseEnter={() => setHover(ep)}
                          onFocus={() => setHover(ep)}
                          onClick={() => setHover(ep)}
                          style={
                            color
                              ? {
                                  backgroundColor: color,
                                  color: "var(--tier-foreground)",
                                }
                              : undefined
                          }
                          className={`relative flex h-9 w-full items-center justify-center rounded-md font-mono text-xs font-semibold transition-transform hover:scale-105 ${
                            color
                              ? ""
                              : present
                                ? "bg-surface-muted text-muted-foreground"
                                : "bg-surface-muted/40 text-muted-foreground/50"
                          }`}
                          title={`${t("code", { s: ep.season, e: ep.episode })}${ep.title ? ` · ${ep.title}` : ""}`}
                        >
                          {rating !== null ? rating.toFixed(1) : epNum}
                          {hasNote && (
                            // bg-current: hereda el color de texto de la celda,
                            // que ya contrasta con su fondo tenga tramo o no.
                            <span className="absolute bottom-1 h-1 w-1 rounded-full bg-current opacity-80" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {RATING_TIERS.map((tier) => (
          <span key={tier.key} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: tier.color }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {tLegend(tier.key)}
            </span>
          </span>
        ))}
        {source === "mine" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {t("hasNote")}
            </span>
          </span>
        )}
      </div>
      {/* Panel de detalle (hover/tap) */}
      <div className="min-h-[3.75rem] rounded-card border border-border bg-surface shadow-card px-4 py-3">
        {hover ? (
          <HoverDetail episode={hover} source={source} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("hoverHint")}</p>
        )}
      </div>
    </div>
  );
}

function HoverDetail({
  episode,
  source,
}: {
  episode: EpisodeRow;
  source: GridSource;
}) {
  const t = useTranslations("episode");
  const rating = source === "mine" ? episode.own.rating : episode.avgRating;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {t("code", { s: episode.season, e: episode.episode })}
        </span>
        <span className="text-sm font-medium text-foreground">
          {episode.title ?? t("untitled")}
        </span>
        {rating !== null && (
          <span className="ml-auto font-mono text-sm font-semibold text-foreground">
            {rating.toFixed(1)}
            {source === "community" && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {t("communityCount", { count: episode.ratingCount })}
              </span>
            )}
          </span>
        )}
      </div>
      {source === "mine" && episode.own.review ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {episode.own.review}
        </p>
      ) : episode.synopsis ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {episode.synopsis}
        </p>
      ) : null}
    </div>
  );
}
