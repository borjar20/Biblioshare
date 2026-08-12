import type { ComponentType, SVGProps } from "react";
import type { ItemType } from "@/lib/catalog/types";
import type { EventType } from "@/lib/clubs/activities/event-types";
import {
  ORDEN_MARCA,
  type CalendarMark,
  type CalendarMarkKind,
} from "@/lib/clubs/activities/calendar-marks";
import {
  BookIcon,
  CheckIcon,
  FilmIcon,
  PlusIcon,
  SeriesIcon,
  StarIcon,
  TargetIcon,
  UsersIcon,
} from "@/components/ui/icons";

// El color del calendario ya NO se indexa por clase de marca: desde que un
// evento tiene `event_type` (PR #551), dos marcas `evento` del mismo día pueden
// ser cosas distintas -- una quedada y el estreno de una peli. La clave de color
// es su propio eje, con ocho valores.
//
// `Icon` es la señal NO dependiente del color (WCAG 1.4.1, issue #147): una
// silueta por clase, distinta en escala de grises, que el chip de escritorio y
// la leyenda comparten para que un deuteránope pueda casar "el chip con esta
// forma == esta entrada de la leyenda" sin fiarse del tono. Vive AQUÍ, junto al
// color, para no acabar con dos mapas por clase que diverjan.
//
// Tailwind v4 necesita las clases enteras y literales, nunca concatenadas.
//
// `text` NUNCA colorea el TÍTULO de una marca (ese va en `text-foreground`,
// >10:1); el color de la clase viaja por icono, tinte (`bgSoft`) y borde
// (`border`). Pero sí colorea DOS textos pequeños: la etiqueta del chip de
// agenda-list.tsx (9px, mayúsculas) y el subtítulo de la tira "Próximo" de
// club-summary.tsx (12px), ambos sobre `bgSoft`. Ahí el umbral es el de TEXTO
// (4.5:1), no el 3:1 de objeto gráfico, y mark-accent.test.ts mide los dos:
// `bar` contra --surface a 3:1 y `text` contra el tinte compuesto a 4.5:1.
// Por eso --event-meetup y --event-highlight son más oscuros de lo que pedía
// el objeto gráfico solo, y por eso gold (cierre, 2.64:1) y accent (hito,
// 4.35:1) están excluidos con issue: son tokens compartidos con media app.
export type MarkAccent = {
  text: string;
  bgSoft: string;
  bar: string;
  border: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export type MarkAccentKey =
  | "inicio"
  | "hito"
  | "cierre"
  | "encuentro"
  | "fecha_destacada"
  | "lanzamiento_book"
  | "lanzamiento_movie"
  | "lanzamiento_series";

// El orden de declaración de las tres últimas ES el de la fila "LANZAMIENTOS"
// de la leyenda (se deriva de Object.keys más abajo).
export const MARK_ACCENT: Record<MarkAccentKey, MarkAccent> = {
  inicio: {
    text: "text-green",
    bgSoft: "bg-green/10",
    bar: "bg-green",
    border: "border-green",
    Icon: PlusIcon,
  },
  hito: {
    text: "text-accent",
    bgSoft: "bg-accent/10",
    bar: "bg-accent",
    border: "border-accent",
    Icon: TargetIcon,
  },
  cierre: {
    text: "text-gold",
    bgSoft: "bg-gold/10",
    bar: "bg-gold",
    border: "border-gold",
    Icon: CheckIcon,
  },
  // Token propio, NO --spine: se probó con --spine (mismo beige del nexo de
  // sagas) pero ese color se afinó para el lienzo OSCURO del grafo, y sobre
  // el --surface casi blanco del calendario en tema claro medía 2.27:1 --
  // por debajo del 3:1 que exige WCAG 1.4.1 para un objeto gráfico (aquí, el
  // icono y la muestra de la leyenda). No se puede oscurecer --spine para
  // arreglarlo: lo comparten las sagas y cambiarlo las restilaría, así que
  // --event-meetup nace como hermano del mismo beige, más oscuro en claro y
  // más claro en oscuro para llegar también al 4.5:1 de TEXTO (ver arriba).
  encuentro: {
    text: "text-event-meetup",
    bgSoft: "bg-event-meetup/10",
    bar: "bg-event-meetup",
    border: "border-event-meetup",
    Icon: UsersIcon,
  },
  fecha_destacada: {
    text: "text-event-highlight",
    bgSoft: "bg-event-highlight/10",
    bar: "bg-event-highlight",
    border: "border-event-highlight",
    Icon: StarIcon,
  },
  // OJO: el evento genérico usaba `type-series`, y NO puede seguir haciéndolo:
  // ese token pasa a significar "lanzamiento de serie", así que un encuentro y
  // el estreno de una serie serían el mismo púrpura.
  lanzamiento_book: {
    text: "text-type-book",
    bgSoft: "bg-type-book/10",
    bar: "bg-type-book",
    border: "border-type-book",
    Icon: BookIcon,
  },
  lanzamiento_movie: {
    text: "text-type-movie",
    bgSoft: "bg-type-movie/10",
    bar: "bg-type-movie",
    border: "border-type-movie",
    Icon: FilmIcon,
  },
  lanzamiento_series: {
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    bar: "bg-type-series",
    border: "border-type-series",
    Icon: SeriesIcon,
  },
};

// Record en vez de plantilla `lanzamiento_${medium}`: así el compilador
// comprueba que los tres medios tienen clave, en vez de fiarlo a un cast.
const LANZAMIENTO_POR_MEDIO: Record<ItemType, MarkAccentKey> = {
  book: "lanzamiento_book",
  movie: "lanzamiento_movie",
  series: "lanzamiento_series",
};

const EVENTO_POR_TIPO: Record<EventType, MarkAccentKey> = {
  encuentro: "encuentro",
  fecha_destacada: "fecha_destacada",
  // Solo se usa cuando el lanzamiento no tiene medio del que sacar color:
  // `config.item` es nullable y parseEventConfig lo deja a null ante cualquier
  // forma que no case. Un sexto color para "lanzamiento sin medio" sería una
  // entrada de leyenda que no significa nada para quien mira; el chip sí lo
  // dirá en texto ("Lanzamiento" a secas).
  lanzamiento: "fecha_destacada",
};

/**
 * `markKind` manda SIEMPRE, y solo desciende al tipo cuando la marca es un
 * evento. Un checkpoint de una actividad evento llega con markKind "hito" y
 * tiene que seguir pintándose de hito.
 *
 * Total por construcción: nunca devuelve undefined, ni siquiera para una marca
 * de evento sin `eventType` -- eso dejaría la celda sin color y sin icono.
 */
export function accentKeyFor(
  mark: Pick<CalendarMark, "markKind" | "eventType" | "medium">,
): MarkAccentKey {
  if (mark.markKind !== "evento") return mark.markKind;
  if (!mark.eventType) return "fecha_destacada";
  if (mark.eventType === "lanzamiento" && mark.medium) {
    return LANZAMIENTO_POR_MEDIO[mark.medium];
  }
  return EVENTO_POR_TIPO[mark.eventType];
}

// Las tres filas de la leyenda se DERIVAN de las claves del Record, nunca se
// escriben a mano: una clave nueva aparece sola en su fila. Dos constantes
// gemelas acabarían divergiendo y la leyenda contradiría a la rejilla sin que
// nada avisara (es el mismo motivo por el que ORDEN_MARCA se importa en vez de
// copiarse).
const TODAS = Object.keys(MARK_ACCENT) as MarkAccentKey[];

const CLASES_DE_MARCA = new Set<string>(["inicio", "hito", "cierre"]);

/** Fila 1: las clases estructurales, en el mismo orden que desempata la rejilla. */
export const LEYENDA_MARCAS: MarkAccentKey[] = TODAS.filter((k) =>
  CLASES_DE_MARCA.has(k),
).sort((a, b) => ORDEN_MARCA[a as CalendarMarkKind] - ORDEN_MARCA[b as CalendarMarkKind]);

/** Fila 2: los eventos que no son lanzamientos. */
export const LEYENDA_EVENTOS: MarkAccentKey[] = TODAS.filter(
  (k) => !CLASES_DE_MARCA.has(k) && !k.startsWith("lanzamiento_"),
);

/** Fila 3: los medios de lanzamiento, en el orden de declaración del Record. */
export const LEYENDA_LANZAMIENTOS: MarkAccentKey[] = TODAS.filter((k) =>
  k.startsWith("lanzamiento_"),
);
