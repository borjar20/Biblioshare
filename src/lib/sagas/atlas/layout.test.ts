import { describe, expect, it } from "vitest";
import type { SagaItemRole } from "../types";
import { COVER_H, COVER_W, layoutAtlas } from "./layout";
import type { AtlasModel, AtlasWork } from "./model";

function work(key: string, extra: Partial<AtlasWork> = {}): AtlasWork {
  return {
    key: `i:book:${key}`, title: key, href: `/libro/${key}`, coverUrl: null, state: "todo", role: null,
    optional: false, skipped: false, ownerSagaId: "root", regionKey: "r1", readingNo: null,
    readingIndex: 0, year: null, extra: false, window: null, tandem: null, step: null, stepNote: null,
    ...extra,
  };
}
// Numera readingIndex en el orden dado, como hace deriveAtlas.
function model(works: AtlasWork[], regionKeys: string[] = ["r1"]): AtlasModel {
  return {
    works: works.map((w, i) => ({ ...w, readingIndex: i })),
    regions: regionKeys.map((key) => ({ key, name: key, accent: "terracota", state: "future", counted: 0, completed: 0 })),
    nowKey: null, mode: "empezar" as AtlasModel["mode"], nextTitle: null, hasItinerary: false,
  };
}
const pos = (l: ReturnType<typeof layoutAtlas>, k: string) => l.items.find((i) => i.key === `i:book:${k}`)!;
const win = (after: string | null, before: string | null) => ({
  reason: null, afterKey: after && `i:book:${after}`, beforeKey: before && `i:book:${before}`,
  afterTitle: null, beforeTitle: null, notice: null,
});
const relato = "relato" as SagaItemRole;

const simple = model([work("a"), work("b"), work("c")]);

describe("layoutAtlas", () => {
  it("es determinista", () => {
    expect(layoutAtlas(simple, "orden", "h")).toEqual(layoutAtlas(simple, "orden", "h"));
  });

  it("orden: dos obras de fila nunca comparten posición salvo el tándem", () => {
    const m = model([
      work("a"), work("b", { tandem: { mode: null, note: null, partnerKeys: ["i:book:c"] } }),
      work("c", { tandem: { mode: null, note: null, partnerKeys: ["i:book:b"] } }), work("d"),
    ]);
    const l = layoutAtlas(m, "orden", "h");
    const [a, b, c, d] = ["a", "b", "c", "d"].map((k) => pos(l, k));
    expect([a.x, b.x, d.x]).toEqual([0, 84, 168]);
    expect(c).toMatchObject({ x: b.x + 14, y: b.y + 10 });
    expect(new Set([a, b, d].map((i) => `${i.x},${i.y}`)).size).toBe(3);
  });

  it("orden: al cambiar de región el cursor salta REGION_GAP", () => {
    const m = model([work("a"), work("b", { regionKey: "r2" })], ["r1", "r2"]);
    const l = layoutAtlas(m, "orden", "h");
    expect(pos(l, "b").x).toBe(84 + 60);
  });

  it("orden: la ventana flota entre sus anclas con un arco", () => {
    const m = model([work("a"), work("w", { window: win("a", "b") }), work("b")]);
    const l = layoutAtlas(m, "orden", "h");
    const [a, w, b] = ["a", "w", "b"].map((k) => pos(l, k));
    expect(w.x).toBe((a.x + b.x) / 2);
    expect(w.y).toBe(-130);
    expect(w.y).toBeLessThan(a.y);
    expect(l.arcs).toEqual([{ key: "i:book:w", x1: a.x, y1: a.y, x2: b.x, y2: b.y, via: { x: w.x, y: w.y } }]);
  });

  it("orden: ventana con una sola ancla va a ancla + STEP/2 y sin arco", () => {
    const m = model([work("a"), work("w", { window: win("a", null) }), work("b")]);
    const l = layoutAtlas(m, "orden", "h");
    expect(pos(l, "w").x).toBe(pos(l, "a").x + 42);
    expect(l.arcs).toEqual([]);
  });

  it("orden: ventana sin anclas va al final de su región (la última obra de fila) y sin arco", () => {
    const m = model([work("a"), work("b"), work("w", { window: win(null, null) })]);
    const l = layoutAtlas(m, "orden", "h");
    expect(pos(l, "w")).toMatchObject({ x: pos(l, "b").x, y: -130 });
    expect(l.arcs).toEqual([]);
  });

  it("orden: ventana con ancla en otra región usa el punto medio igualmente", () => {
    const m = model([work("a"), work("b", { regionKey: "r2" }), work("w", { window: win("a", "b") })], ["r1", "r2"]);
    const l = layoutAtlas(m, "orden", "h");
    expect(pos(l, "w").x).toBe((pos(l, "a").x + pos(l, "b").x) / 2);
  });

  it("orden: las extra cuelgan bajo su región a escala 0.7 desde su inicio", () => {
    const m = model([work("a"), work("b"), work("x", { extra: true }), work("y", { extra: true })]);
    const l = layoutAtlas(m, "orden", "h");
    expect(pos(l, "x")).toMatchObject({ x: 0, y: 140, scale: 0.7 });
    expect(pos(l, "y").x).toBeCloseTo(84 * 0.7);
    expect(pos(l, "a").scale).toBe(1);
  });

  it("orden: la región envuelve solo las obras de fila", () => {
    const m = model([work("a"), work("b"), work("w", { window: win("a", "b") }), work("x", { extra: true })]);
    const l = layoutAtlas(m, "orden", "h");
    expect(l.regions).toEqual([{
      key: "r1", x: -COVER_W / 2 - 24, y: -COVER_H / 2 - 24, w: 84 + COVER_W + 48, h: COVER_H + 48,
    }]);
  });

  it("orden: v intercambia los ejes", () => {
    const m = model([work("a"), work("b", { regionKey: "r2" }), work("w", { window: win("a", "b") })], ["r1", "r2"]);
    const h = layoutAtlas(m, "orden", "h"), v = layoutAtlas(m, "orden", "v");
    expect(v.items.map((i) => [i.x, i.y])).toEqual(h.items.map((i) => [i.y, i.x]));
    expect(v.regions.map((r) => [r.x, r.y, r.w, r.h])).toEqual(h.regions.map((r) => [r.y, r.x, r.h, r.w]));
    expect(v.islands.map((i) => [i.x, i.y, i.r])).toEqual(h.islands.map((i) => [i.y, i.x, i.r]));
    expect(v.arcs[0]).toEqual({
      key: h.arcs[0].key, x1: h.arcs[0].y1, y1: h.arcs[0].x1, x2: h.arcs[0].y2, y2: h.arcs[0].x2,
      via: { x: h.arcs[0].via.y, y: h.arcs[0].via.x },
    });
    // El extent se calcula con la orientación final (las portadas no se giran): contiene todos los centros.
    for (const i of v.items) {
      expect(i.x).toBeGreaterThan(v.extent.minX);
      expect(i.x).toBeLessThan(v.extent.maxX);
      expect(i.y).toBeGreaterThan(v.extent.minY);
      expect(i.y).toBeLessThan(v.extent.maxY);
    }
  });

  it("orden: islas solo con dos o más regiones", () => {
    expect(layoutAtlas(simple, "orden", "h").islands).toEqual([]);
    const m = model([work("a"), work("b", { regionKey: "r2" }), work("c", { regionKey: "r2" })], ["r1", "r2"]);
    const l = layoutAtlas(m, "orden", "h");
    expect(l.islands).toHaveLength(2);
    const r2 = l.regions.find((r) => r.key === "r2")!;
    expect(l.islands[1]).toEqual({ key: "r2", x: r2.x + r2.w / 2, y: r2.y + r2.h / 2, r: 30 * Math.sqrt(2) });
  });

  const rolModel = model([work("a"), work("r", { role: relato }), work("b"), work("s", { role: relato })]);

  it("rol: solo carriles de roles presentes, principal primero", () => {
    const l = layoutAtlas(rolModel, "rol", "h");
    expect(l.guides.map((g) => g.key)).toEqual(["principal", "relato"]);
    expect(l.guides.every((g) => g.kind === "lane" && g.x === -84)).toBe(true);
    expect(l.guides.map((g) => g.y)).toEqual([0, 150]);
    expect(pos(l, "r")).toMatchObject({ x: 84, y: 150 });
    expect(pos(l, "b")).toMatchObject({ x: 168, y: 0 });
  });

  it("rol: hilo de cada obra con rol a la principal anterior; sin principal anterior, sin hilo", () => {
    const l = layoutAtlas(rolModel, "rol", "h");
    expect(l.threads).toEqual([
      { kind: "rol", keys: ["i:book:a", "i:book:r"] },
      { kind: "rol", keys: ["i:book:b", "i:book:s"] },
    ]);
    const sinPrincipal = model([work("r", { role: relato }), work("a")]);
    expect(layoutAtlas(sinPrincipal, "rol", "h").threads).toEqual([]);
  });

  const pubModel = model([
    work("a", { year: 2001 }), work("b", { year: 1999 }), work("c", { year: 2001 }), work("d"),
  ]);

  it("publicación: misma columna para el mismo año y columna «sin-año» al final", () => {
    const l = layoutAtlas(pubModel, "publicacion", "h");
    const xa = 1.3 * 84;
    expect(pos(l, "b")).toMatchObject({ x: 0, y: 0 });
    expect(pos(l, "a")).toMatchObject({ x: xa, y: 0 });
    expect(pos(l, "c")).toMatchObject({ x: xa, y: -(COVER_H + 16) });
    expect(pos(l, "d")).toMatchObject({ x: 2 * xa + 84, y: 0 });
    expect(l.guides).toEqual([
      { kind: "tick", key: "1999", x: 0, y: 70 },
      { kind: "tick", key: "2001", x: xa, y: 70 },
      { kind: "tick", key: "sin-año", x: 2 * xa + 84, y: 70 },
    ]);
  });

  it("publicación: un hilo con todas las claves por readingIndex", () => {
    const l = layoutAtlas(pubModel, "publicacion", "h");
    expect(l.threads).toEqual([{ kind: "publicacion", keys: ["a", "b", "c", "d"].map((k) => `i:book:${k}`) }]);
  });

  it("extent: caja de items, arcos e islas más 40 de margen", () => {
    const l = layoutAtlas(simple, "orden", "h");
    expect(l.extent).toEqual({ minX: -30 - 40, minY: -45 - 40, maxX: 168 + 30 + 40, maxY: 45 + 40 });
  });

  it("modelo vacío no revienta", () => {
    expect(() => layoutAtlas(model([]), "orden", "h")).not.toThrow();
  });
});
