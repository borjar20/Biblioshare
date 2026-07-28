import type { SagaAccentToken } from "./accents";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { DetailMember, SagaItemRole, TandemMode, WindowReason } from "./types";
import { windowTrack } from "./window-track";

// Derivación DETERMINISTA del timeline móvil (frame B, spec §2.4) a partir del
// grafo. La columna son los nodos-ítem con orderNo agrupados por subsaga
// consecutiva; los nodos sin orden cuelgan como ramas de su conexión más
// temprana (o del final de su sección si están sueltos); los nexos (sin grupo)
// conectados a la columna se pintan como puente entre secciones. Los
// nodos-saga solo viven en el mapa 2D. Las aristas opcional/requisito entre dos
// nodos DE COLUMNA se ignoran a propósito: la columna ya transmite el orden.
// El determinismo asume que graph.edges llega en orden estable. Desde la fase 3
// eso es gratis: las aristas ya no salen de ninguna tabla — las construye
// deriveSagaMap en memoria, recorriendo los huecos y las ventanas en un orden
// fijo. Antes dependía del `.order()` con que getSagaDetail leía saga_edges.
// Los «nodos-saga» que menciona el párrafo de arriba tampoco existen ya: el
// mapa expande los bloques en obras. El caso está muerto, no roto.

export type TimelineSpine = "curation" | "route";

// Las dos uniones de vocabulario de la curación viven en `types.ts`, con
// `SagaPlacement` y `SagaItemRole`. `TandemMode` estaba declarada AQUÍ además
// de allí, idéntica: dos definiciones de la misma unión que nada obligaba a
// mantener iguales. Se reexportan para no romper a quien las importa de este
// módulo.
export type { TandemMode, WindowReason };

/** Mini-track de la ventana (fase 3): dónde cae el tramo sobre la columna
 *  curada, y dónde está el lector dentro de él.
 *
 *  `youPct` y `notice` son null SIN SESIÓN, y el track NO: la ficha es pública,
 *  así que el tramo se pinta igual — lo que desaparece es el marcador y el
 *  aviso. Deducir «hay sesión» de los estados no vale: sin usuario,
 *  `get-saga-detail` ni siquiera consulta los pases y todos los nodos llegan
 *  con `status: null`, indistinguible de «no ha terminado nada». */
export type TimelineTrack = {
  fromPct: number;
  toPct: number;
  /** Posición del lector; null sin sesión — la ficha es pública. */
  youPct: number | null;
  notice: "antes" | "dentro" | "pasada" | null;
};

export type TimelineBranch = { node: SagaGraphNode; edgeType: "opcional" | "requisito" };

export type TimelineRow =
  /** Obra con puesto. */
  | { kind: "entry"; no: number | null; node: SagaGraphNode; branches: TimelineBranch[] }
  /** N obras que comparten hueco. `mode`/`note` llegan en la fase 2. */
  | {
      kind: "tandem";
      no: number | null;
      nodes: SagaGraphNode[];
      mode: TandemMode | null;
      note: string | null;
      branches: TimelineBranch[];
    }
  /** Sujeto `libre` con ventana; anclas YA resueltas a nodo. `reason`/`track`, fase 3. */
  | {
      kind: "window";
      no: number | null;
      node: SagaGraphNode;
      after: SagaGraphNode | null;
      before: SagaGraphNode | null;
      reason: WindowReason | null;
      track: TimelineTrack | null;
    }
  /** Nexo entre secciones. */
  | { kind: "bridge"; node: SagaGraphNode };

/** Las dos formas que llevan ramas colgando. El mecanismo de ramas cuelga de la
 *  fila que CONTIENE el nodo ancla, y esa fila puede ser un tándem. */
type RowWithBranches = Extract<TimelineRow, { kind: "entry" | "tandem" }>;

export type TimelineSection = {
  groupSagaId: string | null;
  groupName: string | null;
  accent: SagaAccentToken;
  rows: TimelineRow[];
};

export function deriveTimeline(
  graph: SagaGraph,
  // `authenticated` por defecto FALSE a propósito: quien no lo pase obtiene la
  // vista pública, que es la segura. Nunca al revés — un olvido no puede
  // acabar afirmando «estás dentro de la ventana» a quien no ha entrado.
  // `showOptional` por defecto TRUE, y por el criterio INVERSO al de arriba: el
  // default seguro aquí es enseñarlo todo. Un olvido que esconde obras es
  // silencioso —nadie echa de menos lo que no sabe que existe—; uno que las
  // enseña se ve al instante.
  opts: {
    spine?: TimelineSpine;
    authenticated?: boolean;
    showOptional?: boolean;
    /** Lente por rol (fase 5). `null` o ausente = todos. No es preferencia
     *  persistente, al revés que `showOptional`: viaja en la URL (`?rol=`)
     *  porque filtrar es un gesto momentáneo, no una decisión sobre cómo se
     *  quiere leer siempre. */
    roleFilter?: SagaItemRole | null;
  } = {},
): TimelineSection[] {
  const spineMode = opts.spine ?? "curation";
  const authenticated = opts.authenticated ?? false;
  const showOptional = opts.showOptional ?? true;
  const roleFilter = opts.roleFilter ?? null;
  // El filtro va AQUÍ y no en los componentes: `items` alimenta la columna, las
  // ramas, los puentes y la colocación de las ventanas, así que esconder en el
  // render dejaría secciones vacías con su cabecera, ramas colgando de una fila
  // que ya no se pinta y ventanas ancladas a filas invisibles.
  //
  // Y esconde también las opcionales CON HUECO, no solo las ramas: en
  // producción hay dos así (Saga de los Huesos Verdes, huecos 1 y 2 de 5).
  //
  // Lo que NO se toca al esconder: los números. `no` sale de `orderNo + 1` (o
  // de `step`), calculados sobre el grafo entero — si el hueco 1 desaparece, el
  // 3 sigue siendo el 3. Es la misma regla que ya rige los pasos de un
  // itinerario: renumerar solo lo visible haría que el timeline contara la saga
  // distinto que el resto del producto.
  //
  // `graph` entero sigue llegando a `windowTrack` más abajo, a propósito: el
  // tramo de una ventana describe el orden de lectura de la SAGA, no lo que
  // este lector ha elegido ver.
  //
  // La lente por rol (fase 5) entra en el MISMO sitio y hereda las dos reglas
  // de arriba: no renumera y no mueve el tramo de la ventana. Una obra sin rol
  // se esconde al filtrar, porque `principal` no llegó a ser un valor: es
  // `role = null`. Por eso la barra ofrece siempre «Todos».
  const items = graph.nodes.filter(
    (n) =>
      n.kind === "item" && (showOptional || !n.optional) && (roleFilter === null || n.role === roleFilter),
  );

  // Columna por PASOS del itinerario (spec 2026-07-28, §1): 1..N del
  // itinerario, sección única sin cabecera, y la subsaga baja de cabecera de
  // sección a etiqueta de fila (el dato ya viaja en el nodo:
  // `groupName`/`accent`). Sin ramas ni puentes: lo que el itinerario no nombra
  // lo enseña «Sin puesto en este itinerario», que es de RouteView.
  //
  // El número es el paso, no un contador de filas visibles: un paso fantasma
  // (obra borrada) o uno que nombra un bloque entero no resuelve a ningún nodo
  // —`deriveSagaMap` solo pone `step` en nodos que existen— así que no produce
  // fila, y si el paso 5 no se ve, el 6 sigue siendo el 6.
  if (spineMode === "route") {
    const steps = items.filter((n) => n.step !== null).sort((a, b) => a.step! - b.step!);
    if (steps.length === 0) return [];
    const rows: TimelineRow[] = [];
    for (const n of steps) {
      const lastRow = rows.at(-1);
      // Mismo hueco (empate de `orderNo`) Y pasos consecutivos. Si el itinerario
      // mete otra obra en medio, el itinerario manda: no hay tándem que pintar.
      if (lastRow && lastRow.kind !== "bridge" && lastRow.kind !== "window" && n.orderNo !== null) {
        const prevOrder = lastRow.kind === "entry" ? lastRow.node.orderNo : lastRow.nodes[0].orderNo;
        if (prevOrder === n.orderNo) {
          if (lastRow.kind === "tandem") lastRow.nodes.push(n);
          else {
            rows[rows.length - 1] = {
              kind: "tandem",
              no: lastRow.no,
              nodes: [lastRow.node, n],
              // Los metadatos son del HUECO y `deriveSagaMap` los denormalizó en
              // cada uno de sus nodos, así que basta con el que abre la fila.
              mode: lastRow.node.tandem?.mode ?? null,
              note: lastRow.node.tandem?.note ?? null,
              branches: lastRow.branches,
            };
          }
          continue;
        }
      }
      rows.push({ kind: "entry", no: n.step, node: n, branches: [] });
    }
    return [{ groupSagaId: null, groupName: null, accent: "beige", rows }];
  }

  const spine = items
    .filter((n) => n.orderNo !== null)
    .sort((a, b) => (a.orderNo! - b.orderNo!) || a.label.localeCompare(b.label));
  if (spine.length === 0) return [];

  const spineIds = new Set(spine.map((n) => n.id));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // Conexión más temprana de un nodo fuera de columna: el nodo de columna con
  // menor orderNo entre sus aristas (en cualquier dirección).
  const earliestSpineFor = (nodeId: string): { spineNode: SagaGraphNode; edgeType: "opcional" | "requisito" } | null => {
    let best: { spineNode: SagaGraphNode; edgeType: "opcional" | "requisito" } | null = null;
    for (const e of graph.edges) {
      const otherId = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
      if (!otherId || !spineIds.has(otherId)) continue;
      const other = byId.get(otherId)!;
      const edgeType = e.type === "requisito" ? "requisito" : "opcional";
      if (!best || other.orderNo! < best.spineNode.orderNo!) best = { spineNode: other, edgeType };
    }
    return best;
  };

  // Secciones por subsaga consecutiva a lo largo de la columna. Dos o más nodos
  // que comparten `orderNo` comparten hueco: eso ES un tándem (hoy uno solo en
  // toda la producción, Trono de Cristal hueco 5), y se funden en una sola
  // fila. `mode`/`note` llegan en la fase 2 con `saga_tandems`.
  const sections: TimelineSection[] = [];
  const rowByNodeId = new Map<string, RowWithBranches>();
  for (const n of spine) {
    const last = sections.at(-1);
    const lastRow = last?.rows.at(-1);
    // Empate de `orderNo` con la fila anterior DE LA MISMA SECCIÓN: se funde.
    // Fuera de la sección no se mira: un hueco pertenece a un bloque, así que
    // dos nodos con el mismo orderNo y distinto groupSagaId no pueden existir —
    // y si existieran, fundirlos borraría el límite entre dos secciones.
    if (last && last.groupSagaId === n.groupSagaId && lastRow && (lastRow.kind === "entry" || lastRow.kind === "tandem")) {
      const prevOrder = lastRow.kind === "entry" ? lastRow.node.orderNo : lastRow.nodes[0].orderNo;
      if (prevOrder === n.orderNo) {
        const merged: Extract<TimelineRow, { kind: "tandem" }> =
          lastRow.kind === "tandem"
            ? lastRow
            : {
                kind: "tandem",
                no: lastRow.no,
                nodes: [lastRow.node],
                mode: lastRow.node.tandem?.mode ?? null,
                note: lastRow.node.tandem?.note ?? null,
                branches: lastRow.branches,
              };
        if (lastRow.kind === "entry") {
          last.rows[last.rows.length - 1] = merged;
          rowByNodeId.set(lastRow.node.id, merged);
        }
        merged.nodes.push(n);
        rowByNodeId.set(n.id, merged);
        continue;
      }
    }
    // `orderNo` es 0-based (deriveSagaMap arranca su `orderCounter` en 0) y no
    // tiene saltos: incrementa una vez por hueco. Así que +1 ES el rango 1..N
    // de la columna. Antes se pintaba crudo y la primera obra salía como «Nº 0».
    const row: Extract<TimelineRow, { kind: "entry" }> = { kind: "entry", no: n.orderNo! + 1, node: n, branches: [] };
    rowByNodeId.set(n.id, row);
    if (last && last.groupSagaId === n.groupSagaId) last.rows.push(row);
    else sections.push({ groupSagaId: n.groupSagaId, groupName: n.groupName, accent: n.accent, rows: [row] });
  }

  // Ventanas: un sujeto `libre` (sin orderNo) con al menos un ancla resuelta.
  // Las anclas NO se resuelven aquí — se LEEN de las aristas que ya dejó
  // resueltas `deriveSagaMap` (`resolveEntry`: última obra del bloque para un
  // `después de`, primera para un `antes de`). Dos resoluciones distintas del
  // mismo ancla acabarían discrepando, que es la familia del #91/#185/#203.
  //
  // `deriveSagaMap` es el único productor de SagaGraph y solo emite
  // `requisito`/`opcional` para ventanas, con dirección fija:
  //   `después de`: after → subject, tipo requisito
  //   `antes de`:   subject → before, tipo opcional
  // La cadena es `principal` y los saltos del itinerario `itinerario`, así que
  // ninguna otra arista entra por aquí.
  //
  // Solo obras: un BLOQUE `libre` con ventana tiene obras CON `orderNo`, así
  // que sigue viviendo en la columna como una sección normal. Límite asumido de
  // la fase 1, abierto en su issue: pintarlo movería una sección entera.
  const windowAnchors = (nodeId: string): { after: SagaGraphNode | null; before: SagaGraphNode | null } => {
    let after: SagaGraphNode | null = null;
    let before: SagaGraphNode | null = null;
    for (const e of graph.edges) {
      if (e.target === nodeId && e.type === "requisito") after = byId.get(e.source) ?? after;
      if (e.source === nodeId && e.type === "opcional") before = byId.get(e.target) ?? before;
    }
    return { after, before };
  };

  /** Coloca una fila justo después (o justo antes) de la fila que contiene a
   *  `anchorId`. Devuelve false si el ancla no está en ninguna sección. */
  const insertRelativeTo = (anchorId: string, row: TimelineRow, where: "after" | "before"): boolean => {
    for (const section of sections) {
      const idx = section.rows.findIndex(
        (r) =>
          (r.kind === "entry" && r.node.id === anchorId) ||
          (r.kind === "tandem" && r.nodes.some((x) => x.id === anchorId)),
      );
      if (idx === -1) continue;
      section.rows.splice(where === "after" ? idx + 1 : idx, 0, row);
      return true;
    }
    return false;
  };

  const placedAsWindow = new Set<string>();
  for (const n of items) {
    if (n.orderNo !== null) continue;
    const { after, before } = windowAnchors(n.id);
    if (after === null && before === null) continue;
    const row: TimelineRow = {
      kind: "window",
      no: null,
      node: n,
      after,
      before,
      // Ya resuelto por `deriveSagaMap`, como las anclas: aquí solo se lee.
      reason: n.windowReason,
      track: windowTrack(graph, { after, before }, { authenticated }),
    };
    // 1) justo DESPUÉS de su ancla `después de`; 2) si solo hay `antes de`,
    // justo ANTES de esa fila; 3) si ninguna resuelve, cae a rama (abajo).
    const placed =
      (after !== null && insertRelativeTo(after.id, row, "after")) ||
      (after === null && before !== null && insertRelativeTo(before.id, row, "before"));
    if (placed) placedAsWindow.add(n.id);
  }

  // Nodos-ítem fuera de columna: rama o puente.
  const bridges: Array<{ node: SagaGraphNode; afterSectionIdx: number }> = [];
  for (const n of items) {
    if (n.orderNo !== null) continue;
    if (placedAsWindow.has(n.id)) continue; // ya es una fila de la columna
    const conn = earliestSpineFor(n.id);
    if (n.groupSagaId === null) {
      // Nexo: puente tras la sección de su conexión más temprana; sin conexión, fuera del timeline.
      if (!conn) continue;
      const idx = sections.findIndex((s) =>
        s.rows.some(
          (r) =>
            (r.kind === "entry" && r.node.id === conn.spineNode.id) ||
            (r.kind === "tandem" && r.nodes.some((x) => x.id === conn.spineNode.id)),
        ),
      );
      bridges.push({ node: n, afterSectionIdx: idx });
      continue;
    }
    if (conn) {
      rowByNodeId.get(conn.spineNode.id)!.branches.push({ node: n, edgeType: conn.edgeType });
      continue;
    }
    // Suelto dentro de su subsaga: cuelga del último de su sección (si existe).
    const section = sections.find((s) => s.groupSagaId === n.groupSagaId);
    const lastEntry = section?.rows
      .filter((r): r is RowWithBranches => r.kind === "entry" || r.kind === "tandem")
      .at(-1);
    lastEntry?.branches.push({ node: n, edgeType: "opcional" });
  }

  // `new Set` porque un tándem tiene DOS claves en `rowByNodeId` apuntando a la
  // MISMA fila: sin deduplicar, sus ramas se ordenarían dos veces (idempotente,
  // pero confunde a quien lo lea).
  for (const row of new Set(rowByNodeId.values())) {
    row.branches.sort((a, b) => a.node.label.localeCompare(b.node.label));
  }

  // Insertar puentes tras su sección ancla. Agrupados por ancla e insertados
  // como un solo splice en orden alfabético: splices sueltos sobre el mismo
  // índice invertirían el orden (el segundo empuja al primero).
  const byAnchor = new Map<number, SagaGraphNode[]>();
  for (const b of bridges) {
    const list = byAnchor.get(b.afterSectionIdx) ?? [];
    list.push(b.node);
    byAnchor.set(b.afterSectionIdx, list);
  }
  for (const idx of [...byAnchor.keys()].sort((a, b) => b - a)) {
    const nodes = byAnchor.get(idx)!.sort((a, b) => a.label.localeCompare(b.label));
    sections.splice(
      idx + 1,
      0,
      ...nodes.map((node) => ({
        groupSagaId: null,
        groupName: null,
        accent: "beige" as const,
        rows: [{ kind: "bridge" as const, node }],
      })),
    );
  }

  return sections;
}

// Orden «Publicación» (spec §2.4): lista lineal por año del catálogo.
export function sortByPublication(members: DetailMember[]): DetailMember[] {
  return [...members].sort((a, b) => {
    const ya = a.year ?? Number.MAX_SAFE_INTEGER;
    const yb = b.year ?? Number.MAX_SAFE_INTEGER;
    if (ya !== yb) return ya - yb;
    return a.title.localeCompare(b.title);
  });
}

// Escala coordenadas de lienzo al viewBox del mini-preview del CTA (frame B).
export function scaleNodes(
  nodes: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  pad: number,
): Array<{ x: number; y: number }> {
  if (nodes.length === 0) return [];
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  return nodes.map((n) => ({
    x: spanX === 0 ? width / 2 : pad + ((n.x - minX) / spanX) * (width - 2 * pad),
    y: spanY === 0 ? height / 2 : pad + ((n.y - minY) / spanY) * (height - 2 * pad),
  }));
}
