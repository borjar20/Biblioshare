import type { DetailMember, MemberStatus } from "./types";

// El predicado ÚNICO de «completado» (spec §1.5). Vive aparte porque a partir
// de los itinerarios hay más de un sitio que cuenta avance: el hero
// (computeProgress) y el contador de cada ruta. Tenerlo duplicado es
// exactamente lo que produjo el issue #91, y su primo el #170.
//
/** El predicado sobre el estado DESNUDO. Existe porque el mini-track de la
 *  fase 3 mira nodos del grafo (`SagaGraphNode.status`), no `DetailMember`, y
 *  escribir ahí un `=== "completed"` suelto sería el segundo sitio que define
 *  «completado» — que es literalmente el #91. Un solo cuerpo, dos formas de
 *  entrada. */
export function isStatusCompleted(status: MemberStatus): boolean {
  return status === "completed";
}

// Una relectura es in_progress y completada a la vez; aquí manda el estado del
// pase activo, igual que antes de extraer la función.
export function isMemberCompleted(member: DetailMember | undefined): boolean {
  return isStatusCompleted(member?.status ?? null);
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
