import type { CommanderState, EliminationReason } from "./types";

// SOLO detecta y señaliza: eliminar es siempre decisión humana — Magic tiene
// demasiadas excepciones para que el tracker haga de árbitro (issue #931).
export function lossConditions(state: CommanderState, participantId: string): EliminationReason[] {
  const player = state.players.find((p) => p.participant.id === participantId);
  if (!player || player.elimination) return [];
  const out: EliminationReason[] = [];
  if (player.life <= 0) out.push("life");
  if (player.poison >= 10) out.push("poison");
  if (Object.values(player.commanderDamage).some((d) => d >= 21)) out.push("commander_damage");
  return out;
}
