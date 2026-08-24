import { describe, expect, it } from "vitest";
import { shouldHideDropped, splitDropped } from "./hide-dropped";
import type { MediaStatus } from "./types";

const row = (id: string, status: MediaStatus) => ({ id, status });

const BIBLIOTECA = [
  row("a", "in_progress"),
  row("b", "dropped"),
  row("c", "completed"),
  row("d", "dropped"),
];

describe("splitDropped", () => {
  it("con hideDropped=false devuelve todo y no cuenta nada", () => {
    const { visible, hiddenDropped } = splitDropped(BIBLIOTECA, false);
    expect(visible).toHaveLength(4);
    expect(hiddenDropped).toBe(0);
  });

  it("con hideDropped=true quita SOLO los dropped y los cuenta", () => {
    const { visible, hiddenDropped } = splitDropped(BIBLIOTECA, true);
    expect(visible.map((r) => r.id)).toEqual(["a", "c"]);
    expect(hiddenDropped).toBe(2);
  });

  it("lista vacía → vacía, cero ocultos", () => {
    expect(splitDropped([], true)).toEqual({ visible: [], hiddenDropped: 0 });
  });

  it("todo abandonado → vacío, y el recuento lo explica", () => {
    const { visible, hiddenDropped } = splitDropped([row("b", "dropped")], true);
    expect(visible).toEqual([]);
    expect(hiddenDropped).toBe(1);
  });

  // Es genérico a propósito: lo usan LibraryItem[] y las filas crudas de
  // `passes` (item_type/item_id/status) de getUncollectedItems.
  it("conserva las demás propiedades de la fila", () => {
    const passes = [{ item_type: "book", item_id: "b1", status: "dropped" as MediaStatus },
                    { item_type: "movie", item_id: "m1", status: "planned" as MediaStatus }];
    const { visible } = splitDropped(passes, true);
    expect(visible).toEqual([{ item_type: "movie", item_id: "m1", status: "planned" }]);
  });
});

describe("shouldHideDropped (D5: un filtro de estado explícito manda)", () => {
  it("sin preferencia → false", () => {
    expect(shouldHideDropped({})).toBe(false);
    expect(shouldHideDropped({ hideDropped: false })).toBe(false);
  });

  it("con preferencia y sin filtro de estado → true", () => {
    expect(shouldHideDropped({ hideDropped: true })).toBe(true);
  });

  it("con preferencia y filtro ?status=dropped → false", () => {
    expect(shouldHideDropped({ hideDropped: true, status: "dropped" })).toBe(false);
  });

  it("con preferencia y CUALQUIER filtro de estado → false", () => {
    expect(shouldHideDropped({ hideDropped: true, status: "completed" })).toBe(false);
  });
});
