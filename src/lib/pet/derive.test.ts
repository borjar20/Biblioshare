import { describe, expect, it } from "vitest";
import { BALANCE } from "./balance";
import { EMPTY_COUNTS } from "./counts";
import {
  deriveAttributes,
  levelFor,
  moodFor,
  stageFor,
  suggestClass,
  xpFor,
  xpForLevel,
} from "./derive";

describe("deriveAttributes", () => {
  it("con cero contadores todo es cero", () => {
    const a = deriveAttributes(EMPTY_COUNTS);
    expect(Object.values(a).every((v) => v === 0)).toBe(true);
  });

  it("cada atributo suma sus fuentes con los pesos del balance", () => {
    const a = deriveAttributes({
      ...EMPTY_COUNTS,
      sessionUnits: 3,
      episodes: 2,
      activeDays: 4,
      notes: 1,
      quotes: 2,
      posts: 1,
      newWorks: 5,
    });
    expect(a.FUE).toBe(3 * BALANCE.FUE.perSessionUnit + 2 * BALANCE.FUE.perEpisode);
    expect(a.CON).toBe(4 * BALANCE.CON.perActiveDay);
    expect(a.SAB).toBe(1 * BALANCE.SAB.perNote + 2 * BALANCE.SAB.perQuote);
    expect(a.CAR).toBe(1 * BALANCE.CAR.perPost);
    expect(a.DES).toBe(5 * BALANCE.DES.perNewWork);
  });

  it("el historial es una dote con tope: no manda la clase por muchos pases que traiga", () => {
    const a = deriveAttributes({ ...EMPTY_COUNTS, historicalPasses: 10_000, historicalWorks: 10_000 });
    expect(a.INT).toBe(BALANCE.INT.historicalPassCap * BALANCE.INT.perHistoricalPass);
    expect(a.DES).toBe(BALANCE.DES.historicalWorkCap * BALANCE.DES.perHistoricalWork);
    // Un solo pase vivido pesa más que uno del historial.
    expect(BALANCE.INT.perFinishedPass).toBeGreaterThan(BALANCE.INT.perHistoricalPass);
  });
});

describe("xpFor", () => {
  it("aplica el bonus de clase SOLO al atributo primario", () => {
    const attrs = { FUE: 100, CON: 10, INT: 10, SAB: 10, CAR: 10, DES: 10 };
    const barbarian = xpFor(attrs, "barbarian");
    const bard = xpFor(attrs, "bard");
    expect(barbarian).toBe(Math.round(100 * BALANCE.classBonus + 50));
    expect(bard).toBe(Math.round(100 + 40 + 10 * BALANCE.classBonus));
  });
});

describe("levelFor / xpForLevel", () => {
  it("con 0 XP es nivel 1 y los umbrales de la spec cuadran", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(xpForLevel(10))).toBe(10);
    expect(levelFor(xpForLevel(10) - 1)).toBe(9);
    expect(levelFor(xpForLevel(40))).toBe(40);
  });
  it("la curva es monótona", () => {
    let prev = 0;
    for (let xp = 0; xp < 100_000; xp += 997) {
      const lvl = levelFor(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
});

describe("stageFor", () => {
  it("sin actividad tras eclosionar es bellota, aunque el nivel sea alto", () => {
    expect(stageFor(50, false)).toBe("acorn");
  });
  it("umbrales 10 y 40", () => {
    expect(stageFor(1, true)).toBe("young");
    expect(stageFor(9, true)).toBe("young");
    expect(stageFor(10, true)).toBe("adult");
    expect(stageFor(39, true)).toBe("adult");
    expect(stageFor(40, true)).toBe("veteran");
  });
});

describe("moodFor", () => {
  it("0 contenta, 1 normal, 2-3 dormida, 4+ triste, null normal", () => {
    expect(moodFor(0)).toBe("happy");
    expect(moodFor(1)).toBe("neutral");
    expect(moodFor(2)).toBe("sleepy");
    expect(moodFor(3)).toBe("sleepy");
    expect(moodFor(4)).toBe("sad");
    expect(moodFor(30)).toBe("sad");
    expect(moodFor(null)).toBe("neutral");
  });
});

describe("suggestClass", () => {
  it("propone la clase del atributo dominante", () => {
    expect(suggestClass({ FUE: 1, CON: 1, INT: 9, SAB: 1, CAR: 1, DES: 1 })).toBe("wizard");
  });
  it("empate: gana la primera en el orden de la tabla de la spec", () => {
    expect(suggestClass({ FUE: 5, CON: 5, INT: 5, SAB: 5, CAR: 5, DES: 5 })).toBe("barbarian");
    expect(suggestClass({ FUE: 0, CON: 5, INT: 0, SAB: 5, CAR: 0, DES: 0 })).toBe("fighter");
  });
  it("todo a cero: sin sugerencia", () => {
    expect(suggestClass({ FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 })).toBeNull();
  });
});
