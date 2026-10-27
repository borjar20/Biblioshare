import type { ItemType } from "@/lib/catalog/types";

// «Tu paso por la saga» (spec 2026-10-27 §1.5, fase 2). Puro: entran tus
// pases en las obras de la saga, las tallas de catálogo y el orden de la balda
// activa; sale lo que el bloque pinta. Las tallas que faltan no se inventan:
// se dice sobre cuántas se suma, como en get-format-stats.ts.

export type PassRow = {
  itemType: ItemType;
  itemId: string;
  status: "planned" | "in_progress" | "completed" | "dropped";
  rating: number | null; // 1–10
  startedOn: string | null; // YYYY-MM-DD
  finishedOn: string | null;
  createdAt: string; // ISO
};
export type CatalogSize = { pages: number | null; minutes: number | null };
export type PassageInput = {
  passes: PassRow[];
  /** Talla por clave `tipo:id` (solo libros y películas). */
  sizes: Map<string, CatalogSize>;
  /** Obras de la saga en el orden de la balda activa: clave `tipo:id`, título,
   *  si es opcional y si está saltada. */
  order: Array<{ key: string; title: string; href: string; optional: boolean; skipped: boolean }>;
};
export type Passage = {
  since: string | null; // YYYY-MM-DD
  completed: number; // obras distintas con algún pase completed
  inProgress: number; // obras con pase in_progress y ninguno completed
  pages: { total: number; known: number; of: number } | null; // null si no hay libros terminados
  minutes: { total: number; known: number; of: number } | null; // null si no hay pelis terminadas
  favorite: { key: string; title: string; href: string; rating: number } | null;
  average: number | null; // media 1–10 de tu ÚLTIMA nota terminada por obra
  curve: Array<{ x: number; rating: number; key: string; title: string }>; // x = índice en `order`
  curveLength: number; // order.length
  optional: { skipped: number; total: number } | null; // null si no hay opcionales
};

const keyOf = (r: PassRow) => `${r.itemType}:${r.itemId}`;
const day = (r: PassRow) => r.startedOn ?? r.finishedOn ?? r.createdAt.slice(0, 10);

/** true si `a` terminó después que `b` (fin nulo = después de cualquier fecha). */
function laterFinish(a: PassRow, b: PassRow): boolean {
  if (a.finishedOn !== b.finishedOn) {
    if (a.finishedOn === null) return true;
    if (b.finishedOn === null) return false;
    return a.finishedOn > b.finishedOn;
  }
  return a.createdAt > b.createdAt;
}

export function derivePassage({ passes, sizes, order }: PassageInput): Passage | null {
  if (passes.length === 0) return null;

  const since = passes.map(day).sort()[0] ?? null;

  // Último pase terminado por obra (regla 4).
  const lastDone = new Map<string, PassRow>();
  const started = new Set<string>();
  for (const r of passes) {
    const k = keyOf(r);
    if (r.status === "completed") {
      const prev = lastDone.get(k);
      if (!prev || laterFinish(r, prev)) lastDone.set(k, r);
    } else if (r.status === "in_progress") started.add(k);
  }
  const inProgress = [...started].filter((k) => !lastDone.has(k)).length;

  const rated = [...lastDone.entries()].filter(([, r]) => r.rating !== null) as Array<
    [string, PassRow & { rating: number }]
  >;
  const average = rated.length === 0 ? null : rated.reduce((s, [, r]) => s + r.rating, 0) / rated.length;

  const byKey = new Map(order.map((w) => [w.key, w] as const));
  let favorite: Passage["favorite"] = null;
  let favRow: PassRow | null = null;
  for (const [k, r] of rated) {
    const w = byKey.get(k);
    if (!w) continue;
    if (
      !favorite ||
      r.rating > favorite.rating ||
      (r.rating === favorite.rating && favRow && laterFinish(r, favRow))
    ) {
      favorite = { key: k, title: w.title, href: w.href, rating: r.rating };
      favRow = r;
    }
  }

  const sizeSum = (type: ItemType, pick: (s: CatalogSize) => number | null) => {
    const done = [...lastDone.keys()].filter((k) => k.startsWith(`${type}:`));
    if (done.length === 0) return null;
    const known = done
      .map((k) => sizes.get(k))
      .map((s) => (s ? pick(s) : null))
      .filter((v): v is number => v !== null);
    return { total: known.reduce((a, b) => a + b, 0), known: known.length, of: done.length };
  };

  const curve = order.flatMap((w, i) => {
    const r = lastDone.get(w.key);
    return r && r.rating !== null ? [{ x: i, rating: r.rating, key: w.key, title: w.title }] : [];
  });

  const optionals = order.filter((w) => w.optional);
  return {
    since,
    completed: lastDone.size,
    inProgress,
    pages: sizeSum("book", (s) => s.pages),
    minutes: sizeSum("movie", (s) => s.minutes),
    favorite,
    average,
    curve,
    curveLength: order.length,
    optional:
      optionals.length === 0
        ? null
        : { skipped: optionals.filter((w) => w.skipped).length, total: optionals.length },
  };
}
