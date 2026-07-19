import { describe, expect, it } from "vitest";
import { buildSagaIndex, type SagaIndexSagaRow } from "./build-saga-index";

const saga = (id: string, name: string, parent: string | null = null, accent: string | null = null): SagaIndexSagaRow => ({
  id,
  name,
  parent_saga_id: parent,
  accent_color: accent,
  cover_url: null,
});

describe("buildSagaIndex", () => {
  it("solo las raíces tienen tarjeta, en orden alfabético", () => {
    const cards = buildSagaIndex(
      [saga("u", "Zeta"), saga("v", "Alfa"), saga("c", "Hija", "u")],
      [],
    );
    expect(cards.map((c) => c.name)).toEqual(["Alfa", "Zeta"]);
    expect(cards[1].children.map((ch) => ch.name)).toEqual(["Hija"]);
  });

  it("titleCount agrega el árbol entero y deduplica la doble membresía", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("c", "Hija", "u")],
      [
        { saga_id: "u", item_type: "movie", item_id: "m1" },
        { saga_id: "c", item_type: "movie", item_id: "m2" },
        // m1 también es miembro directo de la hija: cuenta UNA vez
        { saga_id: "c", item_type: "movie", item_id: "m1" },
      ],
    );
    expect(cards[0].titleCount).toBe(2);
  });

  it("acento de chip: persistido gana; sin persistir rota la secuencia", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("a", "A", "u", "purpura"), saga("b", "B", "u")],
      [],
    );
    expect(cards[0].children[0].accent).toBe("purpura");
    expect(cards[0].children[1].accent).toBe("verde"); // SAGA_ACCENT_SEQUENCE[1]
  });

  it("children ordenados alfabéticamente aunque el input entre desordenado", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("b", "B", "u"), saga("a", "A", "u")],
      [],
    );
    expect(cards[0].children.map((c) => c.name)).toEqual(["A", "B"]);
    // Los acentos siguen la secuencia del orden final: i=0 -> A, i=1 -> B
    expect(cards[0].children[0].accent).toBe("terracota"); // SAGA_ACCENT_SEQUENCE[0]
    expect(cards[0].children[1].accent).toBe("verde"); // SAGA_ACCENT_SEQUENCE[1]
  });

  it("query filtra por nombre de la raíz o de cualquier descendiente", () => {
    const rows = [saga("u", "UCM"), saga("c", "Iron Man", "u"), saga("x", "Dune")];
    expect(buildSagaIndex(rows, [], "iron").map((c) => c.name)).toEqual(["UCM"]);
    expect(buildSagaIndex(rows, [], "dune").map((c) => c.name)).toEqual(["Dune"]);
    expect(buildSagaIndex(rows, [], "zzz")).toEqual([]);
  });

  it("huérfana (padre inexistente) se trata como raíz; un ciclo no cuelga", () => {
    expect(buildSagaIndex([saga("h", "Huérfana", "no-existe")], []).map((c) => c.name)).toEqual(["Huérfana"]);
    // a↔b: ninguna es raíz — devuelve [] sin bucle infinito
    expect(buildSagaIndex([saga("a", "A", "b"), saga("b", "B", "a")], [])).toEqual([]);
  });
});
