import type { CatalogWork, Media, WorkKey } from '../types';

export type AtlasPerson = { id: string; name: string; avatarUrl: string | null; color: string; isMe: boolean };
export type AtlasOwner = { userId: string; rating: number | null; date: string | null };
export type AtlasWork = { key: WorkKey; itemType: Media; itemId: string; title: string; metadataMissing: boolean;
  coverUrl: string | null; genres: string[]; creators: CatalogWork['creators']; owners: AtlasOwner[] };
export type { Point, Camera, Viewport, Extent } from '@/lib/atlas/types';
