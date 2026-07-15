import type { MediaStatus } from "@/lib/library/types";
import type { Json } from "@/lib/supabase/database.types";

// Un "pase" es una lectura o un visionado, y desde la migración hub es el
// dueño de TODO el registro personal: estado, cursor, cola, fijado, nota y
// reseña. "Activo" = el que representa la obra en tu biblioteca (puede estar
// cerrado). Abierto = planned | in_progress.
export type Pass = {
  id: string;
  status: MediaStatus;
  isActive: boolean;
  position: Json;
  startedOn: string | null;
  finishedOn: string | null;
  // Nota SIEMPRE entera 1-10; la escala de estrellas es solo presentación.
  rating: number | null;
  review: string | null;
  isPublic: boolean;
  editionId: string | null;
  // Solo significativo en el pase activo; lo hereda el pase nuevo al archivar.
  pinnedOrder: number | null;
};
