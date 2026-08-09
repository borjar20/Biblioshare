import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";

// Tipo de evento y forma de su `config` jsonb (spec §3.2). config es OPACO a la
// BD; parseEventConfig es la ÚNICA puerta de entrada tipada -- tolerante a formas
// viejas o corruptas para que un jsonb raro no reviente una ficha.
export type EventType = "encuentro" | "lanzamiento" | "fecha_destacada";
export const EVENT_TYPES = ["encuentro", "lanzamiento", "fecha_destacada"] as const;

const ITEM_TYPES: ReadonlyArray<ItemType> = ["book", "movie", "series"];

export type ItemRef = { itemType: ItemType; itemId: string };
export type EventRelation =
  | { kind: "item"; itemType: ItemType; itemId: string }
  | { kind: "activity"; activityId: string };

export type LanzamientoConfig = {
  item: ItemRef | null;
  releaseType: string | null;
  platform?: string | null;
  region?: string;
  allDay: boolean;
};
export type FechaDestacadaConfig = { relations: EventRelation[]; allDay: true };
export type EventConfig = Record<string, never> | LanzamientoConfig | FechaDestacadaConfig;

function asObject(raw: Json | null): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function itemRef(v: unknown): ItemRef | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  const itemType = o?.itemType;
  const itemId = str(o?.itemId);
  if (!itemId || typeof itemType !== "string" || !ITEM_TYPES.includes(itemType as ItemType)) {
    return null;
  }
  return { itemType: itemType as ItemType, itemId };
}

export function parseEventConfig(eventType: EventType, raw: Json | null): EventConfig {
  if (eventType === "encuentro") return {};
  const o = asObject(raw);

  if (eventType === "lanzamiento") {
    const item = itemRef(o.item);
    const platform = str(o.platform);
    const region = str(o.region);
    const cfg: LanzamientoConfig = {
      item,
      releaseType: str(o.releaseType),
      allDay: o.allDay === true,
    };
    if (platform) cfg.platform = platform;
    if (region) cfg.region = region;
    return cfg;
  }

  // fecha_destacada
  const rels = Array.isArray(o.relations) ? o.relations : [];
  const relations: EventRelation[] = [];
  for (const r of rels) {
    const ro = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    if (ro?.kind === "item") {
      const ref = itemRef(ro);
      if (ref) relations.push({ kind: "item", ...ref });
    } else if (ro?.kind === "activity") {
      const activityId = str(ro.activityId);
      if (activityId) relations.push({ kind: "activity", activityId });
    }
  }
  return { relations, allDay: true };
}
