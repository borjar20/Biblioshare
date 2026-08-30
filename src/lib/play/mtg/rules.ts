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
 * A qué asiento le toca después del activo, saltando eliminados. Vive aquí y no
 * duplicado en la UI porque la consola («pasar el turno a…») y la hoja de partida
 * tienen que nombrar EXACTAMENTE a quien el reducer va a poner activo: dos copias de
 * esta regla se desincronizan a la primera eliminación.
 *
 * Si no queda nadie más vivo, devuelve el asiento activo: no es sitio para decidir
 * que la partida acabó — eso lo hace la mesa.
 */
export function nextAliveSeat(state: MtgState): number {
  const seats = state.players.length;
  for (let i = 1; i <= seats; i++) {
    const candidate = (state.activeSeat + i) % seats;
    if (!state.players[candidate].elimination) return candidate;
  }
  return state.activeSeat;
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
    // El PROPIO comandante también entra: puede hacerte los 21 (robos, peleas,
    // redirecciones) y el reducer lo acepta. Como solo salen los que tienen daño
    // > 0, no añade ruido a la tira en el caso normal.
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
