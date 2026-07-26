import { describe, expect, it } from "vitest";
import { planCollectionSync, type DesiredPart } from "./collection-sync";

const existing = (rows: Array<[string, number | null]>) =>
  rows.map(([item_id, position]) => ({ item_id, position }));

// Todo lo que el plan pediría escribir, sin importar si la forma de
// CollectionSyncPlan trae (o ya no trae) un campo `toUpdate`: el cast
// estructural deja que este helper siga compilando aunque el campo se haya
// retirado del tipo (la regla nueva es que ya no debería existir ninguna
// escritura de actualización).
const writes = (plan: { toInsert: DesiredPart[] } & Partial<{ toUpdate: DesiredPart[] }>) => [
  ...plan.toInsert,
  ...(plan.toUpdate ?? []),
];

describe("planCollectionSync", () => {
  it("inserta las partes que faltan con su posición", () => {
    const plan = planCollectionSync(existing([["a", 1]]), [
      { itemId: "a", position: 1 },
      { itemId: "b", position: 2 },
    ]);
    expect(plan.toInsert).toEqual([{ itemId: "b", position: 2 }]);
    expect(writes(plan)).toEqual([{ itemId: "b", position: 2 }]);
  });

  it("NO toca una fila existente aunque su posición no coincida con la deseada (la curación manual gana)", () => {
    // Antes del fix del 2026-07-26, una fila existente con la posición
    // "desfasada" entraba en toUpdate y el sync la pisaba sin condición.
    // Regresión reproducida en dev con "Matrix - Colección": curar Matrix 1
    // como libre (position=null) y luego abrir la ficha volvía a dejarlo en
    // position=1, placement=fijo.
    const plan = planCollectionSync(existing([["a", 2], ["b", null]]), [
      { itemId: "a", position: 1 },
      { itemId: "b", position: 2 },
    ]);
    expect(writes(plan)).toEqual([]);
  });

  it("NO revierte una película curada como libre (position=null) aunque TMDB traiga una posición para ella", () => {
    const plan = planCollectionSync(existing([["matrix-1", null]]), [
      { itemId: "matrix-1", position: 1 },
    ]);
    expect(writes(plan)).toEqual([]);
  });

  it("NO toca miembros manuales ajenos a la colección (no hay deletes)", () => {
    const plan = planCollectionSync(existing([["manual-extra", 99]]), [
      { itemId: "a", position: 1 },
    ]);
    expect(writes(plan)).toEqual([{ itemId: "a", position: 1 }]);
  });

  it("es no-op cuando todo coincide", () => {
    const plan = planCollectionSync(existing([["a", 1], ["b", 2]]), [
      { itemId: "a", position: 1 },
      { itemId: "b", position: 2 },
    ]);
    expect(writes(plan)).toEqual([]);
  });
});
