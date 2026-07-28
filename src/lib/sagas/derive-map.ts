import type { ItemType } from "@/lib/catalog/types";
import type { SagaAccentToken } from "./accents";
import { orderBlocksForLayout, partitionGroups, type MemberGroup } from "./group-members";
import type { SagaGraph, SagaGraphEdge, SagaGraphNode } from "./map-types";
import type { DetailMember, ResolvedWindow, SagaPlacement, TandemMode } from "./types";
import { NODE_STEP_X, NODE_STEP_Y } from "./graph-metrics";

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

/** Inversa de `itemKey`, y vive PEGADA a ella a propósito: son las dos mitades
 *  de un mismo formato, y separarlas es cómo se desincronizan. `null` para un
 *  id que no sea de obra (un `s:<uuid>` de bloque, o cualquier otra cosa).
 *
 *  La necesita quien pinta una fila del timeline y tiene que volver a la obra:
 *  el nodo lleva la clave, no el par (tipo, id). */
export function parseItemKey(id: string): { itemType: ItemType; itemId: string } | null {
  const m = /^i:(book|movie|series):(.+)$/.exec(id);
  return m === null ? null : { itemType: m[1] as ItemType, itemId: m[2] };
}

/** Clave de la entrada de un bloque (`s:<uuid>`), o null si la referencia no
 *  tiene forma de bloque. */
const blockSagaId = (key: string): string | null => (key.startsWith("s:") ? key.slice(2) : null);

// Los pasos de rejilla viven en graph-metrics.ts, con el resto de medidas en
// píxeles: `layout-map.ts` necesita NODE_STEP_X y si lo importara de aquí los
// dos módulos se importarían mutuamente. Se re-exportan para no romper a quien
// ya los importaba de este módulo.
export { NODE_STEP_X, NODE_STEP_Y } from "./graph-metrics";

/** Reparte los miembros ENCADENABLES de un bloque en huecos: cada hueco es un
 *  array de 1 (obra suelta dentro de la cadena) o más (tándem) miembros que
 *  comparten `position`. Una obra sin hueco (`position === null`: `libre` o sin
 *  clasificar) no entra: es un nodo del mapa, pero no de la cadena.
 *
 *  Vive fuera de `deriveSagaMap` porque hay DOS recorridos que necesitan el
 *  mismo reparto —la pre-pasada de `orderNo`, en orden de lectura, y el pintado,
 *  en orden de filas— y dos copias del mismo bucle acaban discrepando. */
function huecosDe(group: MemberGroup): DetailMember[][] {
  const huecos: DetailMember[][] = [];
  for (const m of group.members) {
    if (m.position === null) continue;
    const current = huecos.at(-1);
    if (current !== undefined && current[0].position === m.position) current.push(m);
    else huecos.push([m]);
  }
  return huecos;
}

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
  // Metadatos de los huecos en tándem (fase 2), indexados por
  // `<sagaId>:<position>` — la clave real de `saga_tandems`. Se resuelven AQUÍ
  // y no en `deriveTimeline` porque aquí sí se conoce la `position` de cada
  // miembro mientras se construyen los huecos; el nodo solo lleva `orderNo`.
  tandems?: Map<string, { mode: TandemMode | null; note: string | null }>,
): SagaGraph {
  const { ordered, free } = partitionGroups(groups);
  // Orden de PINTADO (filas), que ya no es el de lectura: un bloque libre con
  // ventana sube junto a su ancla para que esa arista no cruce el lienzo entero.
  // El orden de LECTURA sigue siendo `[...ordered, ...free]`, y es el que usa la
  // pre-pasada de `orderNo` unas líneas más abajo.
  const blocks = orderBlocksForLayout(ordered, free, windows);

  const nodes: SagaGraphNode[] = [];
  const byId = new Map<string, SagaGraphNode>();
  // Primera/última obra de cada bloque (por su sagaId), para resolver un
  // sujeto/ancla que apunte a un bloque entero en vez de a una obra: un
  // bloque no es un nodo, así que hay que apuntar a su obra de entrada/salida.
  const firstOfBlock = new Map<string, string>();
  const lastOfBlock = new Map<string, string>();
  const edges: SagaGraphEdge[] = [];

  // Cola de la cadena en la ZONA ORDENADA: el último hueco encadenable visto,
  // de cualquier bloque ordenado anterior (no necesariamente el inmediatamente
  // anterior — un bloque sin obras encadenables se salta sin romper la
  // cadena, así que esto puede "saltar por encima" de uno o más bloques
  // vacíos). Es un array de miembros (no una sola obra) porque un tándem en el
  // límite tiene que conectar TODAS sus obras, igual que dentro de un bloque.
  // Los bloques `libre` no la tocan (ni la leen ni la actualizan): flotan a
  // propósito, fuera de la cadena.
  let chainTail: DetailMember[] | null = null;

  // Task 9: el mapa salía como una escalera diagonal larguísima porque `x` era
  // un contador de columnas COMPARTIDO por todo el mapa (crecía con cada hueco
  // de CUALQUIER bloque, así que 20 obras dibujaban 20 columnas de ancho).
  // Decisión del responsable: una fila por bloque, COMPACTA. `x` se declara
  // DENTRO de `blocks.forEach` (más abajo) y por eso se reinicia en cada bloque
  // — cada uno es una cadena horizontal corta que empieza en la columna 0, y el
  // ancho del dibujo pasa a ser el del bloque más largo, no la suma de todos.
  //
  // `orderNo` es harina de otro costal: NO es una coordenada, es el índice
  // lógico que consume `deriveTimeline` (derive-timeline.ts) para construir su
  // columna del timeline móvil, y TIENE que seguir siendo global y creciente en
  // el ORDEN DE LECTURA.
  //
  // Por eso se calcula AQUÍ, en una pre-pasada sobre `[...ordered, ...free]`, y
  // no dentro del `forEach` de pintado: desde que `orderBlocksForLayout` puede
  // intercalar un bloque libre entre dos colocados, el orden de pintado y el de
  // lectura ya no son el mismo, y un contador que siguiera al `forEach` movería
  // el timeline de móvil cada vez que alguien curara una ventana. Todos los
  // miembros de un mismo hueco (un tándem) comparten `orderNo`: es la
  // pertenencia al hueco, y `deriveMapOverlays` la lee así para dibujar la
  // cápsula.
  const orderNoDeCadaObra = new Map<string, number>();
  let orderCounter = 0;
  for (const group of [...ordered, ...free]) {
    for (const hueco of huecosDe(group)) {
      for (const m of hueco) orderNoDeCadaObra.set(itemKey(m), orderCounter);
      orderCounter++;
    }
  }

  // Nodo de una obra, hueco o suelta: `orderNo` es la única diferencia — una
  // obra CON hueco lo recibe de `orderNoDeCadaObra` (entra en la columna
  // principal de deriveTimeline); una obra SIN hueco recibe `null` (activa el
  // mecanismo de ramas/puentes de deriveTimeline en vez de la columna). `col`
  // es un índice lógico LOCAL al bloque (columna dentro de su fila); `row` es
  // el índice del bloque. Aquí se escalan a píxeles (`NODE_STEP_X`/`NODE_STEP_Y`)
  // para `x`/`y`, pero `orderNo` se queda con el índice crudo de la pre-pasada
  // — es un orden lógico para deriveTimeline, no una coordenada de
  // lienzo.
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
    // Se rellena por hueco, más abajo: un nodo suelto nunca es tándem.
    tandem: null,
    windowReason: null,
    optional: m.optional,
    skipped: m.skipped,
    ownerSagaId: m.ownerSagaId,
  });

  // Fila donde EMPIEZA el bloque actual. Ya no es el índice del bloque: un
  // bloque puede ocupar VARIAS filas —una por cada altura de tándem, más una
  // para sus obras sueltas—, así que con `y = índice de bloque` el bloque
  // siguiente caía encima de lo que el anterior había apilado. El cursor avanza
  // por lo que cada bloque gasta de verdad.
  let rowCursor = 0;

  blocks.forEach((group) => {
    // Columna LOCAL a este bloque: se reinicia en cada iteración (Task 9)
    // porque se declara aquí dentro, no fuera del forEach. `orderNo`, en
    // cambio, ya quedó resuelto en la pre-pasada de arriba: aquí solo se lee
    // de `orderNoDeCadaObra`, no se recalcula.
    let x = 0;

    // Una obra SIN hueco (`position === null`: `libre` o sin clasificar, lo
    // impone el CHECK saga_items_placement_position) SÍ es un nodo del mapa,
    // pero no forma parte de la cadena: ni abre ni cierra huecos, y ninguna
    // arista `principal` la toca (hallazgo 1 de la revisión — antes se agrupaba
    // una a una como si cada una fuera su propio hueco encadenado).
    const loose = group.members.filter((m) => m.position === null);
    const huecos = huecosDe(group);

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

    // Alto del bloque en FILAS: el hueco más poblado manda. Un bloque sin
    // tándems mide 1 fila; uno con un tándem de dos, 2.
    const chainRows = huecos.reduce((max, h) => Math.max(max, h.length), 0);

    huecos.forEach((hueco, huecoIdx) => {
      // Un tándem se APILA: misma columna (comparten hueco y `orderNo`), una
      // fila por miembro. Antes todos recibían la misma fila y React Flow los
      // pintaba en el mismo punto — se veía un solo nodo, con las etiquetas
      // superpuestas, y las dos aristas de cadena que entran al hueco caían una
      // sobre otra.
      // Solo un hueco COMPARTIDO puede tener metadatos: con una sola obra no hay
      // tándem del que hablar, así que una fila rancia con ese número se ignora
      // en vez de pintar una relación que no existe. La saga es la DUEÑA de la
      // membresía (`group.sagaId`), no la que se esté pintando.
      const tandemMeta =
        hueco.length >= 2 && tandems ? (tandems.get(`${group.sagaId}:${hueco[0].position}`) ?? null) : null;
      hueco.forEach((m, memberIdx) => {
        const node = {
          ...makeNode(m, x, rowCursor + memberIdx, orderNoDeCadaObra.get(itemKey(m)) ?? null),
          tandem: tandemMeta,
        };
        nodes.push(node);
        byId.set(node.id, node);
      });

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

    // Cadena ENTRE bloques, solo en la zona ordenada: la última obra encadenada
    // del bloque anterior (con cola pendiente) se une con la primera de este,
    // con las mismas reglas que dos huecos consecutivos DENTRO de un bloque
    // (tándem → todos los pares).
    //
    // La pregunta es por el PLACEMENT del bloque, no por su índice. Hasta la
    // Task 2 de esta rama era `y < ordered.length`, que funcionaba solo porque
    // `blocks` era literalmente `[...ordered, ...free]` y por tanto todos los
    // libres estaban al final. Desde `orderBlocksForLayout` un bloque libre
    // puede estar intercalado en la posición 2, y ese índice lo encadenaría como
    // si fuera colocado: un bloque libre flota A PROPÓSITO, fuera de la cadena.
    // El predicado es el mismo, exacto, que usa `partitionGroups`.
    if (group.placementInParent !== "libre") {
      if (huecos.length > 0) {
        if (chainTail) {
          for (const prevMember of chainTail) {
            for (const m of huecos[0]) {
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
        chainTail = huecos.at(-1)!;
      }
      // huecos.length === 0: bloque sin obras encadenables. Se salta sin
      // romper la cadena — `chainTail` conserva el hueco del último bloque
      // ordenado que sí tenía uno, para que el SIGUIENTE bloque ordenado con
      // huecos se una a él.
    }

    // Obras sin hueco: fila PROPIA, justo debajo de la cadena de su bloque, y
    // empezando por la columna 0. Antes compartían la fila de la cadena, detrás
    // del último hueco, y eso tenía dos costes: en el lienzo parecían un paso
    // más de la secuencia, y su arista de ventana —que por definición salta por
    // encima de la cadena— salía como un segmento horizontal SOBRE la cadena,
    // distinguible solo por el patrón de guiones. Con la fila propia, esa
    // arista es diagonal y se lee sola.
    //
    // Empiezan por la izquierda, no detrás del último hueco: no continúan la
    // cadena, son una estantería aparte. Su orden entre ellas ya lo fijó
    // groupMembers (título, al no tener `position`), así que es determinista.
    // Ninguna arista de cadena las toca — solo pueden llevar aristas de
    // ventana, más abajo.
    const looseRow = rowCursor + chainRows;
    loose.forEach((m, i) => {
      const node = makeNode(m, i, looseRow, null);
      nodes.push(node);
      byId.set(node.id, node);
    });

    // El bloque gasta las filas de su cadena más, si las tiene, la de sus
    // sueltas. Un bloque sin nada no gasta ninguna: reservarle fila dejaría un
    // hueco muerto en el dibujo.
    rowCursor += chainRows + (loose.length > 0 ? 1 : 0);
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

  // Placement ACTUAL de cada posible sujeto de ventana (obra directa u obra
  // de bloque → itemPlacement; bloque-subsaga → blockPlacement): «solo lo
  // `libre` tiene ventana» es una guarda que NINGÚN CHECK de BD puede
  // imponer entre `saga_items`/`sagas` y `saga_placement_windows` — misma
  // guarda que la ficha aplica con `freeItemWindow`/`freeBlockWindow`
  // (get-saga-detail.ts), y por el mismo motivo: `windows` no confía en que
  // no llegue una fila rancia de un sujeto que dejó de ser `libre` (hoy no
  // hay camino de interfaz que la deje ahí — `sendTo`/`pairWith` limpian la
  // ventana y el RPC hace reemplazo total — pero el mapa no puede confiar en
  // que ningún camino futuro la deje). Sin esta guarda, una fila así haría
  // que la ficha ocultara la línea y el mapa siguiera pintando la arista:
  // dos vistas discrepando de la misma fila.
  const itemPlacement = new Map<string, SagaPlacement | null>();
  const blockPlacement = new Map<string, SagaPlacement | null>();
  for (const group of blocks) {
    if (group.sagaId !== null) blockPlacement.set(group.sagaId, group.placementInParent);
    for (const m of group.members) itemPlacement.set(itemKey(m), m.placement);
  }

  // Aristas de ventana, una por cada entrada que tenga una. El sujeto se
  // resuelve como "first" (por donde se entra en un bloque); un ancla
  // `after` se resuelve como "last" (se puede empezar cuando ese bloque ha
  // terminado); un ancla `before`, como "first". Si cualquiera de los dos
  // extremos no resuelve a un nodo del mapa, no hay arista — misma regla que
  // la ficha con un ancla rota.
  for (const [subjectKey, w] of Object.entries(windows)) {
    const subjectSagaId = blockSagaId(subjectKey);
    const subjectPlacement =
      subjectSagaId !== null ? (blockPlacement.get(subjectSagaId) ?? null) : (itemPlacement.get(subjectKey) ?? null);
    if (subjectPlacement !== "libre") continue;

    const subject = resolveEntry(subjectKey, "first");
    if (subject === null) continue;

    // El motivo se cuelga del nodo SUJETO, y SOLO si el sujeto es una obra. Un
    // sujeto BLOQUE se resuelve a la primera obra del bloque, que es una fila
    // normal de la columna: colgarle ahí el motivo pintaría una ventana donde
    // no la hay. Mismo límite que la fase 1 asumió al no producir fila
    // `window` para un bloque, abierto en la issue #221.
    if (subjectSagaId === null) {
      const subjectNode = byId.get(subject);
      if (subjectNode) subjectNode.windowReason = w.reason;
    }

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

    // Saltos del itinerario. Revisa a sabiendas lo que decía el párrafo de
    // arriba —«el itinerario solo numera lo que el mapa ya dibuja»—: un
    // itinerario que cruza de una saga a otra dejaba un número que se
    // interrumpía en una fila y reaparecía en otra, sin nada que dijera por
    // dónde seguía. Decisión del responsable de producto (2026-07-28), no una
    // inferencia: el itinerario pasa a poder dibujar SUS PROPIOS saltos.
    //
    // Se unen los pasos que de verdad se ven, no las claves crudas: un paso
    // fantasma (obra borrada) o un paso que nombra un bloque entero no resuelve
    // a ningún nodo, y si partiera la cadena el mapa se quedaría sin dibujar el
    // salto justo donde más falta hace.
    const visible = routeKeys.flatMap((key) => {
      const node = byId.get(key);
      return node ? [node] : [];
    });

    // Una arista YA existente entre los dos, EN CUALQUIER SENTIDO, cuenta como
    // dibujada: superponer otra encima solo produce dos trazos en el mismo
    // segmento y el par de puntas de flecha encontradas que el apilado del
    // tándem vino a quitar.
    const drawn = new Set(edges.map((e) => `${e.source}|${e.target}`));
    const alreadyJoined = (a: string, b: string) => drawn.has(`${a}|${b}`) || drawn.has(`${b}|${a}`);

    for (let i = 1; i < visible.length; i++) {
      const from = visible[i - 1];
      const to = visible[i];
      if (from.id === to.id || alreadyJoined(from.id, to.id)) continue;
      drawn.add(`${from.id}|${to.id}`);
      edges.push({
        id: `route:${from.id}->${to.id}`,
        source: from.id,
        target: to.id,
        type: "itinerario",
        // El acento no se usa para este tipo: la vista lo pinta con el color
        // del texto a propósito, porque el salto no pertenece a ninguna saga
        // — es de la capa del itinerario. Se rellena por tener la forma completa.
        accent: "beige",
      });
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
