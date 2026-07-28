import { expect, it, vi } from "vitest";

// Mock de server-only para evitar el error de módulo en tests (mismo patrón
// que revalidate.test.ts): get-saga-sequence.ts importa "server-only" y ese
// paquete lanza fuera de un Server Component, incluso solo para probar la
// función pura hydrateSequenceDraft.
vi.mock("server-only", () => ({}));

import { hydrateSequenceDraft, hydrateWindows, type RawWindowRow } from "./get-saga-sequence";
import type { DraftEntry } from "./sequence-draft";

const e = (id: string): DraftEntry => ({
  key: `i:book:${id}`, kind: "item", itemType: "book", itemId: id, childSagaId: null,
  title: id, coverUrl: null, accentColor: null, count: null, optional: false, role: null, window: null,
  ownerSagaId: "saga", isNew: false,
});

it("dos filas con el MISMO número caen en el mismo hueco: eso es el tándem", () => {
  const d = hydrateSequenceDraft([
    { entry: e("a"), position: 1, placement: "fijo" },
    { entry: e("b"), position: 2, placement: "fijo" },
    { entry: e("c"), position: 2, placement: "fijo" },
  ]);
  expect(d.slots.map((s) => s.entries.map((x) => x.itemId))).toEqual([["a"], ["b", "c"]]);
});

it("reparte por zona y ordena los huecos aunque lleguen desordenados", () => {
  const d = hydrateSequenceDraft([
    { entry: e("z"), position: 3, placement: "fijo" },
    { entry: e("a"), position: 1, placement: "fijo" },
    { entry: e("f"), position: null, placement: "libre" },
    { entry: e("u"), position: null, placement: null },
  ]);
  expect(d.slots.map((s) => s.entries[0].itemId)).toEqual(["a", "z"]);
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

const w = (fields: Partial<RawWindowRow>): RawWindowRow => ({
  item_type: null, item_id: null, child_saga_id: null,
  after_item_type: null, after_item_id: null, after_child_saga_id: null,
  before_item_type: null, before_item_id: null, before_child_saga_id: null,
  motivo: null,
  created_at: "2026-01-01T00:00:00.000Z",
  ...fields,
});

it("hidrata una ventana con las dos anclas resueltas", () => {
  const titles = new Map([
    ["i:book:a", "Nacidos Era 1"],
    ["i:book:b", "Viento y Verdad"],
  ]);
  const windows = hydrateWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "a",
        before_item_type: "book", before_item_id: "b",
      }),
    ],
    titles,
  );
  expect(windows.get("i:book:n2")).toEqual({
    after: { kind: "item", itemType: "book", itemId: "a", childSagaId: null, title: "Nacidos Era 1" },
    before: { kind: "item", itemType: "book", itemId: "b", childSagaId: null, title: "Viento y Verdad" },
    reason: null,
  });
});

it("hidrata una ventana con solo el ancla «after», apuntando a un bloque", () => {
  const titles = new Map([["s:sub-1", "El Archivo de las Tormentas"]]);
  const windows = hydrateWindows(
    [w({ item_type: "book", item_id: "n2", after_child_saga_id: "sub-1" })],
    titles,
  );
  expect(windows.get("i:book:n2")).toEqual({
    after: { kind: "block", itemType: null, itemId: null, childSagaId: "sub-1", title: "El Archivo de las Tormentas" },
    before: null,
    reason: null,
  });
});

it("un ancla que ya no resuelve (obra fuera del árbol) queda a null: no se limpia la fila entera", () => {
  const titles = new Map([["i:book:b", "Viento y Verdad"]]);
  const windows = hydrateWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "roto",
        before_item_type: "book", before_item_id: "b",
      }),
    ],
    titles,
  );
  expect(windows.get("i:book:n2")).toEqual({
    after: null,
    before: { kind: "item", itemType: "book", itemId: "b", childSagaId: null, title: "Viento y Verdad" },
    reason: null,
  });
});

it("si las dos anclas dejan de resolver, el sujeto no aparece en el mapa: window: null en el borrador", () => {
  const windows = hydrateWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "roto1",
        before_item_type: "book", before_item_id: "roto2",
      }),
    ],
    new Map(),
  );
  expect(windows.has("i:book:n2")).toBe(false);
});

// Desempate entre dos sagas HERMANAS con ventana sobre la MISMA obra
// compartida (revisión de Task 6): el unique de saga_placement_windows es
// POR SAGA, así que ambas filas pueden coexistir en BD. Gana la más antigua
// (mismo criterio que `byItem` en get-saga-detail.ts, y que resolveWindows,
// su hermana en ese fichero), y eso tiene que valer sin importar en qué
// orden lleguen las filas — se prueba pasándolas en los dos órdenes y
// comprobando que el resultado no cambia.
it("dos sagas hermanas con ventana sobre la misma obra: gana siempre la más antigua, en cualquier orden de entrada", () => {
  const titles = new Map([
    ["i:book:a", "Ancla vieja"],
    ["i:book:b", "Ancla nueva"],
  ]);
  const older = w({
    item_type: "book", item_id: "n2",
    after_item_type: "book", after_item_id: "a",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  const newer = w({
    item_type: "book", item_id: "n2",
    after_item_type: "book", after_item_id: "b",
    created_at: "2026-02-01T00:00:00.000Z",
  });
  const expected = {
    after: { kind: "item", itemType: "book", itemId: "a", childSagaId: null, title: "Ancla vieja" },
    before: null,
    reason: null,
  };

  expect(hydrateWindows([older, newer], titles).get("i:book:n2")).toEqual(expected);
  // Mismas dos filas, orden invertido: el resultado tiene que ser idéntico —
  // no puede depender del orden en que Postgres las devuelva.
  expect(hydrateWindows([newer, older], titles).get("i:book:n2")).toEqual(expected);
});

// ── Fase 3: el motivo de la ventana ──────────────────────────────────────────
it("hydrateWindows trae el motivo de la fila", () => {
  const windows = hydrateWindows(
    [w({ item_type: "book", item_id: "n2", after_item_type: "book", after_item_id: "a", motivo: "contexto" })],
    new Map([["i:book:a", "Nacidos Era 1"]]),
  );
  expect(windows.get("i:book:n2")?.reason).toBe("contexto");
});

it("una fila sin motivo hidrata a null, no a undefined", () => {
  // `undefined` sobreviviría a `toEqual` contra `{ reason: null }` en algunos
  // matchers y luego llegaría al payload como clave ausente.
  const windows = hydrateWindows(
    [w({ item_type: "book", item_id: "n2", after_item_type: "book", after_item_id: "a" })],
    new Map([["i:book:a", "Nacidos Era 1"]]),
  );
  expect(windows.get("i:book:n2")).toHaveProperty("reason", null);
});
