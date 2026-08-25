import { describe, expect, it } from "vitest";
import { computeRereads, type RereadRow } from "./get-rereads";

function row(over: Partial<RereadRow>): RereadRow {
  return {
    item_type: "book",
    item_id: "1",
    rating: 4,
    finished_on: "2026-01-01",
    ...over,
  };
}

describe("cambio de nota al releer", () => {
  it("empareja el primer pase con el último de la misma obra", () => {
    const r = computeRereads([
      row({ item_id: "1", rating: 3.5, finished_on: "2020-01-01" }),
      row({ item_id: "1", rating: 5, finished_on: "2026-01-01" }),
    ]);
    expect(r.works).toHaveLength(1);
    expect(r.works[0]).toMatchObject({ first: 3.5, latest: 5 });
    expect(r.averageChange).toBe(1.5);
  });

  it("una obra con un solo pase NO es una relectura", () => {
    expect(computeRereads([row({ item_id: "1" })]).works).toHaveLength(0);
  });

  it("una relectura sin nota en alguno de los dos pases no entra en la media", () => {
    const r = computeRereads([
      row({ item_id: "1", rating: null, finished_on: "2020-01-01" }),
      row({ item_id: "1", rating: 5, finished_on: "2026-01-01" }),
    ]);
    expect(r.works).toHaveLength(0);
    // Pero se cuenta: el denominador honesto lo necesita.
    expect(r.unratedRereads).toBe(1);
  });

  it("con tres pases compara el primero con el último, no con el del medio", () => {
    const r = computeRereads([
      row({ item_id: "1", rating: 2, finished_on: "2018-01-01" }),
      row({ item_id: "1", rating: 5, finished_on: "2020-01-01" }),
      row({ item_id: "1", rating: 4, finished_on: "2026-01-01" }),
    ]);
    expect(r.works[0]).toMatchObject({ first: 2, latest: 4 });
  });

  it("la clave es el PAR tipo+id: la referencia es polimórfica y no hay FK", () => {
    // Un libro y una película pueden compartir `item_id` sin ser la misma obra:
    // no hay clave ajena que lo impida. Agrupar solo por `item_id` las fundiría
    // en una relectura inventada.
    const r = computeRereads([
      row({ item_type: "book", item_id: "x", rating: 3, finished_on: "2020-01-01" }),
      row({ item_type: "movie", item_id: "x", rating: 5, finished_on: "2026-01-01" }),
    ]);
    expect(r.works).toHaveLength(0);
  });

  it("ordena por fecha, no por el orden en que llegan las filas", () => {
    const r = computeRereads([
      row({ item_id: "1", rating: 5, finished_on: "2026-01-01" }),
      row({ item_id: "1", rating: 2, finished_on: "2018-01-01" }),
    ]);
    expect(r.works[0]).toMatchObject({ first: 2, latest: 5 });
  });

  it("las obras salen ordenadas por cuánto cambió la nota, de más a menos", () => {
    const r = computeRereads([
      row({ item_id: "a", rating: 4, finished_on: "2020-01-01" }),
      row({ item_id: "a", rating: 4.5, finished_on: "2026-01-01" }),
      row({ item_id: "b", rating: 2, finished_on: "2020-01-01" }),
      row({ item_id: "b", rating: 5, finished_on: "2026-01-01" }),
    ]);
    expect(r.works.map((w) => w.itemId)).toEqual(["b", "a"]);
  });

  it("una relectura que NO te cambió la nota sigue siendo una relectura", () => {
    // Cero es una respuesta: «lo releí y me sigue pareciendo lo mismo». Sacarla
    // dejaría la media hablando solo de las obras que cambiaron de opinión.
    const r = computeRereads([
      row({ item_id: "1", rating: 4, finished_on: "2020-01-01" }),
      row({ item_id: "1", rating: 4, finished_on: "2026-01-01" }),
    ]);
    expect(r.works).toHaveLength(1);
    expect(r.averageChange).toBe(0);
  });

  it("sin ninguna relectura valorada, la media es null y no cero", () => {
    const r = computeRereads([row({ item_id: "1" })]);
    expect(r.averageChange).toBeNull();
  });
});
