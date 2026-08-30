import { PlayEventError } from "@/lib/play/core/errors";
import { commanderOwners, type MtgPlayerState, type MtgState } from "./types";
import { modeConfig } from "./modes";
import type { MtgEvent, GameStartedEvent } from "./events";

export function initialMtgState(event: GameStartedEvent): MtgState {
  const { setup } = event.payload;
  const cfg = modeConfig(setup.mode);
  const n = setup.participants.length;
  if (n < cfg.minPlayers || n > cfg.maxPlayers) {
    throw new PlayEventError(`${setup.mode} admite ${cfg.minPlayers}-${cfg.maxPlayers} jugadores, no ${n}`);
  }
  const ids = new Set(setup.participants.map((p) => p.id));
  if (ids.size !== n) throw new PlayEventError("ids de participante duplicados");
  if (setup.startingSeat < 0 || setup.startingSeat >= n) throw new PlayEventError("startingSeat fuera de rango");

  // Los comandantes son las CLAVES del daño acumulado, así que sus ids tienen
  // que ser únicos en toda la mesa: dos asientos con el mismo id mezclarían dos
  // contadores distintos y el umbral de 21 dejaría de significar nada.
  const commanderIds = new Set<string>();
  for (const p of setup.participants) {
    if (p.commanders.length < 1 || p.commanders.length > cfg.maxCommanders) {
      throw new PlayEventError(
        `${p.id}: ${setup.mode} admite 1-${cfg.maxCommanders} comandantes, no ${p.commanders.length}`,
      );
    }
    for (const c of p.commanders) {
      if (commanderIds.has(c.id)) throw new PlayEventError(`id de comandante duplicado: ${c.id}`);
      commanderIds.add(c.id);
    }
  }

  return {
    toolId: "mtg",
    status: "active",
    setup,
    players: setup.participants.map((participant) => ({
      participant,
      life: setup.startingLife,
      poison: 0,
      commanderDamage: {},
      elimination: null,
    })),
    activeSeat: setup.startingSeat,
    round: 1,
    turnCount: 0,
    monarch: null,
    initiative: null,
    eliminationCounter: 0,
    winner: null,
    finishReason: null,
    startedAt: event.at,
    finishedAt: null,
  };
}

function seatOf(state: MtgState, id: string): number {
  const i = state.players.findIndex((p) => p.participant.id === id);
  if (i < 0) throw new PlayEventError(`participante desconocido: ${id}`);
  return i;
}

function withPlayer(
  state: MtgState,
  id: string,
  fn: (p: MtgPlayerState) => MtgPlayerState,
): MtgState {
  const i = seatOf(state, id);
  const players = state.players.slice();
  players[i] = fn(players[i]);
  return { ...state, players };
}

export function mtgReducer(state: MtgState, event: MtgEvent): MtgState {
  // Rechazar es lo que hace fiable la validación por replay al rehidratar (spec §4).
  if (state.status === "finished") throw new PlayEventError(`evento tras game_finished: ${event.type}`);

  switch (event.type) {
    case "game_started":
      throw new PlayEventError("game_started solo puede ser el primer evento");

    case "life_changed": {
      const { target, delta } = event.payload;
      return withPlayer(state, target, (p) => ({ ...p, life: p.life + delta }));
    }

    case "commander_damage": {
      const { source, target, delta } = event.payload;
      if (!modeConfig(state.setup.mode).hasCommanderDamage) {
        throw new PlayEventError(`el modo ${state.setup.mode} no lleva daño de comandante`);
      }
      // `source` es un COMANDANTE, no un jugador: los 21 son de cada comandante
      // por separado y con partner sumarlos mataría antes de tiempo.
      const owner = commanderOwners(state).get(source);
      if (owner === undefined) throw new PlayEventError(`comandante desconocido: ${source}`);
      // El dueño SÍ puede recibir daño de su propio comandante: la regla de los 21
      // cuenta el daño de combate de UN comandante, dé igual quién lo controle en
      // ese momento (te lo roban, una pelea, una redirección). Hubo aquí una
      // validación que lo prohibía y era una regla inventada (partida real,
      // 2026-08-30).
      // Un solo evento semántico toca vidas Y daño de comandante: nunca se pide
      // al usuario mantener dos contadores a mano (issue #931).
      return withPlayer(state, target, (p) => ({
        ...p,
        life: p.life - delta,
        commanderDamage: { ...p.commanderDamage, [source]: (p.commanderDamage[source] ?? 0) + delta },
      }));
    }

    case "poison_changed": {
      const { target, delta } = event.payload;
      return withPlayer(state, target, (p) => ({ ...p, poison: Math.max(0, p.poison + delta) }));
    }

    default:
      return lifecycleReducer(state, event);
  }
}

// Turnos y estados globales — el ciclo de vida (eliminación/fin) se completa en la Task 6.
function lifecycleReducer(state: MtgState, event: MtgEvent): MtgState {
  switch (event.type) {
    case "turn_passed": {
      if (state.players.every((p) => p.elimination)) throw new PlayEventError("no queda nadie vivo");
      const seats = state.players.length;
      let round = state.round;
      let seat = state.activeSeat;
      // El límite de ronda es la POSICIÓN de asiento del inicial, no la persona:
      // si el inicial está eliminado la ronda sigue avanzando (spec §3). Por eso el
      // bucle sigue aquí y no se sustituye por `nextAliveSeat`: esa función responde
      // A QUIÉN le toca (y la UI la usa para nombrarlo), pero la ronda hay que
      // contarla por los asientos que se ATRAVIESAN, eliminados incluidos.
      for (let i = 1; i <= seats; i++) {
        const candidate = (state.activeSeat + i) % seats;
        if (candidate === state.setup.startingSeat) round += 1;
        if (!state.players[candidate].elimination) {
          seat = candidate;
          break;
        }
      }
      return { ...state, activeSeat: seat, round, turnCount: state.turnCount + 1 };
    }

    case "monarch_changed": {
      const { holder } = event.payload;
      if (holder !== null) seatOf(state, holder);
      return { ...state, monarch: holder };
    }

    case "initiative_changed": {
      const { holder } = event.payload;
      if (holder !== null) seatOf(state, holder);
      return { ...state, initiative: holder };
    }

    default:
      return endgameReducer(state, event);
  }
}

// Eliminación, restauración y finalización — Task 6.
function endgameReducer(state: MtgState, event: MtgEvent): MtgState {
  switch (event.type) {
    case "player_eliminated": {
      const { target, reason } = event.payload;
      const i = seatOf(state, target);
      if (state.players[i].elimination) throw new PlayEventError(`ya eliminado: ${target}`);
      const order = state.eliminationCounter + 1;
      const players = state.players.slice();
      players[i] = {
        ...players[i],
        // ronda solo si el tracker de turnos se está usando (es opcional, spec §3)
        elimination: { order, round: state.turnCount > 0 ? state.round : null, reason },
      };
      // Eliminar NUNCA cambia el jugador activo: en Magic puedes morir en tu turno.
      return { ...state, players, eliminationCounter: order };
    }

    case "player_restored": {
      const { target } = event.payload;
      const i = seatOf(state, target);
      if (!state.players[i].elimination) throw new PlayEventError(`no está eliminado: ${target}`);
      const players = state.players.slice();
      players[i] = { ...players[i], elimination: null };
      return { ...state, players };
    }

    case "game_finished": {
      const { winner, reason } = event.payload;
      if (winner !== undefined) {
        const i = seatOf(state, winner);
        // Victoria por carta: NO se exige que el resto esté eliminado (spec §3),
        // pero un ganador eliminado sí es contradictorio.
        if (state.players[i].elimination) throw new PlayEventError("el ganador no puede estar eliminado");
      }
      return {
        ...state,
        status: "finished",
        winner: winner ?? null,
        finishReason: reason ?? null,
        finishedAt: event.at,
      };
    }

    default:
      throw new PlayEventError(`evento desconocido: ${(event as { type: string }).type}`);
  }
}
