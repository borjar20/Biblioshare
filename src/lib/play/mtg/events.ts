import type { PlayEvent, ToolId } from "@/lib/play/core/types";
import type { MtgSetup, EliminationReason, FinishReason } from "./types";

export type GameStartedEvent = PlayEvent<"game_started", { toolId: ToolId; setup: MtgSetup }>;
export type LifeChangedEvent = PlayEvent<"life_changed", { target: string; delta: number }>;
export type CommanderDamageEvent = PlayEvent<"commander_damage", { source: string; target: string; delta: number }>;
export type PoisonChangedEvent = PlayEvent<"poison_changed", { target: string; delta: number }>;
export type TurnPassedEvent = PlayEvent<"turn_passed", Record<string, never>>;
export type MonarchChangedEvent = PlayEvent<"monarch_changed", { holder: string | null }>;
export type InitiativeChangedEvent = PlayEvent<"initiative_changed", { holder: string | null }>;
export type PlayerEliminatedEvent = PlayEvent<"player_eliminated", { target: string; reason?: EliminationReason }>;
export type PlayerRestoredEvent = PlayEvent<"player_restored", { target: string }>;
export type GameFinishedEvent = PlayEvent<"game_finished", { winner?: string; reason?: FinishReason }>;

export type MtgEvent =
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
// sobre MtgEvent a propósito (tipo nuevo sin `case` = error de compilación),
// así que la comprobación "¿esto ES un MtgEvent?" no puede vivir dentro del
// switch — necesita su propia lista, mantenida aparte de la unión de arriba.
//
// La lista es un objeto, no un Set directo, PRECISAMENTE para que el olvido
// pese igual que un `case` que falta: `satisfies Record<..., true>` obliga a
// que las claves cubran el tipo entero de MtgEvent["type"] — añadir un
// evento nuevo a la unión y olvidar su entrada aquí ya no produce un
// `{key: "unknown"}` silencioso en el log en vivo, produce un error de
// compilación, exactamente como el switch de describeEvent.
const MTG_EVENT_TYPE_MAP = {
  game_started: true,
  life_changed: true,
  commander_damage: true,
  poison_changed: true,
  turn_passed: true,
  monarch_changed: true,
  initiative_changed: true,
  player_eliminated: true,
  player_restored: true,
  game_finished: true,
} satisfies Record<MtgEvent["type"], true>;

export const MTG_EVENT_TYPES: ReadonlySet<MtgEvent["type"]> = new Set(
  Object.keys(MTG_EVENT_TYPE_MAP) as MtgEvent["type"][],
);
