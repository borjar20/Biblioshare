import { describe, expect, it, vi } from "vitest";
import { buildWrapUp } from "./build";
import { wrapUpWindow } from "./windows";
import { emptyInputs } from "./__fixtures__/inputs";

const MONTH = wrapUpWindow("month", new Date("2026-10-01T07:00:00Z"));
const book = (id: string) => ({ type: "book" as const, id, title: id, coverUrl: `https://c/${id}`, times: 1 });

function loaders(over: Partial<ReturnType<typeof emptyInputs>>) {
  const i = emptyInputs(over);
  return {
    core: vi.fn(async () => ({ time: i.time, activeDays: i.activeDays, finished: i.finished, inProgress: i.inProgress,
      bestStreak: i.bestStreak, favoriteWeekday: i.favoriteWeekday, favoriteBandStartHour: i.favoriteBandStartHour, genres: i.genres })),
    moments: vi.fn(async () => ({ bestRated: i.bestRated, phrase: i.phrase, experience: i.experience, together: i.together, experienceDays: i.experienceDays })),
    annual: vi.fn(async () => { throw new Error("no se llama fuera del anual"); }),
    pet: vi.fn(async () => ({ name: "Nube", petClass: "bard" as const, stage: "adult" as const })),
  };
}

describe("buildWrapUp", () => {
  it("sin actividad devuelve null", async () => {
    expect(await buildWrapUp({} as never, "u", MONTH, loaders({}) as never)).toBeNull();
  });
  it("arma payload v1 con share de máx. 4 portadas y sin texto privado", async () => {
    const p = await buildWrapUp({} as never, "u", MONTH, loaders({
      activeDays: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
      time: { minutes: { book: 300, movie: 0, series: 0 }, episodesWithoutRuntime: 2, previousMinutes: 100 },
      finished: [book("a"), book("b"), book("c"), book("d"), book("e")],
      phrase: { source: "quote", body: "cita", item: null },
    }) as never);
    expect(p).toMatchObject({ v: 1, kind: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30",
      intensity: "full", narrator: "reader", palette: "book" });
    expect(p!.share).toMatchObject({ minutes: 300, episodesWithoutRuntime: 2, finished: 5, narrator: "reader" });
    expect(p!.share.covers).toHaveLength(4);
    expect(JSON.stringify(p!.share)).not.toContain("cita");
    expect(p!.pet?.name).toBe("Nube");
  });
});
