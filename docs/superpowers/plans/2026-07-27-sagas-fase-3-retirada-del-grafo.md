# Sagas fase 3: el mapa deja de ser una tabla — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el «Mapa de lectura» se dibuje de lo que ya está curado —secuencia, tándems, bloques y ventanas— en vez de leerse de `saga_nodes`/`saga_edges`, y que lo único que esas tablas saben y el modelo nuevo no —el entrelazado del Cosmere y las 7 cruces de Mundodisco— viva en itinerarios antes de borrarlas.

**Architecture:** una función pura nueva (`deriveSagaMap`) produce **exactamente el mismo `SagaGraph`** que hoy produce `buildSagaGraph`, así que la vista 2D, el timeline móvil y el mini-preview del CTA no cambian ni una línea de render. Después: un migrador de una pasada, un generador de itinerarios desde la curación, y la retirada.

**Tech Stack:** Next.js 16 (App Router, React 19), Supabase/PostgREST, `@xyflow/react` (se queda), Tailwind v4 con tokens Paper, next-intl (solo `es`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-27-sagas-fase-3-retirada-del-grafo-design.md` — **léelo**, en particular «Lo que hay hoy, medido» y «El migrador».

## Global Constraints

- **El grafo no se retira: se deja de guardar.** La vista se queda, `@xyflow/react` se queda. Lo que muere son `saga_nodes`, `saga_edges`, `save_saga_graph` y el código que los resuelve.
- **El mapa es de solo lectura.** Su editor se retiró en la 2a y no vuelve. Se cura en el editor de secuencia.
- **Los nodos son obras individuales**, con los bloques expandidos hasta profundidad 4 (el mismo cinturón de `fetchDescendants`). Un bloque es agrupación visual, **nunca** un nodo.
- **Las ventanas son las aristas que cruzan**: `after` → arista entrante de tipo `requisito`; `before` → arista saliente de tipo `opcional`. **No se les da ni un gramo de poder nuevo**: sigue habiendo como máximo una ventana por entrada y dos anclas. Si al dibujar apetece «una arista más», se para y se dice en voz alta.
- **El progreso no cambia.** El Cosmere marca **9 de 11** y tiene que seguir marcándolo. Denominador medido por SQL: 1+6+1+3, con los dos bloques `optional` y *Arcanum Ilimitado* fuera.
- **La ficha no cambia.** «Títulos que la componen» sigue contando por bloques, con el reparto hecho **en el render** (#198) y sus líneas de ventana (2b).
- **`groupMembers` sigue devolviendo TODOS los grupos**: `computeProgress` los recorre para emitir los segmentos del hero. Filtrar ahí le quitaría tramos.
- **Un itinerario es estrictamente lineal**: `saga_route_entries` tiene unique en `(route_id, position)` **[MEDIDO]**, y `validateRouteDraft` exige posiciones `1..N` consecutivas, sin claves repetidas.
- **El orden esta vez es el de siempre**: primero el código, después el `drop`. Borrar una tabla que el bundle desplegado consulta rompe la ficha entera.
- **Migraciones: dev primero, prod después**, verificando contra `pg_class`/`pg_proc`/`pg_policies`, **nunca** contra `list_migrations`.
- **Node 22** (`fnm use 22`) antes de `vitest`/`playwright`. Un solo `next dev`, en el 3000.
- Copia en español; namespace `saga` en la ficha, `sagaEditor` en el editor.

## Estructura de ficheros

| Fichero | Qué |
|---|---|
| `src/lib/sagas/map-types.ts` | **nuevo**: `SagaGraph`, `SagaGraphNode`, `SagaGraphEdge` — mudados desde `graph-data.ts`, que muere |
| `src/lib/sagas/derive-map.ts` (+ test) | **nuevo**: `deriveSagaMap`, la derivación pura |
| `src/lib/sagas/types.ts` | `ResolvedWindow` gana las claves de sus anclas |
| `src/lib/sagas/group-members.ts` | `partitionGroups`, extraída del render de la ficha |
| `src/lib/sagas/get-saga-detail.ts` | deja de consultar `saga_nodes`/`saga_edges`; construye el mapa derivado |
| `src/lib/sagas/graph-data.ts` (+ test) | **se borra** |
| `src/components/saga/graph/*`, `map-cta.tsx`, `reading-timeline.tsx` | solo cambian el `import` de los tipos |
| `src/components/saga/saga-map-tab.tsx` | resalta el itinerario activo sobre el mapa |
| `src/lib/sagas/main-order.ts` (+ test) | **se borra**; el orden principal sale de la secuencia |
| `src/lib/sagas/get-followed-sagas.ts`, `build-library-saga-cards.ts` | dejan de leer nodos |
| `src/lib/sagas/linearize-graph.ts` (+ test) | **nuevo, temporal**: la linealización del migrador |
| `supabase/migrations/20260728_migrar_grafos_a_itinerarios.sql` | **nuevo**: el migrador de una pasada |
| `src/lib/sagas/route-actions.ts` | `generateRoute` |
| `src/components/saga/sequence/sequence-itineraries.tsx` | el botón «Generar itinerario» |
| `supabase/migrations/20260729_drop_saga_graph.sql` | **se aplica DESPUÉS de desplegar** |

---

### Task 1: La derivación pura del mapa

**Files:**
- Create: `src/lib/sagas/map-types.ts`, `src/lib/sagas/derive-map.ts`, `src/lib/sagas/derive-map.test.ts`
- Modify: `src/lib/sagas/types.ts`, `src/lib/sagas/get-saga-detail.ts` (solo `resolveWindows` y su test), `src/lib/sagas/group-members.ts` (+ test)

**Interfaces:**
- Produces: `deriveSagaMap(groups, windows, lookup): SagaGraph`, `partitionGroups(groups)`, y `ResolvedWindow` con `afterKey`/`beforeKey`.

- [ ] **Step 1: Mudar los tipos del grafo a su propio fichero**

Crea `src/lib/sagas/map-types.ts` con **exactamente** los tipos `SagaGraphNode`, `SagaGraphEdge` y `SagaGraph` que hoy viven en `graph-data.ts` (líneas 31-60), **sin tocar ni un campo**: la vista los consume tal cual y no queremos que cambie. Copia también sus comentarios.

En `graph-data.ts`, sustituye esas tres declaraciones por un re-export (`export type { SagaGraph, SagaGraphNode, SagaGraphEdge } from "./map-types";`) para no romper nada todavía. El fichero se borra en la Task 2.

Ejecuta `npx tsc --noEmit`: tiene que salir limpio sin tocar ningún componente.

- [ ] **Step 2: `ResolvedWindow` lleva las claves de sus anclas**

Hoy `ResolvedWindow` solo tiene títulos, y el mapa necesita **claves** para poder conectar nodos. En `src/lib/sagas/types.ts`:

```ts
/** Ventana de una entrada `libre` ya resuelta para la ficha. Un ancla que no
 *  resuelve contra el subárbol cargado llega como `null` y no se pinta: mejor
 *  media frase cierta que una referencia rota (spec fase 2b).
 *  Las claves viajan junto a los títulos porque el mapa (fase 3) dibuja cada
 *  ancla como una ARISTA, y para eso necesita el extremo, no su nombre. */
export type ResolvedWindow = {
  afterTitle: string | null;
  beforeTitle: string | null;
  afterKey: string | null;
  beforeKey: string | null;
};
```

En `resolveWindows` (`get-saga-detail.ts`), `keyOf` ya calcula esas claves para resolver el título: devuélvelas también. **La clave se rellena solo si el título resolvió**, para que `afterKey` y `afterTitle` no puedan discrepar: un ancla rota es `null` en las dos.

Añade a `get-saga-detail.test.ts` una prueba que lo fije. **Ese fichero ya tiene pruebas de `resolveWindows` con su forma de construir filas: reutilízala**; lo de abajo es la aserción, no el helper.

```ts
it("un ancla que resuelve trae clave y título; una rota, las dos a null", () => {
  // Sujeto: el bloque `sujeto`. Ancla `after`: el bloque `saga-1`, que resuelve.
  // Ancla `before`: una obra que ya no está en el subárbol.
  const out = resolveWindows(
    [
      {
        item_type: null, item_id: null, child_saga_id: "sujeto",
        after_item_type: null, after_item_id: null, after_child_saga_id: "saga-1",
        before_item_type: "book", before_item_id: "fantasma", before_child_saga_id: null,
        created_at: "2026-07-27T00:00:00Z",
      },
    ],
    new Map([["s:saga-1", "Era 1"]]),
  );
  expect(out["s:sujeto"]).toEqual({
    afterTitle: "Era 1", afterKey: "s:saga-1", beforeTitle: null, beforeKey: null,
  });
});
```

**Si la forma real de `RawWindowRow` no es exactamente esa, manda la real**: ábrela antes de escribir.

- [ ] **Step 3: Extraer `partitionGroups`**

`saga-info.tsx` reparte los grupos entre la lista ordenada y «Cuando quieras» **en el render** (#198), y el mapa necesita **el mismo** reparto: si divergen, la ficha y el mapa contarán la saga en distinto orden, que es la familia de la #91 y de la #203.

En `group-members.ts`:

```ts
/** Reparto entre la lista ordenada y «Cuando quieras», el MISMO que pinta la
 *  ficha. Vive aquí, y no en el render, desde que el mapa (fase 3) necesita
 *  recorrer los grupos en ese orden: dos vistas que reparten por su cuenta
 *  acaban discrepando (issues #91 y #203).
 *  OJO: esto NO filtra `groupMembers`, que debe seguir devolviendo todos los
 *  grupos porque `computeProgress` los recorre para los segmentos del hero. */
export function partitionGroups(groups: MemberGroup[]): {
  ordered: MemberGroup[];
  free: MemberGroup[];
} {
  return {
    ordered: groups.filter((g) => g.placementInParent !== "libre"),
    free: groups.filter((g) => g.placementInParent === "libre"),
  };
}
```

**Antes de escribirla, abre `saga-info.tsx` y copia el criterio EXACTO que usa hoy** (busca `orderedGroups`/`freeGroups`): si el suyo no es exactamente este, manda el suyo — es el que está en producción y verificado. Sustituye el del render por una llamada a esta función, y añade una prueba en `group-members.test.ts` con un grupo `libre`, uno colocado y uno sin clasificar.

- [ ] **Step 4: Las pruebas de la derivación, que fallan**

Crea `src/lib/sagas/derive-map.test.ts`. Los helpers: mira `group-members.test.ts`, que ya construye `MemberGroup` y `DetailMember` — **reutiliza su forma, no inventes otra**.

```ts
describe("deriveSagaMap", () => {
  it("un bloque colocado da una cadena de obras, no un nodo de bloque", () => {
    const map = deriveSagaMap(groups([block("Era 1", 1, [work("A", 1), work("B", 2)])]), {}, lookup());
    expect(map.nodes.map((n) => n.id)).toEqual(["i:book:A", "i:book:B"]);
    expect(map.nodes.every((n) => n.kind === "item")).toBe(true);
    expect(map.edges).toEqual([
      expect.objectContaining({ source: "i:book:A", target: "i:book:B", type: "principal" }),
    ]);
  });

  it("un tándem son dos nodos en la misma columna", () => {
    const map = deriveSagaMap(groups([block("B", 1, [work("A", 1), work("B", 1)])]), {}, lookup());
    const [a, b] = map.nodes;
    expect(a.x).toBe(b.x);
    expect(a.orderNo).toBe(b.orderNo);
  });

  it("cada bloque ocupa su propia fila", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("B", 1)])]),
      {}, lookup(),
    );
    expect(map.nodes.find((n) => n.id === "i:book:A")!.y).not.toBe(
      map.nodes.find((n) => n.id === "i:book:B")!.y,
    );
  });

  it("una ventana con ancla de obra es una arista que cruza", () => {
    // `after` = requisito y entra; `before` = opcional y sale.
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), freeBlock("Libre", [work("L", 1)])]),
      { "s:saga-Libre": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toContainEqual(
      expect.objectContaining({ source: "i:book:A", target: "i:book:L", type: "requisito" }),
    );
  });

  it("un ancla que apunta a un BLOQUE se conecta a su última obra, no al bloque", () => {
    // «A partir de Era 1» significa cuando Era 1 se ha terminado: el extremo es
    // su ÚLTIMA obra. Un bloque no es un nodo, así que no hay a qué apuntar si no.
    const map = deriveSagaMap(
      groups([block("Era 1", 1, [work("A", 1), work("B", 2)]), freeBlock("Libre", [work("L", 1)])]),
      { "s:saga-Libre": { afterKey: "s:saga-Era 1", afterTitle: "Era 1", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toContainEqual(
      expect.objectContaining({ source: "i:book:B", target: "i:book:L", type: "requisito" }),
    );
  });

  it("una entrada libre sin ventana queda suelta, sin aristas que la unan al resto", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), freeBlock("Libre", [work("L", 1)])]),
      {}, lookup(),
    );
    expect(map.edges.some((e) => e.source === "i:book:L" || e.target === "i:book:L")).toBe(false);
  });

  it("una ventana cuyo extremo no está en el mapa no pinta arista", () => {
    const map = deriveSagaMap(
      groups([freeBlock("Libre", [work("L", 1)])]),
      { "s:saga-Libre": { afterKey: "i:book:fantasma", afterTitle: "F", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toEqual([]);
  });

  it("una saga sin nada curado no da mapa", () => {
    expect(deriveSagaMap([], {}, lookup())).toEqual({ nodes: [], edges: [] });
  });
});
```

- [ ] **Step 5: Verlas fallar**

```bash
fnm use 22; npx vitest run src/lib/sagas/derive-map.test.ts
```

Esperado: falla por módulo inexistente.

- [ ] **Step 6: Implementar `deriveSagaMap`**

En `src/lib/sagas/derive-map.ts`. La firma, con el lookup reducido a lo que de verdad hace falta —los nodos-saga ya no existen, así que `childNames`/`childCovers`/`childCounts` del lookup viejo sobran—:

```ts
export type MapLookup = {
  groupAccent: Map<string | null, SagaAccentToken>;
  groupName: Map<string | null, string | null>;
};

export function deriveSagaMap(
  groups: MemberGroup[],
  windows: Record<string, ResolvedWindow>,
  lookup: MapLookup,
  routeKeys?: string[], // se rellena en la Task 3; aquí siempre undefined
): SagaGraph
```

Reglas, todas deterministas:

1. Recorre `partitionGroups(groups).ordered` y luego `.free`, en ese orden.
2. **Un nodo por obra**, con `id` = la clave de la entrada (`i:<tipo>:<uuid>`) — la misma que usan el borrador, la validación y las ventanas. Un bloque **no** produce nodo.
3. `x` = un contador de huecos que avanza al cambiar de hueco, **compartido por todo el mapa** (no se reinicia por bloque): así los bloques colocados salen en columnas crecientes. Dos obras en el mismo hueco de su bloque (tándem) comparten `x`.
4. `orderNo` = ese mismo contador. Es lo que hace que `deriveTimeline` siga funcionando sin tocarla: su columna son los nodos con `orderNo`.
5. `y` = el índice de la fila del bloque, en el orden del punto 1.
6. `level`: `"menor"` si la obra es `optional`, `"principal"` si no. Es la sustitución que pide el spec.
7. `label`, `accent`, `status`, `role`, `coverUrl`, `href`, `groupSagaId`, `groupName`: del miembro y del grupo, **igual que hace `buildSagaGraph` hoy** (ábrelo y copia el criterio). `covers` y `memberCount` van a `[]`/`null`: son de los nodos-saga, que ya no existen.
7-bis. **Una obra SIN hueco** (`position === null`: `libre` o sin clasificar) **sí es un nodo**, pero con `orderNo: null` y **sin ninguna arista de cadena** que entre o salga. Conserva la fila de su bloque y su `x` va tras el último hueco real. **Sí puede llevar aristas de ventana.** No es un caso raro: la ficha del Cosmere enseña «Sin hueco asignado en esta lista» en siete obras. Y el `orderNo: null` no es un detalle: `deriveTimeline` mete en su columna **cualquier** nodo con `orderNo !== null`, y tiene un mecanismo aparte —ramas y puentes— justo para los que no lo tienen. *(Regla añadida el 2026-07-27 tras la revisión de la Task 1, que la echó en falta: el plan no la traía.)*

8. **Aristas de cadena**: entre huecos consecutivos **del mismo bloque**, **saltándose las obras sin hueco**, de tipo `principal` y con el `accent` del origen. Con tándem, se conecta **cada** nodo del hueco con **cada** nodo del siguiente: un tándem significa «las dos aquí», así que las dos continúan. `id` = `` `chain:${source}->${target}` ``.
9. **Aristas de ventana**, para cada entrada con ventana:
   - el **sujeto** se resuelve a su nodo si es obra, o a la **primera** obra de su bloque si es bloque (es por donde se entra en él);
   - un ancla `after` se resuelve a la **última** obra de su bloque (se puede empezar cuando ese bloque está terminado) y produce `ancla → sujeto` de tipo `requisito`;
   - un ancla `before` se resuelve a la **primera** obra de su bloque y produce `sujeto → ancla` de tipo `opcional`;
   - si cualquiera de los dos extremos no resuelve a un nodo del mapa, **no hay arista** — misma regla que la ficha con un ancla rota;
   - `id` = `` `window:${source}->${target}` ``; `accent` como en `buildSagaGraph` (`opcional` → `ambar`, `requisito` → `beige`).
10. Ordena los nodos igual que `buildSagaGraph`: por `orderNo` (nulls al final) y luego `label`.

- [ ] **Step 7: Verlas pasar, e inyección de fallo**

```bash
fnm use 22; npx vitest run src/lib/sagas/derive-map.test.ts src/lib/sagas/group-members.test.ts src/lib/sagas/get-saga-detail.test.ts
```

Después, **una a una**: quita el tándem (que `x` no se comparta), invierte el extremo de un ancla de bloque (primera ↔ última obra), y deja de comprobar que los dos extremos existen. En cada caso tiene que caer **su** prueba y solo la suya. Pega la tabla en el informe.

- [ ] **Step 8: Commit**

```bash
git add src/lib/sagas/map-types.ts src/lib/sagas/derive-map.ts src/lib/sagas/derive-map.test.ts src/lib/sagas/graph-data.ts src/lib/sagas/types.ts src/lib/sagas/get-saga-detail.ts src/lib/sagas/get-saga-detail.test.ts src/lib/sagas/group-members.ts src/lib/sagas/group-members.test.ts src/components/saga/saga-info.tsx
git commit -m "feat(sagas): el mapa de lectura se deriva de la curación"
```

---

### Task 2: La ficha deja de leer el grafo

**Files:** Modify `src/lib/sagas/get-saga-detail.ts`; delete `src/lib/sagas/graph-data.ts` y `graph-data.test.ts`; ajustar los `import` de `src/components/saga/graph/*`, `map-cta.tsx`, `reading-timeline.tsx`, `derive-timeline.ts`.

**Interfaces:**
- Consumes: `deriveSagaMap` y `partitionGroups` (Task 1).
- `SagaDetail.graph` **no cambia de tipo**: sigue siendo `SagaGraph | null`.

- [ ] **Step 1: Cambiar la fuente**

En `get-saga-detail.ts`, quita del `Promise.all` las dos consultas a `saga_nodes` y `saga_edges` (las dos primeras del batch) y sustituye la construcción de `graph`:

```ts
// El mapa ya no se lee: se deriva de lo curado (fase 3). Los mismos `groups`
// que pinta la ficha, más las ventanas, más los lookups de acento y nombre que
// ya estaban construidos aquí para el grafo viejo.
const graph = deriveSagaMap(groups, windows, {
  groupAccent,
  groupName: groupNameMap,
});
```

`SagaDetail.graph` era `SagaGraph | null` y hoy vale `null` cuando no hay nodos. **Manténlo**: devuelve `null` si `graph.nodes.length === 0`, para que la pestaña siga sabiendo distinguir «no hay mapa». No cambies su tipo ni el de nadie que lo consuma.

- [ ] **Step 2: Los insumos del orden principal**

`orderNodes` alimenta `createMainOrder`, que se retira en la Task 4. **En esta tarea, déjalo funcionando**: pasa `orderNodes: []`. Con la lista vacía, `createMainOrder` cae por su rama «sin grafo», que ordena por `position` y luego por título — que es justo el orden al que se va a mover. Deja un comentario diciendo que es un paso intermedio de la fase 3 y que el fichero muere en la Task 4.

- [ ] **Step 3: Borrar `graph-data.ts` y arreglar los imports**

```bash
git rm src/lib/sagas/graph-data.ts src/lib/sagas/graph-data.test.ts
```

Y cambia `from "./graph-data"` / `from "@/lib/sagas/graph-data"` por `map-types` en: `derive-timeline.ts`, `graph-legend.tsx`, `graph-nodes.tsx`, `saga-graph-view.tsx`, `map-cta.tsx`, `derive-timeline.test.ts`. **Solo el import**: ningún componente cambia de contenido.

- [ ] **Step 4: Que el timeline siga en pie**

`deriveTimeline` no se toca, pero ahora recibe un grafo derivado. Añade a `derive-timeline.test.ts` una prueba que lo demuestre: construye un `SagaGraph` **con `deriveSagaMap`** (no a mano) a partir de dos bloques y comprueba que salen dos secciones con sus filas en orden. Es la prueba de que las dos piezas encajan, que ninguna de las dos cubre por su cuenta.

- [ ] **Step 5: Suite, tipos y navegador**

```bash
fnm use 22; npx vitest run; npx tsc --noEmit
```

Y contra dev, con **un solo** `next dev` en el 3000: abre la ficha de una saga con bloques y comprueba que la pestaña «Mapa de lectura» pinta el mapa 2D y el timeline. Comprueba también una saga **sin nada curado**: no debe reventar. Deja la semilla como estaba.

Y **mide el caso más grande**, que es un riesgo que el spec señala: hasta hoy el mapa estaba acotado a lo que alguien dibujó a mano (55 nodos en total, repartidos en cuatro sagas) y ahora tiene un nodo por obra del subárbol. Averigua por SQL cuál es la saga con más obras en su subárbol, ábrela, y di en el informe cuántos nodos salen y si la vista aguanta. Si no aguanta, **no lo arregles aquí**: dilo y que se decida.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(sagas): la ficha dibuja el mapa derivado y deja de consultar saga_nodes"
```

---

> **Corrección del 2026-07-27, tras verificar la Task 3.** Este plan afirmaba más arriba que «el consumidor no necesita un sistema concreto porque `scaleNodes` normaliza lo que le den». **Es falso para la vista 2D**: `scaleNodes` solo la llama el mini-preview del CTA; `saga-graph-view.tsx` pasa `position: { x: n.x, y: n.y }` a React Flow, que las coloca **crudas**. Con coordenadas de índice todos los nodos se apilan, y las tarjetas miden 78×116 px con una etiqueta de 150 px debajo. `deriveSagaMap` emite **píxeles** (`NODE_STEP_X = 180`, `NODE_STEP_Y = 220`); `orderNo` sigue siendo el índice lógico, sin escalar, porque lo consume `deriveTimeline`.

### Task 3: El itinerario, encima del mapa

**Files:** Modify `src/lib/sagas/map-types.ts`, `src/lib/sagas/derive-map.ts` (+ test), `src/components/saga/saga-map-tab.tsx`, `src/components/saga/graph/graph-nodes.tsx`, `messages/es.json`.

- [ ] **Step 1: El camino, en el tipo**

```ts
/** Paso del itinerario activo que corresponde a este nodo, 1..N. `null` si el
 *  itinerario no pasa por aquí, o si no hay itinerario activo. El mapa y el
 *  itinerario son dos capas: el itinerario manda sobre lo que dice, y el mapa
 *  sobre lo que el itinerario calla. */
step: number | null;
```

en `SagaGraphNode`. Con `null` por defecto en todos los nodos que produce `deriveSagaMap`.

- [ ] **Step 2: Marcar el camino**

`deriveSagaMap` acepta un cuarto argumento opcional `routeKeys?: string[]` (las claves de los pasos del itinerario, en orden) y rellena `step` con la posición 1..N del nodo en esa lista. Una clave del itinerario que no esté en el mapa **se ignora sin más**: el itinerario puede nombrar cosas que el mapa no dibuja, y ese es exactamente el caso del entrelazado del Cosmere.

Pruebas:

```ts
it("el itinerario numera los nodos por los que pasa y deja el resto a null", () => {
  const map = deriveSagaMap(groups([block("Uno", 1, [work("A", 1), work("B", 2)])]), {}, lookup(), ["i:book:B"]);
  expect(map.nodes.find((n) => n.id === "i:book:B")!.step).toBe(1);
  expect(map.nodes.find((n) => n.id === "i:book:A")!.step).toBeNull();
});

it("un paso que el mapa no dibuja se ignora, sin romper la numeración de los demás", () => {
  const map = deriveSagaMap(groups([block("Uno", 1, [work("A", 1)])]), {}, lookup(), ["i:book:fantasma", "i:book:A"]);
  expect(map.nodes.find((n) => n.id === "i:book:A")!.step).toBe(2);
});
```

La segunda fija una decisión: **el número del paso es el del itinerario, no el de los nodos dibujados**. Si un paso no se ve, su número tampoco se reutiliza — de lo contrario el mapa numeraría distinto que la lista del itinerario, que es la contradicción que esta fase existe para no tener.

- [ ] **Step 3: Pintarlo**

En `graph-nodes.tsx`, cuando `step !== null`, pinta el número. **Copia el estilo de la insignia de hueco que ya existe** en el editor de secuencia o en la ficha (búscalo antes: hay una convención de números pequeños en mono) en vez de inventar una tercera.

En `saga-map-tab.tsx`, cuando la ruta activa sea una **curada**, pasa sus claves a `deriveSagaMap` y sigue pintando debajo el `RouteView` de siempre. La pestaña gana el mapa; no pierde la lista.

- [ ] **Step 4: Comprobar en navegador y commit**

Contra dev: crea un itinerario con dos pasos, ábrelo en «Mapa de lectura» y comprueba que los dos nodos salen numerados y el resto no. Borra el itinerario al terminar.

```bash
git add -A
git commit -m "feat(sagas): el itinerario activo se resalta sobre el mapa"
```

---

### Task 4: El orden principal sale de la secuencia

**Files:** Delete `src/lib/sagas/main-order.ts` y `main-order.test.ts`; modify `src/lib/sagas/get-saga-detail.ts`, `get-followed-sagas.ts`, `build-library-saga-cards.ts` (+ test), `src/components/saga/route-view.tsx`, `src/lib/sagas/resolve-route.test.ts`.

**Contexto que hay que entender antes de tocar nada:** `createMainOrder` devuelve las claves `tipo:id` del orden principal de una saga, y lo usan tres sitios — la expansión de un bloque dentro de un itinerario (`route-view.tsx`), las portadas y el «siguiente» de las cards de Mi Biblioteca (`build-library-saga-cards.ts`) y la propia ficha. Hoy mezcla dos criterios: si la saga tiene nodos, manda el grafo; si no, manda `position`. **Esa asimetría es la #185**, y muere aquí.

- [ ] **Step 1: La función nueva**

Crea `src/lib/sagas/curated-order.ts`. **Múdate ahí `OrderSaga`, `OrderMembership` e `itemKey`** desde `main-order.ts` —que se borra en el Step 4—, y deja fuera `OrderNode`, que era del grafo. La firma es la misma **menos los nodos**:

```ts
export function createCuratedOrder(
  sagas: OrderSaga[],
  memberships: OrderMembership[],
  titleOf: (key: string) => string,
): (rootId: string) => string[]
```

El cuerpo es **la rama «sin grafo» de `createMainOrder`, copiada tal cual**: miembros directos por `position` y luego título, después las hijas, recursivo con el mismo `visited` y el mismo `MAX_DEPTH = 4`. **Ábrelo y cópialo; no lo reescribas de memoria.**

Un cambio, y solo uno: el orden de las hijas deja de ser el `position` **mínimo de sus miembros** —la heurística vieja, que es la **#204**— y pasa a ser `position_in_parent`, con los `libre` detrás y desempate por nombre. Es **exactamente** el comparador que ya usa `group-members.ts` para `childGroups`: cópialo de ahí, porque está verificado con 5 permutaciones y es el que la ficha enseña.

Para eso `OrderSaga` necesita `positionInParent` y `placementInParent`; añádeselos y rellénalos en los tres llamantes (los datos ya están en memoria en los tres: `descendants` en la ficha, `sagas` en la librería).

- [ ] **Step 2: Las pruebas**

Copia `main-order.test.ts` a `curated-order.test.ts` y **quita las que van del grafo**. Añade dos:

```ts
it("las hijas van por su colocación en el padre, no por el hueco mínimo de sus miembros", () => {
  // La heurística vieja (issue #204) daba el orden inverso en este caso.
  const order = createCuratedOrder(
    [root("R"), child("Tarde", "R", { positionInParent: 1 }), child("Pronto", "R", { positionInParent: 2 })],
    [member("Tarde", "z", 9), member("Pronto", "a", 1)],
    titleOf,
  );
  expect(order("R")).toEqual(["book:z", "book:a"]);
});

it("una hija `libre` va detrás de las colocadas", () => {
  const order = createCuratedOrder(
    [root("R"), child("Libre", "R", { placementInParent: "libre" }), child("Fija", "R", { positionInParent: 1 })],
    [member("Libre", "l", 1), member("Fija", "f", 1)],
    titleOf,
  );
  expect(order("R")).toEqual(["book:f", "book:l"]);
});
```

**Inyección de fallo obligatoria**: vuelve al comparador viejo (mínimo `position`) y comprueba que cae la primera; quita el «`libre` detrás» y comprueba que cae la segunda.

- [ ] **Step 3: Cambiar los tres llamantes**

`get-saga-detail.ts` (quita `orderNodes` de `SagaDetail`), `build-library-saga-cards.ts` y `route-view.tsx`. En `get-followed-sagas.ts`, **borra la consulta a `saga_nodes`** (la segunda del `Promise.all`, línea ~98) y el mapeo `LibNode`.

**Esto cierra la #203 de paso**: la card de Mi Biblioteca y la ficha pasan a ordenar los bloques con el mismo comparador. Compruébalo y dilo en el informe; si no queda cerrada del todo, explica qué falta.

- [ ] **Step 4: Borrar y verificar**

```bash
git rm src/lib/sagas/main-order.ts src/lib/sagas/main-order.test.ts
fnm use 22; npx vitest run; npx tsc --noEmit
```

Y en el navegador contra dev: la card de una saga seguida en Mi Biblioteca y la expansión de un bloque dentro de un itinerario. **Comprueba que el progreso de la saga no se ha movido** — no debería tocarlo nada de esto, y por eso mismo hay que mirarlo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sagas): el orden principal sale de la curación, no del grafo"
```

---

### Task 4-bis: El mapa se enseña cuando aporta

> **Tarea añadida el 2026-07-27**, decidida por el responsable al revisar la Task 4. **No estaba en el plan original** y sustituye a lo que ese plan daba por bueno.

**Files:** Create `supabase/migrations/20260728_sagas_show_map.sql`; modify `src/lib/sagas/get-saga.ts`, `get-saga-detail.ts`, `build-library-saga-cards.ts`, `get-followed-sagas.ts`, `manage-saga-actions.ts` (o donde vivan las acciones de meta), `src/components/saga/saga-meta-editor.tsx`, `saga-info.tsx`, `messages/es.json`.

**El problema, medido:** al derivar el mapa, `hasGraph` cambió de significado sin que nadie lo pidiera. Antes era «alguien dibujó un grafo a mano» —**1 saga de 14** en dev— y ahora es «el subárbol tiene algún miembro» —**10 de 14**—. De ese booleano cuelgan tres cosas: el aviso «Orden de lectura disponible. **Un moderador configuró el recorrido** de esta saga», el badge `◆ Grafo` de las cards de Mi Biblioteca, y la propia ruta `lectura` del selector.

**La decisión:** el aviso **se retira** —ya no señala nada— y en su lugar el curador **decide** si esa saga enseña mapa, con un interruptor en el editor. Porque ahora el mapa se genera solo: el de una saga de dos títulos no aporta nada, y el de Mundodisco sí. Se activa donde aporta.

- [ ] **Step 1: La columna**

```sql
-- supabase/migrations/20260728_sagas_show_map.sql
-- Hasta la fase 3, tener mapa significaba que alguien lo había DIBUJADO a
-- mano, así que su existencia ya era la señal de que merecía enseñarse. Al
-- derivarlo de la curación, toda saga con miembros tiene mapa y esa señal
-- desaparece: el de una saga de dos títulos no aporta nada. Lo decide el
-- curador.
alter table public.sagas add column show_map boolean not null default false;

-- Las sagas que HOY tienen mapa lo siguen enseñando: retirarlo en silencio
-- sería una pérdida, no una migración.
update public.sagas s set show_map = true
 where exists (select 1 from public.saga_nodes n where n.saga_id = s.id);
```

Aplícala a **dev** y verifica contra `information_schema.columns` y con un `select count(*) where show_map` que salgan **exactamente las 4** sagas que tienen nodos hoy.

- [ ] **Step 2: El dato llega hasta donde ya se decide**

`hasGraph` ya está cableado en los cuatro sitios que importan; **no inventes un camino nuevo**, cambia su origen:

- `get-saga-detail.ts`: `hasGraph: saga.showMap && graph !== null`.
- `buildRouteList(curated, labels, hasGraph)` decide si existe la ruta `lectura`: con el interruptor apagado, el selector no la ofrece y **la pestaña sigue existiendo** para los itinerarios y para «Publicación».
- `build-library-saga-cards.ts` / `get-followed-sagas.ts`: el badge sale del mismo dato.
- `src/app/saga/[id]/mapa/page.tsx` ya trata el caso «sin mapa»: compruébalo y respétalo.

**Comprueba qué pasa con la ruta activa** cuando alguien llega a `?ruta=lectura` de una saga con el interruptor apagado: no puede quedarse en blanco. Mira cómo se resuelve hoy una ruta que no existe y sigue ese camino.

- [ ] **Step 3: Retirar el aviso**

Quita el bloque de `saga-info.tsx` que pinta `graphAvailableTitle`/`graphAvailableBody` y sus dos claves de `messages/es.json`. **Comprueba con grep que no queda ningún consumidor** antes de borrarlas.

- [ ] **Step 4: El interruptor**

En `saga-meta-editor.tsx`, junto al resto de metadatos de la saga. Sigue **el patrón que ese componente ya usa** para guardar (mira su acción y su estado de formulario antes de escribir nada); no montes un mecanismo nuevo. Copia nueva en `sagaEditor`:

```json
"showMapLabel": "Enseñar el mapa de lectura",
"showMapHint": "El mapa se genera solo con lo que cures. En una saga de pocos títulos no suele aportar."
```

El interruptor necesita el mismo gate que el resto del editor (`collaborator+`), tanto en la acción como en la BD.

- [ ] **Step 5: Pruebas y navegador**

Prueba de `buildRouteList` con `hasGraph` en `false`: la ruta `lectura` **no** está y las curadas y «Publicación» sí. Y contra dev: enciende el interruptor en una saga, comprueba que aparece la ruta `lectura` con su mapa; apágalo, comprueba que desaparece **y que la pestaña sigue viva** si hay itinerarios. Deja la semilla como estaba.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(sagas): el curador decide si su saga enseña mapa"
```

---

### Task 5: El migrador

**Files:** Create `src/lib/sagas/linearize-graph.ts` (+ test), `supabase/migrations/20260728_migrar_grafos_a_itinerarios.sql`.

**Qué migra, medido contra producción el 2026-07-27:** solo **Cosmere** (19 nodos con `order_no`) y **Mundodisco** (26 nodos, 28 aristas, 0 con `order_no`). **Trono de Cristal y Maasverse NO se migran**: el primero es redundante hasta el empate del hueco 6 y el segundo tiene un solo nodo sin orden. Está en el spec con los números.

- [ ] **Step 1: La linealización, pura y probada**

Un itinerario es **estrictamente lineal** (unique en `(route_id, position)`), y el grafo de Mundodisco es un DAG: hay que elegir **un** orden topológico y saber explicarlo.

```ts
/** Linealiza un DAG de nodos con hilo (Kahn). Ante varios candidatos listos:
 *  1) gana el del hilo que se estaba leyendo (agrupa cada hilo todo lo que las
 *     cruces permiten, en vez de saltar de hilo en hilo);
 *  2) en su defecto, el hilo con nombre menor;
 *  3) dentro del hilo, la posición menor.
 *  Determinista: la misma entrada da siempre la misma salida, venga como venga
 *  ordenada. Un ciclo (que el grafo no debería tener) se corta emitiendo lo que
 *  quede por el mismo criterio, en vez de colgarse o perder nodos. */
export function linearizeGraph(
  nodes: Array<{ key: string; thread: string; position: number }>,
  edges: Array<{ from: string; to: string }>,
): string[]
```

- [ ] **Step 2: Sus pruebas**

```ts
const n = (key: string, thread: string, position: number) => ({ key, thread, position });

it("sin aristas, agrupa por hilo y ordena por posición dentro de cada uno", () => {
  expect(
    linearizeGraph([n("b2", "B", 2), n("a2", "A", 2), n("a1", "A", 1), n("b1", "B", 1)], []),
  ).toEqual(["a1", "a2", "b1", "b2"]);
});

it("una arista que cruza fuerza el orden entre hilos", () => {
  // A2 -> B1: B1 no puede salir hasta que A2 haya salido, aunque «B» empiece antes.
  expect(
    linearizeGraph([n("a1", "A", 1), n("a2", "A", 2), n("b1", "B", 1)], [{ from: "a2", to: "b1" }]),
  ).toEqual(["a1", "a2", "b1"]);
});

it("el hilo que se está leyendo gana al alfabético", () => {
  // Con B1 y A2 listos a la vez tras B... sigue B, en vez de saltar a A.
  expect(
    linearizeGraph([n("a1", "A", 1), n("a2", "A", 2), n("b1", "B", 1), n("b2", "B", 2)],
      [{ from: "a1", to: "b1" }]),
  ).toEqual(["a1", "b1", "b2", "a2"]);
});

it("es determinista: cinco permutaciones de la misma entrada dan el mismo orden", () => {
  // Mismo criterio con el que se verificó el comparador de la #198.
  const nodes = [n("a1", "A", 1), n("a2", "A", 2), n("b1", "B", 1)];
  const edges = [{ from: "a2", to: "b1" }];
  const esperado = linearizeGraph(nodes, edges);
  for (const permutada of permutaciones(nodes, 5)) {
    expect(linearizeGraph(permutada, edges)).toEqual(esperado);
  }
});

it("un ciclo no cuelga ni pierde nodos", () => {
  expect(
    linearizeGraph([n("a", "A", 1), n("b", "A", 2)], [{ from: "a", to: "b" }, { from: "b", to: "a" }]),
  ).toHaveLength(2);
});
```

`permutaciones` es un helper local del propio test (rota el array N veces); escríbelo ahí, no en el código de producción.

- [ ] **Step 3: Calcular los dos itinerarios contra producción**

Con `mcp__supabase-prod__execute_sql` **en solo lectura**, saca los nodos y aristas reales de las dos sagas, pásalos por `linearizeGraph` y **enseña las dos listas resultantes en el informe, con los títulos**. El Cosmere no necesita linealizar: sus 19 nodos ya traen `order_no`.

**Mira el resultado de Mundodisco con ojos de lector antes de seguir.** Si la linealización produce un orden que nadie recomendaría, dilo en el informe y **para**: es preferible ajustarlo que aceptar un artefacto del algoritmo. El itinerario se puede editar después, pero conviene no nacer torcido.

En la misma pasada, resuelve el último cabo que el spec deja abierto: **hay 2 nodos con `level = 'menor'` de 55** **[MEDIDO]**. Averigua **cuáles son** y si su condición de «menor» ya la dice `optional` o el rol narrativo. Si la dice, no hay nada que hacer y se anota; si no, se cura a mano —son dos— **antes** del borrado de la Task 7, porque después ya no se sabrá. `label_override` no hace falta mirarlo: hay **0 de 55 con valor** **[MEDIDO]**.

- [ ] **Step 4: La migración, con los valores ya calculados**

Escribe `supabase/migrations/20260728_migrar_grafos_a_itinerarios.sql` con los `insert` **literales** (posiciones y `item_id` explícitos, salidos del paso anterior), no con una linealización en SQL. Crea un `saga_routes` por saga —nombre en español, `slug` que no sea `lectura` ni `publicacion`, que están reservados por un CHECK— y sus `saga_route_entries` en `1..N`.

Cabecera obligatoria, en español: qué migra, de dónde salió el orden, por qué Trono de Cristal y Maasverse no están, y que **se revierte borrando el itinerario** (`saga_route_entries` cuelga de `route_id` con `on delete cascade`).

- [ ] **Step 5: Aplicar a dev, verificar, y comprobar que se puede leer**

Aplícala a **dev** y comprueba contra las tablas reales: dos rutas, 19 y 26 pasos, posiciones `1..N` sin huecos. Después ábrelas en el navegador: el itinerario tiene que ser recorrible y sus pasos salir numerados en el mapa (Task 3).

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/linearize-graph.ts src/lib/sagas/linearize-graph.test.ts supabase/migrations/20260728_migrar_grafos_a_itinerarios.sql
git commit -m "feat(sagas): migra a itinerarios lo que solo el grafo sabía"
```

---

### Task 6: El generador

**Files:** Modify `src/lib/sagas/route-actions.ts`, `src/components/saga/sequence/sequence-itineraries.tsx`, `messages/es.json`.

- [ ] **Step 1: La acción**

En `route-actions.ts`, junto a `createRoute` y `saveRoute`, cuyo estilo y gates hay que copiar (`getCurrentUserRole` + `hasMinRole("collaborator")`, y `revalidateSagaPage` al final):

```ts
/** Construye un itinerario recorriendo la curación, en el mismo orden que el
 *  mapa. Crea uno NUEVO; nunca pisa los existentes — una saga admite varios, y
 *  sobrescribir el trabajo de alguien para ahorrarse un nombre no compensa.
 *  Hoy un itinerario se empieza en blanco, y por eso hay cero en producción. */
export async function generateRoute(sagaId: string): Promise<{ error?: string }>
```

Pasos: gate; cargar el detalle (que ya trae `groups` y `windows`); derivar el orden con `createCuratedOrder`; **si sale vacío, devolver `{ error: "empty" }` sin crear nada** — la lección de la #181 y de la línea que hubo que añadir en la #198; insertar la fila de `saga_routes` como hace `createRoute` (incluida su lógica de `position` y de slug reservado); y guardar los pasos con la RPC `save_saga_route`, pasando antes por `validateRouteDraft`, igual que `saveRoute`.

Los pasos son **obras**, con `childSagaId: null`, posiciones `1..N` y `note: null`. Deduplica por clave: `validateRouteDraft` rechaza claves repetidas, y una obra puede ser miembro de dos sagas del subárbol.

- [ ] **Step 2: El botón**

En `sequence-itineraries.tsx`, junto al enlace «crear» que ya hay. Claves nuevas en `sagaEditor`:

```json
"itineraryGenerate": "Generar desde la curación",
"itineraryGenerateEmpty": "No hay nada curado todavía con lo que construirlo.",
"itineraryGenerateName": "Orden curado"
```

El componente es un Server Component; para el botón sigue el patrón de formulario con server action que ya usan `create-route-form.tsx` y los botones del editor — **léelos antes**, no montes un `useState` nuevo.

- [ ] **Step 3: Probar y comprobar**

Pruebas del orden que produce (puras, sobre `createCuratedOrder`, que ya las tiene) y **verificación en navegador contra dev**: generar sobre una saga con bloques, ver los pasos, y generar sobre una saga vacía y ver el mensaje en vez de un itinerario sin pasos. Borra lo que crees y déjalo como estaba.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(sagas): generar un itinerario desde la curación"
```

---

### Task 7: La retirada, producción y cierre

**Files:** Create `supabase/migrations/20260729_drop_saga_graph.sql`; modify `supabase/schema-baseline.sql`, `docs/requirements/data-model.md`, `backlog.md`, `decisiones.md`; create `e2e/sagas-mapa-derivado.spec.ts`.

- [ ] **Step 1: El e2e**

**Lee los componentes antes de escribir un locator.** Cubre lo que esta fase estrena y antes no existía:

1. una saga **curada y sin grafo** enseña mapa en «Mapa de lectura» — hoy no enseñaría nada;
2. el generador crea un itinerario recorrible;
3. una entrada `libre` **con ventana** produce la arista que cruza (compruébalo por el DOM del grafo o por el timeline, lo que sea estable; míralo antes de decidir).

Con `try/finally`, **`fetch` nativo** (no el fixture `request`, que muere con el contexto), comprobando `res.ok`, dejando la semilla como estaba, y **dos pasadas seguidas en verde**. Hay precedente en `e2e/sagas-ventanas.spec.ts` y `e2e/sagas-colocacion-bloques.spec.ts`.

Después **valídalo rompiendo el producto**: revierte la parte que cada test dice cubrir y comprueba que cae ese test y no otro.

- [ ] **Step 2: El migrador, a producción**

Aplica `20260728_migrar_grafos_a_itinerarios.sql` a **prod** y verifica contra las tablas: dos rutas, 19 y 26 pasos.

- [ ] **Step 3: Desplegar y comprobar**

Tras mergear y desplegar:

1. El mapa del Cosmere se dibuja de lo curado. **Va a cambiar de aspecto** —hoy son 19 obras entrelazadas a mano— y eso no es un fallo: es lo que la 2b curó. Míralo y déjalo escrito.
2. El itinerario migrado del Cosmere se abre y sus pasos salen numerados sobre el mapa.
3. Mundodisco enseña sus **cinco hilos paralelos sin cruces** en el mapa derivado, y sus 7 cruces dentro del itinerario. Está previsto en el spec.
4. **El progreso del Cosmere sigue en 9 de 11.**
5. Una saga **sin grafo** —cualquiera de las otras 77— ahora tiene mapa. Comprueba una.

- [ ] **Step 4: El `drop`, solo después del paso 3**

```sql
-- supabase/migrations/20260729_drop_saga_graph.sql
-- El mapa dejó de leerse de aquí: se deriva de la curación (fase 3). Estas
-- tablas eran una SEGUNDA VERDAD capaz de contradecir a la ficha, y lo que
-- solo ellas sabían vive ya en los itinerarios de Cosmere y Mundodisco
-- (20260728_migrar_grafos_a_itinerarios.sql), migrado ANTES de este borrado.
drop function if exists public.save_saga_graph(uuid, jsonb, jsonb);
drop table public.saga_edges;
drop table public.saga_nodes;
```

**Comprueba la firma real de `save_saga_graph` contra `pg_proc` antes de escribir el `drop`**: si no es esa, manda la real. Aplica a dev y a prod, y verifica que las dos tablas y la función han desaparecido (`to_regclass` y `pg_proc`), y que **la ficha del Cosmere sigue funcionando** después.

Regenera después `src/lib/supabase/database.types.ts` contra dev: si no, el fichero seguirá declarando tablas que ya no existen.

- [ ] **Step 5: Doc e issues**

- `schema-baseline.sql`: anexar las dos migraciones, con la fecha de aplicación a **dev y prod** y qué se verificó — no «pendiente».
- `data-model.md`: retirar `saga_nodes`/`saga_edges`, y explicar que el mapa es **derivado**, con qué lo alimenta.
- `backlog.md`: fase 3 hecha; la unificación cerrada.
- `decisiones.md`, al final: que el mapa pasa a ser una vista y no una tabla; que las ventanas se dibujan como aristas **sin ganar poder**; el criterio de linealización de Mundodisco y por qué el orden topológico elegido es ese; y por qué Trono de Cristal y Maasverse no se migraron.
- Cerrar **#204** y **#185** (con el matiz que dice el spec: su título habla del denominador, y eso lo arregló la fase 1; lo que muere aquí es la asimetría de la **secuencia**) y **#196** (deja de tener sentido cuando el grafo no guarda colocación). Issue por lo que quede vivo.

- [ ] **Step 6: Comprobación final**

```bash
fnm use 22; npx tsc --noEmit; npx vitest run; npm run lint
```

Esperado: limpio salvo el error preexistente de `signup-form.tsx` (#163).
