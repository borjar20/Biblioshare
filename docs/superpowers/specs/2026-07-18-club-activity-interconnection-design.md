# Interconexión de actividades de club — diseño

**Fecha:** 2026-07-18
**Épica:** EPIC-05 (social) — extensión del motor de actividades (Bloques G/H)
**Mockup:** `Biblioshare_mockups/.../Paper - Clubes.html`, frames 14 y 15 (el 12 muestra la
cadena en la página de actividades, pero **no** se construye — ver «Fuera de alcance»).

## Problema

Las actividades de un club (`buddy_read`, `tierlist`, `list_challenge`, `criteria_challenge`)
son hoy islas: se proponen, se activan y se cierran de forma independiente. El club quiere que
**nazcan unas de otras** para encadenar la vida lectora del grupo:

1. Dentro de un **reto por lista** activo, abrir una **lectura conjunta** partiendo de un ítem
   concreto de la lista (frame 14).
2. Al **finalizar** un reto por lista, cerrarlo creando una **tierlist** con esos mismos ítems
   ya cargados (frame 15).

Ambas actividades nuevas quedan **enlazadas** a la actividad de origen, y ese enlace se ve en
el detalle del reto como una «cadena» de actividades.

## Decisiones de diseño (fijadas en brainstorming)

- **Quién lanza:** solo el **creador del reto de origen** o un **moderador+** del club. Los
  participantes normales no ven la acción.
- **Estado inicial:** como solo la lanzan curadores/moderadores, la actividad enlazada nace
  directamente **`active`** (no pasa por moderación). La rama «participante → propuesta» se
  descarta por completo.
- **Lectura conjunta desde un ítem:** se crea de **un toque**, con ese **único ítem** en el
  pool y **sin hitos** — los hitos se configuran después desde el detalle. Solo para ítems de
  tipo **libro o serie** (las películas irán en una actividad aparte, en otra sesión).
- **Tierlist de cierre:** copia **todos** los ítems del reto; se ofrece **una sola vez**
  (mientras no exista ya una tierlist enlazada) y solo cuando el reto está **`finished`**.
- **Notificación:** tipo **propio** `club_activity_spawned` (no se reutiliza
  `club_activity_activated`).
- **Dónde se ve la cadena:** **solo en el detalle del reto de origen**. No hay sección de
  cadena en la página de actividades.

## Enfoque: RPC `SECURITY DEFINER` atómica

Toda la creación de una actividad enlazada va por una única RPC
`spawn_linked_activity(...)` en plpgsql, `security definer`. Es necesaria porque la RLS de
cliente **fuerza `status = 'proposed'`** en el INSERT y **no expone `UPDATE`** sobre
`club_activities` (las transiciones son RPC-only, Bloque G). Nacer `active` + grabar el enlace
+ copiar ítems en un solo paso atómico exige el servidor.

*Alternativa descartada:* reutilizar `proposeActivityWithSetup` (INSERT de cliente) y después
una segunda RPC de activar. Son dos viajes, no es atómico, y deja un parpadeo en `proposed`
visible para el club.

## Modelo de datos

Migración `supabase/migrations/20260718_activity_interconnection.sql` que añade a
`club_activities`:

```sql
alter table public.club_activities
  add column spawned_from_activity_id uuid references public.club_activities(id) on delete set null,
  add column spawned_from_item_type public.item_type,
  add column spawned_from_item_id uuid;

create index idx_club_activities_spawned_from
  on public.club_activities (spawned_from_activity_id);
```

- `spawned_from_activity_id` — la actividad **padre** (el reto). Es lo que agrupa la cadena.
  `on delete set null`: las actividades no se borran (se archivan), pero si algún día se
  borrara el padre, la hija sobrevive sin enlace en vez de desaparecer en cascada.
- `spawned_from_item_type` + `spawned_from_item_id` (nullables) — el **ítem de origen** de una
  lectura conjunta nacida de un ítem. `null` para la tierlist de cierre (nace del reto entero,
  no de un ítem). Da la etiqueta «nacida del ítem «X»» sin depender de inspeccionar el pool de
  la hija.

### RPC `spawn_linked_activity`

```
spawn_linked_activity(
  p_parent_activity_id uuid,
  p_kind public.activity_kind,        -- 'buddy_read' | 'tierlist'
  p_title text,
  p_from_item_type public.item_type,  -- null salvo buddy_read desde ítem
  p_from_item_id uuid                  -- null salvo buddy_read desde ítem
) returns uuid                         -- id de la hija
```

Lógica (`security definer`, `set search_path = public`):

1. Cargar `club_id`, `kind`, `status` del padre; si no existe → `raise 'not found'`.
2. **Autorización:** el llamante debe ser `parent.created_by` **o** `has_min_club_role(club_id,
   'moderator')`; si no → `raise 'forbidden'`.
3. **Validación por kind:**
   - `buddy_read`: el padre debe ser `list_challenge` **`active`**; `p_from_item_type` ∈
     (`book`, `series`); debe existir una fila en `club_activity_items` del padre con ese
     `(item_type, item_id)`.
   - `tierlist`: el padre debe ser `list_challenge` **`finished`**; no debe existir ya otra
     actividad `tierlist` con `spawned_from_activity_id = p_parent_activity_id` (oferta única).
   - Cualquier otro kind → `raise 'unsupported'`.
4. **Insertar la hija** `active`, con `club_id` heredado, `created_by = auth.uid()`,
   `spawned_from_activity_id = p_parent_activity_id`, y el ítem de origen si aplica.
5. **Copiar ítems al pool** de la hija (`club_activity_items`):
   - `buddy_read`: solo el ítem de origen (posición 0).
   - `tierlist`: todos los ítems del padre, conservando el orden.
6. `return` el id de la hija.

`revoke execute ... from public, anon; grant execute ... to authenticated;` — mismo patrón que
las demás RPC del Bloque G.

La notificación al club **no** va dentro de la RPC (sigue el patrón de `notifyClub`, que se
llama desde la capa de app tras la RPC).

## Capa de app

### `src/lib/clubs/activities/core.ts`
- `ClubActivity` / `ActivityDetail` ganan:
  - `spawnedFromActivityId: string | null`
  - `spawnedFromItem: { itemType: ItemType; itemId: string } | null`
- `ActivityDetail` gana `linkedChildren` — las actividades hijas de esta (para pintar la
  cadena en el detalle del reto). Cada hija: `id, kind, title, status, spawnedFromItem` +
  título del ítem de origen resuelto del catálogo (para «nacida del ítem «X»»).
- `getActivity` consulta las hijas con
  `.eq("spawned_from_activity_id", id)` y resuelve los títulos de sus ítems de origen.
- Nuevo server action `spawnLinkedActivity(input)` que llama a la RPC y luego
  `notifyClub(..., "club_activity_spawned", childId)`. Devuelve el id de la hija para que la
  UI navegue a ella.

### `src/lib/clubs/activities/notify-club.ts`
- El parámetro `type` admite además `"club_activity_spawned"`.

### Notificaciones
- Migración: `alter type public.notification_type add value 'club_activity_spawned';` (valor
  nuevo, solo lo lee la capa de app — sin `commit;` intermedio, como los otros valores de
  actividad).
- `notification-types.ts`: añadir `club_activity_spawned` a `NotificationType` y a
  `NOTIFICATION_TYPE_KEY` (`clubActivitySpawned`). El href resuelve a la página de la hija
  igual que el resto de notificaciones con `targetType: "club_activity"`.
- `messages/*.json`: copia del nuevo tipo (es/en) donde vivan las demás `clubActivity*`.

## UI

### Flujo A — Ítem → lectura conjunta (frame 14)
`src/components/clubs/list-challenge/list-challenge-board.tsx`: hoy cada ítem es un `<Link>`
directo a la ficha del catálogo. Para **curador/mod** (creador del reto o moderador+) y con el
reto **`active`**, el toque abre en su lugar una **hoja** (bottom sheet) con:
- Cabecera del ítem (portada + título + tipo).
- **«Abrir lectura conjunta»** — solo si el ítem es libro o serie. Llama a
  `spawnLinkedActivity({ kind: "buddy_read", parentId, title, fromItem })` y navega a la hija.
- **«Ver ficha del título»** — el `itemHref` de antes.

Para el resto de usuarios (o reto no activo, o ítem película) el toque conserva el `<Link>`
directo actual — sin hoja. Se necesita saber en el board si el viewer es curador/mod: el
`DetailExtension` ya recibe `isModerator`; hay que pasarle también si es el creador del reto
(`viewerId === activity.createdBy`).

### Flujo B — Reto finalizado → tierlist (frame 15)
En la extensión de detalle del `list_challenge` (o en un bloque de la ficha de actividad),
cuando el reto está **`finished`**:
- Si **no** hay tierlist enlazada y el viewer es curador/mod: banner **«Cierra con una
  tierlist»** con botón **«Crear»** → `spawnLinkedActivity({ kind: "tierlist", parentId,
  title })` → navega a la hija.
- **«Actividades enlazadas a este reto»**: lista de `linkedChildren`, cada una con su estado
  y su tie «nacida del ítem «X»» (cuando `spawnedFromItem` no es null), enlazando a cada hija.

Ambos bloques (A y B) leen de los datos que `getActivity` ya devuelve; no hacen fetch propio.

## Fuera de alcance (YAGNI)

- **Solo dos tipos de conexión:** buddy_read desde ítem, y tierlist al cierre. Nada de «spawn»
  genérico entre kinds arbitrarios.
- **Películas:** no ofrecen «abrir lectura conjunta». Su actividad conjunta irá aparte, en otra
  sesión (diferido explícito).
- **Cadena en la página de actividades (frame 12):** no se construye; la cadena vive solo en el
  detalle del reto de origen.
- **Tierlist de cierre:** oferta única; no se re-ofrece ni se versiona.

## Verificación

- E2E (Playwright): como curador de un `list_challenge` activo, abrir lectura conjunta desde un
  ítem de libro → aparece una `buddy_read` activa enlazada, con ese ítem en el pool; el ítem de
  una película no ofrece la acción.
- E2E: finalizar un reto → banner de tierlist → crear → aparece una `tierlist` activa con todos
  los ítems; el banner desaparece (oferta única); la hija figura en «Actividades enlazadas».
- Autorización: un participante no-curador no ve ninguna de las dos acciones, y la RPC rechaza
  (`forbidden`) si se la invoca a mano.
- La notificación `club_activity_spawned` llega al resto del club y enlaza a la hija.
