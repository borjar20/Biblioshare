import type { Candidate } from './types';

/**
 * `?personas=` (spec 2026-11-01): opens the new-group editor with these people ticked, e.g. the
 * club members you follow. It grants nothing: ids outside the candidates (accepted, visible
 * follows) are dropped, and saving re-validates on the server.
 */
export const PERSONAS_MAX = 9; // a group holds 10 with the viewer

export function personasFromQuery(raw: string | null, candidates: Candidate[], viewerId: string): string[] {
  if (!raw) return [];
  const allowed = new Set(candidates.map(person => person.userId));
  const ids = raw.split(',').map(id => id.trim()).filter(id => id && id !== viewerId && allowed.has(id));
  return [...new Set(ids)].slice(0, PERSONAS_MAX);
}

export function personasHref(ids: string[]): string {
  return `/comunidad/entre-nosotros?${new URLSearchParams({ personas: ids.join(',') })}`;
}
