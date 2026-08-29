import { describe, expect, it } from "vitest";
import { mtgReducer, initialMtgState } from "./reducer";
import { describeEvent, finalRanking } from "./selectors";
import { ev, started } from "./test-fixtures";
import type {
  CommanderDamageEvent,
  MtgEvent,
  GameFinishedEvent,
  InitiativeChangedEvent,
  LifeChangedEvent,
  MonarchChangedEvent,
  PlayerEliminatedEvent,
  PlayerRestoredEvent,
  PoisonChangedEvent,
  TurnPassedEvent,
} from "./events";

function play(events: MtgEvent[]) {
  return events.reduce(mtgReducer, initialMtgState(started(1000)));
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
  const base = initialMtgState(started(1000));

  it("describe con nombre resuelto y cantidad positiva", () => {
    expect(describeEvent(ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -5 }, 2000), base))
      .toEqual({ key: "lifeLost", params: { name: "ana", amount: 5 } });
    expect(describeEvent(ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 3 }, 2000), base))
      .toEqual({ key: "lifeGained", params: { name: "ana", amount: 3 } });
    expect(
      describeEvent(ev<CommanderDamageEvent>("commander_damage", { source: "carlos-c1", target: "borja", delta: 5 }, 2000), base),
    ).toEqual({ key: "commanderDamage", params: { source: "carlos", target: "borja", amount: 5 } });
  });

  it("commander_damage con delta negativo (corrección de una tacada) normaliza el signo: amount siempre positivo", () => {
    expect(
      describeEvent(ev<CommanderDamageEvent>("commander_damage", { source: "carlos-c1", target: "borja", delta: -3 }, 2000), base),
    ).toEqual({ key: "commanderDamageHealed", params: { source: "carlos", target: "borja", amount: 3 } });
  });

  it("poison_changed en ambas direcciones normaliza el signo igual que life_changed", () => {
    expect(describeEvent(ev<PoisonChangedEvent>("poison_changed", { target: "ana", delta: 2 }, 2000), base))
      .toEqual({ key: "poisonGained", params: { name: "ana", amount: 2 } });
    expect(describeEvent(ev<PoisonChangedEvent>("poison_changed", { target: "ana", delta: -1 }, 2000), base))
      .toEqual({ key: "poisonHealed", params: { name: "ana", amount: 1 } });
  });

  it("turn_passed reporta la ronda tomada del estado, no del evento", () => {
    expect(describeEvent(ev<TurnPassedEvent>("turn_passed", {}, 2000), base))
      .toEqual({ key: "turnPassed", params: { round: base.round } });
  });

  it("monarch_changed: nombra al nuevo monarca o señala que se ha limpiado", () => {
    expect(describeEvent(ev<MonarchChangedEvent>("monarch_changed", { holder: "ana" }, 2000), base))
      .toEqual({ key: "monarch", params: { name: "ana" } });
    expect(describeEvent(ev<MonarchChangedEvent>("monarch_changed", { holder: null }, 2000), base))
      .toEqual({ key: "monarchCleared", params: {} });
  });

  it("initiative_changed: nombra al nuevo poseedor o señala que se ha limpiado", () => {
    expect(describeEvent(ev<InitiativeChangedEvent>("initiative_changed", { holder: "ana" }, 2000), base))
      .toEqual({ key: "initiative", params: { name: "ana" } });
    expect(describeEvent(ev<InitiativeChangedEvent>("initiative_changed", { holder: null }, 2000), base))
      .toEqual({ key: "initiativeCleared", params: {} });
  });

  it("player_eliminated y player_restored describen al jugador afectado", () => {
    expect(describeEvent(ev<PlayerEliminatedEvent>("player_eliminated", { target: "laura" }, 2000), base))
      .toEqual({ key: "eliminated", params: { name: "laura" } });
    expect(describeEvent(ev<PlayerRestoredEvent>("player_restored", { target: "laura" }, 2000), base))
      .toEqual({ key: "restored", params: { name: "laura" } });
  });

  it("game_finished y game_started no llevan params: solo marcan el hito", () => {
    expect(describeEvent(ev<GameFinishedEvent>("game_finished", {}, 2000), base))
      .toEqual({ key: "finished", params: {} });
    expect(describeEvent(started(1000), base)).toEqual({ key: "started", params: {} });
  });

  it("un id de participante que no está en el estado cae de vuelta al propio id como nombre", () => {
    expect(describeEvent(ev<LifeChangedEvent>("life_changed", { target: "fantasma", delta: 4 }, 2000), base))
      .toEqual({ key: "lifeGained", params: { name: "fantasma", amount: 4 } });
  });
});
