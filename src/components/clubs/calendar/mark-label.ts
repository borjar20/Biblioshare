import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";

// El proyecto no declara `IntlMessages`, así que la `t` de next-intl acepta
// string y esta firma encaja sin castear.
type Translate = (key: string) => string;

/**
 * Qué dice el chip de una marca. El color NUNCA es la única señal: sin este
 * texto, el estreno de una peli y el de una serie solo se distinguirían por el
 * tono y por la silueta del icono (WCAG 1.4.1).
 *
 * Un lanzamiento sin ítem dice "Lanzamiento" a secas: su color es el genérico,
 * pero el texto sigue siendo cierto.
 */
export function markLabel(mark: CalendarMark, t: Translate): string {
  if (mark.markKind !== "evento") return t(`markKind_${mark.markKind}`);
  if (!mark.eventType) return t("markKind_evento");
  if (mark.eventType === "lanzamiento" && mark.medium) {
    return `${t("eventType_lanzamiento")} · ${t(`eventMedium_${mark.medium}`)}`;
  }
  return t(`eventType_${mark.eventType}`);
}
