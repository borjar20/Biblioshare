import { describe, expect, it } from "vitest";
import type { SagaItemRole } from "../types";
import type { AtlasModel, AtlasWork } from "./model";
import { summarize } from "./summary";

function work(i: number, extra: Partial<AtlasWork> = {}): AtlasWork {
  return {
    key: `i:book:${i}`, title: `T${i}`, href: `/libro/${i}`, coverUrl: null, state: "todo", role: null,
    optional: false, skipped: false, ownerSagaId: "root", regionKey: "r1", readingNo: i + 1,
    readingIndex: i, year: null, extra: false, window: null, tandem: null, step: null, stepNote: null,
    ...extra,
  };
}
function model(works: AtlasWork[], extra: Partial<AtlasModel> = {}): AtlasModel {
  return { works, regions: [], nowKey: null, mode: "next", nextTitle: "T1", hasItinerary: false, ...extra };
}

describe("summarize", () => {
  it("ordenNext: cuenta solo las no opcionales", () => {
    const m = model([work(0, { state: "done" }), work(1), work(2, { optional: true, state: "done" })]);
    expect(summarize(m, "orden")).toEqual({ key: "ordenNext", values: { done: 1, total: 2, title: "T1" } });
  });
  it("ordenNext: sin nextTitle cae a la primera obra no opcional", () => {
    const m = model([work(0, { optional: true }), work(1)], { nextTitle: null });
    expect(summarize(m, "orden")).toMatchObject({ key: "ordenNext", values: { title: "T1" } });
  });
  it("ordenStart usa nextTitle", () => {
    expect(summarize(model([work(0)], { mode: "start", nextTitle: "T0" }), "orden")).toEqual({
      key: "ordenStart", values: { title: "T0" },
    });
  });
  it("ordenFinished, ordenAllOptional y empty", () => {
    expect(summarize(model([work(0)], { mode: "finished" }), "orden")).toEqual({ key: "ordenFinished", values: {} });
    expect(summarize(model([work(0)], { mode: "allOptional" }), "orden")).toEqual({ key: "ordenAllOptional", values: {} });
    expect(summarize(model([], { mode: "empty" }), "orden")).toEqual({ key: "empty", values: {} });
  });
  it("rol: principal primero y luego el orden de SAGA_ITEM_ROLES, solo presentes", () => {
    const r = (role: SagaItemRole | null, i: number) => work(i, { role });
    const out = summarize(model([r(null, 0), r("spin_off", 1), r(null, 2), r("precuela", 3)]), "rol");
    expect(out.key).toBe("rol");
    if (out.key !== "rol") return;
    expect(out.counts[0]).toEqual({ role: "principal", count: 2 });
    expect(out.counts.map((c) => c.count).every((n) => n > 0)).toBe(true);
    expect(out.counts).toHaveLength(3);
  });
  it("publicacion: rango de años y obras fuera de su orden de salida", () => {
    const m = model([work(0, { year: 2000 }), work(1, { year: 1990 }), work(2, { year: 2010 }), work(3)]);
    expect(summarize(m, "publicacion")).toEqual({
      key: "publicacion", values: { from: 1990, to: 2010, outOfOrder: 2 },
    });
  });
  it("publicacion sin años", () => {
    expect(summarize(model([work(0)]), "publicacion")).toEqual({ key: "publicacionSinAnos", values: {} });
  });
});
