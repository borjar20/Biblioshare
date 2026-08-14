import type { MediaStatus } from "@/lib/library/types";
import type { Json } from "@/lib/supabase/database.types";

// Motivo de abandono: SIEMPRE privado (nunca se sirve a nadie más que el
// dueño, ver la máscara de pass_reviews en la migración 20260858). Solo
// dropped_reason === "otro" admite dropped_reason_note.
export const DROPPED_REASONS = [
  "no_enganchado",
  "aburrido",
  "no_es_momento",
  "no_esperado",
  "otro",
] as const;
export type DroppedReason = (typeof DROPPED_REASONS)[number];

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
  // Solo tiene valor si status === "dropped". Siempre privado.
  droppedReason: DroppedReason | null;
  droppedReasonNote: string | null;
};
