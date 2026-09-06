import { describe, expect, it } from "vitest";
import { PROFILE_IDS, SYNTHETIC_PROFILES, snapshotForProfile } from "./profiles";

describe("perfiles sintéticos", () => {
  it("cubren el rango de tramos: nueva en 1, importadora abajo, seriéfila y lectora arriba", () => {
    const tier = (id: (typeof PROFILE_IDS)[number]) => snapshotForProfile(id, "wizard").tier;
    expect(tier("nueva")).toBe(1);
    expect(tier("importadora")).toBeLessThan(tier("cinefila"));
    expect(tier("cinefila")).toBeLessThan(tier("lectora_larga"));
    expect(tier("social")).toBeLessThan(tier("lectora_larga"));
    expect(tier("seriefila")).toBeGreaterThanOrEqual(tier("lectora_larga"));
    expect(tier("seriefila")).toBeLessThanOrEqual(16);
  });

  it("la dote del historial va con tope: la importadora no domina por volumen", () => {
    expect(SYNTHETIC_PROFILES.importadora.counts.historicalPasses).toBeGreaterThan(50);
    expect(snapshotForProfile("importadora", "wizard").tier).toBeLessThanOrEqual(7);
  });

  it("la clase cambia el nombre de la ficha, no el tramo", () => {
    expect(snapshotForProfile("social", "bard").tier).toBe(snapshotForProfile("social", "barbarian").tier);
    expect(PROFILE_IDS).toHaveLength(6);
  });
});
