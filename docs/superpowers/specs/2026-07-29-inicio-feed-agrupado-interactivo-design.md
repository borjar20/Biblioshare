# Inicio — Feed agrupado e interactivo + ancho PC — Design Spec

**Fecha:** 2026-07-29

## Alcance

Rediseño del Inicio (`src/app/(home)/page.tsx`), acotado a tres frentes
(decisión del usuario, 2026-07-29). El mockup de referencia es
`D:\Proyectos\Personal\Mockups\Rediseño - Inicio.html`, pero **solo** se toma de
él:

1. **Feed agrupado.** Varios eventos del mismo actor colapsan en una tarjeta.
2. **Feed más interactivo.** Reacción/comentario por ítem (también en `added` y
   `progressed`, que hoy no lo tienen), botón "+" de alta rápida por portada y
   "Guardar los N en mi cola" en las tarjetas agrupadas.
3. **Mejor uso del ancho en PC.** Contenedor más ancho y sidebar consolidada
   ("Esta semana" + "Tu 2026" + "A quién seguir").

**Fuera de alcance** (lo que el mockup enseña pero ya existe o no se toca): el
hero de lectura activa, la mini de siguiente episodio y el estante "Para más
tarde" ya viven en `TodayBlock`/`StatsRail` y se quedan como están salvo el
reajuste de sidebar del punto 3.

## Estado actual (lo que ya hay)

- `getFeed` (`src/lib/social/feed.ts`) hace fan-out on-read sobre 4 fuentes
  (`passes` altas, `progress_sessions`, `passes` terminados, `episode_watches`)
  + actividad de club. Devuelve `FeedEntry[]` **una entrada por evento**.
- `FeedList`/`FeedCard` pintan una tarjeta por entrada. `ReviewInteractions`
  (♡/comentar) solo aparece cuando el evento trae `interactionTarget`, que hoy
  es `null` para `added` y `progressed`.
- Interacciones: tablas polimórficas `reactions`/`comments`,
  `(target_type public.target_kind, target_id uuid)`. RLS delega en
  `can_view_target(target_type, target_id)` que hace `CASE target_type` con
  lookup a una fila real por tipo.
- Alta a biblioteca = `applyTransition(supabase, userId, itemType, itemId,
  "planned")` (`src/lib/passes/apply-transition.ts`), ya usada por
  `addToLibrary` en `src/app/buscar/actions.ts`.
- Sugerencias de a quién seguir: `get-social-suggestions.ts`
  (`src/lib/onboarding/`), hoy solo usada en onboarding.
- Sidebar PC = `StatsRail` (`WeeklyStrip` + `StreakCard` + `BookGoalCard` +
  `GoalRows`). Contenedor `lg:max-w-[1080px]`, columna derecha `312px`.

## Decisiones

### D1 — La agrupación es solo de presentación

El grupo colapsa eventos para **pintar** (una cabecera + N portadas). No es una
entidad con fila propia. Claves de grupo, deterministas:

- **`added`**: `actor + día natural del evento`. Tarjeta "añadió N libros".
- **`progressed`**: `actor + obra + día natural`. Tarjeta "avanzó en {obra}".
  Sesiones del mismo día sobre la misma obra caen juntas; **días distintos =
  tarjetas distintas** (regla explícita del usuario: "si avanzo en días
  separados sigue estando separado").

Resto de verbos (`finished`/`rated`/`reviewed`, episodios, club) **no se
agrupan**: siguen sueltos.

El colapso se aplica **sobre la página ya cortada a `pageSize`** de eventos de
persona, después del sort y del filtro de cursor, y **antes** de mezclar con las
entradas de club (que no se agrupan). Un grupo partido en el borde de página
(p. ej. la 3.ª alta del día cae en la tanda siguiente) sale como grupo propio en
la segunda tanda. Es una limitación aceptada del MVP → **issue** (ver §Issues).

### D2 — La reacción es por ítem, no por grupo

Se puede reaccionar/comentar **individualmente** a cada ítem de una tarjeta
agrupada (decisión del usuario). Como el `target_id` de `reactions`/`comments`
**debe ser un uuid de fila real** (lo exige `can_view_target`), esto encaja sin
claves sintéticas: cada ítem apunta a **su propia fila**.

- `added` → `interactionTarget = { targetType: "pass", targetId: pass.id }`.
- `progressed` → `interactionTarget = { targetType: "progress_session",
  targetId: session.id }`.

Se descartan por complejidad: una tabla `feed_groups` durable (migración pesada,
fan-out de escritura) y el ancla "fila representante" (una sola reacción por
grupo — el usuario pidió reacción individual).

### D3 — Migración: dos valores de enum + dos ramas de RLS

```sql
alter type public.target_kind add value if not exists 'pass';
alter type public.target_kind add value if not exists 'progress_session';
```

Extender `can_view_target(p_target_type, p_target_id)` con:

```sql
when 'pass' then exists (
  select 1 from public.passes p
  where p.id = p_target_id and public.can_view_profile(p.user_id)
)
when 'progress_session' then exists (
  select 1 from public.progress_sessions s
  where s.id = p_target_id and public.can_view_profile(s.user_id)
)
```

`progress_sessions` tiene `user_id` propio, así que no hace falta join al pase.
Las políticas SELECT/INSERT de `reactions` y `comments` ya se apoyan en
`can_view_target`, por lo que **cubren los tipos nuevos sin tocarlas**.

`alter type ... add value` no corre dentro del mismo statement que lo usa; se
aplica en su propia migración. **Orden: `supabase-dev` primero, luego prod**
(regla de AGENTS.md). Verificar contra `pg_enum`/`pg_proc`, no contra el ledger
de `list_migrations`.

### D4 — Quick-add reusa la máquina de estados

Dos acciones `"use server"`:

- `quickAddToLibrary(itemType, itemId)` — alta de un ítem (botón "+" por
  portada): `applyTransition(..., "planned")` + `revalidatePath("/")`.
- `quickAddManyToLibrary(items)` — "Guardar los N en mi cola": **una sola**
  acción que recibe la lista entera y aplica las transiciones server-side (un
  round-trip, no N desde el cliente), en paralelo (`Promise.all`), con un único
  `revalidatePath("/")` al final. Elegida sobre el bucle cliente por rendimiento
  (decisión del usuario, 2026-07-29).

Ambas idempotentes: si ya hay pase activo, la transición es no-op (mismo
comportamiento que `addToLibrary`). El botón vive en un componente de cliente por
portada; refleja "ya en tu biblioteca" cuando el evento ya está en tu colección.

### D5 — Ancho PC y sidebar consolidada

- `page.tsx`: contenedor `lg:max-w-[1080px]` → `lg:max-w-[1200px]`; grid de la
  sección `lg:grid-cols-[minmax(0,1fr)_312px]` → `_328px`. Revisar que el split
  de escritorio de `TodayPicker` sigue cuadrando con el nuevo ancho.
- `StatsRail` pasa a tres tarjetas:
  1. **"Esta semana"** — `WeeklyStrip` (sin cambios).
  2. **"Tu 2026"** — funde `BookGoalCard` (anillo N/meta) + `GoalRows` (3 filas
     por tipo) + la línea de racha de `StreakCard` en una sola tarjeta. Reusa
     `getAnnualCompleted`, `getAnnualGoals`, `getStreaks` (ya se piden en
     `StatsRail`).
  3. **"A quién seguir"** — componente nuevo que reusa `get-social-suggestions`
     + la acción de seguir existente (`src/lib/social/follows`). Se degrada a
     nada si no hay sugerencias.

## Arquitectura

### Capa de datos (`src/lib/social/feed.ts`)

- Al final de `getFeed`, tras cortar la página de eventos de persona: fijar
  `interactionTarget` en `added` (`pass`) y `progressed` (`progress_session`) —
  hoy son `null`.
- El batch de `getInteractionSummary` de `getFeed` ya recorre `interactionTarget`
  por tipo; se amplían las listas para incluir los dos tipos nuevos.
- Función pura nueva (p. ej. `group-feed-events.ts`): recibe los eventos de
  persona de la página y devuelve una unión con una variante agrupada. Tipo
  propuesto:

  ```ts
  type FeedEntry =
    | { source: "person"; id; eventDate; event: FeedEvent }
    | { source: "person-group"; id; eventDate; verb: "added" | "progressed";
        actor: {...}; items: FeedEvent[] }
    | { source: "club"; id; eventDate; event: ClubFeedEvent };
  ```

  Grupos de un solo ítem **no** se envuelven: se dejan como `person` para no
  cambiar el aspecto de una única alta.
- `TargetType` (en `interactions.ts`) suma `"pass" | "progress_session"`.

### UI (`src/components/social/`)

- `FeedList` despacha la tercera variante a un `FeedGroupCard` nuevo.
- `FeedGroupCard`: cabecera (avatar + "{actor} añadió N libros" / "avanzó en
  {obra}"), rejilla de ítems; cada ítem = portada + título + botón "+" de alta
  rápida + `ReviewInteractions` compacto (su propio target). Pie: "Guardar los N
  en mi cola".
- `FeedCard` (un evento): ya pinta `ReviewInteractions` cuando hay
  `interactionTarget`, así que `added`/`progressed` sueltos ganan ♡/comentar sin
  tocar el componente. Se le añade el botón "+" de alta rápida en las tarjetas
  `added`.
- Componente cliente `QuickAddButton` (`itemType`, `itemId`, estado inicial "ya
  en biblioteca") que llama a `quickAddToLibrary`.
- `WhoToFollowCard` para la sidebar.

### i18n

Claves nuevas (vía agente `i18n-keeper`): `feed.grouped.addedCount`,
`feed.grouped.progressedIn`, `feed.grouped.saveAllToQueue`, `feed.quickAdd`,
`feed.alreadyInLibrary`, `whoToFollow.title`, `whoToFollow.follow`, etc. En
`messages/*.json` para todos los locales.

## Manejo de errores / bordes

- **Grupo partido en borde de página** (D1): aceptado, → issue.
- **Alta nueva el mismo día**: reordena/re-agrupa en el siguiente pintado; las
  reacciones no se mueven porque viven en la fila del pase, no en el grupo.
- **Quick-add idempotente**: pase activo ya existente = no-op (D4).
- **Sin sugerencias**: `WhoToFollowCard` no se pinta.
- **Visibilidad**: la RLS de `reactions`/`comments` sobre los tipos nuevos la
  resuelve `can_view_target` (D3); un pase/sesión de alguien que no puedes ver no
  admite reacción — mismo modelo que `diary_entry`.

## Testing

- **Unit** (Vitest): la función pura de agrupación — claves por día, no agrupa
  verbos distintos, `progressed` de días distintos separado, grupo de 1 no se
  envuelve.
- **e2e** (Playwright): render de tarjeta agrupada, quick-add "+" mueve el ítem
  a tu biblioteca, "Guardar los N", tarjeta de sugerencia de seguir.
- **qa-verifier** end-to-end de la vista PC (ancho + sidebar) tras implementar.

## Cierre documental (Definición de «hecho», AGENTS.md)

- `docs/requirements/data-model.md`: enum `target_kind` (+`pass`,
  +`progress_session`), `can_view_target`, fecha de verificación.
- `docs/requirements/decisiones.md`: append — reacción **por ítem** en grupos
  del feed (D2), agrupación solo-display (D1).
- `docs/requirements/backlog.md`: marcar la casilla del rediseño de Inicio.
- `docs/architecture/graph.json`: si cambia un flujo end-to-end del feed,
  regenerar.

## Issues a abrir

- **Grupo partido en el borde de página**: un grupo cuyo N.º ítem cae en la
  tanda siguiente aparece como grupo separado. Repro: actor con >`pageSize` altas
  el mismo día. Acota: solo afecta al borde de paginación. Posible arreglo
  futuro: agrupar antes de cortar y paginar por grupo.
- Cualquier parcial o sospecha que surja durante la implementación.
