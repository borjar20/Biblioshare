// Resumen que el dueño comparte: cifras y portadas, nunca notas ni reseñas.
import { totalMinutes } from "./select-stories";
import type { ItemRef, SeriesProgress, ShareSummary, WrapUpInputs, WrapUpPayload } from "./types";

function addSeries(summary: ShareSummary, items: SeriesProgress[], count: number, episodes: number | null): ShareSummary {
  const covers = [...summary.covers];
  const seen = new Set(covers.map(c => `${c.type}:${c.id}`));
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Lista explícita: nunca arrastrar metadata privada de la story al share.
    const cover: ItemRef = {type: item.type, id: item.id, title: item.title, coverUrl: item.coverUrl, times: item.times};
    covers.push(cover);
  }
  return {...summary, seriesProgress: {count, episodes}, covers: covers.slice(0, 4)};
}

export function shareSummary(p: Omit<WrapUpPayload, "share">, i: WrapUpInputs): ShareSummary {
  const summary: ShareSummary = {
    kind: p.kind, periodStart: p.periodStart, periodEnd: p.periodEnd,
    narrator: p.narrator, palette: p.palette,
    minutes: totalMinutes(i.time), episodesWithoutRuntime: i.time.episodesWithoutRuntime,
    finished: i.finished.length, covers: i.finished.slice(0, 4), pet: p.pet,
  };
  const items = p.kind === "week" ? i.seriesProgress ?? [] : [];
  return items.length ? addSeries(summary, items, items.length, items.reduce((n, i) => n + i.episodes, 0)) : summary;
}

/** Compatibilidad con semanales que ya guardaron la story pero aún no su resumen. */
export function summaryForPayload(p: WrapUpPayload): ShareSummary {
  if (p.kind !== "week" || p.share?.seriesProgress) return p.share;
  const story = p.stories?.find(s => s.id === "series_progress");
  if (!story || story.id !== "series_progress" || !story.items.length) return p.share;
  const episodes = story.items.length === story.total ? story.items.reduce((n, i) => n + i.episodes, 0) : null;
  return addSeries(p.share, story.items, story.total, episodes);
}
