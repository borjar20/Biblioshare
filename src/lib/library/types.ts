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
  // Series-only (null otherwise): episodios vistos EN EL PASE ACTIVO, contados
  // desde `episode_watches`. Es el numerador del progreso: `position.episode`
  // NO vale, va numerado por temporada y `totalEpisodes` es de la serie entera
  // (#715).
  watchedEpisodes: number | null;
  // Nº de pases (`passes`) de esta obra. See docs/requirements/data-model.md.
  rereadCount: number;
  // NULL = not pinned to the public profile. See docs/REQUIREMENTS.md §7.9.
  pinnedOrder: number | null;
  // Id del pase ACTIVO de esta obra (passes.is_active): destino real de
  // "/sesion/".
  // null solo en datos huérfanos (no debería pasar para una entrada seguida).
  activePassId: string | null;
};
