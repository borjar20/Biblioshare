// Frases de la mascota en la sesión (spec 2026-11-07, «La sesión diaria»). Puro.
// El texto vive en messages/es.json → ritual.session.<key>.
export type SessionLineKey =
  | "openBook" | "openFirst" | "openSeries"
  | "savedFinished" | "savedHalf" | "savedNearEnd" | "savedPages" | "savedEpisodes" | "savedGeneric";
export type SessionLine = { key: SessionLineKey; values: Record<string, number> };

export function openingLine(itemType: "book" | "series", fromPage: number | null): SessionLine {
  if (itemType === "series") return { key: "openSeries", values: {} };
  return fromPage && fromPage > 0 ? { key: "openBook", values: { page: fromPage } } : { key: "openFirst", values: {} };
}

export function savedLine(input: {
  itemType: "book" | "series"; fromPage: number | null; toPage: number | null; total: number | null; episodes: number;
}): SessionLine {
  if (input.itemType === "series") {
    return input.episodes > 0 ? { key: "savedEpisodes", values: { count: input.episodes } } : { key: "savedGeneric", values: {} };
  }
  const from = input.fromPage ?? 0;
  const to = input.toPage ?? from;
  const delta = to - from;
  if (delta <= 0) return { key: "savedGeneric", values: {} };
  const total = input.total;
  if (total && to >= total) return { key: "savedFinished", values: {} };
  if (total && from < total / 2 && to >= total / 2) return { key: "savedHalf", values: { delta } };
  if (total && total - to <= 30) return { key: "savedNearEnd", values: { delta, remaining: total - to } };
  return { key: "savedPages", values: { delta } };
}
