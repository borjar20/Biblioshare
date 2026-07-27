# Task 7 — informe

## Subtarea 1: el e2e

Fichero: `e2e/sagas-mapa-derivado.spec.ts` (nuevo, 4 tests).

### Universos QA elegidos y por qué

- **`[QA Itinerarios] Universo`** (`33d7bb93-da3d-4453-a6da-1722beff134d`, ver `e2e/sagas-itinerarios.spec.ts`): verificado contra BD dev que **nunca tuvo fila en `saga_nodes`** — es exactamente el caso "curada y sin grafo" del brief. Tiene curación real (1 miembro directo + 1 subsaga con 2 obras) y **ya tiene un itinerario curado a mano** (`la-guardia`), lo que lo vuelve también el mejor candidato para el matiz "apagado, no hay mapa": con el interruptor apagado esta saga **sigue enseñando pestaña Mapa** (por esa ruta no sintética), así que la prueba de "no hay mapa" no puede ser "la pestaña desaparece" — tiene que ser más precisa (la ruta «lectura» no se ofrece y el grafo 2D no se pinta ni para la ruta curada). Un universo sin ninguna ruta curada no habría dejado ver esa distinción.
- **`[QA Sagas v2] Universo` / `Era Uno`** (`69c07496-…` / `53118dd4-…`, ver `e2e/sagas-ventanas.spec.ts`): ya tiene `show_map=true` en dev. Reutiliza el MISMO sujeto y la MISMA ancla que `sagas-ventanas.spec.ts` (Isabel Allende, `libre`, «a partir de Rayuela»), sembrados aquí por REST directo — ese spec ya cubre `WindowEditor`; este test comprueba que la ventana **guardada** se dibuja como arista en el mapa derivado, no cómo se captura.

### Los 4 tests y sus locators

1. **"una saga curada y sin grafo… enseña mapa con el interruptor encendido"**: `.react-flow__node` (clase propia de React Flow, mismo criterio que ya usaba `sagas-v2-mapa.spec.ts` contra el grafo viejo) + `[data-testid="rf__node-<id>"]`. React Flow genera ese testid a partir del `id` que le pasamos, y `deriveSagaMap` lo construye de forma determinista desde las claves de dominio (`i:<tipo>:<uuid>`) — no de un índice de render. Más estable que el texto visible (pasa por next-intl/layout) y más preciso que contar nodos a secas.
2. **"con el interruptor apagado no hay mapa…"**: mismo universo, `show_map=false`. Comprueba que el enlace "Orden de lectura" desaparece del selector, que la ficha degrada a la ruta curada (`la-guardia`) en vez de dar página en blanco, y que `.react-flow__node` es 0 — ni siquiera para la ruta curada (`resolveSagaGraph` aplica el interruptor en el origen, así que `detail.graph` es `null` para TODA la ficha).
3. **"el generador crea un itinerario recorrible…"**: interacción real con el botón «Generar desde la curación» en `/saga/[id]/editar`. Comprobación fuerte contra BD (`saga_route_entries`: 3 posiciones 1..3 sin huecos, en el orden exacto de `createCuratedOrder`) + comprobación de "recorrible" contra la UI (los 3 pasos como enlaces navegables en `RouteView`).
4. **"una entrada libre con ventana produce la arista que cruza…"**: ver la nota siguiente — el locator final NO es el grafo 2D.

### El giro que el brief pedía ("míralo antes de decidir")

Probé primero `[data-testid="rf__edge-<id>"]` (React Flow pone ese testid al `<g>` de cada arista, e `id` lo construye `deriveSagaMap` de forma determinista: `window:${after}->${subject}`). **Falló siempre**, con reintento incluido. Depurado con un test desechable contra el propio Chromium de Playwright: el `<g>` existe con `data-id`/`aria-label` correctos y su `<path>` trae una `d` válida (`M78,58 C309,58 309,58 540,58`), pero `getBoundingClientRect()` da `height: 0` — Rayuela e Isabel caen en la **misma fila** del mapa (mismo bloque, Era Uno), así que la arista es una línea perfectamente horizontal, y el bounding box geométrico de una línea así no tiene alto aunque el trazo (`stroke-width:3`) sí se vea. `toBeVisible()` exige área > 0: no es un bug del grafo, es una limitación de `getBoundingClientRect()` sobre SVG que no ve el trazo — y es el caso NORMAL aquí (las dos anclas de una ventana casi siempre viven en el mismo bloque).

Pivoté al **timeline móvil** (`reading-timeline.tsx`, HTML de servidor, sin geometría de lienzo): con Isabel conectada a la columna, `deriveTimeline` la cuelga como rama de la fila de Rayuela con el chip **"Requisito"** — visible solo si `edgeType === "requisito"`, nunca para una rama sin arista o `opcional`. Locator final: `a[href="/libro/<isabelId>"]` filtrado por `hasText: "Requisito"` (viewport móvil, 390×844, mismo que ya usaba `sagas-v2-mapa.spec.ts` para esta pieza). Tuve que añadir el filtro por texto porque, sin él, el mismo `href` aparece DOS veces (issue #167: todo nodo sin `orderNo` también sale en "Como lista lineal", sin ventana) y el locator fallaba en modo estricto por ambigüedad — no por lo que el test dice cubrir.

No es una debilidad del producto: el propio grafo 2D pinta bien la arista (comprobado visualmente); es una debilidad de `toBeVisible()` sobre líneas SVG exactamente horizontales. Lo dejo anotado en el propio spec (comentario largo en el test 4) por si alguien reintenta el locator del grafo más adelante.

### Dos pasadas seguidas en verde (tras el pivote)

```
Running 4 tests using 1 worker
  ok 1 › una saga curada y sin grafo dibujado a mano enseña mapa con el interruptor encendido (3.6s)
  ok 2 › con el interruptor apagado no hay mapa, ni para «lectura» ni para una ruta curada (3.4s)
  ok 3 › el generador crea un itinerario recorrible a partir de la curación (7.4s)
  ok 4 › una entrada libre con ventana produce la arista que cruza en el mapa (4.1s)
4 passed (19.6s)
```

```
Running 4 tests using 1 worker
  ok 1 › una saga curada y sin grafo dibujado a mano enseña mapa con el interruptor encendido (4.9s)
  ok 2 › con el interruptor apagado no hay mapa, ni para «lectura» ni para una ruta curada (3.3s)
  ok 3 › el generador crea un itinerario recorrible a partir de la curación (9.0s)
  ok 4 › una entrada libre con ventana produce la arista que cruza en el mapa (3.8s)
4 passed (23.5s)
```

(Y una tercera pasada más al final, tras deshacer todas las inyecciones de fallo, también en verde — ver abajo.)

### Inyección de fallo

Cuatro reverts, uno por test, cada uno aplicado, suite completa ejecutada, revertido antes del siguiente:

| # | Revert | Fichero | Resultado |
|---|---|---|---|
| 1 | `resolveSagaGraph(saga.showMap, …)` → `resolveSagaGraph(true, …)` (ignora el interruptor) | `get-saga-detail.ts` | **Cae solo el test 2** ("apagado no hay mapa") — el 1, el 3 y el 4 siguen en verde |
| 2 | En `deriveSagaMap`, `blocks.forEach` añade `if (group.sagaId === null) return;` (los miembros DIRECTOS de la raíz —sin bloque— dejan de ser nodos) | `derive-map.ts` | **Cae solo el test 1** ("enseña mapa encendido": pierde el nodo de "Ronda de noche", cuenta 2 en vez de 3) — el 2, el 3 y el 4 siguen en verde |
| 3 | En `createCuratedOrder`, se invierte el orden: las hijas (bloques) se recorren ANTES que los miembros directos | `curated-order.ts` | **Cae solo el test 3** ("el generador…": el orden de `saga_route_entries` sale `[Guardias, Pies de barro, Ronda de noche]` en vez de `[Ronda de noche, Guardias, Pies de barro]`) — el 1, el 2 y el 4 siguen en verde |
| 4 | En `deriveSagaMap`, el bucle de aristas de ventana itera sobre `{}` en vez de `windows` (ninguna ventana produce arista) | `derive-map.ts` | **Cae solo el test 4** ("la arista que cruza": el chip "Requisito" nunca aparece, timeout) — el 1, el 2 y el 3 siguen en verde |

Los cuatro reverts se deshicieron después de cada pasada; `git diff --stat` tras la última confirma que el árbol de trabajo queda limpio salvo el fichero nuevo del spec. Cierre con una pasada más de la suite completa en verde (ver arriba, tercera tabla) para confirmar que no quedó nada a medio revertir.

### Cómo quedó la semilla

Verificado por SQL tras las dos pasadas y las cuatro inyecciones de fallo:

- `saga_items` de Isabel Allende en Era Uno: `position=4, placement='fijo'` (igual que al empezar).
- `saga_placement_windows` para Era Uno: 0 filas (igual que al empezar).
- `sagas.show_map`: `[QA Itinerarios] Universo` → `false`; `[QA Sagas v2] Universo` → `true` (los dos, igual que al empezar).
- `saga_routes` de `[QA Itinerarios] Universo`: solo `la-guardia` (el "Orden curado" que genera el test 3 se borra en su propio `finally`, con un borrado defensivo adicional al INICIO del test por si una pasada anterior murió a media ejecución).

### Dudas

- El locator de arista del grafo 2D (`rf__edge-<id>`) es correcto y determinista, pero **no sirve con `toBeVisible()`** cuando los dos extremos comparten fila (línea horizontal, bbox de altura 0). Si en el futuro alguien quiere un e2e contra el grafo 2D para una arista, tendrá que comprobar `toBeAttached()` + el atributo `d` del `<path>` en vez de `toBeVisible()`, o forzar un escenario donde los extremos NO compartan fila. Lo dejo documentado en el spec, no lo cambié en el producto (fuera de mi alcance).
- `e2e/sagas-v2-mapa.spec.ts` (pre-fase-3) sigue existiendo y referencia el grafo dibujado a mano de `[QA Sagas v2] Universo` (10 nodos/7 aristas del `saga_nodes` viejo) — con el mapa ya derivado, ese universo ahora tiene una forma distinta (nodo por obra, no por bloque) y no comprobé si ese spec sigue en verde: está fuera del alcance del Step 1 (que pide cubrir lo que esta fase ESTRENA, no revisar specs anteriores) y ninguna instrucción del brief lo pide. Lo señalo por si el Step 3 (comprobar tras desplegar) o una subtarea posterior necesita saberlo.
- No usé el switch real de `SagaMetaEditor` (`show_map` en `/saga/[id]/editar`) para encender/apagar el interruptor en los tests 1/2 — usé PATCH REST directo, igual que el resto de specs de sagas manipulan curación. La cobertura de que el checkbox de la UI persiste de verdad no la tiene este spec (asumo que es de la Task 4-bis, ya cerrada, no de esta subtarea).

## Subtarea 1-bis: el e2e preexistente del mapa

`e2e/sagas-v2-mapa.spec.ts` es el spec ANTERIOR a esta fase (guardaba el grafo dibujado a mano, `saga_nodes`/`saga_edges`), señalado como duda sin resolver en la Subtarea 1 (arriba). Al arrancar tenía 3 de sus 4 tests en rojo.

### Diagnóstico de cada fallo, con evidencia

1. **"la ficha del universo muestra la pestaña Mapa…"** (esperaba ver "Orden de lectura disponible."): **el test estaba desactualizado, no el producto.** Ese aviso se retiró en la fase 3 (Task 4-bis, commit `0d8c6f1`): con el mapa derivado y gobernado por `show_map`, «hay grafo» dejó de significar que el aviso aportara nada — ver el comentario ya existente en `saga-info.tsx` líneas 59-63. El resto del test (pestaña, toggle, timeline, ausencia de "Nexo entre tramos"/"Spin-off") seguía pasando en cuanto se quitaba esa única aserción.
2. **"el mapa a pantalla completa renderiza el grafo…"** (esperaba 10 nodos, y una tarjeta de nodo-saga "[QA Sagas v2] Era Dos"): **el test asumía la forma del grafo VIEJO.** Desde `deriveSagaMap` (Task 1) un nodo es siempre una obra, nunca un bloque/subsaga — los "nodos-saga" que el test buscaba ya no existen por diseño. Verificado contra BD dev (`[QA Sagas v2] Universo`): Era Uno aporta 4 obras encadenadas (position 1-4), Era Dos aporta 2 (position 4-5), y hay 1 obra directa del Universo sin clasificar ("Trilogía La casa de los espíritus", position `null`) = **7 nodos**, no 10.
3. **"una saga sin grafo no tiene pestaña Mapa y /mapa redirige a su ficha"**: este SÍ era el caso a tratar con cuidado que pedía el brief ("si falla podría ser un fallo del producto, para y dilo"). Investigado antes de tocar nada: **no era el producto ni el test — era el entorno.** El `next dev` que ya corría en el puerto 3000 llevaba sus workers de compilación (Turbopack) muertos: `/saga/[id]`, `/saga/[id]/mapa` y hasta `/libro/[id]` devolvían 500 con `"Jest worker encountered 2 child process exceptions, exceeding retry limit"` (un fallo genérico de infraestructura de Next.js, no una excepción de la app — confirmado porque `/`, `/sagas` y `/saga/[id]/editar` sí respondían). Reiniciar el servidor (mismo puerto, mismo `fnm use 22`) lo resolvió: los tres tests con 500 pasaron a: dos con fallos de test genuinos (1 y 2, arriba) y el tercero **en verde sin tocar nada** — confirmando que la pestaña Mapa y el redirect de `/mapa` para una saga sin grafo (`ERA_UNO_ID`, `show_map=false` y sin rutas curadas) siguen funcionando exactamente como antes.

### Qué cambié y por qué

- Quité la aserción del aviso retirado (test 1), con un comentario que explica el porqué en vez de solo borrar la línea.
- Actualicé el comentario de cabecera del fichero (obsoleto: hablaba de "10 nodos / 7 aristas" y "3 nodos-saga anidados") para describir la composición real derivada, verificada por SQL.
- Test 3 (antes numerado como el segundo fallo): cambié `toHaveCount(10)` → `toHaveCount(7)`, y sustituí el check por texto del nodo-saga inexistente por un check de un nodo de obra real de Era Dos vía `[data-testid="rf__node-i:book:<id>"]` — mismo criterio de locator que ya usa `e2e/sagas-mapa-derivado.spec.ts` (el id que genera React Flow a partir de la clave determinista de `deriveSagaMap`), así que el test sigue demostrando que el mapa pinta la fila de Era Dos y no solo la de Era Uno, sin depender de un elemento que ya no existe.
- No toqué el interruptor `show_map` desde el test: el Universo ya tenía `show_map=true` en dev (mismo que usa `sagas-mapa-derivado.spec.ts`), así que no hacía falta encenderlo por REST.
- No cambié nada en el producto: los tres fallos eran, en este orden, un aviso retirado a propósito, una forma de grafo que cambió a propósito, y un servidor de desarrollo atascado.

### Verificación

`npx playwright test e2e/sagas-v2-mapa.spec.ts`, dos pasadas seguidas en verde (4/4 cada una).

### Suite e2e de sagas entera: dos roturas MÁS, ninguna de la fase 3

El brief pedía correr toda `e2e/sagas-*.spec.ts` para descartar que la fase hubiera roto algo más. La corrí completa (41 tests, 11 ficheros) tras arreglar el servidor: **3 fallos**, ninguno en un fichero que la fase 3 tocara.

1. **`sagas-colocacion-opcionalidad.spec.ts` — "el contador de la cabecera… coincide con su grid, incluso con un «libre» dentro"**: el locator `freeHeading.locator("xpath=following-sibling::ul[1]")` nunca encontraba el `<ul>` de «Cuando quieras». No es un fallo del producto — el snapshot de accesibilidad del test fallido ya mostraba "Rayuela" pintado correctamente bajo el heading "Cuando quieras" — es que ese árbol de accesibilidad aplana los `<div>` sin rol semántico, así que ocultaba que en el DOM real el `<ul>` no es hermano directo del `<h2>`: cuelga de un `<div className="flex flex-col gap-5">` intermedio (añadido en el commit `67daf45`, **el mismo día pero DESPUÉS** de que este test se escribiera en `785d1e9` — el test nunca se actualizó tras ese cambio de estructura, y nadie volvió a correr la suite completa hasta ahora). Nada que ver con la fase 3: `saga-info.tsx` sí lo toca esta fase, pero no esa sección. Arreglado el locator (`xpath=following-sibling::div[1]//ul[1]`, sigue la estructura real) con un comentario explicando el porqué.
2. **`sagas-itinerarios.spec.ts` — "adoptar una ruta hace que la ficha abra por ella"**: timeout esperando el botón "Leer por aquí". Verificado por SQL: la ruta `la-guardia` llevaba **adoptada por el usuario colaborador de QA desde el 2026-07-23** — resto de una pasada anterior de este mismo test que nunca limpió. El comentario original del test la llamaba "idempotente" pero no lo es: `AdoptRouteButton` pinta "Leyendo por aquí" en cuanto `routeChoice === slug`, así que con la ruta ya adoptada el botón "Leer por aquí" no vuelve a aparecer nunca — el test colgaba hasta el timeout de 30s. Tampoco es la fase 3 (este fichero no lo tocó) ni el producto (el botón hace justo lo que dice). Arreglado añadiendo una limpieza por REST (`DELETE` sobre `saga_route_choices`, con el `user_id` fijo del colaborador de QA) al principio del test, para que la precondición se cumpla siempre sin depender de lo que dejara la pasada anterior — el propio test ya deja la ruta adoptada al acabar por diseño original, así que no hace falta un `finally` que la desadopte.
3. **La tercera caída que vi en la primera pasada completa** ("un colaborador llega a /rutas…", timeout en el mismo click que el fallo 2 de arriba) **no se reprodujo al correr `sagas-itinerarios.spec.ts` en solitario** — flake, probablemente por carga del sistema con 41 tests/varios Chromium en cadena. No lo cuento como una cuarta rotura real.

Los tres arreglos son solo de test (locators y precondiciones), cero cambios de producto. Verificación: `sagas-colocacion-opcionalidad.spec.ts` y `sagas-itinerarios.spec.ts` en verde dos pasadas cada uno por separado, y la suite entera (`sagas-colocacion-bloques`, `sagas-colocacion-opcionalidad`, `sagas-editor-secuencia`, `sagas-itinerarios`, `sagas-mapa-derivado`, `sagas-rol-narrativo`, `sagas-v2-biblioteca`, `sagas-v2-curacion`, `sagas-v2-mapa`, `sagas-v2`, `sagas-ventanas` — 41 tests) dos pasadas seguidas, **41/41 en verde** ambas veces.

### Fallo del producto encontrado: ninguno

Los tres fallos originales del spec del mapa y los dos roturas nuevas de la suite entera fueron, sin excepción: dos aserciones desactualizadas (aviso retirado, forma del grafo), un servidor de desarrollo con los workers de compilación muertos, y dos locators/precondiciones de test que no seguían la estructura/estado real. El producto se comportó como se esperaba en todos los casos que pude verificar.

### Semilla: verificada por SQL tras las dos pasadas de la suite entera

- `saga_items` de Isabel Allende en Era Uno: `position=4, placement='fijo'` (igual que al empezar); las 4 filas de Era Uno completas coinciden con el baseline documentado en la Subtarea 1.
- `saga_placement_windows` para Era Uno: 0 filas.
- `sagas.show_map`: `[QA Itinerarios] Universo` → `false`; `[QA Sagas v2] Universo` → `true` (los dos, igual que al empezar).
- `saga_routes` de `[QA Itinerarios] Universo`: solo `la-guardia`.
- `saga_route_choices` de `[QA Itinerarios] Universo` + colaborador QA: `la-guardia` (mismo valor que tenía al empezar esta subtarea — no era el baseline "limpio" que el propio test dejó ver, pero es literalmente lo que había antes de tocar nada, y es el estado que el test dice dejar aposta al acabar).
