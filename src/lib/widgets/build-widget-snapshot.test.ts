import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library/types";
import type { TodayPass } from "@/lib/stats/get-today-focus";
import { compareTodayPasses } from "@/lib/stats/get-today-focus";
import {
  buildCurrentProgressData,
  buildDailyGoalData,
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

describe("buildCurrentProgressData", () => {
  it("null sin pase destacado", () => {
    expect(buildCurrentProgressData(null)).toBeNull();
  });

  it("libro con página y total: etiqueta, porcentaje y deep link a la sesión", () => {
    const data = buildCurrentProgressData(
      pass({ item: item({ position: { page: 184 }, pageCount: 430 }) }),
    );
    expect(data).toMatchObject({
      progressLabel: "184 de 430 páginas",
      percentage: 43,
      currentValue: 184,
      totalValue: 430,
      deepLink: "/sesion/pass-1",
    });
  });

  it("libro con página sin total: no inventa porcentaje", () => {
    const data = buildCurrentProgressData(
      pass({ item: item({ position: { page: 184 }, pageCount: null }) }),
    );
    expect(data?.progressLabel).toBe("Pág. 184");
    expect(data?.percentage).toBeNull();
    expect(data?.totalValue).toBeNull();
  });

  it("serie con total: episodios y subtítulo de temporada", () => {
    const data = buildCurrentProgressData(
      pass({
        item: item({
          itemType: "series",
          position: { season: 2, episode: 12 },
          totalEpisodes: 30,
        }),
      }),
    );
    expect(data).toMatchObject({
      progressLabel: "12 de 30 episodios",
      subtitle: "Temporada 2 · Episodio 12",
      percentage: 40,
    });
  });

  it("serie sin total fiable: sin porcentaje, la posición vive en el subtítulo", () => {
    const data = buildCurrentProgressData(
      pass({
        item: item({
          itemType: "series",
          position: { season: 1, episode: 4 },
          totalEpisodes: null,
        }),
      }),
    );
    expect(data?.subtitle).toBe("Temporada 1 · Episodio 4");
    expect(data?.progressLabel).toBe("En curso");
    expect(data?.percentage).toBeNull();
  });

  it("película: «En curso» y deep link a la ficha (no hay sesiones)", () => {
    const data = buildCurrentProgressData(
      pass({ item: item({ itemType: "movie", itemId: "m-9" }) }),
    );
    expect(data?.progressLabel).toBe("En curso");
    expect(data?.percentage).toBeNull();
    expect(data?.deepLink).toBe("/pelicula/m-9");
  });

  it("pase huérfano (sin activePassId): cae a la ficha del ítem", () => {
    const data = buildCurrentProgressData(
      pass({ item: item({ activePassId: null, itemId: "b-3" }) }),
    );
    expect(data?.deepLink).toBe("/libro/b-3");
  });

  it("statusLabel con la última actividad", () => {
    const data = buildCurrentProgressData(pass({ lastSessionDate: "2026-08-03" }));
    expect(data?.statusLabel).toBe("Últ. actividad 03/08");
  });
});

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

describe("buildWidgetSnapshot + snapshotFingerprint", () => {
  const input = {
    userId: "user-1",
    featured: pass({ item: item({ position: { page: 10 }, pageCount: 100 }) }),
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
    expect(snapshot.currentProgress?.title).toBe("Dune");
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
