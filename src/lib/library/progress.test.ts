import { describe, expect, it } from "vitest";
import { getProgress, passPercent } from "./progress";
import type { LibraryItem } from "./types";

// Base mínima: getProgress solo mira tipo, posición y los dos contadores.
function item(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    entryId: "p1",
    itemId: "i1",
    itemType: "series",
    status: "in_progress",
    rating: null,
    position: {},
    notes: null,
    title: "T",
    coverUrl: null,
    subtitle: null,
    publisher: null,
    pageCount: null,
    totalEpisodes: null,
    watchedEpisodes: null,
    rereadCount: 0,
    pinnedOrder: null,
    activePassId: "p1",
    ...overrides,
  } as LibraryItem;
}

describe("getProgress · serie (#715)", () => {
  it("cuenta episodios VISTOS, no el número de episodio dentro de la temporada", () => {
    // T3E2 de una serie de 60: la posición dice "episode: 2" porque va
    // numerada por temporada. Antes salía «2/60» (3 %); lo real es 22 vistos.
    const progress = getProgress(
      item({
        position: { season: 3, episode: 2 },
        totalEpisodes: 60,
        watchedEpisodes: 22,
      }),
    );

    expect(progress).toEqual({ current: 22, total: 60, label: "22/60" });
  });

  it("no inventa progreso cuando no hay episodios vistos en este pase", () => {
    expect(
      getProgress(
        item({ position: { season: 1, episode: 4 }, totalEpisodes: 60, watchedEpisodes: 0 }),
      ),
    ).toBeNull();
  });

  it("sin total de episodios no hay barra", () => {
    expect(
      getProgress(item({ totalEpisodes: null, watchedEpisodes: 5 })),
    ).toBeNull();
  });
});

describe("getProgress · libro (sin cambios)", () => {
  it("sigue usando página / total de páginas", () => {
    expect(
      getProgress(
        item({ itemType: "book", position: { page: 120 }, pageCount: 300, watchedEpisodes: null }),
      ),
    ).toEqual({ current: 120, total: 300, label: "120/300" });
  });
});

describe("passPercent", () => {
  // El caso que dio origen al helper: el destacado de Inicio anunciaba «100 %»
  // sobre un pase al que le quedaba una página, mientras el feed de al lado
  // mostraba el mismo título como FINALIZADO.
  it("no redondea hacia arriba hasta 100", () => {
    expect(passPercent(668, 669)).toBe(99);
    expect(passPercent(999, 1000)).toBe(99);
    expect(passPercent(59, 60)).toBe(98);
  });

  it("reserva el 100 para el final alcanzado", () => {
    expect(passPercent(669, 669)).toBe(100);
    // Una edición más corta que la del pase puede pasarse del total.
    expect(passPercent(700, 669)).toBe(100);
  });

  it("no dice 0 % habiendo empezado", () => {
    expect(passPercent(1, 669)).toBe(1);
    expect(passPercent(3, 1000)).toBe(1);
  });

  it("0 y totales imposibles dan 0", () => {
    expect(passPercent(0, 669)).toBe(0);
    expect(passPercent(10, 0)).toBe(0);
    expect(passPercent(-5, 100)).toBe(0);
  });

  it("trunca, no redondea, en el tramo intermedio", () => {
    // 50.9 % era 51 con Math.round; el cursor nunca debe adelantar al lector.
    expect(passPercent(509, 1000)).toBe(50);
    expect(passPercent(120, 300)).toBe(40);
  });
});
