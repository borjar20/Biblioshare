import type { DetailMember } from "./types";

// El predicado ÚNICO de «completado» (spec §1.5). Vive aparte porque a partir
// de los itinerarios hay más de un sitio que cuenta avance: el hero
// (computeProgress) y el contador de cada ruta. Tenerlo duplicado es
// exactamente lo que produjo el issue #91, y su primo el #170.
//
// Una relectura es in_progress y completada a la vez; aquí manda el estado del
// pase activo, igual que antes de extraer la función.
export function isMemberCompleted(member: DetailMember | undefined): boolean {
  return member?.status === "completed";
}

/** Cuántas claves `item_type:item_id` de `order` están completadas. */
export function countCompleted(
  order: string[],
  memberByKey: Map<string, DetailMember>,
): number {
  let n = 0;
  for (const key of order) {
    if (isMemberCompleted(memberByKey.get(key))) n++;
  }
  return n;
}
