import type { PlayEvent } from "@/lib/play/core/types";

// Eventos del tracker (spec turnos §1). turns_configured es atómico (setup
// local + Empezar, como chess_configured): sin él no hay nada que avanzar.
export type TurnsConfiguredEvent = PlayEvent<
  "turns_configured",
  { players: string[]; phases: string[] }
>;
export type TurnAdvancedEvent = PlayEvent<"turn_advanced", Record<string, never>>;
export type PhaseAdvancedEvent = PlayEvent<"phase_advanced", Record<string, never>>;
export type TurnSkippedEvent = PlayEvent<"turn_skipped", Record<string, never>>;
export type DirectionToggledEvent = PlayEvent<"direction_toggled", Record<string, never>>;
export type PlayerEliminatedEvent = PlayEvent<"player_eliminated", { name: string }>;
export type PlayerRestoredEvent = PlayEvent<"player_restored", { name: string }>;
export type TurnsResetEvent = PlayEvent<"turns_reset", Record<string, never>>;
export type TurnsClearedEvent = PlayEvent<"cleared", Record<string, never>>;

export type TurnsEvent =
  | TurnsConfiguredEvent
  | TurnAdvancedEvent
  | PhaseAdvancedEvent
  | TurnSkippedEvent
  | DirectionToggledEvent
  | PlayerEliminatedEvent
  | PlayerRestoredEvent
  | TurnsResetEvent
  | TurnsClearedEvent;

// Mismo patrón anti-olvido que RANDOM_EVENT_TYPE_MAP.
const TURNS_EVENT_TYPE_MAP = {
  turns_configured: true,
  turn_advanced: true,
  phase_advanced: true,
  turn_skipped: true,
  direction_toggled: true,
  player_eliminated: true,
  player_restored: true,
  turns_reset: true,
  cleared: true,
} satisfies Record<TurnsEvent["type"], true>;

export const TURNS_EVENT_TYPES: ReadonlySet<TurnsEvent["type"]> = new Set(
  Object.keys(TURNS_EVENT_TYPE_MAP) as TurnsEvent["type"][],
);
