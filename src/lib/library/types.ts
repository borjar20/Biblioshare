import type { ItemType } from "@/lib/catalog/types";

export type MediaStatus = "planned" | "in_progress" | "completed" | "dropped";

export type LibraryItem = {
  entryId: string;
  itemType: ItemType;
  status: MediaStatus;
  rating: number | null;
  title: string;
  coverUrl: string | null;
  subtitle: string | null;
};
