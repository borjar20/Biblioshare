import type { Database } from '@/lib/supabase/database.types';

export type Media = 'book' | 'movie' | 'series';
export type Format = 'all' | Media;
export type FacetKind = 'genre' | 'author' | 'director';
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
  genres: string[]; creators: { id: string; name: string; role: 'author' | 'director' }[] };
export type EpisodeNote = { season: number; episode: number; rating: number | null };
export type SeriesProgress = { seenEver: number; current: number | null;
  aired: number | null; status: string | null };
export type PersonWork = { userId: string; key: WorkKey; rating: number | null;
  orderUnknown: boolean; progress: SeriesProgress | null };
export type Facts = { works: PersonWork[];
  episodes: Record<string, EpisodeNote[]>; excludedSeriesWithoutEpisodes: number };
export type AiredCount = { seriesId: string; count: number | null };
export type Snapshot = { group: Group; format: Format; catalog: CatalogWork[];
  works: PersonWork[]; excludedSeriesWithoutEpisodes: number };
export type Region = { mask: number; people: string[]; keys: WorkKey[] };
export type Finding = { key: WorkKey; people: string[]; notes: number[];
  kind: 'loved' | 'similar' | 'different' };
export type Facet = { id: string; label: string; people: { userId: string;
  consumed: WorkKey[]; rated: WorkKey[]; mean: number | null;
  min: number | null; max: number | null; eligibleTotal: number }[] };
export type WorkDetail = { work: CatalogWork; people: PersonWork[];
  commonEpisodes: { season: number; episode: number;
    notes: { userId: string; rating: number }[] }[] };
export type Result<T> = { ok: true; data: T } | { ok: false;
  code: 'unauthenticated' | 'unavailable' | 'invalid' | 'conflict' | 'load-failed' };
