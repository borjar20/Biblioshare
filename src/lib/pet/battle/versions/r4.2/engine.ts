// Motor de combate (Parte I §16.1–16.2; contratos C5–C8). Puro: sin Math.random,
// sin Date, sin red. r4.1: una cadena de tramos es un solo combate (spec R4a §3).
import { scoreUlti } from "./ulti";
import { isEquipment, lootBonus, scaleLootEffect } from "./equipment";
import { validateInputs } from "./inputs";
import { nextBp, nextInt, seedFromHex } from "./prng";
import { enemyStats } from "./power";
import type {
  BattleCause, BattleEvent, BattleInit, BattleInput, BattleOutcome, BattleResult, BattleState, BattleView, EndReason, EnemyDef,
} from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventBody = DistributiveOmit<BattleEvent, "seq" | "tick">;

function enemyOf(ctx: BattleInit, fight: number): EnemyDef {
  const e = ctx.enemies[fight - 1];
  if (!e) throw new Error("NO_ENEMY");
  return e;
}

/** Estado inicial. Consume la PRIMERA tirada del PRNG (duración del reposo inicial). */
export function createBattle(ctx: BattleInit): BattleState {
  if (!isEquipment(ctx.snapshot.equipment)) throw new Error("INVALID_EQUIPMENT");
  if (!Array.isArray(ctx.enemies) || ctx.enemies.length < 1 || ctx.enemies.length > ctx.ruleset.adventure.chainLength) throw new Error("BAD_CHAIN");
  const rng = seedFromHex(ctx.seed);
  const E = enemyOf(ctx, 1);
  const es = enemyStats(E, ctx.snapshot);
  const idle = nextInt(rng, E.idleMin, E.idleMax);
  return {
    tick: 0, nextSeq: 0, ended: false, rng,
    fight: 1, fights: ctx.enemies.length, fightStart: 0,
    pet: {
      hp: ctx.snapshot.hpMax, hpMax: ctx.snapshot.hpMax, atk: ctx.snapshot.atk,
      nextBasic: ctx.ruleset.pet.basicInterval, skillReadyAt: 0, skillUses: 0,
      ultiReadyAt: ctx.ruleset.ulti.readyAt, ultiUsed: false, shield: 0,
    },
    enemy: { hp: es.hpMax, hpMax: es.hpMax, phase: "idle", phaseUntil: idle, nextBasic: E.basicInterval },
    tally: { chargesLanded: 0, chargesInterrupted: 0, skillWasted: 0, damageDealt: 0, damageTaken: 0 },
    result: null,
  };
}

export function viewOf(st: BattleState): BattleView {
  return {
    tick: st.tick, petHp: st.pet.hp, petHpMax: st.pet.hpMax, enemyHp: st.enemy.hp, enemyHpMax: st.enemy.hpMax,
    enemyPhase: st.enemy.phase, enemyPhaseUntil: st.enemy.phaseUntil, skillReadyAt: st.pet.skillReadyAt,
    ultiReadyAt: st.pet.ultiReadyAt, ultiUsed: st.pet.ultiUsed, shield: st.pet.shield, ended: st.ended,
    fight: st.fight, fights: st.fights,
  };
}

/** Un tick. Orden (C5): 0 arranque/tramo · 1 transiciones · 2 inputs · 3 básica mascota ·
 *  4 básica enemigo · 5 límite del tramo. Un KO corta el tick en el acto; un KO del enemigo
 *  a mitad de cadena también, y el tick siguiente arranca el tramo siguiente. */
export function stepBattle(ctx: BattleInit, st: BattleState, inputs: readonly BattleInput[]): BattleEvent[] {
  if (st.ended) throw new Error("BATTLE_ENDED");
  if (!validateInputs(inputs.map((input, seq) => ({ ...input, seq })), ctx.ruleset, st.fights).ok) throw new Error("INVALID_INPUTS");
  const T = st.tick;
  const R = ctx.ruleset;
  const E = enemyOf(ctx, st.fight);
  const es = enemyStats(E, ctx.snapshot);
  const out: BattleEvent[] = [];

  const emit = (body: EventBody) => { out.push({ seq: st.nextSeq++, tick: T, ...body } as BattleEvent); };
  const { weapon, amulet } = ctx.snapshot.equipment;
  const loot = (copy: NonNullable<typeof weapon>, effect: "damage" | "shield" | "heal" | "cooldown" | "vulnerability", amount: number) => {
    if (amount > 0) emit({ type: "LOOT_EFFECT", itemId: copy.itemId, copyId: copy.copyId, effect, amount });
  };
  const hurtPet = (dmg: number) => {
    const absorbed = Math.min(dmg, st.pet.shield);
    st.pet.shield -= absorbed;
    const d = Math.min(dmg - absorbed, st.pet.hp);
    st.pet.hp -= d; st.tally.damageTaken += d;
    return d;
  };
  const hurtEnemy = (dmg: number) => {
    const d = Math.min(dmg * (st.enemy.phase === "vulnerable" ? 2 : 1), st.enemy.hp);
    st.enemy.hp -= d; st.tally.damageDealt += d;
    return d;
  };
  const finish = (reason: EndReason, outcome: BattleOutcome) => {
    st.ended = true;
    st.result = {
      outcome, reason, ticks: T, petHp: st.pet.hp, petHpMax: st.pet.hpMax, enemyHp: st.enemy.hp, enemyHpMax: st.enemy.hpMax,
      damageDealt: st.tally.damageDealt, damageTaken: st.tally.damageTaken, causes: causesFor(st, outcome, reason, es), fight: st.fight,
    };
    emit({ type: "BATTLE_ENDED", outcome, reason, petHp: st.pet.hp, enemyHp: st.enemy.hp });
  };
  /** Frontera de tramo (§3): la vida se arrastra; habilidad, ulti y barrera vuelven a cero
   *  relativos al tick siguiente; el enemigo nuevo se instancia desde el PRNG, sin reseed. */
  const nextFight = () => {
    const start = T + 1;
    st.fight++; st.fightStart = start;
    const N = enemyOf(ctx, st.fight);
    const ns = enemyStats(N, ctx.snapshot);
    st.pet.nextBasic = start + R.pet.basicInterval; st.pet.skillReadyAt = start;
    st.pet.ultiReadyAt = start + R.ulti.readyAt; st.pet.ultiUsed = false; st.pet.shield = 0;
    st.enemy = { hp: ns.hpMax, hpMax: ns.hpMax, phase: "idle", phaseUntil: start + nextInt(st.rng, N.idleMin, N.idleMax), nextBasic: start + N.basicInterval };
    st.tick = start;
  };
  const koCheck = (): boolean => {
    if (st.pet.hp === 0) { finish("ko", "lose"); return true; }
    if (st.enemy.hp === 0) {
      if (st.fight === st.fights) { finish("ko", "win"); return true; }
      emit({ type: "FIGHT_ENDED", fight: st.fight, petHp: st.pet.hp });
      nextFight();
      return true;
    }
    return false;
  };
  const toIdle = () => {
    st.enemy.phase = "idle";
    st.enemy.phaseUntil = T + nextInt(st.rng, E.idleMin, E.idleMax);
    st.enemy.nextBasic = T + E.basicInterval;
  };

  // 0. Arranque del combate o del tramo
  if (T === 0) emit({ type: "BATTLE_STARTED", petHp: st.pet.hp, enemyHp: st.enemy.hp });
  else if (T === st.fightStart) emit({ type: "FIGHT_STARTED", fight: st.fight, enemyId: E.id, petHp: st.pet.hp, enemyHp: st.enemy.hp });
  if (T === st.fightStart && st.fight > 1 && amulet?.itemId === "streak_medallion") {
    const healed = Math.min(st.pet.hpMax - st.pet.hp, lootBonus(st.pet.hpMax, R.loot.healPct, amulet.qualityBp));
    st.pet.hp += healed;
    loot(amulet, "heal", healed);
  }

  // 1. Transiciones del enemigo
  if (st.enemy.phaseUntil === T) {
    switch (st.enemy.phase) {
      case "windup": {
        const d = hurtPet(es.charge);
        st.tally.chargesLanded++;
        emit({ type: "TELEGRAPH_RESOLVED", kind: "charge", damage: d, petHp: st.pet.hp, shield: st.pet.shield });
        if (koCheck()) return out;
        toIdle();
        break;
      }
      case "guard":
        emit({ type: "TELEGRAPH_RESOLVED", kind: "guard", damage: 0, petHp: st.pet.hp, shield: st.pet.shield });
        if (E.vulnerableTicks) {
          const extra = weapon?.itemId === "librarian_loupe" ? scaleLootEffect(R.loot.vulnerabilityTicks, weapon.qualityBp) : 0;
          st.enemy.phase = "vulnerable"; st.enemy.phaseUntil = T + E.vulnerableTicks + extra;
          emit({ type: "STATUS_APPLIED", status: "vulnerable", until: st.enemy.phaseUntil });
          if (weapon) loot(weapon, "vulnerability", extra);
        }
        else toIdle();
        break;
      case "vulnerable":
        emit({ type: "STATUS_EXPIRED", status: "vulnerable" }); toIdle(); break;
      case "stagger":
        emit({ type: "STATUS_EXPIRED", status: "stagger" }); toIdle(); break;
      case "idle": {
        const charge = nextBp(st.rng) < E.chargeBp;
        st.enemy.phase = charge ? "windup" : "guard";
        st.enemy.phaseUntil = T + (charge ? E.windupTicks : E.guardTicks);
        emit({ type: "TELEGRAPH_STARTED", kind: charge ? "charge" : "guard", resolvesAt: st.enemy.phaseUntil });
        break;
      }
    }
  }

  // 2. Inputs de este tick (#1086: una rama por acción; lo desconocido lanza)
  for (let k = 0; k < inputs.length; k++) {
    if (inputs[k].tick !== T) throw new Error("INPUT_TICK");
    switch (inputs[k].action) {
      case "ulti": {
        if (T < st.pet.ultiReadyAt || st.pet.ultiUsed) throw new Error("INVALID_INPUTS");
        const score = scoreUlti(ctx.seed, T, inputs[k].payload.order as string);
        st.pet.ultiUsed = true;
        const bonus = score.recipe === "power" ? Math.floor(st.pet.atk * R.ulti.powerMul * score.matches / 4) : 0;
        const shield = score.recipe === "guard" ? Math.floor(st.pet.hpMax * R.ulti.shieldPct * score.matches / 400) : 0;
        st.pet.shield += shield;
        const extraDamage = weapon?.itemId === "heavy_ink_quill" && score.recipe === "power"
          ? lootBonus(st.pet.atk * R.ulti.powerMul, R.loot.powerPct * score.matches, weapon.qualityBp) / 4 : 0;
        const addedShield = amulet?.itemId === "last_page_amulet" ? lootBonus(st.pet.hpMax, R.loot.ultiShieldPct, amulet.qualityBp) : 0;
        st.pet.shield += addedShield;
        const baseDamage = st.pet.atk * R.ulti.baseMul + bonus;
        const withoutLoot = Math.min(baseDamage * (st.enemy.phase === "vulnerable" ? 2 : 1), st.enemy.hp);
        const damage = hurtEnemy(baseDamage + Math.floor(extraDamage));
        emit({ type: "ULTI_USED", ...score, damage, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        if (weapon) loot(weapon, "damage", damage - withoutLoot);
        if (amulet) loot(amulet, "shield", addedShield);
        break;
      }
      case "skill": {
        if (T < st.pet.skillReadyAt) { emit({ type: "SKILL_IGNORED", reason: "cooldown" }); continue; }
        st.pet.skillReadyAt = T + R.pet.skillCooldown;
        st.pet.skillUses++;
        if (st.enemy.phase === "windup") {
          const base = st.pet.atk * R.pet.skillInterruptMul;
          const withoutLoot = Math.min(base, st.enemy.hp);
          const extra = weapon?.itemId === "sharp_bookmark" ? lootBonus(base, R.loot.interruptPct, weapon.qualityBp) : 0;
          const d = hurtEnemy(base + extra);
          const faster = amulet?.itemId === "loan_pendant" ? Math.min(R.pet.skillCooldown - 1, scaleLootEffect(R.loot.cooldownTicks, amulet.qualityBp)) : 0;
          st.pet.skillReadyAt -= faster;
          st.tally.chargesInterrupted++;
          st.enemy.phase = "stagger"; st.enemy.phaseUntil = T + E.staggerTicks;
          emit({ type: "SKILL_USED", effect: "interrupt", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
          emit({ type: "STATUS_APPLIED", status: "stagger", until: st.enemy.phaseUntil });
          if (weapon) loot(weapon, "damage", d - withoutLoot);
          if (amulet) loot(amulet, "cooldown", faster);
        } else if (st.enemy.phase === "guard") {
          hurtPet(es.punish);
          st.tally.skillWasted++;
          emit({ type: "SKILL_USED", effect: "wasted", damage: 0, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        } else {
          const d = hurtEnemy(st.pet.atk * R.pet.skillIdleMul);
          emit({ type: "SKILL_USED", effect: st.enemy.phase === "vulnerable" ? "vulnerable" : "hit", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        }
        break;
      }
      default:
        // validateInputs y el motor se han desincronizado: bug nuestro, no del cliente.
        throw new Error("UNKNOWN_ACTION");
    }
    if (koCheck()) {
      if (k + 1 < inputs.length) throw new Error(st.ended ? "INPUTS_AFTER_END" : "INPUTS_AFTER_FIGHT");
      return out;
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

  // 5. Límite del tramo: en cadena es derrota; en entrenamiento, la fracción de vida de r3.1
  if (T === st.fightStart + R.maxTicks) {
    if (st.fights > 1) { finish("limit", "lose"); return out; }
    const pet = BigInt(st.pet.hp) * BigInt(st.enemy.hpMax);
    const enemy = BigInt(st.enemy.hp) * BigInt(st.pet.hpMax);
    finish("limit", pet > enemy ? "win" : pet < enemy ? "lose" : "draw");
    return out;
  }

  st.tick = T + 1;
  return out;
}

function causesFor(st: BattleState, outcome: BattleOutcome, reason: EndReason, es: { charge: number; punish: number }): BattleCause[] {
  const t = st.tally;
  if (outcome === "win") return [t.chargesInterrupted > 0 ? "charges_interrupted" : "steady_damage"];
  const causes: BattleCause[] = [];
  if (st.pet.skillUses === 0 && t.chargesLanded > 0) causes.push("skill_unused");
  const byDamage: Array<[BattleCause, number]> = [["charges_landed", t.chargesLanded * es.charge], ["skill_wasted_on_guard", t.skillWasted * es.punish]];
  byDamage.sort((a, b) => b[1] - a[1]);
  for (const [cause, dmg] of byDamage) if (dmg > 0) causes.push(cause);
  if (reason === "limit") causes.push("time_limit");
  return causes.slice(0, 2);
}

/** Simulación completa: la del servidor (y la del CLI). `inputs` validados y ordenados por tick. */
export function simulate(ctx: BattleInit, inputs: readonly BattleInput[]): { events: BattleEvent[]; result: BattleResult } {
  if (!validateInputs(inputs, ctx.ruleset, ctx.enemies.length).ok) throw new Error("INVALID_INPUTS");
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
