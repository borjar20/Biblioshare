import { describe, expect, it } from "vitest";
import { commanderReducer, initialCommanderState } from "./reducer";
import { describeEvent, finalRanking } from "./selectors";
import { ev, started } from "./test-fixtures";
import type {
  CommanderDamageEvent,
  CommanderEvent,
  GameFinishedEvent,
  LifeChangedEvent,
  PlayerEliminatedEvent,
  PlayerRestoredEvent,
} from "./events";

function play(events: CommanderEvent[]) {
  return events.reduce(commanderReducer, initialCommanderState(started(1000)));
}

describe("finalRanking", () => {
  it("ganador 1º, vivos empatados después, eliminados en orden inverso — numeración 1,2,2,4", () => {
    const s = play([
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "laura" }, 2000),
      ev<GameFinishedEvent>("game_finished", { winner: "carlos", reason: "card" }, 3000),
    ]);
    const r = finalRanking(s);
    expect(r).toEqual([
      { participantId: "carlos", position: 1 },
      { participantId: "ana", position: 2 },
      { participantId: "borja", position: 2 },
      { participantId: "laura", position: 4 },
    ]);
  });

  it("caso restauración de la spec: Ana eliminada -> restaurada -> Carlos eliminado -> Ana eliminada", () => {
    const s = play([
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000),
      ev<PlayerRestoredEvent>("player_restored", { target: "ana" }, 2100),
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "carlos" }, 2200),
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2300),
      ev<GameFinishedEvent>("game_finished", { winner: "borja", reason: "last_standing" }, 3000),
    ]);
    // Solo cuenta la eliminación VIGENTE: ana cayó DESPUÉS que carlos.
    expect(finalRanking(s)).toEqual([
      { participantId: "borja", position: 1 },
      { participantId: "laura", position: 2 },
      { participantId: "ana", position: 3 },
      { participantId: "carlos", position: 4 },
    ]);
  });

  it("sin ganador declarado: los vivos empatan en cabeza", () => {
    const s = play([
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000),
      ev<GameFinishedEvent>("game_finished", { reason: "abandoned" }, 3000),
    ]);
    const r = finalRanking(s);
    expect(r.filter((x) => x.position === 1).map((x) => x.participantId).sort()).toEqual(["borja", "carlos", "laura"]);
    expect(r.find((x) => x.participantId === "ana")?.position).toBe(4);
  });
});

describe("describeEvent", () => {
  const base = initialCommanderState(started(1000));

  it("describe con nombre resuelto y cantidad positiva", () => {
    expect(describeEvent(ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -5 }, 2000), base))
      .toEqual({ key: "lifeLost", params: { name: "ana", amount: 5 } });
    expect(describeEvent(ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 3 }, 2000), base))
      .toEqual({ key: "lifeGained", params: { name: "ana", amount: 3 } });
    expect(
      describeEvent(ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 5 }, 2000), base),
    ).toEqual({ key: "commanderDamage", params: { source: "carlos", target: "borja", amount: 5 } });
  });
});
