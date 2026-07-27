# Task 9 — informe

Dos arreglos de **estética** sobre el mapa derivado, reportados por el responsable de producto
viendo el producto real: (1) el mapa salía como una escalera diagonal larguísima; (2) la insignia
del número de paso del itinerario activo no se veía, sobre todo en los nodos-medallón.

## 1 — la regla nueva de coordenadas

`x` era un contador de columnas **compartido por todo el mapa**: crecía con cada hueco de
cualquier bloque, así que el ancho del dibujo era la SUMA de todos los bloques (con 20 obras,
20 columnas de ancho, y cada bloque bajando además una fila → diagonal larguísima).

**Regla nueva: `x` se reinicia en cada bloque.** En `src/lib/sagas/derive-map.ts`, la declaración
`let x = 0;` se movió de fuera de `blocks.forEach` a DENTRO del cuerpo del callback — al ser una
variable local reinicializada en cada invocación, cada bloque vuelve a empezar su cadena horizontal
en la columna 0. El ancho del dibujo pasa a ser el del **bloque más largo**, no la suma de todos.

**La trampa que el brief avisaba, y la separación que la evita:** `orderNo` no es una coordenada —
es el índice lógico que `deriveTimeline` (`derive-timeline.ts`) consume para construir la columna
del timeline móvil, y tiene que seguir siendo **global y creciente** en el orden de lectura. Antes
`orderNo` heredaba literalmente el valor de `x` (`makeNode(m, x, y, x)`). Se separaron en dos
contadores:

- `x`: local a cada bloque (declarado dentro de `blocks.forEach`), pasa a `col` de `makeNode`.
- `orderCounter`: declarado FUERA del `forEach`, nunca se reinicia, pasa a `orderNo` de `makeNode`
  (`makeNode(m, x, y, orderCounter)`). Se incrementa en el mismo punto donde `x` se incrementaba
  antes (una vez por hueco, tras procesar todos los miembros de un tándem).

Las obras sin hueco (`position === null`) siguen sin tocar ninguno de los dos contadores de la
forma en que importa: consumen `x` local (col) para su posición tras el último hueco del bloque,
pero `orderNo` sigue recibiendo `null` — sin cambios de comportamiento ahí.

Las aristas de cadena no cambiaron de reglas: las intra-bloque siguen igual (usan `byId`/claves de
dominio, no coordenadas); las que cruzan de un bloque colocado al siguiente (Task 8) ahora bajan una
fila y arrancan en `x=0` de la fila siguiente — que es justo el efecto visual que se quería.

`derive-map.ts` sigue puro (sin React, sin Supabase).

## 2 — la insignia del paso

**Causa encontrada:** `StepBadge` se pintaba DENTRO del contenedor `overflow-hidden` que recorta la
portada/medallón (y en el medallón, ese contenedor es además `rounded-full`), con un offset negativo
(`-left-1 -top-1`) que la sacaba de esa caja. El recorte se comía la insignia; en la portada
(rectangular) solo un poco (por eso "apenas se apreciaba"), pero en el medallón (círculo) el recorte
CIRCULAR se comía la insignia casi entera — la esquina de la caja delimitadora cae fuera del círculo
inscrito, así que ahí no queda nada del círculo que la contenga. Coincide exactamente con la captura
del responsable (*Esquirla del Amanecer*, un medallón, sin número visible).

**Arreglo:** en `src/components/saga/graph/graph-nodes.tsx`, `StepBadge` se sacó del `<div>`
recortado y pasó a ser hermano suyo dentro del envoltorio EXTERIOR (`relative`, sin `overflow-hidden`)
que también contiene la etiqueta `<p>` — mismo sistema de coordenadas visual, cero recorte.
`StepBadge` ahora recibe un prop `size: "cover" | "medallion"` para dimensionarla según cada nodo
(78×116 frente a 58×58 son tamaños muy distintos):

- Portada: `h-6 w-6` (24px), `text-[11px]`, offset `-left-1.5 -top-1.5`.
- Medallón: `h-[18px] w-[18px]`, `text-[9px]`, offset `-left-1 -top-1` (más ajustada, para no tapar
  demasiado un nodo ya pequeño).

Contraste subido en los dos: `ring-2 ring-black/70` (antes `/50`), `shadow-md` (antes `shadow`),
`font-bold` (antes `font-semibold`), `z-20` para asegurar que queda por encima de todo lo demás del
nodo. El `aria-label` (`t("routeMapStep", { step })`) no se tocó. No se cambió nada más de
`CoverNode`/`MedallionNode`/`StatusBadges` — única excepción de esta fase a "la vista no se toca",
y limitada a esta insignia.

## Pruebas nuevas (`derive-map.test.ts`)

Describe `"x se reinicia por bloque; orderNo sigue siendo global y creciente (Task 9)"`, 4 tests:

1. Dos bloques de igual tamaño: `x` vuelve a 0 en el segundo bloque (`a.x=0`, `c.x=0`,
   `b.x === d.x`); `orderNo` sigue subiendo sin reiniciarse (`[0,1,2,3]`).
2. Un bloque largo (5 obras) seguido de uno corto (1 obra): el `x` máximo del dibujo lo marca el
   bloque largo, no la suma — el bloque corto vuelve a `x=0` en vez de continuar en `x=5`.
3. Tándem en el segundo bloque: comparte `x` local (0) y hereda el `orderNo` global correcto
   (detrás del bloque anterior, no reiniciado a 0).
4. Fija el valor exacto de `orderNo` del segundo bloque (3, no 0) — la prueba explícitamente
   pensada para atrapar un futuro acoplamiento con `x`.

Las dos pruebas de escala preexistentes (separación horizontal ≥150px de etiqueta, separación
vertical ≥ tarjeta+etiqueta) no se tocaron: los dos casos que cubren son de UN SOLO bloque (o miden
solo el eje Y entre dos bloques), así que siguen siendo válidas "dentro de una fila" tal cual, como
anticipaba el brief.

## Inyección de fallo

Se reintrodujo temporalmente el acoplamiento (`makeNode(m, x, y, x)` en vez de
`makeNode(m, x, y, orderCounter)`), se corrió la suite completa, y se revirtió:

```
❯ src/lib/sagas/derive-map.test.ts (29 tests | 4 failed)
 FAIL  el orden de createCuratedOrder coincide con el de los nodos del mapa, para los mismos datos
       expected [ 'i:book:c1', 'i:book:directo', 'i:book:c2' ]
       to deeply equal [ 'i:book:c1', 'i:book:c2', 'i:book:directo' ]
 FAIL  Task 9 > dos bloques de igual tamaño: x vuelve a 0 ... orderNo sigue subiendo
       expected [ 0, 1, 0, 1 ] to deeply equal [ 0, 1, 2, 3 ]
 FAIL  Task 9 > tándem en el segundo bloque ... hereda el orderNo global correcto
       expected 0 to be 1
 FAIL  Task 9 > fija el valor exacto de orderNo del segundo bloque ...
       expected 0 to be 3

 Test Files  1 failed (1)
      Tests  4 failed | 25 passed (29)
```

Exactamente los tests que dependen del contador global caen (los 3 nuevos que miran `orderNo`
explícitamente, más uno preexistente que resultó ser sensible al mismo bug por una vía distinta:
el orden final de `nodes` sale de ordenar por `orderNo`, y con el acoplamiento dos bloques
distintos empiezan a repetir `orderNo`, así que el `sort` deja de ser estable frente al orden de
inserción real). El test que solo mira `x` (bloque largo/corto) sigue en verde, como se espera: no
es sensible a este bug concreto. Revertido el fallo, la suite completa vuelve a los 29/29 en verde.

## `npx vitest run` y `npx tsc --noEmit`

Con `fnm use 22.23.1` antes de cada uno:

```
$ npx vitest run
 Test Files  67 passed (67)
      Tests  558 passed (558)
   Duration  4.98s

$ npx tsc --noEmit
(sin salida — limpio)
```

## Verificación en el navegador (dev)

Servidor único ya corriendo en el 3000 (no se levantó uno nuevo). Saga usada: **`[QA Sagas v2]
Universo`** (`69c07496-9b1a-4203-b3da-15d22a09c039`, `show_map=true` ya en dev), con varios bloques:
Era Uno (4 obras: posiciones 1, 2, 3+3 tándem), Era Dos (2 obras: posiciones 4, 5), más el grupo de
miembros directos ("Nexo", 1 obra). Fixtures temporales, dev-only, creadas y luego revertidas
exactamente:

- `saga_items.optional` de *La casa de los espíritus* (Era Dos, `926b74b1-…`) puesto a `true`
  temporalmente, para tener un nodo-medallón real que probar (en dev no hay ningún ítem `optional`
  sembrado). Revertido a `false` al terminar — confirmado por `SELECT`.
- Un itinerario "Orden curado" generado con el botón real **"Generar desde la curación"**
  (`/saga/…/editar`), para tener pasos numerados que resaltar sobre el mapa. Borrado con el flujo
  real de borrado (`/saga/…/rutas`, "Borrar" → "Borrar definitivamente") al terminar — confirmado
  por `SELECT` (0 rutas, entradas borradas en cascada).

### Medidas antes/después (por DOM, no por captura)

`fitView` normaliza el zoom para que el dibujo siempre llene el panel visualmente, así que una
captura de pantalla no muestra la diferencia de tamaño real. Medido en su lugar leyendo
`style="transform: translate(Xpx, Ypx)"` de cada `.react-flow__node` — la posición CRUDA que
`saga-graph-view.tsx` pasa tal cual desde `n.x`/`n.y`, antes de que el viewport aplique pan/zoom.

**Antes** (con `derive-map.ts` revertido temporalmente vía `git stash` a la versión con `x` global,
mismo servidor, mismo dev en caliente vía HMR — no un entorno distinto):

| fila (bloque) | x de sus nodos |
|---|---|
| Era Uno (y=0) | 0, 180, 360, 360 |
| Era Dos (y=220) | 540, 720 |
| Nexo/directo (y=440) | 900 |

Ancho total = borde derecho máximo (900 + 78 de la portada) − 0 = **978px**.
Alto total = borde inferior de la última fila (440 + 116) − 0 = **556px**.

**Después** (con el fix, mismo servidor, recompilado en caliente):

| fila (bloque) | x de sus nodos |
|---|---|
| Era Uno (y=0) | 0, 180, 360, 360 |
| Era Dos (y=220) | **0** (medallón), **180** (portada) |
| Nexo/directo (y=440) | **0** |

Ancho total = borde derecho máximo (360 + 78, fila Era Uno) − 0 = **438px**.
Alto total = sin cambios, **556px** (el eje Y no lo toca este fix).

**Ancho: 978px → 438px (−540px, −55%). Alto: 556px → 556px (sin cambios, esperado).** Con solo 3
filas con contenido en esta saga de QA la reducción ya es más de la mitad; con una saga del tamaño
del Cosmere de producción (20 obras repartidas en varios bloques, según
`docs/superpowers/specs/2026-07-27-sagas-fase-3-retirada-del-grafo-design.md`) la vieja regla habría
seguido sumando columna tras columna por cada bloque, mientras que la nueva queda acotada por el
bloque más largo — la diferencia crece con el número de bloques, no se queda en esta saga pequeña.

### Insignia del paso: portada y medallón

Con el itinerario "Orden curado" activo (`?ruta=orden-curado`), inspeccionado por DOM (no solo por
captura, que en este entorno de navegador a veces no compone):

```json
{
  "cover":     { "ariaLabel": "Paso 1 del itinerario", "text": "1", "rect": { "width": 24, "height": 24 }, "parentOverflow": "visible" },
  "medallion": { "ariaLabel": "Paso 5 del itinerario", "text": "5", "rect": { "width": 18, "height": 18 }, "parentOverflow": "visible" }
}
```

Verificado además, para los dos: `display: grid`, `opacity: 1`, `zIndex: 20`,
`clippedByAncestor: false` (recorrido explícito de los ancestros con `overflow: hidden`,
comprobando que el rect de la insignia queda SIEMPRE dentro de ellos — ya no hay ninguno que la
corte). Una captura de pantalla (que sí compuso esta vez) confirma visualmente el resultado: mapa
compacto de 3 filas, con la insignia numerada legible tanto sobre la portada de *Rayuela* (paso 1)
como sobre el medallón de *La casa de los espíritus* (paso 5).

## Ficheros tocados

- `src/lib/sagas/derive-map.ts`: `x` local por bloque, `orderCounter` global para `orderNo`.
- `src/lib/sagas/derive-map.test.ts`: describe nuevo "Task 9" (4 tests).
- `src/components/saga/graph/graph-nodes.tsx`: `StepBadge` reubicada fuera del contenedor
  recortado, dimensionada por tipo de nodo (`size: "cover" | "medallion"`), contraste subido.

No se tocó nada más de `graph-nodes.tsx` (`StatusBadges`, `SagaNodeCard`, etc.), ni la semilla de
dev quedó con cambios: el ítem `optional` y el itinerario de prueba se revirtieron/borraron, y la
semilla original de dev queda exactamente como estaba.
