import type { ComponentType, SVGProps } from "react";
import type { CalendarMarkKind } from "@/lib/clubs/activities/calendar-marks";
import {
  CalendarIcon,
  TargetIcon,
  PlusIcon,
  CheckIcon,
} from "@/components/ui/icons";

// Color por CLASE DE MARCA, no por kind de actividad. Son ejes distintos: la
// leyenda del calendario habla de evento/hito/inicio/cierre, mientras que
// ACTIVITY_ACCENT colorea por buddy_read/tierlist/... Los tokens salen de los
// que ya existen en el tema, no de los hex del mockup.
//
// `Icon` es la señal NO dependiente del color (WCAG 1.4.1, issue #147): una
// silueta por clase, distinta en escala de grises, que el chip de escritorio y
// la leyenda comparten para que un deuteránope pueda casar "el chip con esta
// forma == esta entrada de la leyenda" sin fiarse del tono. Vive AQUÍ, junto al
// color, para no acabar con dos mapas por clase que diverjan.
//
// Tailwind v4 necesita las clases enteras y literales, nunca concatenadas.
// `text` colorea el ICONO y la muestra de la leyenda (objeto gráfico, umbral
// 3:1), NUNCA el título del chip: el token vívido sobre el tinte al 10% no llega
// a 4.5:1 para texto pequeño (gold da 2.63 en claro, medido en #147). El título
// va en `text-foreground` (>10:1) y el color de la clase viaja por icono, tinte
// (`bgSoft`) y borde (`border`).
export type MarkAccent = {
  text: string;
  bgSoft: string;
  bar: string;
  border: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const MARK_ACCENT: Record<CalendarMarkKind, MarkAccent> = {
  evento: {
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    bar: "bg-type-series",
    border: "border-type-series",
    Icon: CalendarIcon,
  },
  hito: {
    text: "text-accent",
    bgSoft: "bg-accent/10",
    bar: "bg-accent",
    border: "border-accent",
    Icon: TargetIcon,
  },
  inicio: {
    text: "text-green",
    bgSoft: "bg-green/10",
    bar: "bg-green",
    border: "border-green",
    Icon: PlusIcon,
  },
  cierre: {
    text: "text-gold",
    bgSoft: "bg-gold/10",
    bar: "bg-gold",
    border: "border-gold",
    Icon: CheckIcon,
  },
};
