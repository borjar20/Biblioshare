import type { CommanderState } from "./types";
import type { CommanderEvent } from "./events";
import type { EventDescription } from "@/lib/play/core/types";

// Re-exportado por compatibilidad: EventDescription vive en core/types.ts
// (finding 2 de la revisión final) porque es tool-neutral, no propio de
// Commander; este módulo la sigue exponiendo para no romper imports existentes.
export type { EventDescription };

export type RankingEntry = { participantId: string; position: number };

// 100% derivado del estado: nada de ranking en payloads (spec §3). Numeración
// de competición estándar: los empatados comparten posición y la siguiente salta.
export function finalRanking(state: CommanderState): RankingEntry[] {
  const winnerId = state.winner;
  const alive = state.players.filter((p) => !p.elimination && p.participant.id !== winnerId);
  const eliminated = state.players
    .filter((p) => p.elimination)
    .sort((a, b) => b.elimination!.order - a.elimination!.order); // último caído = mejor puesto

  const groups: string[][] = [];
  if (winnerId) groups.push([winnerId]);
  if (alive.length > 0) groups.push(alive.map((p) => p.participant.id)); // empate explícito
  for (const p of eliminated) groups.push([p.participant.id]);

  const out: RankingEntry[] = [];
  let position = 1;
  for (const group of groups) {
    for (const id of group) out.push({ participantId: id, position });
    position += group.length;
  }
  return out;
}

// Estructurado para i18n: la UI traduce `play.log.<key>` con estos params.
// Aquí no hay ni una cadena en español (inv-t-no-cruza + motor sin next-intl).
export function describeEvent(event: CommanderEvent, state: CommanderState): EventDescription {
  const name = (id: string) => state.players.find((p) => p.participant.id === id)?.participant.name ?? id;
  switch (event.type) {
    case "game_started":
      return { key: "started", params: {} };
    case "life_changed": {
      const { target, delta } = event.payload;
      return delta >= 0
        ? { key: "lifeGained", params: { name: name(target), amount: delta } }
        : { key: "lifeLost", params: { name: name(target), amount: -delta } };
    }
    case "commander_damage": {
      const { source, target, delta } = event.payload;
      // El signo se normaliza igual que en life_changed/poison_changed: la UI
      // nunca debe recibir un amount negativo, la dirección la lleva la key
      // (un delta negativo es alcanzable: corrige una tacada de daño excesiva).
      return delta >= 0
        ? { key: "commanderDamage", params: { source: name(source), target: name(target), amount: delta } }
        : { key: "commanderDamageHealed", params: { source: name(source), target: name(target), amount: -delta } };
    }
    case "poison_changed": {
      const { target, delta } = event.payload;
      return delta >= 0
        ? { key: "poisonGained", params: { name: name(target), amount: delta } }
        : { key: "poisonHealed", params: { name: name(target), amount: -delta } };
    }
    case "turn_passed":
      // Ambigüedad deliberada (finding 9 de la revisión final): state.round es
      // el del estado que se le pase, no el del evento. La llamadora (log en
      // vivo) debe pasar el estado POSTERIOR al evento -> aquí sale la ronda
      // NUEVA, que es lo que quiere leer alguien mirando "qué acaba de pasar".
      // Si algún día se describe un evento sobre el estado post-undo, la ronda
      // que sale es la ANTERIOR (defendible también, pero distinto): decídelo a
      // propósito, no lo cambies sin tocar este comentario.
      return { key: "turnPassed", params: { round: state.round } };
    case "monarch_changed": {
      const { holder } = event.payload;
      return holder ? { key: "monarch", params: { name: name(holder) } } : { key: "monarchCleared", params: {} };
    }
    case "initiative_changed": {
      const { holder } = event.payload;
      return holder ? { key: "initiative", params: { name: name(holder) } } : { key: "initiativeCleared", params: {} };
    }
    case "player_eliminated":
      return { key: "eliminated", params: { name: name(event.payload.target) } };
    case "player_restored":
      return { key: "restored", params: { name: name(event.payload.target) } };
    case "game_finished":
      return { key: "finished", params: {} };
  }
}
