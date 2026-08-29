import { makeEvent } from "@/lib/play/core/events";
import type { MtgParticipant, MtgSetup } from "./types";
import type { MtgEvent, GameStartedEvent } from "./events";
import type { MtgMode } from "./modes";
import { modeConfig } from "./modes";

/** Un comandante por asiento, con id derivado del jugador: `ana` -> `ana-c1`. */
export function guest(id: string): MtgParticipant {
  return { id, kind: "guest", name: id, commanders: [{ id: `${id}-c1` }] };
}

/** Asiento con partner: dos comandantes, dos contadores de 21 independientes. */
export function guestWithPartner(id: string): MtgParticipant {
  return { id, kind: "guest", name: id, commanders: [{ id: `${id}-c1` }, { id: `${id}-c2` }] };
}

export function makeSetup(
  ids: string[] = ["ana", "borja", "carlos", "laura"],
  mode: MtgMode = "commander",
): MtgSetup {
  return { mode, participants: ids.map(guest), startingLife: modeConfig(mode).startingLife, startingSeat: 0 };
}

export function started(at = 1000, setup: MtgSetup = makeSetup()): GameStartedEvent {
  return makeEvent("game_started", { toolId: "mtg" as const, setup }, at, `e-start-${at}`);
}

let seq = 0;
// Constructor abreviado para tests: id secuencial legible, at explícito.
export function ev<E extends MtgEvent>(type: E["type"], payload: E["payload"], at: number): E {
  seq += 1;
  return makeEvent(type, payload, at, `e-${seq}`) as E;
}
