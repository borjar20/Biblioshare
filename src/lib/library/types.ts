import type { ItemType } from "@/lib/catalog/types";
import type { Position } from "./position";

export type MediaStatus = "planned" | "in_progress" | "completed" | "dropped";

export type LibraryItem = {
  entryId: string;
  itemType: ItemType;
  status: MediaStatus;
  rating: number | null;
  position: Position;
  notes: string | null;
  title: string;
  coverUrl: string | null;
  subtitle: string | null;
  // Book-only metadata (null for movies/series). See docs/REQUIREMENTS.md §7.1.
  publisher: string | null;
  pageCount: number | null;
};
