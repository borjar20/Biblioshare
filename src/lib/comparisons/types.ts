import type { Database } from '@/lib/supabase/database.types';

export type Media = 'book' | 'movie' | 'series';
export type Format = 'all' | Media;
export type WorkKey = `${Media}:${string}`;
export type PassRow = Pick<Database['public']['Tables']['passes']['Row'],
  'id' | 'user_id' | 'item_type' | 'item_id' | 'status' | 'is_active' |
  'rating' | 'finished_on' | 'created_at'>;
export type WatchRow = Pick<Database['public']['Tables']['episode_watches']['Row'],
  'id' | 'user_id' | 'series_id' | 'pass_id' | 'season_number' |
  'episode_number' | 'rating' | 'watched_on' | 'created_at'>;
export type Member = { slotId: string; userId: string | null; name: string | null;
  avatarUrl: string | null; available: boolean };
export type Group = { id: string; name: string; revision: number; members: Member[] };
export type Candidate = { userId: string; name: string; avatarUrl: string | null };
export type CatalogWork = { key: WorkKey; title: string; coverUrl: string | null;
  metadataMissing?: boolean;
  genres: string[]; creators: { id: string; name: string; role: 'author' | 'director' }[] };
export type EpisodeNote = { season: number; episode: number; rating: number | null };
export type SeriesProgress = { seenEver: number; current: number | null;
  aired: number | null; status: string | null };
export type PersonWork = { userId: string; key: WorkKey; rating: number | null;
  /** ISO date of the record that gives `rating` (see atlas spec §2.2). */
  date: string | null;
  orderUnknown: boolean; progress: SeriesProgress | null };
export type Facts = { works: PersonWork[];
  episodes: Record<string, EpisodeNote[]>; excludedSeriesWithoutEpisodes: number };
export type AiredCount = { seriesId: string; count: number | null };
export type Snapshot = { group: Group; format: Format; catalog: CatalogWork[];
  works: PersonWork[]; excludedSeriesWithoutEpisodes: number };
export type Region = { mask: number; people: string[]; keys: WorkKey[] };
export type Result<T> = { ok: true; data: T } | { ok: false;
  code: 'unauthenticated' | 'unavailable' | 'invalid' | 'conflict' | 'load-failed' };
