import type { ItemType } from "@/lib/catalog/types";

export type NoteKind = "note" | "quote";

export type Note = {
  id: string;
  itemType: ItemType;
  itemId: string;
  kind: NoteKind;
  body: string;
  // Página, si la nota la trae (mismo formato que progress_sessions.position).
  page: number | null;
  isFavorite: boolean;
  createdAt: string;
  // Título de la obra, resuelto del catálogo para pintar la tarjeta.
  itemTitle: string | null;
};

export type NoteCounts = {
  quotes: number;
  notes: number;
  favorites: number;
  total: number;
};
