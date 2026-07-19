import { describe, expect, it } from "vitest";
import { planCollectionSync } from "./collection-sync";

const existing = (rows: Array<[string, number | null]>) =>
  rows.map(([item_id, position]) => ({ item_id, position }));

describe("planCollectionSync", () => {
  it("inserta las partes que faltan con su posición", () => {
    const plan = planCollectionSync(existing([["a", 1]]), [
      { itemId: "a", position: 1 },
      { itemId: "b", position: 2 },
    ]);
    expect(plan.toInsert).toEqual([{ itemId: "b", position: 2 }]);
    expect(plan.toUpdate).toEqual([]);
  });

  it("actualiza la posición de las partes que la tengan desfasada o null", () => {
    const plan = planCollectionSync(existing([["a", 2], ["b", null]]), [
      { itemId: "a", position: 1 },
      { itemId: "b", position: 2 },
    ]);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([
      { itemId: "a", position: 1 },
      { itemId: "b", position: 2 },
    ]);
  });

  it("NO toca miembros manuales ajenos a la colección (no hay deletes)", () => {
    const plan = planCollectionSync(existing([["manual-extra", 99]]), [
      { itemId: "a", position: 1 },
    ]);
    expect(plan.toInsert).toEqual([{ itemId: "a", position: 1 }]);
    expect(plan.toUpdate).toEqual([]);
  });

  it("es no-op cuando todo coincide", () => {
    const plan = planCollectionSync(existing([["a", 1], ["b", 2]]), [
      { itemId: "a", position: 1 },
      { itemId: "b", position: 2 },
    ]);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
  });
});
