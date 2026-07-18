# Interconexión de actividades de club — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las actividades de un club nazcan unas de otras — abrir una lectura conjunta desde
un ítem de un reto por lista, y crear una tierlist con los ítems del reto al finalizarlo — con el
enlace visible como cadena en el detalle del reto.

**Architecture:** Una columna de enlace en `club_activities` + una RPC `SECURITY DEFINER`
atómica (`spawn_linked_activity`) que crea la actividad hija ya `active`, copia el pool y graba
el enlace. La capa de app expone un server action `spawnLinkedActivity`; la UI añade una hoja
sobre el tablero del reto (frame 14) y una sección de «actividades enlazadas» + oferta de
tierlist en el detalle (frame 15).

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase (Postgres + RLS + RPC
plpgsql), next-intl, Tailwind, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-18-club-activity-interconnection-design.md`

## Global Constraints

- **Node:** usa la versión del `.nvmrc` (fnm con Node 22.x); el shell arranca en 20.9 — ejecuta
  `fnm use` (o `fnm exec --using=22`) antes de `tsc`, `vitest` o Playwright. Ver memoria
  `node-y-vitest`.
- **Migraciones:** el proyecto tiene dos entornos Supabase (memoria `supabase-environments`).
  Aplica la migración **primero a dev** vía `mcp__supabase__apply_migration`; prod es un deploy
  aparte y **no** forma parte de este plan. Nombre de archivo `supabase/migrations/
  20260718_activity_interconnection.sql`.
- **Locales:** solo existe `messages/es.json`. No hay `en.json` — no lo crees.
- **RPC:** patrón fijo del Bloque G — `security definer`, `set search_path = public`,
  `revoke execute ... from public, anon; grant execute ... to authenticated;`. Las transiciones
  de estado de `club_activities` son **RPC-only** (no hay política UPDATE de cliente).
- **Autorización «curador»:** significa `parent.created_by = auth.uid()` **O**
  `has_min_club_role(club_id, 'moderator')`. Úsalo idéntico en RPC y en UI.
- **Enum de notificaciones:** añadir valor con `alter type ... add value` — solo lo lee la capa
  de app, sin `commit;` intermedio (igual que `club_activity_proposed/activated`).
- **`revalidateClubPages()`** tras toda mutación (patrón de `core.ts`).

---

### Task 1: Migración — enlace + RPC `spawn_linked_activity` + tipo de notificación

**Files:**
- Create: `supabase/migrations/20260718_activity_interconnection.sql`

**Interfaces:**
- Produces (SQL): columnas `club_activities.spawned_from_activity_id uuid`,
  `spawned_from_item_type public.item_type`, `spawned_from_item_id uuid`; función
  `public.spawn_linked_activity(p_parent_activity_id uuid, p_kind public.activity_kind,
  p_title text, p_from_item_type public.item_type, p_from_item_id uuid) returns uuid`; valor de
  enum `public.notification_type` `'club_activity_spawned'`.

- [ ] **Step 1: Escribir la migración completa**

Create `supabase/migrations/20260718_activity_interconnection.sql`:

```sql
-- EPIC-05 — Interconexión de actividades de club. Ver
-- docs/superpowers/specs/2026-07-18-club-activity-interconnection-design.md
-- Una actividad puede nacer ENLAZADA a otra: una lectura conjunta desde un ítem de un reto por
-- lista (frame 14), o una tierlist con los ítems del reto al cerrarlo (frame 15). Solo las lanza
-- el creador del reto o moderator+ del club, y nacen ya 'active' (no pasan por moderación), por
-- lo que su creación NO puede ir por INSERT de cliente (la RLS fuerza 'proposed') — va por esta
-- RPC atómica.

alter table public.club_activities
  add column spawned_from_activity_id uuid references public.club_activities(id) on delete set null,
  add column spawned_from_item_type public.item_type,
  add column spawned_from_item_id uuid;

create index idx_club_activities_spawned_from
  on public.club_activities (spawned_from_activity_id);

comment on column public.club_activities.spawned_from_activity_id is
  'Actividad padre de la que nació esta (interconexión). Agrupa la cadena en el detalle del reto.';
comment on column public.club_activities.spawned_from_item_type is
  'Tipo del ítem de origen (solo lecturas conjuntas nacidas de un ítem; null en tierlist de cierre).';
comment on column public.club_activities.spawned_from_item_id is
  'Ítem de origen (solo lecturas conjuntas nacidas de un ítem; null en tierlist de cierre).';

-- spawn_linked_activity: crea una actividad hija ya 'active', copia el pool desde el padre y
-- graba el enlace, todo en una transacción. Autorización: creador del padre O moderator+.
create or replace function public.spawn_linked_activity(
  p_parent_activity_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_from_item_type public.item_type,
  p_from_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_parent_kind public.activity_kind;
  v_parent_status public.activity_status;
  v_created_by uuid;
  v_child_id uuid;
  v_title text := trim(p_title);
begin
  select club_id, kind, status, created_by
    into v_club_id, v_parent_kind, v_parent_status, v_created_by
    from public.club_activities where id = p_parent_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_title = '' then
    raise exception 'title_required';
  end if;
  if v_parent_kind <> 'list_challenge' then
    raise exception 'unsupported parent kind';
  end if;

  if p_kind = 'buddy_read' then
    if v_parent_status <> 'active' then
      raise exception 'parent must be active';
    end if;
    if p_from_item_type is null or p_from_item_id is null then
      raise exception 'from item required';
    end if;
    if p_from_item_type not in ('book', 'series') then
      raise exception 'buddy read only for book or series';
    end if;
    if not exists (
      select 1 from public.club_activity_items
      where activity_id = p_parent_activity_id
        and item_type = p_from_item_type and item_id = p_from_item_id
    ) then
      raise exception 'item not in parent pool';
    end if;
  elsif p_kind = 'tierlist' then
    if v_parent_status <> 'finished' then
      raise exception 'parent must be finished';
    end if;
    if exists (
      select 1 from public.club_activities
      where spawned_from_activity_id = p_parent_activity_id and kind = 'tierlist'
    ) then
      raise exception 'tierlist already linked';
    end if;
  else
    raise exception 'unsupported child kind';
  end if;

  insert into public.club_activities (
    club_id, kind, title, status, created_by,
    spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id
  ) values (
    v_club_id, p_kind, v_title, 'active', auth.uid(),
    p_parent_activity_id,
    case when p_kind = 'buddy_read' then p_from_item_type else null end,
    case when p_kind = 'buddy_read' then p_from_item_id else null end
  )
  returning id into v_child_id;

  if p_kind = 'buddy_read' then
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    values (v_child_id, p_from_item_type, p_from_item_id, auth.uid(), 0);
  else -- tierlist: copia todos los ítems del padre conservando el orden
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    select v_child_id, item_type, item_id, auth.uid(), position
      from public.club_activity_items
      where activity_id = p_parent_activity_id;
  end if;

  return v_child_id;
end;
$$;

revoke execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) from public, anon;
grant execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) to authenticated;

comment on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) is
  'Crea una actividad hija ya active enlazada a un reto por lista: buddy_read desde un ítem (book/series, padre active) o tierlist con todos los ítems (padre finished, oferta única). Solo creador del padre o moderator+.';

alter type public.notification_type add value 'club_activity_spawned';
```

- [ ] **Step 2: Aplicar a dev y verificar que existe**

Aplica vía `mcp__supabase__apply_migration` (proyecto **dev**), name `activity_interconnection`.
Luego `mcp__supabase__execute_sql` en dev:

```sql
select column_name from information_schema.columns
  where table_name = 'club_activities'
    and column_name in ('spawned_from_activity_id','spawned_from_item_type','spawned_from_item_id')
  order by column_name;
select proname from pg_proc where proname = 'spawn_linked_activity';
select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'notification_type' and enumlabel = 'club_activity_spawned';
```

Expected: 3 columnas, 1 función, 1 label de enum.

- [ ] **Step 3: Smoke test de autorización (rechazo)**

`mcp__supabase__execute_sql` en dev — sin sesión `auth.uid()` la función debe rechazar por
`forbidden`/`not found`, nunca crear filas:

```sql
select public.spawn_linked_activity(
  '00000000-0000-0000-0000-000000000000'::uuid, 'buddy_read', 'x', 'book', gen_random_uuid()
);
```

Expected: ERROR `not found` (parent inexistente). Confirma que la función está montada y valida
antes de insertar.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260718_activity_interconnection.sql
git commit -m "feat(clubes): migración de interconexión — enlace + spawn_linked_activity + notif"
```

---

### Task 2: `core.ts` — tipos, hijas enlazadas y server action `spawnLinkedActivity`

**Files:**
- Modify: `src/lib/clubs/activities/core.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Consumes (Task 1): RPC `spawn_linked_activity`, columnas nuevas.
- Produces:
  - `ClubActivity` gana `spawnedFromActivityId: string | null` y
    `spawnedFromItem: { itemType: ItemType; itemId: string } | null`.
  - `export type LinkedChild = { id: string; kind: ActivityKind; title: string; status: ActivityStatus; fromItem: { itemType: ItemType; itemId: string; itemTitle: string } | null }`.
  - `ActivityDetail` gana `linkedChildren: LinkedChild[]`.
  - `export async function spawnLinkedActivity(input: { parentActivityId: string; kind: "buddy_read" | "tierlist"; title: string; fromItemType?: ItemType | null; fromItemId?: string | null }): Promise<string>` — devuelve el id de la hija.

- [ ] **Step 1: Regenerar los tipos de Supabase**

Tras aplicar la migración (Task 1), regenera contra **dev**:

```
mcp__supabase__generate_typescript_types  ->  sobrescribe src/lib/supabase/database.types.ts
```

Verifica que `club_activities` Row incluye `spawned_from_activity_id`, `spawned_from_item_type`,
`spawned_from_item_id`, y que `Functions` incluye `spawn_linked_activity`.

- [ ] **Step 2: Ampliar los tipos y el SELECT de `getActivity`**

En `src/lib/clubs/activities/core.ts`, añade los campos al SELECT de columnas (constante de
columnas usada por `listClubActivities` y `getActivity`) — cambia ambos `.select("id, club_id,
kind, title, description, status, config, created_by, starts_on, ends_on, created_at")` por:

```ts
"id, club_id, kind, title, description, status, config, created_by, starts_on, ends_on, created_at, spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id"
```

Añade a `ClubActivity`:

```ts
  spawnedFromActivityId: string | null;
  spawnedFromItem: { itemType: ItemType; itemId: string } | null;
```

Y en los dos `return rows.map(...)`/objeto de `getActivity`, mapea:

```ts
    spawnedFromActivityId: r.spawned_from_activity_id,
    spawnedFromItem:
      r.spawned_from_item_type && r.spawned_from_item_id
        ? { itemType: r.spawned_from_item_type as ItemType, itemId: r.spawned_from_item_id }
        : null,
```

- [ ] **Step 3: Añadir `LinkedChild`, `linkedChildren` y su consulta en `getActivity`**

Añade el tipo (junto a `ActivityDetail`):

```ts
export type LinkedChild = {
  id: string;
  kind: ActivityKind;
  title: string;
  status: ActivityStatus;
  fromItem: { itemType: ItemType; itemId: string; itemTitle: string } | null;
};
```

Añade `linkedChildren: LinkedChild[];` a `ActivityDetail`.

Dentro de `getActivity`, antes del `return`, consulta las hijas y resuelve el título del ítem de
origen (reutilizando el mismo patrón de catálogo por tipo que ya usa el pool):

```ts
  const { data: childRows } = await supabase
    .from("club_activities")
    .select("id, kind, title, status, spawned_from_item_type, spawned_from_item_id")
    .eq("spawned_from_activity_id", activityId)
    .order("created_at", { ascending: true });

  const childIdsByType: Record<ItemType, Set<string>> = {
    book: new Set(), movie: new Set(), series: new Set(),
  };
  for (const c of childRows ?? []) {
    if (c.spawned_from_item_type && c.spawned_from_item_id) {
      childIdsByType[c.spawned_from_item_type as ItemType].add(c.spawned_from_item_id);
    }
  }
  const [cBooks, cMovies, cSeries] = await Promise.all([
    childIdsByType.book.size
      ? supabase.from("books").select("id, title").in("id", [...childIdsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    childIdsByType.movie.size
      ? supabase.from("movies").select("id, title").in("id", [...childIdsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    childIdsByType.series.size
      ? supabase.from("series").select("id, title").in("id", [...childIdsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const childTitleByKey = new Map<string, string>();
  for (const r of cBooks.data ?? []) childTitleByKey.set(`book:${r.id}`, r.title);
  for (const r of cMovies.data ?? []) childTitleByKey.set(`movie:${r.id}`, r.title);
  for (const r of cSeries.data ?? []) childTitleByKey.set(`series:${r.id}`, r.title);

  const linkedChildren: LinkedChild[] = (childRows ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    status: c.status,
    fromItem:
      c.spawned_from_item_type && c.spawned_from_item_id
        ? {
            itemType: c.spawned_from_item_type as ItemType,
            itemId: c.spawned_from_item_id,
            itemTitle:
              childTitleByKey.get(`${c.spawned_from_item_type}:${c.spawned_from_item_id}`) ?? "",
          }
        : null,
  }));
```

Añade `linkedChildren,` al objeto devuelto por `getActivity`.

- [ ] **Step 4: Añadir el server action `spawnLinkedActivity`**

En `core.ts` (es `"use server"`), añade:

```ts
export async function spawnLinkedActivity(input: {
  parentActivityId: string;
  kind: "buddy_read" | "tierlist";
  title: string;
  fromItemType?: ItemType | null;
  fromItemId?: string | null;
}): Promise<string> {
  const { supabase, userId } = await requireUser();
  const { data: childId, error } = await supabase.rpc("spawn_linked_activity", {
    p_parent_activity_id: input.parentActivityId,
    p_kind: input.kind,
    p_title: input.title,
    p_from_item_type: input.fromItemType ?? null,
    p_from_item_id: input.fromItemId ?? null,
  });
  if (error) throw error;

  // La hija ya nace en el mismo club que el padre; leemos su club_id para el fan-out.
  const { data: child } = await supabase
    .from("club_activities")
    .select("club_id")
    .eq("id", childId as string)
    .single();
  if (child) {
    await notifyClub(supabase, child.club_id, userId, "club_activity_spawned", childId as string);
  }
  revalidateClubPages();
  return childId as string;
}
```

- [ ] **Step 5: Typecheck**

Run: `fnm exec --using=22 npx tsc --noEmit`
Expected: sin errores. (Falla si `notify-club.ts` aún no admite `"club_activity_spawned"` — se
amplía en Task 3; si ejecutas Task 2 antes que Task 3, ese error es esperado hasta cerrar Task 3.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/activities/core.ts src/lib/supabase/database.types.ts
git commit -m "feat(clubes): core — hijas enlazadas y spawnLinkedActivity"
```

---

### Task 3: Notificación `club_activity_spawned` (tipos + href + copia)

**Files:**
- Modify: `src/lib/clubs/activities/notify-club.ts:16`
- Modify: `src/lib/social/notification-types.ts:22-23,57-58`
- Modify: `messages/es.json` (namespaces `notifications` y `activity`)

**Interfaces:**
- Consumes (Task 2): `spawnLinkedActivity` llama `notifyClub(..., "club_activity_spawned", ...)`.
- Produces: `NotificationType` incluye `"club_activity_spawned"`; `NOTIFICATION_TYPE_KEY` mapea a
  `"clubActivitySpawned"`; el href ya resuelve por `targetType: "club_activity"` (sin cambios en
  `notifications.ts`).

- [ ] **Step 1: Ampliar el union de `notify-club.ts`**

En `src/lib/clubs/activities/notify-club.ts`, cambia el parámetro `type`:

```ts
  type: "club_activity_proposed" | "club_activity_activated" | "club_activity_spawned",
```

- [ ] **Step 2: Ampliar `NotificationType` y `NOTIFICATION_TYPE_KEY`**

En `src/lib/social/notification-types.ts`, añade al final del union (tras
`| "club_activity_activated"`):

```ts
  | "club_activity_spawned";
```

Y en `NOTIFICATION_TYPE_KEY`, tras `club_activity_activated: "clubActivityActivated",`:

```ts
  club_activity_spawned: "clubActivitySpawned",
```

- [ ] **Step 3: Añadir la copia en `messages/es.json`**

En el namespace `notifications` (tras `"clubActivityActivated"`, línea ~339):

```json
    "clubActivitySpawned": "{name} enlazó una actividad nueva en el club",
```

(Cuida la coma: la línea anterior debe terminar en coma y esta también si no es la última del
objeto.)

- [ ] **Step 4: Verificar JSON y typecheck**

Run: `fnm exec --using=22 node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"`
Expected: `ok`

Run: `fnm exec --using=22 npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/notify-club.ts src/lib/social/notification-types.ts messages/es.json
git commit -m "feat(clubes): notificación club_activity_spawned"
```

---

### Task 4: Frame 14 — hoja de ítem → abrir lectura conjunta

**Files:**
- Create: `src/components/clubs/list-challenge/item-connect-sheet.tsx`
- Modify: `src/components/clubs/list-challenge/list-challenge-board.tsx`
- Modify: `messages/es.json` (namespace `activity`)
- Create: `e2e/activity-interconnection-buddy.spec.ts`

**Interfaces:**
- Consumes (Task 2): `spawnLinkedActivity`. `ActivityItem` (`itemType`, `itemId`, `itemTitle`,
  `itemCoverUrl`). `ActivityDetail` (`id`, `title`, `createdBy`, `status`).
- Produces: `ItemConnectSheet` (dialog controlado por `open`/`onClose`).

- [ ] **Step 1: Crear `ItemConnectSheet` (hoja del frame 14)**

Espeja el patrón `<dialog>` de `src/components/detail/close-pass-sheet.tsx` (showModal/close por
`open`, cierre por evento nativo, clic en el fondo cierra). Create
`src/components/clubs/list-challenge/item-connect-sheet.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import { spawnLinkedActivity } from "@/lib/clubs/activities/core";
import { itemHref } from "@/lib/catalog/item-href";

// Hoja del frame 14: al tocar un ítem de un reto por lista (siendo curador/mod y con el reto
// activo) se ofrece abrir una lectura conjunta partiendo de ese ítem, o ir a su ficha. La
// acción de lectura conjunta solo aplica a libro/serie (las películas irán aparte).
export function ItemConnectSheet({
  parentActivityId,
  item,
  open,
  onClose,
}: {
  parentActivityId: string;
  item: ActivityItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!item) return <dialog ref={dialogRef} onClose={onClose} className="hidden" />;

  const canBuddyRead = item.itemType === "book" || item.itemType === "series";

  function openBuddyRead() {
    if (!item) return;
    setError(false);
    startTransition(async () => {
      try {
        const childId = await spawnLinkedActivity({
          parentActivityId,
          kind: "buddy_read",
          title: `${t("kind_buddy_read")} · ${item.itemTitle}`,
          fromItemType: item.itemType,
          fromItemId: item.itemId,
        });
        dialogRef.current?.close();
        // Navega al club correcto vía la ruta de actividad; el slug lo resuelve la página.
        router.push(`../actividad/${childId}`);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="item-connect-title"
      className="m-auto mt-auto mb-0 w-full max-w-lg rounded-t-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="h-16 w-11 shrink-0 overflow-hidden rounded-[5px] bg-surface-muted">
            {item.itemCoverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
              <img src={item.itemCoverUrl} alt={item.itemTitle} className="h-full w-full object-cover" />
            )}
          </div>
          <div>
            <div id="item-connect-title" className="font-serif text-sm font-semibold">
              {item.itemTitle}
            </div>
            <div className="text-[11.5px] text-muted-foreground">{t(`kind_${item.itemType === "series" ? "list_challenge" : "buddy_read"}`)}</div>
          </div>
        </div>

        <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("connectFromItem")}
        </h3>

        {canBuddyRead && (
          <button
            type="button"
            onClick={openBuddyRead}
            disabled={pending}
            className="flex items-center gap-3 rounded-card border border-accent/40 bg-accent/[0.08] px-4 py-3 text-left disabled:opacity-60"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent/15 text-accent">◈</span>
            <span className="flex-1">
              <span className="block font-serif text-sm font-semibold">{t("openBuddyRead")}</span>
              <span className="block text-[11.5px] text-muted-foreground">{t("openBuddyReadHint")}</span>
            </span>
            <span className="text-muted-foreground">›</span>
          </button>
        )}

        <a
          href={itemHref(item.itemType, item.itemId)}
          className="flex items-center gap-3 rounded-card border border-border px-4 py-3"
        >
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-surface-muted text-muted-foreground">▤</span>
          <span className="flex-1">
            <span className="block font-serif text-sm font-semibold">{t("viewItemSheet")}</span>
            <span className="block text-[11.5px] text-muted-foreground">{t("viewItemSheetHint")}</span>
          </span>
          <span className="text-muted-foreground">›</span>
        </a>

        <p className="text-center font-mono text-[9.5px] leading-relaxed text-faint">
          {t("tierlistOfferedAtClose")}
        </p>

        {error && <p className="text-center text-xs text-destructive">{t("proposeError")}</p>}
      </div>
    </dialog>
  );
}
```

Nota: la línea de `t(\`kind_${...}\`)` para el subtítulo del ítem es cosmética; si molesta, usa
un mapa `itemType → clave` propio. No inventes claves nuevas fuera de las de Step 3.

- [ ] **Step 2: Enganchar la hoja en `list-challenge-board.tsx`**

En `src/components/clubs/list-challenge/list-challenge-board.tsx`:
1. Destructura también `viewerId` e `isModerator` (hoy solo usa `activity`).
2. Calcula `const isCurator = isModerator || activity.createdBy === viewerId;` y
   `const canConnect = isCurator && activity.status === "active";`.
3. Añade estado `const [sheetItem, setSheetItem] = useState<ActivityItem | null>(null);`.
4. En el grid de ítems (líneas ~104-128), cuando `canConnect`, cambia el `<Link>` por un
   `<button type="button" onClick={() => setSheetItem(item)}>` con las mismas clases; cuando no,
   deja el `<Link>` actual. Renderiza al final:

```tsx
      <ItemConnectSheet
        parentActivityId={activity.id}
        item={sheetItem}
        open={sheetItem !== null}
        onClose={() => setSheetItem(null)}
      />
```

Imports nuevos: `import { ItemConnectSheet } from "./item-connect-sheet";` y
`import type { ActivityItem } from "@/lib/clubs/activities/core";`.

- [ ] **Step 3: Añadir la copia `activity` en `messages/es.json`**

En el namespace `activity`, añade:

```json
    "connectFromItem": "Conectar una actividad desde este ítem",
    "openBuddyRead": "Abrir lectura conjunta",
    "openBuddyReadHint": "Leerlo en grupo, con hitos y chat sin spoilers",
    "viewItemSheet": "Ver ficha del título",
    "viewItemSheetHint": "Puntuar, opinar y ver reseñas del club",
    "tierlistOfferedAtClose": "La tierlist con estos ítems se ofrece al cerrar el reto, no por ítem.",
```

- [ ] **Step 4: Escribir el e2e (falla primero)**

Create `e2e/activity-interconnection-buddy.spec.ts`. Sigue el patrón de
`e2e/propose-wizard.spec.ts` (login, crear/entrar a un club, crear un reto por lista activo con
al menos un ítem de libro). Cuerpo del caso:

```ts
import { test, expect } from "@playwright/test";

// Curador de un reto por lista activo abre una lectura conjunta desde un ítem de libro.
test("abre lectura conjunta desde un ítem del reto", async ({ page }) => {
  // ... setup: login como owner del club, crear reto por lista activo con un libro (helpers
  //     del propio proyecto, ver propose-wizard.spec.ts). Deja `page` en el detalle del reto.

  // Toca el ítem -> se abre la hoja con la acción.
  await page.getByRole("img", { name: /.*/ }).first().click();
  await expect(page.getByRole("heading", { name: "Conectar una actividad desde este ítem" })).toBeVisible();

  await page.getByRole("button", { name: "Abrir lectura conjunta" }).click();

  // Aterriza en la actividad hija: lectura conjunta activa con ese ítem.
  await expect(page.getByText("Lectura conjunta", { exact: false })).toBeVisible();
  await expect(page.getByText("Activa")).toBeVisible();
});
```

Run: `fnm exec --using=22 npx playwright test e2e/activity-interconnection-buddy.spec.ts`
Expected: FAIL (la hoja/acción aún no existe si se corre antes de Steps 1-2; tras ellos, PASS).

- [ ] **Step 5: Ejecutar el e2e hasta verde**

Run: `fnm exec --using=22 npx playwright test e2e/activity-interconnection-buddy.spec.ts`
Expected: PASS. (Ver memoria `e2e-contra-build-de-produccion` sobre 2 fallos preexistentes
ajenos; corre solo este archivo.)

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/list-challenge/item-connect-sheet.tsx src/components/clubs/list-challenge/list-challenge-board.tsx messages/es.json e2e/activity-interconnection-buddy.spec.ts
git commit -m "feat(clubes): frame 14 — hoja de ítem para abrir lectura conjunta"
```

---

### Task 5: Frame 15 — actividades enlazadas + oferta de tierlist al cierre

**Files:**
- Create: `src/components/clubs/list-challenge/linked-activities.tsx`
- Modify: `src/components/clubs/activity-detail.tsx` (montar la sección para `list_challenge`)
- Modify: `messages/es.json` (namespace `activity`)
- Create: `e2e/activity-interconnection-tierlist.spec.ts`

**Interfaces:**
- Consumes (Task 2): `ActivityDetail` (`linkedChildren`, `status`, `createdBy`, `id`, `title`,
  `kind`), `spawnLinkedActivity`. `LinkedChild`.
- Produces: `LinkedActivities` — sección visible a todo el club; el botón «Crear» tierlist solo a
  curador/mod cuando el reto está `finished` y no hay tierlist enlazada.

- [ ] **Step 1: Crear `LinkedActivities`**

Create `src/components/clubs/list-challenge/linked-activities.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { spawnLinkedActivity } from "@/lib/clubs/activities/core";

// Frame 15: en el detalle de un reto por lista, la cadena de actividades nacidas de él y —cuando
// el reto está finalizado y aún no hay tierlist enlazada— la oferta de cerrarlo con una tierlist
// de los mismos ítems. La lista de hijas la ve todo el club; «Crear» solo curador/mod.
export function LinkedActivities({
  activity,
  isCurator,
  clubSlug,
}: {
  activity: ActivityDetail;
  isCurator: boolean;
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const hasTierlist = activity.linkedChildren.some((c) => c.kind === "tierlist");
  const offerTierlist =
    isCurator && activity.status === "finished" && !hasTierlist;

  if (activity.linkedChildren.length === 0 && !offerTierlist) return null;

  function createTierlist() {
    setError(false);
    startTransition(async () => {
      try {
        const childId = await spawnLinkedActivity({
          parentActivityId: activity.id,
          kind: "tierlist",
          title: `${t("kind_tierlist")} · ${activity.title}`,
        });
        router.push(`/club/${clubSlug}/actividad/${childId}`);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      {offerTierlist && (
        <div className="flex items-center gap-3 rounded-card border border-gold/40 bg-gold/[0.08] px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gold/15 text-gold">◆</span>
          <div className="flex-1">
            <div className="font-serif text-sm font-semibold">{t("closeWithTierlist")}</div>
            <div className="text-[11.5px] text-muted-foreground">{t("closeWithTierlistHint")}</div>
          </div>
          <button
            type="button"
            onClick={createTierlist}
            disabled={pending}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
          >
            {t("create")}
          </button>
        </div>
      )}

      {activity.linkedChildren.length > 0 && (
        <>
          <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("linkedActivities")}
          </h3>
          <div className="flex flex-col gap-2">
            {activity.linkedChildren.map((child) => (
              <div key={child.id} className="flex flex-col gap-1">
                <Link
                  href={`/club/${clubSlug}/actividad/${child.id}`}
                  className="flex items-center gap-3 rounded-card border border-border px-4 py-3"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent/15 text-accent">
                    {child.kind === "tierlist" ? "◆" : "◈"}
                  </span>
                  <span className="flex-1">
                    <span className="block font-serif text-sm font-semibold">{child.title}</span>
                    <span className="block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {t(`kind_${child.kind}`)} · {t(`status_${child.status}`)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">↗</span>
                </Link>
                {child.fromItem && child.fromItem.itemTitle && (
                  <p className="pl-4 font-mono text-[10px] text-faint">
                    {t("bornFromItem", { title: child.fromItem.itemTitle })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-xs text-destructive">{t("proposeError")}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Montar la sección en `activity-detail.tsx`**

En `src/components/clubs/activity-detail.tsx`, en la vista principal (justo después del bloque
del `DetailExtension`, tras la línea ~150), añade — solo para `list_challenge`:

```tsx
      {activity.kind === "list_challenge" && (
        <LinkedActivities
          activity={activity}
          isCurator={isCreator || isModerator}
          clubSlug={clubSlug}
        />
      )}
```

`isCreator`, `isModerator` y `clubSlug` ya existen en ese componente (líneas 74-75 y props).
Import: `import { LinkedActivities } from "./list-challenge/linked-activities";`.

- [ ] **Step 3: Añadir la copia `activity` en `messages/es.json`**

```json
    "linkedActivities": "Actividades enlazadas a este reto",
    "bornFromItem": "nacida del ítem «{title}»",
    "closeWithTierlist": "Cierra con una tierlist",
    "closeWithTierlistHint": "Clasificad juntos los ítems, ya cargados en el pool.",
    "create": "Crear",
```

- [ ] **Step 4: Escribir el e2e (falla primero)**

Create `e2e/activity-interconnection-tierlist.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Al finalizar un reto por lista, el curador lo cierra creando una tierlist con sus ítems.
test("crea una tierlist al cerrar el reto", async ({ page }) => {
  // ... setup: reto por lista con ítems, propiedad del usuario; finalízalo (acción "Finalizar"
  //     de la barra de moderación). Deja `page` en el detalle del reto finalizado.

  await expect(page.getByRole("heading", { name: "Cierra con una tierlist" })).toBeVisible();
  await page.getByRole("button", { name: "Crear" }).click();

  // Aterriza en la tierlist hija, activa.
  await expect(page.getByText("Tierlist", { exact: false })).toBeVisible();
  await expect(page.getByText("Activa")).toBeVisible();

  // Volviendo al reto, la oferta ya no está (oferta única) y la hija figura enlazada.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Actividades enlazadas a este reto" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cierra con una tierlist" })).toHaveCount(0);
});
```

Run: `fnm exec --using=22 npx playwright test e2e/activity-interconnection-tierlist.spec.ts`
Expected: FAIL antes de Steps 1-2; PASS después.

- [ ] **Step 5: Ejecutar el e2e hasta verde**

Run: `fnm exec --using=22 npx playwright test e2e/activity-interconnection-tierlist.spec.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck global y commit**

Run: `fnm exec --using=22 npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/components/clubs/list-challenge/linked-activities.tsx src/components/clubs/activity-detail.tsx messages/es.json e2e/activity-interconnection-tierlist.spec.ts
git commit -m "feat(clubes): frame 15 — actividades enlazadas y tierlist al cierre"
```

---

## Notas de integración (leer antes de Task 4/5)

- **Visibilidad del tablero vs. de la cadena:** `ListChallengeBoard` solo pinta la rejilla de
  ítems a **participantes** (línea 64). Por tanto, para abrir una lectura conjunta desde un ítem
  el curador debe estar unido al reto (ve la rejilla). Es aceptable y coincide con «estás metido
  en el reto». La **sección de cadena / oferta de tierlist** (Task 5) va en `activity-detail.tsx`,
  no en el tablero, así que se ve aunque el curador no sea participante y aunque el reto esté
  `finished` (donde el tablero no se monta).
- **Buddy read sin hitos:** la hija nace `active` sin checkpoints; se configuran luego desde
  «Modificar» (BuddyReadCheckpointEditor). Verifica que la ficha de una lectura conjunta sin
  hitos renderiza sin romper (el board de buddy_read ya tolera lista vacía).
- **Navegación tras crear:** en la hoja (Task 4) se usa `router.push("../actividad/" + id)` por
  no tener el slug a mano; en la sección (Task 5) sí hay `clubSlug`, se usa la ruta absoluta.

## Self-review (cobertura del spec)

- Modelo de datos (enlace + ítem de origen) → Task 1.
- RPC atómica born-active + copia de pool + autorización curador/mod → Task 1.
- Tipos app + hijas enlazadas + action → Task 2.
- Notificación propia → Task 3.
- Flujo A (ítem → lectura conjunta, solo libro/serie, un toque) → Task 4.
- Flujo B (reto finalizado → tierlist, oferta única, ítems copiados) → Task 5.
- Cadena solo en el detalle del reto → Task 5 (sección en `activity-detail`, sin tocar
  `activity-list`).
- Fuera de alcance (películas, frame 12, spawn genérico) → respetado; sin tareas.
- Verificación e2e de ambos flujos + autorización (RPC rechaza) → Tasks 1, 4, 5.
