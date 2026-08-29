import { describe, expect, it } from "vitest";
import { playTools, UNKNOWN_EVENT_DESCRIPTION } from "./tools";
import { initialCommanderState } from "./commander/reducer";
import { ev, started } from "./commander/test-fixtures";
import type { LifeChangedEvent } from "./commander/events";

// Cubre el registro de dominio ampliado (findings 6 y 8 de la revisión final):
// describe() etiqueta cualquier PlayEvent sin que la llamadora conozca la
// herramienta, y hace de guarda en runtime para un `type` que no es de Commander.

describe("playTools.commander", () => {
  const state = initialCommanderState(started(1000));

  it("expone i18nKey y setupRoute como datos planos (spec §6)", () => {
    expect(playTools.commander.i18nKey).toBe("commander");
    expect(playTools.commander.setupRoute).toBe("/partidas/commander/nueva");
  });

  it("describe() etiqueta un evento reconocido igual que describeEvent directamente", () => {
    const event = ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -3 }, 2000);
    expect(playTools.commander.describe(event, state)).toEqual({ key: "lifeLost", params: { name: "ana", amount: 3 } });
  });

  it("describe() cae al fallback 'unknown' ante un type que no pertenece a CommanderEvent", () => {
    const foreign = { id: "e-x", type: "score_round_added", at: 2000, payload: {} };
    expect(playTools.commander.describe(foreign, state)).toEqual(UNKNOWN_EVENT_DESCRIPTION);
    expect(playTools.commander.describe(foreign, state)).toEqual({ key: "unknown", params: {} });
  });
});
