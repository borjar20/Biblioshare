// Parser puro de menciones @usuario. Sin imports server-only: lo comparten
// la escritura (resolver+notificar) y el render (linkificar). El prefijo
// capturado (grupo 1) evita @ dentro de emails (a@b) y rutas (/@b).
//
// USERNAME_BODY viene de username.ts (misma forma que USERNAME_PATTERN, sin
// duplicar la regla — issue #322). username.ts solo importa un tipo de
// supabase/server (`import type`, se borra en compilación), así que este
// módulo se mantiene puro: sin runtime server-only, apto para el render
// cliente (mention-text.tsx) y no solo para la escritura en servidor.
import { USERNAME_BODY } from "@/lib/profile/username";

export const MENTION_RE = new RegExp(`(^|[^a-z0-9_@/])@(${USERNAME_BODY})`, "gi");

export const MAX_MENTIONS = 10;

export function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const username = match[2].toLowerCase();
    if (!seen.has(username)) {
      seen.add(username);
      result.push(username);
      if (result.length >= MAX_MENTIONS) break;
    }
  }
  return result;
}
