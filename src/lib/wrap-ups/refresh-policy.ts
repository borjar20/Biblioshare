// Política de «Actualizar». Vive aparte de actions.ts porque un módulo
// "use server" solo puede exportar funciones async y esta es síncrona.
import type { OwnWrapUp } from "./get-own-wrap-ups";

export const REFRESH_MS = 10 * 60 * 1000;

export function canRefresh(
  row: Pick<OwnWrapUp, "refreshedAt" | "generatedAt" | "publishedPostId">,
  now: Date,
): "ok" | "published" | "too_soon" {
  if (row.publishedPostId) return "published";
  const last = Date.parse(row.refreshedAt ?? row.generatedAt);
  return now.getTime() - last < REFRESH_MS ? "too_soon" : "ok";
}
