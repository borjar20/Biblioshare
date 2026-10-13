import type { CatalogWork, Media, WorkKey } from '../types';

export type AtlasPerson = { id: string; name: string; avatarUrl: string | null; color: string; isMe: boolean };
export type AtlasOwner = { userId: string; rating: number | null; date: string | null };
export type AtlasWork = { key: WorkKey; itemType: Media; itemId: string; title: string; metadataMissing: boolean;
  coverUrl: string | null; genres: string[]; creators: CatalogWork['creators']; owners: AtlasOwner[] };
export type Point = { x: number; y: number };
export type Camera = { x: number; y: number; k: number };
export type Viewport = { width: number; height: number };
export type Extent = { minX: number; minY: number; maxX: number; maxY: number };
