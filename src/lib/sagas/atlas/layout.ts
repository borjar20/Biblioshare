import type { Extent } from "@/lib/atlas/types";
import { SAGA_ITEM_ROLES } from "../roles";
import type { AtlasModel, AtlasWork } from "./model";

// Layouts del atlas de la saga (spec 2026-10-28 §5.1). Puros y deterministas.
// Todo se calcula en horizontal: `a` es el eje del orden y `c` el transversal.
// Con orientación `v` se intercambian x↔y al final (`swap`).
export type Orientation = "h" | "v";
export type Lens = "orden" | "rol" | "publicacion";

export const COVER_W = 60;
export const COVER_H = 90;
// Paso entre obras consecutivas a lo largo del eje de lectura. En `h` ese eje es el ancho
// de la portada (60 → 84); en `v` es el alto (90), así que el paso crece a COVER_H + 24 para
// que las portadas no se toquen.
const STEP_H = 84;
const STEP_V = COVER_H + 24;
const REGION_GAP = 60;
const PAD = 24;
const MARGIN = 40;

export type PlacedWork = { key: string; x: number; y: number; scale: number }; // centro de la portada
export type AtlasLayout = {
  items: PlacedWork[];
  regions: Array<{ key: string; x: number; y: number; w: number; h: number }>; // solo Orden
  islands: Array<{ key: string; x: number; y: number; r: number }>; // solo Orden, ≥ 2 regiones
  arcs: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; via: { x: number; y: number } }>;
  guides: Array<{ kind: "lane" | "tick"; key: string; x: number; y: number }>; // carriles (Rol) / años (Publicación)
  threads: Array<{ kind: "rol" | "publicacion"; keys: string[] }>;
  extent: Extent;
};
type Layout = Omit<AtlasLayout, "extent">;

// Función y no constante: cada layout recibe sus propios arrays (no compartidos entre llamadas).
const empty = (): Layout => ({ items: [], regions: [], islands: [], arcs: [], guides: [], threads: [] });

/** Medidas que dependen de la orientación, en el espacio `a`/`c` (antes del `swap`):
 *  `step` es el paso a lo largo de `a`; `along`/`cross` son la portada medida en `a` y en `c`. */
type Dims = { step: number; along: number; cross: number };
const dimsFor = (o: Orientation): Dims =>
  o === "v" ? { step: STEP_V, along: COVER_H, cross: COVER_W } : { step: STEP_H, along: COVER_W, cross: COVER_H };

function layoutOrden(model: AtlasModel, { step: STEP, along, cross }: Dims): Layout {
  const placed = new Map<string, PlacedWork>();
  const place = (key: string, x: number, y: number, scale = 1) => {
    const p = { key, x, y, scale };
    placed.set(key, p);
    return p;
  };
  const byIndex = [...model.works].sort((p, q) => p.readingIndex - q.readingIndex);
  const row = byIndex.filter((w) => !w.extra && !w.window);

  // Obras de fila: una por paso, salvo el segundo y siguientes de un tándem.
  let cursor = 0;
  let prevRegion: string | null = null;
  // Seguidoras ya colgadas de cada pareja: la n-ésima se desplaza 14*n, 10*n para no apilarse
  // (los 14 de `a` escalan con el paso, que en `v` es más largo).
  const FOLLOW = (14 * STEP) / STEP_H;
  const followers = new Map<string, number>();
  for (const w of row) {
    const partnerKey = w.tandem?.partnerKeys.find((k) => placed.has(k));
    if (partnerKey !== undefined) {
      const partner = placed.get(partnerKey)!;
      const n = (followers.get(partnerKey) ?? 0) + 1;
      followers.set(partnerKey, n);
      place(w.key, partner.x + FOLLOW * n, 10 * n);
      continue;
    }
    if (prevRegion !== null && w.regionKey !== prevRegion) cursor += REGION_GAP;
    prevRegion = w.regionKey;
    place(w.key, cursor, 0);
    cursor += STEP;
  }

  // Extremos de `a` de las obras de fila de cada región.
  const span = new Map<string, { min: number; max: number }>();
  for (const w of row) {
    const p = placed.get(w.key)!;
    const s = span.get(w.regionKey);
    span.set(w.regionKey, s ? { min: Math.min(s.min, p.x), max: Math.max(s.max, p.x) } : { min: p.x, max: p.x });
  }

  // Ventanas: flotan entre sus anclas ya colocadas. Se resuelve en orden de lectura,
  // así que una ventana puede anclarse a otra anterior. El ancla puede estar en otra región.
  const arcs: Layout["arcs"] = [];
  for (const w of byIndex.filter((o) => !o.extra && o.window)) {
    const anchors = [w.window!.afterKey, w.window!.beforeKey]
      .map((k) => (k ? placed.get(k) : undefined))
      .filter((p): p is PlacedWork => p !== undefined);
    // Sin anclas: el final de su región (la última obra de fila; 0 si la región no tiene).
    const a =
      anchors.length === 2 ? (anchors[0].x + anchors[1].x) / 2
        : anchors.length === 1 ? anchors[0].x + STEP / 2
          : (span.get(w.regionKey)?.max ?? 0);
    const p = place(w.key, a, -130);
    if (anchors.length === 2) {
      arcs.push({
        key: w.key, x1: anchors[0].x, y1: anchors[0].y, x2: anchors[1].x, y2: anchors[1].y, via: { x: p.x, y: p.y },
      });
    }
  }

  // Extras: bajo su región, a escala menor, desde el inicio de la región.
  const used = new Map<string, number>();
  for (const w of byIndex.filter((o) => o.extra)) {
    const i = used.get(w.regionKey) ?? 0;
    used.set(w.regionKey, i + 1);
    place(w.key, (span.get(w.regionKey)?.min ?? 0) + i * STEP * 0.7, 140, 0.7);
  }

  // Regiones: rectángulo de sus obras de fila (ventanas y extras no lo ensanchan).
  const regions: Layout["regions"] = [];
  for (const r of model.regions) {
    const s = span.get(r.key);
    if (!s) continue;
    regions.push({
      key: r.key, x: s.min - along / 2 - PAD, y: -cross / 2 - PAD,
      w: s.max - s.min + along + 2 * PAD, h: cross + 2 * PAD,
    });
  }
  const islands =
    regions.length >= 2
      ? regions.map((r) => ({
          key: r.key, x: r.x + r.w / 2, y: r.y + r.h / 2,
          r: 30 * Math.sqrt(model.works.filter((w) => w.regionKey === r.key).length),
        }))
      : [];

  return { ...empty(), items: model.works.map((w) => placed.get(w.key)!), regions, islands, arcs };
}

function layoutRol(model: AtlasModel, { step: STEP }: Dims): Layout {
  const laneOf = (w: AtlasWork): string => w.role ?? "principal";
  const present = new Set(model.works.map(laneOf));
  const lanes: string[] = ["principal", ...SAGA_ITEM_ROLES].filter((l) => present.has(l));
  const byIndex = [...model.works].sort((p, q) => p.readingIndex - q.readingIndex);

  const items = model.works.map((w) => ({ key: w.key, x: w.readingIndex * STEP, y: lanes.indexOf(laneOf(w)) * 150, scale: 1 }));
  const guides = lanes.map((l, i) => ({ kind: "lane" as const, key: l, x: -STEP, y: i * 150 }));

  // Hilo de cada obra con rol a la principal inmediatamente anterior; sin ella, sin hilo.
  const threads: Layout["threads"] = [];
  let lastMain: string | null = null;
  for (const w of byIndex) {
    if (w.role === null) lastMain = w.key;
    else if (lastMain !== null) threads.push({ kind: "rol", keys: [lastMain, w.key] });
  }
  return { ...empty(), items, guides, threads };
}

function layoutPublicacion(model: AtlasModel, { step: STEP, cross }: Dims): Layout {
  const COL = STEP * 1.3;
  const byIndex = [...model.works].sort((p, q) => p.readingIndex - q.readingIndex);
  const years = [...new Set(model.works.map((w) => w.year).filter((y): y is number => y !== null))].sort((p, q) => p - q);
  const undatedA = years.length * COL + STEP;
  const hasUndated = model.works.some((w) => w.year === null);

  // Apila por readingIndex dentro de cada columna (año o «sin año»).
  const depth = new Map<string, number>();
  const placed = new Map<string, PlacedWork>();
  for (const w of byIndex) {
    const col = w.year === null ? "sin-año" : String(w.year);
    const i = depth.get(col) ?? 0;
    depth.set(col, i + 1);
    placed.set(w.key, {
      key: w.key, x: w.year === null ? undatedA : years.indexOf(w.year) * COL, y: i === 0 ? 0 : -i * (cross + 16), scale: 1, // evita -0
    });
  }
  const guides: Layout["guides"] = years.map((y, i) => ({ kind: "tick" as const, key: String(y), x: i * COL, y: 70 }));
  if (hasUndated) guides.push({ kind: "tick", key: "sin-año", x: undatedA, y: 70 });

  return {
    ...empty(), guides, items: model.works.map((w) => placed.get(w.key)!),
    threads: byIndex.length > 0 ? [{ kind: "publicacion", keys: byIndex.map((w) => w.key) }] : [],
  };
}

function swap(l: Layout): Layout {
  return {
    items: l.items.map((i) => ({ ...i, x: i.y, y: i.x })),
    regions: l.regions.map((r) => ({ key: r.key, x: r.y, y: r.x, w: r.h, h: r.w })),
    islands: l.islands.map((i) => ({ ...i, x: i.y, y: i.x })),
    arcs: l.arcs.map((a) => ({
      key: a.key, x1: a.y1, y1: a.x1, x2: a.y2, y2: a.x2, via: { x: a.via.y, y: a.via.x },
    })),
    guides: l.guides.map((g) => ({ ...g, x: g.y, y: g.x })),
    threads: l.threads,
  };
}

// Caja de portadas (±COVER/2 × escala), arcos, islas y guías (carriles y años), más margen.
// Las guías cuentan como puntos: los carriles de Rol quedan a la izquierda de todo y, sin
// ellos, un `fit` a la extent dejaría sus etiquetas fuera de pantalla. Se calcula con
// el layout ya orientado, así que no depende de qué eje sea cuál.
function extentOf(l: Layout): Extent {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const i of l.items) {
    xs.push(i.x - (COVER_W / 2) * i.scale, i.x + (COVER_W / 2) * i.scale);
    ys.push(i.y - (COVER_H / 2) * i.scale, i.y + (COVER_H / 2) * i.scale);
  }
  for (const a of l.arcs) {
    xs.push(a.x1, a.x2, a.via.x);
    ys.push(a.y1, a.y2, a.via.y);
  }
  for (const i of l.islands) {
    xs.push(i.x - i.r, i.x + i.r);
    ys.push(i.y - i.r, i.y + i.r);
  }
  for (const g of l.guides) {
    xs.push(g.x);
    ys.push(g.y);
  }
  if (xs.length === 0) return { minX: -MARGIN, minY: -MARGIN, maxX: MARGIN, maxY: MARGIN };
  return {
    minX: Math.min(...xs) - MARGIN, minY: Math.min(...ys) - MARGIN,
    maxX: Math.max(...xs) + MARGIN, maxY: Math.max(...ys) + MARGIN,
  };
}

export function layoutAtlas(model: AtlasModel, lens: Lens, orientation: Orientation): AtlasLayout {
  const dims = dimsFor(orientation);
  const h = lens === "orden" ? layoutOrden(model, dims) : lens === "rol" ? layoutRol(model, dims) : layoutPublicacion(model, dims);
  const out = orientation === "v" ? swap(h) : h;
  return { ...out, extent: extentOf(out) };
}
