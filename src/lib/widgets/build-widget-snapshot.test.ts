import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library/types";
import type { TodayPass } from "@/lib/stats/get-today-focus";
import { compareTodayPasses } from "@/lib/stats/get-today-focus";
import {
  buildDailyGoalData,
  buildInProgress,
  buildWidgetSnapshot,
  snapshotFingerprint,
} from "./build-widget-snapshot";
import { WIDGET_SCHEMA_VERSION } from "./types";

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    entryId: "entry-1",
    itemId: "item-1",
    itemType: "book",
    status: "in_progress",
    rating: null,
    position: {},
    notes: null,
    title: "Dune",
    coverUrl: "https://covers.example/dune.jpg",
    subtitle: "Frank Herbert",
    publisher: null,
    pageCount: null,
    totalEpisodes: null,
    rereadCount: 0,
    pinnedOrder: null,
    activePassId: "pass-1",
    ...overrides,
  };
}

function pass(overrides: Partial<TodayPass> = {}): TodayPass {
  return {
    item: item(),
    startedOn: "2026-08-01",
    lastSessionDate: "2026-08-04",
    noteCount: 0,
    dayNumber: 5,
    streakDays: 3,
    week: [],
    ...overrides,
  };
}

describe("compareTodayPasses (selección del pase del widget)", () => {
  it("gana la sesión más reciente", () => {
    const a = pass({ lastSessionDate: "2026-08-04" });
    const b = pass({ lastSessionDate: "2026-08-01" });
    expect([b, a].sort(compareTodayPasses)[0]).toBe(a);
  });

  it("sin sesión va al final aunque el pase sea más nuevo", () => {
    const touched = pass({ lastSessionDate: "2026-07-01", startedOn: "2026-06-01" });
    const untouched = pass({ lastSessionDate: null, startedOn: "2026-08-04" });
    expect([untouched, touched].sort(compareTodayPasses)[0]).toBe(touched);
  });

  it("empate de sesión: desempata el pase abierto más recientemente", () => {
    const older = pass({ startedOn: "2026-07-01" });
    const newer = pass({ startedOn: "2026-08-03" });
    expect([older, newer].sort(compareTodayPasses)[0]).toBe(newer);
  });

  it("empate total: orden estable por título", () => {
    const a = pass({ item: item({ title: "Arrakis" }) });
    const z = pass({ item: item({ title: "Zothique" }) });
    expect([z, a].sort(compareTodayPasses)[0]).toBe(a);
  });
});

// `buildCurrentProgressData` (pase único, campos currentValue/totalValue/statusLabel) fue
// reemplazado por `buildInProgress` (lista, nthLabel/contextLabel/week/kindLabel) — ver el
// describe("buildInProgress", ...) más abajo, que cubre el equivalente v2 de estos casos
// (progreso con/sin total, deep link a sesión vs. ficha, notas).

describe("buildDailyGoalData", () => {
  const base = { date: "2026-08-05", todayMinutes: 32, streak: 12 };

  it("sin objetivo configurado devuelve null", () => {
    expect(buildDailyGoalData({ ...base, goalMinutes: null })).toBeNull();
    expect(buildDailyGoalData({ ...base, goalMinutes: 0 })).toBeNull();
  });

  it("en marcha: porcentaje, etiqueta y minutos restantes", () => {
    const data = buildDailyGoalData({ ...base, goalMinutes: 40 });
    expect(data).toMatchObject({
      percentage: 80,
      progressLabel: "32 / 40 min",
      message: "Te quedan 8 minutos",
      completed: false,
      streak: 12,
      goalType: "minutes",
      date: "2026-08-05",
    });
  });

  it("completado exacto", () => {
    const data = buildDailyGoalData({ ...base, todayMinutes: 40, goalMinutes: 40 });
    expect(data?.completed).toBe(true);
    expect(data?.message).toBe("Objetivo completado");
    expect(data?.percentage).toBe(100);
  });

  it("sobrepasado: el porcentaje se queda en 100", () => {
    const data = buildDailyGoalData({ ...base, todayMinutes: 90, goalMinutes: 40 });
    expect(data?.percentage).toBe(100);
    expect(data?.currentValue).toBe(90);
    expect(data?.completed).toBe(true);
  });

  it("sin actividad hoy", () => {
    const data = buildDailyGoalData({ ...base, todayMinutes: 0, goalMinutes: 40 });
    expect(data?.message).toBe("Aún no has registrado progreso hoy");
    expect(data?.percentage).toBe(0);
  });
});

function bookPass(over: Partial<TodayPass> = {}): TodayPass {
  return {
    item: {
      entryId: "e1", activePassId: "p1", itemType: "book", itemId: "b1",
      title: "Salitre y Cenizas", subtitle: "Carlos de Traspe", coverUrl: null,
      status: "in_progress", position: { page: 60 } as never, pageCount: 240,
      rereadCount: 0, pinnedOrder: null,
    } as never,
    startedOn: "2026-08-02", lastSessionDate: "2026-08-05", noteCount: 1,
    dayNumber: 4, streakDays: 3,
    week: [
      { date: "2026-07-30", active: false }, { date: "2026-07-31", active: false },
      { date: "2026-08-01", active: false }, { date: "2026-08-02", active: true },
      { date: "2026-08-03", active: true }, { date: "2026-08-04", active: true },
      { date: "2026-08-05", active: true },
    ],
    ...over,
  };
}

describe("buildInProgress", () => {
  it("primer pase: ordinal, contexto, semana y kind", () => {
    const [d] = buildInProgress([bookPass()]);
    expect(d.nthLabel).toBe("1.ª lectura");
    expect(d.contextLabel).toBe("Día 4 · desde 2/8 · 1 nota");
    expect(d.kindLabel).toBe("Libro");
    expect(d.percentage).toBe(25);
    expect(d.week[6]).toEqual({ active: true, today: true });
    expect(d.week[0]).toEqual({ active: false, today: false });
  });

  it("relectura: ordinal +1 y notas en plural; sin progreso → 'Sin progreso'", () => {
    const p = bookPass({
      item: { ...bookPass().item, rereadCount: 1, position: {} as never } as never,
      noteCount: 3, dayNumber: null, startedOn: null,
    });
    const [d] = buildInProgress([p]);
    expect(d.nthLabel).toBe("2.ª lectura");
    expect(d.percentage).toBeNull();
    expect(d.progressLabel).toBe("Sin progreso");
    expect(d.contextLabel).toBe("3 notas"); // sin día ni desde
  });

  it("serie con progreso: ordinal de visionado, kind y subtítulo de temporada", () => {
    const [d] = buildInProgress([
      pass({
        item: item({
          itemType: "series",
          position: { season: 2, episode: 12 },
          totalEpisodes: 30,
        }),
      }),
    ]);
    expect(d.nthLabel).toBe("1.º visionado");
    expect(d.kindLabel).toBe("Serie");
    expect(d.subtitle).toBe("Temporada 2 · Episodio 12");
    expect(d.progressLabel).toBe("12 de 30 episodios");
  });

  it("pase huérfano (sin activePassId): passId vacío y deep link a la ficha, no a la sesión", () => {
    const [d] = buildInProgress([pass({ item: item({ activePassId: null, itemId: "b-3" }) })]);
    expect(d.passId).toBe("");
    expect(d.deepLink).toBe("/libro/b-3");
  });
});

describe("buildWidgetSnapshot + snapshotFingerprint", () => {
  const featured = pass({ item: item({ position: { page: 10 }, pageCount: 100 }) });
  const input = {
    userId: "user-1",
    passes: [featured],
    total: 1,
    date: "2026-08-05",
    goalMinutes: 40,
    todayMinutes: 10,
    streak: 2,
  };

  it("monta el snapshot con versión y userId", () => {
    const snapshot = buildWidgetSnapshot({ ...input, now: new Date("2026-08-05T10:00:00Z") });
    expect(snapshot.version).toBe(WIDGET_SCHEMA_VERSION);
    expect(snapshot.userId).toBe("user-1");
    expect(snapshot.generatedAt).toBe("2026-08-05T10:00:00.000Z");
    expect(snapshot.inProgress[0]?.title).toBe("Dune");
    expect(snapshot.inProgressTotal).toBe(1);
    expect(snapshot.dailyGoal?.targetValue).toBe(40);
  });

  it("mismo contenido con distinto generatedAt → misma huella (deduplica)", () => {
    const a = buildWidgetSnapshot({ ...input, now: new Date("2026-08-05T10:00:00Z") });
    const b = buildWidgetSnapshot({ ...input, now: new Date("2026-08-05T11:00:00Z") });
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(b));
  });

  it("cambio de día → huella distinta (el widget debe enterarse)", () => {
    const a = buildWidgetSnapshot(input);
    const b = buildWidgetSnapshot({ ...input, date: "2026-08-06" });
    expect(snapshotFingerprint(a)).not.toBe(snapshotFingerprint(b));
  });

  it("cambio de usuario → huella distinta", () => {
    const a = buildWidgetSnapshot(input);
    const b = buildWidgetSnapshot({ ...input, userId: "user-2" });
    expect(snapshotFingerprint(a)).not.toBe(snapshotFingerprint(b));
  });
});
