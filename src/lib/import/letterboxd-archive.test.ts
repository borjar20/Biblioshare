import { describe, expect, it } from "vitest";
import { analyzeLetterboxdArchive } from "./letterboxd-archive";
import { zipFixture } from "./test-zip-fixture";

describe("analizar el ZIP de Letterboxd antes de confirmar", () => {
  it("usa el último registro entre dos visionados del mismo día para ratings", () => {
    const result = analyzeLetterboxdArchive(zipFixture({
      "diary.csv": "Name,Year,Letterboxd URI,Rating,Watched Date\nArrival,2016,https://boxd.it/one,3,2020-01-01\nArrival,2016,https://boxd.it/two,4,2020-01-01",
      "ratings.csv": "Name,Year,Letterboxd URI,Rating\nArrival,2016,https://boxd.it/film,4.5",
    }));
    expect(result.movies[0].passes.map((p) => p.rating)).toEqual([6, 9]);
  });
  it("previsualiza reseñas y valoraciones sin perder las notas de pases anteriores", () => {
    const analysis = analyzeLetterboxdArchive(zipFixture({
      "diary.csv": "Name,Year,Letterboxd URI,Rating,Watched Date\nArrival,2016,https://boxd.it/log1,3,2020-05-06\nArrival,2016,https://boxd.it/log2,4,2021-05-06",
      "reviews.csv": 'Name,Year,Letterboxd URI,Review,Watched Date\nArrival,2016,https://boxd.it/log2,"<p>Una reseña</p>",2021-05-06',
      "ratings.csv": "Name,Year,Letterboxd URI,Rating\nArrival,2016,https://boxd.it/a,4.5",
    }));
    expect(analysis.movies[0].passes.map((p) => p.rating)).toEqual([6, 9]);
    expect(analysis.movies[0].passes[1].review).toBe("<p>Una reseña</p>");
    expect(analysis.summary.reviews).toBe(1);
  });
  it("cruza los archivos y distingue películas, pases y pendientes", () => {
    const archive = zipFixture({
      "watched.csv": "Date,Name,Year,Letterboxd URI\n2026-07-01,Arrival,2016,https://boxd.it/a\n2026-07-01,Alien,1979,https://boxd.it/b",
      "diary.csv": "Date,Name,Year,Letterboxd URI,Rating,Watched Date\n2026-07-01,Arrival,2016,https://boxd.it/log1,4,2020-05-06",
      "watchlist.csv": "Date,Name,Year,Letterboxd URI\n2026-07-01,Arrival,2016,https://boxd.it/a",
      "likes/films.csv": "Date,Name\n2026-07-01,Arrival",
    });
    const analysis = analyzeLetterboxdArchive(archive);
    expect(analysis.summary).toEqual({ movies: 2, passes: 2, unknownDates: 1, planned: 1, reviews: 0, ratings: 1, conflicts: 0 });
    expect(analysis.excludedFiles).toEqual(["likes/films.csv"]);
    expect(analysis.movies.find((m) => m.title === "Alien")?.passes[0].finishedOn).toBeNull();
    expect(analysis.movies.find((m) => m.title === "Arrival")?.passes[0].finishedOn).toBe("2020-05-06");
  });
});


describe("identidad y archivos invalidos", () => {
  it("una URI distinta conserva otro visionado aunque tenga la misma fecha", () => {
    const result = analyzeLetterboxdArchive(zipFixture({
      "diary.csv": "Name,Year,Letterboxd URI,Watched Date\nArrival,2016,https://boxd.it/one,2020-01-01",
      "reviews.csv": "Name,Year,Letterboxd URI,Watched Date,Review\nArrival,2016,https://boxd.it/two,2020-01-01,Otra experiencia",
    }));
    expect(result.movies[0].passes).toHaveLength(2);
    expect(result.movies[0].passes[0].review).toBeNull();
    expect(result.movies[0].passes[1].review).toBe("Otra experiencia");
  });
  it("no colapsa registros sin URI y deja una resena sin identidad para revision", () => {
    const result = analyzeLetterboxdArchive(zipFixture({
      "diary.csv": "Name,Year,Letterboxd URI,Watched Date\nArrival,2016,,2020-01-01\nArrival,2016,,2020-01-01",
      "reviews.csv": "Name,Year,Letterboxd URI,Watched Date,Review\nArrival,2016,,2020-01-01,Sin identidad",
    }));
    expect(result.movies[0].passes).toHaveLength(2);
    expect(new Set(result.movies[0].passes.map((p) => p.sourceKey)).size).toBe(2);
    expect(result.conflicts).toHaveLength(1);
  });
  it("conserva una resena sin fecha para asociarla sin inventar el dia", () => {
    const result = analyzeLetterboxdArchive(zipFixture({ "reviews.csv": "Name,Year,Letterboxd URI,Review\nArrival,2016,https://boxd.it/r,Texto conservado" }));
    expect(result.movies[0].passes).toHaveLength(0);
    expect(result.conflicts[0]).toMatchObject({ finishedOn: null, review: "Texto conservado" });
  });
  it.each([
    Buffer.from("not a zip"),
    zipFixture({ "diary.csv": "Name,Year,Letterboxd URI,Watched Date\nArrival,2016,u,2020-02-31" }),
    zipFixture({ "../watched.csv": "Name,Year,Letterboxd URI\nArrival,2016,u" }),
    zipFixture({ "watched.csv": "Name,Year\nArrival,2016" }),
  ])("rechaza archivos invalidos antes de escribir", (archive) => {
    expect(() => analyzeLetterboxdArchive(archive)).toThrow();
  });
});
