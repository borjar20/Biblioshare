import { describe, expect, it } from "vitest";
import type { SagaIndexCard } from "../build-saga-index";
import { deriveIndexAtlas } from "./model";
import { CHILD_SCALE, layoutIndexAtlas, MAX_CHILDREN, SAGA_H, SAGA_W, zoneCentre, type IndexLayout } from "./layout";

const card = (id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard => ({
  id, name: id, coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
  typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
  progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
  started: false, lastTouchedAt: null, ...extra,
});
const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, name: `K${i}`, accent: "beige" as const, titleCount: 1 }));

function catalog(): SagaIndexCard[] {
  return [
    card("curso", { started: true, lastTouchedAt: "2026" }),
    card("uni", { isFollowed: true, children: kids(8) }),
    card("sigo", { isFollowed: true }),
    ...Array.from({ length: 30 }, (_, i) => card(`b${i}`, { titleCount: 30 - i })),
    ...Array.from({ length: 7 }, (_, i) => card(`p${i}`, { typeBreakdown: { book: 0, movie: 2, series: 0 } })),
  ];
}

/** Ninguna pareja de portadas se toca (cajas a su escala). */
function overlaps(l: IndexLayout): string[] {
  const box = (s: IndexLayout["sagas"][number]) => ({
    x0: s.x - (SAGA_W * s.scale) / 2, x1: s.x + (SAGA_W * s.scale) / 2,
    y0: s.y - (SAGA_H * s.scale) / 2, y1: s.y + (SAGA_H * s.scale) / 2,
  });
  const out: string[] = [];
  for (let i = 0; i < l.sagas.length; i++) for (let j = i + 1; j < l.sagas.length; j++) {
    const a = box(l.sagas[i]), b = box(l.sagas[j]);
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) out.push(`${l.sagas[i].id}/${l.sagas[j].id}`);
  }
  return out;
}

describe("layoutIndexAtlas", () => {
  for (const o of ["h", "v"] as const) {
    it(`sin solapes y cada saga dentro de su zona (${o})`, () => {
      const m = deriveIndexAtlas(catalog(), true);
      const l = layoutIndexAtlas(m, o);
      expect(overlaps(l)).toEqual([]);
      for (const z of m.zones) {
        const zb = l.zones.find((b) => b.key === z.key)!;
        for (const s of z.sagas) {
          const sb = l.sagas.find((b) => b.id === s.id && b.parentId === null)!;
          expect(sb.x).toBeGreaterThan(zb.x);
          expect(sb.x).toBeLessThan(zb.x + zb.w);
          expect(sb.y).toBeGreaterThan(zb.y);
          expect(sb.y).toBeLessThan(zb.y + zb.h);
        }
      }
    });
  }

  it("horizontal: zonas de izquierda a derecha; vertical: de arriba abajo", () => {
    const m = deriveIndexAtlas(catalog(), true);
    const h = layoutIndexAtlas(m, "h").zones;
    const v = layoutIndexAtlas(m, "v").zones;
    expect(h.map((z) => z.key)).toEqual(m.zones.map((z) => z.key));
    for (let i = 1; i < h.length; i++) expect(h[i].x).toBeGreaterThan(h[i - 1].x + h[i - 1].w);
    for (let i = 1; i < v.length; i++) expect(v[i].y).toBeGreaterThan(v[i - 1].y + v[i - 1].h);
  });

  for (const o of ["h", "v"] as const) {
    it(`universo: isla con hasta 6 subsagas pequeñas y el resto contado (${o})`, () => {
      const l = layoutIndexAtlas(deriveIndexAtlas(catalog(), true), o);
      const children = l.sagas.filter((s) => s.parentId === "uni");
      expect(children).toHaveLength(MAX_CHILDREN);
      expect(children.every((c) => c.scale === CHILD_SCALE)).toBe(true);
      expect(l.islands).toEqual([expect.objectContaining({ id: "uni", hidden: 2 })]);
      // Las subsagas caen dentro de la isla y, por tanto, del ancho de la zona.
      const isl = l.islands[0];
      const zone = l.zones.find((z) => z.key === "sigues")!;
      for (const c of children) {
        const hw = (SAGA_W * c.scale) / 2, hh = (SAGA_H * c.scale) / 2;
        expect(c.x - hw).toBeGreaterThanOrEqual(isl.x);
        expect(c.x + hw).toBeLessThanOrEqual(isl.x + isl.w);
        expect(c.y - hh).toBeGreaterThanOrEqual(isl.y);
        expect(c.y + hh).toBeLessThanOrEqual(isl.y + isl.h);
        expect(c.x + hw).toBeLessThanOrEqual(zone.x + zone.w);
      }
    });
  }

  it("vertical: todas las zonas comparten x y ancho", () => {
    const zs = layoutIndexAtlas(deriveIndexAtlas(catalog(), true), "v").zones;
    expect(zs.length).toBeGreaterThan(1);
    expect(new Set(zs.map((z) => z.x)).size).toBe(1);
    expect(new Set(zs.map((z) => z.w)).size).toBe(1);
  });

  it("por descubrir: un rótulo por comarca", () => {
    const l = layoutIndexAtlas(deriveIndexAtlas(catalog(), true), "h");
    expect(l.comarcas.map((c) => c.key)).toEqual(["libros", "peliculas"]);
  });

  it("zoneCentre y extent", () => {
    const l = layoutIndexAtlas(deriveIndexAtlas(catalog(), true), "h");
    const z = l.zones.find((b) => b.key === "sigues")!;
    expect(zoneCentre(l, "sigues")).toEqual({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
    expect(zoneCentre(l, "terminadas")).toBeNull();
    expect(l.extent.minX).toBeLessThanOrEqual(Math.min(...l.zones.map((b) => b.x)));
    expect(l.extent.maxX).toBeGreaterThanOrEqual(Math.max(...l.zones.map((b) => b.x + b.w)));
  });

  it("modelo vacío: sin zonas y extent degenerado en el origen", () => {
    const l = layoutIndexAtlas(deriveIndexAtlas([], true), "h");
    expect(l).toEqual({ zones: [], comarcas: [], sagas: [], islands: [], extent: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });
  });
});
