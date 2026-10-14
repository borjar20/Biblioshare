import type { Lens } from '@/lib/comparisons/atlas/scene';
import type { IslandMode } from '@/lib/comparisons/atlas/islands';

/**
 * UI state of the atlas outside the engine. The lens and the Islas mode go in the URL
 * (`?lente=…&islas=…`, shareable); the faces and the camera stay in sessionStorage per group,
 * so person ids never reach the URL. Every storage access tolerates a missing, throwing or
 * garbage-returning storage: then the faces start with everyone and the camera fits.
 */
export type SavedCamera = { lens: Lens; x: number; y: number; k: number };
export type GroupMemory = { faces: string[] | null; camera: SavedCamera | null };
export type MemoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

const LENS_PARAM: Record<Lens, string> = { quien: 'quien', opinion: 'opinion', tiempo: 'tiempo', islas: 'islas' };
const MODE_PARAM: Record<IslandMode, string> = { type: 'tipo', genre: 'genero', creator: 'autor' };
const DEFAULT_LENS: Lens = 'quien', DEFAULT_MODE: IslandMode = 'type';
const KEEP = ['group', 'con'];
const PREFIX = 'biblioshare:atlas:';

const fromParam = <T extends string>(table: Record<T, string>, value: string | null, fallback: T): T =>
  (Object.keys(table) as T[]).find(key => table[key] === value) ?? fallback;
const isLens = (value: unknown): value is Lens => typeof value === 'string' && Object.hasOwn(LENS_PARAM, value);

export function parseAtlasQuery(search: Pick<URLSearchParams, 'get'>): { lens: Lens; islandMode: IslandMode } {
  return { lens: fromParam(LENS_PARAM, search.get('lente'), DEFAULT_LENS), islandMode: fromParam(MODE_PARAM, search.get('islas'), DEFAULT_MODE) };
}

/** Query string (no `?`) with `group`/`con` from `base` and the lens and mode only when not the default. */
export function atlasQuery(base: Pick<URLSearchParams, 'get'>, lens: Lens, mode: IslandMode): string {
  const next = new URLSearchParams();
  for (const key of KEEP) { const value = base.get(key); if (value !== null) next.set(key, value); }
  if (lens !== DEFAULT_LENS) next.set('lente', LENS_PARAM[lens]);
  if (mode !== DEFAULT_MODE) next.set('islas', MODE_PARAM[mode]);
  return next.toString();
}

/** The tab's sessionStorage, or null where touching it throws (private mode, blocked site data) or it does not exist (server). */
export function sessionStore(): MemoryStorage | null {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function readRecord(storage: MemoryStorage | null | undefined, groupId: string): Record<string, unknown> {
  try {
    const raw = storage?.getItem(PREFIX + groupId);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
const validFaces = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every(id => typeof id === 'string') ? value as string[] : null;
function validCamera(value: unknown): SavedCamera | null {
  if (!value || typeof value !== 'object') return null;
  const { lens, x, y, k } = value as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return isLens(lens) && finite(x) && finite(y) && finite(k) && k > 0 ? { lens, x, y, k } : null;
}

export function readGroupMemory(storage: MemoryStorage | null | undefined, groupId: string): GroupMemory {
  const record = readRecord(storage, groupId);
  return { faces: validFaces(record.faces), camera: validCamera(record.camera) };
}

export function writeGroupMemory(storage: MemoryStorage | null | undefined, groupId: string, patch: Partial<GroupMemory>): void {
  if (!storage) return;
  try { storage.setItem(PREFIX + groupId, JSON.stringify({ ...readGroupMemory(storage, groupId), ...patch })); } catch { /* quota or blocked: nothing to remember */ }
}
