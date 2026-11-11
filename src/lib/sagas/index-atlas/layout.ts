import type { Extent, Orientation, Point } from "@/lib/atlas/types";
import type { ComarcaKey, IndexAtlasModel, IndexAtlasSaga, IndexZoneKey } from "./model";

// Layout del atlas de /sagas (spec 2026-10-28 índice §4.2). Puro. Cada zona es una rejilla
// de celdas; un universo ocupa dos (portada + rejilla de subsagas). Las coordenadas de las
// sagas son el CENTRO de la portada; las de zonas e islas, su esquina superior izquierda.
export const SAGA_W = 64;
export const SAGA_H = 96;
export const CHILD_SCALE = 1 / 3;
export const MAX_CHILDREN = 6;
const CELL_W = SAGA_W + 28;
const CELL_H = SAGA_H + 40;
const ZONE_PAD = 28;
const ZONE_HEADER = 36;
const COMARCA_HEADER = 26;
const ZONE_GAP = 56;
const ISLAND_MARGIN = 8;
const READER_ZONES: readonly IndexZoneKey[] = ["en-curso", "sigues", "terminadas"];

export type ZoneBox = { key: IndexZoneKey; x: number; y: number; w: number; h: number };
export type ComarcaBox = { key: ComarcaKey; x: number; y: number };
export type SagaBox = { id: string; x: number; y: number; scale: number; parentId: string | null };
export type IslandBox = { id: string; x: number; y: number; w: number; h: number; hidden: number };
export type IndexLayout = { zones: ZoneBox[]; comarcas: ComarcaBox[]; sagas: SagaBox[]; islands: IslandBox[]; extent: Extent };

const columnsFor = (key: IndexZoneKey, o: Orientation) => (o === "v" ? 3 : READER_ZONES.includes(key) ? 4 : 8);
const span = (s: IndexAtlasSaga) => (s.children.length > 0 ? 2 : 1);

/** Empaqueta `groups` (una sola sin rótulo, o las comarcas con el suyo) en una zona con
 *  origen (ox, oy). Devuelve cajas y el tamaño ocupado. */
function packZone(
  groups: Array<{ comarca: ComarcaKey | null; sagas: IndexAtlasSaga[] }>,
  cols: number, ox: number, oy: number,
  out: Pick<IndexLayout, "comarcas" | "sagas" | "islands">,
): { w: number; h: number } {
  let y = oy + ZONE_HEADER;
  let usedCols = 1;
  for (const g of groups) {
    if (g.comarca) {
      out.comarcas.push({ key: g.comarca, x: ox + ZONE_PAD, y: y + COMARCA_HEADER / 2 });
      y += COMARCA_HEADER;
    }
    let col = 0;
    let rows = g.sagas.length > 0 ? 1 : 0;
    for (const s of g.sagas) {
      const n = Math.min(span(s), cols);
      if (col + n > cols) { col = 0; rows += 1; }
      const left = ox + ZONE_PAD + col * CELL_W;
      const cx = left + CELL_W / 2;
      const cy = y + (rows - 1) * CELL_H + SAGA_H / 2;
      out.sagas.push({ id: s.id, x: cx, y: cy, scale: 1, parentId: null });
      if (s.children.length > 0) {
        out.islands.push({
          id: s.id, x: left - ISLAND_MARGIN, y: cy - SAGA_H / 2 - ISLAND_MARGIN,
          w: n * CELL_W + 2 * ISLAND_MARGIN - (CELL_W - SAGA_W) / 2, h: SAGA_H + 2 * ISLAND_MARGIN,
          hidden: Math.max(0, s.children.length - MAX_CHILDREN),
        });
        const cw = SAGA_W * CHILD_SCALE, ch = SAGA_H * CHILD_SCALE;
        const gx = left + CELL_W + 6; // arranque de la rejilla en la 2.ª celda
        s.children.slice(0, MAX_CHILDREN).forEach((c, i) => {
          out.sagas.push({
            id: c.id, scale: CHILD_SCALE, parentId: s.id,
            x: gx + (i % 2) * (cw + 6) + cw / 2,
            y: cy - SAGA_H / 2 + Math.floor(i / 2) * ch + ch / 2,
          });
        });
      }
      col += n;
      usedCols = Math.max(usedCols, col);
    }
    y += rows * CELL_H;
  }
  return { w: 2 * ZONE_PAD + usedCols * CELL_W, h: y - oy + ZONE_PAD };
}

export function layoutIndexAtlas(model: IndexAtlasModel, orientation: Orientation): IndexLayout {
  const out: IndexLayout = { zones: [], comarcas: [], sagas: [], islands: [], extent: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  let cursor = 0;
  for (const z of model.zones) {
    const groups = z.comarcas ? z.comarcas.map((c) => ({ comarca: c.key, sagas: c.sagas })) : [{ comarca: null, sagas: z.sagas }];
    const ox = orientation === "h" ? cursor : 0;
    const oy = orientation === "h" ? 0 : cursor;
    const { w, h } = packZone(groups, columnsFor(z.key, orientation), ox, oy, out);
    // En vertical todas las zonas miden lo mismo (3 columnas) aunque usen menos.
    const zw = orientation === "v" ? 2 * ZONE_PAD + 3 * CELL_W : w;
    out.zones.push({ key: z.key, x: ox, y: oy, w: zw, h });
    cursor += (orientation === "h" ? zw : h) + ZONE_GAP;
  }
  if (out.zones.length > 0) {
    out.extent = {
      minX: Math.min(...out.zones.map((b) => b.x)), minY: Math.min(...out.zones.map((b) => b.y)),
      maxX: Math.max(...out.zones.map((b) => b.x + b.w)), maxY: Math.max(...out.zones.map((b) => b.y + b.h)),
    };
  }
  return out;
}

export function zoneCentre(layout: IndexLayout, key: IndexZoneKey): Point | null {
  const z = layout.zones.find((b) => b.key === key);
  return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null;
}
