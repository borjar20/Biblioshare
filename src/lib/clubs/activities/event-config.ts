import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";

// Qué CLASE de fecha es un evento de club, y de qué medio cuando es un estreno.
// Viven en `club_activities.config` (el JSONB opaco de SD-8) en vez de en
// columnas propias: son dos campos de UN solo kind de los cinco, y dos columnas
// nuevas quedarían a null en las filas de los otros cuatro.
//
// El contra conocido es que Postgres no valida la forma del JSONB. Lo acota que
// escribir un evento solo se puede por RPC (`club_activities` no tiene política
// UPDATE, a propósito), y que la lectura degrada en vez de reventar.
export type ClubEventType = "estreno" | "quedada" | "otro";

export type ClubEventConfig = {
  eventType: ClubEventType;
  /** Presente si y SOLO si eventType === "estreno". */
  medium?: ItemType;
};

// El orden importa: es el de los <option> del formulario y, para los medios,
// el de la fila "ESTRENOS" de la leyenda del calendario.
export const CLUB_EVENT_TYPES = ["estreno", "quedada", "otro"] as const satisfies
  readonly ClubEventType[];
export const CLUB_EVENT_MEDIA = ["book", "movie", "series"] as const satisfies
  readonly ItemType[];

export type EventConfigError =
  | "event_type_invalid"
  | "medium_required"
  | "medium_invalid";

function esTipo(x: unknown): x is ClubEventType {
  return typeof x === "string" && (CLUB_EVENT_TYPES as readonly string[]).includes(x);
}

function esMedio(x: unknown): x is ItemType {
  return typeof x === "string" && (CLUB_EVENT_MEDIA as readonly string[]).includes(x);
}

/**
 * Lectura TOLERANTE: cualquier config que no case degrada a `{eventType:"otro"}`.
 *
 * No es pereza, es el contrato: por aquí pasan los eventos anteriores al
 * backfill y los que escribiera una versión futura de la app con un tipo que
 * esta todavía no conoce. Un throw aquí tumbaría el calendario ENTERO del club
 * por una sola fila rara. Degradar la pinta gris, que es lo que ya se ve hoy.
 *
 * Esto NO sustituye al backfill: el backfill hace que el dato sea cierto en la
 * base, esto hace que la pantalla aguante cuando no lo es.
 */
export function parseEventConfig(config: Json | null): ClubEventConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { eventType: "otro" };
  }

  const raw = config as Record<string, unknown>;
  if (!esTipo(raw.eventType)) return { eventType: "otro" };
  if (raw.eventType !== "estreno") return { eventType: raw.eventType };

  // Un estreno sin medio válido no se puede colorear, que es justo lo que el
  // tipo existe para hacer: degrada entero en vez de quedar a medias.
  if (!esMedio(raw.medium)) return { eventType: "otro" };
  return { eventType: "estreno", medium: raw.medium };
}

/**
 * Escritura VALIDADA, antes del roundtrip a la RPC (mismo patrón que
 * `validateEventInput`). Devuelve la config ya normalizada para que el llamante
 * no vuelva a componerla por su cuenta y guarde algo distinto de lo validado.
 *
 * La RPC vuelve a validar lo mismo: esta guarda ahorro un viaje, no es la
 * autoridad.
 */
export function validateEventConfig(input: {
  eventType: string;
  medium?: string | null;
}): ClubEventConfig {
  if (!esTipo(input.eventType)) {
    throw new Error("event_type_invalid" satisfies EventConfigError);
  }
  // Un medio elegido y luego abandonado al cambiar el tipo NO es un error del
  // usuario: se descarta callando. Solo el estreno exige medio.
  if (input.eventType !== "estreno") return { eventType: input.eventType };

  if (!input.medium) throw new Error("medium_required" satisfies EventConfigError);
  if (!esMedio(input.medium)) throw new Error("medium_invalid" satisfies EventConfigError);
  return { eventType: "estreno", medium: input.medium };
}
