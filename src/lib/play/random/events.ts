import type { PlayEvent } from "@/lib/play/core/types";
import type { BagItem } from "./types";

// Eventos del acompañante (spec §3). El azar se resuelve al DESPACHAR y el
// resultado viaja en el payload: el reducer jamás tira dados — replay
// determinista y undo = pop del log, como en el resto de Play.
export type DiceRolledEvent = PlayEvent<
  "dice_rolled",
  { count: number; sides: number; results: number[] }
>;
export type CoinFlippedEvent = PlayEvent<"coin_flipped", { result: "heads" | "tails" }>;
// Varias monedas en un solo evento (una tirada = una entrada de feed y un
// deshacer). coin_flipped se conserva por los logs persistidos: la UI ya no
// lo emite, pero el replay lo sigue aceptando.
export type CoinsFlippedEvent = PlayEvent<
  "coins_flipped",
  { count: number; results: ("heads" | "tails")[] }
>;
export type FirstPickedEvent = PlayEvent<"first_picked", { players: string[]; picked: string }>;
export type OrderDrawnEvent = PlayEvent<"order_drawn", { players: string[]; order: string[] }>;
export type TeamsDrawnEvent = PlayEvent<"teams_drawn", { players: string[]; teams: string[][] }>;
export type PlayersSetEvent = PlayEvent<"players_set", { players: string[] }>;
// Configurar, editar y reiniciar la bolsa son el MISMO evento: la UI manda la
// foto completa y `initial` se actualiza a esa foto (spec §3).
export type BagSetEvent = PlayEvent<"bag_set", { items: BagItem[]; withReplacement: boolean }>;
export type BagDrawnEvent = PlayEvent<"bag_drawn", { name: string }>;
// Borrado total como evento (no truncado físico del log): así deshacer lo revierte.
export type ClearedEvent = PlayEvent<"cleared", Record<string, never>>;

export type RandomEvent =
  | DiceRolledEvent
  | CoinFlippedEvent
  | CoinsFlippedEvent
  | FirstPickedEvent
  | OrderDrawnEvent
  | TeamsDrawnEvent
  | PlayersSetEvent
  | BagSetEvent
  | BagDrawnEvent
  | ClearedEvent;

// Mismo patrón anti-olvido que SCORE_EVENT_TYPE_MAP (score/events.ts:25-31).
const RANDOM_EVENT_TYPE_MAP = {
  dice_rolled: true,
  coin_flipped: true,
  coins_flipped: true,
  first_picked: true,
  order_drawn: true,
  teams_drawn: true,
  players_set: true,
  bag_set: true,
  bag_drawn: true,
  cleared: true,
} satisfies Record<RandomEvent["type"], true>;

export const RANDOM_EVENT_TYPES: ReadonlySet<RandomEvent["type"]> = new Set(
  Object.keys(RANDOM_EVENT_TYPE_MAP) as RandomEvent["type"][],
);
