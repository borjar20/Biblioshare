import { makeEvent } from "@/lib/play/core/events";
import type { CommanderParticipant, CommanderSetup } from "./types";
import type { CommanderEvent, GameStartedEvent } from "./events";

export function guest(id: string): CommanderParticipant {
  return { id, kind: "guest", name: id };
}

export function makeSetup(ids: string[] = ["ana", "borja", "carlos", "laura"]): CommanderSetup {
  return { participants: ids.map(guest), startingLife: 40, startingSeat: 0 };
}

export function started(at = 1000, setup: CommanderSetup = makeSetup()): GameStartedEvent {
  return makeEvent("game_started", { toolId: "commander" as const, setup }, at, `e-start-${at}`);
}

let seq = 0;
// Constructor abreviado para tests: id secuencial legible, at explícito.
export function ev<E extends CommanderEvent>(type: E["type"], payload: E["payload"], at: number): E {
  seq += 1;
  return makeEvent(type, payload, at, `e-${seq}`) as E;
}
