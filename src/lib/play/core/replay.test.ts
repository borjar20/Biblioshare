import { describe, expect, it } from "vitest";
import { PlayEventError } from "./errors";
import { appendTap, emptyLog, flushPending } from "./log";
import { makeEvent } from "./events";
import { replay } from "./replay";
import { commanderReducer, initialCommanderState } from "@/lib/play/commander/reducer";
import { ev, started } from "@/lib/play/commander/test-fixtures";
import type { CommanderState } from "@/lib/play/commander/types";
import type {
  CommanderDamageEvent,
  CommanderEvent,
  LifeChangedEvent,
  PlayerEliminatedEvent,
  TurnPassedEvent,
} from "@/lib/play/commander/events";

describe("replay", () => {
  it("gate Fase 2: aplicar incremental === re-reduce completo desde game_started", () => {
    const events: CommanderEvent[] = [
      ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -4 }, 2000),
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 7 }, 2500),
      ev<TurnPassedEvent>("turn_passed", {}, 3000),
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "laura", reason: "concede" }, 3500),
      ev<TurnPassedEvent>("turn_passed", {}, 4000),
      ev<LifeChangedEvent>("life_changed", { target: "carlos", delta: 2 }, 4500),
    ];
    // incremental: evento a evento, como hace el store en vivo
    const incremental = events.reduce(commanderReducer, initialCommanderState(started(1000)));
    // replay: desde el log persistido, como hace la rehidratación
    const state = replay([started(1000), ...events]);
    expect(state).toEqual(incremental);
  });

  it("aplica pending encima de committed (estado vivo, spec §2)", () => {
    let log = emptyLog(started(1000));
    log = flushPending(appendTap(log, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -5 }, 2000)));
    log = appendTap(log, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -3 }, 4000));
    const state = replay(log.committed, log.pending) as CommanderState;
    expect(state.players[0].life).toBe(32);
  });

  it("rechaza un log que no empieza por game_started o con herramienta desconocida", () => {
    expect(() => replay([ev<TurnPassedEvent>("turn_passed", {}, 1)])).toThrow(PlayEventError);
    const bad = makeEvent("game_started", { toolId: "ajedrez", setup: {} }, 1, "e-bad");
    expect(() => replay([bad])).toThrow(PlayEventError);
  });
});
