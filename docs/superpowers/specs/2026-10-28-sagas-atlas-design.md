---
title: Atlas de la saga (rework de sagas, subproyecto 2)
date: 2026-10-28
status: diseño aprobado (brainstorming 2026-10-28), pendiente de implementar
area: sagas / ui
---

# Atlas de la saga

> Maquetas de referencia (fragmentos del compañero visual, sin el marco):
> [`assets/sagas-atlas-maquetas.html`](assets/sagas-atlas-maquetas.html). Contiene las lentes
> candidatas (entraron todas), el zoom semántico (opción A) y la composición con el selector de
> itinerario (opción A).
> Inspiración: el atlas de Entre nosotros
> ([spec 2026-10-13](2026-10-13-entre-nosotros-atlas-design.md)).
> Subproyecto 1, la ficha: [spec 2026-10-27](2026-10-27-sagas-ficha-lector-design.md).

## 1. Problema y alcance

Desde la fase 1 de la ficha, todo lo que explica **cómo** se lee una saga vive repartido en dos
sitios que nadie quiere:

- `/saga/[id]/mapa`: el grafo 2D de React Flow. Se ve en 4 de las 85 sagas de producción
  (`show_map = true`) y no tiene acciones.
- `/saga/[id]/como-leerla`: página **interina** con la antigua pestaña Mapa. Lleva el timeline
  con ventanas, tándems, roles y opcionales, adoptar itinerario, saltar opcionales y la lente
  `?rol=`. En las 81 sagas con el mapa apagado es el único sitio donde se adopta un itinerario.

El atlas los sustituye a los dos con un **lienzo a pantalla completa con zoom, tres lentes que
recolocan las obras y dos capas que las tiñen**. Resuelve además la issue #1541: los pasos-bloque
de un itinerario curado no se expandían.

Fuera de alcance: el subproyecto 3 (atlas del índice `/sagas`), el editor de curador y cualquier
migración. Si alguna resultara necesaria, se para y se consulta.

## 2. Decisiones (brainstorming 2026-10-28)

| Pregunta | Elegido | Descartado |
|---|---|---|
| Lentes | **Orden · Rol · Publicación**, que recolocan, más las capas **Itinerario** y **Progreso**, que tiñen | Itinerario y progreso como lentes propias |
| Zoom alejado | **Semántico**: islas por subsaga, luego portadas, luego detalle | Geométrico (puntos, portadas, títulos) |
| Selector de itinerario | **Chip en la barra superior que abre una hoja**, con resumen, contador y Adoptar | Fila de chips fija sobre el dock |
| `show_map` | **El atlas existe para toda saga con obras**; el interruptor solo decide si la ficha destaca la tarjeta del atlas | Respetar el interruptor; retirarlo |
| Técnica | **DOM y SVG con una cámara de `transform`** | Motor canvas de Entre nosotros; React Flow |

Por qué DOM y no canvas: una saga tiene decenas de obras (el Cosmere, unas 50), no las 1.000 de
Entre nosotros. Con obras como enlaces reales, el foco, Enter, el lector de pantalla y los
localizadores de e2e salen solos, y el canvas obligaría a rehacerlos a mano.

## 3. Rutas y estado

- El atlas vive en **`/saga/[id]/mapa`**, la misma URL de hoy. Entra en `isFullscreenRoute`
  (`src/components/nav/fullscreen-routes.ts`): sin topbar ni barra inferior, a `100dvh` y con
  `env(safe-area-inset-*)`. Lleva su propio «‹ {saga}».
- Solo redirige a la ficha si `shelfGraph` no tiene nodos (saga sin obras). **Ya no** mira
  `detail.graph`.
- `/saga/[id]/como-leerla` queda como **redirect** a `/mapa`, traduciendo parámetros. `?tab=mapa`
  de la ficha apunta a `/mapa` con la misma traducción.
- Estado en la URL, con `router.replace`:
  - `?lente=orden|rol|publicacion`, por defecto `orden`. Un valor desconocido degrada a `orden`.
  - `?ruta=<slug>` es el itinerario de la capa, con la precedencia de `resolveActiveRoute`:
    `?ruta=`, después la ruta adoptada y después la primera.
  - Traducción de parámetros viejos: `ruta=publicacion` y `orden=publicacion` pasan a
    `lente=publicacion` (y la ruta, a la siguiente según la precedencia). `rol=<rol>` válido pasa
    a `lente=rol&rol=<rol>`, con el carril resaltado.
- La capa de Progreso es estado local, encendida por defecto con sesión. Sin sesión no se ofrece.
- La cámara se guarda en `sessionStorage` por saga (clave `saga-atlas:<id>`) para volver de una
  ficha donde estabas. Si falla o no hay nada, se encuadra en la obra «ahora» (sin sesión, en la
  primera). Todo acceso va en try/catch.

## 4. Datos

- La página es servidor: `getSagaDetail` y, solo si la ruta activa es curada, `getRouteEntries`
  de esa ruta. **Sin `use cache`** (regla #437): `detail` lleva estados del lector.
- El estado del lector sale de `passes` vía `getSagaDetail`, como hoy. Nada nuevo lee
  `library_entries`.
- El contador del itinerario («Llevas X de Y») sale de `resolveRoute`, igual que en `RouteView`
  hoy. Solo lo lleva la ruta **activa**: las demás necesitarían leer sus entradas, y hoy
  `RouteView` tampoco las cuenta.

### 4.1 Modelo: `deriveAtlas` (`src/lib/sagas/atlas/model.ts`)

Función pura. Parte de lo que ya calcula la balda, sin recalcular nada:

- **Orden base:** `deriveShelf(deriveTimeline(detail.shelfGraph, opts))` con
  `opts = { authenticated, showOptional }`. Ahí están decididos «ahora», las ventanas con sus
  anclas, los tándems, los roles, las opcionales y los estados.
- **Año:** de `DetailMember.year`.
- **Capa de itinerario:** las claves de la ruta activa expandidas con `expandRouteKeys`
  (`shelf-sections.ts`), con el mismo `mainOrderOf` de `createCuratedOrder`. Así se resuelve
  **#1541**. El número del hilo cuenta **obras**, igual que en la balda. La nota de cada paso
  (`route entry note`) viaja hasta las obras que salen de ese paso.

Salida:

```ts
type AtlasWork = {
  key: string; title: string; href: string; coverUrl: string | null;
  state: "done" | "now" | "todo"; role: SagaItemRole | null;
  optional: boolean; skipped: boolean; ownerSagaId: string;
  regionKey: string; readingNo: number | null; readingIndex: number; year: number | null;
  window: { reason: WindowReason | null; afterKey: string | null; beforeKey: string | null;
            notice: "antes" | "dentro" | "pasada" | null } | null;
  tandem: { mode: TandemMode | null; note: string | null; partnerKeys: string[] } | null;
  step: number | null; stepNote: string | null;
};
type AtlasRegion = { key: string; name: string | null; accent: SagaAccentToken;
  state: "done" | "current" | "future"; counted: number; completed: number };
type AtlasModel = { works: AtlasWork[]; regions: AtlasRegion[]; nowKey: string | null;
  mode: ShelfMode; hasItinerary: boolean };
```

`readingIndex` es la posición 0..N-1 de cada obra en el orden de lectura, contando también las
que no tienen número: es la que usan los layouts y el orden de tabulación.

## 5. Lentes y capas

### 5.1 Layouts (`src/lib/sagas/atlas/layout.ts`)

Funciones puras y deterministas: `(model, orientation) → { key, x, y }[]` en coordenadas de
mundo, más la geometría de fondo (regiones, carriles, eje y arcos). La orientación es `h` en
pantallas apaisadas y `v` con relación de aspecto menor que 1. Es el mismo layout con los ejes
intercambiados.

- **Orden.** El río de la saga.
  - Cada subsaga es una región tintada con su acento (`SAGA_ACCENT`) y las obras van en fila por
    `readingIndex`.
  - Un tándem son portadas solapadas con contorno `map-tandem`.
  - La obra de una ventana flota sobre el tramo entre sus anclas, con un arco discontinuo
    `map-window` de ancla a ancla. Si el ancla está en otra región, el arco llega hasta allí.
  - Las opcionales sin número cuelgan bajo su subsaga, en tamaño menor.
- **Rol.** Un carril por rol presente: «principal» (`role = null`) primero y después los de
  `SAGA_ITEM_ROLES` en su orden. La posición en el carril es `readingIndex`, y un hilo fino une
  cada obra con rol con la principal anterior. Con `?rol=` el carril elegido se resalta y el
  resto se atenúa. Sustituye a `RoleFilterBar`.
- **Publicación.** Eje de años, con el rango redondeado a años completos. Las obras del mismo
  año se apilan y las que no tienen año van al final, bajo «sin año». Cada obra lleva su
  `readingNo` y un hilo dorado las recorre en orden de lectura, para que se vean los saltos.

Al cambiar de lente las obras vuelan a su sitio con una transición de `transform` de unos 450 ms.
Con `prefers-reduced-motion` saltan directamente. La cámara se reencaja con `fit`.

### 5.2 Capas

- **Itinerario.** Con una ruta curada activa, un hilo `map-itinerary-jump` recorre las obras con
  `step` en orden, con badges numerados. Lo que el itinerario no nombra se atenúa; así se cubre
  «Sin puesto en este itinerario» de `RouteView`. Con «Orden de lectura» no hay hilo.
- **Progreso.**
  - Leído: ✓.
  - «Ahora»: aro y halo dorados y la etiqueta «ahora».
  - Futuro: atenuado.
  - Saltada: tachada y atenuada.

  Apagada, todo va neutro. Ninguna señal depende solo del color.

### 5.3 Zoom semántico

Los umbrales se ajustan al probar con datos reales:

| Escala `k` | Se dibuja |
|---|---|
| < 0,5 | **Islas**: un círculo por región, de radio ∝ √obras, con «completadas/total» o «N» y la región en curso resaltada. Las obras no se pintan. Una saga sin subsagas no tiene este nivel: el mínimo es el de portadas. |
| 0,5 – 1,6 | Portadas, arcos, tándems, badges de itinerario y marcas de progreso |
| > 1,6 | Además, título, rol (vocabulario de `RoleChip`) y nº sobre cada obra |

Las portadas usan el loader del CDN (`src/lib/images/cdn-loader.ts`). Sin portada se pinta un
lomo con el acento de la región.

### 5.4 Resumen (`aria-live="polite"`)

Plantillas ICU en `messages/es.json` bajo `saga.atlas.*`:

- Orden: «Llevas {done} de {total} · te toca {título}». Sin sesión: «Empieza por {título}».
  Terminada: «La terminaste».
- Rol: «{n} principales, {m} relatos…», solo con los roles presentes.
- Publicación: «De {desde} a {hasta} · {k} se leen fuera de su orden de salida». `k` es el número
  de obras cuyo `readingIndex` difiere de su puesto por año.

## 6. Composición y componentes

Siempre oscuro, con tokens propios en el CSS module del atlas (los mismos valores que Entre
nosotros). De arriba abajo:

- **Barra superior.**
  - A la izquierda: «‹», la eyebrow «Atlas · N obras», el título de la saga y el resumen.
  - A la derecha: el **chip de itinerario** («⟿ {nombre} ▾»), que abre una hoja en móvil y un
    desplegable en escritorio, y el **interruptor de Progreso**.
  - La hoja lista «Orden de lectura» (el `lectura` sintético) y los itinerarios curados.
    «Publicación» no aparece porque ya es una lente. Cada entrada lleva nombre y resumen, y la
    activa lleva además su contador y Adoptar (`AdoptRouteButton`). Para curadores, «✎ Gestionar
    itinerarios» enlaza a `/saga/[id]/rutas`. Sin itinerarios curados, el chip no despliega.
- **Dock inferior:** Orden · Rol · Publicación (icono y texto; solo icono a ≤ 640 px, con
  `aria-label`) y una leyenda de una línea por lente.
- **Abajo a la derecha:** + − ⤢ y «Ver como lista».

Ficheros:

```
src/lib/atlas/camera.ts           movido desde src/lib/comparisons/atlas/camera.ts (compartido)
src/lib/sagas/atlas/model.ts      deriveAtlas
src/lib/sagas/atlas/layout.ts     layoutOrden, layoutRol, layoutPublicacion, islas
src/lib/sagas/atlas/summary.ts    resumen por lente → { key, values }
src/components/saga/atlas/
  saga-atlas.tsx       isla cliente: lente, capas, cámara, selección
  atlas-plane.tsx      plano con transform: obras (DOM) + capa SVG
  atlas-work.tsx       una obra según el nivel de zoom
  itinerary-sheet.tsx  hoja/desplegable del chip
  work-sheet.tsx       mini-ficha
  atlas-list.tsx       «Ver como lista»
  skip-optional-button.tsx, adopt-route-button.tsx (mudados)
```

`saga-atlas` deriva todo de props. Su estado local se limita a lente, capa de Progreso,
cámara y obra seleccionada.

## 7. Interacción

| | Escritorio | Móvil / Capacitor |
|---|---|---|
| Mover | Arrastrar | Arrastrar con un dedo |
| Zoom | Rueda centrada en el cursor, doble clic, + − ⤢ | Pellizco, doble toque |
| Obra | Clic abre la mini-ficha (tarjeta flotante) | Toque abre la mini-ficha (hoja inferior) |
| Isla | Clic hace zoom sobre ella | Toque hace zoom sobre ella |
| Teclado | Tab recorre obras en orden de lectura (la cámara sigue al foco), Enter abre la mini-ficha, `+`/`-`, `0` encajar, `1`–`3` lentes | — |

- Pointer Events con `setPointerCapture` y `touch-action: none` en el lienzo, con un umbral de
  5 px entre toque y arrastre.
- **Mini-ficha:**
  - portada, título, nº y rol;
  - **ventana**: «Encaja entre {X} e {Y} · {motivo}», y «Ahora encaja» con `notice = dentro`;
  - **tándem**: «A la vez que {Z}» o «En cualquier orden con {Z}», con su nota;
  - **paso** y nota del itinerario activo.

  Acciones: **Abrir ficha** y, si es opcional y hay sesión, **Saltar / Ya no la salto**, con la
  action de `SkipOptionalButton`.

## 8. Accesibilidad

- Cada obra es un control real que se puede enfocar, con nombre accesible
  «{título}, {estado}, {rol}».
- El plano lleva `aria-label` con la lente y el resumen.
- **«Ver como lista»:** una `ol` en el orden de la lente activa (Orden: lectura; Rol: por carril;
  Publicación: por año). Cada entrada lleva estado, rol, ventana, tándem y paso en texto, y enlaza
  a la ficha. Es el sustituto accesible del timeline retirado.
- Lentes y Progreso son botones con `aria-pressed`. Los objetivos táctiles miden ≥ 44 px.

## 9. `show_map`

El interruptor deja de condicionar el atlas y pasa a decidir solo si la ficha pinta
`AtlasTeaser`. Su texto en el editor cambia (`sagaEditor.showMapLabel`/`showMapHint`) a «Destacar
el mapa en la ficha». Sin migración: la columna conserva su valor. `resolveSagaGraph` y
`detail.graph` se mantienen para la tarjeta.

En la balda, «Cómo leerla →» pasa a «Ver en el mapa →», enlaza a `/mapa?ruta=<activa>` y se pinta
siempre. La tarjeta enlaza a `/mapa`.

## 10. Se retira

- `src/app/saga/[id]/como-leerla/page.tsx` (queda solo el redirect).
- `saga-map-tab.tsx`, `route-view.tsx`, `route-selector.tsx`, `route-block.tsx`,
  `reading-timeline.tsx`, `timeline/*`, `map-cta.tsx`, `graph/*` y la dependencia `@xyflow/react`
  (solo la usa `graph/*`).
- `sagaReadingHref` y su `revalidatePath`: se revalida `/mapa`.
- Las claves i18n huérfanas, sus tests, y `derive-timeline` / `layout-map` / `graph-metrics` en
  lo que quede sin usos. `deriveTimeline` **sigue**: lo usan la balda y el atlas.

## 11. Pruebas

- **Vitest:**
  - `deriveAtlas`: ventana dentro, antes y pasada; tándem; roles; opcionales ocultas y saltadas;
    sin sesión; terminada; bloque de itinerario expandido (#1541) con su nota; obra sin año.
  - Layouts: deterministas, sin solapes en una misma fila, orientación `h`/`v` y carriles solo de
    roles presentes.
  - `summary`: cada número es igual al recuento de lo dibujado.
  - `camera`: los tests existentes, movidos.
  - RTL de `saga-atlas`: lentes con la URL, el chip con la hoja y Adoptar, la mini-ficha con
    Saltar, la lista accesible, la capa de Progreso y el estado sin sesión.
- **Playwright** contra `npm run build` + `next start` (regla #437), en escritorio y Pixel 7:
  - abre centrado en «ahora»;
  - recorre las tres lentes y la lista;
  - cambia de itinerario y lo adopta;
  - `?ruta=la-guardia` pinta las obras del bloque (#1541);
  - salta una opcional y la recupera;
  - los redirects de `/como-leerla` (con `ruta`, `orden` y `rol`) y de `?tab=mapa`;
  - una saga con `show_map = false` tiene atlas.

  Se mudan los casos de `sagas-itinerarios`, `sagas-opcionales-saltables`, `sagas-grafo-estados`,
  `sagas-mapa-derivado`, `sagas-orden-designado` y `sagas-ficha-lector` que hoy van a
  `/como-leerla` o dependen del grafo.
- **Visual:** capturas de escritorio y móvil tras la lente Orden y tras las capas, con visto
  bueno del usuario antes de seguir.

## 12. Entrega

Una PR contra `main`. Al cerrarla:

- `decisiones.md`: el atlas sustituye a `/mapa` y a `/como-leerla`; `show_map` solo destaca la
  tarjeta; DOM en vez de canvas; Publicación pasa de ruta a lente.
- `backlog.md`: la casilla del subproyecto 2.
- `docs/architecture/graph.json`, regenerado.
- Evidencia en `docs/testing/`.
- Cierre de #1541. Issues para lo que quede pendiente.
