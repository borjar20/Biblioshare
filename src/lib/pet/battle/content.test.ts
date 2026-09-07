import { describe, expect, it } from "vitest";
import { BROTE, ENEMIES, RULESET, contentHash } from "./content";

describe("contenido de combate", () => {
  it("los números son enteros y el anuncio es 50/50", () => {
    const flat = [
      RULESET.tickMs, RULESET.maxTicks, RULESET.maxInputs,
      ...Object.values(RULESET.pet),
      BROTE.hpPerAtk, BROTE.basicPct, BROTE.chargePct, BROTE.punishPct, BROTE.chargeBp,
      BROTE.idleMin, BROTE.idleMax, BROTE.windupTicks, BROTE.guardTicks, BROTE.staggerTicks, BROTE.basicInterval,
    ];
    expect(flat.every((n) => Number.isSafeInteger(n) && n > 0)).toBe(true);
    expect(BROTE.chargeBp).toBe(5000);
    expect(BROTE.idleMin).toBeLessThanOrEqual(BROTE.idleMax);
    expect(ENEMIES[BROTE.id]).toBe(BROTE);
  });

  // Si esto cambia, cambió el contenido: hay que subir RULESET.version y regenerar
  // el ejemplo normativo (Task 11). Vitest rellena el snapshot en la primera pasada.
  it("el hash del contenido está fijado", async () => {
    expect(RULESET.version).toBe("r4.1");
    expect(await contentHash()).toMatchInlineSnapshot(`"13cc440381ca001e230d35b4f6cd628bc5195bce9a14f2fa6b17af50eb63f765"`);
  });
});
