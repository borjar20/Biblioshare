import type { MarginAnchor } from "./types";

export type MarginAnchorInput =
  | { itemType: "book"; page: number | null; pages: number | null }
  | { itemType: "series"; season: number | null; episode: number | null }
  | { itemType: "movie" };

type Result = { ok: true; anchor: MarginAnchor } | { ok: false; error: "invalidPosition" };

const FINISH: Result = { ok: true, anchor: { kind: "finish" } };

// Las páginas son las de la edición del pase de quien ESCRIBE (pagesForPass):
// la proporción se fija una vez y cada lector la compara con la suya.
export function buildMarginAnchor(input: MarginAnchorInput): Result {
  if (input.itemType === "movie") return FINISH;
  if (input.itemType === "book") {
    if (input.page === null) return FINISH;
    if (!Number.isInteger(input.page) || input.page < 1) return { ok: false, error: "invalidPosition" };
    if (!input.pages || input.pages <= 0) return FINISH;
    if (input.page > input.pages) return { ok: false, error: "invalidPosition" };
    const ratio = Math.round((input.page / input.pages) * 1e6) / 1e6;
    return { ok: true, anchor: { kind: "ratio", ratio, page: input.page, pages: input.pages } };
  }
  if (input.season === null && input.episode === null) return FINISH;
  if (!Number.isInteger(input.season) || (input.season ?? -1) < 0) return { ok: false, error: "invalidPosition" };
  if (!Number.isInteger(input.episode) || (input.episode ?? 0) < 1) return { ok: false, error: "invalidPosition" };
  return { ok: true, anchor: { kind: "episode", season: input.season!, episode: input.episode! } };
}
