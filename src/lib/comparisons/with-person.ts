/**
 * Unsaved comparison with one person (#1484): `with:<userId>` stands for the viewer and
 * that accepted follow. It is never persisted; every load resolves it again with the
 * session, so it grants nothing a saved group would not.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const prefix = 'with:';

export function withPersonId(userId: string): string { return `${prefix}${userId}`; }

/** The person of a `with:` id, or null for anything else (saved group ids included). */
export function withPersonTarget(id: unknown): string | null {
  if (typeof id !== 'string' || !id.startsWith(prefix)) return null;
  const target = id.slice(prefix.length);
  return uuid.test(target) ? target : null;
}
