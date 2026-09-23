import { describe, expect, it } from "vitest";
import { airedFlags, episodeSyncNeed, isSeriesEnded, todayISO } from "./aired";

const TODAY = "2026-09-23";

describe("isSeriesEnded", () => {
  it("solo Ended y Canceled cierran la serie", () => {
    expect(isSeriesEnded("Ended")).toBe(true);
    expect(isSeriesEnded("Canceled")).toBe(true);
    expect(isSeriesEnded("Returning Series")).toBe(false);
    expect(isSeriesEnded("In Production")).toBe(false);
    expect(isSeriesEnded(null)).toBe(false);
  });
});

describe("todayISO", () => {
  it("devuelve la fecha UTC en formato de columna date", () => {
    expect(todayISO(new Date("2026-09-23T23:30:00Z"))).toBe("2026-09-23");
  });
});

describe("airedFlags", () => {
  it("con fecha: emitido si la fecha es hoy o anterior", () => {
    const eps = [
      { airDate: "2026-09-01" },
      { airDate: TODAY },
      { airDate: "2026-09-30" },
    ];
    expect(airedFlags(eps, TODAY, false)).toEqual([true, true, false]);
  });

  it("sin fecha antes del último emitido cuenta como emitido; después, no", () => {
    const eps = [
      { airDate: null }, // T1 antigua sin fecha
      { airDate: "2020-01-01" },
      { airDate: null }, // TBA de la temporada anunciada
    ];
    expect(airedFlags(eps, TODAY, false)).toEqual([true, true, false]);
  });

  it("sin ninguna fecha, todo emitido (serie manual)", () => {
    expect(airedFlags([{ airDate: null }, { airDate: null }], TODAY, false)).toEqual([
      true,
      true,
    ]);
  });

  it("serie terminada: todo emitido aunque haya fechas futuras o nulas", () => {
    const eps = [{ airDate: "2026-12-01" }, { airDate: null }];
    expect(airedFlags(eps, TODAY, true)).toEqual([true, true]);
  });

  it("todo en el futuro: nada emitido", () => {
    expect(airedFlags([{ airDate: "2027-01-01" }, { airDate: null }], TODAY, false)).toEqual([
      false,
      false,
    ]);
  });
});

describe("episodeSyncNeed", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);
  const base = {
    episodeCount: 10,
    tmdbStatus: "Returning Series",
    nextEpisodeAirDate: null,
    episodesSyncedAt: "2026-09-22T12:00:00Z",
  };

  it("sin episodios: hay que traerlos ya", () => {
    expect(episodeSyncNeed({ ...base, episodeCount: 0 }, now)).toBe("empty");
  });

  it("nunca sincronizada con la regla nueva: se refresca una vez", () => {
    expect(
      episodeSyncNeed({ ...base, tmdbStatus: null, episodesSyncedAt: null }, now),
    ).toBe("stale");
  });

  it("terminada y sincronizada: no se vuelve a preguntar nunca", () => {
    expect(
      episodeSyncNeed({ ...base, tmdbStatus: "Ended", episodesSyncedAt: "2020-01-01T00:00:00Z" }, now),
    ).toBe("fresh");
  });

  it("en emisión, reciente: fresca", () => {
    expect(episodeSyncNeed(base, now)).toBe("fresh");
  });

  it("en emisión, más de 7 días: se refresca", () => {
    expect(episodeSyncNeed({ ...base, episodesSyncedAt: "2026-09-15T12:00:00Z" }, now)).toBe(
      "stale",
    );
  });

  it("ya se emitió el siguiente episodio anunciado: se adelanta el refresco", () => {
    // `base` se sincronizó hace 24 h justas.
    expect(episodeSyncNeed({ ...base, nextEpisodeAirDate: TODAY }, now)).toBe("stale");
    expect(episodeSyncNeed({ ...base, nextEpisodeAirDate: "2026-09-24" }, now)).toBe("fresh");
  });

  it("episodio ya emitido pero sincronizada hace menos de un día: no repite", () => {
    expect(
      episodeSyncNeed(
        { ...base, nextEpisodeAirDate: "2026-09-20", episodesSyncedAt: "2026-09-23T08:00:00Z" },
        now,
      ),
    ).toBe("fresh");
  });

  it("fecha de sincronización ilegible: se refresca", () => {
    expect(episodeSyncNeed({ ...base, episodesSyncedAt: "no-es-fecha" }, now)).toBe("stale");
  });
});
