import { describe, expect, it } from "vitest";
import type { TimelineRow, TimelineSection } from "./derive-timeline";
import type { SagaGraphNode } from "./map-types";
import { deriveShelf } from "./derive-shelf";

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
const auth = { authenticated: true };

describe("deriveShelf", () => {
  it("saga simple: la primera no leída es «ahora» y el modo es next", () => {
    const shelf = deriveShelf([sec([
      entry(n("a", { status: "completed" }), 1),
      entry(n("b"), 2),
      entry(n("c"), 3),
    ])], auth);
    expect(shelf.mode).toBe("next");
    expect(shelf.nextUp?.work.key).toBe("i:book:b");
    const states = shelf.groups[0].slots.map((s) => (s.kind === "work" ? s.work.state : null));
    expect(states).toEqual(["done", "now", "todo"]);
    expect(shelf.groups[0]).toMatchObject({ state: "current", counted: 3, completed: 1, key: "root" });
  });

  it("una obra en curso gana a la primera no leída", () => {
    const shelf = deriveShelf([sec([entry(n("a"), 1), entry(n("b", { status: "in_progress" }), 2)])], auth);
    expect(shelf.nextUp?.work.key).toBe("i:book:b");
  });

  it("universo: grupos por subsaga, estados done/current/future y grupo abierto", () => {
    const shelf = deriveShelf([
      sec([entry(n("a", { status: "completed" }), 1)], "s1", "Uno"),
      sec([entry(n("b", { status: "completed" }), 2), entry(n("c"), 3)], "s2", "Dos"),
      sec([entry(n("d"), 4)], "s3", "Tres"),
    ], auth);
    expect(shelf.groups.map((g) => [g.key, g.state])).toEqual([["s1", "done"], ["s2", "current"], ["s3", "future"]]);
    expect(shelf.openGroupKey).toBe("s2");
    expect(shelf.segments).toEqual([
      { groupKey: "s1", weight: 1, done: 1, hasNow: false },
      { groupKey: "s2", weight: 2, done: 1, hasNow: true },
      { groupKey: "s3", weight: 1, done: 0, hasNow: false },
    ]);
  });

  it("funde secciones consecutivas del mismo grupo y separa una continuación posterior", () => {
    const shelf = deriveShelf([
      sec([entry(n("a"), 1)], "s1", "Uno"),
      sec([entry(n("b"), 2)], "s1", "Uno"),
      sec([entry(n("c"), 3)], "s2", "Dos"),
      sec([entry(n("d"), 4)], "s1", "Uno", true),
    ], auth);
    expect(shelf.groups.map((g) => g.key)).toEqual(["s1", "s2", "s1#2"]);
    expect(shelf.groups[0].slots).toHaveLength(2);
  });

  it("tándem: un slot con varias obras que cuentan por separado", () => {
    const shelf = deriveShelf([sec([
      entry(n("a", { status: "completed" }), 1),
      { kind: "tandem", no: 2, nodes: [n("b"), n("c")], mode: "simultaneo", note: null, branches: [] },
    ])], auth);
    const slot = shelf.groups[0].slots[1];
    expect(slot.kind).toBe("tandem");
    expect(slot.kind === "tandem" && slot.works.map((w) => w.state)).toEqual(["now", "todo"]);
    expect(shelf.segments[0].weight).toBe(3);
  });

  it("ventana: índices de anclas, nunca es «ahora», y «encaja ahora» cuando el lector está dentro", () => {
    const a = n("a", { status: "completed" });
    const c = n("c");
    const shelf = deriveShelf([sec([
      entry(a, 1),
      { kind: "window", no: null, node: n("w"), after: a, before: c, reason: null,
        track: { fromPct: 0, toPct: 100, youPct: 50, notice: "dentro" } },
      entry(c, 2),
    ])], auth);
    const w = shelf.groups[0].slots[1];
    expect(w).toMatchObject({ kind: "window", afterTitle: "A", beforeTitle: "C", spanFrom: 0, spanTo: 2, fitsNow: true });
    expect(shelf.nextUp?.work.key).toBe("i:book:c");
    expect(shelf.nextUp?.fitsNow?.key).toBe("i:book:w");
  });

  it("ramas: las opcionales van a extras y las no opcionales siguen a su fila", () => {
    const shelf = deriveShelf([sec([
      entry(n("a"), 1, [
        { node: n("x", { optional: true, orderNo: null }), edgeType: "opcional" },
        { node: n("r", { orderNo: null }), edgeType: "requisito" },
      ]),
      entry(n("b"), 2),
    ])], auth);
    const g = shelf.groups[0];
    expect(g.extras.map((w) => w.key)).toEqual(["i:book:x"]);
    expect(g.slots.map((s) => (s.kind === "work" ? s.work.key : ""))).toEqual(["i:book:a", "i:book:r", "i:book:b"]);
  });

  it("rol y opcional con número se conservan en el slot", () => {
    const shelf = deriveShelf([sec([entry(n("a", { role: "spin_off", optional: true }), 1)])], auth);
    const s = shelf.groups[0].slots[0];
    expect(s.kind === "work" && [s.work.role, s.work.optional]).toEqual(["spin_off", true]);
  });

  it("todo leído: modo finished, sin nextUp, grupo abierto el último", () => {
    const shelf = deriveShelf([
      sec([entry(n("a", { status: "completed" }), 1)], "s1", "Uno"),
      sec([entry(n("b", { status: "completed" }), 2)], "s2", "Dos"),
    ], auth);
    expect(shelf.mode).toBe("finished");
    expect(shelf.nextUp).toBeNull();
    expect(shelf.openGroupKey).toBe("s2");
  });

  it("todo opcional: modo allOptional", () => {
    const shelf = deriveShelf([sec([entry(n("a", { optional: true }), 1)])], auth);
    expect(shelf.mode).toBe("allOptional");
  });

  it("sin sesión: nadie está en «ahora» y nextUp es la primera que cuenta", () => {
    const shelf = deriveShelf([sec([entry(n("o", { optional: true }), 1), entry(n("a"), 2), entry(n("b"), 3)])], { authenticated: false });
    expect(shelf.mode).toBe("start");
    expect(shelf.nextUp?.work.key).toBe("i:book:a");
    const states = shelf.groups[0].slots.map((s) => (s.kind === "work" ? s.work.state : null));
    expect(states).toEqual(["todo", "todo", "todo"]);
  });

  it("una obra saltada no puede ser «ahora»", () => {
    const shelf = deriveShelf([sec([entry(n("a", { optional: true, skipped: true }), 1), entry(n("b"), 2)])], auth);
    expect(shelf.nextUp?.work.key).toBe("i:book:b");
  });

  it("una obra que cuenta con salto huérfano sigue siendo «ahora» si es la única pendiente", () => {
    const shelf = deriveShelf([sec([
      entry(n("a", { status: "completed" }), 1),
      entry(n("b", { skipped: true }), 2),
    ])], auth);
    expect(shelf.mode).toBe("next");
    expect(shelf.nextUp?.work.key).toBe("i:book:b");
    expect(shelf.nextUp?.work.state).toBe("now");
  });

  it("sin secciones: modo empty", () => {
    expect(deriveShelf([], auth)).toMatchObject({ mode: "empty", groups: [], nextUp: null, openGroupKey: null });
  });

  it("pila: hasta tres portadas no nulas", () => {
    const shelf = deriveShelf([sec([entry(n("a"), 1), entry(n("b", { coverUrl: null }), 2), entry(n("c"), 3), entry(n("d"), 4), entry(n("e"), 5)])], auth);
    expect(shelf.groups[0].pileCovers).toEqual(["/c/a.jpg", "/c/c.jpg", "/c/d.jpg"]);
  });

  const win = (node: SagaGraphNode, after: SagaGraphNode | null, before: SagaGraphNode | null, notice: "dentro" | "antes" = "dentro"): TimelineRow => ({
    kind: "window", no: null, node, after, before, reason: null,
    track: { fromPct: 0, toPct: 100, youPct: 50, notice },
  });

  it("solo quedan ventanas por leer: la ventana es «ahora» y mode next implica nextUp", () => {
    const a = n("a", { status: "completed" });
    const shelf = deriveShelf([sec([entry(a, 1), win(n("w"), a, null, "antes")])], auth);
    expect(shelf.mode).toBe("next");
    expect(shelf.nextUp?.work.key).toBe("i:book:w");
    expect(shelf.nextUp?.work.state).toBe("now");
  });

  it("una ventana en curso puede ser «ahora»", () => {
    const a = n("a");
    const shelf = deriveShelf([sec([entry(a, 1), win(n("w", { status: "in_progress" }), a, null)])], auth);
    expect(shelf.nextUp?.work.key).toBe("i:book:w");
  });

  it("una ventana en curso y «dentro» es «ahora», no «encaja también»", () => {
    const a = n("a");
    const shelf = deriveShelf([sec([entry(a, 1), win(n("w", { status: "in_progress" }), a, null, "dentro")])], auth);
    expect(shelf.nextUp?.work.key).toBe("i:book:w");
    expect(shelf.nextUp?.fitsNow).toBeNull();
    const w = shelf.groups[0].slots[1];
    expect(w.kind === "window" && w.fitsNow).toBe(false);
  });

  it("solo quedan ventanas y la ventana está «dentro»: es «ahora», no «encaja también»", () => {
    const a = n("a", { status: "completed" });
    const shelf = deriveShelf([sec([entry(a, 1), win(n("w"), a, null, "dentro")])], auth);
    expect(shelf.nextUp?.work.key).toBe("i:book:w");
    expect(shelf.nextUp?.fitsNow).toBeNull();
    const w = shelf.groups[0].slots[1];
    expect(w.kind === "window" && w.fitsNow).toBe(false);
  });

  it("sin sesión, la ventana no encaja ahora", () => {
    const a = n("a");
    const shelf = deriveShelf([sec([entry(a, 1), win(n("w"), a, null)])], { authenticated: false });
    const w = shelf.groups[0].slots[1];
    expect(w.kind === "window" && w.fitsNow).toBe(false);
  });

  it("ventana cuyo tramo no es «dentro»: no encaja ahora", () => {
    const a = n("a");
    const shelf = deriveShelf([sec([entry(a, 1), win(n("w"), a, null, "antes")])], auth);
    const w = shelf.groups[0].slots[1];
    expect(w.kind === "window" && w.fitsNow).toBe(false);
  });

  it("ventana ya leída: no encaja ahora", () => {
    const a = n("a");
    const shelf = deriveShelf([sec([entry(a, 1), win(n("w", { status: "completed" }), a, null)])], auth);
    const w = shelf.groups[0].slots[1];
    expect(w.kind === "window" && w.fitsNow).toBe(false);
  });

  it("ventana con ancla en otro grupo: spanFrom null", () => {
    const a = n("a");
    const shelf = deriveShelf([
      sec([entry(a, 1)], "s1", "Uno"),
      sec([win(n("w"), a, null)], "s2", "Dos"),
    ], auth);
    const w = shelf.groups[1].slots[0];
    expect(w).toMatchObject({ kind: "window", spanFrom: null });
  });

  it("puente: slot de obra sin número", () => {
    const shelf = deriveShelf([sec([{ kind: "bridge", node: n("p") }])], auth);
    const s = shelf.groups[0].slots[0];
    expect(s.kind === "work" && s.work.no).toBeNull();
  });
});
