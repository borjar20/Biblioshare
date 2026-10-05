import type { ItemType } from "@/lib/catalog/types";

export type MarginAnchor =
  | { kind: "ratio"; ratio: number; page: number; pages: number }
  | { kind: "episode"; season: number; episode: number }
  | { kind: "finish" };

export type MarginAudience = "followers" | "person";
export type MarginFoundVia = "progress" | "finish" | "retro";

export const MARGIN_BODY_MAX = 2000;
export const MARGIN_CHAPTER_MAX = 80;

export type MarginPerson = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

// Una nota tal como la ve quien la recibe (encuentro) o quien la escribió (propia).
export type MarginNoteView = {
  noteId: string;
  itemType: ItemType;
  itemId: string;
  anchor: MarginAnchor;
  chapterLabel: string | null;
  body: string;
  isSpoiler: boolean;
  audience: MarginAudience;
  createdAt: string;
  author: MarginPerson;
  // Solo en encuentros (vista de lector).
  encounter: { id: string; foundAt: string; foundVia: MarginFoundVia; seenAt: string | null } | null;
  // Solo en notas propias: quién la ha encontrado (con el id de cada hilo).
  foundBy: { encounterId: string; reader: MarginPerson }[] | null;
  recipient: MarginPerson | null;
};
