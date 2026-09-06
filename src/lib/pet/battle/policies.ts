// Políticas = clientes de mentira: deciden en cada tick, viendo lo mismo que vería
// la UI (BattleView), si pulsan la habilidad. Sirven para calibrar (Task 7) y
// para demostrar que el log de inputs reproduce el combate (C4).
import { createBattle, stepBattle, viewOf } from "./engine";
import type { BattleEvent, BattleInit, BattleInput, BattleResult, BattleView } from "./types";

export const POLICY_IDS = ["never", "spam", "interrupt"] as const;
export type PolicyId = (typeof POLICY_IDS)[number];
export type Policy = (view: BattleView) => boolean;

export const POLICIES: Record<PolicyId, Policy> = {
  /** Espectador puro: nunca interviene. */
  never: () => false,
  /** Pulsa en cuanto el cooldown lo permite, esté el enemigo como esté. */
  spam: (v) => v.tick >= v.skillReadyAt,
  /** Guarda la habilidad y la suelta solo durante la carga. */
  interrupt: (v) => v.tick >= v.skillReadyAt && v.enemyPhase === "windup",
};

export function runPolicy(
  ctx: BattleInit,
  policy: Policy,
): { inputs: BattleInput[]; events: BattleEvent[]; result: BattleResult } {
  const st = createBattle(ctx);
  const inputs: BattleInput[] = [];
  const events: BattleEvent[] = [];
  while (!st.ended) {
    const at: BattleInput[] = [];
    if (policy(viewOf(st))) {
      const input: BattleInput = { seq: inputs.length, tick: st.tick, action: "skill", payload: {} };
      inputs.push(input);
      at.push(input);
    }
    events.push(...stepBattle(ctx, st, at));
  }
  return { inputs, events, result: st.result as BattleResult };
}
