export type FollowerCandidate = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

// Minúsculas y sin tildes: «María» casa con «maria». No hay escapado porque el
// término nunca viaja a PostgREST: el filtrado se hace en TS.
export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export const FOLLOWER_SEARCH_MIN = 2;
export const FOLLOWER_SEARCH_MAX = 8;

// Filtra y ordena: subcadena en username o display_name; primero los que
// EMPIEZAN por el término, luego alfabético por username; máximo 8.
export function rankFollowers<T extends FollowerCandidate>(candidates: T[], query: string): T[] {
  const q = normalizeSearch(query);
  if (q.length < FOLLOWER_SEARCH_MIN) return [];
  const scored: { c: T; prefix: boolean; key: string }[] = [];
  for (const c of candidates) {
    const u = normalizeSearch(c.username);
    const d = normalizeSearch(c.display_name ?? "");
    if (!u.includes(q) && !d.includes(q)) continue;
    scored.push({ c, prefix: u.startsWith(q) || d.startsWith(q), key: u });
  }
  scored.sort((a, b) =>
    a.prefix === b.prefix ? a.key.localeCompare(b.key) : a.prefix ? -1 : 1,
  );
  return scored.slice(0, FOLLOWER_SEARCH_MAX).map((s) => s.c);
}
