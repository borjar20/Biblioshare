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
  order: Array<{ key: string; title: string; href: string; coverUrl: string | null; optional: boolean; skipped: boolean }>;
  /** Opcionales saltadas sobre el total de opcionales de la SAGA entera (no de la
   *  balda: esta oculta opcionales según la preferencia y cambia con el
   *  itinerario). null si no hay opcionales. Lo calcula `sagaOptionalFigure`. */
  optional?: { skipped: number; total: number } | null;
  /** Claves `tipo:id` de las obras opcionales de la saga: no cuentan para
   *  `countedAverage`. */
  optionalKeys?: Set<string>;
};
export type Passage = {
  since: string | null; // YYYY-MM-DD
  completed: number; // obras distintas con algún pase completed
  inProgress: number; // obras con pase in_progress y ninguno completed
  pages: { total: number; known: number; of: number } | null; // null si no hay libros terminados
  minutes: { total: number; known: number; of: number } | null; // null si no hay pelis terminadas
  favorite: { key: string; title: string; href: string; coverUrl: string | null; rating: number } | null;
  average: number | null; // media 1–10 de tu ÚLTIMA nota terminada por obra (todas las obras)
  countedAverage: number | null; // lo mismo, solo en obras que cuentan (no opcionales)
  /** Tus notas por obra, en el orden de la balda: alimenta los puntos bajo
   *  cada portada leída de la balda. x = índice en `order`. */
  curve: Array<{ x: number; rating: number; key: string; title: string }>;
  curveLength: number; // order.length
  /** «Cómo has puntuado esta saga»: niveles 5→1 (escala de puntos), cada uno
   *  con sus obras en el orden de la balda. Siempre los cinco niveles. */
  distribution: Array<{ level: number; works: Array<{ key: string; title: string; href: string; coverUrl: string | null }> }>;
  optional: { skipped: number; total: number } | null; // null si no hay opcionales
};

const keyOf = (r: PassRow) => `${r.itemType}:${r.itemId}`;
const day = (r: PassRow) => r.startedOn ?? r.finishedOn ?? r.createdAt.slice(0, 10);

/** true si `a` terminó después que `b` (fin nulo = anterior a cualquier fecha:
 *  importaciones de historial sin fecha). */
export function laterFinish(a: Pick<PassRow, "finishedOn" | "createdAt">, b: Pick<PassRow, "finishedOn" | "createdAt">): boolean {
  if (a.finishedOn !== b.finishedOn) {
    if (a.finishedOn === null) return false;
    if (b.finishedOn === null) return true;
    return a.finishedOn > b.finishedOn;
  }
  return a.createdAt > b.createdAt;
}

/** Cifra de opcionales de la saga entera a partir de sus miembros: dedupe por
 *  `tipo:id` (una obra compartida cuenta una vez; saltada si algún miembro lo
 *  está) y el conjunto de claves opcionales. */
export function sagaOptionalFigure(
  members: Array<{ itemType: ItemType; itemId: string; optional: boolean; skipped: boolean }>,
): { optional: { skipped: number; total: number } | null; optionalKeys: Set<string> } {
  const byKey = new Map<string, boolean>();
  for (const m of members) {
    if (!m.optional) continue;
    const k = `${m.itemType}:${m.itemId}`;
    byKey.set(k, (byKey.get(k) ?? false) || m.skipped);
  }
  const skipped = [...byKey.values()].filter(Boolean).length;
  return {
    optional: byKey.size === 0 ? null : { skipped, total: byKey.size },
    optionalKeys: new Set(byKey.keys()),
  };
}

export function derivePassage({
  passes,
  sizes,
  order,
  optional = null,
  optionalKeys = new Set(),
}: PassageInput): Passage | null {
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

  const counted = rated.filter(([k]) => !optionalKeys.has(k));
  const countedAverage =
    counted.length === 0 ? null : counted.reduce((s, [, r]) => s + r.rating, 0) / counted.length;

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
      favorite = { key: k, title: w.title, href: w.href, coverUrl: w.coverUrl, rating: r.rating };
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

  // Nivel en la escala de puntos (1–5) de una nota 1–10: el medio punto sube
  // (7 → 3,5 → 4), igual que el redondeo visible de formatDots a entero.
  const levelOf = (rating: number) => Math.min(5, Math.max(1, Math.ceil(rating / 2)));
  const byKeyOrder = new Map(order.map((w) => [w.key, w] as const));
  const distribution = [5, 4, 3, 2, 1].map((level) => ({
    level,
    works: curve
      .filter((c) => levelOf(c.rating) === level)
      .map((c) => {
        const w = byKeyOrder.get(c.key)!;
        return { key: c.key, title: w.title, href: w.href, coverUrl: w.coverUrl };
      }),
  }));

  return {
    since,
    completed: lastDone.size,
    inProgress,
    pages: sizeSum("book", (s) => s.pages),
    minutes: sizeSum("movie", (s) => s.minutes),
    favorite,
    average,
    countedAverage,
    curve,
    curveLength: order.length,
    distribution,
    optional,
  };
}
