# Task 4 — El orden principal sale de la secuencia (informe)

## Firma de `createCuratedOrder`

`src/lib/sagas/curated-order.ts`:

```ts
export function createCuratedOrder(
  sagas: OrderSaga[],
  memberships: OrderMembership[],
  titleOf: (key: string) => string,
): (rootId: string) => string[]
```

`OrderSaga` ganó dos campos respecto al viejo `main-order.ts`:

```ts
export type OrderSaga = {
  id: string;
  name: string;
  parentSagaId: string | null;
  positionInParent: number | null;
  placementInParent: SagaPlacement | null;
};
```

`OrderMembership` e `itemKey` se mudaron tal cual. `OrderNode` no se mudó: se borró con el resto del grafo.

## Qué copié literalmente y qué cambié

El cuerpo de `createCuratedOrder` es la rama «sin grafo» de `createMainOrder` (el bloque `else` que antes vivía dentro de `walk`, ejecutado cuando `sagaNodes.length === 0`): mismo `visited` compartido por toda la recursión, mismo `MAX_DEPTH = 4`, mismo orden de miembros directos (`position`, luego `titleOf(...).localeCompare(...)`), mismo `new Set(...)` de deduplicación final. Lo pegué del fichero original y solo quité la rama `if (sagaNodes.length > 0)` entera (grafo) y sus dependencias (`OrderNode`, `nodesBySaga`, `memberKeys`).

El único cambio de comportamiento, tal como pedía el brief, es el comparador de hijas:

- **Antes** (heurística vieja, issue #204): `minPos(a.id) - minPos(b.id)` — el `position` mínimo entre los miembros de cada hija, con desempate por nombre.
- **Ahora**: `position_in_parent` ascendente cuando ambas hijas lo tienen, desempate por nombre; si solo una lo tiene, esa va primero; si ninguna lo tiene (incluye toda hija `libre`, porque el CHECK de la migración `20260725_saga_placement_blocks.sql` obliga `placement_in_parent='fijo' ⇔ position_in_parent IS NOT NULL`), cae al `minPos` viejo como **desempate**, no como criterio principal — igual que `childGroups` en `group-members.ts`. Lo copié literalmente de ahí (mismas cuatro ramas del `sort`), como pedía el brief.

## Tabla de inyección de fallo (Step 2, `curated-order.test.ts`)

| Mutación aplicada | Test que debía caer | Resultado |
|---|---|---|
| 1. Comparador de hijas vuelto al viejo (`minPos(a.id) - minPos(b.id)`, sin mirar `positionInParent`) | `las hijas van por su colocación en el padre, no por el hueco mínimo de sus miembros` | **Cayó**, solo ese test. `expected [book:a, book:z] to deeply equal [book:z, book:a]` — los otros 4 tests siguieron en verde. |
| 2. Quitado el «libre detrás» (las dos líneas `if (a.positionInParent !== null) return -1/1`, dejando solo `a.positionInParent! - b.positionInParent!` con coacción de `null` a `0`) | `una hija libre va detrás de las colocadas` | **Cayó**, solo ese test. `expected [book:l, book:f] to deeply equal [book:f, book:l]` — la hija `libre` (positionInParent=null → coacciona a 0) se coló ANTES que la colocada (position=1). Los otros 4 tests siguieron en verde. |

Después de cada mutación restauré el comparador correcto y confirmé `npx vitest run src/lib/sagas/curated-order.test.ts` en verde (5/5) antes de seguir.

Nota sobre el test 2: con el comparador ingenuo más obvio (quitar solo la prioridad y caer al fallback `minPos`), la mutación NO rompía el test porque ambos miembros del caso de ejemplo tienen `position: 1` (empate de `minPos`) y el desempate por nombre («Fija» < «Libre») ya daba el resultado correcto por casualidad. La mutación que sí reproduce el bug real (y la que dejé documentada) es la coacción `null → 0` de la resta directa — el error más plausible si alguien "quita" la lógica explícita de null sin pensarlo. Lo dejo anotado por si un futuro reviewer quiere una inyección distinta.

## Issue #203 — ¿queda cerrada?

**Sí, con un matiz que documento abajo.** `get-followed-sagas.ts` ya no hace su propia consulta a `saga_nodes` (la borré junto con el mapeo `LibNode`); `LibSaga` ahora selecciona `position_in_parent`/`placement_in_parent` de `sagas` (las mismas columnas que usa `get-saga-detail.ts` vía `fetchDescendants`), y tanto `createCuratedOrder` (usado para portadas/«siguiente») como el `sort` local de `children` en `build-library-saga-cards.ts` (usado para asignar el acento de cada bloque en los segmentos de progreso) usan ahora el mismo comparador que `childGroups` en `group-members.ts` — el que pinta la ficha. Verificado con un test dedicado (`el acento por defecto de un bloque sigue su colocación curada...`) que reproduce el caso Cosmere descrito en el comentario original (#198): con el comparador viejo, el bloque con `minPos` más bajo se llevaba el primer acento aunque estuviera colocado DESPUÉS; con el nuevo, gana la colocación curada.

El matiz: la card y la ficha comparten ahora el comparador, pero siguen siendo dos implementaciones separadas de la misma lógica (una en `curated-order.ts`/`build-library-saga-cards.ts`, otra en `group-members.ts`) — no hay una única función exportada que ambas llamen. Si mañana alguien toca una sin tocar la otra, la #203 puede reabrirse en silencio. No lo unifiqué en una sola función porque el brief no lo pedía y las dos firmas son distintas (`OrderSaga`/`LibSaga` vs `SagaChildRef`); lo dejo como duda al final.

## Verificación en navegador

Usé el fixture de seed `[QA Itinerarios] Universo` (`33d7bb93-da3d-4453-a6da-1722beff134d`), que ya tenía justo lo necesario: una hija colocada (`[QA Itinerarios] La Guardia`, `position_in_parent=4`), un itinerario curado (`la-guardia`) con un único paso-bloque apuntando a esa hija, y 3 obras (2 en el bloque, 1 nexo completada). Para verlo en Mi Biblioteca inserté temporalmente una fila en `saga_follows` para el usuario de sesión activa (`bibliosharecollab`) vía SQL — el botón «Seguir esta saga» de la UI no registraba el clic en este entorno de navegador (el mismo problema afectó al toggle ▼ del bloque del itinerario; tuve que hacer ambos clics vía `element.click()` en `javascript_tool` en vez del `computer` tool, que falla porque el panel no compone frames en este entorno) — y la borré al terminar.

- **Card de la saga seguida en Mi Biblioteca** (`/coleccion?tab=sagas`): `[QA Itinerarios] Universo · ◆ Grafo · La Guardia · 1 / 3 leídos · 33% · 1 subsaga · Siguiente: [QA Itinerarios] ¡Guardias! ¡Guardias!`. El «Siguiente» coincide con el orden curado (Nexo completada → bloque La Guardia, primera obra sin terminar).
- **Expansión de un bloque en un itinerario** (`/saga/.../?tab=mapa&ruta=la-guardia`, bloque «01 [QA Itinerarios] La Guardia · 2 obras» expandido): salieron `[QA Itinerarios] ¡Guardias! ¡Guardias!` (position 1) y luego `[QA Itinerarios] Pies de barro` (position 2) — el orden curado, no el viejo orden por grafo (que aquí habría dado lo mismo porque esta saga no tenía nodos, pero confirma que `route-view.tsx` llama a `createCuratedOrder` sin reventar).

**Progreso antes/después** (el punto que el brief pedía mirar con más cuidado): hice `git stash` de todo el cambio de la Task 4 (main-order.ts volvió, saga_nodes volvió a consultarse), esperé el rebuild de Turbopack, y recargué:

| | Ficha (`Tu progreso`) | Card en Mi Biblioteca | Badge `◆ Grafo` en la card |
|---|---|---|---|
| **Antes** (código pre-Task-4, `git stash`) | 33% | 1 / 3 leídos · 33% | **ausente** |
| **Después** (`git stash pop`, código de esta tarea) | 33% | 1 / 3 leídos · 33% | **presente** |

El progreso (33%, 1/3) **no se movió** — como exige la invariante (`countedKeys` en `progress.ts`, no tocado). El único cambio observable fue el badge `◆ Grafo`: antes salía `false` porque `saga_nodes` no tenía filas para esta saga (el grafo viejo estaba vacío); después sale `true` porque mi nueva regla es `hasGraph: tree.length > 0` (el subárbol tiene 3 miembros). Esto es una decisión mía, no algo que el brief pidiera explícitamente — la explico en la siguiente sección.

## Decisiones fuera de lo literal del brief (y dudas)

1. **`hasGraph` en la card de Mi Biblioteca.** El brief no lo menciona, pero al borrar la consulta a `saga_nodes` de `get-followed-sagas.ts` (instrucción explícita del Step 3), el cálculo viejo de `hasGraph` (`nodesBySaga.get(id).length > 0`) se quedaba sin datos. Elegí `hasGraph: tree.length > 0`, razonando así: `deriveSagaMap` (el mapa derivado de la Task 2) convierte CADA miembro del subárbol en un nodo sin filtrar ninguno, así que `graph !== null` (el `hasGraph` de la ficha desde la Task 2) es exactamente "el subárbol tiene algún miembro" — lo mismo que `tree.length > 0`, ya calculado en esta función sin coste extra. Es la lectura más honesta que pude dar sin traer `windows`/`groups` a un fichero que el brief exige mantener puro. **Duda**: esto es un cambio de comportamiento visible (el badge aparece en más sagas que antes, ya que ahora es "tiene contenido" en vez de "un moderador dibujó el grafo viejo a mano") que nadie pidió explícitamente; si el dueño del producto quería que el badge desapareciera del todo hasta que exista una señal derivada del mapa curado, dímelo y lo cambio a `false` fijo.
2. **Comparador duplicado (#203).** Ver la sección de arriba — la card y la ficha ya no discrepan, pero siguen siendo dos copias del mismo comparador. No las unifiqué porque el brief no lo pedía y las firmas de entrada son distintas.
3. **Comentarios en `build-library-saga-cards.ts`** sobre el «caso Mundodisco» (`order` podía salir vacío con `counted` lleno): con el grafo retirado del todo, `order` y `tree` recorren exactamente el mismo árbol, así que ese caso ya no es alcanzable — el código de fallback (`order.length > 0 ? order : tree`, el `?? counted.find(...)`) queda como cinturón defensivo, no como camino vivo. Lo dejé documentado así en vez de borrar el código muerto, porque tocar esa rama no estaba en el alcance del brief y borrar "por si acaso" me pareció más riesgo que beneficio.
4. **Clic no registrado en el navegador de este entorno** (`computer` tool): tanto «Seguir esta saga» como el toggle ▼ del bloque de itinerario no respondían a `computer.left_click` (el panel no composita frames — `screenshot` fallaba con "Browser pane is not displayed"). Tuve que verificar la interacción real disparando `element.click()` vía `javascript_tool`, que sí dispara el `onClick` de React. No es un hallazgo del código de la Task 4, es una limitación del entorno de este agente; lo dejo anotado por si el próximo agente se topa con lo mismo.

## Arreglos tras la revisión

Dos hallazgos de la revisión de esta tarea, corregidos en la misma rama.

### 1 (Important) — test que faltaba para el fallback a `minPos`

El test existente (`build-library-saga-cards.test.ts`, «universo: directos primero, hijas por menor position (sin colocar)…») solo comprobaba `total` y `next.itemId`, que no cambian con el orden de las hijas — así que la sustitución del comparador por la versión «simplificada» sin el fallback a `minPos` (`?? Number.MAX_SAFE_INTEGER` + alfabético directo) pasaba las 533 pruebas sin que ninguna se enterase.

Añadido en `curated-order.test.ts` («dos hijas sin colocar van por minPos, no por orden alfabético (fallback issue #204)»): dos hijas SIN `positionInParent`, con `minPos` que contradice el orden alfabético de sus nombres (`Zeta` con hueco 1, `Alfa` con hueco 9) — solo puede pasar si el fallback a `minPos` sigue vivo.

**Inyección de fallo** (aplicada, confirmada, revertida):

| Mutación aplicada | Test que debía caer | Resultado |
|---|---|---|
| Comparador de hijas sustituido por la versión del reviewer (`?? Number.MAX_SAFE_INTEGER`, sin fallback a `minPos`) en `curated-order.ts` | `dos hijas sin colocar van por minPos, no por orden alfabético (fallback issue #204)` | **Cayó**, solo ese test. `expected [book:a, book:z] to deeply equal [book:z, book:a]` — los otros 5 tests de `curated-order.test.ts` siguieron en verde. Revertido; `npx vitest run src/lib/sagas/curated-order.test.ts` volvió a 6/6. |

### 2 (Minor con dientes) — comparador extraído a una sola función

El comparador de colocación de bloques estaba escrito tres veces (`group-members.ts` → `childGroups`, `curated-order.ts` → `children` dentro de `walk`, `build-library-saga-cards.ts` → `children` para el acento de los segmentos). Extraído a `compareBlocksByPlacement` en `src/lib/sagas/group-members.ts` (dueño natural del vocabulario de bloques: `MemberGroup`, `SagaChildRef`, `childGroups`), con el comentario citando la issue #203 como motivo de que exista una única función.

Firma mínima, sin obligar a construir objetos nuevos: los tres tipos de entrada (`OrderSaga`, `SagaChildRef`, `LibSaga`) ya traen `positionInParent`, `placementInParent` y `name` con esos nombres exactos, así que `compareBlocksByPlacement<T extends BlockPlacement>(a: T, b: T, minPos: (block: T) => number)` se les pasa tal cual — `minPos` entra como función porque cada llamante lo calcula desde una colección de miembros distinta (`DetailMember[]`, `OrderMembership[]`, `LibMembership[]`) y solo se invoca cuando ninguno de los dos bloques tiene colocación.

Los tres llamantes actualizados (`group-members.ts`, `curated-order.ts`, `build-library-saga-cards.ts`) siguen produciendo el mismo orden que antes de la extracción: las 39 pruebas de esos tres ficheros (`group-members.test.ts`, `curated-order.test.ts`, `build-library-saga-cards.test.ts`), incluidas las que fijan los casos #198/#203/#204, siguen en verde sin cambios.

### Verificación

```
$ npx vitest run
 Test Files  66 passed (66)
      Tests  534 passed (534)

$ npx tsc --noEmit
(sin salida — limpio)
```
