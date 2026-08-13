import { describe, expect, it } from "vitest";
import { deriveWorkProgress } from "./work-progress";

describe("deriveWorkProgress", () => {
  it("libro en curso con página y total -> etiqueta y porcentaje", () => {
    expect(deriveWorkProgress("book", "in_progress", { page: 120 }, 400)).toEqual({
      label: "Pág. 120",
      percent: 30,
    });
  });

  it("libro en curso SIN total de páginas -> etiqueta, pero el porcentaje es null, no 0", () => {
    // null significa «no se sabe»: un 0% diría que no has empezado.
    expect(deriveWorkProgress("book", "in_progress", { page: 120 }, null)).toEqual({
      label: "Pág. 120",
      percent: null,
    });
  });

  it("serie en curso -> la posición dice dónde vas; sin porcentaje", () => {
    expect(deriveWorkProgress("series", "in_progress", { season: 2, episode: 5 }, null)).toEqual({
      label: "T2E5",
      percent: null,
    });
  });

  it("película en curso -> ni etiqueta ni porcentaje (no tiene sub-posición)", () => {
    expect(deriveWorkProgress("movie", "in_progress", {}, null)).toEqual({
      label: null,
      percent: null,
    });
  });

  it("no en curso -> nada, aunque el pase guarde posición", () => {
    for (const status of ["planned", "completed", "dropped", null] as const) {
      expect(deriveWorkProgress("book", status, { page: 120 }, 400)).toEqual({
        label: null,
        percent: null,
      });
    }
  });

  it("página igual o mayor que el total -> 99%, nunca 100 estando en curso", () => {
    expect(deriveWorkProgress("book", "in_progress", { page: 400 }, 400).percent).toBe(99);
    expect(deriveWorkProgress("book", "in_progress", { page: 999 }, 400).percent).toBe(99);
  });

  it("página 1 de 500 -> 1%, no 0%", () => {
    expect(deriveWorkProgress("book", "in_progress", { page: 1 }, 500).percent).toBe(1);
  });

  it("posición basura o vacía -> no revienta", () => {
    expect(deriveWorkProgress("book", "in_progress", null, 400)).toEqual({
      label: null,
      percent: null,
    });
    expect(deriveWorkProgress("book", "in_progress", { page: "muchas" }, 400).percent).toBe(null);
  });
});
