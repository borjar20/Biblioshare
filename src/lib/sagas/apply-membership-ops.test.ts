import { describe, expect, it } from "vitest";
import { planMembershipOps, type TreeMembershipRow } from "./apply-membership-ops";

const row = (sagaId: string, over: Partial<TreeMembershipRow> = {}): TreeMembershipRow => ({
  saga_id: sagaId,
  position: null,
  role: null,
  is_primary: false,
  ...over,
});

describe("planMembershipOps", () => {
  it("sin membresía previa en el árbol → insert en el destino, primary si el ítem no tiene ninguna", () => {
    const plan = planMembershipOps({ itemType: "book", itemId: "i", targetSagaId: null }, [], "root", false);
    expect(plan).toEqual({
      deleteFrom: [],
      insert: { saga_id: "root", position: null, role: null, is_primary: true },
      promoteTarget: false,
    });
  });

  it("ya está en el destino → no-op", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: "childA" },
      [row("childA", { position: 2 })],
      "childA",
      true,
    );
    expect(plan).toEqual({ deleteFrom: [], insert: null, promoteTarget: false });
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
      insert: { saga_id: "childB", position: 3, role: null, is_primary: true },
      promoteTarget: false,
    });
  });

  it("mover a directo desde hija sin primary, con primary fuera del árbol → insert sin primary", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: null },
      [row("childA", { position: 1 })],
      "root",
      true, // hasPrimaryAnywhere: la primary vive en otra saga ajena al árbol
    );
    expect(plan).toEqual({
      deleteFrom: ["childA"],
      insert: { saga_id: "root", position: 1, role: null, is_primary: false },
      promoteTarget: false,
    });
  });

  it("varias filas previas en el árbol (dato raro) → borra todas menos el destino", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: "childB" },
      [row("root"), row("childA", { is_primary: true }), row("childB", { position: 5 })],
      "childB",
      true,
    );
    expect(plan).toEqual({ deleteFrom: ["root", "childA"], insert: null, promoteTarget: true });
  });

  it("en destino sin primary + primary en hermana → borra la hermana y promociona el destino (Critical de revisión)", () => {
    const plan = planMembershipOps(
      { itemType: "book", itemId: "i", targetSagaId: null },
      [row("root"), row("childA", { is_primary: true })],
      "root",
      true,
    );
    expect(plan).toEqual({ deleteFrom: ["childA"], insert: null, promoteTarget: true });
  });
});

describe("rol narrativo en los movimientos de membresía (#167)", () => {
  it("arrastra el role al mover el ítem de subsaga", () => {
    const rows: TreeMembershipRow[] = [
      { saga_id: "origen", position: 3, role: "precuela", is_primary: true },
    ];

    const plan = planMembershipOps(
      { itemType: "book", itemId: "b1", targetSagaId: "destino" },
      rows,
      "destino",
      true,
    );

    // Mismo criterio que `position`: el delete+insert no puede perder el dato.
    expect(plan.insert).not.toBeNull();
    expect(plan.insert!.role).toBe("precuela");
    expect(plan.insert!.position).toBe(3);
  });

  it("deja role null si ninguna fila del árbol lo tenía", () => {
    const rows: TreeMembershipRow[] = [
      { saga_id: "origen", position: null, role: null, is_primary: false },
    ];

    const plan = planMembershipOps(
      { itemType: "book", itemId: "b1", targetSagaId: "destino" },
      rows,
      "destino",
      true,
    );

    expect(plan.insert!.role).toBeNull();
  });

  it("arrastra el role de una fila sin position (precuela sin número)", () => {
    // Fila única: rol PERO sin position. Si el código buscara el role en la
    // misma fila que trae el position (o reutilizara esa búsqueda), este caso
    // no tendría de dónde arrastrarlo y se perdería.
    const rows: TreeMembershipRow[] = [
      { saga_id: "origen", position: null, role: "precuela", is_primary: true },
    ];

    const plan = planMembershipOps(
      { itemType: "book", itemId: "b1", targetSagaId: "destino" },
      rows,
      "destino",
      true,
    );

    expect(plan.insert).not.toBeNull();
    expect(plan.insert!.role).toBe("precuela");
    expect(plan.insert!.position).toBeNull();
  });

  it("arrastra position y role cuando viven en filas distintas del árbol", () => {
    // Dos filas de origen: una trae el number, la otra trae el rol. El plan
    // debe recoger ambos aunque no coincidan en la misma fila.
    const rows: TreeMembershipRow[] = [
      { saga_id: "childA", position: 4, role: null, is_primary: false },
      { saga_id: "childB", position: null, role: "spin_off", is_primary: true },
    ];

    const plan = planMembershipOps(
      { itemType: "book", itemId: "b1", targetSagaId: "destino" },
      rows,
      "destino",
      true,
    );

    expect(plan.insert).not.toBeNull();
    expect(plan.insert!.position).toBe(4);
    expect(plan.insert!.role).toBe("spin_off");
  });
});
