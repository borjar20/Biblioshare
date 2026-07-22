import type { SVGProps, ComponentType } from "react";
import type { ActivityKind } from "@/lib/clubs/activities/core";
import {
  BookIcon,
  TiersIcon,
  ListCheckIcon,
  TargetIcon,
  CalendarIcon,
} from "@/components/ui/icons";

// Identidad visual de cada tipo de actividad: un icono y un color. Antes las
// cuatro se veían idénticas (solo cambiaba el texto), y en una lista larga eso
// obliga a leer para distinguirlas.
//
// Los colores salen de los tokens que ya existen — no invento una paleta nueva:
//   lectura         → acento (terracota), es la actividad "de la casa"
//   tierlist        → oro, el color de la valoración: una tierlist ES valorar
//   reto de lista   → teal (el de película), una lista concreta que se tacha
//   reto genérico   → verde (el de lo social/club), la meta común del club
//   evento          → morado (el de serie), el único token libre de la paleta
//
// Ojo, mismas reglas que MEDIA_ACCENT: Tailwind necesita las clases enteras y
// literales, no construidas por concatenación.
export type ActivityAccent = {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  text: string;
  bgSoft: string;
  borderSoft: string;
  /** Relleno sólido: barras de progreso y marcadores del chip. */
  bar: string;
};

export const ACTIVITY_ACCENT: Record<ActivityKind, ActivityAccent> = {
  buddy_read: {
    Icon: BookIcon,
    text: "text-accent",
    bgSoft: "bg-accent/10",
    borderSoft: "border-accent/30",
    bar: "bg-accent",
  },
  tierlist: {
    Icon: TiersIcon,
    text: "text-gold",
    bgSoft: "bg-gold/10",
    borderSoft: "border-gold/30",
    bar: "bg-gold",
  },
  list_challenge: {
    Icon: ListCheckIcon,
    text: "text-type-movie",
    bgSoft: "bg-type-movie/10",
    borderSoft: "border-type-movie/30",
    bar: "bg-type-movie",
  },
  criteria_challenge: {
    Icon: TargetIcon,
    text: "text-green",
    bgSoft: "bg-green/10",
    borderSoft: "border-green/30",
    bar: "bg-green",
  },
  evento: {
    Icon: CalendarIcon,
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    borderSoft: "border-type-series/30",
    bar: "bg-type-series",
  },
};
