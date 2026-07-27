// Linealización de un grafo curado (saga_nodes/saga_edges) a itinerario
// (Task 5, fase 3). Migra a `saga_routes` lo único que el grafo sabía y el
// modelo nuevo no: un orden entre hilos que no tienen `order_no`
// (Mundodisco). PURA: no toca la base de datos, no conoce Supabase — el
// llamador (script de migración) le pasa los nodos/aristas ya leídos y usa
// el resultado para escribir los `insert` literales de la migración.
//
// Kahn con desempate determinista. Ante varios nodos "listos" (sin
// dependientes pendientes):
//   1) gana el hilo que se estaba leyendo: si emitir un nodo deja listo un
//      nodo de OTRO hilo (una cruz), la lectura salta a ese hilo y se queda
//      ahí mientras tenga nodos listos, en vez de volver al hilo anterior
//      solo porque también tenía algo pendiente. Si emitir un nodo NO deja
//      listo nada nuevo, se sigue leyendo el mismo hilo del nodo emitido.
//   2) en su defecto (el hilo actual se agotó, o es el primer nodo), gana el
//      hilo con nombre menor;
//   3) dentro del hilo, la posición menor;
//   4) por si dos nodos comparten hilo y posición, la `key` menor — solo para
//      que el comparador sea un orden total y el resultado no dependa del
//      orden de llegada de `nodes`/`edges`.
// Un ciclo (que el grafo no debería tener) no debe colgar el proceso ni
// perder nodos: si en algún punto ningún nodo está listo pero quedan nodos
// por emitir, se corta el ciclo tratando TODOS los que quedan como listos y
// se sigue con el mismo criterio.
export function linearizeGraph(
  nodes: Array<{ key: string; thread: string; position: number }>,
  edges: Array<{ from: string; to: string }>,
): string[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  const indegree = new Map<string, number>(nodes.map((n) => [n.key, 0]));
  const successors = new Map<string, string[]>(nodes.map((n) => [n.key, []]));
  for (const e of edges) {
    // Defensivo: una arista que apunte fuera de `nodes` no debería llegar
    // aquí (el llamador filtra por saga), pero no es motivo para reventar.
    if (!byKey.has(e.from) || !byKey.has(e.to)) continue;
    successors.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  const remaining = new Set(nodes.map((n) => n.key));
  const ready = new Set([...remaining].filter((k) => indegree.get(k) === 0));

  // Orden total determinista: hilo, posición, y la key como desempate final.
  const compare = (aKey: string, bKey: string): number => {
    const a = byKey.get(aKey)!;
    const b = byKey.get(bKey)!;
    if (a.thread !== b.thread) return a.thread < b.thread ? -1 : 1;
    if (a.position !== b.position) return a.position - b.position;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return 0;
  };
  const pickBest = (keys: string[]): string =>
    keys.reduce((best, k) => (best === null || compare(k, best) < 0 ? k : best), keys[0]);

  const result: string[] = [];
  let currentThread: string | null = null;

  while (remaining.size > 0) {
    let pool = currentThread !== null
      ? [...ready].filter((k) => byKey.get(k)!.thread === currentThread)
      : [];
    if (pool.length === 0) pool = [...ready];
    // Corte de ciclo: no hay ningún nodo listo pero quedan nodos sin emitir.
    if (pool.length === 0) pool = [...remaining];

    const picked = pickBest(pool);
    result.push(picked);
    remaining.delete(picked);
    ready.delete(picked);

    const unblocked: string[] = [];
    for (const to of successors.get(picked) ?? []) {
      if (!remaining.has(to)) continue; // ya emitido (p. ej. por la rotura de un ciclo)
      const nextDegree = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, nextDegree);
      if (nextDegree <= 0 && !ready.has(to)) {
        ready.add(to);
        unblocked.push(to);
      }
    }

    // Si emitir `picked` deja listo algo de otro hilo, la lectura salta ahí;
    // si no, se queda en el hilo del nodo que se acaba de emitir.
    currentThread = unblocked.length > 0 ? byKey.get(pickBest(unblocked))!.thread : byKey.get(picked)!.thread;
  }

  return result;
}
