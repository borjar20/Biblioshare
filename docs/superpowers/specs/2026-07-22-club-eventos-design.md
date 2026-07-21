# Eventos de club — diseño

[Canónico · verificado 2026-07-22]

Actividad nueva en los clubes: el **Evento**, una fecha señalada que un moderador
marca en el calendario del club (p. ej. «sale en cine *Dune 3*»). Título, descripción
y fecha. Sin vista individual, sin participantes, sin ciclo de vida manual.

Es la primera actividad **no participativa** del modelo: no se propone, no se une
nadie, no progresa. Solo llega su fecha y pasa.

## 1. Decisión de fondo: kind nuevo, no tabla nueva

Un evento rompe casi todas las suposiciones de `club_activities` — nace activo en vez
de propuesto, no tiene pool de ítems ni participantes, y no tiene página propia. La
alternativa obvia era una tabla `club_events` limpia, sin los campos que un evento no
usa.

Se descarta: **SD-8 declara `activity_kind` un enum abierto y manda añadir kinds con
`ALTER TYPE ... ADD VALUE`, nunca como tabla aparte.** La razón de esa decisión aplica
aquí de lleno — el calendario que viene después debe leer **una** fuente de fechas de
club, no hacer `UNION` de dos tablas con RLS y notificaciones duplicadas.

Precio asumido: las filas de evento dejan sin usar `config`, `ends_on`,
`spawned_from_*` y los tres satélites (`club_activity_participants`, `_items`,
`_opinions`, simplemente sin filas). Se acepta a cambio de una sola fuente de verdad.

## 2. Esquema

### 2.1 Migración 1 — el valor de enum, aislado

```sql
alter type public.activity_kind add value 'evento';
```

**Va sola en su migración a propósito.** Postgres prohíbe *usar* un valor de enum en la
misma transacción que lo añade: si la RPC que compara `kind = 'evento'` viaja en el
mismo fichero, la migración falla al aplicarse. Es la misma trampa que documenta el
comentario de `20260713_club_activities.sql:8-12`.

Orden de despliegue: **dev primero** (`supabase-dev`), luego prod.

### 2.2 Migración 2 — las dos RPCs

Ambas `SECURITY DEFINER`, ambas con gate `has_min_club_role(club_id, 'moderator')`
(`20260712_clubs.sql:75`).

**`create_club_event(p_club_id, p_title, p_description, p_starts_on) returns uuid`**

Inserta con `kind = 'evento'`, `status = 'active'`, `created_by = auth.uid()`.

Existe porque la política de INSERT de `club_activities`
(`20260713_club_activities.sql:179-196`) **fuerza `status = 'proposed'`**. Un evento no
se propone: lo crea quien tiene autoridad para fijar la fecha, y ya está fijada.

**`update_club_event(p_activity_id, p_title, p_description, p_starts_on)`**

El `UPDATE` que la tabla hoy no tiene — SD-8 dejó `club_activities` deliberadamente sin
política de UPDATE, con las transiciones encapsuladas en RPCs.

> **`where ... and kind = 'evento'` es obligatorio en esta función.** Sin ese filtro,
> una RPC `SECURITY DEFINER` gated solo por rol permite a un moderador reescribir
> título, descripción y fechas de una `buddy_read` o una `list_challenge` por la puerta
> de atrás — justo la edición arbitraria que SD-8 evitó al no crear la policy.

Archivar **reutiliza `archive_club_activity`** sin tocarla: ya es moderador+ y ya acepta
el estado `active`. No se añade borrado real; archivar mantiene la traza.

### 2.3 Estado: derivado, nunca persistido

Un evento nace `active` y se queda `active`. «Pasado» es `starts_on < today`, **calculado
al leer**. No hay transición manual ni job programado.

Motivo: un estado que hay que mantener sincronizado con el calendario es un estado que
se desincroniza. La comparación de fechas no puede quedar obsoleta.

`archived` sigue disponible para retirar un evento de la vista.

### 2.4 Notificación

Valor nuevo `club_event_created` en el enum de tipos de notificación. Requiere tocar:

- el enum en migración,
- `src/lib/clubs/activities/notify-club.ts:16` (el parámetro `type` es una unión
  hardcodeada),
- `src/lib/social/notification-types.ts:22-24,58-60`.

Se descarta reutilizar `club_activity_activated`: el copy diría «se ha activado», que no
es lo que pasó. Una notificación que miente sobre el hecho que anuncia es peor que no
tenerla.

## 3. UI

### 3.1 El registro de kinds gana `hasDetailView`

`ActivityKindDefinition` (`src/lib/clubs/activities/kinds/types.ts:13-69`) da por hecho
que todo kind tiene página de detalle. Se añade:

```ts
hasDetailView: boolean;
```

**Requerido, no opcional con default `true`.** Son cuatro ediciones de una línea en los
kinds existentes, y a cambio quien añada el sexto kind está obligado a decidirlo en vez
de heredarlo en silencio. Al ser `Record<ActivityKind, …>`, TypeScript señala los cuatro
ficheros de inmediato.

### 3.2 `kinds/evento.ts`

| campo | valor |
|---|---|
| `allowedItemTypes` | `[]` |
| `maxItems` | `0` |
| `usesItemPool` | `false` |
| `itemCuration` | `"curators"` |
| `ConfigFields` | — |
| `DetailExtension` | — |
| `hasDetailView` | `false` |

Identidad visual en `ACTIVITY_ACCENT` (`kinds/accent.ts`): **`CalendarIcon`** (ya existe,
`icons.tsx:181`) sobre el token **`type-series`** (morado), el único de la paleta que
ninguna actividad usa todavía. No se inventa paleta nueva. Clases Tailwind literales
enteras, nunca concatenadas — misma regla que ya avisa `accent.ts:20-21`.

Alta en la unión `ActivityKind` (`src/lib/clubs/activities/core.ts:21`), en
`ACTIVITY_KIND_ORDER` y en el `Record` de `registry.ts`.

### 3.3 Tarjeta (`activity-card.tsx`)

Dos cambios acotados. Hoy la tarjeta envuelve todo en un `<Link>` al detalle y pinta
`t("participants", { count })` — ambas cosas son falsas para un evento.

1. **Envoltorio condicional.** Si `!hasDetailView`, el mismo JSX va en un `<div>` en vez
   de un `<Link>`. Se elige un `Wrapper` arriba y se reutiliza el marcado; **no se
   duplica la tarjeta**, que es como las dos variantes divergen tres meses después.
2. **Línea meta.** Cuando el kind no usa participantes, muestra la **fecha formateada**
   en lugar del recuento.

### 3.4 Lista (`activity-list.tsx`)

Grupo propio **«Eventos»**, situado sobre el de activas, ordenado por `starts_on`
ascendente y con los ya pasados al final, atenuados (`muted`).

Los eventos **salen del filtro `active`**; si no, aparecerían en dos grupos a la vez.
`ProposalModeration` no se toca: un evento nunca está `proposed`.

### 3.5 Creación (`propose/propose-wizard.tsx`)

La tarjeta de kind «Evento» **solo se renderiza si `isModerator`**. Es gate de UI; la
autoridad real es la RPC.

Al elegirla, el paso 2 muestra **únicamente el campo de fecha** — sin pool de ítems, sin
`ConfigFields`, sin `ends_on`. El envío llama a `createClubEvent`, no a
`proposeActivityWithSetup`.

`isModerator` ya se calcula en `src/app/club/[slug]/page.tsx:76` con el patrón vigente
(`viewerRole === "moderator" || viewerRole === "owner"`) y baja por props.

### 3.6 Editar y archivar

Sin página de detalle, los controles viven en la propia tarjeta: menú `EllipsisIcon`
visible solo a moderador+, con **«Editar»** (reabre el formulario precargado) y
**«Archivar»**.

### 3.7 Resumen del club

Bloque **«Próximas fechas»** junto a «Próximos hitos», alimentado por un
`getUpcomingEvents(clubId, limit)` nuevo en `src/lib/clubs/activities/upcoming.ts`,
calcado del patrón de `getUpcomingCheckpoints` (filtro `starts_on >= today`, orden
ascendente, `limit`).

**Consulta separada, no fusionada con los hitos.** Ese merge es precisamente el trabajo
del calendario; hacerlo aquí a medias obliga a escribirlo dos veces.

### 3.8 Guardia de ruta

`/club/[slug]/actividad/[id]` de una actividad con `hasDetailView === false` →
`notFound()`. La URL es adivinable y hoy renderizaría una página rota.

### 3.9 Fechas

Formateo partiendo el string `YYYY-MM-DD` a mano. **Nunca `new Date()` sobre un `date`
de Postgres**: lo interpreta como UTC y puede desplazar el día. Ya documentado en
`activity-detail.tsx:43-50`.

## 4. Errores

| caso | tratamiento |
|---|---|
| Título vacío, >120 chars, o descripción >2000 | CHECK ya existe (`20260715_text_length_limits.sql:42-44`); validación en cliente para ahorrar el viaje |
| Fecha ausente | obligatoria en el formulario — un evento sin fecha no es nada |
| Deja de ser moderador entre abrir y enviar | la RPC rechaza y **el error se muestra en pantalla** |

Ese último punto no es teórico: SD-8 registra «errores de mutación no visibles» como
hallazgo Important ya corregido una vez en este mismo motor.

**No se valida que la fecha sea futura.** Registrar un evento ya ocurrido es legítimo.

## 5. Pruebas

**Vitest** (dato puro, sin navegador):
- agrupación y orden de la lista: evento futuro vs pasado, y exclusión del grupo de
  activas;
- formateo de fecha sin desfase UTC.

**Playwright** — `e2e/club-evento.spec.ts`:
- moderador crea un evento → aparece en la lista y en «Próximas fechas»;
- miembro raso **no ve** la tarjeta «Evento» en el wizard;
- la tarjeta de un evento **no navega** al hacer clic;
- `/club/[slug]/actividad/[id]` de un evento devuelve 404.

> La aserción de «no navega» comprueba que **la URL no cambia**, no solo que falte un
> `<a>`. Es lo que rompería de verdad si el envoltorio condicional se invierte.

**qa-verifier** en navegador real al cerrar, según `docs/TESTING.md`.

## 6. i18n

Locale único, `messages/es.json`, namespace `activity` (`:495`–`:672`).

Claves nuevas: `kind_evento`, `kindHint_evento`, `groupEvents`, `eventDate`, `newEvent`,
`editEvent`, `eventPast`, más el copy de la notificación.

> `t(\`kind_${activity.kind}\`)` y `t(\`kindHint_${option}\`)` son lookups dinámicos:
> **una clave que falte revienta en runtime, no en compilación.** Todas las claves se
> añaden antes de tocar componentes.

## 7. Definición de «hecho»

1. Esquema tocado → `docs/requirements/data-model.md` + fecha de verificación nueva.
2. Feature cerrada → casilla en `docs/requirements/backlog.md`.
3. `docs/requirements/decisiones.md`, al final, append-only:
   - kind nuevo en vez de tabla, aplicando SD-8;
   - «pasado» derivado de la fecha, nunca persistido;
   - `update_club_event` restringida a `kind = 'evento'` y por qué;
   - `hasDetailView` requerido en vez de opcional.
4. `database.types.ts` regenerado.

## 8. Fuera de alcance — se abre issue por cada uno

- **El calendario del club**: unión de eventos, checkpoints y fechas del usuario.
- **Eventos recurrentes.**
- **Hora del día**: hoy no existe ningún timestamp en el modelo de actividades;
  introducirlo trae la pregunta de zona horaria, que el proyecto no tiene resuelta.
- **RSVP / «me interesa»**: exigiría decidir si `club_activity_participants` sirve para
  esto o hace falta otra cosa.
