// Políticas = clientes de mentira: deciden en cada tick, viendo lo mismo que vería
// la UI (BattleView), si pulsan la habilidad o la ulti. Sirven para calibrar (Task 7)
// y para demostrar que el log de inputs reproduce el combate (C4).
import { createBattle, stepBattle, viewOf } from "./engine";
import { createUltiPuzzle } from "./ulti";
import type { BattleEvent, BattleInit, BattleInput, BattleResult, BattleView } from "./types";

export const POLICY_IDS = ["never", "spam", "interrupt", "interrupt_ulti"] as const;
export type PolicyId = (typeof POLICY_IDS)[number];

/** `false` no interviene; `true`/`"skill"` pulsa la habilidad; `{ ulti }` lanza la ulti con ese orden. */
export type PolicyDecision = false | true | "skill" | { ulti: string };
export type Policy = (view: BattleView, ctx: BattleInit) => PolicyDecision;

export const POLICIES: Record<PolicyId, Policy> = {
  /** Espectador puro: nunca interviene. */
  never: () => false,
  /** Pulsa en cuanto el cooldown lo permite, esté el enemigo como esté. */
  spam: (v) => v.tick >= v.skillReadyAt,
  /** Guarda la habilidad y la suelta solo durante la carga. */
  interrupt: (v) => v.tick >= v.skillReadyAt && v.enemyPhase === "windup",
  /** Referencia de calibración desde R4a: interrumpe cargas y lanza la ulti en cuanto está lista con la receta Potencia perfecta. */
  interrupt_ulti: (v, ctx) => {
    if (v.tick >= v.ultiReadyAt && !v.ultiUsed) {
      const power = createUltiPuzzle(ctx.seed, v.tick).recipes.find((r) => r.id === "power")!;
      return { ulti: power.order.join("") };
    }
    return v.tick >= v.skillReadyAt && v.enemyPhase === "windup";
  },
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
    const decision = policy(viewOf(st), ctx);
    if (decision === true || decision === "skill") {
      const input: BattleInput = { seq: inputs.length, tick: st.tick, action: "skill", payload: {} };
      inputs.push(input);
      at.push(input);
    } else if (decision && typeof decision === "object") {
      const input: BattleInput = { seq: inputs.length, tick: st.tick, action: "ulti", payload: { order: decision.ulti } };
      inputs.push(input);
      at.push(input);
    }
    events.push(...stepBattle(ctx, st, at));
  }
  return { inputs, events, result: st.result as BattleResult };
}
