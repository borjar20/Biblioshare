import { describe, expect, it } from "vitest";
import { episodeState, firstUnwatchedIndex } from "./episode-grid";

describe("firstUnwatchedIndex", () => {
  it("apunta al primer episodio sin ver", () => {
    expect(
      firstUnwatchedIndex([
        { watched: true },
        { watched: true },
        { watched: false },
        { watched: false },
      ]),
    ).toBe(2);
  });

  // Temporada terminada: no hay a dónde saltar, se queda arriba.
  it("devuelve 0 si estan todos vistos", () => {
    expect(firstUnwatchedIndex([{ watched: true }, { watched: true }])).toBe(0);
  });

  it("devuelve 0 si no hay ninguno visto", () => {
    expect(firstUnwatchedIndex([{ watched: false }, { watched: false }])).toBe(0);
  });

  it("tolera una temporada vacia", () => {
    expect(firstUnwatchedIndex([])).toBe(0);
  });

  // Un hueco (viste el 3 pero no el 2) manda al hueco, no al final.
  it("respeta huecos", () => {
    expect(
      firstUnwatchedIndex([{ watched: true }, { watched: false }, { watched: true }]),
    ).toBe(1);
  });
});

describe("episodeState", () => {
  it("marca como visto antes lo que ya estaba al abrir", () => {
    expect(episodeState(4, new Set([4]), new Set([4]))).toBe("before");
  });

  it("marca como de esta sesion lo recien pulsado", () => {
    expect(episodeState(5, new Set([4]), new Set([4, 5]))).toBe("session");
  });

  it("marca como sin ver lo no seleccionado", () => {
    expect(episodeState(7, new Set([4]), new Set([4, 5]))).toBe("unseen");
  });

  // Desmarcar algo que ya estaba visto antes lo devuelve a "sin ver".
  it("desmarcar un visto previo lo deja sin ver", () => {
    expect(episodeState(4, new Set([4]), new Set())).toBe("unseen");
  });
});
