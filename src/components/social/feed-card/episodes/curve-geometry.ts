import type { FeedEpisode } from "@/lib/social/feed";
import { bestEpisodes } from "./episode-stats";

// Geometría de la curva de episodios, separada del SVG para probarla sin DOM.
// Eje vertical fijo 0-10 (escala guardada): las guías van en 2, 4, 6, 8 y 10,
// que la vista rotula 1-5; un episodio sin nota se apoya en la base (0).
export type CurvePoint = { x: number; y: number; episode: FeedEpisode; rated: boolean; best: boolean };
export type CurveGeometry = {
  ticks: { value: number; y: number }[];
  axisX: number;
  plotTop: number;
  plotBottom: number;
  right: number;
  points: CurvePoint[];
  segments: { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[];
  area: string | null;
  seasonBreaks: { x: number; season: number }[];
};

const AXIS_W = 24;
const PAD_R = 10;

export function curveGeometry(
  eps: FeedEpisode[],
  { width, height, labels }: { width: number; height: number; labels: boolean },
): CurveGeometry {
  const plotTop = labels ? 22 : 10;
  const plotBottom = height - (labels ? 20 : 10);
  const left = AXIS_W + (labels ? 16 : 8);
  const right = width - PAD_R;
  const n = eps.length;
  const x = (i: number) => (n > 1 ? left + (i * (right - left)) / (n - 1) : (left + right) / 2);
  const y = (rating: number) => plotTop + ((10 - rating) / 10) * (plotBottom - plotTop);

  const best = bestEpisodes(eps);
  const points: CurvePoint[] = eps.map((e, i) => ({
    x: x(i),
    y: e.rating != null ? y(e.rating) : plotBottom,
    episode: e,
    rated: e.rating != null,
    best: best.has(e),
  }));

  const ratedIdx = points.map((p, i) => (p.rated ? i : -1)).filter((i) => i >= 0);
  const segments = ratedIdx.slice(1).map((i, k) => {
    const prev = ratedIdx[k];
    return { x1: points[prev].x, y1: points[prev].y, x2: points[i].x, y2: points[i].y, dashed: i - prev > 1 };
  });

  const area =
    ratedIdx.length >= 2
      ? "M" +
        ratedIdx.map((i) => `${points[i].x.toFixed(1)},${points[i].y.toFixed(1)}`).join(" L") +
        ` L${points[ratedIdx.at(-1)!].x.toFixed(1)},${plotBottom.toFixed(1)}` +
        ` L${points[ratedIdx[0]].x.toFixed(1)},${plotBottom.toFixed(1)} Z`
      : null;

  const seasonBreaks = eps.flatMap((e, i) =>
    i > 0 && e.season !== eps[i - 1].season ? [{ x: (points[i].x + points[i - 1].x) / 2, season: e.season }] : [],
  );

  const ticks = [1, 2, 3, 4, 5].map((value) => ({ value, y: y(value * 2) }));

  return { ticks, axisX: AXIS_W, plotTop, plotBottom, right, points, segments, area, seasonBreaks };
}
