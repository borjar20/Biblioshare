import { describe, expect, it } from "vitest";
import { dominantType, hasAnyActivity, intensityFor, narratorFor, paletteFor, selectStories } from "./select-stories";
import { wrapUpWindow } from "./windows";
import { emptyInputs } from "./__fixtures__/inputs";

const book = (id: string, title = id) => ({ type: "book" as const, id, title, coverUrl: null, times: 1 });

const WEEK = wrapUpWindow("week", new Date("2026-10-05T07:00:00Z"));
const MONTH = wrapUpWindow("month", new Date("2026-10-01T07:00:00Z"));
const YEAR = wrapUpWindow("year", new Date("2026-12-26T09:00:00Z"));
const ids = (s: { id: string }[]) => s.map((x) => x.id);

describe("actividad e intensidad", () => {
  it("sin nada no hay actividad", () => expect(hasAnyActivity(emptyInputs())).toBe(false));
  it("un terminado sin sesiones ya es actividad", () =>
    expect(hasAnyActivity(emptyInputs({ finished: [book("a")] }))).toBe(true));
  it("semana con 1 día activo es quiet; con 2, full", () => {
    expect(intensityFor("week", emptyInputs({ activeDays: ["2026-09-29"] }))).toBe("quiet");
    expect(intensityFor("week", emptyInputs({ activeDays: ["2026-09-29", "2026-09-30"] }))).toBe("full");
  });
  it("mes con 3 días es quiet; con 4, full", () => {
    expect(intensityFor("month", emptyInputs({ activeDays: ["a", "b", "c"] }))).toBe("quiet");
    expect(intensityFor("month", emptyInputs({ activeDays: ["a", "b", "c", "d"] }))).toBe("full");
  });
  it("año con un solo día es full", () =>
    expect(intensityFor("year", emptyInputs({ activeDays: ["a"] }))).toBe("full"));
  it("año sin días activos pero con actividad es full", () =>
    expect(intensityFor("year", emptyInputs({ activeDays: [], experienceDays: 2 }))).toBe("full"));
});

describe("narradora y paleta", () => {
  const t = (book: number, movie: number, series: number) =>
    ({ minutes: { book, movie, series }, episodesWithoutRuntime: 0, previousMinutes: null });
  it("dominante solo si supera el 50 %", () => {
    expect(dominantType(t(60, 20, 20))).toBe("book");
    expect(dominantType(t(50, 50, 0))).toBeNull();
    expect(dominantType(t(0, 0, 0))).toBeNull();
  });
  it("paleta mixed cuando no hay dominante", () => {
    expect(paletteFor(t(10, 90, 0))).toBe("movie");
    expect(paletteFor(t(40, 30, 30))).toBe("mixed");
  });
  it("precedencia festive > quiet > social > dominante > explorer", () => {
    const social = emptyInputs({ time: t(90, 0, 0), together: { jointViewings: 1, clubDays: 1 }, socialDays: 2 });
    expect(narratorFor("year", "full", social)).toBe("festive");
    expect(narratorFor("month", "quiet", social)).toBe("quiet");
    expect(narratorFor("month", "full", social)).toBe("social");
    expect(narratorFor("month", "full", emptyInputs({ time: t(0, 0, 90) }))).toBe("binger");
    expect(narratorFor("month", "full", emptyInputs({ time: t(0, 90, 0) }))).toBe("cinephile");
    expect(narratorFor("month", "full", emptyInputs({ time: t(40, 30, 30), experienceDays: 1 }))).toBe("explorer");
  });
  it("social exige 2 días: un solo visionado conjunto no basta", () => {
    expect(narratorFor("month", "full", emptyInputs({ time: t(90, 0, 0), together: { jointViewings: 1, clubDays: 0 } }))).toBe("reader");
  });
  it("sin dominante ni experiencias cae en reader", () =>
    expect(narratorFor("month", "full", emptyInputs({ time: t(40, 30, 30) }))).toBe("reader"));
});

describe("selectStories", () => {
  const rich = emptyInputs({
    time: { minutes: { book: 600, movie: 120, series: 300 }, episodesWithoutRuntime: 0, previousMinutes: 500 },
    activeDays: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"],
    finished: [book("a"), book("b")],
    inProgress: [{ ...book("c"), percent: 40 }],
    bestStreak: 3, favoriteWeekday: 1, favoriteBandStartHour: 22,
    genres: [{ name: "Ciencia ficción", works: 2 }, { name: "Drama", works: 1 }],
    bestRated: { item: book("a"), rating: 10, review: "Gran libro" },
    phrase: { source: "quote", body: "Una cita", item: book("a") },
    experience: { experienceId: "x", title: "Viaje", date: "2026-09-30" },
    together: { jointViewings: 1, clubDays: 2 },
  });

  it("semana: portada, tiempo, terminadas, ritmo, UN momento y cierre", () => {
    expect(ids(selectStories(WEEK, rich))).toEqual(["cover", "time", "finished", "rhythm", "best_rated", "closing"]);
  });
  it("semana sin nota toma la frase; sin frase, la experiencia", () => {
    expect(ids(selectStories(WEEK, { ...rich, bestRated: null }))).toContain("phrase");
    expect(ids(selectStories(WEEK, { ...rich, bestRated: null, phrase: null }))).toContain("experience");
  });
  it("mes: catálogo completo en orden", () => {
    expect(ids(selectStories(MONTH, rich))).toEqual([
      "cover", "time", "finished", "in_progress", "rhythm", "genres",
      "best_rated", "phrase", "experience", "together", "closing",
    ]);
  });
  it("se calla lo que no tiene dato", () => {
    const thin = emptyInputs({ activeDays: ["2026-09-03"], finished: [book("a")] });
    expect(ids(selectStories(MONTH, thin))).toEqual(["cover", "finished", "closing"]);
  });
  it("ritmo exige 3 días; géneros exige 2", () => {
    const two = { ...rich, activeDays: ["a", "b"], genres: [{ name: "Drama", works: 3 }] };
    const s = ids(selectStories(MONTH, two));
    expect(s).not.toContain("rhythm");
    expect(s).not.toContain("genres");
  });
  it("tiempo sale con solo episodios sin duración", () => {
    const eps = emptyInputs({ activeDays: ["a"], time: { minutes: { book: 0, movie: 0, series: 0 }, episodesWithoutRuntime: 5, previousMinutes: null } });
    expect(ids(selectStories(MONTH, eps))).toContain("time");
  });
  it("año añade meses, récords, creadores, pila y mascota", () => {
    const yearly = {
      ...rich,
      pet: { name: "Nube", petClass: "bard" as const, stage: "adult" as const },
      annual: {
        months: [{ month: "2026-01", minutes: 60, works: 1 }],
        records: { busiestMonth: { month: "2026-01", minutes: 60 }, fastest: null, longestSessionMinutes: 90 },
        creators: [{ name: "Ishiguro", works: 2 }, { name: "Le Guin", works: 2 }],
        pile: { added: 10, removed: 4 },
        petYear: { adventuresWon: 3, loot: 2 },
      },
    };
    expect(ids(selectStories(YEAR, yearly))).toEqual([
      "cover", "time", "months", "finished", "rhythm", "genres", "records", "creators",
      "best_rated", "phrase", "experience", "together", "pile", "pet", "closing",
    ]);
  });
  it("año sin mascota no tiene story pet; récords vacíos se callan", () => {
    const yearly = { ...rich, annual: {
      months: [], records: { busiestMonth: null, fastest: null, longestSessionMinutes: null },
      creators: [], pile: { added: 0, removed: 0 }, petYear: { adventuresWon: 0, loot: 0 },
    } };
    const s = ids(selectStories(YEAR, yearly));
    expect(s).not.toContain("pet");
    expect(s).not.toContain("records");
    expect(s).not.toContain("pile");
    expect(s).toContain("months"); // la tira de 12 meses sale siempre en el anual
  });
});
