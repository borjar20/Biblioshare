import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

// Los 4 estados de un pase como verbos por tipo de medio: en curso y
// completado cambian (Leyendo/Viendo, Leído/Vista), igual que las pastillas de
// StatusSegments; pendiente y abandonado reusan library.status.*. Hoy lo usa
// la tarjeta de obra de lo social (work-summary-card.tsx).
export async function statusVerbs(
  itemType: ItemType,
): Promise<Record<MediaStatus, string>> {
  const [tLibrary, tDetail] = await Promise.all([
    getTranslations("library"),
    getTranslations("detail"),
  ]);

  return {
    planned: tLibrary("status.planned"),
    in_progress: tDetail(`statusSegments.inProgress.${itemType}`),
    completed: tDetail(`statusSegments.completed.${itemType}`),
    dropped: tLibrary("status.dropped"),
  };
}
