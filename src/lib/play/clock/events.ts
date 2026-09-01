import type { PlayEvent } from "@/lib/play/core/types";

// Eventos del reloj (spec reloj §1). Todos llevan su timestamp en `at` y el
// reducer liquida el tiempo transcurrido entre eventos — por eso el orden
// temporal importa y un log con `at` hacia atrás es corrupto.
export type ChessConfiguredEvent = PlayEvent<
  "chess_configured",
  { players: string[]; initialMs: number; incrementMs: number }
>;
export type CountdownConfiguredEvent = PlayEvent<"countdown_configured", { durationMs: number }>;
export type TurnPassedEvent = PlayEvent<"turn_passed", Record<string, never>>;
export type ClockPausedEvent = PlayEvent<"clock_paused", Record<string, never>>;
export type ClockResumedEvent = PlayEvent<"clock_resumed", Record<string, never>>;
export type CountdownStartedEvent = PlayEvent<"countdown_started", Record<string, never>>;
export type CountdownResetEvent = PlayEvent<"countdown_reset", Record<string, never>>;
export type ClockResetEvent = PlayEvent<"clock_reset", Record<string, never>>;

export type ClockEvent =
  | ChessConfiguredEvent
  | CountdownConfiguredEvent
  | TurnPassedEvent
  | ClockPausedEvent
  | ClockResumedEvent
  | CountdownStartedEvent
  | CountdownResetEvent
  | ClockResetEvent;

// Mismo patrón anti-olvido que RANDOM_EVENT_TYPE_MAP (random/events.ts).
const CLOCK_EVENT_TYPE_MAP = {
  chess_configured: true,
  countdown_configured: true,
  turn_passed: true,
  clock_paused: true,
  clock_resumed: true,
  countdown_started: true,
  countdown_reset: true,
  clock_reset: true,
} satisfies Record<ClockEvent["type"], true>;

export const CLOCK_EVENT_TYPES: ReadonlySet<ClockEvent["type"]> = new Set(
  Object.keys(CLOCK_EVENT_TYPE_MAP) as ClockEvent["type"][],
);
