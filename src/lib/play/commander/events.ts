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
