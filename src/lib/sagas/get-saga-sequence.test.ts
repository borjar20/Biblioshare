import { expect, it, vi } from "vitest";

// Mock de server-only para evitar el error de módulo en tests (mismo patrón
// que revalidate.test.ts): get-saga-sequence.ts importa "server-only" y ese
// paquete lanza fuera de un Server Component, incluso solo para probar la
// función pura hydrateSequenceDraft.
vi.mock("server-only", () => ({}));

import { hydrateSequenceDraft } from "./get-saga-sequence";
import type { DraftEntry } from "./sequence-draft";

const e = (id: string): DraftEntry => ({
  key: `i:book:${id}`, kind: "item", itemType: "book", itemId: id, childSagaId: null,
  title: id, coverUrl: null, accentColor: null, count: null, optional: false, role: null, window: null,
  isNew: false,
});

it("dos filas con el MISMO número caen en el mismo hueco: eso es el tándem", () => {
  const d = hydrateSequenceDraft([
    { entry: e("a"), position: 1, placement: "fijo" },
    { entry: e("b"), position: 2, placement: "fijo" },
    { entry: e("c"), position: 2, placement: "fijo" },
  ]);
  expect(d.slots.map((s) => s.map((x) => x.itemId))).toEqual([["a"], ["b", "c"]]);
});

it("reparte por zona y ordena los huecos aunque lleguen desordenados", () => {
  const d = hydrateSequenceDraft([
    { entry: e("z"), position: 3, placement: "fijo" },
    { entry: e("a"), position: 1, placement: "fijo" },
    { entry: e("f"), position: null, placement: "libre" },
    { entry: e("u"), position: null, placement: null },
  ]);
  expect(d.slots.map((s) => s[0].itemId)).toEqual(["a", "z"]);
  expect(d.free.map((x) => x.itemId)).toEqual(["f"]);
  expect(d.unclassified.map((x) => x.itemId)).toEqual(["u"]);
});

it("un hueco con número pero placement nulo cae en «sin clasificar», no en la secuencia", () => {
  // El CHECK de BD lo impide, pero si una fila así existiera NO puede colarse
  // en la secuencia con un número que la interfaz no puede corregir.
  const d = hydrateSequenceDraft([{ entry: e("raro"), position: 7, placement: null }]);
  expect(d.slots).toEqual([]);
  expect(d.unclassified.map((x) => x.itemId)).toEqual(["raro"]);
});
