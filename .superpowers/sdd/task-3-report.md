# Task 3: El itinerario, encima del mapa — Informe

## Resumen

`deriveSagaMap` acepta un cuarto argumento `routeKeys?: string[]` que numera
`SagaGraphNode.step` con la posición (1..N) de cada clave en la lista del
itinerario. `graph-nodes.tsx` pinta esa insignia sobre el nodo (`CoverNode` y
`MedallionNode`). `saga-map-tab.tsx`, cuando la ruta activa es una curada,
recalcula el mapa con las claves de esa ruta y lo pinta encima de `RouteView`
(que sigue intacto debajo, como pedía el brief).

## Archivos tocados

- `src/lib/sagas/map-types.ts` — campo `step: number | null` en `SagaGraphNode`.
- `src/lib/sagas/derive-map.ts` — rellena `step` a partir de `routeKeys`.
- `src/lib/sagas/derive-map.test.ts` — las dos pruebas del brief + la del paso-bloque.
- `src/lib/sagas/derive-timeline.test.ts` — **fuera de la lista del brief**, pero
  imprescindible: sus helpers construyen `SagaGraphNode` a mano y `step` pasó a
  ser un campo obligatorio del tipo. Sin este ajuste `tsc --noEmit` no compilaba.
  Cambio mecánico: añadir `step: null` a los literales existentes, cero lógica.
- `src/components/saga/graph/graph-nodes.tsx` — `StepBadge`, la única excepción
  de la fase a "no tocar los componentes del grafo".
- `src/components/saga/saga-map-tab.tsx` — deriva el mapa de la ruta curada
  activa y lo pinta encima de `RouteView`.
- `messages/es.json` — una clave nueva, `saga.routeMapStep`, para el
  `aria-label` de la insignia.

## Qué insignia copié, y de dónde

Busqué la "convención de números pequeños en mono" en los dos sitios que
apunta el brief antes de escribir nada:

- **Editor de secuencia** (`sequence-row.tsx`): el número de hueco —
  `font-mono text-[15px] font-medium`, con `text-accent` cuando el hueco está
  ocupado y `text-foreground-faint` cuando no.
- **Ficha** (`route-view.tsx`, `route-editor.tsx`): el índice de paso —
  `font-mono text-[11px] text-muted-foreground`, `padStart(2, "0")`.

Ninguna de las dos es literalmente una "insignia" (badge aislado): las dos son
un número en línea, dentro de una fila de lista. `graph-nodes.tsx`, en
cambio, ya tiene su propia familia de insignias — círculo absoluto en una
esquina del nodo, con `ring` para legibilidad sobre la portada
(`StatusBadges`: ✓ verde abajo-a-la-derecha, ◉ acento arriba-a-la-derecha).

Decisión: en vez de inventar una tercera familia visual, combiné las dos
convenciones existentes en vez de crear una nueva — la FORMA (círculo, ring,
esquina absoluta) es la de `StatusBadges`, ya en este mismo archivo; la
TIPOGRAFÍA (mono, tamaño pequeño, negrita) es la de los números de paso de la
ficha/editor. Esquina superior-izquierda porque es la única libre
(`StatusBadges` ya ocupa abajo-derecha y arriba-derecha). Color `bg-accent`,
reutilizando el mismo token que ya usa el badge "en curso" en este archivo, en
vez de introducir un color nuevo.

```tsx
function StepBadge({ step }: { step: number | null }) {
  const t = useTranslations("saga");
  if (step === null) return null;
  return (
    <span
      className="absolute -left-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-accent font-mono text-[10px] font-semibold text-white shadow ring-2 ring-black/50"
      aria-label={t("routeMapStep", { step })}
    >
      {step}
    </span>
  );
}
```

Montada en `CoverNode` y `MedallionNode` (los dos tipos que `deriveSagaMap`
produce hoy — `kind` siempre es `"item"`, nunca `"saga"`, así que
`SagaNodeCard` no la necesita y no la toqué).

## El paso que es un bloque

Un paso del itinerario puede nombrar un bloque entero (`s:<uuid>`), pero
`deriveSagaMap` nunca crea un nodo de bloque — los expande en las obras que
contiene. La clave `s:<uuid>` de un bloque, por construcción, nunca aparece en
`byId` (que solo indexa `i:<tipo>:<uuid>`). Así que cae, sin necesitar una
rama aparte, en la misma resolución que un paso "fantasma" (obra borrada,
referencia rota): simplemente no encuentra nodo y no numera nada — exactamente
la regla que el brief ya daba por escrita ("lo que el mapa no dibuja, se
ignora"). Lo dejé explícito en el comentario de `derive-map.ts`, y cubierto
por una prueba dedicada (`"un paso que es un bloque se ignora..."`), a
diferencia de `resolveEntry` (las ventanas), que si resuelve un ancla-bloque a
su primera/última obra — decisión deliberada: el itinerario no gana poder
sobre el mapa, solo numera lo que el mapa ya dibuja.

## Inyección de fallo

Cambié temporalmente la numeración de "posición en `routeKeys`" a "contador de
nodos vistos" (un `seen++` que solo avanza cuando la clave sí resuelve a un
nodo):

```ts
let seen = 0;
routeKeys.forEach((key) => {
  const node = byId.get(key);
  if (node) { seen += 1; node.step = seen; }
});
```

Resultado (`npx vitest run derive-map`): caen exactamente las dos pruebas que
fijan la regla contraria —

```
FAIL  ... > un paso que el mapa no dibuja se ignora, sin romper la numeración de los demás
  AssertionError: expected 1 to be 2
FAIL  ... > un paso que es un bloque se ignora (el mapa no dibuja bloques), sin romper la numeración
  AssertionError: expected 1 to be 2

Test Files  1 failed (1)
     Tests  2 failed | 13 passed (15)
```

Revertido antes de seguir; `npx vitest run` completo vuelve a estar en verde
(ver abajo).

## Verificación

`npx vitest run` (limpio, tras revertir la inyección de fallo):

```
 Test Files  66 passed (66)
      Tests  533 passed (533)
   Duration  5.04s
```

`npx tsc --noEmit`: sin salida, exit 0.

## Navegador (dev)

Saga usada: **Matrix - Colección** (`82a500f5-5955-4abe-8a39-59e8ed286232`,
dev), 4 películas en un único bloque encadenado, `position` 1..4, sin
itinerario previo. Creé una ruta curada temporal (`saga_routes` +
`saga_route_entries`, vía SQL) con 2 pasos: Matrix Reloaded (paso 1) y Matrix
Resurrections (paso 4 del bloque, pero paso 2 del itinerario) — deliberadamente
NO consecutivos en el mapa, para que una numeración "solo nodos visibles" y
una numeración "posición real en el itinerario" dieran resultados distintos si
hubiera una regresión.

Abrí `/saga/.../?tab=mapa&ruta=qa-task3-verificacion`. El lienzo React Flow
mostró un problema de layout preexistente del entorno de automatización
(los 4 nodos superpuestos en `translate(Npx, 0px)` con N=0..3 en vez de una
separación real en píxeles) — confirmé que el MISMO problema ocurre en la
ruta `lectura` sin tocar (grafo completo, sin `routeKeys`), así que es ajeno a
esta tarea y no lo toqué (fuera del alcance: solo `graph-nodes.tsx`).

Para verificar el contenido real por debajo del glitch visual, inspeccioné el
DOM con JS (`document.querySelectorAll('.react-flow__node')`):

```json
[
  { "label": "Matrix",               "badgeText": null, "badgeAria": null },
  { "label": "1Matrix Reloaded",     "badgeText": "1",  "badgeAria": "Paso 1 del itinerario" },
  { "label": "Matrix Revolutions",   "badgeText": null, "badgeAria": null },
  { "label": "2Matrix Resurrections","badgeText": "2",  "badgeAria": "Paso 2 del itinerario" }
]
```

Exactamente lo esperado: los dos pasos del itinerario llevan insignia con su
número real (1 y 2, el orden del itinerario, no el 1º y 4º del bloque); las
otras dos películas (fuera del itinerario) no llevan insignia. `RouteView`
siguió pintándose debajo, sin cambios. Borré la ruta y sus entradas al
terminar (`DELETE FROM saga_route_entries/saga_routes`), verificado con
`SELECT count(*) ... = 0`.

## Dudas

1. **El glitch de layout de React Flow** en el entorno de browser-automation
   (nodos con `translate(Npx, 0)`, N en unidades pequeñas en vez de píxeles de
   verdad) parece un problema de medida del contenedor (`ResizeObserver`) bajo
   ese entorno concreto — lo vi igual en `lectura` sin tocar nada, así que no
   es de esta tarea, pero lo señalo por si vale la pena investigarlo aparte
   (puede afectar a cualquier verificación visual futura del mapa en este
   mismo entorno de browser).
2. **`derive-timeline.test.ts` no estaba en la lista de "Files" del brief**,
   pero tuve que tocarlo (solo añadir `step: null` a los literales de
   `SagaGraphNode` que construye a mano) porque si no `tsc --noEmit` no
   compilaba: al añadir un campo obligatorio al tipo, cualquier literal
   existente en cualquier test se rompe. Es un cambio puramente mecánico, sin
   lógica nueva, pero lo marco por si el criterio de "solo estos archivos" era
   estricto.
3. No añadí la insignia a `SagaNodeCard` (el nodo "saga" agrupado): hoy
   `deriveSagaMap` nunca produce `kind: "saga"` (solo `"item""`), así que sería
   código muerto. Si en el futuro se reintroduce un nodo agregado de subsaga en
   el mapa derivado, habría que decidir entonces si un paso de itinerario que
   apunta a un bloque debería, en ESE caso, resaltar el nodo agregado en vez de
   ignorarse — pero eso contradiría la regla actual ("el mapa no dibuja
   bloques, se ignora") y no es parte de esta fase.

## Arreglo tras la revisión: coordenadas en píxeles

**El fallo (CRITICAL):** `deriveSagaMap` emitía coordenadas DE ÍNDICE — `x` =
número de hueco (0, 1, 2…), `y` = número de fila (0, 1…) — pero
`saga-graph-view.tsx` las usa CRUDAS (`position: { x: n.x, y: n.y }`, lo que
React Flow pinta directamente). Como la tarjeta de nodo mide 78×116px
(`graph-nodes.tsx`), con nodos a 0px, 1px, 2px… de distancia, TODOS caían
apilados unos sobre otros. `scaleNodes` (derive-timeline.ts) normaliza
cualquier escala, pero solo la llama el mini-preview del CTA (`map-cta.tsx`);
la vista 2D no pasa por ahí.

La duda 1 de este mismo informe («el glitch de layout... lo vi igual en
`lectura` sin tocar nada, así que no es de esta tarea») fue el diagnóstico
equivocado: la ruta `lectura` YA ES el mapa derivado por esta misma Task 3,
así que ver el mismo apilamiento ahí no era un control que descartara el
fallo — era el mismo fallo, reproducido dos veces.

**El arreglo:** `deriveSagaMap` ahora escala `x`/`y` a píxeles con dos
constantes nombradas:

- `NODE_STEP_X = 180`: paso horizontal entre columnas. La etiqueta bajo cada
  portada mide 150px, centrada sobre la tarjeta de 78px; dos columnas
  contiguas necesitan ≥150px centro a centro para que sus etiquetas no se
  toquen. 180px deja ~30px de margen.
- `NODE_STEP_Y = 220`: paso vertical entre filas (una fila = un bloque). La
  portada mide 116px de alto, más la etiqueta que cuelga debajo (8px de
  margen + hasta dos líneas de texto, ~40px). Una fila necesita ~164px para no
  invadir la portada de la fila siguiente; 220px deja margen cómodo.

El comentario en `derive-map.ts` (junto a las constantes) explica el porqué
para que nadie vuelva a dejarlas en índices: React Flow las usa crudas, y
`scaleNodes` solo interviene en el mini-preview del CTA. `orderNo` (usado por
`deriveTimeline`, no por el lienzo) se queda con el índice lógico, sin
escalar — no es una coordenada.

**Pruebas:** `derive-map.test.ts` ya comparaba relaciones (`toBe` entre dos
`x`/`y` del propio mapa, `not.toBe`, `toBeGreaterThan`), nunca un valor
literal — no hizo falta tocar ninguna aserción. Las 533 pruebas de la suite
siguen en verde tal cual.

**Verificación en navegador (dev, puerto 3000, arrancado y parado limpio para
esta verificación):** contra la saga semilla `[QA Sagas v2] Universo`
(`69c07496-9b1a-4203-b3da-15d22a09c039`, 3 bloques / 7 obras), la pestaña
"Mapa de lectura":

- Los 7 nodos salen en 0px, 180px, 360px…1080px de `x` (columnas) y
  59px/279px/499px de `top` (filas) — exactamente el paso de 180/220
  configurado.
- Medí los `getBoundingClientRect()` de las 7 tarjetas Y de sus 7 etiquetas en
  el DOM real: cero pares solapados (`overlapPairs: []`, `labelOverlapPairs:
  []`).
- El mini-preview del CTA (móvil, `ruta=lectura`, el único que llama a
  `scaleNodes`) sigue perfecto: los mismos 7 nodos, ya en píxeles reales,
  se reescalan sin problema al `viewBox="0 0 66 48"` (círculos repartidos de
  x=5 a x=61, y=5 a y=43, con las 3 filas bien separadas).

No pude adjuntar una captura de pantalla real: en esta sesión el panel del
navegador no llegó a componer frames (`the Browser pane is not displayed, so
the page is not compositing frames`), un límite del entorno de
browser-automation de esta sesión no interactiva, no del fix. Como evidencia
sustituta usé medición directa del DOM renderizado (arriba), que es más
precisa que una inspección visual para confirmar "cero solapes".

**Verificación formal:** `npx vitest run` → 66 archivos, 533 pruebas, todas en
verde. `npx tsc --noEmit` → sin salida, limpio.

## Arreglo 2 tras la revisión: dos pruebas que sí pueden fallar

La revisión encontró dos huecos de cobertura en `derive-map.test.ts`, los dos
capaces de dejar pasar exactamente las dos regresiones que ya sufrió esta
rama (bloque resuelto donde no debía, y coordenadas de índice sin escalar).
Solo se tocó el fichero de pruebas; `derive-map.ts` no cambió (`git diff` lo
confirma sin salida).

**1 — el paso-que-es-un-bloque ahora puede fallar.** La prueba original
("un paso que es un bloque se ignora...") usaba `routeKeys: ["s:saga-Uno",
"i:book:A"]` con un bloque de una sola obra: si `deriveSagaMap` resolviera
indebidamente el bloque a su primera obra (como sí hace `resolveEntry` para
las ventanas), `"s:saga-Uno"` habría puesto `step=1` en A y, acto seguido,
`"i:book:A"` lo habría pisado con `step=2` — mismo resultado observado que
la implementación correcta, prueba verde con código roto.

Arreglo: el bloque ahora tiene DOS obras (A, B) y el paso siguiente es B —
DISTINTA de A, la que resolvería el bloque. La prueba comprueba los dos
nodos: `A.step` tiene que quedarse en `null` (el paso-bloque se ignora sin
numerar nada) y `B.step` tiene que ser `2` (numerado por su propia entrada,
sin heredar el número del paso ignorado).

**2 — la escala de coordenadas ahora está atada al tamaño de la tarjeta.**
Ninguna prueba fijaba `NODE_STEP_X`/`NODE_STEP_Y` a una magnitud real: todas
las aserciones de espaciado eran relacionales (`toBeGreaterThan`, `not.toBe`)
y seguían siendo ciertas incluso con `NODE_STEP_X = NODE_STEP_Y = 1` — el
apilamiento real que sufrió esta rama y que ninguna de las 533 pruebas
detectó (solo se vio midiendo el DOM en el navegador).

Dos pruebas nuevas, con las medidas citadas desde `graph-nodes.tsx`
(`CoverNode`: tarjeta 78×116px, etiqueta 150px de ancho centrada, `mt-2` =
8px + hasta dos líneas de `text-sm leading-tight` ≈ 40px de alto):

- Columnas contiguas: `b.x - a.x >= 150` (ancho de la etiqueta) — si las
  etiquetas están más cerca que su propio ancho, se tocan.
- Filas contiguas: `b.y - a.y >= 116 + 40` (alto de tarjeta + etiqueta) — si
  las filas están más cerca que eso, la tarjeta de una invade la etiqueta de
  la anterior.

**Inyección de fallo (las dos, confirmadas y revertidas):**

| # | Qué se rompió (temporalmente) | Qué prueba cayó | Resultado tras revertir |
|---|---|---|---|
| 1 | En el bucle de `routeKeys`, cambiar `byId.get(key)` por `resolveEntry(key, "first")` (el camino de las ventanas, que sí resuelve un bloque a su primera obra) | "un paso que es un bloque se ignora..." → `expected 1 to be null` (A quedó con `step=1` en vez de `null`); el resto de las 16 pruebas del fichero siguió en verde | `derive-map.ts` restaurado byte a byte (`git diff` vacío); las 17 pruebas del fichero en verde |
| 2 | `NODE_STEP_X = 1` y `NODE_STEP_Y = 1` (el bug real de esta rama) | Las dos pruebas nuevas: `expected 1 to be greater than or equal to 150` y `expected 1 to be greater than or equal to 156`; las 15 pruebas restantes del fichero (todas relacionales) siguieron en verde — confirma que sin las pruebas nuevas este fallo era invisible | `derive-map.ts` restaurado byte a byte (`git diff` vacío); las 17 pruebas del fichero en verde |

**Verificación formal (post-arreglo):** `npx vitest run` → 66 archivos, 535
pruebas (533 + 2 nuevas), todas en verde. `npx tsc --noEmit` → sin salida,
limpio.

```
$ npx vitest run
 RUN  v4.1.10 D:/Proyectos/Personal/Biblioshare

 Test Files  66 passed (66)
      Tests  535 passed (535)
   Start at  13:10:34
   Duration  3.76s (transform 2.85s, setup 0ms, import 7.21s, tests 1.26s, environment 14ms)

$ npx tsc --noEmit
(sin salida)
```
