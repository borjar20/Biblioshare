"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import { formatDots } from "@/lib/rating/dots";
import { curveGeometry } from "./curve-geometry";
import { bestEpisodes, episodeCode } from "./episode-stats";

// Curva de los episodios del día (4 o más). SVG propio; la geometría vive en
// curve-geometry.ts. Eje 1-5 siempre, sin línea de media. En el feed lleva la
// nota y el código en cada punto hasta 8 episodios; desde 9 queda compacta.
// En el post hay dos SVG (uno estrecho para móvil, otro ancho desde `sm`) para
// que el texto no se encoja: etiquetas hasta 12 episodios en el estrecho y
// hasta 24 en el ancho; más allá, compacta.
type CurveConfig = { width: number; labeled: number; compact: number; labelMax: number };
const FEED: CurveConfig = { width: 320, labeled: 124, compact: 80, labelMax: 8 };
const POST_NARROW: CurveConfig = { width: 340, labeled: 150, compact: 110, labelMax: 12 };
const POST_WIDE: CurveConfig = { width: 600, labeled: 170, compact: 110, labelMax: 24 };

export function EpisodeCurve({
  episodes,
  size,
  showBest = false,
}: {
  episodes: FeedEpisode[];
  size: "feed" | "post";
  showBest?: boolean;
}) {
  const t = useTranslations("feed");
  const label = t("card.curveLabel", {
    list: episodes.map((e) => `${episodeCode(e)}: ${e.rating != null ? formatDots(e.rating) : t("card.noRatingShort")}`).join("; "),
  });
  const best = [...bestEpisodes(episodes)][0];

  return (
    <div>
      {size === "feed" ? (
        <CurveSvg episodes={episodes} cfg={FEED} label={label} />
      ) : (
        <>
          <CurveSvg episodes={episodes} cfg={POST_NARROW} label={label} className="sm:hidden" />
          <CurveSvg episodes={episodes} cfg={POST_WIDE} label={label} className="hidden sm:block" />
        </>
      )}
      {showBest && best && (
        <p className="mt-1.5 text-[12px]">
          <span role="img" className="text-gold-ink" aria-label={t("card.bestLine")}>★</span>{" "}
          <span className="font-semibold">{[episodeCode(best), best.title].filter(Boolean).join(" · ")}</span>{" "}
          <span className="font-mono text-type-series-ink">{formatDots(best.rating)}</span>
        </p>
      )}
    </div>
  );
}

function CurveSvg({
  episodes,
  cfg,
  label,
  className = "",
}: {
  episodes: FeedEpisode[];
  cfg: CurveConfig;
  label: string;
  className?: string;
}) {
  const gradId = `episode-curve-fill-${useId().replace(/:/g, "")}`;
  const labels = episodes.length <= cfg.labelMax;
  const { width } = cfg;
  const height = labels ? cfg.labeled : cfg.compact;
  const g = curveGeometry(episodes, { width, height, labels });

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={`block h-auto w-full ${className}`}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--type-series)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--type-series)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={g.axisX} x2={g.right} y1={tick.y} y2={tick.y} stroke="var(--border)" />
            <text data-axis-tick x={g.axisX - 6} y={tick.y + 3} textAnchor="end" fontSize="9.5" fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
              {tick.value}
            </text>
          </g>
        ))}
        <line x1={g.axisX} x2={g.axisX} y1={g.ticks[4].y - 4} y2={g.plotBottom} stroke="var(--border)" />
        {g.area && <path d={g.area} fill={`url(#${gradId})`} />}
        {g.seasonBreaks.map((b) => (
          <g key={b.season}>
            <line x1={b.x} x2={b.x} y1={12} y2={g.plotBottom} stroke="var(--border)" strokeDasharray="2 3" />
            <text x={b.x + 3} y={9} fontSize="8.5" fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
              T{b.season}
            </text>
          </g>
        ))}
        {g.segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="var(--type-series)"
            strokeWidth={labels ? 2 : 1.6}
            strokeLinecap="round"
            strokeDasharray={s.dashed ? "3 3" : undefined}
            opacity={s.dashed ? 0.6 : 1}
          />
        ))}
        {g.points.map((p) => (
          <g key={episodeCode(p.episode)}>
            {p.rated ? (
              <circle
                cx={p.x}
                cy={p.y}
                r={labels ? (p.best ? 6 : 4.5) : p.best ? 4 : 2}
                fill={p.best ? "var(--foreground)" : "var(--type-series)"}
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ) : (
              <circle cx={p.x} cy={p.y} r={labels ? 4 : 2} fill="var(--surface)" stroke="var(--muted-foreground)" strokeDasharray="2 2" />
            )}
            {labels && (
              <>
                {p.rated && (
                  <text data-point-label x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={p.best ? "var(--foreground)" : "var(--type-series-ink)"}>
                    {formatDots(p.episode.rating)}
                  </text>
                )}
                <text x={p.x} y={height - 5} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
                  {episodeCode(p.episode, true)}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      {!labels && (
        <p aria-hidden className={`mt-0.5 flex justify-between font-mono text-[9.5px] text-muted-foreground ${className.replace("sm:block", "sm:flex")}`}>
          <span>{episodeCode(episodes[0])}</span>
          <span>{episodeCode(episodes[episodes.length - 1])}</span>
        </p>
      )}
    </>
  );
}
