import type { ItemType } from "@/lib/catalog/types";

// La REGLA de colocación del orden propuesto (spec
// docs/superpowers/specs/2026-07-28-sagas-orden-curado-por-ventana-design.md §2):
// un sujeto `libre` con ventana se mueve a donde su ventana dice, y evita partir
// un bloque por la mitad cuando la ventana deja sitio para no hacerlo.
//
// PURA y sin dependencias del dominio: no conoce Supabase, ni `MemberGroup`, ni
// `OrderMembership`. Recibe una secuencia ya construida y la devuelve
// recolocada.
//
// Vive en su propio fichero, y no dentro de curated-order.ts, porque la regla es
// justo lo que NO puede estar escrito dos veces: la familia de issues
// #91 / #203 / #245 es, siempre, dos pantallas ordenando la misma saga por su
// cuenta y acabando en desacuerdo.

/** Las dos anclas de una ventana, y nada más. `ResolvedWindow` (types.ts) es
 *  estructuralmente compatible —lleva además los títulos, que la ficha pinta y
 *  el orden no necesita—, así que quien ya tiene un
 *  `Record<string, ResolvedWindow>` lo pasa tal cual, sin convertir nada. */
export type OrderWindow = { afterKey: string | null; beforeKey: string | null };

/** Una entrada de la secuencia.
 *  - `key`: formato de ENTRADA (`i:<tipo>:<uuid>`), el mismo que usan las
 *    ventanas, el borrador de secuencia y `deriveSagaMap`.
 *  - `blockId`: la saga que emitió la clave, o `null` para un miembro directo de
 *    la raíz (el grupo «Nexo»). Define dónde están los LÍMITES entre bloques,
 *    que es lo único que esta función sabe de la estructura. */
export type OrderUnit = { key: string; blockId: string | null };

/** Clave de entrada de un sujeto o de un ancla, a partir de las tres columnas
 *  con las que `saga_placement_windows` señala a una obra o a un bloque.
 *
 *  Exportada y compartida con `resolveWindows` (get-saga-detail.ts) a propósito:
 *  las dos resoluciones tienen que producir la MISMA clave, o el orden y la
 *  ficha estarían hablando de sujetos distintos sin que nada lo delate. */
export function entryKeyOf(
  itemType: ItemType | null,
  itemId: string | null,
  childSagaId: string | null,
): string | null {
  if (itemId !== null && itemType !== null) return `i:${itemType}:${itemId}`;
  return childSagaId !== null ? `s:${childSagaId}` : null;
}

/** Fila cruda de `saga_placement_windows` reducida a lo que el ORDEN necesita.
 *  La ficha usa `resolveWindows` (get-saga-detail.ts), que además resuelve los
 *  títulos para pintarlos; el orden no pinta nada, así que no los pide — y un
 *  ancla que no aparezca en la secuencia la ignora `placeByWindow` de todos
 *  modos. */
export type RawOrderWindowRow = {
  item_type: ItemType | null;
  item_id: string | null;
  child_saga_id: string | null;
  after_item_type: ItemType | null;
  after_item_id: string | null;
  after_child_saga_id: string | null;
  before_item_type: ItemType | null;
  before_item_id: string | null;
  before_child_saga_id: string | null;
  created_at: string;
};

export function orderWindowsFromRows(rows: RawOrderWindowRow[]): Record<string, OrderWindow> {
  // Mismo desempate que `resolveWindows`: los uniques de la tabla son POR SAGA,
  // así que dos sagas hermanas pueden tener cada una su fila para la MISMA obra
  // compartida. Gana la más antigua, no la que Postgres devuelva primero.
  const ordenadas = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const out: Record<string, OrderWindow> = {};
  for (const r of ordenadas) {
    const sujeto = entryKeyOf(r.item_type, r.item_id, r.child_saga_id);
    if (sujeto === null || out[sujeto] !== undefined) continue;
    const afterKey = entryKeyOf(r.after_item_type, r.after_item_id, r.after_child_saga_id);
    const beforeKey = entryKeyOf(r.before_item_type, r.before_item_id, r.before_child_saga_id);
    if (afterKey === null && beforeKey === null) continue;
    out[sujeto] = { afterKey, beforeKey };
  }
  return out;
}

/**
 * Recoloca los sujetos colocables (`libre`/`anclado`) con ventana dentro de `units`.
 *
 * `isPlaceable` es la guarda «solo un sujeto colocable tiene ventana», la MISMA
 * que aplican `deriveSagaMap` y la ficha (vía `esColocable`). Ningún CHECK de BD
 * puede imponerla (cruza dos tablas), así que una fila rancia de un sujeto que
 * dejó de ser colocable puede llegar hasta aquí; sin la guarda, el orden movería
 * algo que la ficha ni siquiera pinta.
 */
export function placeByWindow(
  units: OrderUnit[],
  windows: Record<string, OrderWindow>,
  isPlaceable: (subjectKey: string) => boolean,
): OrderUnit[] {
  // Sujetos a mover, en el orden en que aparecen HOY en la secuencia. Ese orden
  // ES el desempate del spec §4: dos sujetos que acaben en el mismo punto
  // conservan el orden que ya tenían, porque el segundo se inserta contra una
  // lista donde el primero ya está colocado.
  //
  // No se recorre `Object.keys(windows)`: eso ataría el resultado al orden de
  // iteración del objeto, que no es una garantía sobre la que construir.
  const sujetos: string[] = [];
  const vistos = new Set<string>();
  for (const u of units) {
    const candidatos = u.blockId === null ? [u.key] : [`s:${u.blockId}`, u.key];
    for (const clave of candidatos) {
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      if (windows[clave] === undefined) continue;
      if (!isPlaceable(clave)) continue;
      sujetos.push(clave);
    }
  }

  let out = units;
  for (const sujeto of sujetos) out = moverSujeto(out, sujeto, windows[sujeto]);
  return out;
}

/** Mueve UN sujeto. Devuelve la lista intacta si no hay nada que mover. */
function moverSujeto(units: OrderUnit[], subjectKey: string, w: OrderWindow): OrderUnit[] {
  const bloqueSujeto = subjectKey.startsWith("s:") ? subjectKey.slice(2) : null;

  // Tramo que se mueve: una unidad si el sujeto es una obra; el primer tramo
  // CONTIGUO del bloque si es un bloque.
  const desde =
    bloqueSujeto !== null
      ? units.findIndex((u) => u.blockId === bloqueSujeto)
      : units.findIndex((u) => u.key === subjectKey);
  if (desde === -1) return units;
  let hasta = desde + 1;
  if (bloqueSujeto !== null) {
    while (hasta < units.length && units[hasta].blockId === bloqueSujeto) hasta++;
  }
  const movido = units.slice(desde, hasta);
  const resto = [...units.slice(0, desde), ...units.slice(hasta)];

  // Las anclas se buscan sobre `resto`, SIN el sujeto: así un sujeto anclado a
  // sí mismo (o a una obra de su propio bloque) no resuelve y no se mueve, en
  // vez de calcular una posición contra su propia sombra.
  const indiceDelAncla = (clave: string | null, borde: "inicio" | "fin"): number | null => {
    if (clave === null) return null;
    if (clave.startsWith("s:")) {
      const id = clave.slice(2);
      const primero = resto.findIndex((u) => u.blockId === id);
      if (primero === -1) return null;
      if (borde === "inicio") return primero;
      let ultimo = primero;
      while (ultimo + 1 < resto.length && resto[ultimo + 1].blockId === id) ultimo++;
      return ultimo;
    }
    const i = resto.findIndex((u) => u.key === clave);
    return i === -1 ? null : i;
  };

  // `a partir de` → SUELO: la primera posición válida es justo detrás del ancla.
  // `antes de` → BASE: justo delante del ancla. Manda la base (spec §2).
  const finDelAfter = indiceDelAncla(w.afterKey, "fin");
  const suelo = finDelAfter === null ? null : finDelAfter + 1;
  const base = indiceDelAncla(w.beforeKey, "inicio");
  if (suelo === null && base === null) return units;

  const parteBloque = (i: number) =>
    i > 0 &&
    i < resto.length &&
    resto[i - 1].blockId !== null &&
    resto[i - 1].blockId === resto[i].blockId;
  const inicioDelBloque = (i: number) => {
    let j = i;
    while (j > 0 && resto[j - 1].blockId === resto[i].blockId) j--;
    return j;
  };
  const finDelBloque = (i: number) => {
    let j = i;
    while (j + 1 < resto.length && resto[j + 1].blockId === resto[i].blockId) j++;
    return j + 1;
  };

  let destino: number;
  if (base !== null) {
    destino = base;
    if (parteBloque(destino)) {
      const atras = inicioDelBloque(destino);
      // Un sujeto BLOQUE retrocede SIEMPRE: solo puede aterrizar en límites
      // entre bloques (spec §5), así que cuando ningún límite cumple las dos
      // anclas gana el `antes de`. Un sujeto OBRA, en cambio, prefiere cortar
      // antes que incumplir la ventana.
      if (bloqueSujeto !== null || suelo === null || atras >= suelo) destino = atras;
    }
  } else {
    destino = suelo!;
    // Sin techo no hay nada que comprobar: avanzar al final del bloque que
    // partiría cumple el `a partir de` por construcción.
    if (parteBloque(destino)) destino = finDelBloque(destino);
  }

  return [...resto.slice(0, destino), ...movido, ...resto.slice(destino)];
}
