# Fidelidad Paper · 01 — Inicio (Feed)

> Parte de la iniciativa **fidelidad Paper** (una sesión por pestaña). Índice y convenciones en [`README.md`](./README.md).

> **PLAN 01 CERRADO Y MERGEADO (2026-07-17).** T1–T4 en la PR #69 (squash `c605366`), T5 en la **#70** (`6262296`) y T6 en la **#71** (`dbc8275`). Todas las decisiones (P1–P4 + las cuatro del frame G) están registradas aquí.
>
> **Del frame G no queda nada por construir:** "Registrar algo nuevo" fue **descartado** por el usuario, no aplazado. Nada de este plan está a medias.
>
> **Antes de tocar el feed, lee la [§6 Hallazgos](#6-hallazgos-de-ejecución-t1t4--pr-69--2026-07-17):** `getFeed` ya no devuelve `FeedEvent[]` sino `FeedEntry[]` (unión persona|club), y la URL del filtro es `?filtro=`, de selección única.
>
> Todas las decisiones cerradas, incluida la del rail contra el bloque de hoy (§7).

**Maquetas de referencia**
- `Paper - IA nueva (Inicio + Perfil).html` → frame **A · Inicio · Feed** (móvil, la verdad vigente)
- `Paper - Home (feed + stats).html` → frame **B · Escritorio · feed + barra lateral** (dos columnas)

**Objetivo:** que la pestaña Inicio (`/`) sea indistinguible del frame A en móvil, y decidir/implementar el layout de escritorio del frame B.

---

## 1. Estado actual

| Pieza | Archivo | Estado |
|---|---|---|
| Página | `src/app/(home)/page.tsx` | ~~Una sola columna `max-w-2xl`~~ → **dos columnas desde `lg`** (feed + rail 312px) y cabecera por breakpoint (T3). |
| Tarjeta de feed | `src/components/social/feed-card.tsx` | Muy fiel: avatar 34px, portada 52×78 con `shadow-cover`, título serif 14px, autor itálica serif 11px, RatingDots, excerpt 12.5px. |
| Filtros | `src/components/social/feed-filters.tsx` | Chips mono uppercase con activo teñido de accent. ~~Todo · Libros · Películas · Series · Solo reseñas~~ → **Todo · Reseñas · Libros · Pantalla · Clubes**, selección única, `?filtro=` (T4). |
| Lista + paginación | `src/components/social/feed-list.tsx` | Cursor + carga incremental. |
| Topbar | `src/components/header.tsx` | Ya es Paper: sticky, blur, wordmark, campana, theme toggle. No navega (nav en BottomNav/SideNav). |
| Datos | `src/lib/social/feed.ts` + `club-feed.ts` | Eventos de personas (4 fuentes) **+ actividad de clubes** (T4). Devuelve `FeedEntry[]`, no `FeedEvent[]` — ver §6. |
| Rail escritorio | `src/components/stats/stats-rail.tsx` | Nuevo (T3): resumen de stats a `lg`. NO es el Panel (sin calendario, retos ni formulario). |

~~Lo grueso del frame A ya está hecho. Lo que queda es (a) detalles finos de la tarjeta, (b) el layout de escritorio, y (c) decisiones funcionales.~~ **Todo eso está HECHO (T1–T4)**, y el bloque del frame G también: T5 (destacado + carrusel) y T6 ("Para más tarde"). **El plan no tiene nada pendiente.**

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

1. **Cabecera de página** — Maqueta: `h1` "Novedades" en **Fraunces 600 24px** + contador `sigues a 24` en mono 11px a la derecha (misma línea, `align-items:baseline`). Actual (`page.tsx:69`): `text-2xl font-semibold` **sin `font-serif`**. Añadir `font-serif` y verificar el peso (600).
2. **Excerpt de reseña** — Maqueta `.fitem .tx`: color `#584f43` (un marrón más oscuro que `--muted`), `line-height:1.55`. Actual (`feed-card.tsx:127`): `text-muted-foreground` `leading-relaxed`. Es un color intermedio entre `foreground` y `muted-foreground`; opciones: `text-foreground/80` o un token derivado. En dark el equivalente de maqueta (Modo oscuro.html) hay que comprobarlo antes de fijar valor.
3. **Fila de reacciones** — Maqueta `.frx`: separador `border-top: 1px solid var(--border)` con `padding-top:11px; margin-top:12px`, texto 11.5px muted, iconos ♥ y ❝ con gap 16px. Verificar `review-interactions.tsx` contra esto (separador y tamaños).
4. **Dot de estado en evento "añadió"** — Maqueta frame A (línea 237): texto del estado en **el color del estado** (`color:var(--st-planned)`, weight 600, 11px), no en muted. Actual (`feed-card.tsx:117`): `text-muted-foreground`. Cambiar a texto teñido por estado (`text-status-planned` etc. — comprobar que existen esas utilidades de texto; si no, añadirlas en `globals.css`).
5. **Espaciados de página** — Maqueta: cabecera `padding:18px 20px 8px`, cuerpo `12px 20px 22px`, gap entre filtros y primera tarjeta 16px, entre tarjetas 12px. Actual: `gap-6 px-4 py-8`. Ajustar a ritmo de la maqueta (py más corto arriba, gap 3 entre tarjetas).

## 3. Divergencias funcionales — RESUELTAS (2026-07-15) · **TODAS EJECUTADAS (2026-07-17)**

- **P1 · DECIDIDO: SÍ, clubes en el feed.** `getFeed` emite también eventos de los clubes del usuario (nueva actividad, propuestas) y `feed-card.tsx` gana la variante club (badge verde `club-badge`, "N se apuntan"). Desbloquea la Tarea 4.
- **P2 · DECIDIDO: set de la maqueta** — `Todo · Reseñas · Libros · Pantalla · Clubes`. "Pantalla" = películas+series combinado (soportarlo en `getFeed`); "Clubes" filtra los eventos de P1.
- **P3 · DECIDIDO: feed + rail de stats en escritorio** (frame B): dos columnas con rail sticky de 312px reutilizando los componentes del Panel, con el saludo "Hola, {nombre}". Desbloquea la Tarea 3.
- **P4 · DECIDIDO: Compartir se POSPONE** — se decidirá cuando haya un destino claro (share nativo vs compartir a club).
- **Nuevo (P-T5 transversal):** entra el bloque **"¿Qué has disfrutado hoy?"** encabezando el Inicio sobre el feed (frame G de Estadísticas y features) — añadir como tarea propia en la sesión de este plan.

## 4. Tareas

> Cada tarea es independiente y committeable por separado. Las de §3 solo tras decisión.

### ✅ Tarea 1 — Afinado visual de la página del feed — HECHA (`3cb241b`)
- **Modificar:** `src/app/page.tsx`
- `h1`: `className="font-serif text-2xl font-semibold tracking-tight"` (Fraunces ya es la font-serif del proyecto).
- Contenedor: pasar de `gap-6 … py-8` a cabecera/cuerpo con el ritmo de la maqueta (`pt-5 pb-2` cabecera, `gap-4` filtros→lista).
- Verificar en `feed-list.tsx` que el gap entre tarjetas sea 12px (`gap-3` o `mb-3`).
- **Prueba:** `npm run dev`, comparar lado a lado con el frame A (abrir la maqueta en el navegador). Ejecutar e2e de feed si existe (`npx playwright test`, spec de feed) — solo debe cambiar estilo, no estructura de datos.
- Commit: `style(feed): cabecera serif y ritmo de espaciado del mockup IA nueva`

### ✅ Tarea 2 — Tarjeta de feed: excerpt, reacciones y dot de estado — HECHA (`3cb241b`)
- **Modificar:** `src/components/social/feed-card.tsx`, `src/components/social/review-interactions.tsx`, quizá `src/app/globals.css`
- Excerpt: subir contraste (equivalente a `#584f43` → p. ej. `text-foreground/75`); mantener 12.5px/1.55.
- Estado en "añadió": `text-status-{status}` en vez de muted (añadir utilidades de texto por estado si faltan).
- Reacciones: separador superior + 11.5px + gap 16px si no coincide ya.
- **Prueba:** feed con reseña, terminado y alta (usuario dev con datos); light y dark. E2e existentes de interacciones deben seguir verdes.
- Commit: `style(feed): tarjeta fiel al mockup (excerpt, estado y reacciones)`

### ✅ Tarea 3 — Layout de escritorio — HECHA (`af33106`)
- Si se aprueba el rail: **modificar** `src/app/page.tsx` a grid `lg:grid-cols-[1fr_312px]` con `<aside>` sticky (`top-20`) reutilizando `now-consuming.tsx`, `stats/weekly-strip.tsx`, `stats/streak-card.tsx`, `stats/book-goal-card.tsx`, `stats/goal-rows.tsx` (los mismos del Panel de Perfil — extraer a un componente compartido `src/components/stats/stats-rail.tsx` para no duplicar queries: las funciones de datos ya existen para el Panel).
- Si se rechaza: solo ensanchar tipografía del saludo/cabecera en `lg` si se decide el saludo.
- Commit: `feat(feed): rail de stats en escritorio (mockup Home B)`

### ✅ Tarea 4 — Clubes en feed y filtros nuevos — HECHA (`cb34dfb`)
- Salió tal cual se preveía: `src/lib/social/feed.ts` (unión con actividad de clubes), tarjeta de club con el `club-badge` verde y `feed-filters.tsx` con el set nuevo. Detalles en §6.
- **Compartir sigue fuera** (P4 lo pospuso): el frame B lo dibuja (`↗ Compartir`) pero es el mockup viejo de la IA anterior. Sin destino claro, no entra.

### ✅ Tarea 5 — Bloque "¿Qué has disfrutado hoy?" (frame G) — HECHA (PR #70, `fad05df`)
- **Maqueta:** frame **G** de `Paper - Estadísticas y features.html`. Encabeza el Inicio, **sobre** el feed.
- **Decisiones del usuario (2026-07-17):**
  - **Alcance: solo el bloque de hoy** (cabecera con la fecha + destacado + carrusel "Continúa donde lo dejaste"). Ver §8 para lo que queda del frame.
  - **Destacado: la sesión más reciente.** Descartadas "la racha viva" (la racha es global, no por ítem) y "el más cerca de acabar" (deja clavado un libro al 95% sin tocar).
  - **Escritorio: ancho completo sobre las dos columnas.**
- **Datos nuevos:** `lib/stats/get-today-focus.ts` — `started_on` del pase (el "Día N · desde 8/7") y las `progress_sessions` con texto (el "N notas"). El resto ya existía.
- **Afinado después, a petición del usuario** (mismo PR):
  - **La acción cambia por tipo.** Libro → cronómetro EN la tarjeta (el mismo de la vista de sesión: misma librería y misma clave de localStorage, así que no pierde un segundo al saltar, y sobrevive a recargar). Al pulsar Registrar se para, se limpia y los minutos van a `/sesion/[passId]?minutos=N`. Serie → no hay cronómetro (se mide en episodios): marca el siguiente. Película → solo Registrar.
  - **Las mini SUBEN al destacado** en vez de llevar a la ficha (372 ms, estado de cliente, sin tocar la URL). Por eso el próximo episodio se resuelve para CADA serie, no solo la destacada.
  - **La racha de las tarjetas es la del PASE**, no la global (§6 punto 11). Eso desbloqueó el "◆ 4 d" que el frame dibuja en las mini.
  - **Fuera el tipo de la cabecera** ("Libro · "): ya lo dicen el verbo y el color.

### ✅ Tarea 6 — "Para más tarde" (frame G) — HECHA
De los dos bloques que la T5 dejó fuera, entra uno.

- **"Registrar algo nuevo"** (`.qadd`): **DESCARTADO** por el usuario (2026-07-17). No se construye, y con él cae la **casilla "+"** que cerraba la estantería en el frame: era su gemelo (añadir a la cola sin salir del Inicio). Añadir sigue siendo cosa de **Buscar**, donde vive la escalera de hidratación.
- **"Para más tarde"** (`.tbr`): **HECHA** — `src/components/stats/later-shelf.tsx`.

**La duda del alcance ("¿atajo o duplicación?") la respondieron los datos: es un ATAJO.** Enseña hasta 12 portadas de una cola que puede tener 32, sin filtros, sin orden y sin rejilla — para elegir lo próximo de un vistazo. "Ver todos" lleva a `/coleccion?status=planned`, que es la vista completa y ya existía (el pill "Pendiente" sale activo). Duplicar habría sido pintar aquí la rejilla entera.

**Decisión del usuario — escritorio: rail del bloque de hoy.** El frame G solo está dibujado para móvil, así que P-T7 obligaba a proponerlo antes de escribirlo. A la izquierda el destacado con sus mini **debajo** (antes iban al lado); a la derecha, la estantería. En móvil se apila y el carrusel sangra hasta el borde, como el frame.

**Datos: ninguno nuevo.** El estado se llama **`planned`** ("Pendiente") y `getLibraryItems(..., { status: "planned" })` ya existía — es el mismo que usa Colección.

**Sin nada en curso el bloque de hoy no se pinta, pero la estantería SÍ**, a ancho completo: es justo cuando más sirve, porque sin nada a medias lo que necesitas es elegir lo próximo. Verificado volteando el único pase en curso y restaurando la fila entera (idéntica salvo `updated_at`).

## 5. Verificación de cierre

Todo de 2026-07-17. **Todas las casillas cerradas: T1–T6.**

La suite final del plan, con la máquina sana: **22 pasados · 1 saltado · 0 fallos · 5,3 min**. Una tanda intermedia dio 15 fallos en 33,4 min y **no era del código**: un `next dev` huérfano que Playwright dejó vivo al cortarse una pasada, inflado a 1,8 GB en una máquina de 7,8 GB (0,8 GB libres → todo a swap). La métrica útil ahí es la **RAM libre**, no el número de procesos node: de los 19 vivos, 18 ocupaban ~0 MB.

- [x] Frame A y `/` en móvil (viewport 400px) lado a lado: cabecera, filtros y tarjetas. Medido: h1 Fraunces 600 24px; los 5 chips en UNA fila (353px de 360 útiles); primera tarjeta a 175px.
- [x] Frame B y `/` a 1280: rail 312px clavados, se ancla a 75px durante el scroll (`--topbar-h` + 16), sin scroll horizontal, y oculto a 400px.
- [x] Modo oscuro sin regresiones (tokens, nada hardcodeado): fondo `#1f1a16`, el badge verde del club legible.
- [x] `npx playwright test` verde: **21 pasados · 1 flaky · 1 saltado · 0 fallos** (5,8 min, Node 22). vitest 138/138. tsc limpio.
- [x] Preguntas P1–P4 respondidas y registradas (§3 + §6).
- [x] T5: frame G lado a lado, móvil y escritorio. Medido con datos reales (2 pases sembrados y **borrados** después, verificado a cero): orden por sesión más reciente correcto, `Pág. 167 / 760 · 22%`, `Día 7 · desde 11/7 · 1 nota`, sin scroll horizontal a 400 ni a 1280. e2e **22 pasados · 1 saltado · 0 fallos**, sin flaky.
- [x] T6: medido con **13 pendientes sembrados y borrados** después (12 por SQL + 1 por "Seguir"; cuenta devuelta a sus 65 pases activos exactos). A 1280: estantería en la columna derecha, 12 portadas en 2 filas de 6, "13 · Ver todos" → `/coleccion?status=planned`. A 400: carrusel que sangra al borde, sin scroll horizontal (`scrollWidth` = 400). Sin nada en curso: se cae la pregunta de hoy y la estantería queda sola a ancho completo. Oscuro con tokens. **0 errores de consola.**

## 6. Hallazgos de ejecución (T1–T4 · PR #69 · 2026-07-17)

**1. `getFeed` cambia de forma: `FeedEvent[]` → `FeedEntry[]`.** Una actividad de club **no es un ítem** (una tierlist o un reto pueden no tener obra), así que no cabía en `FeedEvent`, cuyos `itemType`/`itemId`/`itemTitle` son obligatorios. En vez de meter un ítem falso, la lista transporta una unión:

```ts
export type FeedEntry =
  | { source: "person"; id: string; eventDate: string; event: FeedEvent }
  | { source: "club";   id: string; eventDate: string; event: ClubFeedEvent };
```

`FeedEvent` **se queda intacto** a propósito: lo siguen consumiendo `recent-reviews.ts` (perfil), `shared-activity.ts` y los posts de club (`ClubPost.sharedActivity`). Meterle campos opcionales de club los habría contaminado a los tres. El orden, el cursor y el corte se aplican **sobre las entradas**, así que la paginación keyset sigue igual de determinista.

**2. La 5ª fuente es asimétrica, y es correcto.** Las otras cuatro miran a quién **sigues**; la de clubes mira de qué eres **miembro** (`club_members.status = 'active'`) — la gente no sigue a sus clubes, se apunta. Efecto lateral que conviene saber: **seguir a nadie ya no vacía el feed** si tienes clubes (antes había un `return` temprano con `followedIds.length === 0`).

**3. La tarjeta de club NO lleva comentarios, aunque el frame los dibuje.** Los targets de interacción son `diary_entry`, `episode_watch`, `club_post` y `activity_checkpoint` — `club_activities` **no** es uno. Poner "4 comentarios" habría sido un contador de mentira; darle interacciones sería infraestructura nueva (target + RLS). Se queda en "N se apuntan", que es lo que ya decidía P1. Solo entran las actividades `proposed` y `active`: una terminada o archivada no es novedad.

**4. Los filtros pasan a selección única y cambia la URL.** `?filtro=reviews|book|screen|clubs` sustituye a `itemType` + `reviewsOnly`, que se **combinaban** — el frame A los dibuja excluyentes. "Pantalla" = películas Y series (`.in("item_type", ["movie","series"])`), no un `item_type`. Los eventos de club no sobreviven a "Libros" ni a "Pantalla" (no son de un tipo de ítem) ni a "Reseñas".

**5. `--foreground-soft` POR FIN aplicado.** Era la deuda que señalaba el [§6 del plan 07](./plan-07-transversal.md): el token existía con el color exacto del `.tx` (#584f43 / #cabfb0) y estaba sin usar. No hizo falta inventar ningún `text-foreground/75`.

**6. `WeeklyStrip` estrena `showDailyGoal`.** El rail del frame B enseña solo las barras. Pasarle `dailyGoalMinutes={null}` habría sido mentir (eso significa "no tiene objetivo") **y además** caía en la rama del "0 min / Hoy", que en el frame B tampoco está. Prop propia y explícita.

**7. Dos cabeceras, una por breakpoint → dos tests fallaban DE VERDAD.** `happy-path` y `signup` afirmaban ver el encabezado "Novedades"; a 1280 está oculto (ahí se ve el saludo del frame B). **Es la misma regla que salió de la ficha** (plan 06 §6): con dos árboles por breakpoint, **todo locator lleva `:visible`** (`page.locator("h1:visible")`). Confirmada ya fuera de la ficha: es una regla de la iniciativa, no de una pantalla.

**8. Detalle fino que importa:** los 5 chips caben en una fila a 400px **por los pelos** (353 de 360 útiles). Con `px-3` y `tracking-wider` en vez de los `px-[11px]` / `.03em` de la maqueta, "Clubes" se caía a una segunda fila y empujaba el feed 37px. Aquí el milímetro de la maqueta no era capricho.

**9. Del frame G (T5, PR #70):**

- **En escritorio el bloque NO se estira.** A 1024px la tarjeta dejaba la portada en 58px y convertía la barra de progreso en una línea de 800px — el "móvil estirado" que prohíbe P-T7. Dentro del bloque: destacado (520px) y carrusel en paralelo. **Lección general: "ancho completo" nunca significa "estirar el móvil"; significa rehacer el interior.**
- **El "◆ 4 d" de las mini-tarjetas no está.** En el frame es una racha POR ÍTEM; la nuestra es global (`getStreaks`). Pintarlo con los días del pase sería fingir un dato que no tenemos. Si algún día se deriva la racha por pase, vuelve.
- **"Novedades" bajó a encabezar el FEED en móvil**: encima está el bloque, que es quien abre el Inicio. Móvil y escritorio comparten estructura (lo tuyo → lo de los demás). El `h1` visible por breakpoint no cambia, así que los locators `:visible` de la suite siguen valiendo.
- **Token nuevo `--gold-ink`** (#8a5a12 claro / #e0a94a oscuro): el texto del badge de racha. `--gold` puro no se lee sobre su propio tinte al 16%, y el frame G **solo trae el valor claro** — ninguna maqueta oscura cubre este badge. Par por tema, mismo patrón que `--foreground-soft`.

**10. Dos bugs del bloque de hoy que conviene no repetir:**

- **`rereadCount` NO es el ordinal del pase.** Cuenta los pases CERRADOS — es el "Leído N veces" de la colección y del CSV — así que no incluye el que tienes abierto: el ordinal de ESTE pase es `rereadCount + 1`. Sin el +1 una segunda lectura se anunciaba como la primera, y **la primera salía bien**, que es por lo que el fallo pasa desapercibido con datos normales.
- **"Sesión" no es una tabla, es un concepto.** Ordenar por la última `progress_sessions` mandaba TODAS las series al final (no tienen sesiones: se miden en episodios) y ninguna podía ser nunca la destacada. Lo último que tocas de una serie es su último episodio visto.
- **Al intercambiar tarjetas, keys.** React reutilizaba el mismo `<img>` y le cambiaba el src, pero el navegador seguía pintando la portada anterior hasta descargar la nueva: se veía la portada de un libro bajo el título de otro. El `src` era correcto desde el primer instante, así que **ningún assert de DOM lo habría cazado** — salió mirando una captura.
- **Una FUNCIÓN no cruza a un componente de cliente.** Pasar `focusLabel={(t) => …}` tiró la página entera a su error boundary. Es la misma regla que impide pasar `t` hacia dentro: cruzan datos, no funciones.

**11. Aviso de método — A/B confundido.** Llegué a "medir" que el rail costaba 18 s: comparé *con rail* en un servidor exhausto por una pasada de la suite contra *sin rail* recién arrancado. Con el server fresco en **ambas** ramas, el rail cuesta ~2,4 s de consultas en paralelo y el home carga en 4,2 s. Los 20 s eran la máquina (22 procesos node de otras sesiones). Ver [[e2e-contra-build-de-produccion]]: **si cae media suite, mira la carga antes que tu código**.

## 7. El rail contra el bloque de hoy — RESUELTO (2026-07-17)

Al juntar el frame B (rail de stats, IA vieja) con el G (bloque de hoy, posterior) los dos enseñaban lo mismo a 200px de distancia. Son maquetas que nunca se vieron entre sí — el mismo patrón que el **choque de shells** del plan 06 §6e.

**Decisión del usuario:**

| Dato | En el bloque (frame G) | En el rail (frame B) | Resuelto |
|---|---|---|---|
| Lo que estás consumiendo | El destacado + el carrusel | ~~"Ahora mismo"~~ | **FUERA del rail.** Duplicado literal, y el bloque es más rico: progreso y acciones, no solo portadas. Ahorra su consulta (`getLibraryItems`). |
| Racha | Badge "◆ Racha 2 d" — **del PASE** | "Racha · 2 días · mejor 5" — **GLOBAL** | **SE QUEDA.** Ya no es el mismo número: aquí son tus días seguidos leas lo que leas; allí, con ESE título. Dicen cosas distintas. |
| La semana | 7 puntitos — días de ESE pase | "Lectura esta semana" — tus minutos | Se queda: tampoco es el mismo dato. |
| Meta | Meta de HOY (minutos) | Meta de LIBROS (anual) | Nunca se duplicó. |

`NowConsuming` sigue vivo en **Perfil › Panel**, que es su sitio: ahí no hay bloque de hoy encima.

**Lección:** la duplicación se resolvió sola en dos de los tres casos al hacer la racha por pase. Antes de borrar una pieza "duplicada", mirar si lo que duplica es el DATO o solo la palabra.

## 8. Fuera de alcance / anotado

- **"Registrar algo nuevo"** (el `.qadd` del frame G): **descartado** por el usuario, no "pendiente". Con la T6 hecha, del frame G no queda nada por construir.
- **Pases huérfanos: "Pendiente · 4" pero solo 1 tarjeta.** Hallazgo de la T6, **preexistente y ajeno a este plan**. `getLibrarySummary` cuenta los pases activos a pelo, pero `getLibraryItems` hace `if (!meta) return null` (`get-library-items.ts:178`) y descarta en silencio los que apuntan a una obra sin fila en `books`/`movies`/`series`. En los datos de dev hay 3 así, del 2026-07-15 (huelen a la época anterior a la escalera de hidratación, PRs #34/#35). Resultado: el resumen y la rejilla dan números distintos para lo mismo, y "Para más tarde" hereda el de la rejilla. **No se toca aquí**: es un arreglo de Colección, no del Inicio, y hay que decidir si se limpian los huérfanos o si el resumen debe filtrarlos igual.
- **Compartir en el feed** (P4): pospuesto hasta tener destino claro. El frame B lo dibuja (`↗ Compartir`), pero es el mockup de la IA anterior.
- **Racha por ítem**: hoy `getStreaks` solo da la global. Bloquea el "◆ 4 d" de las mini-tarjetas.

## 9. Hallazgos de ejecución (T6 · 2026-07-17)

**1. Dos "Ver todos" apilados a 27px.** El rótulo "En curso · N · Ver todos" cruzaba las dos columnas, así que su enlace caía justo encima del "13 · Ver todos" de la estantería, con distinto destino (`?status=in_progress` vs `?status=planned`). Se arregló metiendo la cabecera **dentro** de la columna izquierda (slot `heading` de `TodayPicker`): cada rótulo manda sobre su columna y los dos arrancan a la misma altura. **Lo vio una captura, no un assert** — la misma lección que la portada rancia de la T5: los dos enlaces existían, eran correctos y estaban donde el DOM decía.

**2. Mi comprobación decía que el bloque no se pintaba, y mentía.** Busqué `includes("Para más tarde")` cuando el rótulo va en `uppercase` por CSS e `innerText` devuelve el texto ya transformado. El código estaba bien; el assert, no. Antes de "arreglar" un fallo, mirar si falla lo que mide.

**3. Sembrar por la UI no es fiable para preparar datos.** De 8 "Seguir" a través de buscar → ficha, solo cuajó 1 (los otros 7 no dejaron pase). Para preparar datos, SQL directo contra obras que ya están en el catálogo: rápido, y se borra por id exacto. La UI es para verificar, no para sembrar.
