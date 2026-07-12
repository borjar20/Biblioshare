# EPIC-05 Bloque E — Clubes: creación, membresía y roles — Design

## Alcance

Este bloque cubre exactamente `E5.E1`–`E5.E4` del backlog (`docs/requirements/social-epic.md`):
esquema, roles/membresía, UI de `/club/[slug]` y `/clubes`, gestión de miembros. El feed del
club (posts, actividades) es **Bloque F**, explícitamente fuera de este alcance.

Las decisiones de diseño previas de `SD-4` (`docs/requirements/social-epic.md`) ya fijaron el
patrón central y se dan por buenas aquí sin reabrir debate: helpers `SECURITY DEFINER`
replicando el patrón RBAC, y **el contenido de un club es siempre solo-miembros
independientemente de `visibility`** — `visibility` solo gobierna descubrimiento y cómo te
unes, nunca quién ve el contenido una vez dentro.

## Decisiones tomadas en esta sesión

- **Creación de clubes**: abierta a cualquier usuario autenticado, sin gateo de rol (a
  diferencia de la contribución de catálogo manual, §7.35). Coherente con el resto de
  acciones sociales del epic (seguir, reaccionar).
- **El owner no puede abandonar el club sin transferir la propiedad primero**, salvo que sea
  el único miembro — en ese caso, `leaveClub` borra el club directamente.
- **Borrado de cuenta del owner** (función que hoy **no existe** en la app — verificado, no
  hay ningún flujo de account-deletion): en vez de asumir que un futuro feature de borrado de
  cuenta recordará gestionar esto, se resuelve a nivel de base de datos con un trigger que
  **siempre** reasigna la propiedad al miembro más antiguo restante (o borra el club si no
  queda nadie), sea cual sea la vía por la que desaparece la fila de membresía del owner.
- **Portada del club**: reutiliza el bucket de Storage de avatares ya existente
  (`20260710_avatars_storage.sql`), bajo el prefijo `clubs/{club_id}/cover.webp`, reutilizando
  también el componente `AvatarUpload`.
- **Slug fijo al crear** (no editable) — evita romper enlaces compartidos a `/club/[slug]`
  sin necesitar un historial de redirecciones.
- **Invitación directa incluida desde el inicio** (no diferida), gateada a moderator+.

## Modelo de datos

```sql
create type public.club_visibility as enum ('public', 'private');
-- Orden ascendente de autoridad (mismo patrón que user_role: user<collaborator<admin) —
-- Postgres compara enums por orden de declaración, así que 'member' debe ir primero para
-- que has_min_club_role()/las comparaciones de rol ('>' en removeMember, etc.) funcionen.
create type public.club_role as enum ('member', 'moderator', 'owner');
create type public.club_member_status as enum ('pending', 'invited', 'active');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  cover_url text,
  visibility public.club_visibility not null default 'public',
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.club_role not null default 'member',
  status public.club_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
```

`club_member_status` tiene dos estados de "no soy miembro activo todavía" con semántica
opuesta sobre quién actúa a continuación:
- `pending`: el usuario pidió unirse a un club privado, espera aprobación de un moderator+.
- `invited`: un moderator+ invitó al usuario, espera que **él** acepte o rechace.

### Invariante de propiedad (trigger)

`BEFORE DELETE` en `club_members`: si la fila que se borra tiene `role = 'owner'`, busca otro
miembro del mismo club (prioriza otro `moderator`, si no cualquier `member`, el más antiguo
por `joined_at`) y lo promociona a `owner` (actualiza también `clubs.owner_id`); si no queda
nadie más, borra la fila de `clubs` directamente. Este trigger es el único mecanismo que
gestiona la reasignación — se dispara igual si la fila desaparece por cascade desde
`auth.users` (borrado de cuenta, cuando exista) o por cualquier otra vía. `leaveClub()` añade
su propia guarda por encima (ver Dominio) para el caso de auto-servicio.

`clubs.owner_id references auth.users(id)` sin `on delete cascade` — Postgres comprueba las
FK no-cascade al final de la sentencia/cascada, así que para cuando se evalúa esa comprobación
el trigger de `club_members` ya ha reasignado `owner_id` a otro usuario (o borrado la fila de
`clubs` entera), por lo que nunca llega a violarse.

## Helpers `SECURITY DEFINER`

Replican el patrón ya usado por `current_user_role()`/`has_min_role()` (§7.35) y
`can_view_profile()` (SD-2), evitando RLS recursiva sobre `club_members`:

```sql
is_club_member(club_id uuid) returns boolean
club_role(club_id uuid) returns public.club_role  -- null si no es miembro
has_min_club_role(club_id uuid, min public.club_role) returns boolean
```

Los tres solo cuentan filas con `status = 'active'` — una fila `pending` o `invited` ya tiene
un `role` (por defecto `'member'`), pero no debe tratarse como membresía real todavía o
alguien con una solicitud sin aprobar vería contenido antes de tiempo.

## RLS

**`clubs`**
- `SELECT`: `visibility = 'public' OR is_club_member(id)` — la fila entera (incluida
  `description`) de un club privado es invisible a no-miembros, no solo su contenido.
- `INSERT`: cualquier `authenticated` (sin gateo de rol).
- `UPDATE`: `has_min_club_role(id, 'moderator')`.

**`club_members`**
- `SELECT`: `is_club_member(club_id)` — el roster no es visible a no-miembros.
- `INSERT`, con ramas:
  - Auto-servicio (`user_id = auth.uid()`): `status = 'active'` si el club es público,
    `status = 'pending'` si es privado.
  - Invitación (`has_min_club_role(club_id, 'moderator')`, `user_id <> auth.uid()`):
    `status = 'invited'`.
- `UPDATE`, con ramas — **ninguna toca `role`**, ver nota debajo:
  - Auto-servicio: `user_id = auth.uid() AND status = 'invited'`, `with check (status =
    'active')` (aceptar invitación).
  - Moderación: `has_min_club_role(club_id, 'moderator')` sobre filas `status = 'pending'`,
    `with check (status = 'active')` (aprobar solicitud).

  Una política `UPDATE` gateada solo por `has_min_club_role(moderator)` sin restringir qué
  columnas cambian dejaría que un moderator se auto-asignara `role = 'owner'` en la misma
  llamada — de ahí que ambas ramas fijen `with check (status = 'active')`: solo pueden mover
  el estado a `active`, nunca tocar `role`. Los cambios de rol (`setMemberRole`,
  `transferOwnership`) **no pasan por esta política en absoluto** — ver Dominio.
- `DELETE`, con ramas:
  - Auto-servicio: `user_id = auth.uid()` (salir, rechazar invitación/solicitud propia).
  - Moderación: `has_min_club_role(club_id, 'moderator') AND club_role(club_id) > role`
    (un moderator puede expulsar a un member, pero no a otro moderator ni al owner; el owner
    puede expulsar a cualquiera por debajo de él).

## Dominio (`src/lib/clubs/`)

```
createClub(input: { name, slug, description?, visibility, coverFile? })
  → crea clubs + club_members (owner, active) atómicamente
updateClub(clubId, input: { name?, description?, visibility?, coverFile? })
  → moderator+
joinClub(clubId)
  → active si público, pending si privado
leaveClub(clubId)
  → auto-servicio; rechaza con error si el actor es owner y hay otros miembros
    ("transfiere la propiedad antes de salir"); si es el único miembro, borra el club
approveMember(clubId, userId)
  → pending → active, moderator+
inviteMember(clubId, userId)
  → moderator+. Si el usuario ya tiene una fila 'pending', la aprueba directamente
    (equivalente a approveMember). Si no, crea una fila 'invited' y notifica
    (club_invite)
acceptInvite(clubId) / declineInvite(clubId)
  → auto-servicio sobre una fila 'invited' propia; accept notifica de vuelta
    (club_invite_accepted) a quien invitó
removeMember(clubId, userId)
  → moderator+, no puede apuntar a rol igual o superior al propio
setMemberRole(clubId, userId, role)
  → owner-only (promover a moderator / degradar a member). Implementado como función
    SECURITY DEFINER (mismo patrón que resolve_pending_import) con el chequeo de
    autorización dentro de la función, no como UPDATE de cliente gateado por RLS —
    así el cambio de `role` nunca pasa por la política RLS de club_members (ver RLS)
transferOwnership(clubId, newOwnerId)
  → owner-only; newOwnerId debe ser miembro activo. El owner saliente pasa a
    'moderator' (no a 'member' — conserva su posición de confianza), el nuevo
    owner pasa a 'owner', clubs.owner_id se actualiza. Atómico, misma razón que
    setMemberRole: función SECURITY DEFINER, no UPDATE de cliente
getClub(slug)
  → club completo + estado de membresía del viewer (none/pending/invited/active/role)
listMyClubs()
  → clubs donde el viewer es miembro active
discoverPublicClubs(query?)
  → clubs públicos, búsqueda por nombre, con el estado de membresía del viewer por fila
```

## Notificaciones

Cuatro tipos nuevos en `notification_type`, simétricos al patrón ya usado por
`follow_request`/`follow_accepted`:

- `club_join_request` → a los moderator+ del club, cuando alguien solicita unirse a un
  club privado.
- `club_join_approved` → al solicitante, cuando su solicitud se aprueba.
- `club_invite` → al invitado, cuando un moderator+ le invita.
- `club_invite_accepted` → a quien invitó, cuando el invitado acepta.

Todas enrutan a `/club/[slug]`. `notifications.target_type` es `text` suelto (no el enum
`target_kind` de `reactions`/`comments`, que es una tabla aparte) — se usa directamente el
literal `'club'` con `target_id = clubs.id`, sin cambio de esquema en `notifications`.

## UI

- **`/club/[slug]`**: cabecera (portada, nombre, descripción, nº de miembros), botón de
  acción según estado del viewer (`Unirse` / `Solicitar unirse` / `Aceptar invitación` +
  `Rechazar` / `Salir` / nada si es owner). Roster visible solo a miembros. Sección
  "Gestionar miembros" expandible in-place (solicitudes pendientes a aprobar, roster con
  acciones promover/expulsar/invitar) visible solo a moderator+ — mismo patrón de
  expandir-en-línea que `EditProfileForm`, no una ruta aparte.
- **`/clubes`**: "Mis clubes" (`listMyClubs`) + "Descubrir" (`discoverPublicClubs`,
  buscador por nombre) + botón "Crear club" que expande el formulario de creación in-line
  (mismo patrón que arriba), sin ruta `/clubes/nuevo` dedicada.
- Edición del club (moderator+) in-line en `/club/[slug]`, mismo patrón de toggle.
- Portada: reutiliza `AvatarUpload`, apuntado a `clubs/{club_id}/cover.webp`.
- Nuevo namespace i18n `club.*`.

## Testing

Batería de impersonación RLS (mismo patrón que Bloques A/B/D): owner/moderator/member/
no-miembro/anon sobre cada tabla nueva, más casos específicos de esta feature — insertar
`invited` como no-moderator (debe fallar), aceptar invitación ajena (debe fallar), moderator
intentando expulsar a otro moderator o al owner (debe fallar), transferencia de propiedad a
alguien que no es miembro activo (debe fallar). Verificación manual en navegador con dos
cuentas reales antes de aplicar a prod, per convención de `docs/TESTING.md`.
