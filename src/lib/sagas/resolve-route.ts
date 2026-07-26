import { isMemberCompleted } from "./completion";
import type { DetailMember } from "./types";
import type { RawRouteEntry, ResolvedRoute, ResolvedStep, RouteLookup } from "./route-types";

const keyOf = (m: DetailMember) => `${m.itemType}:${m.itemId}`;

// Resolución PURA de un itinerario: filas de saga_route_entries → pasos con
// obra o bloque resuelto. Un bloque se expande con el ORDEN PRINCIPAL de esa
// subsaga (mainOrderOf, createMainOrder) — la misma función de SECUENCIA que
// usan las portadas del abanico y el «siguiente» de las cards, NO la que
// cuenta el avance del hero (eso es countedKeys/pertenencia desde el
// 2026-07-25, ./progress.ts). Un bloque expande «su orden principal», no
// «todos sus miembros»: un ítem sin hueco en la secuencia (grafo con order_no
// null) no aparece como paso. Eso NO es lo mismo que filtrar por `optional`:
// createMainOrder ni siquiera recibe ese campo, así que un miembro `optional`
// SÍ entra como paso, y SÍ cuenta en `total`, si tiene hueco en la secuencia.
//
// Una referencia colgante (item_id que ya no es miembro, subsaga inexistente)
// se descarta aquí de LOS DOS sitios (render y `total`): el `continue` de
// cada rama del for de abajo la deja fuera de `counted` antes de que pueda
// contarse en ningún sitio.
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
