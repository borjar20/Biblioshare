import { expect, it } from "vitest";
import { resolveWindows } from "./get-saga-detail";
import type { RawWindowRow } from "./get-saga-sequence";

// Mismo helper que get-saga-sequence.test.ts: una fila cruda de
// saga_placement_windows con todas las columnas a null salvo las que se pasen.
const w = (fields: Partial<RawWindowRow>): RawWindowRow => ({
  item_type: null, item_id: null, child_saga_id: null,
  after_item_type: null, after_item_id: null, after_child_saga_id: null,
  before_item_type: null, before_item_id: null, before_child_saga_id: null,
  ...fields,
});

it("resuelve una ventana con las dos anclas: la frase entera", () => {
  const titles = new Map([
    ["i:book:a", "Nacidos de la Bruma Era 1"],
    ["i:book:b", "Viento y Verdad"],
  ]);
  const windows = resolveWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "a",
        before_item_type: "book", before_item_id: "b",
      }),
    ],
    titles,
  );
  expect(windows["i:book:n2"]).toEqual({
    afterTitle: "Nacidos de la Bruma Era 1",
    beforeTitle: "Viento y Verdad",
  });
});

it("resuelve una ventana con una sola ancla («after»), apuntando a un bloque", () => {
  const titles = new Map([["s:sub-1", "El Archivo de las Tormentas"]]);
  const windows = resolveWindows(
    [w({ item_type: "book", item_id: "n2", after_child_saga_id: "sub-1" })],
    titles,
  );
  expect(windows["i:book:n2"]).toEqual({ afterTitle: "El Archivo de las Tormentas", beforeTitle: null });
});

it("resuelve una ventana con una sola ancla («before»), sujeto bloque", () => {
  const titles = new Map([["i:book:b", "Viento y Verdad"]]);
  const windows = resolveWindows(
    [w({ child_saga_id: "sub-1", before_item_type: "book", before_item_id: "b" })],
    titles,
  );
  expect(windows["s:sub-1"]).toEqual({ afterTitle: null, beforeTitle: "Viento y Verdad" });
});

it("un ancla que ya no resuelve (fuera del subárbol cargado) queda a null: no se limpia la fila entera", () => {
  const titles = new Map([["i:book:b", "Viento y Verdad"]]);
  const windows = resolveWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "roto",
        before_item_type: "book", before_item_id: "b",
      }),
    ],
    titles,
  );
  expect(windows["i:book:n2"]).toEqual({ afterTitle: null, beforeTitle: "Viento y Verdad" });
});

it("si las dos anclas dejan de resolver, el sujeto no aparece en el resultado: ninguna línea", () => {
  const windows = resolveWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "roto1",
        before_item_type: "book", before_item_id: "roto2",
      }),
    ],
    new Map(),
  );
  expect(Object.hasOwn(windows, "i:book:n2")).toBe(false);
});

it("una fila sin ningún sujeto reconocible (imposible en BD por el CHECK) se descarta en silencio", () => {
  const windows = resolveWindows([w({})], new Map());
  expect(Object.keys(windows)).toHaveLength(0);
});
