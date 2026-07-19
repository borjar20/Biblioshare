import { describe, expect, it } from "vitest";
import { planMembershipOps, type TreeMembershipRow } from "./apply-membership-ops";

const row = (sagaId: string, over: Partial<TreeMembershipRow> = {}): TreeMembershipRow => ({
  saga_id: sagaId,
  position: null,
  is_primary: false,
  ...over,
});

describe("planMembershipOps", () => {
  it("sin membresía previa en el árbol → insert en el destino, primary si el ítem no tiene ninguna", () => {
    const plan = planMembershipOps({ itemType: "book", itemId: "i", targetSagaId: null }, [], "root", false);
    expect(plan).toEqual({ deleteFrom: [], insert: { saga_id: "root", position: null, is_primary: true } });
  });

  it("ya está en el destino → no-op", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: "childA" },
      [row("childA", { position: 2 })],
      "childA",
      true,
    );
    expect(plan).toEqual({ deleteFrom: [], insert: null });
  });

  it("mover entre hermanas conserva position y re-promociona primary (DEFER F1)", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: "childB" },
      [row("childA", { position: 3, is_primary: true })],
      "childB",
      true,
    );
    expect(plan).toEqual({
      deleteFrom: ["childA"],
      insert: { saga_id: "childB", position: 3, is_primary: true },
    });
  });

  it("mover a directo desde hija sin primary, con primary fuera del árbol → insert sin primary", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: null },
      [row("childA", { position: 1 })],
      "root",
      true, // hasPrimaryAnywhere: la primary vive en otra saga ajena al árbol
    );
    expect(plan).toEqual({ deleteFrom: ["childA"], insert: { saga_id: "root", position: 1, is_primary: false } });
  });

  it("varias filas previas en el árbol (dato raro) → borra todas menos el destino", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: "childB" },
      [row("root"), row("childA", { is_primary: true }), row("childB", { position: 5 })],
      "childB",
      true,
    );
    expect(plan).toEqual({ deleteFrom: ["root", "childA"], insert: null });
  });
});
