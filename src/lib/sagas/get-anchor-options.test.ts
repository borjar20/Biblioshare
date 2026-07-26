import { expect, it, vi } from "vitest";

// Mock de server-only para evitar el error de módulo en tests (mismo patrón
// que get-saga-sequence.test.ts): get-anchor-options.ts importa "server-only"
// y ese paquete lanza fuera de un Server Component, incluso solo para probar
// la función pura buildAnchorOptions.
vi.mock("server-only", () => ({}));

import { buildAnchorOptions } from "./get-anchor-options";

it("una obra por clave: dos filas que repiten el mismo ítem no duplican el ancla", () => {
  const anchors = buildAnchorOptions(
    [
      { itemType: "book", itemId: "a" },
      { itemType: "book", itemId: "a" },
    ],
    new Map([["book:a", "Viento y Verdad"]]),
    [],
  );
  expect(anchors).toEqual([
    { kind: "item", itemType: "book", itemId: "a", childSagaId: null, title: "Viento y Verdad" },
  ]);
});

it("una obra sin título en catálogo (huérfana, ya no está en el árbol) no aparece como ancla", () => {
  const anchors = buildAnchorOptions([{ itemType: "book", itemId: "roto" }], new Map(), []);
  expect(anchors).toEqual([]);
});

it("cada bloque descendiente es una ancla, con su nombre", () => {
  const anchors = buildAnchorOptions([], new Map(), [{ id: "sub-1", name: "El Archivo de las Tormentas" }]);
  expect(anchors).toEqual([
    { kind: "block", itemType: null, itemId: null, childSagaId: "sub-1", title: "El Archivo de las Tormentas" },
  ]);
});

it("mezcla obras y bloques en el mismo resultado", () => {
  const anchors = buildAnchorOptions(
    [{ itemType: "movie", itemId: "m1" }],
    new Map([["movie:m1", "Nacidos Era 1"]]),
    [{ id: "sub-1", name: "El Archivo de las Tormentas" }],
  );
  expect(anchors).toEqual([
    { kind: "item", itemType: "movie", itemId: "m1", childSagaId: null, title: "Nacidos Era 1" },
    { kind: "block", itemType: null, itemId: null, childSagaId: "sub-1", title: "El Archivo de las Tormentas" },
  ]);
});
