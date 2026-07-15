import { describe, expect, it } from "vitest";
import {
  aggregateEpisodeData,
  type EpisodeCatalogRow,
  type EpisodeWatchRow,
} from "./get-episode-data";

function ep(
  season: number,
  episode: number,
  overrides: Partial<EpisodeCatalogRow> = {}
): EpisodeCatalogRow {
  return {
    season_number: season,
    episode_number: episode,
    title: `S${season}E${episode}`,
    synopsis: null,
    still_url: null,
    air_date: null,
    runtime_minutes: null,
    ...overrides,
  };
}

function watch(
  userId: string,
  season: number,
  episode: number,
  rating: number | null = null,
  review: string | null = null,
  passId: string | null = "pass-1"
): EpisodeWatchRow {
  return {
    user_id: userId,
    season_number: season,
    episode_number: episode,
    rating,
    review,
    pass_id: passId,
  };
}

describe("aggregateEpisodeData", () => {
  it("averages community ratings per episode to one decimal", () => {
    const episodes = [ep(1, 1), ep(1, 2)];
    const watches = [
      watch("a", 1, 1, 8),
      watch("b", 1, 1, 9),
      watch("c", 1, 1, 8), // avg (8+9+8)/3 = 8.333 → 8.3
    ];
    const data = aggregateEpisodeData(episodes, watches, null, null);

    const cell = data.cells[0][0]; // fila E1, columna S1
    expect(cell?.avgRating).toBe(8.3);
    expect(cell?.ratingCount).toBe(3);
    // Episodio sin votos → media null.
    expect(data.cells[1][0]?.avgRating).toBeNull();
  });

  it("ignores watches without a rating when averaging, but still counts as watched for the owner", () => {
    const episodes = [ep(1, 1)];
    const watches = [
      watch("me", 1, 1, null, "buenísimo"), // visto, sin nota
      watch("other", 1, 1, 6),
    ];
    const data = aggregateEpisodeData(episodes, watches, "me", "pass-1");

    expect(data.cells[0][0]?.avgRating).toBe(6); // solo la nota de "other"
    expect(data.cells[0][0]?.ratingCount).toBe(1);

    const row = data.bySeasons.get(1)![0];
    expect(row.own.watched).toBe(true);
    expect(row.own.rating).toBeNull();
    expect(row.own.review).toBe("buenísimo");
    expect(row.own.seenBefore).toBe(false);
  });

  it("builds a season×episode grid with nulls for missing episodes and per-season averages", () => {
    // T1 con 2 episodios, T2 con 1 → la rejilla tiene 2 filas y 2 columnas;
    // la celda (E2, S2) no existe.
    const episodes = [ep(1, 1), ep(1, 2), ep(2, 1)];
    const watches = [watch("a", 1, 1, 10), watch("a", 1, 2, 6), watch("a", 2, 1, 8)];
    const data = aggregateEpisodeData(episodes, watches, null, null);

    expect(data.seasons).toEqual([1, 2]);
    expect(data.episodeNumbers).toEqual([1, 2]);
    expect(data.cells[1][1]).toBeNull(); // E2 de S2 no existe
    // Media T1 = (10 + 6) / 2 = 8; media T2 = 8.
    expect(data.seasonAverages).toEqual([8, 8]);
  });

  it("returns empty structures when there are no episodes", () => {
    const data = aggregateEpisodeData([], [], null, null);
    expect(data.seasons).toEqual([]);
    expect(data.episodeNumbers).toEqual([]);
    expect(data.cells).toEqual([]);
    expect(data.bySeasons.size).toBe(0);
  });

  // Tarea 8 (hub): un episodio visto en un pase QUE NO ES el activo (o en una
  // fila legado sin pase) no cuenta para el cursor, pero sí para la capa
  // "visto alguna vez" — dimmed en la UI, no la casilla marcada.
  it("separates the active-pass cursor from the ever-seen layer of a rewatch", () => {
    const episodes = [ep(1, 1), ep(1, 2)];
    const watches = [
      watch("me", 1, 1, 9, "genial", "pass-old"), // pase anterior, ya cerrado
      watch("me", 1, 2, null, null, null), // fila legado sin pase
    ];
    const data = aggregateEpisodeData(episodes, watches, "me", "pass-new");

    const [ep1, ep2] = data.bySeasons.get(1)!;
    // Ninguno está marcado en el pase NUEVO (cursor a cero tras el revisionado).
    expect(ep1.own.watched).toBe(false);
    expect(ep1.own.rating).toBeNull();
    expect(ep2.own.watched).toBe(false);
    // Pero ambos se vieron alguna vez: uno en un pase distinto, otro sin pase.
    expect(ep1.own.seenBefore).toBe(true);
    expect(ep2.own.seenBefore).toBe(true);
  });

  it("marks the current pass row as watched and keeps seenBefore false when it is the only row", () => {
    const episodes = [ep(1, 1)];
    const watches = [watch("me", 1, 1, 7, null, "pass-new")];
    const data = aggregateEpisodeData(episodes, watches, "me", "pass-new");

    const row = data.bySeasons.get(1)![0];
    expect(row.own.watched).toBe(true);
    expect(row.own.rating).toBe(7);
    expect(row.own.seenBefore).toBe(false);
  });
});
