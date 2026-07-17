# Fidelidad Paper · 05 — Perfil (v2)

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maqueta de referencia (la única verdad vigente)**
- `Biblioshare_mockups/Paper - Perfil v2.html` — 10 frames:
  - **A · B · C** móvil propio (Actividad / Estadísticas ◍ / Rincón ◍)
  - **J** móvil · estadísticas completas
  - **D · E** móvil visitante (Actividad / Colección) · **F** perfil privado
  - **G · H** escritorio propio (Estadísticas / Rincón) · **I** escritorio visitante (Colección)

> ⚠️ **Las maquetas viejas del perfil quedan derogadas.** `Paper - IA nueva (Inicio + Perfil).html`
> (frames B/C/D), `Paper - Perfil.html` y el frame 2 de `Paper - Colas, Retos, Usuarios, Admin.html`
> ya **no** son referencia para esta pantalla. Si algo choca, manda Perfil v2.

**Objetivo:** rehacer el perfil contra el mockup v2. No es solo fidelidad: el v2 **cambia la IA**
(el Panel se parte en Estadísticas + Rincón), convierte Actividad en un feed personal y trae
features nuevas con migración (Memorizar, sorteo, media docena de stats). Van en **6 fases**.

---

## 0. Contexto: por qué este plan se reescribió entero

El plan 05 original (2026-07-15) se escribió contra tres maquetas de distinta época y **nunca llegó
a ejecutarse**: `section-tabs.tsx` sigue sirviendo `panel | coleccion | actividad`, así que su
decisión P2 quedó **decidida pero no implementada**. Al llegar el mockup v2 (2026-07-17), esa P2
se queda obsoleta a medias — su parte de "el perfil propio pierde Colección" sobrevive; su parte
de "queda Panel + Actividad" muere, porque el Panel se parte en dos.

Como el plan viejo no había tocado código, **reescribirlo sale más barato que parchearlo**.

---

## 1. Estado actual

| Pieza | Archivo | Estado frente al v2 |
|---|---|---|
| Página | `src/app/u/[username]/page.tsx` (523 líneas) | IA **vieja**: Panel privado + Colección + Actividad. Hay que repartirla en tres pestañas nuevas. |
| Pestañas | `src/components/section-tabs.tsx` | `panel \| coleccion \| actividad`, dueño ve las 3. **P2 nunca se aplicó.** |
| Cabecera | `src/components/profile-header.tsx` | Fiel en móvil (avatar 60, nombre serif 22, @user mono, counts, bio, chips + "Desde YYYY"). Sin variante de escritorio (G/H: avatar 84, nombre 28, bio y counts a la derecha). |
| Actividad | `ActivityTab` + `activity-chart.tsx`, `favorites-shelf.tsx` | **No es un feed**: hoy es gráfico anual → destacados → reseñas recientes. El v2 la quiere cronológica y agrupada por día. |
| Panel | `OwnerPanel` + `src/components/stats/*` | Tiene semana (con anillo), racha, meta libros, objetivos+form, calendario y retos. Se reparte: lo cuantitativo → Estadísticas; retos → Rincón. |
| Feed | `src/lib/social/feed.ts` | `getFeed(supabase, viewerId, options)` ya emite los 6 verbos que pide A/D (`added`, `progressed`, `finished`, `rated`, `reviewed`, `watchedEpisode`) pero **solo para seguidos**: no hay forma de pedir un actor. |
| Stats | `src/lib/stats/*` | Solo `get-weekly-activity`, `get-month-calendar`, `get-streaks`, `get-annual-completed`. **Todo lo demás del muro no existe.** |
| Metas | `profiles.annual_goal_{books,movies,series}` + `daily_goal_minutes` | Tres columnas + `GoalsForm`/`GoalRows`/`BookGoalCard`. Solo las usa el perfil — **nada en Inicio depende de ellas**. |
| Retos | tabla `challenges` + `challenges/*` | Nombre, `item_type`, `criteria`, `target_count`, rango, `archived_at`. Es el modelo al que se fusionan las metas. |
| Memorizar | — | **No existe.** Lo más cercano: `progress_sessions.note` (con `position`, o sea la página) y `library_entries.notes`. |
| Sorteo | — | **No existe** nada. |
| Destacados en `/coleccion` | — | **No existen.** Hoy los destacados solo viven en el perfil. Ver dependencia D2. |

## 2. La vista objetivo

| | Dueño | Visitante (público/seguido) | Visitante (privado) |
|---|---|---|---|
| **Actividad** | feed personal (A) | **el mismo feed** (D) | — |
| **Estadísticas** ◍ | resumen → `/estadisticas` (B/G) | — | — |
| **Rincón** ◍ | retos+metas, memorizar, sorteo (C/H) | — | — |
| **Colección** | vive en `/coleccion` | destacados + píldoras + grid (E/I) | — |
| | | | stub "Solicitar seguir" (F) |

Escritorio (G/H/I): cabecera a lo ancho y cuerpo en **`1fr 300px`** — contenido a la izquierda,
rail a la derecha. La Colección del visitante (I) no lleva rail: destacados en fila de 8 y grid de 6.

## 3. Decisiones — RESUELTAS (2026-07-17)

- **P1 · VIGENTE (del plan viejo): ⚙ con hoja de ajustes.** Visibilidad pública/privada y enlace
  admin se mueven a una hoja tras el ⚙ del topbar (que el v2 conserva en A/B/C); las **solicitudes
  de seguimiento se mudan al desplegable de Notificaciones** (coordinar con plan 07 §2.1).
- **P2 · SUSTITUIDA — la IA es de tres pestañas.** Sobrevive que **el perfil propio no tiene
  pestaña Colección** (la biblioteca ya es `/coleccion`); muere el "queda Panel + Actividad".
  El Panel se parte en **Estadísticas** ◍ y **Rincón** ◍. El visitante mantiene **Actividad +
  Colección**. Los deep-links `?tab=panel` y `?tab=coleccion` en perfil propio redirigen
  (a `?tab=estadisticas` y a `/coleccion`).
- **P3 · VIGENTE (del plan viejo): editar perfil en hoja modal.** "Editar" abre una hoja con el
  formulario (nombre, bio, avatar) en vez del despliegue inline.
- **P4 · DECIDIDO: Actividad es `getFeed` con actor fijo.** Se añade `FeedOptions.actorId`, que
  **se salta la consulta de `follows`** y sirve los eventos de ese usuario. Se reusa `FeedCard`
  con `hideActor`. Agrupado por día con el `h5` del mockup (Hoy / Ayer / 14 jul).
- **P5 · DECIDIDO: perfil público = actividad pública, sesiones incluidas.** A y D son **el mismo
  feed sin ramas por rol** (D simplemente no tenía sesión reciente en la maqueta). Un no-seguidor
  que abre un perfil público ve también las sesiones con páginas y minutos. Quien no quiera eso
  tiene el interruptor de perfil privado (F). **Ojo:** esto amplía lo que hoy hace Inicio, que solo
  sirve `progressed` a seguidores — es deliberado, no un descuido.
- **P6 · DECIDIDO: fusión real de retos y metas.** Las tres columnas `annual_goal_*` **se migran a
  filas de `challenges`** (tipo + todo el año + `target_count`) y se eliminan. Un solo modelo, un
  formulario, un "+ Nuevo", y la meta anual pasa a ser editable y archivable como cualquier reto.
  Se retiran `GoalsForm`, `GoalRows` y `BookGoalCard`. **`daily_goal_minutes` NO se toca**: no es
  un reto, es el objetivo diario que vive en Estadísticas y usa `weekly-strip`.
- **P7 · DECIDIDO: Memorizar sobre tabla `notes` nueva + migración.** Tipo (`note` | `quote`),
  posición/página, favorita, ligada a la obra y opcionalmente al pase/sesión. Migración que absorbe
  `progress_sessions.note` y `library_entries.notes` **sin que nadie pierda lo escrito**. Captura
  desde la hoja de sesión y desde la ficha (una nota sin sesión es legal — las películas no tienen
  sesión). Cubre contadores, favoritas, "Otra nota" y exportar.
- **P8 · DECIDIDO: Gasto fuera; franja horaria con dato real.** La tarjeta **Gasto** de la J **no
  entra**: no hay precio en ninguna tabla y su propio subtítulo ("según accesos registrados") la
  delata como dependiente del **ejemplar/acceso, que es la fase 2 del pase y no está construida**.
  Y como F2 ya toca sesiones, se añade **`progress_sessions.started_at`**: el cronómetro la rellena
  solo, la hoja manual la deja opcional. Así "Cuándo lees" dice la verdad desde el primer día en vez
  de nacer mintiendo con `created_at` (que es cuándo *registraste*, no cuándo consumiste).
- **P9 · DECIDIDO: la J es una ruta propia en ambos breakpoints.** `/estadisticas`: en móvil calca
  el frame J (una columna, selector de período, ‹ atrás); en escritorio **la misma página** a
  varias columnas. Se **descarta** la nota del mockup ("en PC se despliega dentro de G") por dos
  razones: G no contiene géneros/autores/décadas/estados, así que en PC no tendrían dónde caer; y
  serían dos árboles del mismo contenido — justo lo que ya rompió tests dos veces (regla del README).
- **P10 · DECIDIDO: exportar solo la cita (F6).** Se exporta la tarjeta de **Memorizar** (cita +
  obra + página + marca) con `next/og`. El **↧ de la topbar de la J** y la coletilla "puedes
  exportar tarjetas" del aviso de B **se quedan fuera** y se anotan como futuro — no se pintan
  botones muertos.

## 4. Fases y tareas

> **Antes de la primera migración (tarea 1.6): regenerar `database.types.ts`.** En el worktree no aparece `passes` pero sí
> `diary_entries`, y la migración `diary_entries→passes` **ya está desplegada en prod**. Si no se
> regenera, las consultas nuevas se escriben contra un esquema fantasma. (`mcp__supabase__generate_typescript_types`.)

### F1 · Estructura (1 sesión) — incluye la fusión retos+metas (P6)

**Tarea 1.1 — Las tres pestañas**
- **Modificar:** `section-tabs.tsx`, `src/app/u/[username]/page.tsx`
- `SectionTab` pasa a `"actividad" | "estadisticas" | "rincon" | "coleccion"`. Dueño:
  `[actividad, estadisticas, rincon]` (las dos últimas con `LockIcon` ◍). Visitante:
  `[actividad, coleccion]`. Redirigir `?tab=panel` → `?tab=estadisticas` y `?tab=coleccion`
  (propio) → `/coleccion`.
- `OwnerPanel` se parte en `StatsTab` y `RinconTab`. La página está en 523 líneas: **extraer cada
  pestaña a su propio archivo** (`src/app/u/[username]/_tabs/*.tsx`) en vez de engordarla.
- Commit: `feat(perfil): IA de tres pestanas del mockup v2 (P2)`

**Tarea 1.2 — Actividad = feed personal (P4/P5)**
- **Modificar:** `src/lib/social/feed.ts`, `_tabs/activity-tab.tsx`
- `FeedOptions.actorId`: si viene, se salta la consulta de `follows` y filtra por ese actor.
  Reusar `FeedCard` con `hideActor`. Agrupar por día con el `h5` (Hoy / Ayer / `14 jul`).
- El **gráfico anual sale de Actividad** → se muda a Estadísticas (G lo pinta ahí).
  Los **destacados salen de Actividad** → a la Colección del visitante (E/I). Las "reseñas
  recientes" desaparecen como sección: ya son eventos del feed.
- **Prueba:** e2e — dueño y visitante ven el mismo feed; un no-seguidor ve las sesiones (P5).
- Commit: `feat(perfil): actividad como feed personal (P4/P5)`

**Tarea 1.3 — Colección del visitante (E/I)**
- **Modificar:** `_tabs/collection-tab.tsx`, `library/library-filters.tsx`, `favorites-shelf.tsx`
- Destacados arriba (fila de 6 en móvil, **8 en escritorio**), luego píldoras de tipo `.pill`
  (dot 7px, activa rellena de accent), luego `h5` con el recuento y grid (3 en móvil, **6 en PC**).
  **Solo píldoras de tipo** — sin búsqueda, estado ni orden.
- Commit: `style(perfil): coleccion de visitante fiel a los frames E/I`

**Tarea 1.4 — Cabecera y escritorio (G/H/I)**
- **Modificar:** `profile-header.tsx`, `_tabs/*`
- Variante ancha: avatar 84, nombre 28 y `@user` en línea base, bio (max 540) y counts debajo,
  acción a la derecha, chips al pie. Cuerpo en `lg:grid-cols-[1fr_300px]` (Estadísticas y Rincón);
  la Colección del visitante (I) va a una columna.
- Commit: `style(perfil): cabecera y layout de escritorio (G/H/I)`

**Tarea 1.5 — Ajustes (⚙) y edición en hoja (P1/P3)**
- **Modificar:** `profile-header.tsx`, `edit-profile-form.tsx` (a hoja), `page.tsx` (retirar
  toggle/solicitudes/enlace admin inline), `social/notification-bell.tsx` (absorbe solicitudes — coordinar
  con plan 07), hoja de ajustes nueva (visibilidad + admin).
- Commit: `feat(perfil): ajustes tras engranaje y edicion en hoja (P1/P3)`

**Tarea 1.6 — Rincón: retos y metas fusionados (P6)**
- **Crear:** migración que convierte `annual_goal_{books,movies,series}` en filas de `challenges`
  (nombre `"{n} {tipo} en {año}"`, `item_type`, `start/end` = el año natural, `target_count` = la
  meta, `criteria` vacío) y **elimina las tres columnas**. `daily_goal_minutes` **se queda**.
- **Modificar:** `_tabs/rincon-tab.tsx` (nuevo), `challenges/*`; **borrar** `stats/goals-form.tsx`,
  `stats/goal-rows.tsx`, `stats/book-goal-card.tsx` y sus claves i18n.
- Tarjeta "Retos y metas" del frame C (lista + `rtrack` de color por tipo + "Ver archivados") y H
  (dos columnas + rail con archivados). "+ Nuevo" abre el form de retos, el único que queda.
- **Prueba:** unit del cálculo de progreso; e2e de crear/editar/archivar un reto anual.
- **Ojo:** es la única migración **destructiva** del plan. Verificar el recuento antes/después
  (§6) y aplicarla primero en dev.
- Commit: `feat(perfil): fusion de retos y metas anuales (P6)`

### F2 · Estadísticas (1 sesión) — migración pequeña

**Tarea 2.1 — Migración `started_at` (P8)**
- **Crear:** migración `progress_sessions.started_at timestamptz null`
- El cronómetro la rellena; la hoja manual la deja opcional. **Sin backfill**: `created_at` no es
  un sustituto honesto (P8). "Cuándo lees" ignora las filas sin `started_at`.
- Commit: `feat(sesiones): started_at para la franja horaria real (P8)`

**Tarea 2.2 — Las consultas del muro**
- **Crear:** `src/lib/stats/get-rating-distribution.ts`, `get-records.ts`, `get-tbr-trend.ts`,
  `get-habits.ts`, `get-pace.ts`
- Valoración media + histograma 5→1; récords (mes más activo, más rápido, mejor racha, re-pases);
  la pila (añadidos vs terminados por mes); hábitos (franja, día, sesión media); ritmo (pág/día).
- **Prueba:** unit de los cálculos (`fnm use` → Node 22 antes de vitest).
- Commit: `feat(stats): consultas del muro (valoracion, records, pila, habitos, ritmo)`

**Tarea 2.3 — La pestaña Estadísticas (B/G)**
- **Crear/Modificar:** `_tabs/stats-tab.tsx`, `src/components/stats/*`
- Móvil (B): aviso de privacidad → semana+anillo → racha/ritmo → calendario → valoración → récords
  → la pila → cuándo lees → "Ver estadísticas completas ›".
- Escritorio (G): izquierda valoración, **actividad anual** (mudada de F1), récords+pila;
  rail derecho: aviso, semana, racha/ritmo, calendario, cuándo lees.
- Commit: `style(perfil): pestana estadisticas fiel a B y G`

### F3 · Memorizar (1 sesión) — migración + captura

**Tarea 3.1 — Tabla `notes` y migración (P7)**
- **Crear:** migración `notes` (`user_id`, `item_type`, `item_id`, `pass_id?`, `session_id?`,
  `kind: note|quote`, `body`, `position jsonb?`, `is_favorite`, timestamps) + RLS (privada, solo
  dueño) + migración de datos desde `progress_sessions.note` (kind `note`, con su `position` y
  `session_id`) y `library_entries.notes`.
- **Ojo:** dejar las columnas viejas en su sitio esta fase (leer de `notes`, no borrar todavía);
  se retiran en una limpieza posterior cuando la migración esté verificada en prod.
- Commit: `feat(notas): tabla notes y migracion de las notas existentes (P7)`

**Tarea 3.2 — Captura**
- **Modificar:** hoja de sesión, ficha (`src/components/detail/*`)
- Añadir nota/cita con tipo, página opcional y favorita. Sin sesión también vale.
- Commit: `feat(notas): captura de notas y citas en sesion y ficha`

**Tarea 3.3 — Tarjeta Memorizar (C/H)**
- **Crear:** `src/components/notes/memorize-card.tsx`, contadores del rail (H: citas/notas/favoritas)
- Cita en serif, `qmeta` mono, "Otra nota" (rota aleatoriamente) y "Repasar todas ›".
- Commit: `style(perfil): tarjeta memorizar y contadores del rincon`

### F4 · Sorteo (media sesión)

**Tarea 4.1 — "Sacar un lomo"**
- **Crear:** `src/components/rincon/spine-draw.tsx`
- `dark-card` con la estantería de lomos (alturas y colores variados) sobre los **pendientes** del
  usuario; "Sacar un lomo" elige uno al azar y lo presenta. Vacío: si no hay pendientes, la tarjeta
  invita a añadir en vez de sortear la nada.
- Commit: `feat(rincon): sorteo de pendientes en modo estanteria`

### F5 · `/estadisticas` (1 sesión) — la J (P9)

**Tarea 5.1 — La página**
- **Crear:** `src/app/estadisticas/page.tsx` (+ `loading.tsx` — **regla del 404 del plan 00**: solo
  si la ruta no hace `notFound()`)
- Privada, solo dueño. Selector de período (2026 / 2025 / Todo) con `?periodo=`. Tarjetas:
  valoración, distribución por tipo (donuts), estados, horas por mes, géneros, autores, décadas,
  cuándo lees, récords, la pila. **Sin Gasto** (P8).
- Escritorio: la misma página a varias columnas (P9), **no un árbol nuevo**.
- **Prueba:** e2e — visitante no entra; los "Ver todas ›" de la pestaña llegan aquí.
- Commit: `feat(estadisticas): pagina de estadisticas completas (frame J, P9)`

### F6 · Exportar la cita (media sesión) — P10

**Tarea 6.1 — `next/og`**
- **Crear:** `src/app/api/og/nota/[id]/route.tsx`
- Tarjeta con la cita, obra, página y marca; light/dark. Botón "Exportar tarjeta" en Memorizar.
- Commit: `feat(notas): exportar la cita como tarjeta`

## 5. Dependencias y coordinación

- **D1 · Retos y metas (P6).** La migración retira `annual_goal_*`. Radio pequeño (solo perfil),
  pero hay que borrar `GoalsForm`/`GoalRows`/`BookGoalCard` y sus claves i18n. Va **en F1** (la
  tarjeta "Retos y metas" del Rincón la necesita entera) — si se retrasa, el Rincón nace partido.
- **D2 · Los destacados del dueño (plan 02).** El v2 los saca del perfil propio ("los favoritos
  viven en Colección", frame C) y **hoy `/coleccion` no los tiene**. Si el plan 02 no los aloja,
  el dueño **pierde** sus destacados al mergear F1. Bloqueante de F1.
- **D3 · Notificaciones (plan 07 §2.1).** P1 manda las solicitudes de seguimiento al desplegable.
- **D4 · Fase 2 del pase (ejemplar+acceso).** Desbloquea la tarjeta Gasto de la J (P8).
- **D5 · Tipos desfasados.** Regenerar `database.types.ts` antes de la tarea 1.6 (ver §4).

## 6. Verificación de cierre

- [ ] Los 10 frames del v2 lado a lado, como dueño y como visitante (y perfil privado → stub F).
- [ ] El visitante no ve Estadísticas ni Rincón, ni puede forzarlos por URL.
- [ ] `?tab=panel` y `?tab=coleccion` (propio) redirigen; nadie aterriza en un 404.
- [ ] Un no-seguidor ve las sesiones en un perfil público (P5) y **nada** en uno privado.
- [ ] Ninguna nota perdida en la migración de P7 (contar antes y después).
- [ ] Ninguna meta anual perdida en la fusión de P6.
- [ ] Modo oscuro (los `dark-card` del Rincón son lo más arriesgado).
- [ ] `npx playwright test` verde (`fnm use` → Node 22 primero).
- [ ] La suite corre a 1280: **todo locator con `:visible`** si queda algún duplicado por breakpoint.
