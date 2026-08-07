# Chats en actividades + reestructura de comentarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer el motor común de comentarios (respuestas, spoilers, editar, fijar, orden, formato) y renderizarlo en dos presentaciones: «hilo» para comentarios de post y «chat» de burbujas para actividades.

**Architecture:** Un único motor `comments`/`interaction_targets`. Las respuestas cuelgan del **mismo** `interaction_target_id` que su raíz (no del target del comentario padre), con `parent_id` para el contexto; el trigger `commentable=false` no se toca. La UI colapsa a dos niveles visuales (principal + respuestas) para el hilo, y a orden cronológico con cita para el chat. Sin realtime; refresco por `revalidatePath`.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), React 19 (`useOptimisticAction`), next-intl, Vitest (tests de lógica pura con fakes), Playwright (e2e contra build de producción).

## Global Constraints

- **Migración dev primero** (`supabase-dev`), luego prod; verificar objetos reales (`pg_proc`/`pg_class`), no el ledger `list_migrations`.
- **Acciones nuevas devuelven resultado discriminado** `{ ok: true } | { ok: false; error: string }`, NUNCA lanzan (Next borra `.message` en build de prod). Patrón canónico: `src/lib/social/thought-actions.ts`.
- **Nada de `use cache` sobre datos filtrados por RLS** (regla #437): el resumen de interacciones queda tras `<Suspense>`, cliente de sesión, jamás cacheado compartido.
- **e2e contra `next build` + `next start`**, no solo `next dev` (regla PPR #514; la ruta de actividad es `instant=false`).
- **Grants por columna** (DRIFT-CHECK superficie 6): una columna sin grant puede romper toda la escritura de la tabla. `comments` hoy NO tiene grants por columna (solo de tabla) — se verifica en la Task 1.
- **i18n mono-idioma**: solo `messages/es.json`; añadir claves ahí, no crear `en.json`.
- **Límite de cuerpo**: 2000 caracteres (ya vigente).
- **Reacciones**: paleta fija `like|read|shock|fire` (♡📖😱🔥), CHECK `reactions_kind_valid`. NO se toca.
- **`database.types.ts`**: acotar a las adiciones de esta feature (añadir a mano las 4 columnas de `comments`), no un regen total que arrastre esquema ajeno.

---

## File Structure

**Backend / datos**
- `supabase/migrations/20260838_comments_threads_spoiler_pin_edit.sql` — CREATE (migración única).
- `src/lib/social/interactions.ts` — MODIFY (tipo `InteractionComment` + query + `canEdit`/`canPin`).
- `src/lib/social/interaction-actions.ts` — MODIFY (`addComment` extendido, `editComment`, `pinComment`; a resultado discriminado).
- `src/lib/social/interaction-optimistic.ts` — MODIFY (nuevas acciones del reducer).
- `src/lib/supabase/database.types.ts` — MODIFY (4 columnas nuevas de `comments`).

**Lógica pura (nueva, testeable en Vitest)**
- `src/lib/social/comment-tree.ts` — CREATE (`buildCommentThreads` para hilo, `buildChatMessages` para chat).
- `src/lib/social/comment-tree.test.ts` — CREATE.
- `src/lib/social/interaction-optimistic.test.ts` — CREATE (o extender si existe).

**UI**
- `src/components/social/review-interactions.tsx` — MODIFY (presentación «hilo»).
- `src/components/social/comment-composer.tsx` — CREATE (compositor reutilizable: textarea + barra B/I/lista + spoiler + contador).
- `src/components/social/comment-actions.tsx` — MODIFY (añadir Editar y Fijar al menú).
- `src/components/clubs/activity-chat.tsx` — MODIFY (delegar en burbujas).
- `src/components/clubs/activity-chat-bubbles.tsx` — CREATE (presentación «chat»).
- `messages/es.json` — MODIFY (claves nuevas).

**Docs**
- `docs/requirements/data-model.md`, `docs/requirements/decisiones.md`, `docs/requirements/backlog.md` — MODIFY al cierre.

---

## Task 1: Migración — columnas, RLS UPDATE, trigger de padre, RPC de fijar

**Files:**
- Create: `supabase/migrations/20260838_comments_threads_spoiler_pin_edit.sql`
- Modify: `src/lib/supabase/database.types.ts` (Row/Insert/Update de `comments`)

**Interfaces:**
- Produces (SQL): columnas `comments.parent_id uuid`, `comments.is_spoiler bool`, `comments.pinned bool`, `comments.edited_at timestamptz`; función `public.pin_comment(uuid, boolean)`; política `comments update own canonical`; trigger `trg_comments_enforce_parent`.

- [ ] **Step 1: Verificar grants actuales de `comments`** (DRIFT-CHECK superficie 6)

Ejecutar en `supabase-dev` (MCP `execute_sql`):

```sql
select grantee, privilege_type, string_agg(column_name, ',') as cols
from information_schema.column_privileges
where table_schema='public' and table_name='comments'
group by grantee, privilege_type;
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='comments' order by grantee;
```
**Estado real verificado en dev (2026-08-07):** `comments` tiene un `grant all` a nivel de TABLA a `anon` **y** `authenticated` (patrón por defecto de Supabase, presente en casi todas las tablas), es decir SÍ hay `UPDATE` de tabla y NO hay grants por columna. Esto obliga a un ajuste sobre el plan original: como los grants por columna son ADITIVOS (no pueden estrechar un grant de tabla ya concedido), hay que **`revoke update` primero** y luego conceder solo las columnas editables. Sin el revoke, la nueva policy de UPDATE dejaría al autor cambiar `pinned` (saltándose `pin_comment`) o `parent_id`. Confirmar también que existen `interaction_targets.owner_id`, `private.can_moderate_comment` y `public.can_view_interaction_target` (los usa `pin_comment` y la policy). INSERT/SELECT/DELETE de tabla siguen intactos → las columnas nuevas quedan cubiertas para INSERT.

- [ ] **Step 2: Escribir la migración**

```sql
-- 20260838 — Hilos (respuestas), spoilers, fijado y edición de comentarios.
-- Diseño: docs/superpowers/specs/2026-08-07-chats-comments-restructure-design.md
-- Las respuestas cuelgan del MISMO interaction_target que su raíz (el post), con
-- parent_id para el contexto; el trigger commentable=false NO se toca (una
-- respuesta apunta al post, que es commentable). Profundidad libre en datos; la
-- UI aplana a dos niveles.

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade,
  add column if not exists is_spoiler boolean not null default false,
  add column if not exists pinned boolean not null default false,
  add column if not exists edited_at timestamptz;

create index if not exists comments_parent_idx on public.comments (parent_id);

-- Un padre debe existir y compartir hilo (mismo interaction_target). Sin límite de
-- profundidad. Trigger dedicado (el de commentable es BEFORE UPDATE OF
-- interaction_target_id y no cubre parent_id).
create or replace function private.enforce_comment_parent_same_target()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_parent_target uuid;
begin
  if new.parent_id is null then return new; end if;
  select c.interaction_target_id into v_parent_target
    from public.comments c where c.id = new.parent_id;
  if not found then
    raise exception 'comment_parent_not_found' using errcode = '23503';
  end if;
  if v_parent_target is distinct from new.interaction_target_id then
    raise exception 'comment_parent_other_thread' using errcode = '23514';
  end if;
  return new;
end;
$fn$;
revoke execute on function private.enforce_comment_parent_same_target() from public, anon, authenticated;
drop trigger if exists trg_comments_enforce_parent on public.comments;
create trigger trg_comments_enforce_parent
  before insert or update of parent_id on public.comments
  for each row execute function private.enforce_comment_parent_same_target();
alter table public.comments enable always trigger trg_comments_enforce_parent;

-- Editar el propio comentario (cuerpo/spoiler/edited_at). Hoy NO existe policy de
-- UPDATE (así que nada puede actualizar comments todavía). `comments` tiene un
-- grant UPDATE de TABLA por defecto de Supabase: hay que REVOCARLO antes de
-- conceder por columna, porque los grants por columna no estrechan uno de tabla.
-- Así el autor solo puede cambiar body/is_spoiler/edited_at; NO author_id,
-- parent_id ni pinned. pinned se cambia solo por pin_comment (SECURITY DEFINER,
-- corre como owner y no le afecta el revoke).
revoke update on public.comments from anon, authenticated;
grant update (body, is_spoiler, edited_at) on public.comments to authenticated;
create policy "comments update own canonical" on public.comments
  for update to authenticated
  using ((select auth.uid()) = author_id and public.can_view_interaction_target(interaction_target_id))
  with check ((select auth.uid()) = author_id and public.can_view_interaction_target(interaction_target_id));

-- Fijar: dueño del target o moderador. SECURITY DEFINER (corre como owner,
-- salta RLS/grants), así que 'pinned' no necesita grant para authenticated.
-- Invariante: uno fijado por hilo.
create or replace function public.pin_comment(p_comment_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_target uuid; v_owner uuid;
begin
  select c.interaction_target_id into v_target
    from public.comments c where c.id = p_comment_id;
  if not found then raise exception 'comment_not_found' using errcode = '23503'; end if;
  select t.owner_id into v_owner from public.interaction_targets t where t.id = v_target;
  if not (v_owner = (select auth.uid()) or private.can_moderate_comment(p_comment_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_pinned then
    update public.comments set pinned = false
      where interaction_target_id = v_target and pinned and id <> p_comment_id;
    update public.comments set pinned = true where id = p_comment_id;
  else
    update public.comments set pinned = false where id = p_comment_id;
  end if;
end;
$fn$;
revoke execute on function public.pin_comment(uuid, boolean) from public, anon;
grant execute on function public.pin_comment(uuid, boolean) to authenticated;
```

- [ ] **Step 3: Aplicar en dev y verificar objetos reales**

Aplicar con MCP `supabase-dev apply_migration` (name: `20260838_comments_threads_spoiler_pin_edit`). Verificar (no el ledger):

```sql
select column_name from information_schema.columns
  where table_schema='public' and table_name='comments'
  and column_name in ('parent_id','is_spoiler','pinned','edited_at');            -- 4 filas
select proname from pg_proc where proname in ('pin_comment','enforce_comment_parent_same_target'); -- 2
select tgname from pg_trigger where tgname='trg_comments_enforce_parent';         -- 1
select polname from pg_policy p join pg_class c on c.oid=p.polrelid
  where c.relname='comments' and polname='comments update own canonical';         -- 1
```

- [ ] **Step 4: Prueba de humo de la RLS/trigger en dev (SQL)**

Con dos usuarios reales de dev (no fakes — los fakes no aplican triggers). Como usuario A sobre un target commentable propio:
```sql
-- inserta raíz y respuesta (misma thread) -> OK; respuesta a otro thread -> error 23514.
```
Confirmar: (a) una respuesta con `parent_id` de OTRO `interaction_target_id` lanza `comment_parent_other_thread` (23514); (b) tras el revoke, un `update comments set pinned=true where id=<propio>` como `authenticated` es **rechazado por falta de grant** (la columna `pinned` no está en el grant), igual que `parent_id` y `author_id`; (c) `update comments set body=... , edited_at=now() where id=<propio>` SÍ funciona para el autor. Esto prueba que el autor solo puede editar cuerpo/spoiler y que fijar queda exclusivamente en `pin_comment`.

- [ ] **Step 5: Añadir a mano las columnas en `database.types.ts`**

En `src/lib/supabase/database.types.ts`, en `comments` → `Row`, `Insert`, `Update`, añadir:
```ts
parent_id: string | null
is_spoiler: boolean
pinned: boolean
edited_at: string | null
```
(`Insert`/`Update`: `parent_id?: string | null`, `is_spoiler?: boolean`, `pinned?: boolean`, `edited_at?: string | null`.) No regenerar el fichero entero (evita arrastrar esquema ajeno, ver memoria de drift).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260838_comments_threads_spoiler_pin_edit.sql src/types/database.types.ts
git commit -m "feat(social): esquema de hilos, spoiler, fijar y editar en comments (dev)"
```

---

## Task 2: Lógica pura — árbol de hilo y mensajes de chat

**Files:**
- Create: `src/lib/social/comment-tree.ts`
- Test: `src/lib/social/comment-tree.test.ts`

**Interfaces:**
- Consumes: `InteractionComment` (de `interactions.ts`, tras Task 3 tendrá `parentId`, `isSpoiler`, `pinned`, `edited`). Para el test se construyen objetos mínimos con esos campos.
- Produces:
  - `type CommentSort = "recent" | "top"`
  - `type CommentThread = { root: InteractionComment; replies: InteractionComment[] }`
  - `buildCommentThreads(comments: InteractionComment[], sort: CommentSort): CommentThread[]`
  - `type ChatMessage = { comment: InteractionComment; startsGroup: boolean; quoted: { author: string; body: string } | null }`
  - `buildChatMessages(comments: InteractionComment[]): ChatMessage[]`

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
import { describe, it, expect } from "vitest";
import { buildCommentThreads, buildChatMessages } from "./comment-tree";
import type { InteractionComment } from "./interactions";

function c(over: Partial<InteractionComment> & { id: string }): InteractionComment {
  return {
    id: over.id, interactionTargetId: "it-" + over.id, authorId: over.authorId ?? "u1",
    author: over.author ?? "U1", authorUsername: null, authorAvatarUrl: null, initials: "U",
    body: over.body ?? "x", createdAt: over.createdAt ?? "2026-01-01T00:00:00Z",
    isOwn: over.isOwn ?? false, canDelete: false, canEdit: false, canPin: false,
    parentId: over.parentId ?? null, isSpoiler: over.isSpoiler ?? false,
    pinned: over.pinned ?? false, edited: over.edited ?? false,
    reactionCount: over.reactionCount ?? 0, viewerReacted: false,
    reactions: { like:{count:0,viewerReacted:false}, read:{count:0,viewerReacted:false}, shock:{count:0,viewerReacted:false}, fire:{count:0,viewerReacted:false} },
  };
}

describe("buildCommentThreads", () => {
  it("aplana descendientes profundos bajo la raíz (dos niveles)", () => {
    const list = [
      c({ id: "a" }),
      c({ id: "b", parentId: "a", createdAt: "2026-01-01T01:00:00Z" }),
      c({ id: "cc", parentId: "b", createdAt: "2026-01-01T02:00:00Z" }), // respuesta a la respuesta
    ];
    const t = buildCommentThreads(list, "recent");
    expect(t).toHaveLength(1);
    expect(t[0].root.id).toBe("a");
    expect(t[0].replies.map((r) => r.id)).toEqual(["b", "cc"]); // ambas bajo la raíz, por fecha asc
  });
  it("orden recent: raíces por fecha desc, fijado primero", () => {
    const list = [
      c({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      c({ id: "b", createdAt: "2026-01-02T00:00:00Z" }),
      c({ id: "p", createdAt: "2026-01-01T00:00:00Z", pinned: true }),
    ];
    expect(buildCommentThreads(list, "recent").map((x) => x.root.id)).toEqual(["p", "b", "a"]);
  });
  it("orden top: por reacciones desc (fijado primero)", () => {
    const list = [ c({ id: "a", reactionCount: 1 }), c({ id: "b", reactionCount: 5 }) ];
    expect(buildCommentThreads(list, "top").map((x) => x.root.id)).toEqual(["b", "a"]);
  });
  it("padre fuera del lote: el huérfano se trata como raíz", () => {
    const list = [ c({ id: "b", parentId: "missing" }) ];
    const t = buildCommentThreads(list, "recent");
    expect(t).toHaveLength(1);
    expect(t[0].root.id).toBe("b");
  });
});

describe("buildChatMessages", () => {
  it("ordena por fecha, agrupa autor consecutivo y cita el padre", () => {
    const list = [
      c({ id: "a", authorId: "u1", body: "hola" }),
      c({ id: "b", authorId: "u1", createdAt: "2026-01-01T00:01:00Z" }),
      c({ id: "cc", authorId: "u2", parentId: "a", createdAt: "2026-01-01T00:02:00Z" }),
    ];
    const m = buildChatMessages(list);
    expect(m.map((x) => x.comment.id)).toEqual(["a", "b", "cc"]);
    expect(m[0].startsGroup).toBe(true);
    expect(m[1].startsGroup).toBe(false); // mismo autor consecutivo
    expect(m[2].startsGroup).toBe(true);
    expect(m[2].quoted).toEqual({ author: "U1", body: "hola" });
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npx vitest run src/lib/social/comment-tree.test.ts`
Expected: FAIL ("buildCommentThreads is not a function").

- [ ] **Step 3: Implementar**

```ts
import type { InteractionComment } from "./interactions";

export type CommentSort = "recent" | "top";
export type CommentThread = { root: InteractionComment; replies: InteractionComment[] };
export type ChatMessage = {
  comment: InteractionComment;
  startsGroup: boolean;
  quoted: { author: string; body: string } | null;
};

const asc = (a: InteractionComment, b: InteractionComment) => a.createdAt.localeCompare(b.createdAt);

// Sube por parentId hasta el ancestro con parentId null presente en el lote.
// Si el padre no está cargado (corte de prefetch), el propio nodo es su raíz.
function rootIdOf(c: InteractionComment, byId: Map<string, InteractionComment>): string {
  let cur = c;
  const seen = new Set<string>();
  while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId)!;
  }
  return cur.id;
}

export function buildCommentThreads(comments: InteractionComment[], sort: CommentSort): CommentThread[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const threads = new Map<string, CommentThread>();
  const ensure = (root: InteractionComment) => {
    if (!threads.has(root.id)) threads.set(root.id, { root, replies: [] });
    return threads.get(root.id)!;
  };
  // Primero las raíces reales, para que existan antes de colgar respuestas.
  for (const c of comments) if (rootIdOf(c, byId) === c.id) ensure(c);
  for (const c of comments) {
    const rid = rootIdOf(c, byId);
    if (rid === c.id) continue;
    const root = byId.get(rid);
    if (root) ensure(root).replies.push(c);
  }
  const list = [...threads.values()];
  for (const t of list) t.replies.sort(asc);
  list.sort((a, b) => {
    if (a.root.pinned !== b.root.pinned) return a.root.pinned ? -1 : 1;
    if (sort === "top" && b.root.reactionCount !== a.root.reactionCount) {
      return b.root.reactionCount - a.root.reactionCount;
    }
    return b.root.createdAt.localeCompare(a.root.createdAt); // recientes primero
  });
  return list;
}

export function buildChatMessages(comments: InteractionComment[]): ChatMessage[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const ordered = [...comments].sort(asc);
  return ordered.map((comment, i) => {
    const prev = ordered[i - 1];
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined;
    return {
      comment,
      startsGroup: !prev || prev.authorId !== comment.authorId,
      quoted: parent ? { author: parent.author, body: parent.body } : null,
    };
  });
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npx vitest run src/lib/social/comment-tree.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/comment-tree.ts src/lib/social/comment-tree.test.ts
git commit -m "feat(social): árbol de hilo (aplanado a 2 niveles) y mensajes de chat"
```

---

## Task 3: Capa de datos — enriquecer `InteractionComment` y la query

**Files:**
- Modify: `src/lib/social/interactions.ts` (tipo `InteractionComment` :32-50; select :141-146; push :214-229; añadir lookup de `owner_id`)

**Interfaces:**
- Consumes: columnas de Task 1.
- Produces: `InteractionComment` gana `parentId: string | null; isSpoiler: boolean; pinned: boolean; edited: boolean; canEdit: boolean; canPin: boolean`.

- [ ] **Step 1: Extender el tipo `InteractionComment`**

En `interactions.ts`, añadir al type (tras `canDelete`):
```ts
  canEdit: boolean;
  canPin: boolean;
  parentId: string | null;
  isSpoiler: boolean;
  pinned: boolean;
  edited: boolean;
```

- [ ] **Step 2: Ampliar el select de comentarios**

En `getInteractionSummary`, la query de `comments` (:142-145) pasa a:
```ts
    supabase
      .from("comments")
      .select("id, interaction_target_id, author_id, body, created_at, parent_id, is_spoiler, pinned, edited_at")
      .in("interaction_target_id", interactionTargetIds)
      .order("created_at", { ascending: true }),
```

- [ ] **Step 3: Resolver dueño del target (para `canPin`)**

Tras resolver `moderatableTargetIds` (:175-186), añadir un lookup de dueños de los targets fuente:
```ts
  const { data: ownerRows, error: ownerErr } = await supabase
    .from("interaction_targets")
    .select("id, owner_id")
    .in("id", interactionTargetIds);
  if (ownerErr) throw ownerErr;
  const viewerOwnsTarget = new Set(
    (ownerRows ?? [])
      .filter((r) => user && r.owner_id === user.id)
      .map((r) => sourceIdByTargetId.get(r.id)!)
      .filter(Boolean),
  );
```

- [ ] **Step 4: Poblar los campos nuevos en el push**

En el `s.comments.push({ ... })` (:214-229) añadir:
```ts
      canEdit: user?.id === c.author_id,
      canPin: viewerOwnsTarget.has(sourceId) || moderatableTargetIds.has(sourceId),
      parentId: c.parent_id,
      isSpoiler: c.is_spoiler,
      pinned: c.pinned,
      edited: c.edited_at != null,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: fallos SOLO en los consumidores que construyen `InteractionComment` a mano (el optimista en `review-interactions.tsx`) — se arreglan en Task 5/6. Confirmar que `interactions.ts` compila.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/interactions.ts
git commit -m "feat(social): enriquecer InteractionComment (parent/spoiler/pin/edit + canEdit/canPin)"
```

---

## Task 4: Acciones de servidor — `addComment` extendido, `editComment`, `pinComment`

**Files:**
- Modify: `src/lib/social/interaction-actions.ts`

**Interfaces:**
- Produces:
  - `type CommentActionResult = { ok: true } | { ok: false; error: string }`
  - `addComment(interactionTargetId: string, body: string, opts?: { parentId?: string; isSpoiler?: boolean }): Promise<CommentActionResult>`
  - `editComment(commentId: string, body: string): Promise<CommentActionResult>`
  - `pinComment(commentId: string, pinned: boolean): Promise<CommentActionResult>`
  - `deleteComment(commentId: string): Promise<CommentActionResult>` (migrado a resultado discriminado)
  - `toggleReaction(...)` se mantiene `Promise<void>` (no cambia; su optimismo revierte solo).

- [ ] **Step 1: Migrar `addComment` a resultado discriminado + `parentId`/`isSpoiler`**

Sustituir la firma y cuerpo de `addComment` (:88-152). Envolver en `try/catch` como `thought-actions.ts`. Cambios clave sobre el actual:
```ts
export type CommentActionResult = { ok: true } | { ok: false; error: string };

export async function addComment(
  interactionTargetId: string,
  body: string,
  opts?: { parentId?: string; isSpoiler?: boolean },
): Promise<CommentActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "empty" };
    if (trimmed.length > 2000) return { ok: false, error: "too_long" };

    const target = await getInteractionTarget(supabase, interactionTargetId);
    if (!target.commentable || !target.comment_notification_type) {
      return { ok: false, error: "not_commentable" };
    }

    const { data: inserted, error } = await supabase
      .from("comments")
      .insert({
        interaction_target_id: interactionTargetId,
        author_id: user.id,
        body: trimmed,
        parent_id: opts?.parentId ?? null,
        is_spoiler: opts?.isSpoiler ?? false,
      })
      .select("id, parent_id")
      .single();
    if (error) throw error;

    // menciones (igual que hoy, :118-136) ...
    // aviso al dueño del target (igual que hoy, :138-149) ...
    // NUEVO: si es respuesta, avisar al autor del comentario padre.
    if (inserted.parent_id) {
      try {
        const { data: parent } = await supabase
          .from("comments").select("author_id").eq("id", inserted.parent_id).maybeSingle();
        if (parent && parent.author_id !== user.id && parent.author_id !== target.owner_id
            && !mentioned.includes(parent.author_id)) {
          await notify(supabase, {
            userId: parent.author_id, actorId: user.id,
            type: target.comment_notification_type, interactionTargetId,
            dedupeKey: `reply:${inserted.id}`,
          });
        }
      } catch (e) { console.error(e); }
    }

    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("addComment failed", e);
    return { ok: false, error: "unknown" };
  }
}
```
(Conservar el bloque de `notifyMentions` y el `notify` al dueño tal cual están hoy, dentro del `try`. `mentioned` debe quedar en scope para la comprobación de la respuesta.)

- [ ] **Step 2: `editComment`**

```ts
export async function editComment(commentId: string, body: string): Promise<CommentActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "empty" };
    if (trimmed.length > 2000) return { ok: false, error: "too_long" };
    // RLS `comments update own canonical` + grant por columna: solo el autor,
    // solo body/edited_at. `.select` distingue 0 filas (bloqueado) de éxito.
    const { data, error } = await supabase
      .from("comments")
      .update({ body: trimmed, edited_at: new Date().toISOString() })
      .eq("id", commentId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, error: "not_allowed_or_missing" };
    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("editComment failed", e);
    return { ok: false, error: "unknown" };
  }
}
```

- [ ] **Step 3: `pinComment`**

```ts
export async function pinComment(commentId: string, pinned: boolean): Promise<CommentActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const { error } = await supabase.rpc("pin_comment", { p_comment_id: commentId, p_pinned: pinned });
    if (error) return { ok: false, error: "not_allowed" }; // 42501 u otros → no autorizado
    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("pinComment failed", e);
    return { ok: false, error: "unknown" };
  }
}
```

- [ ] **Step 4: `deleteComment` a resultado discriminado**

Cambiar retorno a `CommentActionResult` (envolver en try/catch, devolver `{ ok: true }`/`{ ok:false }`). El borrado cascadea respuestas por la FK.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: fallos solo en `review-interactions.tsx` (llama `addComment`/`deleteComment` con la firma vieja y espera `void`) — se arreglan en Task 5/6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/interaction-actions.ts
git commit -m "feat(social): addComment con respuesta/spoiler, editComment y pinComment (resultado discriminado)"
```

---

## Task 5: Reducer optimista — editar, fijar, spoiler y respuestas

**Files:**
- Modify: `src/lib/social/interaction-optimistic.ts`
- Test: `src/lib/social/interaction-optimistic.test.ts` (crear)

**Interfaces:**
- Produces: `InteractionAction` gana `{ type: "editComment"; id: string; body: string }`, `{ type: "pinComment"; id: string; pinned: boolean }`. `addComment` ya soporta un comment con `parentId` (no cambia la acción, sí el objeto que se le pasa).

- [ ] **Step 1: Tests (fallan)**

```ts
import { describe, it, expect } from "vitest";
import { interactionReducer } from "./interaction-optimistic";
import type { InteractionSummary, InteractionComment } from "./interactions";
// reutilizar el helper `c(...)` (copiar el de comment-tree.test o factorizarlo).

const base: InteractionSummary = {
  interactionTargetId: "t", reactionCount: 0, viewerReacted: false, commentCount: 1,
  comments: [/* c({ id: "a", body: "hola" }) */], reactions: {
    like:{count:0,viewerReacted:false}, read:{count:0,viewerReacted:false},
    shock:{count:0,viewerReacted:false}, fire:{count:0,viewerReacted:false} },
};

it("editComment cambia el cuerpo y marca edited", () => {
  const s = interactionReducer({ ...base, comments: [c({ id: "a", body: "hola" })] },
    { type: "editComment", id: "a", body: "adios" });
  expect(s.comments[0].body).toBe("adios");
  expect(s.comments[0].edited).toBe(true);
});
it("pinComment fija uno y desfija el resto del hilo", () => {
  const s = interactionReducer(
    { ...base, comments: [c({ id: "a", pinned: true }), c({ id: "b" })] },
    { type: "pinComment", id: "b", pinned: true });
  expect(s.comments.find((x) => x.id === "b")!.pinned).toBe(true);
  expect(s.comments.find((x) => x.id === "a")!.pinned).toBe(false);
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npx vitest run src/lib/social/interaction-optimistic.test.ts` → FAIL.

- [ ] **Step 3: Implementar los casos nuevos**

Añadir a `InteractionAction` y al `switch`:
```ts
  | { type: "editComment"; id: string; body: string }
  | { type: "pinComment"; id: string; pinned: boolean }
```
```ts
    case "editComment":
      return { ...state, comments: state.comments.map((c) =>
        c.id === action.id ? { ...c, body: action.body, edited: true } : c) };
    case "pinComment":
      return { ...state, comments: state.comments.map((c) =>
        c.id === action.id ? { ...c, pinned: action.pinned }
          : action.pinned ? { ...c, pinned: false } : c) };
```

- [ ] **Step 4: Ejecutar y ver pasar** → `npx vitest run src/lib/social/interaction-optimistic.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interaction-optimistic.ts src/lib/social/interaction-optimistic.test.ts
git commit -m "feat(social): optimismo de editar/fijar comentarios"
```

---

## Task 6: Compositor reutilizable (textarea + formato + spoiler)

**Files:**
- Create: `src/components/social/comment-composer.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `CommentComposer` con props
  `{ value: string; onChange: (v: string) => void; onSubmit: () => void; onInput?; onKeyDown?; dropdown?: React.ReactNode; submitLabel: string; placeholder: string; isSpoiler?: boolean; onToggleSpoiler?: () => void; showFormatting?: boolean; busy?: boolean; compact?: boolean }`.

- [ ] **Step 1: Implementar el compositor**

Textarea controlado (2000 max, contador), barra **B / I / ≡** que envuelve la selección con `**`/`*`/`\n- ` (portar `_wrap` del mockup `CommentThread.dc.html`: inserta marca alrededor de la selección con un `ref` al textarea), botón spoiler que alterna `isSpoiler` (estilo acento cuando activo), y botón enviar (`submitLabel`, deshabilitado si `busy` o vacío). Reutiliza clases Tailwind del textarea actual de `review-interactions.tsx:205-217`. `showFormatting`/spoiler son opcionales (el chat pasa `compact`). Renderiza `dropdown` (autocompletar de menciones) bajo el textarea.

Claves i18n nuevas en `messages/es.json` bajo `social`: `formatBold`, `formatItalic`, `formatList`, `spoiler`, `reply`, `editComment`, `saveEdit`, `cancel`, `pin`, `unpin`, `pinned`, `showSpoiler`, `edited`, `sortRecent`, `sortTop`, `viewReplies`, `hideReplies`, `sendMessage`, `writeReply`. (Reutilizar las ya existentes `postComment`, `writeComment`, `deleteComment`, `reportComment`, `you`, `actionError`, `commentsCount`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` (el componente compila aislado; aún sin consumidores).

- [ ] **Step 3: Commit**

```bash
git add src/components/social/comment-composer.tsx messages/es.json
git commit -m "feat(social): CommentComposer reutilizable (formato B/I/lista + spoiler)"
```

---

## Task 7: Presentación «hilo» — reestructurar `ReviewInteractions`

**Files:**
- Modify: `src/components/social/review-interactions.tsx`
- Modify: `src/components/social/comment-actions.tsx` (añadir Editar/Fijar)

**Interfaces:**
- Consumes: `buildCommentThreads`, `CommentSort` (Task 2); `CommentComposer` (Task 6); acciones (Task 4); reducer (Task 5); `RichTextView`, `SpoilerGate`, `ReactionBar`, `CommentActions`, `useMentionAutocomplete`.

- [ ] **Step 1: Estado y datos**

Añadir estado: `sort` (`useState<CommentSort>("recent")`), `replyingTo: string | null`, `editingId: string | null`, `rootSpoiler`, `replyDraft`, `editDraft`. Derivar `const threads = buildCommentThreads(state.comments, sort)`. Mantener `expanded` por raíz (`Set<string>` o `Record`).

- [ ] **Step 2: Render de un comentario (raíz y respuesta)**

Cada comentario:
- Cuerpo por `RichTextView` (no `MentionText` suelto): `<RichTextView text={c.body} knownUsernames={knownUsernames} />`. Si `c.edited`, sufijo `· {t("edited")}`.
- Si `c.isSpoiler`: envolver el cuerpo en `SpoilerGate`.
- Badge «📌 {t("pinned")}» si `c.pinned`.
- `ReactionBar` (igual que hoy).
- `CommentActions` ampliado (Step 4): borrar/reportar + **Editar** (si `canEdit`) + **Fijar/Desfijar** (si `canPin`).
- Botón **Responder**: setea `replyingTo` = **id de la raíz** del hilo (no del comentario), y prefija `@autor` en `replyDraft` cuando respondes a alguien distinto de ti (portar `startReply(rootId, author)` del mockup).
- Edición inline: si `editingId === c.id`, mostrar `CommentComposer` con `editDraft` y `onSubmit` → `run({type:"editComment",id,body}, () => editComment(id, body))`.

Respuestas: bajo cada raíz, si `expanded`, renderizar `thread.replies` con sangría izquierda (borde `border-l`), avatar menor, mismo cuerpo/reacciones/acciones. Toggle «{t("viewReplies")} (N)» / «{t("hideReplies")}» si `replies.length > 0`.

- [ ] **Step 3: Composers**

- Raíz: `CommentComposer` con `showFormatting`, `isSpoiler={rootSpoiler}`, autocompletar de menciones (el `mention` actual), `onSubmit` → construir `InteractionComment` optimista (con los campos nuevos: `parentId:null,isSpoiler:rootSpoiler,pinned:false,edited:false,canEdit:true,canPin:false`) y `run({type:"addComment",comment}, () => addComment(interactionTargetId, value, { isSpoiler: rootSpoiler }))`. Manejar el resultado discriminado: si `res.ok===false`, marcar `failed`.
- Respuesta: `CommentComposer` (compact) bajo la raíz cuando `replyingTo===thread.root.id`; `onSubmit` → optimista con `parentId = replyingTo`, y `addComment(interactionTargetId, value, { parentId: replyingTo, isSpoiler })`.

Cabecera del hilo: contador `{t("commentsCount",{count})}` + toggle de orden **Recientes / Mejor valorados** (`sort`).

- [ ] **Step 4: `CommentActions` — Editar y Fijar**

Añadir props `canEdit?: boolean`, `canPin?: boolean`, `pinned?: boolean`, `onEdit?: () => void`, `onTogglePin?: () => void`. Renderizar botón Editar (si `canEdit`) y Fijar/Desfijar (si `canPin`, etiqueta según `pinned`) junto a borrar/reportar. Mantener el desplegable de reporte actual.

- [ ] **Step 5: Verificación en navegador (una superficie)**

Levantar dev (`preview_start` name del dev server) y abrir una ficha con «Comunidad». Confirmar: escribir con `**negrita**` se ve en negrita; marcar spoiler oculta el cuerpo; responder crea respuesta bajo la raíz; editar cambia el texto y muestra «editado»; fijar sube el comentario. Revisar `read_console_messages` sin errores.

- [ ] **Step 6: Typecheck + unit**

Run: `npx tsc --noEmit` (limpio) y `npx vitest run src/lib/social` (verde).

- [ ] **Step 7: Commit**

```bash
git add src/components/social/review-interactions.tsx src/components/social/comment-actions.tsx
git commit -m "feat(social): comentarios de post enriquecidos (hilo: respuestas, spoiler, editar, fijar, orden, formato)"
```

---

## Task 8: Presentación «chat» de burbujas para actividades

**Files:**
- Create: `src/components/clubs/activity-chat-bubbles.tsx`
- Modify: `src/components/clubs/activity-chat.tsx`

**Interfaces:**
- Consumes: `buildChatMessages` (Task 2); mismas acciones/reducer/`useOptimisticAction`; `CommentComposer` (compact); `RichTextView`, `SpoilerGate`, `ReactionBar`, `UserAvatar`.

- [ ] **Step 1: `ActivityChatBubbles`**

Recibe las mismas props que `ActivityChat` pasa hoy a `ReviewInteractions` (`interactionTargetId, commentCount, comments, reactions, viewerLoggedIn, clubId, knownUsernames`). Usa `useOptimisticAction`+`interactionReducer` igual que `ReviewInteractions`. `const messages = buildChatMessages(state.comments)`.

Render (portar el modo `chat` del mockup `CommentThread.dc.html`):
- Cabecera: avatares apilados de participantes (derivar de `comments` autores distintos) + nombres.
- Cada `ChatMessage`: burbuja propio-derecha (acento) / ajeno-izquierda (surface), agrupada (avatar/nombre solo si `startsGroup`); si `quoted`, línea `↳ @{quoted.author}: {quoted.body|recortado}`. Cuerpo por `RichTextView`; si `isSpoiler`, `SpoilerGate`. Bajo la burbuja: hora, 📌 si `pinned`, `ReactionBar`, menú (editar/borrar/fijar) y **Responder** (setea `replyingTo`). **Sin «Visto».**
- Compositor pegado abajo (`sticky bottom-0`): `CommentComposer` compact con spoiler; `onSubmit` → optimista + `addComment(interactionTargetId, value, { parentId: replyingTo ?? undefined, isSpoiler })`.

- [ ] **Step 2: Delegar desde `ActivityChat`**

`activity-chat.tsx` pasa a renderizar `<ActivityChatBubbles {...} />` con las props del `summary` (mismas que hoy). Mantiene el comentario de RLS (summary vacío = no participas / sin mensajes).

- [ ] **Step 3: Verificación en navegador**

Con dos cuentas de dev participantes de una actividad (reto de lista/tierlist — NO buddy_read, que usa checkpoint-chat), abrir `/club/[slug]/actividad/[id]`: enviar mensaje (aparece a la derecha), responder a un ajeno (cita `↳`), spoiler oculta, reacción cuenta. `read_console_messages` limpio.

- [ ] **Step 4: Typecheck** → `npx tsc --noEmit` limpio.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/activity-chat.tsx src/components/clubs/activity-chat-bubbles.tsx
git commit -m "feat(clubs): chat de actividad en burbujas sobre el motor de comentarios"
```

---

## Task 9: Verificar blast-radius de `ReviewInteractions`

`ReviewInteractions` se monta en muchas superficies. Verificar que ninguna se rompe con la nueva estructura.

- [ ] **Step 1: Enumerar montajes**

Run: `git grep -n "ReviewInteractions\|ActivityChat"` — revisar: `detail/community-panel.tsx`, `review-card.tsx`, `thought-card.tsx`, `progress-timeline-card.tsx`, `collection-card.tsx`, `episode-ratings-card.tsx`, `clubs/club-post-card.tsx`, `clubs/checkpoints/checkpoint-chat.tsx`, `clubs/round/round-block.tsx`.

- [ ] **Step 2: Comprobar cada superficie en el navegador**

Abrir feed (tarjetas de reseña/pensamiento/progreso/colección/episodios), una ficha (Comunidad), un post de club y un checkpoint de buddy_read. Confirmar que el hilo enriquecido se pinta sin errores en cada uno (`read_console_messages`). Ninguna pasa props que ya no existan; ninguna se apoya en la lista plana anterior.

- [ ] **Step 3: Commit (si hubo ajustes)**

```bash
git add -A && git commit -m "fix(social): ajustes de superficies que montan ReviewInteractions"
```

---

## Task 10: e2e contra build de producción

**Files:**
- Create/Modify: `e2e/` spec de comentarios enriquecidos + chat de actividad (seguir el patrón de specs existentes que crean su propio club/actividad desechable).

- [ ] **Step 1: Escribir el spec e2e**

Cubrir, con cuentas de devtest: (hilo) crear comentario con `**negrita**`, responder, editar, marcar spoiler y revelar, fijar (como dueño), ordenar; (chat) en una actividad con dos participantes, enviar, responder con cita, spoiler. El e2e es el ÚNICO guard real del CHECK/trigger/RLS (los fakes no los aplican).

- [ ] **Step 2: Ejecutar contra build de producción**

```bash
npm run build && npm run start &   # o el webServer del config Playwright apuntando a start
npm run test:e2e -- comments-chat
```
Expected: verde. (Recordar: los `console.log` de servidor no salen bajo Playwright — usar `console.error` si hace falta depurar.)

- [ ] **Step 3: Commit**

```bash
git add e2e && git commit -m "test(e2e): comentarios enriquecidos y chat de actividad contra build de prod"
```

---

## Task 11: Cierre documental y despliegue a prod

- [ ] **Step 1: Aplicar la migración en prod**

Con MCP `supabase-prod apply_migration` (mismo SQL de Task 1). Verificar objetos reales (columnas, `pin_comment`, trigger, policy) como en Task 1 Step 3, contra prod. **Migración primero, merge después.**

- [ ] **Step 2: `data-model.md`**

En `docs/requirements/data-model.md` §5: documentar las 4 columnas nuevas de `comments`, la política `comments update own canonical`, el trigger `trg_comments_enforce_parent` y la función `pin_comment`; actualizar la fecha de verificación.

- [ ] **Step 3: DRIFT-CHECK superficie 6**

Correr la superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) contra prod; confirmar que `authenticated` tiene `UPDATE (body, is_spoiler, edited_at)` y que INSERT/SELECT/DELETE siguen correctos.

- [ ] **Step 4: `decisiones.md` (append-only)**

Añadir entrada al final: reversión del bloqueo de anidamiento (respuestas a profundidad libre en datos, aplanadas a dos niveles al mostrar; raíz = ancestro `parent_id null`); fijado por dueño-o-moderador vía `pin_comment`; edición vía RLS UPDATE + grant por columna.

- [ ] **Step 5: `backlog.md` + issues**

Marcar la casilla correspondiente en `docs/requirements/backlog.md`. Abrir las issues de lo aplazado:
```sh
gh issue create --label "area:social,tipo:feature,P3" --title "Read receipts (Visto) en chat de actividad" --body-file ...
gh issue create --label "area:social,tipo:deuda,P2" --title "Paginación de comentarios / hilos profundos (prefetch capado a 20)" --body-file ...
```

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(social): sincroniza data-model/decisiones/backlog con hilos+chat"
```

---

## Self-Review (hecho)

- **Cobertura del spec:** §3 esquema→Task 1; §4 acciones→Task 4; §5 datos→Task 3; §6.1 hilo→Task 6-7; §6.2 chat→Task 8; §7 notificaciones→Task 4 Step 1; §8 issues→Task 11; §9 rollout/docs→Task 10-11; blast-radius→Task 9. Lógica de aplanado/orden→Task 2. Optimismo→Task 5.
- **Placeholders:** ninguno; SQL, acciones, helpers puros, reducer e i18n van con código real. Las dos UI grandes (Task 7/8) llevan estructura concreta + piezas exactas a reutilizar + referencia al mockup `CommentThread.dc.html` para el detalle visual (portar, no reinventar).
- **Consistencia de tipos:** `InteractionComment` gana `parentId/isSpoiler/pinned/edited/canEdit/canPin` en Task 3; Task 2 (helpers), Task 5 (reducer) y Task 6/8 (UI) usan esos mismos nombres; `CommentActionResult` uniforme en Task 4; `buildCommentThreads`/`buildChatMessages`/`CommentSort`/`CommentThread`/`ChatMessage` idénticos entre Task 2 y sus consumidores.
