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
  PoisonChangedEvent,
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

  it("pending se aplica DESPUÉS de committed, no antes ni entrelazado (estado vivo, spec §2)", () => {
    // life_changed es una suma llana: -5 y -3 dan 32 en cualquier orden, así que ese par no
    // podría distinguir "committed luego pending" de "pending luego committed" (ambos dan 32).
    // poison_changed sí depende del orden porque clampa en 0 (Math.max(0, ...)): aplicar +2 y
    // luego -5 no es lo mismo que aplicar -5 y luego +2, porque el clamp se dispara en momentos
    // distintos. Con esto la regla "state = committed, then pending last" queda pinchada de verdad.
    let log = emptyLog(started(1000));
    log = flushPending(appendTap(log, ev<PoisonChangedEvent>("poison_changed", { target: "ana", delta: 2 }, 2000)));
    log = appendTap(log, ev<PoisonChangedEvent>("poison_changed", { target: "ana", delta: -5 }, 4000));
    const state = replay(log.committed, log.pending) as CommanderState;
    // Orden correcto (committed +2 -> poison 2, luego pending -5 clampado): poison = 0.
    // Si pending se aplicara antes (o entrelazado): -5 clampado a 0 primero, luego +2 -> poison = 2.
    expect(state.players[0].poison).toBe(0);
  });

  it("rechaza un log que no empieza por game_started o con herramienta desconocida", () => {
    expect(() => replay([ev<TurnPassedEvent>("turn_passed", {}, 1)])).toThrow(PlayEventError);
    const bad = makeEvent("game_started", { toolId: "ajedrez", setup: {} }, 1, "e-bad");
    expect(() => replay([bad])).toThrow(PlayEventError);
  });

  it("rechaza un log committed vacío", () => {
    expect(() => replay([])).toThrow(PlayEventError);
  });
});
