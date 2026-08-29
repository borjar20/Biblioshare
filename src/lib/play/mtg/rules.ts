import type { EliminationReason, MtgState } from "./types";
import { modeConfig } from "./modes";

// SOLO detecta y señaliza: eliminar es siempre decisión humana — Magic tiene
// demasiadas excepciones para que el tracker haga de árbitro (issue #931).
export function lossConditions(state: MtgState, participantId: string): EliminationReason[] {
  const player = state.players.find((p) => p.participant.id === participantId);
  if (!player || player.elimination) return [];
  const cfg = modeConfig(state.setup.mode);
  const out: EliminationReason[] = [];
  if (player.life <= 0) out.push("life");
  if (player.poison >= cfg.poisonThreshold) out.push("poison");
  // Los umbrales salen del modo, no de constantes: Duelo no lleva daño de
  // comandante y su tabla lo dice, en vez de que este fichero lo dé por hecho.
  if (cfg.hasCommanderDamage && Object.values(player.commanderDamage).some((d) => d >= cfg.commanderDamageThreshold)) {
    out.push("commander_damage");
  }
  return out;
}

/**
 * Daño de comandante recibido, DESGLOSADO por comandante atacante y en orden de
 * asiento (fijo, para que los números no bailen entre toques). Solo los que han
 * hecho daño: un rival a cero no aporta nada y una mesa de 6 con partner daría
 * hasta diez cifras. Es lo que pinta la tira del panel (fase 1a).
 */
export function commanderDamageBreakdown(
  state: MtgState,
  participantId: string,
): { commanderId: string; commanderName?: string; sourceId: string; amount: number; lethal: boolean }[] {
  const player = state.players.find((p) => p.participant.id === participantId);
  if (!player) return [];
  const cfg = modeConfig(state.setup.mode);
  if (!cfg.hasCommanderDamage) return [];

  const out: { commanderId: string; commanderName?: string; sourceId: string; amount: number; lethal: boolean }[] = [];
  for (const other of state.players) {
    if (other.participant.id === participantId) continue;
    for (const commander of other.participant.commanders) {
      const amount = player.commanderDamage[commander.id] ?? 0;
      if (amount <= 0) continue;
      out.push({
        commanderId: commander.id,
        commanderName: commander.name,
        sourceId: other.participant.id,
        amount,
        lethal: amount >= cfg.commanderDamageThreshold,
      });
    }
  }
  return out;
}
