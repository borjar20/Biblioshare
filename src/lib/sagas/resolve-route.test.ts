import { describe, expect, it } from "vitest";
import { resolveRoute } from "./resolve-route";
import type { RawRouteEntry, RouteLookup } from "./route-types";
import type { DetailMember } from "./types";

const member = (id: string, status: DetailMember["status"] = null): DetailMember => ({
  itemType: "book",
  itemId: id,
  title: id,
  coverUrl: null,
  href: `/libro/${id}`,
  position: null,
  role: null,
  placement: null,
  optional: false,
  status,
  groupSagaId: null,
  ownerSagaId: "owner",
  year: null,
});

const entry = (over: Partial<RawRouteEntry> & { position: number }): RawRouteEntry => ({
  itemType: null,
  itemId: null,
  childSagaId: null,
  note: null,
  ...over,
});

const lookup = (over: Partial<RouteLookup> = {}): RouteLookup => ({
  members: new Map([
    ["book:a", member("a", "completed")],
    ["book:b", member("b")],
    ["book:g1", member("g1", "completed")],
    ["book:g2", member("g2")],
  ]),
  childNames: new Map([["guardia", "La Guardia"]]),
  childAccent: new Map([["guardia", "verde"]]),
  mainOrderOf: () => ["book:g1", "book:g2"],
  ...over,
});

describe("resolveRoute", () => {
  it("resuelve obras sueltas en orden de position", () => {
    const r = resolveRoute(
      [entry({ position: 2, itemType: "book", itemId: "b" }), entry({ position: 1, itemType: "book", itemId: "a" })],
      lookup(),
    );
    expect(r.steps.map((s) => (s.kind === "item" ? s.member.itemId : "?"))).toEqual(["a", "b"]);
    expect(r.total).toBe(2);
    expect(r.completed).toBe(1);
  });

  it("expande un bloque-subsaga con su orden principal", () => {
    const r = resolveRoute([entry({ position: 1, childSagaId: "guardia" })], lookup());
    expect(r.steps).toHaveLength(1);
    const step = r.steps[0];
    expect(step.kind).toBe("block");
    if (step.kind !== "block") throw new Error("esperaba bloque");
    expect(step.name).toBe("La Guardia");
    expect(step.accent).toBe("verde");
    expect(step.members.map((m) => m.itemId)).toEqual(["g1", "g2"]);
    // El bloque aporta sus DOS obras al denominador, no una.
    expect(r.total).toBe(2);
    expect(r.completed).toBe(1);
  });

  // Issue #170: en el grafo, una referencia colgante se descarta al pintar
  // pero cuenta en el denominador, así que el avance no llega nunca al 100%.
  // Aquí se descarta de LOS DOS sitios, a propósito.
  it("descarta la entrada colgante del render y del denominador", () => {
    const r = resolveRoute(
      [entry({ position: 1, itemType: "book", itemId: "a" }), entry({ position: 2, itemType: "book", itemId: "fantasma" })],
      lookup(),
    );
    expect(r.steps).toHaveLength(1);
    expect(r.total).toBe(1);
    expect(r.completed).toBe(1);
  });

  it("descarta un bloque cuya subsaga no existe", () => {
    const r = resolveRoute([entry({ position: 1, childSagaId: "inventada" })], lookup());
    expect(r.steps).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("no cuenta dos veces una obra que aparezca suelta y dentro de un bloque", () => {
    const r = resolveRoute(
      [entry({ position: 1, itemType: "book", itemId: "g1" }), entry({ position: 2, childSagaId: "guardia" })],
      lookup(),
    );
    // g1 suelta + bloque {g1, g2} => el denominador son 2 obras distintas.
    expect(r.total).toBe(2);
    expect(r.completed).toBe(1);
  });

  // Hallazgo 2 de la revisión de Task 6: una subsaga que existe pero no tiene
  // miembros (mainOrderOf devuelve []) no es lo mismo que una subsaga
  // borrada — resolveRoute ya distingue ambos casos por sí sola con
  // childNames como fuente de "existe": el bloque debe pintarse con
  // members: [] y no sumar nada al denominador. Este test confirma que
  // resolveRoute no necesitó cambios: el bug vivía en cómo route-view.tsx
  // construía childNames (desde `groups`, que omite hijas sin miembros).
  it("un bloque a una subsaga existente sin miembros se renderiza con members: [] y no infla el total", () => {
    const r = resolveRoute(
      [entry({ position: 1, childSagaId: "vacia" })],
      lookup({
        childNames: new Map([["vacia", "Subsaga Vacía"]]),
        childAccent: new Map(),
        mainOrderOf: () => [],
      }),
    );
    expect(r.steps).toHaveLength(1);
    const step = r.steps[0];
    expect(step.kind).toBe("block");
    if (step.kind !== "block") throw new Error("esperaba bloque");
    expect(step.name).toBe("Subsaga Vacía");
    expect(step.members).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.completed).toBe(0);
  });

  it("conserva la nota del paso", () => {
    const r = resolveRoute(
      [entry({ position: 1, itemType: "book", itemId: "a", note: "aquí puedes parar" })],
      lookup(),
    );
    expect(r.steps[0].note).toBe("aquí puedes parar");
  });
});
