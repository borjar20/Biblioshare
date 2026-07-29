// Validación de la entrada de un evento de club, ANTES del roundtrip a la RPC
// (#133). Módulo aparte de events.ts por dos razones, y la segunda no es
// opcional: (1) es lógica pura y así se testea sin montar un mock de Supabase,
// como validate-route-draft.ts; (2) events.ts es `"use server"`, y de un fichero
// así solo se pueden exportar funciones async — una función síncrona exportada
// ahí no compila.
//
// Los códigos son snake_case: la convención que ya usan `proposeActivity`
// (core.ts), `spawnLinkedActivity` y —desde la migración 20260810— las propias
// RPCs de evento. El hueco que cerraba la issue era justo ese: las RPCs
// devolvían frases con espacios ('title required') y el cliente snake_case, así
// que mapear el error a una clave i18n por convención fallaba en silencio solo
// para eventos.
//
// Los límites NO son números elegidos aquí: son los del CHECK de
// `club_activities` (`club_activities_title_len` 1..120 y
// `club_activities_description_len` <= 2000, de
// 20260715_text_length_limits.sql). Si divergieran, volvería a haber un rango de
// longitudes que pasa esta guarda y muere en Postgres con un 23514 crudo que la
// UI no traduce.
export const EVENT_TITLE_MAX = 120;
export const EVENT_DESCRIPTION_MAX = 2000;

export type EventInputError =
  | "title_required"
  | "title_too_long"
  | "starts_on_required"
  | "description_too_long";

/**
 * Devuelve el título ya recortado, o lanza el código de error de dominio.
 * Devolver el título (en vez de void) evita que el llamante vuelva a hacer
 * `.trim()` por su cuenta y guarde algo distinto de lo que se validó.
 */
export function validateEventInput(input: {
  title: string;
  startsOn: string;
  description?: string;
}): string {
  const title = input.title.trim();
  if (!title) throw new Error("title_required" satisfies EventInputError);
  if (title.length > EVENT_TITLE_MAX) throw new Error("title_too_long" satisfies EventInputError);
  if (!input.startsOn) throw new Error("starts_on_required" satisfies EventInputError);
  if ((input.description?.trim().length ?? 0) > EVENT_DESCRIPTION_MAX) {
    throw new Error("description_too_long" satisfies EventInputError);
  }
  return title;
}
