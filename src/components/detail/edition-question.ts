import type { ItemType } from "@/lib/catalog/types";

// Lógica pura de «¿hay que preguntarle al usuario qué edición está usando?»,
// extraída de ProgressBlock (log-panel.tsx) para poder testearla sin montar el
// componente — mismo motivo y mismo patrón que tab-visibility.ts.
//
// El umbral era `editions.length > 1` y tenía sentido cuando abrir la ficha
// sincronizaba cientos de ediciones desde OpenLibrary: si solo había una, no
// había nada que elegir. Ese sync murió (Tarea 10), así que hoy
// `book_editions` solo contiene tiradas que alguien identificó de verdad y **0
// o 1 ediciones es el caso NORMAL de un libro recién añadido** — justo donde
// más falta hacen el escaneo del ISBN y las candidatas en vivo de OpenLibrary
// que ofrece el selector desde la Tarea 13. Con el umbral viejo el selector no
// se pintaba nunca en esos libros y la pregunta no llegaba a hacerse.
//
// Las películas siguen en `> 1`: `movie_versions` no tiene ISBN que escanear ni
// obra en OpenLibrary de la que sacar candidatas, así que con menos de dos
// versiones la pregunta no tiene respuesta posible. Las series no se preguntan
// nunca: su unidad de progreso son los episodios, no una edición.
export function shouldAskForEdition({
  itemType,
  editionCount,
  passEditionId,
  answered,
}: {
  itemType: ItemType;
  editionCount: number;
  /** `null` = el pase abierto todavía no tiene edición asignada. */
  passEditionId: string | null;
  /** Ya se contestó en esta sesión, o se contestó «No lo sé» en su día. */
  answered: boolean;
}): boolean {
  if (itemType === "series") return false;
  if (passEditionId !== null) return false;
  if (answered) return false;
  return itemType === "book" || editionCount > 1;
}
