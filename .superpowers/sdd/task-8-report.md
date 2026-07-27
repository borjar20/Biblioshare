# Task 8 — informe

Regresión: el mapa derivado (`src/lib/sagas/derive-map.ts`) encadenaba cada
bloque como una isla — las aristas `principal` solo unían huecos consecutivos
**dentro** de un mismo bloque, así que el Cosmere (bloques ordenados en
secuencia) no tenía ninguna arista entre la última obra de un bloque y la
primera del siguiente. El grafo viejo, dibujado a mano, sí las tenía.

## La regla implementada

En la **zona ordenada** (`partitionGroups(groups).ordered`, incluido el grupo
de miembros directos «Nexo», sin caso especial), la cadena ahora es
**continua**: la última obra encadenada de un bloque se une con la primera del
bloque ordenado siguiente, con una arista `principal`, con las MISMAS reglas
que ya regían dentro de un bloque:

- **Tándem en el límite**: se conectan TODOS los pares (las dos obras del
  hueco anterior con las del hueco siguiente), igual que dos huecos tándem
  consecutivos dentro de un bloque.
- **Bloque sin obras encadenables** (todo `position === null`, o vacío): se
  salta sin romper la cadena — el bloque anterior con huecos se une
  directamente al siguiente bloque ordenado que sí los tenga.
- Los bloques **`libre`** (fuera de `ordered`) nunca entran en la cadena: ni
  la leen ni la actualizan.

Implementación: una variable `chainTail` (el último hueco — array de
miembros, no una sola obra — visto en un bloque ordenado con huecos) que
persiste a través de `blocks.forEach`, solo se lee/actualiza cuando
`y < ordered.length` (recordando que `blocks = [...ordered, ...free]`, así
que los bloques libres, al final, nunca entran en esa condición). El `id` de
la arista sigue el formato `chain:<source>-><target>` que ya usan las de
cadena intra-bloque, y el `accent` sale del nodo origen — mismo criterio que
ya existía.

`derive-map.ts` sigue puro (sin React, sin Supabase); no se tocó
`src/components/saga/graph/`; `orderNo` y las coordenadas (`NODE_STEP_X/Y`) no
cambiaron.

## Pruebas nuevas

`src/lib/sagas/derive-map.test.ts`, describe `"la cadena cruza de un bloque
colocado al siguiente (zona ordenada)"` (5 tests):

1. Dos bloques colocados consecutivos se unen (última obra del primero →
   primera del segundo).
2. Un bloque `libre` no se une a la cadena (flota, solo lo conectan sus
   ventanas).
3. Un bloque sin obras encadenables se salta, sin romper la cadena (A de
   "Uno" se une directo con C de "Tres", saltando "Medio").
4. Tándem en el límite: los 4 pares (A,B)×(C,D) quedan conectados.
5. El grupo de miembros directos («Nexo») entra en la cadena con la misma
   regla, sin caso especial.

Dos tests preexistentes tuvieron que actualizarse porque el fix les añade,
correctamente, una arista `principal` que antes no existía (dos bloques
colocados consecutivos, uno de ellos con una ventana rancia que no debe
producir arista): `"una ventana cuyo sujeto NO es libre (obra fija / bloque
fijo) no produce arista"` — se cambió `expect(map.edges).toEqual([])` por
`expect(map.edges.filter(e => e.type !== "principal")).toEqual([])`, dejando
claro que lo que se comprueba es que la VENTANA rancia no pinta arista, no que
no haya ninguna arista en absoluto.

## Inyección de fallo

Revertida temporalmente la lógica de cadena entre bloques (bloque `if (y <
ordered.length) { … }` comentado/desactivado, dejando solo la cadena
intra-bloque preexistente), suite completa ejecutada, luego restaurada:

| Test | Con la regresión reintroducida |
|---|---|
| Dos bloques colocados consecutivos se unen | **FALLA** (falta la arista B→C) |
| Un bloque libre no se une a la cadena | pasa (nunca dependió del fix) |
| Un bloque sin obras encadenables se salta sin romper la cadena | **FALLA** (0 aristas en vez de 1) |
| Tándem en el límite conecta todos los pares | **FALLA** (0 pares en vez de 4) |
| Miembros directos («Nexo») entran en la cadena | **FALLA** (0 aristas en vez de 1) |
| Resto de la suite (20 tests previos) | sigue en verde |

Exactamente los 4 tests que dependen del fix caen; el resto de la suite
(incluidos los 2 tests preexistentes ya actualizados) sigue en verde. Tras
confirmar esto, se restauró el fix (el diff real, sin la desactivación) y se
volvió a correr la suite entera en verde.

## `npx vitest run` y `npx tsc --noEmit`

Con `fnm use 22` antes de cada uno:

```
$ npx vitest run
 Test Files  67 passed (67)
      Tests  554 passed (554)
   Start at  19:09:15
   Duration  7.47s

$ npx tsc --noEmit
(sin salida — limpio)
```

## Verificación en el navegador (dev)

Saga usada: **`[QA Sagas v2] Universo`** (`69c07496-9b1a-4203-b3da-15d22a09c039`,
`show_map=true` en dev), con dos bloques colocados consecutivos: **Era Uno**
(`53118dd4-…`, 4 obras: posiciones 1, 2, 3+3 tándem) y **Era Dos**
(`c9a702f1-…`, 2 obras: posiciones 4, 5) — `Era Vacía` (sin miembros) también
cuelga de la misma saga pero, por el desempate de `compareBlocksByPlacement`
(`minPos` de un bloque vacío = `MAX_SAFE_INTEGER`), queda ordenada DESPUÉS de
Era Dos, no entre las dos — así que no era el caso "bloque vacío en medio"
(ese lo cubre el test unitario nuevo #3). Navegado a
`/saga/69c07496-…?tab=mapa&ruta=lectura` con la sesión ya autenticada como
`bibliosharedev`.

**Limitación del entorno, no del producto**: el screenshot y el DOM del
`<canvas>`/SVG de React Flow no compusieron — `computer{action:"screenshot"}`
devolvió "the Browser pane is not displayed, so the page is not compositing
frames" en todos los intentos, y `document.visibilityState` reportaba
`"hidden"` en la pestaña. Confirmé que es un freeze real de compositing (no
solo un flag): un `requestAnimationFrame` en bucle no completó ni un segundo
de frames en 30s. El componente de arista del producto
(`floating-edge.tsx`, `useInternalNode`) depende de que React Flow **mida**
cada nodo (vía `ResizeObserver`/scheduler interno) antes de dibujar el
`<path>`; con el compositing congelado, esa medición nunca se resuelve y
`.react-flow__edge` queda en 0 en el DOM aunque los 7 `.react-flow__node`
(con `getBoundingClientRect()` correcto, 78×116px) sí están. Nada de esto
depende de `derive-map.ts`, que es puro y no toca React.

Medí el DOM por la vía que sí es fiable: el **payload RSC** embebido en el
HTML servido (`self.__next_f.push(...)`, capturado del `outerHTML` con
`javascript_tool`) — los props reales que `SagaGraphLazy`/`SagaGraphView`
reciben, antes de que el cliente intente pintar nada. Contiene el `graph`
completo con **6 aristas `principal`**, exactamente las que la regla predice:

```
chain: b397333b (Rayuela, pos1)      -> 4c076a65 (pos2)          principal
chain: 4c076a65  (pos2)               -> d6d61eab (pos3, tándem) principal
chain: 4c076a65  (pos2)               -> 79ddcbd0 (pos3, tándem, Isabel) principal
chain: 926b74b1  (Era Dos, pos4)      -> 7a88b65f (pos5)          principal
chain: d6d61eab  (Era Uno, pos3 tándem) -> 926b74b1 (Era Dos, pos4)  principal   ← CRUZA de bloque
chain: 79ddcbd0  (Era Uno, pos3 tándem, Isabel) -> 926b74b1 (Era Dos, pos4) principal   ← CRUZA de bloque
```

Las dos últimas son exactamente la regla de esta tarea en datos reales: el
tándem del límite de Era Uno (`d6d61eab` + `79ddcbd0`/Isabel) conecta con
**los dos** con la primera obra de Era Dos (`926b74b1`) — ni una isla, ni solo
media conexión. Antes del fix, `chainTail` no existía y esas dos aristas no se
generaban (verificado también por el propio test unitario "tándem en el
límite", con fault injection arriba).

No se tocó ningún dato: solo lecturas `SELECT` contra `supabase-dev`
(`sagas`, `saga_items`) para elegir el universo y verificar la curación real.
La semilla queda exactamente como estaba.

## Timeline de móvil: confirmado que no se altera

`deriveTimeline` (`src/lib/sagas/derive-timeline.ts`) construye la "columna"
(`spine`) filtrando nodos por `orderNo !== null` y agrupa en secciones por
`groupSagaId` consecutivo — **no consulta `graph.edges` para eso en absoluto**;
solo las usa (`earliestSpineFor`) para colgar RAMAS de nodos SIN `orderNo`.
Las aristas nuevas de esta tarea unen siempre dos nodos de columna (ambos con
`orderNo` no nulo), así que caen exactamente en el caso que el propio
comentario del fichero dice ignorar a propósito ("Las aristas
opcional/requisito entre dos nodos DE COLUMNA se ignoran a propósito").

Confirmado, no asumido: test desechable (`__scratch-timeline-check.test.ts`,
borrado tras la comprobación) con el mismo caso de dos bloques colocados
consecutivos:

```
chain edges: [ 'i:book:A->i:book:B', 'i:book:C->i:book:D', 'i:book:B->i:book:C' ]
sections: [
  { group: 'saga-Uno', rows: [ 'i:book:A', 'i:book:B' ] },
  { group: 'saga-Dos', rows: [ 'i:book:C', 'i:book:D' ] }
]
```

Con la arista de cadena `B->C` cruzando entre las dos secciones, el timeline
sigue partiendo en 2 secciones (una por bloque) — la arista nueva no fusiona
ni reordena nada.

## Ficheros tocados

- `src/lib/sagas/derive-map.ts`: la regla de cadena entre bloques.
- `src/lib/sagas/derive-map.test.ts`: 5 tests nuevos + 2 tests preexistentes
  actualizados (ver arriba).

No se tocó `src/components/saga/graph/`, ni `orderNo`/coordenadas, ni ningún
dato en Supabase.
