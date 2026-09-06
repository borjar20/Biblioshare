import { describe, expect, it } from "vitest";
import { PET_CLASSES } from "../classes";
import { EMPTY_COUNTS } from "../counts";
import { deriveAttributes, levelFor, xpFor } from "../derive";
import { BROTE } from "./content";
import { buildSnapshot, combatPower, enemyStats, fighterStats, powerTier } from "./power";

const attrs = deriveAttributes({ ...EMPTY_COUNTS, sessionUnits: 300, finishedPasses: 20, notes: 30 });

describe("combatPower / powerTier", () => {
  it("suma los seis atributos sin bonus de clase", () => {
    expect(combatPower(attrs)).toBe(attrs.FUE + attrs.CON + attrs.INT + attrs.SAB + attrs.CAR + attrs.DES);
    expect(powerTier(attrs)).toBe(levelFor(combatPower(attrs)));
  });

  it("el nivel visible sí depende de la clase; el tramo no (#1081 R6)", () => {
    const levels = new Set(PET_CLASSES.map((cls) => levelFor(xpFor(attrs, cls))));
    expect(levels.size).toBeGreaterThan(1);
    // Sin bonus (×1,5) el tramo nunca supera el mejor nivel visible entre las seis clases.
    expect(powerTier(attrs)).toBeLessThanOrEqual(Math.max(...PET_CLASSES.map((cls) => levelFor(xpFor(attrs, cls)))));
    expect(combatPower(deriveAttributes(EMPTY_COUNTS))).toBe(0);
    expect(powerTier(deriveAttributes(EMPTY_COUNTS))).toBe(1);
  });
});

describe("stats", () => {
  it("crecen con el tramo y el enemigo escala con la mascota", () => {
    const t1 = fighterStats(1);
    const t14 = fighterStats(14);
    expect(t1).toEqual({ hpMax: 110, atk: 10 });
    expect(t14).toEqual({ hpMax: 240, atk: 36 });
    expect(enemyStats(BROTE, t1)).toEqual({ hpMax: 420, basic: 4, charge: 44, punish: 27 });
    expect(enemyStats(BROTE, t14)).toEqual({ hpMax: 1512, basic: 9, charge: 96, punish: 60 });
  });

  it("buildSnapshot copia atributos y deriva tramo y stats", () => {
    const s = buildSnapshot({ name: "Nuez", petClass: "wizard", stage: "adult", attributes: attrs });
    expect(s.tier).toBe(powerTier(attrs));
    expect(s.hpMax).toBe(fighterStats(s.tier).hpMax);
    expect(s.attributes).toEqual(attrs);
    expect(s.attributes).not.toBe(attrs);
  });
});
