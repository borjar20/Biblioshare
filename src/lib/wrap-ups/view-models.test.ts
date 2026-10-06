import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import messages from "../../../messages/es.json";
import { narratorLine } from "./narrator-copy";
import { formatHours, periodLabel, posterFor } from "./view-models";
import type { ItemRef, NarratorVariant, Story, WrapUpPayload } from "./types";

const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}|${JSON.stringify(v)}` : k);
const base = { v: 1, kind: "week", periodStart: "2026-09-29", periodEnd: "2026-10-05", intensity: "full",
  narrator: "reader", palette: "book", pet: null, stories: [], share: {} } as unknown as WrapUpPayload;

describe("periodLabel", () => {
  it("semana", () => expect(periodLabel(base)).toBe("Semana del 29 sep al 5 oct"));
  it("mes", () => expect(periodLabel({ ...base, kind: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30" })).toBe("Septiembre 2026"));
  it("año declara el corte", () => expect(periodLabel({ ...base, kind: "year", periodStart: "2026-01-01", periodEnd: "2026-12-25" })).toBe("Tu 2026 · hasta el 25 de diciembre"));
  it("año completo no declara corte", () => expect(periodLabel({ ...base, kind: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31" })).toBe("Tu 2026"));
});

describe("formatHours", () => {
  it("menos de una hora en minutos", () => expect(formatHours(45)).toEqual({ value: "45", unit: "min" }));
  it("horas redondeadas con coma", () => expect(formatHours(95)).toEqual({ value: "1,6", unit: "h" }));
  it("muchas horas sin decimales", () => expect(formatHours(31 * 60 + 10)).toEqual({ value: "31", unit: "h" }));
});

describe("posterFor time", () => {
  it("sin periodo anterior no escribe variación", () => {
    const m = posterFor({ id: "time", minutes: { book: 120, movie: 0, series: 0 }, episodesWithoutRuntime: 0, previousMinutes: null }, base, t);
    expect(m.layout).toBe("figure");
    expect(m.lines.some((l) => l.includes("delta"))).toBe(false);
  });
  it("con anterior, variación con unidad y periodo", () => {
    const m = posterFor({ id: "time", minutes: { book: 240, movie: 0, series: 0 }, episodesWithoutRuntime: 3, previousMinutes: 120 }, base, t);
    expect(m.lines.join("\n")).toContain('wrapUps.stories.time.delta|{"sign":"+","value":"2","unit":"h","period":"week"}');
    expect(m.lines.join("\n")).toContain("episodesWithoutRuntime");
  });
  it("desglose por tipo con glifos, solo tipos con tiempo", () => {
    const m = posterFor({ id: "time", minutes: { book: 120, movie: 0, series: 30 }, episodesWithoutRuntime: 0, previousMinutes: null }, base, t);
    expect(m.lines[0]).toBe("● 2 h · ▲ 30 min");
  });
});

describe("posterFor rhythm", () => {
  const r = { id: "rhythm", activeDays: 3, bestStreak: 1, favoriteWeekday: null, favoriteBandStartHour: null } as const;
  it("anual (days vacío) no lleva tira", () => {
    const m = posterFor({ ...r, days: [] }, { ...base, kind: "year" }, t);
    expect(m.strip).toBeUndefined();
  });
  it("sin racha de 2+ no la menciona", () => {
    const m = posterFor({ ...r, days: [{ date: "2026-09-29", active: true }] }, base, t);
    expect(m.lines.join("\n")).not.toContain("streak");
    expect(m.strip).toEqual([{ label: "M", value: "29 sep", active: true }]);
  });
});

// --- Recorrido completo con los textos REALES -------------------------------
const item = (n: number): ItemRef => ({ type: "book", id: `i${n}`, title: `Obra ${n}`, coverUrl: null, times: 1 });
const stories: Story[] = [
  { id: "cover" },
  { id: "time", minutes: { book: 300, movie: 90, series: 60 }, episodesWithoutRuntime: 2, previousMinutes: 200 },
  { id: "time", minutes: { book: 60, movie: 0, series: 0 }, episodesWithoutRuntime: 0, previousMinutes: 300 },
  { id: "time", minutes: { book: 60, movie: 0, series: 0 }, episodesWithoutRuntime: 0, previousMinutes: 60 },
  { id: "finished", items: [item(1), item(2)], total: 5 },
  { id: "in_progress", items: [{ ...item(1), percent: 40 }, { ...item(2), percent: null }] },
  { id: "rhythm", days: [{ date: "2026-09-29", active: true }, { date: "2026-09-30", active: false }], activeDays: 5, bestStreak: 3, favoriteWeekday: 2, favoriteBandStartHour: 22 },
  { id: "genres", top: [{ name: "Fantasía", works: 1 }, { name: "Ensayo", works: 3 }] },
  { id: "best_rated", item: item(1), rating: 9, review: "Me encantó" },
  { id: "best_rated", item: item(1), rating: 7, review: null },
  { id: "phrase", source: "quote", body: "Hola", item: item(1) },
  { id: "phrase", source: "note", body: "Hola", item: null },
  { id: "experience", experienceId: "e", title: "Cine al aire libre", date: "2026-09-12" },
  { id: "together", jointViewings: 2, clubDays: 1 },
  { id: "months", months: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, minutes: i * 60, works: i })) },
  { id: "records", busiestMonth: { month: "2026-03", minutes: 600 }, fastest: { item: item(1), days: 2 }, longestSessionMinutes: 180 },
  { id: "creators", top: [{ name: "Ursula", works: 2 }] },
  { id: "pile", added: 7, removed: 3 },
  { id: "pet", stage: "adult", adventuresWon: 4, loot: 9 },
  { id: "closing" },
];
const variants: NarratorVariant[] = ["reader", "cinephile", "binger", "explorer", "social", "quiet", "festive"];

describe("textos reales en español", () => {
  const tr = createTranslator({ locale: "es", messages });
  const real = (k: string, v?: Record<string, string | number>) => tr(k as never, v as never);
  const year = { ...base, kind: "year", periodStart: "2026-01-01", periodEnd: "2026-12-25",
    pet: { name: "Bellota", petClass: "SAB", stage: "adult" },
    share: { minutes: 450, episodesWithoutRuntime: 2, finished: 5, covers: [item(1)] } } as unknown as WrapUpPayload;

  it("ningún póster ni frase deja una clave sin resolver", () => {
    const out: string[] = [];
    for (const v of variants) for (const p of [{ ...year, narrator: v }, { ...base, narrator: v, share: year.share }]) {
      for (const s of stories) {
        const m = posterFor(s, p, real);
        out.push(m.eyebrow, m.narratorLine, narratorLine(s, p, real), ...m.lines,
          ...(m.figure ? [m.figure.value, m.figure.unit] : []),
          ...(m.ranking ?? []).flatMap((r) => [r.label, r.value]),
          ...(m.strip ?? []).flatMap((x) => [x.label, x.value]),
          ...(m.quote ? [m.quote.body, m.quote.attribution ?? ""] : []));
      }
    }
    expect(out.length).toBeGreaterThan(100);
    for (const s of out) {
      expect(s).not.toMatch(/wrapUps\./);
      expect(s).not.toMatch(/[{}]|undefined|NaN/);
    }
  });

  it("variación negativa e igual dicen dirección y periodo", () => {
    const down = posterFor(stories[2], base, real).lines.join(" ");
    expect(down).toContain("4 h menos que la semana anterior");
    const same = posterFor(stories[3], base, real).lines.join(" ");
    expect(same).toContain("Igual que la semana anterior");
  });
});
