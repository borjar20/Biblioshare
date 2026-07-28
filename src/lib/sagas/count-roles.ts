import type { SagaGraph } from "./map-types";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "./roles";

/** Cuántas obras hay de cada rol EN EL GRAFO (fase 5).
 *
 *  Sobre el grafo y no sobre las filas visibles del timeline, a propósito: es lo
 *  que hace reversible la barra de filtro. Contadas sobre lo visible, filtrar
 *  por «Precuela» dejaría la barra con un solo chip y no habría forma de volver
 *  — exactamente el error que la fase 4 evitó al contar `optionalCount` sobre el
 *  grafo. Por eso cuenta también las opcionales y las saltadas.
 *
 *  Devuelve solo los roles presentes, en el orden de lectura del vocabulario:
 *  una barra con seis chips a cero sería ruido en las sagas sin roles, que hoy
 *  son casi todas (8 filas con rol de 367 en producción). */
export function countRoles(graph: SagaGraph): Array<{ role: SagaItemRole; count: number }> {
  const cuenta = new Map<SagaItemRole, number>();
  for (const n of graph.nodes) {
    if (n.kind !== "item" || n.role === null) continue;
    cuenta.set(n.role, (cuenta.get(n.role) ?? 0) + 1);
  }
  return SAGA_ITEM_ROLES.flatMap((role) => {
    const count = cuenta.get(role);
    return count === undefined ? [] : [{ role, count }];
  });
}
