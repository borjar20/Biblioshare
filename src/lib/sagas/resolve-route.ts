import { isMemberCompleted } from "./completion";
import type { DetailMember } from "./types";
import type { RawRouteEntry, ResolvedRoute, ResolvedStep, RouteLookup } from "./route-types";

const keyOf = (m: DetailMember) => `${m.itemType}:${m.itemId}`;

// Resolución PURA de un itinerario: filas de saga_route_entries → pasos con
// obra o bloque resuelto. Un bloque se expande con el ORDEN PRINCIPAL de esa
// subsaga (la misma regla y la misma función que el hero), no con todos sus
// miembros: si la subsaga tiene opcionales, no deben inflar el contador.
//
// Una referencia colgante (item_id que ya no es miembro, subsaga inexistente)
// se descarta del render Y del denominador. El grafo hace solo lo primero y por
// eso su avance no puede llegar al 100% (issue #170): aquí no se replica.
export function resolveRoute(entries: RawRouteEntry[], lookup: RouteLookup): ResolvedRoute {
  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const steps: ResolvedStep[] = [];
  // Deduplicado por clave: una obra suelta que también aparece dentro de un
  // bloque debe contar UNA vez en el denominador.
  const counted = new Map<string, DetailMember>();

  for (const e of ordered) {
    if (e.itemType !== null && e.itemId !== null) {
      const member = lookup.members.get(`${e.itemType}:${e.itemId}`);
      if (!member) continue; // colgante
      steps.push({ kind: "item", member, note: e.note });
      counted.set(keyOf(member), member);
    } else if (e.childSagaId !== null) {
      const name = lookup.childNames.get(e.childSagaId);
      if (!name) continue; // subsaga inexistente o fuera del árbol
      const members = lookup
        .mainOrderOf(e.childSagaId)
        .flatMap((k) => {
          const m = lookup.members.get(k);
          return m ? [m] : [];
        });
      steps.push({
        kind: "block",
        sagaId: e.childSagaId,
        name,
        accent: lookup.childAccent.get(e.childSagaId) ?? "beige",
        members,
        note: e.note,
      });
      for (const m of members) counted.set(keyOf(m), m);
    }
  }

  let completed = 0;
  for (const m of counted.values()) if (isMemberCompleted(m)) completed++;

  return { steps, total: counted.size, completed };
}
