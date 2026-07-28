# Menos cruces de aristas en el mapa 2D de sagas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir los cruces de aristas del mapa 2D colocando cada bloque `libre` junto a su ancla y alineando las columnas de los bloques que una arista larga conecta.

**Architecture:** Dos funciones puras nuevas a los lados de `deriveSagaMap`, partidas por lo que cada una necesita saber. `orderBlocksForLayout` corre **antes** del reparto de filas, con la semántica de grupos delante. `alignRowsToLongEdges` corre **después** de construir las aristas, porque las de ventana e itinerario no existen antes. `deriveSagaMap` gana dos llamadas y pierde dos acoplamientos (un índice que hacía de predicado, y un contador que mezclaba orden lógico con orden de pintado).

**Tech Stack:** TypeScript, Vitest. Sin dependencias nuevas — se descartó dagre/elkjs a propósito, ver el spec.

**Spec:** `docs/superpowers/specs/2026-07-28-sagas-mapa-menos-cruces-design.md`

## Global Constraints

- **Node 22 obligatorio antes de cualquier `vitest`.** El shell resuelve Node v20 y vitest muere al arrancar (`node:util no exporta styleText`). Antes de cada comando de test:
  `export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"`
  Comprobar `node --version` = `v22.23.1`.
- **Nada toca el esquema.** Ni migraciones, ni RLS, ni `docs/requirements/data-model.md`.
- **`SagaGraph` no cambia de forma.** Lo consumen tres pantallas (vista 2D, timeline móvil, mini-preview del CTA). No se le añaden campos.
- **`orderNo` nunca es una coordenada.** Es el índice lógico que consume `deriveTimeline`, global y creciente en el ORDEN DE LECTURA, no en el de pintado.
- **La zona ordenada es intocable.** El orden relativo de los bloques `placementInParent !== "libre"` es curación del usuario, no layout.
- **`MAX_COL_OFFSET = 4`** columnas, offset absoluto desde la columna 0.
- **Aristas largas** = `type` en `{"requisito", "opcional", "itinerario"}`. `principal` queda fuera.
- Comentarios y nombres en español, como todo `src/lib/sagas/`. Los comentarios explican el **porqué**, no el qué.

---

### Task 1: `orderBlocksForLayout` — el orden de pintado de los bloques

Función pura y aislada. No se cablea todavía: al terminar esta tarea el mapa sigue dibujando exactamente igual.

**Files:**
- Modify: `src/lib/sagas/group-members.ts` (añadir al final, junto a `partitionGroups` en la línea 175)
- Test: `src/lib/sagas/group-members.test.ts` (añadir un `describe` al final)

**Interfaces:**
- Consumes: `MemberGroup` (`group-members.ts:13`), `ResolvedWindow` (`types.ts:118`)
- Produces: `orderBlocksForLayout(ordered: MemberGroup[], free: MemberGroup[], windows: Record<string, ResolvedWindow>): MemberGroup[]`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/sagas/group-members.test.ts`:

```ts
describe("orderBlocksForLayout", () => {
  // Helpers locales: un bloque con un `sagaId` legible (`saga-<nombre>`) para
  // poder escribir su clave de ventana (`s:saga-<nombre>`) sin inventar uuids.
  const bloque = (name: string, placement: SagaPlacement | null, works: string[]): MemberGroup => {
    const sagaId = `saga-${name}`;
    return {
      sagaId,
      name,
      accent: "beige",
      members: works.map((id) => member({ itemId: id, title: id, groupSagaId: sagaId, position: 1 })),
      positionInParent: placement === "libre" ? null : 1,
      placementInParent: placement,
    };
  };

  const ventana = (after: string | null, before: string | null): ResolvedWindow => ({
    afterKey: after,
    afterTitle: after,
    beforeKey: before,
    beforeTitle: before,
    reason: null,
  });

  const nombres = (list: MemberGroup[]) => list.map((g) => g.name);

  it("un libre anclado DESPUÉS de una obra se coloca detrás del bloque de esa obra", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    const libre = bloque("Libre", "libre", ["l"]);
    const orden = orderBlocksForLayout([uno, dos], [libre], {
      "s:saga-Libre": ventana("i:book:a", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "Libre", "Dos"]);
  });

  it("un libre anclado ANTES de un bloque se coloca delante de ese bloque", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    const libre = bloque("Libre", "libre", ["l"]);
    const orden = orderBlocksForLayout([uno, dos], [libre], {
      "s:saga-Libre": ventana(null, "s:saga-Dos"),
    });
    expect(nombres(orden)).toEqual(["Uno", "Libre", "Dos"]);
  });

  it("`after` manda sobre `before` cuando la ventana trae los dos", () => {
    // Misma preferencia que la ficha: «a partir de» sitúa, «antes de» solo acota.
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    const libre = bloque("Libre", "libre", ["l"]);
    const orden = orderBlocksForLayout([uno, dos], [libre], {
      "s:saga-Libre": ventana("s:saga-Dos", "s:saga-Uno"),
    });
    expect(nombres(orden)).toEqual(["Uno", "Dos", "Libre"]);
  });

  it("un libre anclado a OTRO libre espera a que el primero esté colocado", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const primero = bloque("Primero", "libre", ["p"]);
    const segundo = bloque("Segundo", "libre", ["s"]);
    // `segundo` se procesa ANTES que `primero` a propósito: su ancla todavía no
    // está en la lista, así que solo puede colocarse en una pasada posterior.
    const orden = orderBlocksForLayout([uno], [segundo, primero], {
      "s:saga-Primero": ventana("i:book:a", null),
      "s:saga-Segundo": ventana("s:saga-Primero", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "Primero", "Segundo"]);
  });

  it("dos libres con la MISMA ancla y el mismo lado conservan su orden relativo", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const p = bloque("P", "libre", ["p"]);
    const q = bloque("Q", "libre", ["q"]);
    const orden = orderBlocksForLayout([uno], [p, q], {
      "s:saga-P": ventana("i:book:a", null),
      "s:saga-Q": ventana("i:book:a", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "P", "Q"]);
  });

  it("un libre sin ventana se queda al final, como hoy", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const libre = bloque("Libre", "libre", ["l"]);
    expect(nombres(orderBlocksForLayout([uno], [libre], {}))).toEqual(["Uno", "Libre"]);
  });

  it("un ancla rota no coloca el bloque ni rompe a los demás", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const roto = bloque("Roto", "libre", ["r"]);
    const bueno = bloque("Bueno", "libre", ["g"]);
    const orden = orderBlocksForLayout([uno], [roto, bueno], {
      "s:saga-Roto": ventana("i:book:no-existe", null),
      "s:saga-Bueno": ventana("i:book:a", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "Bueno", "Roto"]);
  });

  it("un ciclo de libres anclados entre sí no cuelga: los dos al final", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const x = bloque("X", "libre", ["x"]);
    const y = bloque("Y", "libre", ["y"]);
    const orden = orderBlocksForLayout([uno], [x, y], {
      "s:saga-X": ventana("s:saga-Y", null),
      "s:saga-Y": ventana("s:saga-X", null),
    });
    expect(nombres(orden)).toEqual(["Uno", "X", "Y"]);
  });

  it("sin bloques libres devuelve la zona ordenada intacta", () => {
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    expect(nombres(orderBlocksForLayout([uno, dos], [], {}))).toEqual(["Uno", "Dos"]);
  });
});
```

Y ampliar los imports de la cabecera del fichero de test (líneas 1-4):

```ts
import { describe, expect, it } from "vitest";
import {
  averageSagaRating,
  computeProgress,
  groupMembers,
  orderBlocksForLayout,
  partitionGroups,
} from "./group-members";
import type { MemberGroup } from "./group-members";
import type { DetailMember, ResolvedWindow, SagaChildRef, SagaPlacement } from "./types";
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/group-members.test.ts
```

Esperado: FAIL. El error es de compilación, no de aserción: `"orderBlocksForLayout" is not exported by "src/lib/sagas/group-members.ts"`.

- [ ] **Step 3: Implementar**

Añadir en `src/lib/sagas/group-members.ts`, justo después de `partitionGroups` (que termina en la línea 183):

```ts
/**
 * Orden de PINTADO de los bloques del mapa 2D, que ya no es
 * `[...ordered, ...free]`: un bloque `libre` con ventana sube y se coloca junto
 * a su ancla, intercalado entre los colocados.
 *
 * Existe para reducir cruces de aristas. Un bloque libre anclado a la fila 2
 * dibujado en la fila 9 obliga a su arista de ventana a cruzar todo el lienzo,
 * y esas aristas —no las de cadena— son las que hacen el nudo.
 *
 * NO reordena la zona ordenada: ese orden es curación del usuario. Y NO toca
 * `orderNo`: quien pinta y quien cuenta el orden de lectura son dos cosas
 * distintas desde que `deriveSagaMap` calcula los `orderNo` en una pre-pasada
 * aparte (ver el comentario de `orderNoDeCadaObra` en derive-map.ts).
 */
export function orderBlocksForLayout(
  ordered: MemberGroup[],
  free: MemberGroup[],
  windows: Record<string, ResolvedWindow>,
): MemberGroup[] {
  // Qué bloque contiene cada clave de entrada. Las dos formas que puede tomar
  // un ancla: `s:<sagaId>` (el bloque entero) e `i:<tipo>:<uuid>` (una obra, que
  // resuelve al bloque que la tiene). Las mismas claves que usan el editor de
  // secuencia y `deriveSagaMap`.
  const bloqueDeClave = new Map<string, MemberGroup>();
  for (const g of [...ordered, ...free]) {
    if (g.sagaId !== null) bloqueDeClave.set(`s:${g.sagaId}`, g);
    for (const m of g.members) bloqueDeClave.set(`i:${m.itemType}:${m.itemId}`, g);
  }

  const resultado = [...ordered];
  // Cuántos libres se han insertado ya DETRÁS de cada ancla. Sin esto, dos
  // libres con la misma ancla salen en orden inverso: los dos calculan el mismo
  // índice de inserción y el segundo se cuela delante del primero.
  const detrasDe = new Map<MemberGroup, number>();
  let pendientes = [...free];

  // Pasadas mientras haya progreso: un libre anclado a otro libre solo se puede
  // colocar cuando el otro ya está en `resultado`. La primera pasada sin
  // progreso corta el bucle, y es también lo que impide que un ciclo cuelgue.
  for (;;) {
    const atascados: MemberGroup[] = [];
    let huboCambios = false;

    for (const g of pendientes) {
      const w = g.sagaId === null ? undefined : windows[`s:${g.sagaId}`];
      // `after` manda sobre `before`: «a partir de X» sitúa el bloque, mientras
      // que «antes de Y» solo pone un techo.
      const lado = w?.afterKey != null ? "after" : w?.beforeKey != null ? "before" : null;
      const clave = lado === "after" ? w!.afterKey! : lado === "before" ? w!.beforeKey! : null;
      const ancla = clave === null ? undefined : bloqueDeClave.get(clave);
      // -1 cubre tres casos de una vez, y a propósito: sin ventana, ancla rota
      // (apunta a algo que no está en el mapa) y ancla que todavía no se ha
      // colocado —incluido el bloque anclado a sí mismo—.
      const donde = ancla === undefined ? -1 : resultado.indexOf(ancla);
      if (donde === -1) {
        atascados.push(g);
        continue;
      }

      if (lado === "after") {
        const ya = detrasDe.get(ancla!) ?? 0;
        resultado.splice(donde + 1 + ya, 0, g);
        detrasDe.set(ancla!, ya + 1);
      } else {
        // `before` no necesita contador: insertar en el índice del ancla empuja
        // el ancla hacia abajo, así que el siguiente cae detrás del anterior y
        // el orden relativo se conserva solo.
        resultado.splice(donde, 0, g);
      }
      huboCambios = true;
    }

    if (!huboCambios) return [...resultado, ...atascados];
    if (atascados.length === 0) return resultado;
    pendientes = atascados;
  }
}
```

Ampliar el import de tipos de la línea 8 del mismo fichero:

```ts
import type { DetailMember, ResolvedWindow, SagaChildRef, SagaPlacement } from "./types";
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/group-members.test.ts
```

Esperado: PASS, los 9 tests nuevos verdes y ninguno de los viejos en rojo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/group-members.ts src/lib/sagas/group-members.test.ts
git commit -m "feat(sagas): orderBlocksForLayout coloca cada bloque libre junto a su ancla"
```

---

### Task 2: desacoplar `orderNo` del orden de pintado

Refactor sin cambio de comportamiento: hoy el orden de pintado y el de lectura coinciden, así que los tests existentes son la prueba. Tiene que ir **antes** de la Task 4, porque en cuanto los bloques se reordenen este contador empezaría a mentir.

**Files:**
- Modify: `src/lib/sagas/derive-map.ts:110-129` (comentario y declaración), `:196-204` (extraer el reparto en huecos), `:223-263` (leer en vez de incrementar)
- Test: `src/lib/sagas/derive-map.test.ts` (ninguno nuevo — los existentes son la red)

**Interfaces:**
- Produces: nada público. `huecosDe` es privada al módulo.

- [ ] **Step 1: Extraer el reparto en huecos a una función del módulo**

Las líneas 192-204 de `derive-map.ts` reparten los miembros en huecos dentro del `forEach`. La pre-pasada necesita el mismo reparto, y repetirlo es exactamente cómo se desincronizan dos cálculos del mismo dato. Añadir antes de `deriveSagaMap` (después de `NODE_STEP_Y`, línea 65):

```ts
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
```

No hace falta tocar imports: `derive-map.ts:3` ya trae `type MemberGroup` y `:5` ya trae `DetailMember`.

- [ ] **Step 2: Sustituir el contador por la pre-pasada**

Reemplazar el bloque de comentario y la declaración de las líneas 113-129 (`// Task 9: el mapa salía como una escalera…` hasta `let orderCounter = 0;`) por:

```ts
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
```

- [ ] **Step 3: Que el pintado lea el mapa en vez de incrementar**

En el cuerpo del `forEach` (líneas 192-263), tres cambios:

Reemplazar el reparto en huecos (las líneas que van de `const chained = group.members.filter(…)` hasta el cierre del `for (const m of chained)`) por:

```ts
    // Una obra SIN hueco (`position === null`: `libre` o sin clasificar, lo
    // impone el CHECK saga_items_placement_position) SÍ es un nodo del mapa,
    // pero no forma parte de la cadena: ni abre ni cierra huecos, y ninguna
    // arista `principal` la toca (hallazgo 1 de la revisión — antes se agrupaba
    // una a una como si cada una fuera su propio hueco encadenado).
    const loose = group.members.filter((m) => m.position === null);
    const huecos = huecosDe(group);
```

Reemplazar la línea 236, que construye el nodo, por:

```ts
        const node = {
          ...makeNode(m, x, rowCursor + memberIdx, orderNoDeCadaObra.get(itemKey(m)) ?? null),
          tandem: tandemMeta,
        };
```

Y borrar la línea `orderCounter++;` del final del `huecos.forEach` (línea 262), dejando solo `x++;`.

- [ ] **Step 4: Correr toda la suite de sagas**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/
```

Esperado: PASS, sin ningún cambio. En particular tiene que seguir verde `derive-map.test.ts:540` («fija el valor exacto de orderNo del segundo bloque para atrapar un futuro acoplamiento con x»), que es el test escrito precisamente para este acoplamiento.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-map.ts
git commit -m "refactor(sagas): orderNo se calcula en orden de lectura, no de pintado"
```

---

### Task 3: la cadena entre bloques deja de mirar un índice

Segundo refactor sin cambio de comportamiento, y por el mismo motivo: hoy `blocks` es literalmente `[...ordered, ...free]`, así que las dos formas de preguntarlo coinciden. En cuanto los libres se intercalen, dejan de coincidir.

**Files:**
- Modify: `src/lib/sagas/derive-map.ts:265-295`
- Test: `src/lib/sagas/derive-map.test.ts` (ninguno nuevo — `:413` es la red)

- [ ] **Step 1: Cambiar el predicado**

Reemplazar el comentario y la condición de las líneas 265-272 por:

```ts
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
```

- [ ] **Step 2: Quitar el parámetro que ya no se usa**

La firma del callback en la línea 177 pasa de `blocks.forEach((group, y) => {` a:

```ts
  blocks.forEach((group) => {
```

- [ ] **Step 3: Correr toda la suite de sagas**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/
```

Esperado: PASS, sin cambios. El test clave es `derive-map.test.ts:413` («un bloque libre no se une a la cadena: flota, solo lo conectan sus ventanas»).

- [ ] **Step 4: Comprobar que no queda ningún uso del índice**

```bash
grep -n "ordered.length" src/lib/sagas/derive-map.ts
```

Esperado: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-map.ts
git commit -m "refactor(sagas): la cadena entre bloques pregunta por el placement, no por el índice"
```

---

### Task 4: cablear B — los bloques libres suben junto a su ancla

Primera tarea con cambio visible.

**Files:**
- Modify: `src/lib/sagas/derive-map.ts:90-91`
- Test: `src/lib/sagas/derive-map.test.ts` (un test nuevo)

**Interfaces:**
- Consumes: `orderBlocksForLayout` (Task 1)

- [ ] **Step 1: Escribir el test que falla**

Añadir dentro del `describe("deriveSagaMap")` de `derive-map.test.ts`, justo después del test de la línea 245 («un bloque SIN sueltas no deja una fila vacía detrás»):

```ts
  it("un bloque libre con ancla sube a la fila siguiente a la de su ancla, en vez de al final", () => {
    // El nudo de la captura del 2026-07-28: el bloque libre se dibujaba al final
    // y su arista de ventana cruzaba el lienzo entero para llegar a su ancla,
    // varias filas más arriba. Ahora la arista es corta y casi vertical.
    const map = deriveSagaMap(
      groups([
        block("Uno", 1, [work("A", 1)]),
        block("Dos", 2, [work("B", 1)]),
        block("Tres", 3, [work("C", 1)]),
        freeBlock("Libre", [work("L", 1)]),
      ]),
      { "s:saga-Libre": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null, reason: null } },
      lookup(),
    );
    const fila = (id: string) => map.nodes.find((n) => n.id === id)!.y / NODE_STEP_Y;
    expect(fila("i:book:A")).toBe(0);
    expect(fila("i:book:L")).toBe(1);
    expect(fila("i:book:B")).toBe(2);
    expect(fila("i:book:C")).toBe(3);
  });

  it("subir de fila NO mueve el orderNo: el timeline de móvil sigue leyendo lo libre al final", () => {
    // `orderNo` es orden de LECTURA, no de pintado (Task 2). Un bloque libre
    // dibujado en la fila 1 se sigue leyendo el último: si las dos cosas se
    // acoplaran, curar una ventana reordenaría el timeline de móvil sin que
    // nadie lo pidiera.
    const map = deriveSagaMap(
      groups([
        block("Uno", 1, [work("A", 1)]),
        block("Dos", 2, [work("B", 1)]),
        freeBlock("Libre", [work("L", 1)]),
      ]),
      { "s:saga-Libre": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null, reason: null } },
      lookup(),
    );
    const orden = (id: string) => map.nodes.find((n) => n.id === id)!.orderNo;
    expect(orden("i:book:A")).toBe(0);
    expect(orden("i:book:B")).toBe(1);
    expect(orden("i:book:L")).toBe(2);
  });
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/derive-map.test.ts -t "sube a la fila siguiente"
```

Esperado: FAIL con `expected 3 to be 1` — el bloque libre sigue dibujándose al final.

- [ ] **Step 3: Cablear**

En `derive-map.ts`, reemplazar las líneas 90-91:

```ts
  const { ordered, free } = partitionGroups(groups);
  const blocks = [...ordered, ...free];
```

por:

```ts
  const { ordered, free } = partitionGroups(groups);
  // Orden de PINTADO (filas), que ya no es el de lectura: un bloque libre con
  // ventana sube junto a su ancla para que esa arista no cruce el lienzo entero.
  // El orden de LECTURA sigue siendo `[...ordered, ...free]`, y es el que usa la
  // pre-pasada de `orderNo` unas líneas más abajo.
  const blocks = orderBlocksForLayout(ordered, free, windows);
```

Y ampliar el import de la línea 3:

```ts
import { orderBlocksForLayout, partitionGroups, type MemberGroup } from "./group-members";
```

- [ ] **Step 4: Correr toda la suite de sagas**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/
```

Esperado: PASS, los dos tests nuevos verdes.

Si algún test viejo cae, será uno que fijaba la **fila** de un bloque `libre` con ancla — el cambio que esta tarea introduce a propósito. Actualízalo con el porqué escrito al lado, nunca en silencio. Un test que caiga fijando una **arista** o un **`orderNo`** NO es esperado: eso es un fallo real, párate y diagnostícalo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-map.ts src/lib/sagas/derive-map.test.ts
git commit -m "feat(sagas): los bloques libres se dibujan junto a su ancla, no al final"
```

---

### Task 5: mover los pasos de rejilla a `graph-metrics.ts`

Preparación de la Task 6, y sola porque es reversible y aburrida. `alignRowsToLongEdges` necesita `NODE_STEP_X`, que hoy vive en `derive-map.ts`; si lo importara de ahí, los dos módulos se importarían mutuamente. `graph-metrics.ts` ya es el sitio donde viven las medidas en píxeles, y su propio comentario de cabecera se queja de que los pasos estén en otro fichero.

**Files:**
- Modify: `src/lib/sagas/graph-metrics.ts`, `src/lib/sagas/derive-map.ts:45-65`

- [ ] **Step 1: Mover las dos constantes**

Cortar de `derive-map.ts` el bloque de comentario y las dos constantes (líneas 45-65, desde `// \`deriveSagaMap\` tiene que devolver coordenadas en PÍXELES…` hasta `export const NODE_STEP_Y = 220;`) y pegarlo al final de `graph-metrics.ts`, tal cual, sin reescribir el comentario.

- [ ] **Step 2: Re-exportar desde `derive-map.ts`**

En el sitio donde estaban, dejar:

```ts
// Los pasos de rejilla viven en graph-metrics.ts, con el resto de medidas en
// píxeles: `layout-map.ts` necesita NODE_STEP_X y si lo importara de aquí los
// dos módulos se importarían mutuamente. Se re-exportan para no romper a quien
// ya los importaba de este módulo.
export { NODE_STEP_X, NODE_STEP_Y } from "./graph-metrics";
```

`derive-map.ts` no importaba nada de `graph-metrics.ts` hasta ahora, así que hay que añadir el import — `makeNode` usa las dos constantes:

```ts
import { NODE_STEP_X, NODE_STEP_Y } from "./graph-metrics";
```

Un módulo puede importar y re-exportar el mismo símbolo sin problema: la re-exportación es para quien ya lo importaba de aquí (`derive-map.test.ts:3`), y el import es para el propio `makeNode`.

- [ ] **Step 3: Correr toda la suite de sagas**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/
```

Esperado: PASS, sin cambios. `derive-map.test.ts:3` importa `NODE_STEP_Y` de `./derive-map` y la re-exportación lo mantiene funcionando; los tests de las líneas 372 y 380 fijan los valores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sagas/graph-metrics.ts src/lib/sagas/derive-map.ts
git commit -m "refactor(sagas): NODE_STEP_X/Y viven con el resto de medidas en píxeles"
```

---

### Task 6: `alignRowsToLongEdges` — alinear columnas por las aristas largas

Función pura y aislada, con su fichero y sus tests. Todavía sin cablear.

**Files:**
- Create: `src/lib/sagas/layout-map.ts`
- Test: `src/lib/sagas/layout-map.test.ts`

**Interfaces:**
- Consumes: `SagaGraph`, `SagaGraphNode`, `SagaGraphEdge` (`map-types.ts`), `NODE_STEP_X` (`graph-metrics.ts`, tras la Task 5)
- Produces: `alignRowsToLongEdges(graph: SagaGraph): SagaGraph` y `export const MAX_COL_OFFSET = 4`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/sagas/layout-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NODE_STEP_X, NODE_STEP_Y } from "./graph-metrics";
import { alignRowsToLongEdges, MAX_COL_OFFSET } from "./layout-map";
import type { SagaGraph, SagaGraphEdge, SagaGraphNode } from "./map-types";

const nodo = (id: string, bloque: string | null, col: number, row: number): SagaGraphNode => ({
  id,
  kind: "item",
  x: col * NODE_STEP_X,
  y: row * NODE_STEP_Y,
  level: "principal",
  // Nodo de CADENA por defecto: `orderNo` no nulo. Una obra SUELTA (sin hueco)
  // es la que lleva `orderNo: null`, y esa es la señal por la que la Task 7 las
  // reconoce para reordenarlas. Los tests de sueltas lo sobrescriben.
  orderNo: 0,
  label: id,
  accent: "beige",
  status: null,
  role: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: bloque,
  groupName: bloque,
  step: null,
  tandem: null,
  windowReason: null,
  optional: false,
  skipped: false,
  ownerSagaId: "owner",
});

const arista = (source: string, target: string, type: SagaGraphEdge["type"]): SagaGraphEdge => ({
  id: `${type}:${source}->${target}`,
  source,
  target,
  type,
  accent: "beige",
});

const col = (g: SagaGraph, id: string) => g.nodes.find((n) => n.id === id)!.x / NODE_STEP_X;

describe("alignRowsToLongEdges", () => {
  it("una arista de ventana alinea el bloque de abajo bajo su ancla", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "uno", 1, 0), nodo("l", "libre", 0, 1)],
      edges: [arista("b", "l", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "l")).toBe(1);
    // El de arriba no se mueve: es el primero que se coloca.
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(1);
  });

  it("una arista de cadena NO alinea: la cadena se queda compacta en la columna 0", () => {
    // Es lo que protege el modelo compacto que documenta `derive-map.ts:113`
    // («una fila por bloque, compacta»). Alinear por `principal` devuelve la
    // escalera diagonal que aquella decisión mató.
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "uno", 1, 0), nodo("c", "dos", 0, 1)],
      edges: [arista("b", "c", "principal")],
    };
    expect(col(alignRowsToLongEdges(graph), "c")).toBe(0);
  });

  it("un salto de itinerario también alinea", () => {
    // OJO con los fixtures: la normalización final resta el mínimo `x` de TODO
    // el grafo, así que un bloque de arriba que empiece en la columna 2 haría
    // que al final todo se desplazara de vuelta y el test mediría 0. Un bloque
    // real SIEMPRE tiene un nodo en la columna 0 (`x` se reinicia por bloque),
    // así que los fixtures lo reproducen con un nodo ancla en la columna 0.
    const graph: SagaGraph = {
      nodes: [nodo("a0", "uno", 0, 0), nodo("a", "uno", 2, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "itinerario")],
    };
    expect(col(alignRowsToLongEdges(graph), "z")).toBe(2);
  });

  it("mueve el bloque ENTERO: un tándem no se desapila", () => {
    // Las dos obras de un tándem comparten columna en filas distintas. Mover una
    // fila suelta las separa y deshace lo que arregló la fase 2.
    const graph: SagaGraph = {
      nodes: [
        nodo("a0", "uno", 0, 0),
        nodo("a", "uno", 1, 0),
        nodo("t1", "dos", 0, 1),
        nodo("t2", "dos", 0, 2),
        nodo("suelta", "dos", 0, 3),
      ],
      edges: [arista("a", "t1", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "t1")).toBe(1);
    expect(col(out, "t2")).toBe(1);
    expect(col(out, "suelta")).toBe(1);
  });

  it("con varias anclas aplica la MEDIANA, no la media", () => {
    // Una mediana aguanta un ancla rara en un extremo; una media se la lleva.
    // Deltas: 1, 1 y 4 → mediana 1. Con media saldría 2.
    const graph: SagaGraph = {
      nodes: [
        nodo("p0", "uno", 0, 0),
        nodo("p", "uno", 1, 0),
        nodo("q", "dos", 1, 1),
        nodo("r", "tres", 4, 2),
        nodo("x", "cuatro", 0, 3),
      ],
      edges: [arista("p", "x", "requisito"), arista("q", "x", "requisito"), arista("r", "x", "requisito")],
    };
    expect(col(alignRowsToLongEdges(graph), "x")).toBe(1);
  });

  it("el offset se recorta a MAX_COL_OFFSET", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a0", "uno", 0, 0), nodo("a", "uno", 9, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    expect(col(alignRowsToLongEdges(graph), "z")).toBe(MAX_COL_OFFSET);
  });

  it("un ancla a la IZQUIERDA no empuja el bloque a columnas negativas", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("z", "dos", 3, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    // El offset es absoluto y se recorta a [0, MAX_COL_OFFSET]: el bloque de
    // abajo se queda donde estaba, no se arrastra a la izquierda del lienzo.
    expect(col(alignRowsToLongEdges(graph), "z")).toBe(3);
  });

  it("normaliza: el mapa vuelve a empezar en la columna 0", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 2, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(Math.min(...out.nodes.map((n) => n.x))).toBe(0);
  });

  it("una arista larga DENTRO del mismo bloque no lo mueve", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "uno", 3, 1)],
      edges: [arista("b", "a", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(3);
  });

  it("sin aristas largas el grafo sale como entró", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "dos", 1, 1)],
      edges: [arista("a", "b", "principal")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(out.nodes.map((n) => n.x)).toEqual(graph.nodes.map((n) => n.x));
  });

  it("un grafo vacío no revienta", () => {
    expect(alignRowsToLongEdges({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });

  it("no muta el grafo que recibe", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 2, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    alignRowsToLongEdges(graph);
    expect(graph.nodes.find((n) => n.id === "z")!.x).toBe(0);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/layout-map.test.ts
```

Esperado: FAIL, `Failed to resolve import "./layout-map"`.

- [ ] **Step 3: Implementar**

Crear `src/lib/sagas/layout-map.ts`:

```ts
import { NODE_STEP_X } from "./graph-metrics";
import type { SagaGraph, SagaGraphNode } from "./map-types";

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
 *  («una fila por bloque, compacta»). Con el tope, el ancho
 *  es «el del bloque más largo, más 4». */
export const MAX_COL_OFFSET = 4;

/** Aristas que cruzan el lienzo, y por tanto las únicas que vale la pena
 *  enderezar. `principal` (la cadena) queda fuera a propósito: alinear por ella
 *  reproduce esa misma escalera, y además casi nunca cruza — une huecos
 *  consecutivos, que ya están al lado. */
const TIPOS_LARGOS = new Set(["requisito", "opcional", "itinerario"]);

/** Identidad del bloque al que pertenece un nodo. `groupSagaId` es null en el
 *  grupo de miembros directos («Nexo»), y solo puede haber uno, así que la
 *  cadena centinela no colisiona con ningún uuid. */
const bloqueDe = (n: SagaGraphNode): string => n.groupSagaId ?? "\u0000nexo";

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
  if (graph.nodes.length === 0) return graph;

  const nodosDeBloque = new Map<string, SagaGraphNode[]>();
  const bloqueDeNodo = new Map<string, string>();
  for (const n of graph.nodes) {
    const clave = bloqueDe(n);
    bloqueDeNodo.set(n.id, clave);
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
  const colocados = new Set<string>();

  for (const [clave, lista] of bloques) {
    const deltas: number[] = [];
    for (const n of lista) {
      for (const otro of vecinos.get(n.id) ?? []) {
        const suBloque = bloqueDeNodo.get(otro);
        if (suBloque === undefined || suBloque === clave || !colocados.has(suBloque)) continue;
        deltas.push((xFinal.get(otro)! - n.x) / NODE_STEP_X);
      }
    }
    const bruto = deltas.length === 0 ? 0 : Math.round(mediana(deltas));
    const offset = Math.min(Math.max(bruto, 0), MAX_COL_OFFSET);
    for (const n of lista) xFinal.set(n.id, n.x + offset * NODE_STEP_X);
    colocados.add(clave);
  }

  // El mapa vuelve a empezar en la columna 0: React Flow encuadra con `fitView`,
  // pero un lienzo que empieza en la 3 desplaza también el mini-preview del CTA,
  // que no encuadra.
  const minimo = Math.min(...graph.nodes.map((n) => xFinal.get(n.id)!));
  return {
    nodes: graph.nodes.map((n) => ({ ...n, x: xFinal.get(n.id)! - minimo })),
    edges: graph.edges,
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/layout-map.test.ts
```

Esperado: PASS, los 12 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/layout-map.ts src/lib/sagas/layout-map.test.ts
git commit -m "feat(sagas): alignRowsToLongEdges alinea columnas por las aristas que cruzan"
```

---

### Task 7: las obras sueltas se ordenan por su ancla

Última pieza de B, y va aquí y no en la Task 1 porque necesita la columna FINAL de las anclas, que no se sabe hasta que la Task 6 ha colocado los bloques. Segunda fase dentro de `alignRowsToLongEdges`.

Una fila de sueltas se reconoce sin ambigüedad: son los únicos nodos con `orderNo === null` (`derive-map.ts:311`, `makeNode(m, i, looseRow, null)`), y su fila va siempre DESPUÉS de las de la cadena de su bloque, así que ninguna fila mezcla sueltas con encadenadas.

**Files:**
- Modify: `src/lib/sagas/layout-map.ts`
- Test: `src/lib/sagas/layout-map.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir dentro del `describe("alignRowsToLongEdges")` de `layout-map.test.ts`:

```ts
  it("dos sueltas de la misma fila se ordenan por la columna de su ancla", () => {
    // Las sueltas no tienen hueco, así que su orden entre ellas era el del
    // título: arbitrario respecto a dónde están sus anclas. Ordenarlas por la
    // columna del ancla evita que sus aristas se crucen entre sí.
    const graph: SagaGraph = {
      nodes: [
        nodo("izq", "uno", 0, 0),
        nodo("der", "uno", 2, 0),
        // `a` va antes que `b` por título, pero el ancla de `a` está a la
        // derecha y la de `b` a la izquierda: sus aristas se cruzan.
        { ...nodo("a", "uno", 0, 1), orderNo: null },
        { ...nodo("b", "uno", 1, 1), orderNo: null },
      ],
      edges: [arista("der", "a", "requisito"), arista("izq", "b", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "b")).toBe(0);
    expect(col(out, "a")).toBe(1);
  });

  it("dos sueltas sin ancla conservan el orden que traían", () => {
    const graph: SagaGraph = {
      nodes: [
        nodo("cadena", "uno", 0, 0),
        { ...nodo("a", "uno", 0, 1), orderNo: null },
        { ...nodo("b", "uno", 1, 1), orderNo: null },
      ],
      edges: [],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(1);
  });

  it("las sueltas de bloques distintos no se mezclan entre sí", () => {
    const graph: SagaGraph = {
      nodes: [
        { ...nodo("a", "uno", 0, 0), orderNo: null },
        { ...nodo("b", "dos", 0, 1), orderNo: null },
      ],
      edges: [],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(0);
  });
```

El helper `nodo()` de la Task 6 ya deja `orderNo: 0` (nodo de cadena), así que el `{ ...nodo(...), orderNo: null }` de estos tres tests es lo que marca una obra suelta. Los demás tests del fichero siguen siendo de cadena y la segunda fase no los toca.

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/layout-map.test.ts -t "se ordenan por la columna de su ancla"
```

Esperado: FAIL con `expected 1 to be 0` — hoy nadie reordena las sueltas.

- [ ] **Step 3: Implementar la segunda fase**

En `layout-map.ts`, insertar entre el bucle `for (const [clave, lista] of bloques)` y el cálculo de `minimo`:

```ts
  // Segunda fase: dentro de una FILA DE SUELTAS, ordenar por la columna del
  // ancla. Las sueltas no tienen hueco, así que su orden entre ellas lo fijaba
  // el título — arbitrario respecto a dónde están sus anclas, y por tanto sus
  // aristas de ventana se cruzaban entre sí sin ninguna razón.
  //
  // Se reconocen por `orderNo === null`, que es exactamente lo que
  // `deriveSagaMap` le pone a una obra sin hueco. Su fila va siempre después de
  // las de la cadena de su bloque, así que ninguna fila mezcla las dos cosas y
  // agrupar por `y` es seguro.
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
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/layout-map.test.ts
```

Esperado: PASS, los 15 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/layout-map.ts src/lib/sagas/layout-map.test.ts
git commit -m "feat(sagas): las obras sueltas se ordenan por la columna de su ancla"
```

---

### Task 8: cablear A — el post-pase entra en `deriveSagaMap`

**Files:**
- Modify: `src/lib/sagas/derive-map.ts:466-475` (el final de la función)
- Test: `src/lib/sagas/derive-map.test.ts` (un test de integración nuevo)

**Interfaces:**
- Consumes: `alignRowsToLongEdges` (Tasks 6 y 7)

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `derive-map.test.ts`, en su propio `describe`:

```ts
describe("deriveSagaMap — alineación de columnas (el nudo de la captura)", () => {
  it("el bloque libre sube junto a su ancla Y se alinea bajo su columna", () => {
    // Escenario reducido de la captura del 2026-07-28: un bloque colocado de
    // tres obras, otro detrás, y un bloque libre anclado a la ÚLTIMA obra del
    // primero. Antes el libre se dibujaba al final y en la columna 0, así que su
    // arista salía en diagonal desde la columna 2 de la primera fila hasta la
    // columna 0 de la última, cruzando todo lo de en medio. Ahora sale vertical.
    const map = deriveSagaMap(
      groups([
        block("Uno", 1, [work("A", 1), work("B", 2), work("C", 3)]),
        block("Dos", 2, [work("D", 1)]),
        freeBlock("Libre", [work("L", 1)]),
      ]),
      { "s:saga-Libre": { afterKey: "i:book:C", afterTitle: "C", beforeKey: null, beforeTitle: null, reason: null } },
      lookup(),
    );
    const c = map.nodes.find((n) => n.id === "i:book:C")!;
    const l = map.nodes.find((n) => n.id === "i:book:L")!;
    // Misma columna que su ancla: la arista de ventana es vertical.
    expect(l.x).toBe(c.x);
    // Y la fila justo debajo, no el fondo del mapa.
    expect(l.y - c.y).toBe(NODE_STEP_Y);
  });

  it("la cadena de un bloque sin aristas largas sigue empezando en la columna 0", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1), work("B", 2)]), block("Dos", 2, [work("C", 1)])]),
      {},
      lookup(),
    );
    expect(map.nodes.find((n) => n.id === "i:book:A")!.x).toBe(0);
    expect(map.nodes.find((n) => n.id === "i:book:C")!.x).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test -- src/lib/sagas/derive-map.test.ts -t "se alinea bajo su columna"
```

Esperado: FAIL — `l.x` es 0 y `c.x` es 360.

- [ ] **Step 3: Cablear el post-pase**

Reemplazar el final de `deriveSagaMap` (líneas 466-475, desde `// Mismo orden estable que buildSagaGraph…` hasta el `return`) por:

```ts
  // Alineación de columnas, AL FINAL y no antes: necesita las aristas de ventana
  // y de itinerario, que se acaban de construir, y necesita que `step` y
  // `windowReason` ya estén puestos en los nodos — el post-pase devuelve nodos
  // NUEVOS, así que cualquier mutación posterior sobre los viejos se perdería.
  const alineado = alignRowsToLongEdges({ nodes, edges });

  // Mismo orden estable que buildSagaGraph: order_no (nulls al final), luego label.
  alineado.nodes.sort((a, b) => {
    const oa = a.orderNo ?? Number.MAX_SAFE_INTEGER;
    const ob = b.orderNo ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label);
  });

  return alineado;
```

Y añadir el import:

```ts
import { alignRowsToLongEdges } from "./layout-map";
```

- [ ] **Step 4: Correr toda la suite**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run test
```

Esperado: PASS entera, no solo `src/lib/sagas/`. `derive-timeline.test.ts` y `map-overlays.test.ts` consumen el mismo `SagaGraph` y son la red de que el post-pase no les ha movido el suelo.

Los cuatro tests de `derive-map.test.ts:479-560` («x se reinicia por bloque; orderNo sigue siendo global y creciente») tienen que seguir verdes **sin tocarlos**: ninguno tiene ventanas, así que su offset sale 0. Si alguno cae, el post-pase está alineando por aristas `principal` y hay un fallo real en `TIPOS_LARGOS`.

- [ ] **Step 5: Lint y typecheck**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run lint
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/derive-map.ts src/lib/sagas/derive-map.test.ts
git commit -m "feat(sagas): el mapa alinea las columnas de los bloques que una arista larga une"
```

---

### Task 9: verificación visual sobre la saga de la captura

Los tests fijan coordenadas; nadie ha mirado todavía si el dibujo se lee mejor. Esta tarea existe porque el criterio de éxito del spec es visual y el oráculo elegido no lo cubre.

**Files:** ninguno (verificación)

- [ ] **Step 1: Levantar el dev server, si no hay uno ya**

Ver quién ocupa el puerto 3000 — esto es **PowerShell**, no bash:

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

Si lo ocupa una sesión anterior, `Stop-Process -Id <pid>` antes de arrancar. **No** levantar un segundo servidor en el 3001: la app, los redirects de Supabase y los e2e esperan el 3000, y de ahí salen los "errores raros" (`AGENTS.md`, higiene del entorno).

Comprobar también que `.env.local` está copiado en el worktree; sin él los flujos con login se auto-saltan y una suite verde no prueba nada.

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run dev
```

- [ ] **Step 2: Abrir el mapa de la saga Cosmere y comparar con la captura**

Ruta: `/saga/<id del Cosmere>`, pestaña del mapa. La captura original está en
`D:\Proyectos\Personal\fallos\Captura de pantalla 2026-07-28 174846.jpg`.

Qué mirar, en este orden:
1. Los bloques libres (los que llevan la píldora «VENTANA · RECOMENDADA») están junto a su ancla, no al fondo.
2. Sus aristas punteadas son cortas y casi verticales, no diagonales que cruzan el lienzo.
3. Los tándems siguen apilados, con sus dos portadas en la misma columna.
4. El ancho del dibujo no se ha disparado: sigue cabiendo con `fitView` sin que las portadas queden minúsculas.

- [ ] **Step 3: Anotar lo que no cuadre como issue, no como arreglo aquí**

Si el dibujo mejora pero queda algún nudo, **abrir issue** con la captura del antes y el después. No encadenar el arreglo a esta rama: la haría irrevisable (`AGENTS.md`).

---

### Task 10: cerrar la doc y abrir lo que queda

**Files:**
- Modify: `docs/requirements/decisiones.md` (añadir al final, append-only)

- [ ] **Step 1: Añadir la entrada de decisión**

Al **final** de `docs/requirements/decisiones.md`, sin reescribir ninguna entrada anterior:

```markdown
## 2026-07-28 — El mapa 2D coloca los bloques libres junto a su ancla

Un bloque `libre` se dibujaba siempre al final del mapa, así que su arista de ventana cruzaba el
lienzo entero para llegar a su ancla. Ahora `orderBlocksForLayout` (`group-members.ts`) lo intercala
junto a su ancla, y `alignRowsToLongEdges` (`layout-map.ts`) alinea su columna bajo la del ancla.

Dos consecuencias que se asumen a sabiendas:

- **La zona `libre` deja de ser una franja al final del mapa.** Se distingue por el marco y la
  píldora «VENTANA · RECOMENDADA» que el sujeto de una ventana ya llevaba, no por su posición.
- **`orderNo` se desacopla del orden de pintado.** Sigue siendo el orden de LECTURA
  (`[...ordered, ...free]`), porque lo consume `deriveTimeline` para el timeline de móvil. El mapa 2D
  puede por tanto dibujar arriba un bloque que el timeline lista al final.

Se descartó un motor de layout (dagre, elkjs): minimizar cruces con Sugiyama exige permutar capas, y
eso destruye el modelo «una fila = un bloque» que documenta `derive-map.ts:113`.
```

- [ ] **Step 2: Abrir la issue del riesgo mapa/timeline**

```bash
gh issue create \
  --title "El mapa 2D y el timeline de móvil pueden colocar el mismo bloque libre en sitios distintos" \
  --body "$(cat <<'EOF'
Desde 2026-07-28 (spec `docs/superpowers/specs/2026-07-28-sagas-mapa-menos-cruces-design.md`), el
mapa 2D dibuja un bloque `libre` junto a su ancla en vez de al final, para que su arista de ventana
no cruce el lienzo. `orderNo` NO le sigue: se calcula en orden de lectura (`[...ordered, ...free]`)
porque lo consume `deriveTimeline` para el timeline de móvil.

**Qué se espera:** que las dos vistas cuenten la misma historia sobre el mismo bloque.

**Qué pasa:** el mapa 2D puede dibujar arriba (fila 1, junto a su ancla) un bloque que el timeline de
móvil lista el último. Son dos afirmaciones distintas —dónde se dibuja vs en qué orden se lee— pero
un usuario puede leerlas como una contradicción.

**Cómo reproducirlo:** una saga con dos o más bloques colocados y un bloque libre con ventana anclada
al primero. En escritorio, el libre sale en la segunda fila del mapa; en móvil, al final de la lista.

**Qué acota el problema:** no es un bug de datos ni de derivación. `deriveSagaMap` y `deriveTimeline`
leen el mismo `SagaGraph` y ninguno de los dos está mal por su cuenta. La decisión de desacoplarlos
está razonada en `docs/requirements/decisiones.md` (entrada del 2026-07-28): acoplar `orderNo` al
pintado rompería el timeline de móvil, que es peor.

**Trampa:** no "arreglarlo" haciendo que `orderNo` siga al orden de pintado. Hay un test que lo
protege — `derive-map.test.ts`, "subir de fila NO mueve el orderNo".
EOF
)"
```

- [ ] **Step 3: Abrir la issue de la lente**

```bash
gh issue create \
  --title "Lente para ocultar las capas de ventana e itinerario en el mapa 2D" \
  --body "$(cat <<'EOF'
El trabajo descartado en el spec `docs/superpowers/specs/2026-07-28-sagas-mapa-menos-cruces-design.md`
(sección «Lo que NO se hace, y por qué»), anotado para que no se pierda.

Las aristas de ventana (`requisito`/`opcional`) y los saltos de itinerario son **capas encima** del
mapa, no el mapa. Ocultarlas por defecto y mostrarlas al hacer hover o foco sobre un nodo —o con un
toggle en la leyenda— elimina el nudo visual sin mover un solo nodo.

**Por qué no se hizo entonces:** resuelve el síntoma escondiendo información, y se prefirió atacar la
colocación primero. Hecho eso, esto sigue mereciendo la pena: sobre una saga grande, la capa de
itinerario sola ya produce cruces que ninguna colocación puede evitar.

**Dónde:** `src/components/saga/graph/saga-graph-view.tsx` (ya hay precedente de lente: la de roles
viaja EN EL DATO del nodo, porque React Flow no propaga props a los nodos custom) y
`graph-legend.tsx`.
EOF
)"
```

- [ ] **Step 4: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(sagas): decisión sobre la colocación de los bloques libres en el mapa"
```

- [ ] **Step 5: Abrir la PR**

```bash
git push -u origin sagas-mapa-menos-cruces
gh pr create --draft --title "Sagas: menos cruces de aristas en el mapa 2D" --body "$(cat <<'EOF'
Los bloques `libre` se dibujaban al final del mapa aunque su ancla estuviera en la primera fila, así
que sus aristas de ventana cruzaban el lienzo entero. Esta rama coloca cada bloque libre junto a su
ancla y alinea su columna bajo la del ancla.

Dos funciones puras nuevas, partidas por lo que cada una necesita saber:

- `orderBlocksForLayout` (`group-members.ts`) — antes del reparto de filas, con la semántica de
  grupos delante.
- `alignRowsToLongEdges` (`layout-map.ts`) — después de construir las aristas, porque las de ventana
  e itinerario no existen antes. Solo mira nodos y aristas.

Y dos acoplamientos que se van de `derive-map.ts`: un índice que hacía de predicado
(`y < ordered.length`) y un contador que mezclaba orden lógico con orden de pintado (`orderNo`).

Sin dependencias nuevas: se descartó dagre/elkjs porque minimizar cruces con Sugiyama destruye el
modelo «una fila = un bloque». Los cuatro tests que fijan ese modelo (`derive-map.test.ts:479-560`)
siguen verdes sin tocarlos.

Spec: `docs/superpowers/specs/2026-07-28-sagas-mapa-menos-cruces-design.md`
Plan: `docs/superpowers/plans/2026-07-28-sagas-mapa-menos-cruces.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
