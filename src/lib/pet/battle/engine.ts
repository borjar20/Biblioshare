// Motor de combate (Parte I §16.1–16.2; contratos C5–C8). Puro: sin Math.random,
// sin Date, sin red. El cliente lo ejecuta para animar en vivo; el servidor lo
// ejecuta para decidir. Un tick = stepBattle; el orden de dentro es normativo.
import { scoreUlti } from "./ulti";
import { validateInputs } from "./inputs";
import { nextBp, nextInt, seedFromHex } from "./prng";
import { enemyStats } from "./power";
import type {
  BattleCause,
  BattleEvent,
  BattleInit,
  BattleInput,
  BattleOutcome,
  BattleResult,
  BattleState,
  BattleView,
  EndReason,
} from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventBody = DistributiveOmit<BattleEvent, "seq" | "tick">;

/** Estado inicial. Consume la PRIMERA tirada del PRNG (duración del reposo inicial). */
export function createBattle(ctx: BattleInit): BattleState {
  const rng = seedFromHex(ctx.seed);
  const es = enemyStats(ctx.enemy, ctx.snapshot);
  const idle = nextInt(rng, ctx.enemy.idleMin, ctx.enemy.idleMax);
  return {
    tick: 0,
    nextSeq: 0,
    ended: false,
    rng,
    pet: {
      hp: ctx.snapshot.hpMax,
      hpMax: ctx.snapshot.hpMax,
      atk: ctx.snapshot.atk,
      nextBasic: ctx.ruleset.pet.basicInterval,
      skillReadyAt: 0,
      skillUses: 0,
      ultiReadyAt: ctx.ruleset.ulti.readyAt,
      ultiUsed: false,
      shield: 0,
    },
    enemy: { hp: es.hpMax, hpMax: es.hpMax, phase: "idle", phaseUntil: idle, nextBasic: ctx.enemy.basicInterval },
    tally: { chargesLanded: 0, chargesInterrupted: 0, skillWasted: 0, damageDealt: 0, damageTaken: 0 },
    result: null,
  };
}

export function viewOf(st: BattleState): BattleView {
  return {
    tick: st.tick,
    petHp: st.pet.hp,
    petHpMax: st.pet.hpMax,
    enemyHp: st.enemy.hp,
    enemyHpMax: st.enemy.hpMax,
    enemyPhase: st.enemy.phase,
    enemyPhaseUntil: st.enemy.phaseUntil,
    skillReadyAt: st.pet.skillReadyAt,
    ultiReadyAt: st.pet.ultiReadyAt,
    ultiUsed: st.pet.ultiUsed,
    shield: st.pet.shield,
    ended: st.ended,
  };
}

/** Un tick. `inputs`: los de ESTE tick, validados y en orden de seq. Devuelve sus eventos.
 *  Orden (C5): 0 arranque · 1 transiciones del enemigo · 2 inputs · 3 básica de la
 *  mascota · 4 básica del enemigo · 5 límite. Un KO corta el tick en el acto. */
export function stepBattle(ctx: BattleInit, st: BattleState, inputs: readonly BattleInput[]): BattleEvent[] {
  if (st.ended) throw new Error("BATTLE_ENDED");
  if (!validateInputs(inputs.map((input, seq) => ({ ...input, seq })), ctx.ruleset).ok) throw new Error("INVALID_INPUTS");
  const T = st.tick;
  const R = ctx.ruleset;
  const E = ctx.enemy;
  const es = enemyStats(E, ctx.snapshot);
  const out: BattleEvent[] = [];

  const emit = (body: EventBody) => {
    out.push({ seq: st.nextSeq++, tick: T, ...body } as BattleEvent);
  };
  const hurtPet = (dmg: number) => {
    const absorbed = Math.min(dmg, st.pet.shield);
    st.pet.shield -= absorbed;
    const d = Math.min(dmg - absorbed, st.pet.hp);
    st.pet.hp -= d;
    st.tally.damageTaken += d;
    return d;
  };
  const hurtEnemy = (dmg: number) => {
    const d = Math.min(dmg * (st.enemy.phase === "vulnerable" ? 2 : 1), st.enemy.hp);
    st.enemy.hp -= d;
    st.tally.damageDealt += d;
    return d;
  };
  const finish = (reason: EndReason, outcome: BattleOutcome) => {
    st.ended = true;
    st.result = {
      outcome,
      reason,
      ticks: T,
      petHp: st.pet.hp,
      petHpMax: st.pet.hpMax,
      enemyHp: st.enemy.hp,
      enemyHpMax: st.enemy.hpMax,
      damageDealt: st.tally.damageDealt,
      damageTaken: st.tally.damageTaken,
      causes: causesFor(st, outcome, reason, es),
    };
    emit({ type: "BATTLE_ENDED", outcome, reason, petHp: st.pet.hp, enemyHp: st.enemy.hp });
  };
  const koCheck = (): boolean => {
    if (st.pet.hp === 0) {
      finish("ko", "lose");
      return true;
    }
    if (st.enemy.hp === 0) {
      finish("ko", "win");
      return true;
    }
    return false;
  };
  const toIdle = () => {
    st.enemy.phase = "idle";
    st.enemy.phaseUntil = T + nextInt(st.rng, E.idleMin, E.idleMax);
    st.enemy.nextBasic = T + E.basicInterval;
  };

  // 0. Arranque
  if (T === 0) emit({ type: "BATTLE_STARTED", petHp: st.pet.hp, enemyHp: st.enemy.hp });

  // 1. Transiciones del enemigo: primero lo que expira o resuelve, después el reposo que termina
  if (st.enemy.phaseUntil === T) {
    switch (st.enemy.phase) {
      case "windup": {
        const d = hurtPet(es.charge);
        st.tally.chargesLanded++;
        emit({ type: "TELEGRAPH_RESOLVED", kind: "charge", damage: d, petHp: st.pet.hp, shield: st.pet.shield });
        // An intent selected from the previous view is ignored when this transition ends the battle.
        if (koCheck()) return out;
        toIdle();
        break;
      }
      case "guard":
        emit({ type: "TELEGRAPH_RESOLVED", kind: "guard", damage: 0, petHp: st.pet.hp, shield: st.pet.shield });
        if (E.vulnerableTicks) { st.enemy.phase = "vulnerable"; st.enemy.phaseUntil = T + E.vulnerableTicks; emit({ type: "STATUS_APPLIED", status: "vulnerable", until: st.enemy.phaseUntil }); }
        else toIdle();
        break;
      case "vulnerable":
        emit({ type: "STATUS_EXPIRED", status: "vulnerable" });
        toIdle();
        break;
      case "stagger":
        emit({ type: "STATUS_EXPIRED", status: "stagger" });
        toIdle();
        break;
      case "idle": {
        const charge = nextBp(st.rng) < E.chargeBp;
        st.enemy.phase = charge ? "windup" : "guard";
        st.enemy.phaseUntil = T + (charge ? E.windupTicks : E.guardTicks);
        emit({ type: "TELEGRAPH_STARTED", kind: charge ? "charge" : "guard", resolvesAt: st.enemy.phaseUntil });
        break;
      }
    }
  }

  // 2. Inputs de este tick
  for (let k = 0; k < inputs.length; k++) {
    // Agrupar por tick es cosa de quien llama: un input de otro tick es un bug, no un error del cliente.
    if (inputs[k].tick !== T) throw new Error("INPUT_TICK");
    switch (inputs[k].action) {
      case "ulti": {
        if (T < st.pet.ultiReadyAt || st.pet.ultiUsed) throw new Error("INVALID_INPUTS");
        const score = scoreUlti(ctx.seed, T, inputs[k].payload.order as string);
        st.pet.ultiUsed = true;
        const bonus = score.recipe === "power" ? Math.floor(st.pet.atk * R.ulti.powerMul * score.matches / 4) : 0;
        const shield = score.recipe === "guard" ? Math.floor(st.pet.hpMax * R.ulti.shieldPct * score.matches / 400) : 0;
        st.pet.shield += shield;
        const damage = hurtEnemy(st.pet.atk * R.ulti.baseMul + bonus);
        emit({ type: "ULTI_USED", ...score, damage, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        if (koCheck()) { if (k + 1 < inputs.length) throw new Error("INPUTS_AFTER_END"); return out; }
        continue;
      }
      case "skill": {
        if (T < st.pet.skillReadyAt) {
          emit({ type: "SKILL_IGNORED", reason: "cooldown" });
          continue;
        }
        st.pet.skillReadyAt = T + R.pet.skillCooldown;
        st.pet.skillUses++;
        if (st.enemy.phase === "windup") {
          const d = hurtEnemy(st.pet.atk * R.pet.skillInterruptMul);
          st.tally.chargesInterrupted++;
          st.enemy.phase = "stagger";
          st.enemy.phaseUntil = T + E.staggerTicks;
          emit({ type: "SKILL_USED", effect: "interrupt", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
          emit({ type: "STATUS_APPLIED", status: "stagger", until: st.enemy.phaseUntil });
        } else if (st.enemy.phase === "guard") {
          hurtPet(es.punish);
          st.tally.skillWasted++;
          emit({ type: "SKILL_USED", effect: "wasted", damage: 0, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        } else {
          const d = hurtEnemy(st.pet.atk * R.pet.skillIdleMul);
          emit({ type: "SKILL_USED", effect: st.enemy.phase === "vulnerable" ? "vulnerable" : "hit", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        }
        if (koCheck()) { if (k + 1 < inputs.length) throw new Error("INPUTS_AFTER_END"); return out; }
        break;
      }
      default:
        throw new Error("INPUT_ACTION");
    }
  }

  // 3. Básica de la mascota
  if (T === st.pet.nextBasic) {
    const guarded = st.enemy.phase === "guard";
    const d = hurtEnemy(guarded ? Math.max(1, Math.floor(st.pet.atk / R.pet.guardBasicDiv)) : st.pet.atk);
    st.pet.nextBasic = T + R.pet.basicInterval;
    emit({ type: "PET_BASIC", damage: d, enemyHp: st.enemy.hp, guarded });
    if (koCheck()) return out;
  }

  // 4. Básica del enemigo, solo en reposo
  if (st.enemy.phase === "idle" && T === st.enemy.nextBasic) {
    const d = hurtPet(es.basic);
    st.enemy.nextBasic = T + E.basicInterval;
    emit({ type: "ENEMY_BASIC", damage: d, petHp: st.pet.hp, shield: st.pet.shield });
    if (koCheck()) return out;
  }

  // 5. Límite de tiempo: gana la mayor fracción de vida; empate = draw
  if (T === R.maxTicks) {
    const pet = BigInt(st.pet.hp) * BigInt(st.enemy.hpMax);
    const enemy = BigInt(st.enemy.hp) * BigInt(st.pet.hpMax);
    finish("limit", pet > enemy ? "win" : pet < enemy ? "lose" : "draw");
    return out;
  }

  st.tick = T + 1;
  return out;
}

function causesFor(
  st: BattleState,
  outcome: BattleOutcome,
  reason: EndReason,
  es: { charge: number; punish: number },
): BattleCause[] {
  const t = st.tally;
  if (outcome === "win") return [t.chargesInterrupted > 0 ? "charges_interrupted" : "steady_damage"];
  const causes: BattleCause[] = [];
  if (st.pet.skillUses === 0 && t.chargesLanded > 0) causes.push("skill_unused");
  const byDamage: Array<[BattleCause, number]> = [
    ["charges_landed", t.chargesLanded * es.charge],
    ["skill_wasted_on_guard", t.skillWasted * es.punish],
  ];
  byDamage.sort((a, b) => b[1] - a[1]);
  for (const [cause, dmg] of byDamage) if (dmg > 0) causes.push(cause);
  if (reason === "limit") causes.push("time_limit");
  return causes.slice(0, 2);
}

/** Simulación completa: la del servidor (y la del CLI). `inputs` validados y ordenados por tick. */
export function simulate(ctx: BattleInit, inputs: readonly BattleInput[]): { events: BattleEvent[]; result: BattleResult } {
  if (!validateInputs(inputs, ctx.ruleset).ok) throw new Error("INVALID_INPUTS");
  const st = createBattle(ctx);
  const events: BattleEvent[] = [];
  let i = 0;
  while (!st.ended) {
    const at: BattleInput[] = [];
    while (i < inputs.length && inputs[i].tick === st.tick) at.push(inputs[i++]);
    events.push(...stepBattle(ctx, st, at));
  }
  if (i < inputs.length) throw new Error("INPUTS_AFTER_END");
  return { events, result: st.result as BattleResult };
}
