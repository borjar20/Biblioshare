import { describe, expect, it } from "vitest";
import { PlayEventError } from "@/lib/play/core/errors";
import { mtgReducer, initialMtgState } from "./reducer";
import { ev, makeSetup, started } from "./test-fixtures";
import type { CommanderDamageEvent, LifeChangedEvent, PoisonChangedEvent } from "./events";
import type { MonarchChangedEvent, PlayerEliminatedEvent, TurnPassedEvent, InitiativeChangedEvent } from "./events";
import type { GameFinishedEvent, PlayerRestoredEvent } from "./events";

describe("initialMtgState", () => {
  it("arranca con las vidas del setup, sin veneno y con el asiento inicial activo", () => {
    const s = initialMtgState(started(1000));
    expect(s.status).toBe("active");
    expect(s.players).toHaveLength(4);
    expect(s.players.every((p) => p.life === 40 && p.poison === 0 && p.elimination === null)).toBe(true);
    expect(s.activeSeat).toBe(0);
    expect(s.round).toBe(1);
    expect(s.turnCount).toBe(0);
    expect(s.startedAt).toBe(1000);
  });

  it("rechaza menos de 2 o más de 6 jugadores y los ids duplicados", () => {
    expect(() => initialMtgState(started(1, makeSetup(["ana"])))).toThrow(PlayEventError);
    expect(() => initialMtgState(started(1, makeSetup(["a", "b", "c", "d", "e", "f", "g"])))).toThrow(PlayEventError);
    expect(() => initialMtgState(started(1, makeSetup(["ana", "ana"])))).toThrow(PlayEventError);
  });
});

describe("mtgReducer — contadores", () => {
  const base = initialMtgState(started(1000));

  it("life_changed suma y resta (sin suelo: vidas negativas existen)", () => {
    let s = mtgReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -45 }, 2000));
    expect(s.players[0].life).toBe(-5);
    s = mtgReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 3 }, 2100));
    expect(s.players[0].life).toBe(-2);
  });

  it("commander_damage baja vidas Y acumula daño del atacante en UN evento (spec §3)", () => {
    const s = mtgReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos-c1", target: "borja", delta: 5 }, 2000),
    );
    expect(s.players[1].life).toBe(35);
    expect(s.players[1].commanderDamage).toEqual({ "carlos-c1": 5 });
    // el atacante no cambia
    expect(s.players[2].life).toBe(40);
  });

  it("poison_changed acumula y no baja de 0", () => {
    let s = mtgReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "laura", delta: 2 }, 2000));
    s = mtgReducer(s, ev<PoisonChangedEvent>("poison_changed", { target: "laura", delta: -5 }, 2100));
    expect(s.players[3].poison).toBe(0);
  });

  it("rechaza participantes desconocidos y game_started duplicado", () => {
    expect(() => mtgReducer(base, ev<LifeChangedEvent>("life_changed", { target: "nadie", delta: 1 }, 2000)))
      .toThrow(PlayEventError);
    expect(() => mtgReducer(base, started(2000))).toThrow(PlayEventError);
  });

  it("acumula daño de comandante en múltiples golpes del mismo atacante", () => {
    // Verificar que (tally ?? 0) + delta acumula y no sobrescribe
    let s = mtgReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos-c1", target: "borja", delta: 5 }, 2000),
    );
    expect(s.players[1].commanderDamage).toEqual({ "carlos-c1": 5 });
    expect(s.players[1].life).toBe(35);

    s = mtgReducer(
      s,
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos-c1", target: "borja", delta: 8 }, 2100),
    );
    expect(s.players[1].commanderDamage).toEqual({ "carlos-c1": 13 });
    expect(s.players[1].life).toBe(27);
  });

  it("rechaza atacante desconocido en commander_damage", () => {
    expect(() =>
      mtgReducer(
        base,
        ev<CommanderDamageEvent>("commander_damage", { source: "fantasma", target: "borja", delta: 5 }, 2000),
      ),
    ).toThrow(PlayEventError);
  });

  it("rechaza eventos cuando la partida está cerrada", () => {
    const finished = { ...base, status: "finished" as const };
    expect(() =>
      mtgReducer(finished, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 1 }, 2000)),
    ).toThrow(PlayEventError);
  });

  it("rechaza asiento inicial fuera de rango en initialMtgState", () => {
    expect(() =>
      initialMtgState(started(1000, { ...makeSetup(), startingSeat: 9 })),
    ).toThrow(PlayEventError);
  });
});

describe("mtgReducer — turnos", () => {
  const turn = (at: number) => ev<TurnPassedEvent>("turn_passed", {}, at);
  const base = initialMtgState(started(1000));

  it("avanza al siguiente asiento y sube de ronda al cruzar el asiento inicial", () => {
    let s = base; // activo: asiento 0 (ana), ronda 1
    s = mtgReducer(s, turn(2000)); // borja
    s = mtgReducer(s, turn(2001)); // carlos
    s = mtgReducer(s, turn(2002)); // laura
    expect(s.activeSeat).toBe(3);
    expect(s.round).toBe(1);
    s = mtgReducer(s, turn(2003)); // vuelve a ana: cruza el asiento 0
    expect(s.activeSeat).toBe(0);
    expect(s.round).toBe(2);
    expect(s.turnCount).toBe(4);
  });

  // Los casos de turnos que dependen de player_eliminated (saltar eliminados,
  // ronda posicional con el inicial eliminado, un solo vivo) se añaden en la
  // Task 6, cuando la eliminación exista: cada task acaba con la suite verde.
});

describe("mtgReducer — monarca e iniciativa", () => {
  const base = initialMtgState(started(1000));

  it("asigna, reasigna y limpia con null", () => {
    let s = mtgReducer(base, ev<MonarchChangedEvent>("monarch_changed", { holder: "ana" }, 2000));
    expect(s.monarch).toBe("ana");
    s = mtgReducer(s, ev<MonarchChangedEvent>("monarch_changed", { holder: "carlos" }, 2050));
    expect(s.monarch).toBe("carlos");
    s = mtgReducer(s, ev<MonarchChangedEvent>("monarch_changed", { holder: null }, 2100));
    expect(s.monarch).toBeNull();
  });

  it("asigna titular de iniciativa", () => {
    const s = mtgReducer(base, ev<InitiativeChangedEvent>("initiative_changed", { holder: "ana" }, 2000));
    expect(s.initiative).toBe("ana");
    // Valida que no escriba en monarca por confusión de campos
    expect(s.monarch).toBeNull();
  });

  it("limpia titular de iniciativa con null", () => {
    let s = mtgReducer(base, ev<InitiativeChangedEvent>("initiative_changed", { holder: "ana" }, 2000));
    expect(s.initiative).toBe("ana");
    s = mtgReducer(s, ev<InitiativeChangedEvent>("initiative_changed", { holder: null }, 2100));
    expect(s.initiative).toBeNull();
  });

  it("rechaza un poseedor desconocido en iniciativa", () => {
    expect(() => mtgReducer(base, ev<InitiativeChangedEvent>("initiative_changed", { holder: "nadie" }, 2000)))
      .toThrow(PlayEventError);
  });

  it("iniciativa: asigna, reasigna y limpia con null", () => {
    let s = mtgReducer(base, ev<InitiativeChangedEvent>("initiative_changed", { holder: "ana" }, 2000));
    expect(s.initiative).toBe("ana");
    s = mtgReducer(s, ev<InitiativeChangedEvent>("initiative_changed", { holder: "carlos" }, 2050));
    expect(s.initiative).toBe("carlos");
    s = mtgReducer(s, ev<InitiativeChangedEvent>("initiative_changed", { holder: null }, 2100));
    expect(s.initiative).toBeNull();
  });

  it("rechaza un poseedor desconocido", () => {
    expect(() => mtgReducer(base, ev<MonarchChangedEvent>("monarch_changed", { holder: "nadie" }, 2000)))
      .toThrow(PlayEventError);
  });
});

describe("mtgReducer — eliminación y final", () => {
  const base = initialMtgState(started(1000));

  it("elimina con orden y motivo, sin ronda si el tracker de turnos no se usó", () => {
    const s = mtgReducer(
      base,
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana", reason: "poison" }, 2000),
    );
    expect(s.players[0].elimination).toEqual({ order: 1, round: null, reason: "poison" });
  });

  it("restaurar limpia la eliminación; reeliminar estrena order nuevo", () => {
    let s = mtgReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000));
    s = mtgReducer(s, ev<PlayerRestoredEvent>("player_restored", { target: "ana" }, 2100));
    expect(s.players[0].elimination).toBeNull();
    s = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "carlos" }, 2200));
    s = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2300));
    expect(s.players[2].elimination?.order).toBe(2);
    expect(s.players[0].elimination?.order).toBe(3); // la primera eliminación de ana no existe ya
  });

  it("rechaza eliminar dos veces y restaurar a un vivo", () => {
    const s = mtgReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000));
    expect(() => mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2100)))
      .toThrow(PlayEventError);
    expect(() => mtgReducer(base, ev<PlayerRestoredEvent>("player_restored", { target: "ana" }, 2000)))
      .toThrow(PlayEventError);
  });

  it("game_finished admite ganador con rivales vivos (victoria por carta) y cierra la partida", () => {
    const s = mtgReducer(
      base,
      ev<GameFinishedEvent>("game_finished", { winner: "carlos", reason: "card" }, 9000),
    );
    expect(s.status).toBe("finished");
    expect(s.winner).toBe("carlos");
    expect(s.finishReason).toBe("card");
    expect(s.finishedAt).toBe(9000);
    // tras finalizar, nada más entra
    expect(() => mtgReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 1 }, 9100)))
      .toThrow(PlayEventError);
  });

  it("rechaza un ganador eliminado", () => {
    const s = mtgReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000));
    expect(() => mtgReducer(s, ev<GameFinishedEvent>("game_finished", { winner: "ana" }, 9000)))
      .toThrow(PlayEventError);
  });
});

// Casos de turnos que necesitaban player_eliminated (venían anunciados en la Task 5).
describe("mtgReducer — turnos con eliminados", () => {
  const turn = (at: number) => ev<TurnPassedEvent>("turn_passed", {}, at);
  const base = initialMtgState(started(1000));

  it("salta eliminados, y la ronda sube por POSICIÓN aunque el inicial esté eliminado", () => {
    let s = mtgReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 1500));
    s = mtgReducer(s, turn(2000)); // activo era 0 -> borja
    s = mtgReducer(s, turn(2001)); // carlos
    s = mtgReducer(s, turn(2002)); // laura
    s = mtgReducer(s, turn(2003)); // cruza asiento 0 (ana, eliminada) -> borja, ronda 2
    expect(s.activeSeat).toBe(1);
    expect(s.round).toBe(2);
  });

  it("eliminar al jugador activo NO cambia el activo; el siguiente pase salta desde su asiento", () => {
    let s = mtgReducer(base, turn(2000)); // activo: borja (asiento 1)
    s = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "borja" }, 2100));
    expect(s.activeSeat).toBe(1); // sigue siendo su turno: en Magic puedes morir en tu turno
    s = mtgReducer(s, turn(2200));
    expect(s.activeSeat).toBe(2); // carlos
  });

  it("con un solo vivo, el turno vuelve a él y la ronda avanza al envolver", () => {
    let s = base;
    for (const id of ["ana", "borja", "laura"]) {
      s = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: id }, 1500));
    }
    s = mtgReducer(s, turn(2000)); // solo carlos (asiento 2) vivo
    expect(s.activeSeat).toBe(2);
    s = mtgReducer(s, turn(2100)); // envuelve la mesa entera y cruza el asiento 0
    expect(s.activeSeat).toBe(2);
    expect(s.round).toBe(2);
  });

  it("registra la ronda exacta al eliminar cuando el tracker de turnos está activo (ronda > 1)", () => {
    // Completar una vuelta entera para llegar a ronda 2: tras 4 pases desde asiento 0
    // cruzamos startingSeat (0) en el 4o pase, avanzando de ronda 1 a ronda 2
    let s = base; // round = 1, turnCount = 0, activeSeat = 0
    s = mtgReducer(s, turn(2000)); // asiento 1 (borja), round = 1
    s = mtgReducer(s, turn(2001)); // asiento 2 (carlos), round = 1
    s = mtgReducer(s, turn(2002)); // asiento 3 (laura), round = 1
    s = mtgReducer(s, turn(2003)); // asiento 0 (ana): cruza startingSeat → round = 2
    expect(s.round).toBe(2);
    expect(s.turnCount).toBe(4);
    // Eliminar en ronda 2 registra el valor exacto de la ronda, no la inicial
    const s2 = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "carlos", reason: "poison" }, 2100));
    expect(s2.players[2].elimination).toEqual({ order: 1, round: 2, reason: "poison" });
  });
});
