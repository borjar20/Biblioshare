// Tipos del combate (Parte I §16; contratos C3–C10 del plan R1). Todo entero.
import type { PetAttributes, PetClass, PetStage } from "../../../classes";
import type { PrngState } from "./prng";

/** R2: una sola acción. R3 añade "ulti" y "ulti_assign". */
export type BattleAction = "skill";

/** Una entrada del log (C4). `payload` vacío en R2; valores enteros o cadenas. */
export interface BattleInput {
  seq: number;
  tick: number;
  action: BattleAction;
  payload: Record<string, number | string>;
}

/** Foto inmutable de la mascota al crear el combate; se guarda en pet_battles.snapshot. */
export interface BattleSnapshot {
  name: string;
  petClass: PetClass;
  stage: PetStage;
  /** Atributos crudos, sin bonus de clase. */
  attributes: PetAttributes;
  /** powerTier(attributes): NO es el nivel visible (C7). */
  tier: number;
  hpMax: number;
  atk: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** vida = hpPerAtk × atk de la mascota */
  hpPerAtk: number;
  /** básica en reposo = % de la vida máxima de la mascota */
  basicPct: number;
  /** carga no interrumpida = % de la vida máxima */
  chargePct: number;
  /** castigo por habilidad durante la guardia = % de la vida máxima */
  punishPct: number;
  /** probabilidad de carga (frente a guardia), en puntos básicos */
  chargeBp: number;
  idleMin: number;
  idleMax: number;
  windupTicks: number;
  guardTicks: number;
  staggerTicks: number;
  /** ticks entre básicas del enemigo en reposo */
  basicInterval: number;
}

export interface Ruleset {
  version: string;
  tickMs: number;
  maxTicks: number;
  maxInputs: number;
  pet: {
    basicInterval: number;
    skillCooldown: number;
    skillIdleMul: number;
    skillInterruptMul: number;
    guardBasicDiv: number;
  };
}

export type EnemyPhase = "idle" | "windup" | "guard" | "stagger";
export type TelegraphKind = "charge" | "guard";
export type SkillEffect = "interrupt" | "hit" | "wasted";
export type BattleOutcome = "win" | "lose" | "draw";
export type EndReason = "ko" | "limit";
export type BattleCause =
  | "charges_landed"
  | "skill_wasted_on_guard"
  | "skill_unused"
  | "charges_interrupted"
  | "steady_damage"
  | "time_limit";

interface Ev<T extends string> {
  seq: number;
  tick: number;
  type: T;
}

export type BattleEvent =
  | (Ev<"BATTLE_STARTED"> & { petHp: number; enemyHp: number })
  | (Ev<"PET_BASIC"> & { damage: number; enemyHp: number; guarded: boolean })
  | (Ev<"ENEMY_BASIC"> & { damage: number; petHp: number })
  | (Ev<"TELEGRAPH_STARTED"> & { kind: TelegraphKind; resolvesAt: number })
  | (Ev<"TELEGRAPH_RESOLVED"> & { kind: TelegraphKind; damage: number; petHp: number })
  | (Ev<"SKILL_USED"> & { effect: SkillEffect; damage: number; enemyHp: number; petHp: number })
  | (Ev<"SKILL_IGNORED"> & { reason: "cooldown" })
  | (Ev<"STATUS_APPLIED"> & { status: "stagger"; until: number })
  | (Ev<"STATUS_EXPIRED"> & { status: "stagger" })
  | (Ev<"BATTLE_ENDED"> & { outcome: BattleOutcome; reason: EndReason; petHp: number; enemyHp: number });

export interface BattleResult {
  outcome: BattleOutcome;
  reason: EndReason;
  ticks: number;
  petHp: number;
  petHpMax: number;
  enemyHp: number;
  enemyHpMax: number;
  damageDealt: number;
  damageTaken: number;
  /** Hasta dos causas (C8), para el resultado legible de R2. */
  causes: BattleCause[];
}

export interface BattleState {
  tick: number;
  nextSeq: number;
  ended: boolean;
  rng: PrngState;
  pet: { hp: number; hpMax: number; atk: number; nextBasic: number; skillReadyAt: number; skillUses: number };
  enemy: { hp: number; hpMax: number; phase: EnemyPhase; phaseUntil: number; nextBasic: number };
  tally: { chargesLanded: number; chargesInterrupted: number; skillWasted: number; damageDealt: number; damageTaken: number };
  result: BattleResult | null;
}

/** Lo que un cliente sabe legítimamente en cada tick: alimenta la UI (R2) y las políticas del simulador. */
export interface BattleView {
  tick: number;
  petHp: number;
  petHpMax: number;
  enemyHp: number;
  enemyHpMax: number;
  enemyPhase: EnemyPhase;
  enemyPhaseUntil: number;
  skillReadyAt: number;
  ended: boolean;
}

export interface BattleInit {
  seed: string;
  snapshot: BattleSnapshot;
  enemy: EnemyDef;
  ruleset: Ruleset;
}

/** Lo que se persiste (pet_battles) y lo que firma el digest junto a los eventos re-simulados (C9). */
export interface BattleRecord {
  rulesetVersion: string;
  contentHash: string;
  enemyId: string;
  seed: string;
  snapshot: BattleSnapshot;
  inputs: BattleInput[];
  result: BattleResult;
}
