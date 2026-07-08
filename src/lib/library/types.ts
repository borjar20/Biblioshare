import type { ItemType } from "@/lib/catalog/types";
import type { Position } from "./position";

export type MediaStatus = "planned" | "in_progress" | "completed" | "dropped";
export type LibrarySort = "recent" | "rating" | "title";

export type LibraryItem = {
  entryId: string;
  itemId: string;
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
  // Series-only metadata (null otherwise): total episode count, for progress bars.
  totalEpisodes: number | null;
  // Count of diary_entries for this library entry. See docs/REQUIREMENTS.md §7.13.
  rereadCount: number;
  // NULL = not pinned to the public profile. See docs/REQUIREMENTS.md §7.9.
  pinnedOrder: number | null;
};
