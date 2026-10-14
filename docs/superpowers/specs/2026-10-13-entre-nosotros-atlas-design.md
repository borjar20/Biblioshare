# Entre nosotros como atlas visual

> [Histórico · implementado 2026-10-14] Diseño aprobado en conversación el 2026-10-13 e
> implementado en cuatro fases. Sustituye la vista Obras (Venn general › cruce › obra) y la
> vista Gustos de [la spec del 2026-10-10](2026-10-10-entre-nosotros-design.md). Evidencia:
> [F1](../../testing/2026-10-13-entre-nosotros-atlas-f1.md),
> [F2 · Opinión](../../testing/2026-10-13-entre-nosotros-atlas-f2.md),
> [F3 · Tiempo e Islas](../../testing/2026-10-14-entre-nosotros-atlas-f3.md) y
> [F4 · portadas, lista, teclado y estado](../../testing/2026-10-14-entre-nosotros-atlas-f4.md).
> El estado vivo está en el código y en `docs/architecture/graph.json`; lo que quedó
> pendiente está en las issues #1520–#1527.
> Prototipo de referencia (fuente de verdad del comportamiento):
> [`assets/entre-nosotros-atlas-prototipo.html`](assets/entre-nosotros-atlas-prototipo.html).
> Inspiración: Endless Atlas (mapa con zoom y lentes) y Cinema Circle (avatares sobre la
> escala de nota).

## 1. Propósito y alcance

«Entre nosotros» pasa a ser un **único lienzo a pantalla completa** en el que las obras de
un grupo se ven como un mapa con zoom. Las mismas obras se recolocan según la **lente**
elegida. No hay listas ni flujos de pasos, salvo la lista accesible (§7). Funciona igual en
escritorio, en móvil y en el wrapper Android de Capacitor.

Se sustituyen:

- la vista de grupo (avatares, «N historias os conectan», «Comparar selección»);
- el Venn con migas Grupo › Venn general › Cruce › Obra;
- las pestañas Todas / Os encantó / Notas parecidas / Diferencia de opinión y la rejilla
  «N obras en esta región»;
- la sección **Gustos** entera: sus agrupaciones por género y autor/director pasan a la
  lente Islas (§4.4).

Se conservan:

- los grupos guardados (privados, de 2 a 10 personas), su editor y el par sin guardar
  `?con=` (#1484);
- el filtro de formato Todos / Libros / Películas / Series;
- la revalidación de sesión y grupo (`SessionBoundary` y la secuencia de cargas de
  `explorer.tsx`).

Fuera de alcance: tablas, columnas, RLS o migraciones nuevas. Si alguna resultara
necesaria, se para y se consulta.

## 2. Datos

### 2.1 Carga

Se mantiene **una sola carga** por grupo y revisión: `loadComparison(groupId, 'all')`
(`src/lib/comparisons/actions.ts`), con `resolveGroup` → `evidence` → `revalidate`. El
formato se sigue derivando en cliente con `forFormat`. No hay `use cache`: el resultado
depende de la sesión (regla #437).

### 2.2 Cambio de contrato (solo TypeScript)

`PersonWork` gana `date: string | null` (ISO `YYYY-MM-DD`). Se fija en `normalize`:

| Obra | Pase que da la nota | `date` |
|---|---|---|
| Libro / película | Último `completed` (orden actual de `sortPasses`) | Su `finished_on` |
| Serie con pase activo en curso | `activeInProgress` | `watched_on` más reciente de sus episodios |
| Serie cerrada | Último `completed`/`dropped` | Su `finished_on`, o el último `watched_on` si es nulo |

La **propiedad no cambia**: es exactamente el criterio actual de `normalize`, que deriva
de `passes` y `episode_watches` y nunca de `library_entries`. Así el grupo de dueños
{A, B} del atlas tiene el mismo tamaño que la región A∩B exacta del Venn actual.

### 2.3 Modelo del atlas

`src/lib/comparisons/atlas/model.ts` transforma el `Snapshot` presentado (con «Tú») en:

```ts
type AtlasPerson = { id: string; name: string; avatarUrl: string | null;
  color: string; ink: string; isMe: boolean };
type AtlasWork = { key: WorkKey; itemType: Media; itemId: string; title: string;
  coverUrl: string | null; genres: string[];
  creators: { id: string; name: string; role: 'author' | 'director' }[];
  owners: { userId: string; rating: number | null; date: string | null }[] };
```

- Personas: los miembros **disponibles** en el orden de slot del grupo, con «Tú» primero si
  está. Los colores salen de una paleta fija de 10, asignada por ese orden y pensada para
  fondo oscuro (§6).
- Obras: ordenadas por `itemType` + `itemId`, que es el criterio estable de todas las
  espirales.
- Nulos: una obra sin nota no entra en Opinión ni cuenta en las medias de Islas. Una obra
  sin fecha no entra en Tiempo. En las demás lentes sí aparecen. Los resúmenes cuentan
  solo lo dibujado.

## 3. Arquitectura

```
src/lib/comparisons/atlas/
  model.ts     Snapshot → AtlasPerson[] + AtlasWork[]
  layout.ts    layoutQuien, layoutOpinion, layoutTiempo, layoutIslas, sharedGroups
  summary.ts   resumen por lente → { key, values } (texto en next-intl)
  camera.ts    toScreen, toWorld, zoomAt, fit(extent, viewport)
src/components/comparisons/atlas/
  atlas-canvas.tsx  bucle rAF, dibujo, gestos, LOD y caché de portadas
  atlas-view.tsx    barra superior, caras, dock, resumen, mini-ficha y lista
  group-sheet.tsx   hoja de grupos (envuelve el group-editor.tsx existente)
```

- Las funciones de `layout`, `summary` y `camera` son **puras y deterministas**, sin
  simulación física. Reciben las obras, las personas activas, la referencia y la
  opción de lente, y devuelven `{ key, x, y, instances? }` en coordenadas de mundo.
- `atlas-view` deriva todo de props (regla de oro de `ARQUITECTURA.md` §3). El estado
  local se limita a la lente, la opción de Islas, las caras activas, la cámara y la obra
  seleccionada. No se copia el `Snapshot` en `useState`.
- El canvas recibe ya calculados los objetivos de cada obra y solo interpola. Lee los
  colores como datos (strings) y no como clases de Tailwind.
- i18n: todas las cadenas viven en `messages/es.json` bajo `comparisons.atlas.*`. Las
  de servidor se componen en servidor y las de cliente usan `useTranslations`. Los
  resúmenes son plantillas ICU con valores.
- `explorer.tsx` conserva `SessionBoundary`, la máquina de carga
  (`loading`/`response`/`refresh`) y la gestión de grupos. Pierde secciones, vistas
  (`group`/`venn`/`region`/`work`) y controles de Gustos.

## 4. Lentes

El dock inferior tiene cuatro lentes: **Quién · Opinión · Tiempo · Islas**. Al cambiar de
lente, de opción de Islas o de caras, las obras **vuelan** a su nueva posición
(interpolación exponencial, factor ≈ 0,11 por frame, como el prototipo) y la cámara se
reencaja con `fit`. Con `prefers-reduced-motion` saltan directamente.

### 4.1 Quién

- Las personas son polos en un polígono regular de radio R, el primero arriba. Con dos
  personas, los polos van en horizontal.
- Cada obra va al grupo de su **conjunto exacto de dueños** (entre todos los miembros
  disponibles, no solo los activos). El grupo se sitúa en el centroide de esos dueños,
  multiplicado por 0,92 si son varios. Dentro, las obras forman una espiral de girasol:
  ángulo áureo y `r = S·√(i + 0,5)`.
- Hay un hilo de cada dueño a cada grupo compartido, con grosor ∝ √n. Va en color de la
  persona si todos los dueños del grupo están activos y apagado si no.
- La cifra va encima de cada grupo compartido, y en dorado si es común a todas las
  activas. Los grupos de menos de 3 obras no llevan cifra ni hilo, solo puntos tocables,
  para no saturar el centro con 6–10 personas.
- Tocar un polo activa o desactiva esa cara. Tocar un grupo, con zoom de puntos, hace
  zoom hacia él.
- Resumen: «{n} obras en común entre {nombres}». Con una sola cara: «{n} obras de
  {nombre}. Suma a alguien para ver el cruce.»
- Ajuste 2026-10-14 tras prueba con datos reales: con 4 personas en cuadrado, los
  centroides de las parejas opuestas y el de las cuatro caían en el mismo punto, y un grupo
  de una sola persona (830 obras) tapaba su polo. Ahora el grupo de una persona va hacia
  fuera, más allá de su polo (debajo si es la única persona), y su nombre y cifra se pintan
  del lado contrario. Los compartidos pasan, tras el centroide, por una separación
  determinista (80 pasadas, el grande se mueve menos) que también los mantiene lejos de
  todos los polos.

### 4.2 Opinión

- Entran las obras que tienen nota de la **referencia** («Tú» si está activa; si no, la
  primera cara activa) y de al menos otra cara activa.
- Eje X: nota de la referencia. Eje Y: media de las demás activas con nota (escala 1–10).
  Llevan un jitter determinista por `key` para que no se solapen.
- Fondo: el marco, la diagonal discontinua y la banda de acuerdo (±1). Las cuatro
  esquinas llevan nombre: «Os encantó», «Ni fu ni fa», «Tú sí, ellos no» y «Ellos sí, tú
  no». Si la referencia no es Tú, «Tú» se sustituye por su nombre.
- Color: dorado si |dif| ≤ 1, degradado a coral hasta |dif| ≥ 4.
- Mini-ficha (idea de Cinema Circle): una escala 1–10 con el **avatar de cada persona**
  en su nota, no la media.
- Resumen: «Coincidís en {a} y chocáis en {c} de las {n} que compartís», con coincidir
  = |dif| ≤ 1 y chocar = |dif| ≥ 3. Son los mismos umbrales que «Notas parecidas» y
  «Diferencia de opinión» de la spec anterior.
- Ajuste 2026-10-14 tras prueba con datos reales: los textos nombran con quién se compara.
  Con una sola cara más: «Nota de {nombre}» y «Tú sí, {nombre} no»; con dos o tres: «Media
  de {nombres}» y «el resto» en las esquinas; con más de tres, «Media de {n} personas».
  «Ellos» se leía mal cuando era una persona o una media. La escala de la mini-ficha solo
  pone a las caras activas y escribe la nota de cada cual en cifras bajo la pista.

### 4.3 Tiempo

- Hay una vía horizontal por cara activa. El eje X son años, con el rango ajustado a las
  fechas reales de lo que se dibuja, redondeado a años completos.
- Cada obra aparece **una vez por cada dueño activo con fecha**, en su vía y su fecha. Las
  apariciones se unen con un hilo bézier, más marcado si la obra es común a todas.
- Resumen: «Llegaste tú primero a {x} de las {n} que compartís», contando solo las obras
  compartidas con fecha en todos sus dueños activos. Si Tú no está activa: «Las vías de
  {nombres}». Si hay obras compartidas sin fecha, se añade «({k} sin fecha)».
- Ajuste 2026-10-14 tras prueba con datos reales: con dos o más caras activas solo se
  dibujan las obras que comparten al menos dos de ellas; con una cara, todo lo suyo. Las
  obras de una sola persona llenaban su vía sin nada que comparar.

### 4.4 Islas

La lente lleva un mini-selector encima del dock: **Tipo · Género · Autor/Director**.

- **Tipo**: tres islas (libros, películas, series) con los acentos de
  `src/lib/catalog/media-accent.ts`. Si el filtro de formato no es «Todos», esta opción no
  se ofrece y la lente pasa a Género.
- **Género** y **Autor/Director**: se dibujan como islas las 10 categorías con más obras
  compartidas por las caras activas (desempate por total y después por nombre). El resto
  va a una isla «Otros». En Autor/Director, los libros cuentan por autor y las películas
  por director. Las series no tienen autor o director en catálogo, así que en esta opción
  solo van a «Otros».
- Una obra con varias categorías aparece **en cada una de sus islas**, con sus
  apariciones unidas por un hilo, igual que en Tiempo. Una obra sin categoría va a «Otros».
- Orden dentro de cada isla, en espiral: primero lo común a todas las activas, luego lo
  compartido por varias y después el resto. Un aro dorado discontinuo rodea el núcleo
  compartido.
- Sobre cada isla hay un **título**, «{n} en común», y una **tira de medias**: el avatar
  de cada cara activa en su nota media de esa categoría sobre una escala 1–10. Solo
  aparece si esa persona tiene 3 o más obras con nota allí, la regla de Gustos. Esto
  sustituye a Gustos.
- Resumen: «Donde más os parecéis: {categoría}, con {n} en común».
- Ajuste 2026-10-14 tras prueba con datos reales: igual que en Tiempo, con dos o más caras
  activas solo entran las obras que comparten al menos dos de ellas.

## 5. Nivel de detalle, cámara e interacción

### 5.1 Nivel de detalle por zoom (umbrales del prototipo)

| Zoom `k` | Se dibuja |
|---|---|
| ≤ 1,1 | Puntos: color de la persona si tiene un solo dueño, crema si es compartida, dorado si es común a todas las activas |
| > 1,1 | Portadas con puntitos de color de cada dueño; aro dorado si es común (o color de diferencia en Opinión) |
| > 3,2 | Además, el título sobre la portada |

### 5.2 Rendimiento

- Se dibuja bajo demanda: `requestAnimationFrame` solo mientras se mueven la cámara, una
  obra o una opacidad.
- Se descarta lo que cae fuera de pantalla, con un margen de 60–80 px.
- `devicePixelRatio` con tope de 2. Se redimensiona con `ResizeObserver` sobre el
  contenedor, no sobre `window`.
- Las portadas se cargan **solo** con zoom de portada y obra visible. La URL sale del
  loader existente (`src/lib/images/cdn-loader.ts`) con un ancho de 96: el proyecto no usa
  el optimizador de Vercel. Hay una caché LRU de unos 300 `HTMLImageElement`. Mientras
  carga, o si no hay portada, se dibuja el bloque con el color del tipo.
- Objetivo: 60 fps con 1.000 obras en un Android de gama media.

### 5.3 Controles

| | Escritorio | Móvil / Capacitor |
|---|---|---|
| Zoom | Rueda centrada en el cursor, doble clic, botones + − ⤢ | Pellizco con dos dedos, doble toque |
| Mover | Arrastrar | Arrastrar con un dedo |
| Obra | Hover = tooltip; clic = abrir ficha | Primer toque = hoja inferior con «Abrir ficha»; segundo toque o el botón = navegar |
| Caras | Chips a la derecha del título | Fila con scroll horizontal bajo el título |
| Lentes | Icono + texto | Solo icono (≤ 640 px), con `aria-label` |
| Teclado | `+`/`-` zoom, `0`/`F` encajar, flechas mover, `1`–`4` lentes | — |

- El canvas lleva `touch-action: none` y Pointer Events con `setPointerCapture`. Hay un
  umbral de 5 px entre toque y arrastre.
- La ficha se abre en `/libro/[id]`, `/pelicula/[id]` o `/serie/[id]`.
- La lente, la opción de Islas y las caras viven en la URL (`?lente=&islas=&caras=`,
  con `router.replace`). La cámara se guarda en `sessionStorage` por grupo, para que al
  volver atrás desde una ficha el mapa siga donde estaba. Si `sessionStorage` falla, se
  hace `fit`.
- *(Revisado.)* Las caras ya no van en la URL: pasan a `sessionStorage` por cuenta y grupo
  junto a la cámara, y `caras=` desaparece (decisiones, 2026-10-14).

## 6. Composición visual

- La ruta `/comunidad/entre-nosotros` entra en `isFullscreenRoute`
  (`src/components/nav/fullscreen-routes.ts`): sin topbar ni barra inferior, a `100dvh`.
  Los elementos fijos usan `env(safe-area-inset-*)`.
- El atlas es **siempre oscuro**, sea cual sea el tema de la app. Sus tokens son propios y
  van en el CSS module del atlas: `--ground`, `--panel`, `--line`, `--fg`, `--muted`,
  `--faint`, `--glow`, `--clash` y `--agree`, con los valores del prototipo. Los acentos de
  tipo salen de `media-accent`. La paleta de personas es fija, de 10 colores, legible
  sobre `--ground`.
- Barra superior, de izquierda a derecha: «← Comunidad», el título «Entre nosotros», el
  **chip de grupo** (nombre del grupo; abre la hoja de grupos) y el **chip de formato**.
  Debajo, el resumen en una región `aria-live="polite"`. Las caras van a la derecha en
  escritorio y en una fila desplazable bajo el título en móvil.
- La hoja de grupos sirve para elegir grupo, crear uno, editar el actual y guardar el par
  `?con=` como grupo. Reutiliza `group-editor.tsx` y el aviso de privacidad («Selección
  privada»).
- Dock inferior: las lentes, más la opción de Islas cuando está activa, y una leyenda de
  una línea por lente (las `CAPS` del prototipo). Abajo a la derecha, en escritorio, los
  botones de zoom.
- Tipografía: la del sistema de diseño de la app, no las fuentes del prototipo, salvo que
  la revisión visual de F1 diga lo contrario.
- Ajuste 2026-10-14 tras prueba con datos reales: la mini-ficha (hover y hoja táctil)
  enseña la portada real por el loader del CDN, con el bloque de color del tipo si no hay
  portada o falla, y solo lista a los dueños que son caras activas.

## 7. Accesibilidad

- El canvas lleva un `aria-label` que describe la lente y el resumen.
- Botón **«Ver como lista»**: muestra una rejilla de portadas (enlaces a la ficha) con el
  mismo filtro de caras, formato y lente, ordenada según la lente:
  - Quién: por grupo de dueños.
  - Opinión: por |dif| descendente.
  - Tiempo: por fecha.
  - Islas: por isla.

  Es la vía para teclado y lector de pantalla.
- Las caras son botones con `aria-pressed`, igual que las lentes. Los estados vacíos usan
  `EmptyState`.

## 8. Estados y errores

- **Carga**: el lienzo oscuro con los polos de las personas latiendo. Sin evidencia.
- **Error** de carga: el bloque actual (`errors.*`, `loadConflict`) con reintento, sobre
  fondo oscuro.
- **Sin grupos o sin seguidos**: los `EmptyState` actuales, adaptados al fondo oscuro.
- **Cambio de cuenta o de sesión**: el `SessionBoundary` actual, sin cambios. Oculta la
  evidencia antes de que responda la red.
- **Miembro no disponible**: chip gris no pulsable y sin polo.
- **Serie histórica sin episodios**: se mantiene el aviso `excludedHistoricalSeries` bajo
  el resumen.

## 9. Pruebas

**Vitest** (runner node-only):

- `model`: la propiedad es idéntica a `normalize` y `date` sale del pase de la nota
  (relectura, `finished_on` nulo, serie en curso y cerrada). «Tú» va primero y los
  colores son estables.
- `layout`: en grupos de 2 y 3 miembros disponibles, los tamaños de grupo de Quién son
  iguales a los de `regions()` del Venn actual con esas mismas personas (fixtures
  existentes). También se prueba:
  - que las posiciones son deterministas;
  - que Opinión y Tiempo excluyen los nulos;
  - que las islas tienen top 10 + «Otros», con duplicados y orden interno;
  - que las medias aplican la regla de 3 notas.
- `summary`: cada número es igual al recuento de lo dibujado.
- `camera`: `toWorld∘toScreen = id`, `zoomAt` deja fijo el punto bajo el cursor y `fit`
  cubre la extensión.
- `atlas-view` (RTL): caras con mínimo 1, lentes, opción de Islas y la lista accesible.
  El canvas solo se monta con un contexto 2D falso.

**Playwright**: se reescribe `e2e/entre-nosotros.spec.ts` en dos proyectos de
`playwright.comparisons.config.ts`, escritorio y móvil (Pixel 7, `hasTouch`). Los casos:

- cargar
- alternar una cara (cambia el resumen)
- recorrer las cuatro lentes y las tres opciones de Islas
- abrir una ficha desde el tooltip en escritorio y desde la hoja inferior en móvil
- volver atrás conservando lente y caras
- «Ver como lista»

Para localizar obras en el canvas, el componente publica en `data-*` la posición en
pantalla de las obras visibles con nombre. Las pruebas van contra un build de
producción, en tandas de 2–3 specs (`TRAMPAS.md` §5).

**Manual**: el APK del wrapper en un móvil real (pellizco, fps con unas 1.000 obras y
safe areas).

## 10. Fases

Al final de cada fase hay capturas de escritorio y móvil, y el trabajo se para hasta el
visto bueno.

1. **F1 · Base y Quién**:
   - `date` en el contrato, y `model`, `camera`, `layoutQuien` y `summary`;
   - ruta inmersiva oscura, barra superior con grupo y formato, caras y dock (solo Quién);
   - LOD de puntos y portadas de color plano;
   - tooltip y hoja inferior con navegación a la ficha.

   El atlas sustituye a Obras y Gustos sigue provisionalmente.
2. **F2 · Opinión**: la lente y la escala de avatares en la mini-ficha.
3. **F3 · Tiempo e Islas**: las dos lentes con sus tres opciones, las medias por
   categoría y las transiciones entre lentes. Se **retira Gustos** y su código.
4. **F4 · Pulido**:
   - portadas reales con LRU;
   - «Ver como lista» y atajos de teclado;
   - estado en la URL y cámara en `sessionStorage`;
   - rendimiento en el Android;
   - retirada del código muerto (`canvas.tsx`, `geometry.ts`, `morph.ts`, `motion.ts`,
     `use-camera.ts`, `tastes.tsx`, `work-detail.tsx`, `regions`/`facets` de `derive.ts`
     sin usos) y de sus claves i18n.
5. **Cierre**:
   - `docs/architecture/graph.json` (nodos `c-comparisons` y `flow-comparison`);
   - entrada en `decisiones.md` (el atlas sustituye a Obras y Gustos; oscuro fijo e
     inmersivo);
   - casilla del backlog;
   - evidencia en `docs/testing/`.
