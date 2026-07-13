# EPIC-05 Bloque G — Actividades de club: motor genérico — Design

## Alcance

Este bloque cubre exactamente `E5.G1`–`E5.G3` del backlog (`docs/requirements/social-epic.md`):
el motor genérico de actividades de club — esquema, ciclo de vida, dominio y UI — según la
decisión estructural ya fijada en **SD-8**. Los **tipos** concretos de actividad (lectura
conjunta con checkpoints, tierlist con ranking, retos por lista/criterio) son **Bloque H**,
explícitamente fuera de alcance aquí: este bloque construye el motor una sola vez, sin
implementar comportamiento específico de ningún `kind`.

**Decisión de sesión, ampliando el alcance más allá de la lectura literal del backlog**: el
motor se expone completo desde ahora — proponer, activar, unirse, gestionar el pool de
ítems y opinar ya funcionan de extremo a extremo, aunque una actividad creada hoy no tenga
comportamiento específico de su `kind` (eso llega con Bloque H). Coherente con el patrón ya
usado al construir clubes (Bloque E) antes que su feed (Bloque F) — construir por capas
funcionales completas, no por features verticales a medias.

## Decisiones tomadas en esta sesión

- **Composer expuesto ya**, no diferido a Bloque H — una actividad se puede proponer, activar,
  unirse y poblar de ítems ahora mismo; su `config` específica de tipo queda vacía/por defecto
  hasta que Bloque H la interprete.
- **Pool de ítems (`club_activity_items`) con UI genérica en este bloque** — añadir/quitar
  ítems de tu biblioteca es igual de genérico para los cuatro tipos; solo la
  *interpretación* del pool (orden de ranking, checkpoints de lectura) es específica de tipo
  y queda para Bloque H.
- **Opiniones (`club_activity_opinions`) con UI genérica mínima en este bloque** —
  formulario de rating + comentario por ítem, reutilizable/extendido por cada tipo en
  Bloque H, en vez de diferir toda la UI de opinión.
- **Listado de actividades: lista plana con badge de estado**, sin pestañas/agrupación por
  estado — mismo criterio de UI ligera que el resto del proyecto (el propio feed de club es
  también una lista plana).
- **Notificaciones en dos puntos del ciclo de vida**: proponer y activar, ambas con fan-out a
  todos los miembros activos del club (mismo patrón que `club_post`, Bloque F) — a diferencia
  de decisiones previas de "diferir ruido", aquí se opta por cobertura completa desde el
  inicio.
- **`finishActivity` gateado a creador *o* moderator+** (no solo moderator+ como
  `activateActivity`) — menor fricción para que quien propuso la actividad pueda cerrarla él
  mismo.
- **`archiveActivity` generaliza "rechazar propuesta" y "cancelar activa" en una sola acción**
  — moderator+, alcanzable desde `proposed` o `active`, mismo mecanismo RPC que
  `activateActivity`/`finishActivity`.
- **Opiniones visibles solo a participantes** — confirma la lectura de SD-8 ("participar...
  gatea el acceso a... comparativas"): un miembro del club ve que una actividad existe y
  quién se ha unido sin necesidad de unirse él mismo, pero no ve las opiniones/valoraciones
  de los participantes hasta que él también se une.

## Modelo de datos

Tal como fija SD-8, con una adición pequeña no listada literalmente allí:

```sql
create type public.activity_kind as enum ('buddy_read', 'tierlist', 'list_challenge', 'criteria_challenge');
-- Enum abierto -- futuros kinds (poll, cooperative_challenge...) se añaden como valores
-- nuevos vía ALTER TYPE ADD VALUE, nunca como tablas nuevas (SD-8).

create type public.activity_status as enum ('proposed', 'active', 'finished', 'archived');

create table public.club_activities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  kind public.activity_kind not null,
  title text not null,
  description text,
  status public.activity_status not null default 'proposed',
  config jsonb,              -- opaco a SQL/RLS -- interpretado en la capa de app por kind,
                              -- igual que challenges.criteria (§7.10). Este bloque no valida
                              -- su forma; eso es responsabilidad de cada tipo en Bloque H.
  created_by uuid not null references auth.users(id),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table public.club_activity_participants (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table public.club_activity_items (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  added_by uuid not null references auth.users(id),
  -- ^ adición de sesión frente al literal de SD-8 (activity_id, item_type, item_id, order):
  -- necesaria para "borra quien lo añadió, o moderator+", mismo patrón que club_posts.
  position smallint not null,
  created_at timestamptz not null default now()
);

create table public.club_activity_opinions (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  rating smallint,
  comment text,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id, item_type, item_id)
  -- una opinión por usuario por ítem por actividad -- upsert para cambiarla, mismo espíritu
  -- que club_poll_votes (elección única) de Bloque F, aunque aquí no hay "elección" sino
  -- valoración libre (rating/comment ambos nullable, se permite postear solo el comentario o
  -- solo el rating).
);
```

`item_type` es el enum ya existente (`book`/`movie`/`series`) usado por `library_entries`
et al. — el pool de una actividad referencia el catálogo compartido, no una copia.

## Ciclo de vida y permisos

```
proposed --(activateActivity, moderator+)--> active --(finishActivity, creador o moderator+)--> finished
proposed --(archiveActivity, moderator+)--> archived
active   --(archiveActivity, moderator+)--> archived
```

Cualquier miembro activo puede proponer (`proposeActivity`, sin gateo de rol — mismo criterio
que publicar en el feed de club, Bloque F). Las tres transiciones de estado
(`activateActivity`/`finishActivity`/`archiveActivity`) son funciones `SECURITY DEFINER`, no
`UPDATE`s de cliente gateados por RLS — mismo patrón ya establecido en Bloques E/F para
cualquier cambio con lógica de autorización no trivial (evita la clase de bug ya encontrada
dos veces: un `WITH CHECK` que solo valida la fila propuesta, no la compara contra la vieja,
dejaría colar un cambio de columna no previsto en la misma llamada).

## RLS

**`club_activities`**
- `SELECT`: `is_club_member(club_id)` — cualquier miembro ve todas las actividades del club,
  en cualquier estado (el filtrado por estado, si se quiere, es cosa de la UI, no de RLS).
- `INSERT`: ninguna política — `proposeActivity()` (RPC) es el único camino, igual que
  `create_club()`.
- Sin `UPDATE`: las transiciones de estado son RPC-only.

**`club_activity_participants`**
- `SELECT`: `is_club_member` (vía join a `club_activities`) — cualquier miembro ve quién se
  ha unido, sin necesidad de unirse él mismo primero.
- `INSERT`: auto-servicio (`user_id = auth.uid()`), solo si la actividad está `status='active'`
  — no puedes unirte a una propuesta todavía no activada ni a una ya finalizada/archivada.
- `DELETE`: solo tu propia fila (salir) — sin expulsión por moderador, es una decisión de
  participación mucho más ligera que la membresía del club en sí (Bloque E).

**`club_activity_items`**
- `SELECT`: `is_club_member`.
- `INSERT`: solo participantes de la actividad (`is_activity_participant(activity_id)`, nuevo
  helper `SECURITY DEFINER`, mismo patrón anti-recursión que `is_club_member()` — sin riesgo
  de recursión estructural, ya que solo lee `club_activity_participants`, tabla cuya propia
  política `SELECT` nunca la referencia a ella misma). `WITH CHECK` fija `added_by =
  auth.uid()`.
- `DELETE`: `added_by = auth.uid()` **o** `has_min_club_role(club_id, 'moderator')` —
  deliberadamente **sin** exigir `is_activity_participant()` en ninguna de las dos ramas: ni
  para borrar lo tuyo (si añadiste un ítem y luego saliste de la actividad, sigue siendo
  tuyo) ni para el moderator+ (limpieza del pool no debería exigir que el moderador se haya
  unido él mismo a esa actividad concreta) — mismo criterio que `club_posts delete self or
  moderate` (Bloque F), que tampoco re-comprueba membresía del club en el momento del borrado
  más allá de lo que la propia política `SELECT` ya garantiza.

**`club_activity_opinions`**
- `SELECT`/`INSERT`/`UPDATE`/`DELETE`: solo participantes (`is_activity_participant`), y para
  escritura, solo tu propia fila (`user_id = auth.uid()`) — confirma que ver las opiniones de
  otros exige haberte unido tú también, no basta con ser miembro del club.

## Dominio (`src/lib/clubs/activities/`)

```
proposeActivity(clubId, kind, title, description?, startsOn?, endsOn?)
  → inserta en 'proposed', created_by = auth.uid()
activateActivity(activityId)      → moderator+, RPC
finishActivity(activityId)        → creador o moderator+, RPC
archiveActivity(activityId)       → moderator+, RPC, desde 'proposed' o 'active'
joinActivity(activityId) / leaveActivity(activityId)
  → auto-servicio; join exige status='active' (RLS lo garantiza, el RPC/domain no necesita
    revalidar más allá de dejar que RLS rechace)
addActivityItem(activityId, itemType, itemId) / removeActivityItem(itemId)
  → participante; remove exige ser quien lo añadió o moderator+ (RLS lo garantiza)
addOpinion(activityId, itemType, itemId, rating?, comment?)
  → participante, upsert de tu propia fila
getActivity(activityId)
  → detalle + pool de ítems + lista de participantes; incluye opiniones solo si el viewer es
    participante (RLS ya lo filtra, el dominio simplemente no oculta nada extra)
listClubActivities(clubId)
  → lista plana, todos los estados, para la sección "Actividades" de /club/[slug]
```

## Notificaciones

Dos valores nuevos de `notification_type`: `club_activity_proposed` (fan-out a todos los
miembros activos excepto el proponente, al proponer) y `club_activity_activated` (fan-out a
todos excepto quien activa, al activar) — mismo mecanismo de bucle sobre miembros activos ya
usado por `club_post` (Bloque F), sin mecanismo de fan-out nuevo. A diferencia de `club_post`
(que enruta al club sin deep-link al post concreto, por simplicidad), aquí sí hay una página
propia (`/club/[slug]/actividad/[id]`) a la que enlazar — la resolución de href necesita un
join `club_activities → clubs` para el slug, mismo patrón de dos saltos que `club_post` ya
resuelve en `resolveTargetHrefs()` (Bloque F).

## UI

- Sección "Actividades" en `/club/[slug]`, debajo del feed: lista plana ordenada por
  actualidad, cada tarjeta con badge de estado (`proposed`/`active`/`finished`/`archived`) y
  tipo. Botón "Proponer actividad" (cualquier miembro).
- Ruta `/club/[slug]/actividad/[id]`: cabecera (título, descripción, tipo, estado), acciones
  de ciclo de vida según rol/relación (activar si moderator+ y `proposed`; finalizar si
  creador/moderator+ y `active`; archivar si moderator+ y `proposed`/`active`; unirse/salir si
  `active` y no eres/eres participante), pool de ítems (lista + añadir desde tu biblioteca,
  visible a cualquier miembro, editable solo por participantes), sección de opiniones
  (formulario rating+comentario, visible y editable solo si eres participante).
- Composer de "Proponer actividad": título, descripción, selector de `kind` (4 valores fijos
  por ahora), fechas opcionales. Sin campos de `config` específica de tipo — Bloque H añadirá
  esos campos cuando corresponda.
- Nuevo namespace i18n `activity.*`.

## Testing

Batería de impersonación RLS (mismo patrón que Bloques A-F) — casos por tabla: miembro/
no-miembro/anon sobre `club_activities`/`club_activity_participants`/`club_activity_items`;
participante/no-participante-pero-miembro sobre `club_activity_items` (escritura) y
`club_activity_opinions` (lectura y escritura) — este último es el caso de mayor riesgo del
bloque, análogo al "resultados ocultos hasta que votas" de Bloque F, y merece el mismo nivel
de rigor. Casos específicos: unirse a una actividad `proposed`/`finished`/`archived` debe
fallar; `activateActivity`/`archiveActivity` por un member no-moderator debe fallar;
`finishActivity` por un participante que no es ni creador ni moderator+ debe fallar. Verificación
manual en navegador con checklist, per convención de `docs/TESTING.md`.
