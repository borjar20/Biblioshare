import { describe, expect, it } from "vitest";
import { getProgress } from "./progress";
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
