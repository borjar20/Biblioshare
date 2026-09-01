import type { PlayEvent } from "@/lib/play/core/types";
import type { ResourceDef } from "./types";

// Eventos del gestor (spec recursos §1). Granulares: `adjusted` lleva el delta
// de UN gesto — deshacer revierte gesto a gesto.
export type ResourcesPlayersSetEvent = PlayEvent<"players_set", { players: string[] }>;
export type ResourceAddedEvent = PlayEvent<"resource_added", ResourceDef>;
export type ResourceRemovedEvent = PlayEvent<"resource_removed", { name: string }>;
export type ResourceUpdatedEvent = PlayEvent<
  "resource_updated",
  { name: string; initial: number; shared: boolean }
>;
export type AdjustedEvent = PlayEvent<
  "adjusted",
  { resource: string; owner: string | null; delta: number }
>;
export type ValuesResetEvent = PlayEvent<"values_reset", Record<string, never>>;
export type ResourcesClearedEvent = PlayEvent<"cleared", Record<string, never>>;

export type ResourcesEvent =
  | ResourcesPlayersSetEvent
  | ResourceAddedEvent
  | ResourceRemovedEvent
  | ResourceUpdatedEvent
  | AdjustedEvent
  | ValuesResetEvent
  | ResourcesClearedEvent;

// Mismo patrón anti-olvido que RANDOM_EVENT_TYPE_MAP.
const RESOURCES_EVENT_TYPE_MAP = {
  players_set: true,
  resource_added: true,
  resource_removed: true,
  resource_updated: true,
  adjusted: true,
  values_reset: true,
  cleared: true,
} satisfies Record<ResourcesEvent["type"], true>;

export const RESOURCES_EVENT_TYPES: ReadonlySet<ResourcesEvent["type"]> = new Set(
  Object.keys(RESOURCES_EVENT_TYPE_MAP) as ResourcesEvent["type"][],
);
