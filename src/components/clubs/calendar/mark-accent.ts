import type { CalendarMarkKind } from "@/lib/clubs/activities/calendar-marks";

// Color por CLASE DE MARCA, no por kind de actividad. Son ejes distintos: la
// leyenda del calendario habla de evento/hito/inicio/cierre, mientras que
// ACTIVITY_ACCENT colorea por buddy_read/tierlist/... Los tokens salen de los
// que ya existen en el tema, no de los hex del mockup.
//
// Tailwind v4 necesita las clases enteras y literales, nunca concatenadas.
export type MarkAccent = {
  text: string;
  bgSoft: string;
  bar: string;
};

export const MARK_ACCENT: Record<CalendarMarkKind, MarkAccent> = {
  evento: {
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    bar: "bg-type-series",
  },
  hito: {
    text: "text-accent",
    bgSoft: "bg-accent/10",
    bar: "bg-accent",
  },
  inicio: {
    text: "text-green",
    bgSoft: "bg-green/10",
    bar: "bg-green",
  },
  cierre: {
    text: "text-gold",
    bgSoft: "bg-gold/10",
    bar: "bg-gold",
  },
};
