import type { BattleEvent, BattleInput, BattleResult, BattleSnapshot } from "../battle/types";
import type { TrainingBattle } from "../training/types";
import type { LootCopy, LootSelection, PetLoadout } from "../loot/types";
import type { Reward } from "../loot/catalog";

export interface AdventureBattle extends TrainingBattle {
  adventure: { day: string; attempt: number; reward: Reward | null; copy?: LootCopy | null };
}
export interface AdventureState { pendingDays: string[]; current: AdventureBattle | null; inventory: LootCopy[]; loadout: PetLoadout }
export type AdventureResponse = { ok: true; battle: AdventureBattle; events?: BattleEvent[] } | { ok: false; code: string };

export interface StartInput { intentId: string; seed: string; enemyId: string; rulesetVersion: string; contentHash: string; snapshot: BattleSnapshot }
export interface ResolveInput { intentId: string; inputs: BattleInput[]; result: BattleResult; digest: string; rewardOrder: Reward[] }

/** Acotado a un usuario autenticado antes de construir el servicio. Las escrituras son las funciones SQL de §6. */
export interface AdventureRepository {
  pendingDays(): Promise<string[]>;
  find(intentId: string): Promise<AdventureBattle | null>;
  /** Filas de aventura del usuario, más recientes primero. */
  recent(limit: number): Promise<AdventureBattle[]>;
  /** Todos los días ganados del usuario con su botín, sin límite: ni el inventario ni `wonDays`
   *  pueden depender de la ventana de `recent` (una victoria vieja seguiría ofreciéndose a reintentar). */
  wins(): Promise<{ day: string; reward: Reward | null; copy: LootCopy | null }[]>;
  selection(): Promise<LootSelection>;
  /** null = sin aventura que empezar (NO_ADVENTURE). Devuelve el abierto existente si lo hay. */
  start(input: StartInput): Promise<AdventureBattle | null>;
  /** null = intento inexistente. Devuelve la fila guardada si ya estaba resuelta. */
  resolve(input: ResolveInput): Promise<AdventureBattle | null>;
}
