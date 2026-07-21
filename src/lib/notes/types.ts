import type { ItemType } from "@/lib/catalog/types";
import type { Position } from "@/lib/library/position";

export type NoteKind = "note" | "quote";

export type Note = {
  id: string;
  itemType: ItemType;
  itemId: string;
  kind: NoteKind;
  body: string;
  // El anclaje, con la MISMA forma que passes.position: {page} en libro,
  // {season,episode} en serie, {} en película o sin anclar. Antes esto era
  // `page: number | null`, que tiraba en silencio las posiciones de serie.
  position: Position;
  isFavorite: boolean;
  // meta.tags, ya normalizado (ver src/lib/notes/tags.ts).
  tags: string[];
  isSpoiler: boolean;
  // Se escribe, pero NADIE ajeno lo lee todavía: no hay política RLS de lectura
  // pública. Ver la spec, D3.
  isPublic: boolean;
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
