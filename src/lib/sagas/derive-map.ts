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

// `deriveSagaMap` tiene que devolver coordenadas en PÍXELES, no en índice de
// columna/fila (0, 1, 2…): `saga-graph-view.tsx` usa `n.x`/`n.y` TAL CUAL
// como `position` de React Flow (`position: { x: n.x, y: n.y }`), sin
// normalizar nada. La única función que normaliza escalas es `scaleNodes`
// (derive-timeline.ts), y solo la llama el mini-preview del CTA
// (map-cta.tsx) — la vista 2D no pasa por ahí. Si aquí se devolvieran
// índices, todos los nodos caerían unos sobre otros en el lienzo, porque la
// tarjeta de portada mide 78×116px (`graph-nodes.tsx`, `CoverNode`).
//
// Paso horizontal entre columnas: bajo cada portada cuelga una etiqueta de
// 150px, centrada sobre la tarjeta (78px de ancho). Dos columnas contiguas
// necesitan al menos 150px centro a centro para que sus etiquetas no se
// toquen; 180px deja ~30px de margen.
const NODE_STEP_X = 180;

// Paso vertical entre filas (una fila = un bloque, `blocks.forEach((group,
// y) => …)`): la portada mide 116px de alto, más la etiqueta que cuelga
// debajo (`mt-2` = 8px + hasta dos líneas de `text-sm leading-tight`, unos
// 40px). Una fila necesita ~164px para no invadir la portada de la fila
// siguiente; 220px deja margen cómodo.
const NODE_STEP_Y = 220;

/**
 * Deriva PURAMENTE el `SagaGraph` de una saga a partir de lo curado (grupos,
 * ventanas). Precondición de determinismo, a cargo de quien llama: `groups`
 * y los `members` de cada grupo tienen que llegar YA EN EL ORDEN FINAL DE
 * PINTADO — el mismo que entrega `groupMembers` (grupos por
 * `positionInParent`/heurística; miembros por `position`, luego título).
 * `deriveSagaMap` no reordena nada, ni los grupos ni sus miembros: si se le
 * pasa un array barajado, el mapa sale con huecos y columnas en desorden.
 */
export function deriveSagaMap(
  groups: MemberGroup[],
  windows: Record<string, ResolvedWindow>,
  lookup: MapLookup,
  // Claves de los pasos de un itinerario curado, YA EN ORDEN (Task 3): la
  // misma forma que `RouteEditorItem.key`/`keyOfRouteEntry` — `i:<tipo>:<uuid>`
  // para una obra, `s:<uuid>` para un bloque.
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

  // `x` es un contador de columnas COMPARTIDO por todo el mapa: no se
  // reinicia al cambiar de bloque, así que los bloques colocados salen en
  // columnas crecientes. Dos obras en el mismo hueco de su bloque (tándem,
  // mismo `position`) comparten `x`.
  let x = 0;

  // Nodo de una obra, hueco o suelta: `orderNo` es la única diferencia — una
  // obra CON hueco lo hereda de `x` (entra en la columna principal de
  // deriveTimeline); una obra SIN hueco recibe `null` (activa el mecanismo de
  // ramas/puentes de deriveTimeline en vez de la columna). `col`/`row` son
  // índices lógicos (columna compartida, fila = bloque); aquí se escalan a
  // píxeles (`NODE_STEP_X`/`NODE_STEP_Y`) para `x`/`y`, pero `orderNo` se
  // queda con el índice crudo — es un orden lógico para deriveTimeline, no
  // una coordenada de lienzo.
  const makeNode = (m: DetailMember, col: number, row: number, orderNo: number | null): SagaGraphNode => ({
    id: itemKey(m),
    kind: "item",
    x: col * NODE_STEP_X,
    y: row * NODE_STEP_Y,
    // Sustitución que pide el spec: "menor" para una obra optional,
    // "principal" para el resto.
    level: m.optional ? "menor" : "principal",
    orderNo,
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
    // Se rellena más abajo, si hay `routeKeys`: por defecto no hay itinerario
    // activo, o el itinerario no pasa por este nodo.
    step: null,
  });

  blocks.forEach((group, y) => {
    // Una obra SIN hueco (`position === null`: `libre` o sin clasificar, lo
    // impone el CHECK saga_items_placement_position) SÍ es un nodo del mapa,
    // pero no forma parte de la cadena: ni abre ni cierra huecos, y ninguna
    // arista `principal` la toca (hallazgo 1 de la revisión — antes se
    // agrupaba una a una como si cada una fuera su propio hueco encadenado).
    // groupMembers ya deja los miembros ordenados por `position` y luego
    // título, con los `position: null` al final, así que basta con partir el
    // array UNA vez: todo lo encadenable va antes que todo lo suelto.
    const chained = group.members.filter((m) => m.position !== null);
    const loose = group.members.filter((m) => m.position === null);

    // Reparte los miembros encadenables en huecos: cada hueco es un array de
    // 1 (obra suelta dentro de la cadena) o más (tándem) miembros que
    // comparten `position`.
    const huecos: DetailMember[][] = [];
    for (const m of chained) {
      const current = huecos.at(-1);
      const sameHueco = current !== undefined && current[0].position === m.position;
      if (sameHueco) current.push(m);
      else huecos.push([m]);
    }

    if (group.sagaId !== null && huecos.length > 0) {
      // Ancla del bloque = la obra que abre/cierra su cadena. Si el hueco
      // extremo es un tándem (dos obras con el mismo `position`), no hay
      // ambigüedad que resolver en tiempo de curación: `ResolvedWindow` admite
      // una sola clave por ancla (afterKey/beforeKey), así que se elige la
      // PRIMERA obra insertada en ese hueco (orden ya aplicado por
      // groupMembers: position, luego título) como "la" primera/última obra
      // del bloque. La segunda obra del tándem límite queda fuera del ancla:
      // decisión de diseño, no un descuido.
      firstOfBlock.set(group.sagaId, itemKey(huecos[0][0]));
      lastOfBlock.set(group.sagaId, itemKey(huecos.at(-1)![0]));
    }

    huecos.forEach((hueco, huecoIdx) => {
      for (const m of hueco) {
        const node = makeNode(m, x, y, x);
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

    // Obras sin hueco: conservan la fila (`y`) de su bloque; su `x` va
    // después del último hueco real del bloque, de forma determinista (orden
    // ya aplicado por groupMembers: título, al no tener `position`). Ninguna
    // arista de cadena las toca — solo pueden llevar aristas de ventana, más
    // abajo.
    for (const m of loose) {
      const node = makeNode(m, x, y, null);
      nodes.push(node);
      byId.set(node.id, node);
      x++;
    }
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

  // El itinerario, encima del mapa (Task 3): dos capas con una única regla —
  // el itinerario manda sobre lo que dice, y el mapa sobre lo que el
  // itinerario calla. `routeKeys` puede nombrar un bloque (`s:<uuid>`): un
  // bloque nunca es un nodo del mapa (siempre se expande en sus obras), así
  // que esa clave nunca está en `byId` y cae en la MISMA rama que un paso
  // "fantasma" (obra borrada, referencia rota) — se ignora sin necesitar un
  // caso aparte. A diferencia de `resolveEntry` (ventanas), aquí NO se
  // resuelve un bloque a su primera/última obra: el itinerario no gana poder
  // sobre el mapa, solo numera lo que el mapa ya dibuja.
  //
  // El número es la posición en `routeKeys` (1..N), no un contador de nodos
  // vistos: si el paso 1 no se ve, el paso 2 sigue siendo el 2. Numerar solo
  // lo visible haría que el mapa y la lista del itinerario contaran distinto
  // — la contradicción que esta fase existe para eliminar.
  if (routeKeys) {
    routeKeys.forEach((key, i) => {
      const node = byId.get(key);
      if (node) node.step = i + 1;
    });
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
