import type { ReactNode } from "react";
import type { ActivityKind } from "@/lib/clubs/activities/core";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";

// Baldosa de acento por tipo de actividad -- antes copiada, misma cadena de
// clases, en activity-card.tsx, activity-card-large.tsx y
// activity-card-upcoming.tsx (solo cambiaban el tamaño y el contenido). Un
// componente compartido: tres copias del mismo marcado divergen en cuanto
// alguien toca una sola.
//
// Sin "use client": es puramente presentacional (sin hooks, sin estado), así
// que puede vivir en el bundle de cualquiera de los tres -- todos son "use
// client" hoy, pero este fichero no necesita serlo.
//
// Ojo con el tamaño: Tailwind necesita las clases ENTERAS y literales, nunca
// construidas por concatenación (`h-${n}` no compila a nada en producción),
// así que el tamaño es un mapa de clases completas, no una plantilla.
export type ActivityAccentTileSize = "sm" | "md";

const SIZE_CLASSES: Record<ActivityAccentTileSize, string> = {
  /** El icono de tipo en la tarjeta compacta y en la de "en curso". */
  sm: "h-10 w-10",
  /** La baldosa de fecha (día/mes) en la tarjeta de "Próximas". */
  md: "h-12 w-12",
};

export function ActivityAccentTile({
  kind,
  size = "sm",
  children,
}: {
  kind: ActivityKind;
  size?: ActivityAccentTileSize;
  children: ReactNode;
}) {
  const accent = ACTIVITY_ACCENT[kind];
  return (
    <span
      aria-hidden
      className={`grid ${SIZE_CLASSES[size]} shrink-0 place-items-center rounded-[10px] border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
    >
      {children}
    </span>
  );
}
