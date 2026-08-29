import type { PlayEvent, ToolId } from "@/lib/play/core/types";
import type { CommanderSetup, EliminationReason, FinishReason } from "./types";

export type GameStartedEvent = PlayEvent<"game_started", { toolId: ToolId; setup: CommanderSetup }>;
export type LifeChangedEvent = PlayEvent<"life_changed", { target: string; delta: number }>;
export type CommanderDamageEvent = PlayEvent<"commander_damage", { source: string; target: string; delta: number }>;
export type PoisonChangedEvent = PlayEvent<"poison_changed", { target: string; delta: number }>;
export type TurnPassedEvent = PlayEvent<"turn_passed", Record<string, never>>;
export type MonarchChangedEvent = PlayEvent<"monarch_changed", { holder: string | null }>;
export type InitiativeChangedEvent = PlayEvent<"initiative_changed", { holder: string | null }>;
export type PlayerEliminatedEvent = PlayEvent<"player_eliminated", { target: string; reason?: EliminationReason }>;
export type PlayerRestoredEvent = PlayEvent<"player_restored", { target: string }>;
export type GameFinishedEvent = PlayEvent<"game_finished", { winner?: string; reason?: FinishReason }>;

export type CommanderEvent =
  | GameStartedEvent
  | LifeChangedEvent
  | CommanderDamageEvent
  | PoisonChangedEvent
  | TurnPassedEvent
  | MonarchChangedEvent
  | InitiativeChangedEvent
  | PlayerEliminatedEvent
  | PlayerRestoredEvent
  | GameFinishedEvent;

// Espejo en runtime de la unión de arriba, solo para el guard del registro
// (finding 8 de la revisión final): describeEvent hace un switch exhaustivo
// sobre CommanderEvent a propósito (tipo nuevo sin `case` = error de compilación),
// así que la comprobación "¿esto ES un CommanderEvent?" no puede vivir dentro del
// switch — necesita su propia lista, mantenida a mano junto a la unión de arriba.
export const COMMANDER_EVENT_TYPES: ReadonlySet<CommanderEvent["type"]> = new Set([
  "game_started",
  "life_changed",
  "commander_damage",
  "poison_changed",
  "turn_passed",
  "monarch_changed",
  "initiative_changed",
  "player_eliminated",
  "player_restored",
  "game_finished",
]);
