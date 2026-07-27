import type { SagaAccentToken } from "./accents";
import { partitionGroups, type MemberGroup } from "./group-members";
import type { SagaGraph, SagaGraphEdge, SagaGraphNode } from "./map-types";
import type { DetailMember, ResolvedWindow } from "./types";

// Derivación PURA del mapa (fase 3, Task 1): sustituye a las tablas curadas a
// mano `saga_nodes`/`saga_edges` — el mapa se DERIVA de lo que ya está curado
// en otras pantallas (secuencia, tándems, bloques y ventanas), sin lienzo
// propio. Tiene que producir el MISMO `SagaGraph` que `buildSagaGraph`
// (graph-data.ts) produce hoy: la vista 2D, el timeline móvil y el
// mini-preview del CTA lo consumen tal cual y no cambian ni una línea.
//
// Un nodo es SIEMPRE una obra individual (nunca un bloque: un bloque es
// agrupación visual). Las ventanas son las aristas que cruzan, y no ganan
// poder: sigue habiendo como mucho una ventana por entrada (dos anclas).

/** Lookup reducido a lo que `deriveSagaMap` de verdad necesita: los nodos-saga
 *  ya no existen, así que `childNames`/`childCovers`/`childCounts` de
 *  `GraphLookup` (graph-data.ts) sobran aquí. */
export type MapLookup = {
  groupAccent: Map<string | null, SagaAccentToken>;
  groupName: Map<string | null, string | null>;
};

/** Clave de la entrada de una obra, la misma que usan el borrador de
 *  secuencia, la validación y las ventanas (`i:<tipo>:<uuid>`). */
const itemKey = (m: DetailMember): string => `i:${m.itemType}:${m.itemId}`;

/** Clave de la entrada de un bloque (`s:<uuid>`), o null si la referencia no
 *  tiene forma de bloque. */
const blockSagaId = (key: string): string | null => (key.startsWith("s:") ? key.slice(2) : null);

export function deriveSagaMap(
  groups: MemberGroup[],
  windows: Record<string, ResolvedWindow>,
  lookup: MapLookup,
  // Se rellena en la Task 3 (subconjunto de una ruta curada); aquí siempre
  // undefined — Task 1 solo produce el mapa completo.
  routeKeys?: string[],
): SagaGraph {
  const { ordered, free } = partitionGroups(groups);
  const blocks = [...ordered, ...free];

  const nodes: SagaGraphNode[] = [];
  const byId = new Map<string, SagaGraphNode>();
  // Primera/última obra de cada bloque (por su sagaId), para resolver un
  // sujeto/ancla que apunte a un bloque entero en vez de a una obra: un
  // bloque no es un nodo, así que hay que apuntar a su obra de entrada/salida.
  const firstOfBlock = new Map<string, string>();
  const lastOfBlock = new Map<string, string>();
  const edges: SagaGraphEdge[] = [];

  // `x` es un contador de huecos COMPARTIDO por todo el mapa: no se reinicia
  // al cambiar de bloque, así que los bloques colocados salen en columnas
  // crecientes. Dos obras en el mismo hueco de su bloque (tándem, mismo
  // `position`) comparten `x` — nunca se fusiona un hueco con `position: null`
  // con el siguiente: cada obra sin clasificar es su propio hueco.
  let x = 0;

  blocks.forEach((group, y) => {
    // Reparte los miembros (ya vienen ordenados por groupMembers: position,
    // luego título) en huecos: cada hueco es un array de 1 (obra suelta) o más
    // (tándem) miembros que comparten `position`.
    const huecos: DetailMember[][] = [];
    for (const m of group.members) {
      const current = huecos.at(-1);
      const sameHueco = current !== undefined && m.position !== null && current[0].position === m.position;
      if (sameHueco) current.push(m);
      else huecos.push([m]);
    }

    if (group.sagaId !== null && huecos.length > 0) {
      firstOfBlock.set(group.sagaId, itemKey(huecos[0][0]));
      lastOfBlock.set(group.sagaId, itemKey(huecos.at(-1)![0]));
    }

    huecos.forEach((hueco, huecoIdx) => {
      for (const m of hueco) {
        const node: SagaGraphNode = {
          id: itemKey(m),
          kind: "item",
          x,
          y,
          // Sustitución que pide el spec: "menor" para una obra optional,
          // "principal" para el resto.
          level: m.optional ? "menor" : "principal",
          orderNo: x,
          label: m.title,
          accent: lookup.groupAccent.get(m.groupSagaId) ?? "beige",
          status: m.status,
          role: m.role,
          coverUrl: m.coverUrl,
          covers: [],
          href: m.href,
          memberCount: null,
          groupSagaId: m.groupSagaId,
          groupName: lookup.groupName.get(m.groupSagaId) ?? null,
        };
        nodes.push(node);
        byId.set(node.id, node);
      }

      // Aristas de cadena: entre huecos consecutivos DEL MISMO BLOQUE, cada
      // nodo del hueco anterior con cada nodo de este (con tándem, las dos
      // obras continúan la cadena).
      const previous = huecos[huecoIdx - 1];
      if (previous) {
        for (const prevMember of previous) {
          for (const m of hueco) {
            const source = byId.get(itemKey(prevMember))!;
            const target = itemKey(m);
            edges.push({
              id: `chain:${source.id}->${target}`,
              source: source.id,
              target,
              type: "principal",
              accent: source.accent,
            });
          }
        }
      }

      x++;
    });
  });

  // Resuelve una clave de entrada (obra o bloque) a la obra que le corresponde
  // en el mapa: una obra se resuelve a sí misma; un bloque se resuelve a su
  // primera o su última obra según `which` — un bloque nunca es un nodo.
  const resolveEntry = (key: string, which: "first" | "last"): string | null => {
    const sagaId = blockSagaId(key);
    if (sagaId !== null) {
      return (which === "first" ? firstOfBlock : lastOfBlock).get(sagaId) ?? null;
    }
    return byId.has(key) ? key : null;
  };

  // Aristas de ventana, una por cada entrada que tenga una. El sujeto se
  // resuelve como "first" (por donde se entra en un bloque); un ancla
  // `after` se resuelve como "last" (se puede empezar cuando ese bloque ha
  // terminado); un ancla `before`, como "first". Si cualquiera de los dos
  // extremos no resuelve a un nodo del mapa, no hay arista — misma regla que
  // la ficha con un ancla rota.
  for (const [subjectKey, w] of Object.entries(windows)) {
    const subject = resolveEntry(subjectKey, "first");
    if (subject === null) continue;

    if (w.afterKey !== null) {
      const after = resolveEntry(w.afterKey, "last");
      if (after !== null) {
        edges.push({
          id: `window:${after}->${subject}`,
          source: after,
          target: subject,
          type: "requisito",
          accent: "beige",
        });
      }
    }

    if (w.beforeKey !== null) {
      const before = resolveEntry(w.beforeKey, "first");
      if (before !== null) {
        edges.push({
          id: `window:${subject}->${before}`,
          source: subject,
          target: before,
          type: "opcional",
          accent: "ambar",
        });
      }
    }
  }

  // Mismo orden estable que buildSagaGraph: order_no (nulls al final), luego label.
  nodes.sort((a, b) => {
    const oa = a.orderNo ?? Number.MAX_SAFE_INTEGER;
    const ob = b.orderNo ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label);
  });

  return { nodes, edges };
}
