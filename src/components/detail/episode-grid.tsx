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

function seasonAverage(episodes: EpisodeRow[], source: GridSource) {
  return averageRating(episodes.map((ep) => cellData(ep, source).rating).filter((r) => r !== null));
}

export function EpisodeGrid({
  seasons,
  source,
  selectedKey,
  onSelect,
}: {
  seasons: SeasonGroup[];
  source: GridSource;
  selectedKey: string | null;
  onSelect: (ep: EpisodeRow) => void;
}) {
  const t = useTranslations("episode");
  const tLegend = useTranslations("detail.grid.legend");
  const [hover, setHover] = useState<EpisodeRow | null>(null);

  const maxEpisodes = seasons.reduce(
    (max, s) => Math.max(max, ...s.episodes.map((e) => e.episode)),
    0,
  );
  const columns = Array.from({ length: maxEpisodes }, (_, i) => i + 1);

  const detail = hover ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Leyenda. En C3 va ANTES de la rejilla (los colores son el contenido, no
          una nota al pie); en la tabla de PC se queda debajo, como estaba. */}
      <div className="order-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 @min-[760px]/episodes:order-4">
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
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-border bg-surface-muted" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("legendUnseen")}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-border" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("legendUpcoming")}
          </span>
        </span>
        {source === "mine" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {t("hasNote")}
            </span>
          </span>
        )}
      </div>

      <div className="order-3 space-y-5 @min-[760px]/episodes:hidden">
        {seasons.map(({ season, episodes }) => {
          const avg = seasonAverage(episodes, source);
          const aired = episodes.filter((ep) => ep.aired);
          return (
            <section key={season} aria-label={t("season", { n: season })}>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-sm font-semibold">{t("season", { n: season })}</h3>
                {avg !== null && (
                  <span className="text-xs text-muted-foreground">{t("avgShort", { value: avg.toFixed(1) })}</span>
                )}
                {source === "mine" && aired.length > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("watchedCount", { watched: aired.filter((ep) => ep.own.watched).length, total: aired.length })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1 @min-[300px]/episodes:grid-cols-5">
                {episodes.map((ep) => {
                  const { rating, present, hasNote } = cellData(ep, source);
                  const color = ratingColor(rating);
                  const selected = selectedKey === `${season}:${ep.episode}`;
                  const stateLabel = !ep.aired ? t("legendUpcoming") : source === "mine"
                    ? t(present ? "watched" : "legendUnseen") : t("communityCount", { count: ep.ratingCount });
                  return (
                    <button key={ep.episode} type="button" onClick={() => onSelect(ep)}
                      aria-label={[t("code", { s: season, e: ep.episode }), ep.title, rating?.toFixed(1), stateLabel, hasNote && t("hasNote")].filter(Boolean).join(" · ")}
                      style={color ? { backgroundColor: color, color: "var(--tier-foreground)" } : undefined}
                      className={`relative flex min-h-11 min-w-0 flex-col justify-between rounded-md border px-1.5 py-1 leading-none tabular-nums ${
                        color ? "border-transparent" : !ep.aired ? "border-dashed border-border" : "border-border bg-surface-muted"
                      } ${selected ? "outline-2 outline-offset-1 outline-type-series" : ""}`}>
                      <span className="self-start font-mono text-[10px]">{t("episodeShort", { n: ep.episode })}</span>
                      <span className="self-end text-lg leading-none font-semibold">
                        {rating !== null ? rating.toFixed(1) : source === "mine" && present ? "✓" : "—"}
                      </span>
                      {hasNote && <span aria-hidden className="absolute top-1.5 right-1.5 size-1 rounded-full bg-current" />}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* PC — la tabla de siempre: temporadas en filas, episodios en columnas. */}
      <div className="order-3 hidden overflow-x-auto @min-[760px]/episodes:block">
        <table className="border-separate border-spacing-1">
          <tbody>
            {seasons.map((s) => {
              const avg = seasonAverage(s.episodes, source);
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
                          onClick={() => {
                            setHover(ep);
                            onSelect(ep);
                          }}
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
                                : ep.aired
                                  ? "bg-surface-muted/40 text-muted-foreground/50"
                                  : "border border-dashed border-border text-muted-foreground/40"
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

      {/* Panel de detalle (hover en PC, toque en móvil) */}
      <div className="order-5 hidden @min-[760px]/episodes:block min-h-[3.75rem] rounded-card border border-border bg-surface px-4 py-3 shadow-card">
        {detail ? (
          <HoverDetail episode={detail} source={source} />
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
