# Las ventanas mandan en el orden propuesto

> [Canónico · verificado 2026-07-28] Spec de diseño. La narrativa de *cómo* se implementó
> vive en esta misma carpeta; el estado de hoy manda en el código.

**Problema.** Una ventana (`a partir de X, antes de Y`) hoy se *cuenta* pero no se *usa*:
la ficha la pinta como una frase y el mapa 2D la dibuja como una arista, pero ningún
**orden de lectura** la mira. El itinerario que genera «Generar desde la curación» manda
todo lo `libre` al final, en bloque, ignorando por completo lo que la ventana dice. En el
Cosmere eso significa que *El Aliento de los Dioses* —cuya ventana dice «a partir de
Nacidos de la Bruma Era 1, antes de Juramentada»— aparece el número 15, mucho después de
Juramentada.

**Objetivo.** Que el orden propuesto respete la ventana, y que al hacerlo evite partir un
bloque por la mitad cuando la ventana deja sitio para no hacerlo. Lo `libre` sigue siendo
libre: esto no le da hueco fijo a nadie ni toca `saga_items.position`. Solo cambia dónde
se *propone* leerlo.

---

## 1. Qué NO cambia

- **La ficha.** Las obras y bloques `libre` siguen viviendo en «Cuando quieras», fuera de
  la lista ordenada. Esta fase no toca `saga-info.tsx`.
- **El esquema.** Ni una migración. `saga_placement_windows` ya tiene todo lo que hace
  falta; lo que faltaba era leerlo desde el orden.
- **El progreso.** El denominador sale de la PERTENENCIA (`countedKeys`, progress.ts), no
  del orden. Reordenar no cambia ningún porcentaje.
- **El modelo del mapa.** Sigue habiendo una fila por bloque y el orden de filas lo sigue
  decidiendo `orderBlocksForLayout`. Lo que sí se mueve con estos datos es UNA fila
  (*Novelas secretas*), por el cambio de preferencia de ancla — ver §6, y hay que mirarlo.

## 2. La regla

Un sujeto `libre` **con ventana** se mueve a una posición nueva de la secuencia. Manda el
ancla **`antes de`**: el sujeto se coloca lo más tarde que la ventana permite.

**Si el sujeto es una OBRA** (`i:<tipo>:<uuid>`):

1. Base = justo **antes** del ancla `antes de`.
2. Si esa base parte un bloque por la mitad —es decir, la clave anterior a la base y la
   clave que hay en la base pertenecen al mismo bloque—, la posición retrocede al
   **principio de ese bloque**, pero solo si ahí sigue cumpliendo el `a partir de`.
3. Si retroceder incumpliría el `a partir de`, **se acepta el corte** y se queda en la base.
4. Si solo hay `a partir de`, base = justo **después** de esa ancla, y el ajuste del punto 2
   se aplica hacia delante (al final del bloque que partiría).

**Si el sujeto es un BLOQUE** (`s:<uuid>`): las únicas posiciones candidatas son los
**límites entre bloques** — un bloque nunca se mete dentro de otro. Se elige el límite más
tardío que cumpla las dos anclas; si ninguno cumple las dos, gana el `antes de` (es el ancla
que manda) y el sujeto va al límite que abre el bloque del ancla `antes de`.

Un sujeto `libre` **sin ventana** no se mueve: sigue donde lo deja la curación, al final.

### Por qué `antes de` y no `a partir de`

Decisión del responsable de producto (2026-07-28), no una inferencia. Con los datos de hoy
las dos reglas dan el mismo resultado, porque en el Cosmere las dos anclas de cada ventana
caen en bloques adyacentes. Divergen en cuanto haya bloques intermedios: `a partir de`
adelantaría el sujeto lo máximo posible, `antes de` lo retrasa. Se eligió retrasar.

**Consecuencia obligada:** `orderBlocksForLayout` (group-members.ts) hoy hace lo contrario
—«`after` manda sobre `before`»— y hay que darle la vuelta. Si no, el mapa y el orden de
lectura vuelven a discrepar en cuanto aparezca un bloque intermedio, que es exactamente la
familia de las issues #91 / #203 / #245.

## 3. Arquitectura

Cinco piezas. La regla vive en UNA.

### 3.1 `src/lib/sagas/place-by-window.ts` (nuevo, puro)

La regla del §2, y nada más. No conoce Supabase, ni `MemberGroup`, ni `OrderMembership`:
recibe una secuencia ya construida y la devuelve recolocada.

```ts
/** Solo las claves: el orden no necesita los títulos que `ResolvedWindow` arrastra
 *  para la ficha. `ResolvedWindow` es estructuralmente compatible, así que quien
 *  ya tiene un `Record<string, ResolvedWindow>` lo pasa tal cual. */
export type OrderWindow = { afterKey: string | null; beforeKey: string | null };

/** Una entrada de la secuencia: su clave y el bloque que la emitió. `blockId` es
 *  `null` para un miembro directo de la raíz (el grupo «Nexo»). */
export type OrderUnit = { key: string; blockId: string | null };

export function placeByWindow(
  units: OrderUnit[],
  windows: Record<string, OrderWindow>,
  isFreeSubject: (subjectKey: string) => boolean,
): OrderUnit[];
```

`key` viaja en formato de ENTRADA (`i:<tipo>:<uuid>`), el mismo que usan las ventanas, el
borrador de secuencia y `deriveSagaMap`. Un sujeto `s:<uuid>` selecciona el primer tramo
CONTIGUO de unidades con ese `blockId`; una clave `i:` selecciona una unidad.

**Orden de proceso:** los sujetos se procesan en el orden en que aparecen hoy en `units`, y
cada movimiento se aplica sobre la lista ya movida. Determinista y con test; es también lo
que fija el desempate cuando dos sujetos caen en el mismo punto (conservan su orden previo).

### 3.2 `orderBlocksForLayout` (group-members.ts): dar la vuelta a la preferencia

Una línea: `lado` pasa a preferir `beforeKey` sobre `afterKey`. El contador `detrasDe`
sigue haciendo falta solo para la rama `after`. Con los datos de hoy no mueve nada.

### 3.3 `deriveSagaMap` (derive-map.ts): `orderNo` deja de ir por `[...ordered, ...free]`

La pre-pasada que numera el orden de lectura recorre el resultado de
`orderBlocksForLayout` —el mismo array `blocks` que ya usa para pintar— en vez de
`[...ordered, ...free]`. Esto **cierra el caso real de la issue #245**: hasta hoy el mapa
pintaba *Era 2* en la fila 3 mientras el timeline móvil la numeraba la última.

La pre-pasada solo numera obras CON hueco (`position` no nulo), así que el grano de este
cambio es el bloque, no la obra: un bloque libre sin huecos (*El Aliento de los Dioses*,
*Novelas secretas*) no tiene `orderNo` que mover, y sus obras las sigue colocando el
mecanismo de filas de ventana de `deriveTimeline` (§3.4).

El comentario largo de `derive-map.ts` que explica por qué pintado y lectura son dos
órdenes distintos deja de ser cierto y hay que reescribirlo, no borrarlo: sigue siendo
verdad que `orderNo` no es una coordenada.

### 3.4 `deriveTimeline` (derive-timeline.ts): la fila de ventana también prefiere `antes de`

Hoy coloca la fila «1) justo DESPUÉS de su ancla `después de`; 2) si solo hay `antes de`,
justo ANTES de esa fila». Se invierte, por la misma razón que §3.2. Con los datos de hoy no
mueve ninguna fila: en las cinco ventanas de producción las dos anclas son consecutivas.

### 3.5 `createCuratedOrder` (curated-order.ts) recibe las ventanas

Firma nueva:

```ts
export function createCuratedOrder(
  sagas: OrderSaga[],
  memberships: OrderMembership[],
  titleOf: (key: string) => string,
  windows: Record<string, OrderWindow>,
): (rootId: string) => string[];
```

`walk()` construye la misma secuencia que hoy; lo único que cambia es que emite además el
bloque que produjo cada clave, para poder pasarle unidades al post-pase. Lo nuevo es ese
post-pase —`placeByWindow`— sobre el resultado ya deduplicado, con el `blockId` de la
primera aparición de cada clave.

**Trampa de formato, y es de las que ya han dado bugs:** `createCuratedOrder` habla en
claves `<tipo>:<uuid>` (`itemKey` de curated-order.ts, SIN prefijo), y sus tres consumidores
las parsean así. Las ventanas hablan en claves de ENTRADA, `i:<tipo>:<uuid>`. El post-pase
traduce al entrar y al salir; la firma pública de `createCuratedOrder` no cambia de formato.

`OrderMembership` gana `placement: SagaPlacement | null`. Hace falta para la guarda «solo
lo `libre` tiene ventana», la MISMA que aplican `deriveSagaMap` (derive-map.ts) y la ficha:
`windows` no puede confiar en que no le llegue una fila rancia de un sujeto que dejó de ser
`libre`. Para un sujeto BLOQUE la guarda sale de `OrderSaga.placementInParent`, que ya existe.

**Los tres consumidores pasan las ventanas.** No hay ninguno que se quede a medias:

| consumidor | de dónde salen las ventanas |
|---|---|
| `generateRoute` (route-actions.ts) | `detail.windows`, ya cargado |
| `route-view.tsx` (expandir un bloque dentro de un itinerario) | `detail.windows`, ya cargado |
| `buildLibrarySagaCards` (el «siguiente» y las portadas de Mi Biblioteca) | **query bulk nueva** |

La biblioteca carga todas las sagas seguidas de golpe, así que necesita una consulta más a
`saga_placement_windows` filtrada por ese conjunto de sagas, y resolver cada fila a
`{ afterKey, beforeKey }` en formato de clave de entrada. No hace falta resolver títulos:
`OrderWindow` no los lleva.

Decisión del responsable de producto: la biblioteca entra en esta fase. Dejarla fuera
significaría que la card diría «siguiente: El Camino de los Reyes» mientras el itinerario
generado dice «El Aliento de los Dioses» — dos pantallas discrepando sobre el mismo dato.

## 4. Casos límite

Todos decididos; ninguno queda abierto.

- **Ancla que no aparece en la secuencia** (rota, o fuera de este subárbol) → se ignora esa
  ancla y manda la otra. Si ninguna de las dos aparece, el sujeto no se mueve. Un sujeto
  anclado a sí mismo cae aquí: sus anclas se buscan sobre la secuencia SIN él.
- **Sujeto sin ventana** → no se mueve.
- **Ventana rancia** sobre algo que ya no es `libre` → se ignora. Misma guarda que
  `derive-map.ts` (`subjectPlacement !== "libre"`).
- **Dos sujetos que caen en el mismo punto** → conservan el orden que ya tenían. En el
  Cosmere: *Era 2* antes que *El Aliento de los Dioses*, que es lo que ya pinta el mapa.
- **Sujeto anclado a otro sujeto libre** → se procesan en el orden en que aparecen hoy en la
  secuencia; el segundo ve al primero ya movido.
- **Ciclo** (A antes de B y B antes de A) → cada sujeto se mueve exactamente una vez, así
  que no hay bucle. El resultado es determinista aunque no satisfaga las dos ventanas.
- **Ventana imposible** (el `antes de` cae ANTES que el `a partir de`) → manda el `antes de`.
- **No cabe sin cortar y retroceder incumple el `a partir de`** → se corta. Cortar es peor
  que no cortar; incumplir la ventana es lo único inaceptable.

## 5. Límite asumido: el mapa y el orden de lectura no mueven la misma unidad

Son dos preguntas distintas y se responden a distinta granularidad, a propósito:

- **El mapa 2D ordena BLOQUES.** Una fila es un bloque, así que cuando una obra suelta
  tiene ventana, `orderBlocksForLayout` arrastra el bloque ENTERO junto al ancla — es lo
  que acorta la arista, que es para lo que existe.
- **El orden curado ordena OBRAS.** Mueve solo el sujeto de la ventana.

En el Cosmere eso se ve así: el mapa pega *Novelas secretas* a *El Archivo* (porque *El
Hombre Iluminado* tiene ventana), mientras que el orden curado saca solo a *El Hombre
Iluminado* y deja a sus tres hermanas al final. Ninguna de las dos está mal; responden a
preguntas distintas. Queda **abierto como issue** por si algún día conviene unificarlo.

Consecuencia adicional del §2 para un sujeto BLOQUE: si su ventana viviera ENTERA dentro de
otro bloque, el orden curado lo colocaría al principio de ese bloque —incumpliendo el
`a partir de`— en vez de partirlo. No hay ningún caso así en producción.

## 6. Efecto medido en producción

Cinco ventanas en toda la base de datos; cuatro en el Cosmere.

| sujeto | tipo | a partir de | antes de |
|---|---|---|---|
| El Aliento de los Dioses | bloque libre (1 obra) | bloque *Era 1* | Juramentada |
| Nacidos de la Bruma. Era 2 | bloque libre (4 obras) | bloque *Era 1* | Viento y Verdad |
| Esquirla del Amanecer | obra suelta del bloque *El Archivo* | Juramentada | El Ritmo de la Guerra |
| El Hombre Iluminado | obra suelta del bloque *Novelas secretas* | El Ritmo de la Guerra | Viento y Verdad |
| La Espada de la Asesina | obra suelta (Trono de Cristal) | Corona de Medianoche | Heredera de Fuego |

Itinerario generado del Cosmere, **antes** → **después**:

| # | hoy | con esta fase |
|---|---|---|
| 1 | Elantris | Elantris |
| 2 | El Imperio Final | El Imperio Final |
| 3 | El Pozo de la Ascensión | El Pozo de la Ascensión |
| 4 | El Héroe de las Eras | El Héroe de las Eras |
| 5 | El Camino de los Reyes | **Aleación de Ley** |
| 6 | Palabras Radiantes | **Sombras de Identidad** |
| 7 | Juramentada | **Brazales de Duelo** |
| 8 | El Ritmo de la Guerra | **El Metal Perdido** |
| 9 | Viento y Verdad | **El Aliento de los Dioses** |
| 10 | Esquirla del Amanecer | El Camino de los Reyes |
| 11 | Aleación de Ley | Palabras Radiantes |
| 12 | Sombras de Identidad | Juramentada |
| 13 | Brazales de Duelo | **Esquirla del Amanecer** |
| 14 | El Metal Perdido | El Ritmo de la Guerra |
| 15 | El Aliento de los Dioses | **El Hombre Iluminado** |
| 16 | El Hombre Iluminado | Viento y Verdad |
| 17 | Islas de la Acuaoscura | Islas de la Acuaoscura |
| 18 | Trenza del Mar Esmeralda | Trenza del Mar Esmeralda |
| 19 | Yumi y el Pintor de Pesadillas | Yumi y el Pintor de Pesadillas |
| 20 | Arcanum Ilimitado | Arcanum Ilimitado |

Lo que se lee en la columna derecha:

- *Era 2* y *El Aliento* entran **entre Era 1 y El Archivo**, en el límite de bloque, sin
  partir nada. Es lo que la regla busca.
- *Esquirla del Amanecer* y *El Hombre Iluminado* **parten El Archivo**: sus ventanas viven
  dentro de ese bloque y no hay límite al que retroceder. Es el corte aceptado del §2.3.
- *Novelas secretas* pierde una de sus cuatro obras: *El Hombre Iluminado* tiene ventana
  propia y sus tres hermanas no. Un bloque libre deja de ser atómico cuando una de sus
  obras tiene ventana.

**Orden de bloques del mapa 2D:**

- antes: `Elantris · Era 1 · Era 2 · El Aliento · El Archivo · Novelas secretas`
- después: `Elantris · Era 1 · Era 2 · El Aliento · Novelas secretas · El Archivo`

Único cambio: *Novelas secretas* pasa de detrás a delante de *El Archivo*, porque su ancla
`antes de` (Viento y Verdad) manda ahora sobre la `a partir de` (El Ritmo de la Guerra) y
las dos viven en ese mismo bloque. Visualmente es neutro: su arista de ventana llega al
Archivo igual de cerca por arriba que por abajo. Hay que **verificarlo a ojo** de todos
modos, porque la geometría de columnas la calcula `alignRowsToLongEdges` a partir del orden
de filas y un cambio de fila puede mover columnas.

**Numeración del timeline móvil:** *Era 2* pasa a ser 5-8 en vez de 11-14. Es el caso real
de la issue #245.

## 7. Pruebas

- **`place-by-window.test.ts`** — la regla. Los cuatro casos reales del Cosmere como fixture
  (bloque que retrocede a un límite; obra que corta; obra que no puede retroceder; bloque
  atómico) más los ocho casos límite del §4.
- **Invariante columna ↔ orden curado** — para la forma del Cosmere: si se filtra el orden
  curado dejando solo las obras que tienen `orderNo`, sale exactamente la columna del
  timeline. Dicho de otro modo, la columna numerada y el itinerario generado no pueden
  contradecirse. Es lo único que impide que la #245 se reabra en silencio.

  No se prueba «mapa ↔ orden curado» porque no es cierto ni pretende serlo: el mapa ordena
  bloques y el orden curado obras (§5).
- **`group-members.test.ts` y `layout-map.test.ts`** — actualizar lo que asume `after` manda.
- **`curated-order.test.ts`** — el post-pase, y que sin ventanas el orden es exactamente el
  de hoy (garantía de no-regresión para las sagas sin ventana, que son casi todas).
- **`build-library-saga-cards.test.ts`** — que el «siguiente» respeta la ventana.
- **e2e `sagas-mapa-derivado.spec.ts`** — ya cubre «el generador crea un itinerario
  recorrible»; hay que actualizar lo que espera del orden.

## 8. Riesgos

- **Cambia lo que ya está generado, no.** Un itinerario ya guardado son filas en
  `saga_route_entries`: esta fase no las toca. Solo cambia lo que produce el botón la
  PRÓXIMA vez.
- **La numeración del timeline móvil se mueve** para quien siga el Cosmere. Es el efecto
  buscado (issue #245), pero es visible.
- **Cinco ficheros de orden tocados a la vez.** El invariante del §7 es la red: si los dos
  órdenes dejan de coincidir, el test lo dice antes que un usuario.
