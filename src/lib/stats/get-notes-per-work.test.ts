import { describe, expect, it } from "vitest";
import { computeNotesPerWork } from "./get-notes-per-work";

describe("notas por obra", () => {
  it("normaliza por cada cien páginas, no por obra", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "1", kind: "quote", totalPages: 200 },
      { item_type: "book", item_id: "1", kind: "note", totalPages: 200 },
    ]);
    expect(r.works[0].per100).toBe(1);
  });

  it("separa citas de notas: son dos gestos distintos", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "1", kind: "quote", totalPages: 100 },
      { item_type: "book", item_id: "1", kind: "quote", totalPages: 100 },
      { item_type: "book", item_id: "1", kind: "note", totalPages: 100 },
    ]);
    expect(r.quotes).toBe(2);
    expect(r.notes).toBe(1);
  });

  it("una obra sin páginas en ficha no puede normalizarse y se dice", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "1", kind: "note", totalPages: null },
    ]);
    expect(r.works).toHaveLength(0);
    expect(r.unmeasurable).toBe(1);
  });

  it("las obras salen de más anotada a menos", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "poco", kind: "note", totalPages: 400 },
      { item_type: "book", item_id: "mucho", kind: "note", totalPages: 100 },
      { item_type: "book", item_id: "mucho", kind: "quote", totalPages: 100 },
    ]);
    expect(r.works.map((w) => w.itemId)).toEqual(["mucho", "poco"]);
  });

  it("la clave es el PAR tipo+id: la referencia es polimórfica y no hay FK", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "x", kind: "note", totalPages: 100 },
      { item_type: "movie", item_id: "x", kind: "note", totalPages: 100 },
    ]);
    // Dos obras distintas que casualmente comparten id, no una con dos notas.
    expect(r.works).toHaveLength(2);
  });

  it("solo libros: una película no tiene páginas contra las que normalizar", () => {
    const r = computeNotesPerWork([
      { item_type: "movie", item_id: "m", kind: "note", totalPages: null },
    ]);
    expect(r.works).toHaveLength(0);
    expect(r.unmeasurable).toBe(1);
    // Pero la nota SÍ se cuenta: el total de lo que escribes no depende de que
    // se pueda normalizar.
    expect(r.notes).toBe(1);
  });
});
