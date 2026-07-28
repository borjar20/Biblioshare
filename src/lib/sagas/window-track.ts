import { isStatusCompleted } from "./completion";
import type { TimelineTrack } from "./derive-timeline";
import type { SagaGraph, SagaGraphNode } from "./map-types";

// El mini-track del frame B: sitúa la ventana recomendada sobre la saga ENTERA
// y marca dónde está el lector dentro de ella. Puro, y con el grafo como única
// entrada — no consulta nada ni recibe `DetailMember`s: el nodo ya trae
// `status`.
//
// **NO toca el progreso.** LEE lo completado con el predicado único
// (`isStatusCompleted`, completion.ts): no cuenta, no divide y no aparece en
// ningún denominador. La spec lo pone como límite duro de la feature entera —
// reabrir el denominador es la familia del #91 y del #185.
export function windowTrack(
  graph: SagaGraph,
  anchors: { after: SagaGraphNode | null; before: SagaGraphNode | null },
  opts: { authenticated: boolean },
): TimelineTrack | null {
  // La barra ES la columna curada: las obras con hueco, en su orden. Mismo
  // criterio de desempate que `deriveTimeline` (orderNo, y el label para el
  // empate de un tándem) para que las dos vean exactamente la misma columna.
  const spine = graph.nodes
    .filter((n) => n.kind === "item" && n.orderNo !== null)
    .sort((a, b) => a.orderNo! - b.orderNo! || a.label.localeCompare(b.label));
  if (spine.length === 0) return null;

  const idx = new Map(spine.map((n, i) => [n.id, i] as const));
  const pct = (i: number) => ((i + 1) / spine.length) * 100;

  // Un ancla que no está en la columna —resolvió a una obra `libre`, sin
  // hueco— no tiene sitio en la barra: ese extremo se pinta ABIERTO en vez de
  // inventarle una posición.
  const at = (node: SagaGraphNode | null, open: number): number => {
    if (node === null) return open;
    const i = idx.get(node.id);
    return i === undefined ? open : pct(i);
  };

  const fromPct = at(anchors.after, 0);
  const toPct = at(anchors.before, 100);
  // Ventana al revés: el curador ancló «después de» a algo posterior a «antes
  // de». Una banda de anchura negativa es peor que ninguna, y la fila sigue
  // nombrando las dos anclas, que es lo que permite verlo y corregirlo.
  if (fromPct > toPct) return null;

  // La ficha es PÚBLICA: el tramo se pinta igual sin sesión. Lo que desaparece
  // es el marcador y el aviso — y hay que preguntarlo, no deducirlo: sin
  // usuario, `get-saga-detail` ni siquiera consulta los pases y TODOS los
  // nodos llegan con `status: null`, indistinguible de «no ha terminado nada».
  if (!opts.authenticated) return { fromPct, toPct, youPct: null, notice: null };

  // Lo más avanzado que el lector ha terminado, no lo último de la lista: un
  // lector que se saltó las tres primeras y leyó la cuarta está en la cuarta.
  let last = -1;
  for (const node of spine) {
    if (!isStatusCompleted(node.status)) continue;
    const i = idx.get(node.id)!;
    if (i > last) last = i;
  }
  // Nada completado = el lector está en la salida, no fuera de la barra.
  const youPct = last === -1 ? 0 : pct(last);
  const notice = youPct < fromPct ? "antes" : youPct > toPct ? "pasada" : "dentro";

  return { fromPct, toPct, youPct, notice };
}
