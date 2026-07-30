import type { ProfileSearchResult } from "@/lib/profile/search-profiles";

// Tipos + helper puro de candidatos de @mención. Separado de mention-search.ts
// porque ese fichero es "use server" (todo export runtime debe ser async server
// action); mergeCandidates es una función SÍNCRONA pura y no puede vivir ahí
// (Next/Turbopack rechaza el build: "Server Actions must be async functions").
// Aquí, sin "use server", es importable por cliente y servidor y testeable sin red.

export type MentionCandidate = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isInGraph: boolean;
};

export type MentionScope = { scope: "club"; clubId: string } | { scope: "profile" };

// Grafo primero, relleno global después, dedup por username.
export function mergeCandidates(
  graph: ProfileSearchResult[],
  global: ProfileSearchResult[],
  limit: number,
): MentionCandidate[] {
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  for (const p of graph) {
    if (seen.has(p.username)) continue;
    seen.add(p.username);
    out.push({ ...p, isInGraph: true });
    if (out.length >= limit) return out;
  }
  for (const p of global) {
    if (seen.has(p.username)) continue;
    seen.add(p.username);
    out.push({ ...p, isInGraph: false });
    if (out.length >= limit) return out;
  }
  return out;
}
