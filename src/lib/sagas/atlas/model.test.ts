import { describe, expect, it } from "vitest";
import type { TimelineRow, TimelineSection } from "../derive-timeline";
import type { SagaGraphNode } from "../map-types";
import { deriveAtlas } from "./model";

function n(id: string, extra: Partial<SagaGraphNode> = {}): SagaGraphNode {
  return {
    id: `i:book:${id}`, kind: "item", x: 0, y: 0, level: "principal", orderNo: 0,
    label: id.toUpperCase(), accent: "terracota", status: null, role: null,
    coverUrl: `/c/${id}.jpg`, covers: [], href: `/libro/${id}`, memberCount: null,
    groupSagaId: null, groupName: null, step: null, tandem: null, windowReason: null,
    optional: false, skipped: false, ownerSagaId: "root", ...extra,
  };
}
const entry = (
  node: SagaGraphNode,
  no: number | null = null,
  branches: Array<{ node: SagaGraphNode; edgeType: "opcional" | "requisito" }> = [],
): TimelineRow => ({ kind: "entry", no, node, branches });
function sec(rows: TimelineRow[], groupSagaId: string | null = null, groupName: string | null = null, continuation = false): TimelineSection {
  return { groupSagaId, groupName, accent: "terracota", continuation, rows };
}
const base = { authenticated: true, years: new Map<string, number | null>(), steps: null };

describe("deriveAtlas", () => {
  it("orden de lectura: readingIndex consecutivo, «ahora» y regiones con estado", () => {
    const m = deriveAtlas({ ...base, sections: [
      sec([entry(n("a", { status: "completed" }), 1)], "s1", "Uno"),
      sec([entry(n("b"), 2), entry(n("c"), 3)], "s2", "Dos"),
    ] });
    expect(m.works.map((w) => [w.key, w.readingIndex, w.state, w.regionKey])).toEqual([
      ["i:book:a", 0, "done", "s1"], ["i:book:b", 1, "now", "s2"], ["i:book:c", 2, "todo", "s2"],
    ]);
    expect(m.nowKey).toBe("i:book:b");
    expect(m.regions.map((r) => [r.key, r.state, r.counted, r.completed])).toEqual([["s1", "done", 1, 1], ["s2", "current", 2, 0]]);
  });

  it("ventana: anclas, motivo y aviso salen de la fila del timeline", () => {
    const a = n("a"), b = n("b"), w = n("w", { windowReason: "contexto" });
    const row: TimelineRow = { kind: "window", no: null, node: w, after: a, before: b, reason: "contexto",
      track: { fromPct: 0, toPct: 50, youPct: 10, notice: "dentro" } };
    const m = deriveAtlas({ ...base, sections: [sec([entry(a, 1), row, entry(b, 2)])] });
    expect(m.works.find((x) => x.key === "i:book:w")?.window).toEqual({ reason: "contexto",
      afterKey: "i:book:a", beforeKey: "i:book:b", afterTitle: "A", beforeTitle: "B", notice: "dentro" });
    expect(m.works.find((x) => x.key === "i:book:a")?.window).toBeNull();
  });

  it("tándem: partnerKeys son las otras obras del hueco; mode/note de la fila", () => {
    const row: TimelineRow = { kind: "tandem", no: 2, nodes: [n("b"), n("c"), n("d")],
      mode: "simultaneo", note: "a la vez", branches: [] };
    const m = deriveAtlas({ ...base, sections: [sec([entry(n("a"), 1), row])] });
    const t = (k: string) => m.works.find((x) => x.key === k)?.tandem;
    expect(t("i:book:b")).toEqual({ mode: "simultaneo", note: "a la vez", partnerKeys: ["i:book:c", "i:book:d"] });
    expect(t("i:book:c")).toEqual({ mode: "simultaneo", note: "a la vez", partnerKeys: ["i:book:b", "i:book:d"] });
    expect(t("i:book:a")).toBeNull();
  });

  it("rol, opcional, saltada y ownerSagaId se copian del nodo", () => {
    const x = n("x", { role: "precuela", optional: true, skipped: true, ownerSagaId: "sub" });
    const m = deriveAtlas({ ...base, sections: [sec([entry(n("a"), 1), entry(x, 2)])] });
    const w = m.works.find((o) => o.key === "i:book:x");
    expect(w).toMatchObject({ role: "precuela", optional: true, skipped: true, ownerSagaId: "sub", extra: false, readingNo: 2 });
  });

  it("rama opcional (branch) → extra: true y readingNo null", () => {
    const br = n("r", { optional: true, ownerSagaId: "sub" });
    const m = deriveAtlas({ ...base, sections: [sec([entry(n("a"), 1, [{ node: br, edgeType: "opcional" }])])] });
    expect(m.works.map((w) => [w.key, w.extra, w.readingNo, w.regionKey])).toEqual([
      ["i:book:a", false, 1, "root"], ["i:book:r", true, null, "root"],
    ]);
    expect(m.works[1].ownerSagaId).toBe("sub");
  });

  it("sin sesión: ningún «now», nowKey null y mode «start»", () => {
    const m = deriveAtlas({ ...base, authenticated: false, sections: [sec([entry(n("a"), 1), entry(n("b"), 2)])] });
    expect(m.works.every((w) => w.state !== "now")).toBe(true);
    expect(m.nowKey).toBeNull();
    expect(m.mode).toBe("start");
  });

  it("steps: step/stepNote solo en las obras nombradas; hasItinerary true; year sale de years", () => {
    const sections = [sec([entry(n("a"), 1), entry(n("b"), 2), entry(n("c"), 3)])];
    const m = deriveAtlas({ sections, authenticated: true,
      years: new Map([["i:book:b", 1999], ["i:book:c", null]]),
      steps: [{ key: "i:book:c", step: 1, note: "empieza aquí" }, { key: "i:book:a", step: 2, note: null }] });
    expect(m.hasItinerary).toBe(true);
    expect(m.works.map((w) => [w.key, w.step, w.stepNote, w.year])).toEqual([
      ["i:book:a", 2, null, null], ["i:book:b", null, null, 1999], ["i:book:c", 1, "empieza aquí", null],
    ]);
    expect(deriveAtlas({ ...base, sections }).hasItinerary).toBe(false);
  });
});
