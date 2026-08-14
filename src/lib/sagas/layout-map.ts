import { NODE_STEP_X } from "./graph-metrics";
import type { SagaGraph, SagaGraphEdge, SagaGraphNode } from "./map-types";

// Post-pase de layout del mapa 2D: alinea las columnas de los bloques que una
// arista LARGA conecta, para que esa arista salga corta y casi vertical en vez
// de cruzar el lienzo entero.
//
// Corre DESPUÉS de que `deriveSagaMap` haya construido las aristas, y no dentro
// de su bucle de pintado, porque las de ventana e itinerario todavía no existen
// mientras ese bucle corre. No conoce bloques, ni ventanas, ni itinerarios:
// solo nodos y aristas.

/** Columnas que un bloque puede desplazarse, contadas desde la columna 0.
 *
 *  Existe porque sin tope la escalera diagonal vuelve por la puerta de atrás: si
 *  el bloque 2 se alinea con la última columna del 1, y el 3 con la última del
 *  2, los offsets se acumulan y el ancho del dibujo vuelve a ser la suma de
 *  todos los bloques — exactamente lo que quitó la decisión de `derive-map.ts:113`
 *  («una fila por bloque, compacta»).
 *
 *  El valor, 4, sale de elegirlo A OJO, no de un razonamiento: no hay todavía
 *  con qué medir «mejor» (ver issue de `countEdgeCrossings`, más abajo en este
 *  fichero). El único dato real que lo respalda: en la única saga de producción
 *  que lo ejercita (Cosmere), el bloque *Novelas secretas* da deltas `[3, 4]` y
 *  queda CLAVADO en el tope, sin holgura — con MAX_COL_OFFSET=4 el ancho del
 *  mapa pasa de 5 a 8 columnas (+60 %) para la misma altura. Un tope más bajo lo
 *  recortaría más; uno más alto no tiene ningún caso real que lo justifique hoy.
 *  Para dejar de elegirlo a ojo haría falta contar cruces de aristas con un
 *  barrido de `MAX_COL_OFFSET ∈ {0,1,2,3,4,6,8}` sobre la forma real de las
 *  sagas de producción, tabulando (cruces, ancho en columnas) por cada valor. */
export const MAX_COL_OFFSET = 4;

/** Aristas que cruzan el lienzo, y por tanto las únicas que vale la pena
 *  enderezar. `principal` (la cadena) queda fuera a propósito: alinear por ella
 *  reproduce esa misma escalera, y además casi nunca cruza — une huecos
 *  consecutivos, que ya están al lado.
 *
 *  Tipado explícito contra `SagaGraphEdge["type"]`, no inferido: un `Set<string>`
 *  seguiría compilando si mañana se renombra `"requisito"` en el tipo, y la
 *  alineación dejaría de funcionar EN SILENCIO — ningún error, solo aristas que
 *  dejan de enderezarse. */
const TIPOS_LARGOS = new Set<SagaGraphEdge["type"]>(["requisito", "opcional", "itinerario"]);

/** Mediana, no media: aguanta un ancla rara en un extremo. Óptimo L1, que es la
 *  distancia que de verdad importa aquí (cuánto se desvía cada arista de la
 *  vertical). Con un número par de valores promedia los dos centrales; el
 *  llamante redondea. */
function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export function alignRowsToLongEdges(graph: SagaGraph): SagaGraph {
  // Objeto NUEVO también aquí, no el mismo que se recibió: `deriveSagaMap`
  // hace `alineado.nodes.sort(...)` justo después de llamar a esta función, y
  // devolver el `graph` del llamante haría que ese sort ordenara IN SITU el
  // array de quien invoca `alignRowsToLongEdges` con un grafo vacío — hoy
  // inocuo (no hay nada que ordenar), pero contradice el contrato de «esta
  // función no muta lo que recibe» que sí cumple el camino no vacío.
  if (graph.nodes.length === 0) return { nodes: [], edges: graph.edges };

  const nodosDeBloque = new Map<string | null, SagaGraphNode[]>();
  const bloqueDeNodo = new Map<string, string | null>();
  const nodoDeId = new Map<string, SagaGraphNode>();
  for (const n of graph.nodes) {
    const clave = n.groupSagaId;
    bloqueDeNodo.set(n.id, clave);
    nodoDeId.set(n.id, n);
    const lista = nodosDeBloque.get(clave);
    if (lista === undefined) nodosDeBloque.set(clave, [n]);
    else lista.push(n);
  }

  // Vecinos por arista larga, en los dos sentidos: a la hora de alinear da igual
  // quién es el origen y quién el destino, lo que importa es qué dos nodos están
  // unidos.
  const vecinos = new Map<string, string[]>();
  const unir = (a: string, b: string) => {
    const lista = vecinos.get(a);
    if (lista === undefined) vecinos.set(a, [b]);
    else lista.push(b);
  };
  for (const e of graph.edges) {
    if (!TIPOS_LARGOS.has(e.type)) continue;
    unir(e.source, e.target);
    unir(e.target, e.source);
  }

  // De arriba abajo, por la fila donde empieza cada bloque: cada uno se alinea
  // con lo que ya está colocado encima. Un bloque cuya única ancla queda DEBAJO
  // no se mueve — se moverá el de abajo cuando le toque.
  const filaDe = (lista: SagaGraphNode[]) => Math.min(...lista.map((n) => n.y));
  const bloques = [...nodosDeBloque.entries()].sort((a, b) => filaDe(a[1]) - filaDe(b[1]));

  const xFinal = new Map<string, number>();
  const colocados = new Set<string | null>();
  // Columnas ya ocupadas por un nodo alineado a un ancla dada, indexadas por el
  // id del NODO ancla. Lo consume el desempate de verticales, más abajo.
  const columnasPorAncla = new Map<string, Set<number>>();

  for (const [clave, lista] of bloques) {
    const deltas: number[] = [];
    // Los pares (nodo de este bloque, nodo ancla ya colocado) que gobiernan la
    // alineación. Se guardan además de los deltas porque el desempate de
    // verticales necesita saber a QUÉ ancla se alinea cada nodo, no solo cuánto
    // hay que moverse.
    const anclados: Array<{ n: SagaGraphNode; ancla: string }> = [];
    for (const n of lista) {
      for (const otro of vecinos.get(n.id) ?? []) {
        const suBloque = bloqueDeNodo.get(otro);
        if (suBloque === undefined || suBloque === clave || !colocados.has(suBloque)) continue;
        deltas.push((xFinal.get(otro)! - n.x) / NODE_STEP_X);
        anclados.push({ n, ancla: otro });
      }
    }
    const bruto = deltas.length === 0 ? 0 : Math.round(mediana(deltas));
    let offset = Math.min(Math.max(bruto, 0), MAX_COL_OFFSET);

    // Desempate de verticales. Dos bloques alineados al MISMO nodo ancla caen en
    // su misma columna, así que sus dos aristas salen del ancla superpuestas: se
    // leen como una sola línea, y la más larga atraviesa la portada del bloque
    // que quede en medio. Es lo que se veía en la captura del 2026-07-28 23:00
    // (Cosmere), con «Era 2» y «El Aliento de los Dioses» los dos bajo «El Héroe
    // de las Eras». Correr una columna basta: la arista sale entonces en
    // diagonal y se distingue de la vertical.
    //
    // El desempate es por NODO ancla y no por columna a propósito: dos aristas
    // que salen de puntos distintos no se pisan aunque acaben en la misma
    // vertical, y separarlas solo ensancharía el mapa sin que nadie gane nada.
    //
    // Si se agota el tope se acepta el solape. Ensanchar el mapa sin límite es
    // peor que dos aristas juntas — la misma razón por la que existe el tope.
    const ocupada = (o: number) =>
      anclados.some(({ n, ancla }) => columnasPorAncla.get(ancla)?.has(n.x / NODE_STEP_X + o) ?? false);
    while (offset < MAX_COL_OFFSET && ocupada(offset)) offset++;

    for (const n of lista) xFinal.set(n.id, n.x + offset * NODE_STEP_X);
    for (const { n, ancla } of anclados) {
      const columna = n.x / NODE_STEP_X + offset;
      const ya = columnasPorAncla.get(ancla);
      if (ya === undefined) columnasPorAncla.set(ancla, new Set([columna]));
      else ya.add(columna);
    }
    colocados.add(clave);
  }

  // Bloque intercalado bajo la cadena (issue #249). `orderBlocksForLayout`
  // intercala a propósito un bloque `libre` con ancla entre dos bloques que la
  // cadena `principal` conecta — eso está bien, la cadena sigue uniendo sus
  // dos bloques colocados. El problema es geométrico: si esa arista entra y
  // sale por la MISMA columna (el caso común, con las dos anclas en columna 0
  // porque `principal` no participa en la alineación de arriba) y el bloque
  // intercalado cae justo en esa columna, `FloatingEdge` la dibuja centro a
  // centro y la línea atraviesa el nodo intercalado en vez de pasar a su lado.
  //
  // Si las dos columnas de la arista DIFIEREN la línea sale en diagonal y, en
  // la fila del intercalado, no pasa por su columna — desviarlo igual solo
  // ensancharía el mapa sin arreglar nada (mismo criterio que el desempate de
  // verticales, arriba). Y se compara con la columna final del intercalado,
  // no con su ancla: el bloque intercalado puede no tener ninguna arista larga
  // que lo mueva y seguir en su columna original.
  for (const e of graph.edges) {
    if (e.type !== "principal") continue;
    const origenBloque = bloqueDeNodo.get(e.source);
    const destinoBloque = bloqueDeNodo.get(e.target);
    if (origenBloque === destinoBloque) continue; // dentro del mismo bloque: nada que intercalar
    const colOrigen = xFinal.get(e.source);
    const colDestino = xFinal.get(e.target);
    if (colOrigen === undefined || colDestino === undefined || colOrigen !== colDestino) continue;
    const filaOrigen = nodoDeId.get(e.source)!.y;
    const filaDestino = nodoDeId.get(e.target)!.y;
    const filaMin = Math.min(filaOrigen, filaDestino);
    const filaMax = Math.max(filaOrigen, filaDestino);

    for (const [clave, lista] of nodosDeBloque) {
      if (clave === origenBloque || clave === destinoBloque) continue;
      const filaBloqueMin = Math.min(...lista.map((n) => n.y));
      const filaBloqueMax = Math.max(...lista.map((n) => n.y));
      // Estrictamente ENTRE las dos filas de la arista: un bloque que comparte
      // fila con uno de los extremos no está intercalado.
      if (filaBloqueMin <= filaMin || filaBloqueMax >= filaMax) continue;
      if (!lista.some((n) => xFinal.get(n.id) === colOrigen)) continue;

      // Se desplaza el bloque ENTERO, no solo el nodo que choca, para no
      // desapilar un tándem — mismo criterio que el resto de esta función. Si
      // el tope ya está agotado se acepta el solape: ensanchar el mapa sin
      // límite es peor (la razón de ser de MAX_COL_OFFSET, arriba).
      const colMaxTrasDesvio = Math.max(...lista.map((n) => xFinal.get(n.id)!)) + NODE_STEP_X;
      if (colMaxTrasDesvio > MAX_COL_OFFSET * NODE_STEP_X) continue;
      for (const n of lista) xFinal.set(n.id, xFinal.get(n.id)! + NODE_STEP_X);
    }
  }

  // Segunda fase: dentro de una FILA DE SUELTAS, ordenar por la columna del
  // ancla. Las sueltas no tienen hueco, así que su orden entre ellas lo fijaba
  // el título — arbitrario respecto a dónde están sus anclas, y por tanto sus
  // aristas de ventana se cruzaban entre sí sin ninguna razón.
  //
  // Se reconocen por `orderNo === null`, que es exactamente lo que
  // `deriveSagaMap` le pone a una obra sin hueco. Su fila va siempre después de
  // las de la cadena de su bloque, así que ninguna fila mezcla las dos cosas y
  // agrupar por `y` es seguro.
  //
  // Y agrupar SOLO por `y` (sin mirar a qué bloque pertenece cada suelta) es
  // seguro por un invariante que vive en OTRO fichero: `deriveSagaMap`
  // (derive-map.ts) nunca reutiliza una fila entre bloques — `rowCursor` es
  // estrictamente creciente, cada bloque reserva las suyas y el siguiente
  // empieza donde el anterior terminó. Si ese invariante se rompiera, dos
  // bloques podrían compartir `y` y esta agrupación mezclaría sus sueltas.
  const filasDeSueltas = new Map<number, SagaGraphNode[]>();
  for (const n of graph.nodes) {
    if (n.orderNo !== null) continue;
    const lista = filasDeSueltas.get(n.y);
    if (lista === undefined) filasDeSueltas.set(n.y, [n]);
    else lista.push(n);
  }

  // Columna del ancla MÁS A LA IZQUIERDA. Una suelta sin ancla se va al final de
  // su fila, no al principio: no tiene arista que enderezar y no debe empujar a
  // las que sí.
  const columnaDelAncla = (n: SagaGraphNode): number => {
    const columnas = (vecinos.get(n.id) ?? [])
      .map((id) => xFinal.get(id))
      .filter((x): x is number => x !== undefined);
    return columnas.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...columnas);
  };

  for (const lista of filasDeSueltas.values()) {
    // Las columnas que la fila ya ocupa se reparten entre las mismas obras, solo
    // que en otro orden: la fila no se ensancha ni deja huecos.
    const columnas = lista.map((n) => xFinal.get(n.id)!).sort((a, b) => a - b);
    const ordenadas = [...lista].sort((a, b) => {
      const ca = columnaDelAncla(a);
      const cb = columnaDelAncla(b);
      if (ca !== cb) return ca - cb;
      // Desempate por título: dos sueltas sin ancla, o con la misma, tienen que
      // salir siempre en el mismo orden o el mapa baila entre renders.
      return a.label.localeCompare(b.label);
    });
    ordenadas.forEach((n, i) => xFinal.set(n.id, columnas[i]));
  }

  // El mapa vuelve a empezar en la columna 0. En la práctica es una red por si
  // algún día un bloque de la primera fila se desplazara: hoy `minimo` siempre
  // vale 0, porque el bloque más alto (el primero que procesa el bucle de
  // arriba) nunca tiene vecinos ya colocados y su offset sale 0 sí o sí. (El
  // mini-preview del CTA NO depende de esto: se normaliza por su cuenta en
  // `scaleNodes`, derive-timeline.ts, que es el único camino que recorre.)
  const minimo = Math.min(...graph.nodes.map((n) => xFinal.get(n.id)!));
  return {
    nodes: graph.nodes.map((n) => ({ ...n, x: xFinal.get(n.id)! - minimo })),
    edges: graph.edges,
  };
}
