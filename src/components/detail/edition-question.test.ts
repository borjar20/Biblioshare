import { describe, expect, it } from "vitest";
import { shouldAskForEdition } from "./edition-question";

// Caso base: libro recién añadido, pase sin edición, nada contestado.
const base = {
  itemType: "book" as const,
  editionCount: 0,
  passEditionId: null as string | null,
  answered: false,
};

describe("shouldAskForEdition", () => {
  it("libro SIN ninguna edición en la ficha: se pregunta igual", () => {
    // Es el caso normal desde que murió el sync masivo (Tarea 10) y el que
    // más necesita el escaneo del ISBN y las candidatas de OpenLibrary.
    expect(shouldAskForEdition({ ...base, editionCount: 0 })).toBe(true);
  });

  it("libro con UNA sola edición: se pregunta (el umbral viejo lo tapaba)", () => {
    expect(shouldAskForEdition({ ...base, editionCount: 1 })).toBe(true);
  });

  it("libro con varias ediciones: se pregunta, como siempre", () => {
    expect(shouldAskForEdition({ ...base, editionCount: 7 })).toBe(true);
  });

  it("película con menos de dos versiones: NO se pregunta", () => {
    // Sin ISBN ni obra en OpenLibrary, con una sola versión no hay respuesta
    // posible que dar.
    expect(shouldAskForEdition({ ...base, itemType: "movie", editionCount: 0 })).toBe(false);
    expect(shouldAskForEdition({ ...base, itemType: "movie", editionCount: 1 })).toBe(false);
  });

  it("película con dos versiones o más: sí se pregunta", () => {
    expect(shouldAskForEdition({ ...base, itemType: "movie", editionCount: 2 })).toBe(true);
  });

  it("serie: nunca se pregunta, tenga las ediciones que tenga", () => {
    expect(shouldAskForEdition({ ...base, itemType: "series", editionCount: 9 })).toBe(false);
  });

  it("el pase ya tiene edición: no se vuelve a preguntar", () => {
    expect(shouldAskForEdition({ ...base, editionCount: 5, passEditionId: "ed-1" })).toBe(false);
  });

  it("ya contestado (incluido «No lo sé»): no se insiste", () => {
    expect(shouldAskForEdition({ ...base, editionCount: 5, answered: true })).toBe(false);
  });

  it("«ya contestado» gana también en el caso nuevo del libro sin ediciones", () => {
    expect(shouldAskForEdition({ ...base, editionCount: 0, answered: true })).toBe(false);
  });
});
