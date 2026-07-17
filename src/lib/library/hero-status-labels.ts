import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

// Las 4 etiquetas de la píldora de estado del hero (.hero-status del mockup
// "Paper - Ficha de título completa"): "En tu biblioteca · Leyendo".
//
// El verbo va por tipo de medio en "en curso" y "completado" (Leyendo/Viendo,
// Leído/Vista), igual que los pills de StatusSegments y por la misma razón: la
// maqueta escribe "Leyendo" en el frame del libro y "Viendo" en el de la serie.
// Pendiente y Abandonado no cambian de verbo, así que reusan las claves
// genéricas de library.status.*.
//
// Se resuelven en el servidor porque quien las pinta es una isla de cliente
// (StatusBadgeLive) que a propósito no arrastra i18n — ver
// components/detail/item-status-context.tsx.
export async function heroStatusLabels(
  itemType: ItemType,
): Promise<Record<MediaStatus, string>> {
  const [tDetail, verbs] = await Promise.all([
    getTranslations("detail"),
    statusVerbs(itemType),
  ]);
  const prefix = tDetail("inLibrary");

  return {
    planned: `${prefix} · ${verbs.planned}`,
    in_progress: `${prefix} · ${verbs.in_progress}`,
    completed: `${prefix} · ${verbs.completed}`,
    dropped: `${prefix} · ${verbs.dropped}`,
  };
}

// Los mismos 4 estados SIN el prefijo: el rail de PC (.desk-shelf) escribe
// "Leyendo" a secas, no "En tu biblioteca · Leyendo" — ahí la portada al lado
// ya dice de qué obra hablamos.
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
