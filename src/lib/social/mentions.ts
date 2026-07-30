// Parser puro de menciones @usuario. Sin imports server-only: lo comparten
// la escritura (resolver+notificar) y el render (linkificar). El prefijo
// capturado (grupo 1) evita @ dentro de emails (a@b) y rutas (/@b).
export const MENTION_RE = /(^|[^a-z0-9_@/])@([a-z0-9_]{3,30})/gi;

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
