# Fidelidad Paper · 01 — Inicio (Feed)

> Parte de la iniciativa **fidelidad Paper** (una sesión por pestaña). Índice y convenciones en [`README.md`](./README.md).

> **ESTADO (2026-07-17): T1–T4 HECHAS y MERGEADAS** (PR #69, squash `c605366`). Queda **una sola tarea, la 5**: el bloque "¿Qué has disfrutado hoy?" (frame G), que es del tamaño de las otras cuatro juntas y va en sesión propia.
>
> **Antes de tocar el feed, lee la [§6 Hallazgos](#6-hallazgos-de-ejecución-t1t4--pr-69--2026-07-17):** `getFeed` ya no devuelve `FeedEvent[]` sino `FeedEntry[]` (unión persona|club), y la URL del filtro es `?filtro=`, de selección única.

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

~~Lo grueso del frame A ya está hecho. Lo que queda es (a) detalles finos de la tarjeta, (b) el layout de escritorio, y (c) decisiones funcionales.~~ **Todo eso está HECHO (T1–T4).** Queda solo el bloque del frame G (T5).

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

### ⬜ Tarea 5 — Bloque "¿Qué has disfrutado hoy?" (frame G) — PENDIENTE, sesión propia
- **Maqueta:** frame **G** de `Paper - Estadísticas y features.html` (ojo: es el .html que MÁS se ha tocado — comprobar su fecha antes de calcar). Encabeza el Inicio, **sobre** el feed.
- **No es un remate, es una tarea grande.** El frame trae: cabecera con la fecha ("Miércoles · 15 jul") + el título; fila "En curso · N · Ver todos ›"; **tarjeta destacada** del ítem sobre el que más vas a actuar hoy, con portada, "Libro · 1ª lectura", "Día 6 · desde 8/7 · 3 notas", barra de progreso con "Pág. 240 / 662 · 38%", **meta de hoy** ("12 / 30 min"), **badge de racha** y **puntos de la semana**, y dos acciones rápidas (⏱ Sesión · ✎ Registrar); y debajo **"Continúa donde lo dejaste"**, un carrusel horizontal de los demás en curso (`.nowrow` / `.mini`), pensado explícitamente para no hacer scroll infinito.
- **Preguntar antes de codificar:** qué manda el "destacado" cuando hay varios en curso (¿el pase más reciente? ¿el de la racha?), y si en escritorio va encima del feed a todo el ancho o dentro de la columna del feed — el frame G solo es de móvil (P-T7: donde no hay frame de escritorio, el layout ancho se propone antes de codificar).
- Datos: casi todo existe ya (`getLibraryItems` en curso, `getStreaks`, `getWeeklyActivity`, `getProgress`, el `dailyGoalMinutes` del perfil). Lo que NO existe: "N notas" y "desde 8/7" del pase.

## 5. Verificación de cierre

De T1–T4 (2026-07-17). La casilla que queda es de la T5.

- [x] Frame A y `/` en móvil (viewport 400px) lado a lado: cabecera, filtros y tarjetas. Medido: h1 Fraunces 600 24px; los 5 chips en UNA fila (353px de 360 útiles); primera tarjeta a 175px.
- [x] Frame B y `/` a 1280: rail 312px clavados, se ancla a 75px durante el scroll (`--topbar-h` + 16), sin scroll horizontal, y oculto a 400px.
- [x] Modo oscuro sin regresiones (tokens, nada hardcodeado): fondo `#1f1a16`, el badge verde del club legible.
- [x] `npx playwright test` verde: **21 pasados · 1 flaky · 1 saltado · 0 fallos** (5,8 min, Node 22). vitest 138/138. tsc limpio.
- [x] Preguntas P1–P4 respondidas y registradas (§3 + §6).
- [ ] T5: frame G lado a lado, móvil y escritorio.

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

**9. Aviso de método — A/B confundido.** Llegué a "medir" que el rail costaba 18 s: comparé *con rail* en un servidor exhausto por una pasada de la suite contra *sin rail* recién arrancado. Con el server fresco en **ambas** ramas, el rail cuesta ~2,4 s de consultas en paralelo y el home carga en 4,2 s. Los 20 s eran la máquina (22 procesos node de otras sesiones). Ver [[e2e-contra-build-de-produccion]]: **si cae media suite, mira la carga antes que tu código**.
