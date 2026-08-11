# Posts como capa social — Núcleo (Spec 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir `posts` como entidad social canónica (con `post_id` estable y ruta `/post/[id]`), 1:1 con su `interaction_target`, y hacer que feed, perfil, comentarios, reacciones y notificaciones giren en torno al post — sin migrar `comments`/`reactions`/`notifications`.

**Architecture:** Tabla `posts` fina que referencia la acción real (`source_kind`+`source_id`) y su ancla (`anchor_type`+`anchor_id`). Un trigger `AFTER INSERT` materializa **un** `interaction_target` de clase `post` (`href=/post/[id]`) reutilizando `private.upsert_interaction_target`, exactamente como hoy hace `thoughts`. Los comentarios/reacciones siguen colgando de `interaction_target_id`; el hilo se recupera desde `post_id` por el 1:1. El feed pasa de *fan-out on-read* sobre 6 fuentes a leer una sola tabla `posts`. La tabla `thoughts` se **absorbe** en `posts`.

**Tech Stack:** Next.js (App Router) + TypeScript, Supabase Postgres (RLS, triggers `SECURITY DEFINER`), Vitest (unit), Playwright (e2e), matrices SQL transaccionales (`supabase/tests/*.sql`).

## Global Constraints

- **Esquema = documento canónico `docs/requirements/data-model.md`.** El estado vivo del usuario vive en `passes`, nunca en `library_entries` (CONGELADA).
- **Migración-primero-luego-merge**; dev (`supabase-dev`) primero, prod (`supabase-prod`) después. Todo `DROP` va **después** de desplegar el código que deja de leer el objeto.
- **Verificar contra objetos reales** (`pg_proc`/`pg_class`/`pg_enum`/`to_regclass`/`information_schema.columns`), **nunca** contra `list_migrations`.
- **Enums en transacción propia:** `ALTER TYPE … ADD VALUE` no puede usarse en la misma transacción que consume el valor (lección de `20260834_thoughts_enum_values.sql`).
- **Grants por columna (#375, DRIFT-CHECK superficie 6):** toda columna nueva con su `grant` en la MISMA migración; una columna sin grant rompe la escritura ENTERA de la tabla.
- **Uniones literales de TS** (`TargetType`/`NotificationType` en `src/lib/social/`, `NOTIFICATION_CATEGORY` en `src/lib/push/types.ts`) son manuales: ampliarlas a mano o `tsc` rompe.
- **Cache + RLS (#437):** feed y `/post/[id]` son lecturas filtradas por RLS por usuario → **NO cacheables** en servidor (nada de `use cache`); e2e contra **build de producción**, no solo `next dev`.
- **Server actions no lanzan:** Next.js borra `.message` de los `Error` lanzados desde server actions en prod → devolver resultado discriminado, nunca `throw` que el cliente inspeccione.
- **`database.types.ts`:** acotar a las adiciones de esta feature (`git checkout origin/main -- <fichero>` + re-aplicar) para no arrastrar drift ajeno.
- **Todo pendiente = issue** con sus tres etiquetas (`area:social`, `tipo:*`, `P*`).
- **Copy en `messages/es.json`** (repo mono-idioma `es`): añadir claves solo ahí.

---

## File Structure

**Migraciones (nuevas, `supabase/migrations/`):**
- `2026XXXX_posts_enum_values.sql` — valores de enum (`target_kind += post`, `notification_type += post_commented/post_liked`), en transacción propia.
- `2026XXXX_posts.sql` — tabla `posts` + enums propios (`post_kind`, `post_anchor_type`, `post_source_kind`) + índices + RLS + grants + trigger de sync/cleanup.
- `2026XXXX_post_preferences.sql` — tabla `post_preferences` + RLS + grants.
- `2026XXXX_posts_backfill.sql` — backfill + promoción in-place de targets + absorción de `thoughts` (datos).
- `2026XXXX_posts_retire_source_triggers.sql` — retira triggers fuente y `drop table thoughts` (se aplica DESPUÉS del merge del código).

**TS/App:**
- Modificar: `src/lib/social/interaction-targets.ts` (añadir `'post'` a `TargetType`), `src/lib/push/types.ts` (categorías de aviso), `database.types.ts`.
- Crear: `src/lib/social/post-actions.ts` (`createPost`, `deletePost`) — generaliza `thought-actions.ts`.
- Crear: `src/lib/social/autopost.ts` (`maybeAutopostMilestone`) — writer de hito, invocado desde la acción de transición del usuario.
- Reescribir: `src/lib/social/feed.ts` (`getFeed` lee `posts`).
- Crear: `src/app/post/[id]/page.tsx` (ruta del post + hilo).
- Modificar: el compositor de Pensamiento (repunta a `createPost`), la acción de transición de ficha (llama `maybeAutopostMilestone`), el despacho de tarjeta de feed.

**Tests:**
- `supabase/tests/posts_rls.sql`, `supabase/tests/post_preferences_rls.sql` (matrices transaccionales).
- `src/lib/social/feed.test.ts` (actualizar), `src/lib/social/autopost.test.ts` (nuevo), `src/lib/social/post-actions.test.ts` (nuevo).
- `e2e/posts.spec.ts` (nuevo).

---

## Nota de fase (ajuste respecto a la spec)

La spec dejaba «writer mínimo (pensamiento + terminar)» en Spec 1 y todos los writers de hito en Spec 2. **Este plan mueve los writers de hito `started`/`finished`/`dropped` a Spec 1**, para que un despliegue a prod no deje el feed sin actividad de no-pensamiento entre Spec 1 y Spec 2. Quedan para **Spec 2**: toggle de compartir en sesión/episodio, autopublicación de episodios, y la **UI** de `post_preferences` (en Spec 1 las preferencias se leen; el default va en la tabla, sin pantalla de ajustes). **Spec 3**: episodios agrupados.

---

## Task 1: Enums de `posts` (valores en `target_kind`/`notification_type`)

**Files:**
- Create: `supabase/migrations/2026XXXX_posts_enum_values.sql`
- Test: verificación SQL vía `mcp__supabase-dev__execute_sql`

**Interfaces:**
- Produces: valores `'post'` en `target_kind`; `'post_commented'`, `'post_liked'` en `notification_type`. Los consume Task 3 (trigger) y Task 5 (backfill).

- [ ] **Step 1: Escribir la migración de valores de enum**

```sql
-- ALTER TYPE ... ADD VALUE no puede ir en la misma transacción que consume el
-- valor (lección de 20260834_thoughts_enum_values.sql), por eso migración aparte.
alter type public.target_kind add value if not exists 'post';
alter type public.notification_type add value if not exists 'post_commented';
alter type public.notification_type add value if not exists 'post_liked';
```

- [ ] **Step 2: Aplicar en dev y verificar contra objetos reales**

`mcp__supabase-dev__apply_migration` con el SQL de arriba, luego:
```sql
select 'post' = any(enum_range(null::public.target_kind)::text[]) as has_post,
       'post_commented' = any(enum_range(null::public.notification_type)::text[]) as has_pc,
       'post_liked' = any(enum_range(null::public.notification_type)::text[]) as has_pl;
```
Esperado: `has_post=t, has_pc=t, has_pl=t`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026XXXX_posts_enum_values.sql
git commit -m "feat(posts): valores de enum post/post_commented/post_liked (dev)"
```

---

## Task 2: Ampliar las uniones literales de TS

**Files:**
- Modify: `src/lib/social/interaction-targets.ts` (unión `TargetType`)
- Modify: `src/lib/social/` donde viva `NotificationType` y `NOTIFICATION_TYPE_KEY` (grep `NotificationType`)
- Modify: `src/lib/push/types.ts` (`NOTIFICATION_CATEGORY`)
- Test: `tsc` (typecheck del repo)

**Interfaces:**
- Produces: `'post'` en `TargetType`; `'post_commented'`/`'post_liked'` en `NotificationType`, con entrada en `NOTIFICATION_TYPE_KEY` y `NOTIFICATION_CATEGORY` (categoría `social`).

- [ ] **Step 1: Localizar las definiciones**

Run: `grep -rn "type TargetType\|type NotificationType\|NOTIFICATION_TYPE_KEY\|NOTIFICATION_CATEGORY" src/lib`
Confirma dónde están las uniones (patrón ya establecido por `thought`/`thought_commented`).

- [ ] **Step 2: Añadir `'post'` a `TargetType`**

En `src/lib/social/interaction-targets.ts`, en la unión `TargetType`, añadir `| "post"` junto a `"thought"`.

- [ ] **Step 3: Añadir los dos `notification_type` y sus mapas**

Añadir `"post_commented"` y `"post_liked"` a `NotificationType`; sus claves de copy en `NOTIFICATION_TYPE_KEY` (p.ej. `postCommented`/`postLiked`); y su entrada en `NOTIFICATION_CATEGORY` de `src/lib/push/types.ts` con categoría `social` (mismo criterio que `thought_commented`).

- [ ] **Step 4: Añadir copy en `messages/es.json`**

Claves `postCommented`/`postLiked` (mismo estilo que `thoughtCommented`/`thoughtLiked`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` (o `tsc --noEmit`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/interaction-targets.ts src/lib/push/types.ts messages/es.json
git commit -m "feat(posts): ampliar uniones TS TargetType/NotificationType con post_*"
```

---

## Task 3: Tabla `posts` + enums propios + trigger de sync/cleanup

**Files:**
- Create: `supabase/migrations/2026XXXX_posts.sql`
- Create/Test: `supabase/tests/posts_rls.sql`

**Interfaces:**
- Produces: tabla `public.posts` con las columnas del contrato; trigger `posts_sync_interaction_target` que crea un `interaction_target` (`kind='post'`, `href='/post/'||id`, `commentable=reactable=true`, avisos `post_commented`/`post_liked`); `cleanup_social_target('post')` en delete. Lo consumen Task 5 (backfill), Task 7-9 (TS), Task 11 (feed).

- [ ] **Step 1: Escribir la migración de la tabla (espejo de `20260835_thoughts.sql`)**

```sql
create type public.post_kind as enum
  ('started', 'finished', 'dropped', 'progressed', 'watched', 'thought');
create type public.post_anchor_type as enum
  ('book', 'movie', 'series', 'saga', 'person');
create type public.post_source_kind as enum
  ('pass', 'progress_session', 'episode_watch');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  kind public.post_kind not null,
  anchor_type public.post_anchor_type not null,
  anchor_id uuid not null,           -- polimórfico, sin FK (como thoughts/saga_items)
  source_kind public.post_source_kind,
  source_id uuid,
  body text check (body is null or (char_length(body) <= 2000 and char_length(btrim(body)) > 0)),
  is_spoiler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- source_kind y source_id van juntos o ninguno
  constraint posts_source_shape check ((source_kind is null) = (source_id is null))
);

-- Idempotencia: 1 post por (acción fuente, kind). Un pase puede tener 'started'
-- y 'finished' (distinto kind), pero no dos 'finished'. Parcial: los thought
-- (source null) no entran en la unicidad.
create unique index posts_source_kind_uidx
  on public.posts (source_kind, source_id, kind)
  where source_id is not null;

create index posts_author_created_idx on public.posts (author_id, created_at desc, id desc);
create index posts_anchor_idx on public.posts (anchor_type, anchor_id);

alter table public.posts enable row level security;

create policy "posts select visible" on public.posts for select
  using (public.can_view_profile(author_id));
create policy "posts insert own" on public.posts for insert
  with check ((select auth.uid()) = author_id);
create policy "posts update own" on public.posts for update
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
-- delete: dueño O admin/moderador global, vía can_moderate_target (rama 'post' en Task 3 Step 3).
create policy "posts delete own or moderate" on public.posts for delete
  using ((select auth.uid()) = author_id
         or public.can_moderate_target('post', id));

create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Añadir el trigger de sync (espejo de `sync_thought_interaction_target`)**

```sql
-- href a /post/[id]: el post SÍ tiene página propia (a diferencia del pensamiento,
-- que usaba la ficha del ancla). Esta es la diferencia clave con thoughts.
create or replace function private.sync_post_interaction_target()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.upsert_interaction_target(
    'post', new.id, new.author_id, 'profile', new.author_id,
    '/post/' || new.id::text, true, true, 'post_commented', 'post_liked');
  return new;
end;
$function$;

create trigger posts_sync_interaction_target
  after insert on public.posts
  for each row execute function private.sync_post_interaction_target();

create trigger posts_cleanup_social_target
  after delete on public.posts
  for each row execute function private.cleanup_social_target('post');
```

- [ ] **Step 3: Añadir la rama `'post'` a `private.social_target_owner_id`**

Localiza la función (`grep -rn "social_target_owner_id" supabase/migrations`) y añade la rama `'post'` que resuelve `owner_id` desde `posts.author_id` (mismo patrón que la rama `'thought'` de `20260836_thoughts_delete_moderate.sql`). Necesaria para que `can_moderate_target('post', id)` funcione.

- [ ] **Step 4: Grants por columna (#375)**

```sql
revoke all on table public.posts from authenticated;
grant select (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler, created_at, updated_at)
  on public.posts to authenticated;
grant insert (author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler)
  on public.posts to authenticated;
grant update (body, is_spoiler) on public.posts to authenticated;
grant delete on public.posts to authenticated;
-- Lectura anónima de perfiles públicos (mismo criterio que passes/thoughts):
grant select (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler, created_at, updated_at)
  on public.posts to anon;
```

- [ ] **Step 5: Escribir la matriz RLS `supabase/tests/posts_rls.sql`**

Patrón de `supabase/tests/thoughts_rls.sql` (transacción con rollback). Aserciones mínimas:
1. La dueña inserta un post y lo ve; el trigger materializó un `interaction_target` `kind='post'` con `href='/post/'||id`, `commentable`, `reactable`.
2. Un tercero sin follow no ve el post ni su target canónico.
3. Un seguidor aceptado lo ve y puede comentarlo por la vía canónica (`comments.interaction_target_id`).
4. Un no-dueño no puede insertarlo (RLS filtra, no excepción).
5. Borrarlo cascadea target + comentarios; `content_reports` conserva snapshot.

- [ ] **Step 6: Aplicar en dev, correr la matriz y verificar**

`mcp__supabase-dev__apply_migration` (Steps 1-4), luego ejecutar `posts_rls.sql`. Esperado: `ALL ASSERTIONS PASSED`. Verificar además:
```sql
select to_regclass('public.posts') is not null as table_ok,
       (select count(*) from pg_trigger where tgrelid='public.posts'::regclass) as triggers;
```
Correr `mcp__supabase-dev__get_advisors(security)`: sin hallazgos nuevos sobre `posts`.

- [ ] **Step 7: Correr DRIFT-CHECK superficie 6 (grants por columna)**

Confirmar `posts` con 11 select / 8 insert / 2 update, mismo patrón intencionado que `thoughts`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/2026XXXX_posts.sql supabase/tests/posts_rls.sql
git commit -m "feat(posts): tabla posts + target 'post' + RLS/grants (dev)"
```

---

## Task 4: Tabla `post_preferences`

**Files:**
- Create: `supabase/migrations/2026XXXX_post_preferences.sql`
- Create/Test: `supabase/tests/post_preferences_rls.sql`

**Interfaces:**
- Produces: tabla `public.post_preferences (user_id pk, autopost_started, autopost_finished, autopost_dropped)`. La lee `maybeAutopostMilestone` (Task 9): **sin fila = defaults** (finished ON, resto OFF).

- [ ] **Step 1: Escribir la migración**

```sql
create table public.post_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  autopost_started boolean not null default false,
  autopost_finished boolean not null default true,
  autopost_dropped boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.post_preferences enable row level security;
create policy "post_prefs select own" on public.post_preferences for select
  using ((select auth.uid()) = user_id);
create policy "post_prefs upsert own" on public.post_preferences for insert
  with check ((select auth.uid()) = user_id);
create policy "post_prefs update own" on public.post_preferences for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger post_preferences_set_updated_at before update on public.post_preferences
  for each row execute function public.set_updated_at();

revoke all on table public.post_preferences from authenticated;
grant select (user_id, autopost_started, autopost_finished, autopost_dropped, updated_at)
  on public.post_preferences to authenticated;
grant insert (user_id, autopost_started, autopost_finished, autopost_dropped)
  on public.post_preferences to authenticated;
grant update (autopost_started, autopost_finished, autopost_dropped)
  on public.post_preferences to authenticated;
```

- [ ] **Step 2: Matriz RLS `post_preferences_rls.sql`**

Aserciones: la dueña inserta/lee/actualiza su fila; un tercero no ve ni escribe la fila de otro (RLS filtra).

- [ ] **Step 3: Aplicar en dev, correr matriz, verificar grants (superficie 6)**

`ALL ASSERTIONS PASSED`; grants 5 select / 4 insert / 3 update; advisors sin findings.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026XXXX_post_preferences.sql supabase/tests/post_preferences_rls.sql
git commit -m "feat(posts): tabla post_preferences (dev)"
```

---

## Task 5: Backfill de datos + promoción in-place de targets + absorción de `thoughts`

**Files:**
- Create: `supabase/migrations/2026XXXX_posts_backfill.sql`

**Interfaces:**
- Consumes: `posts` (Task 3), enums (Task 1).
- Produces: una fila `posts` por cada acción histórica compartible; los `interaction_targets` de esas acciones **promovidos in-place** a `kind='post'`, `source_id=post.id`, `href='/post/'||post.id` — con `comments`/`reactions`/`notifications` INTACTOS (mismo `interaction_target_id`).

> **CORRECCIÓN (bug del plan detectado antes de ejecutar):** el trigger
> `posts_sync_interaction_target` (AFTER INSERT) crea un target `post` fresco en
> CADA insert de backfill, que colisiona (`unique(kind, source_id)`) con la
> promoción in-place de más abajo. Por eso el backfill **desactiva el trigger**
> mientras inserta y promueve, y lo reactiva al final con un fallback para los
> posts cuyo target fuente no existía.

- [ ] **Step 1: Escribir el backfill — pases terminados → post `finished`**

```sql
-- 0) Desactivar el trigger de sync: durante el backfill el target lo aporta la
--    PROMOCIÓN in-place (preserva comentarios/reacciones), no el trigger.
alter table public.posts disable trigger posts_sync_interaction_target;

-- 1) Un post 'finished' por cada pase terminado.
insert into public.posts (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, created_at)
select gen_random_uuid(), p.user_id, 'finished', p.item_type::text::public.post_anchor_type,
       p.item_id, 'pass', p.id, p.updated_at
from public.passes p
where p.finished_on is not null
on conflict do nothing;

-- 2) Promover el target 'diary_entry' de ese pase → 'post' (in-place: los
--    comentarios/reacciones conservan su interaction_target_id).
update public.interaction_targets it
set kind = 'post', source_id = np.id, href = '/post/' || np.id::text,
    comment_notification_type = 'post_commented', reaction_notification_type = 'post_liked'
from public.posts np
where np.kind = 'finished' and np.source_kind = 'pass'
  and it.kind = 'diary_entry' and it.source_id = np.source_id;
```

- [ ] **Step 2: Absorber `thoughts` → post `thought`**

```sql
insert into public.posts (id, author_id, kind, anchor_type, anchor_id, body, is_spoiler, created_at, updated_at)
select t.id, t.user_id, 'thought', t.anchor_type::text::public.post_anchor_type,
       t.anchor_id, t.body, t.is_spoiler, t.created_at, t.updated_at
from public.thoughts t
on conflict do nothing;
-- Reusar el MISMO id evita re-apuntar: promover el target 'thought' (source_id=thought.id=post.id).
update public.interaction_targets it
set kind = 'post', href = '/post/' || it.source_id::text,
    comment_notification_type = 'post_commented', reaction_notification_type = 'post_liked'
where it.kind = 'thought'
  and exists (select 1 from public.posts p where p.id = it.source_id and p.kind = 'thought');
```

- [ ] **Step 3: Sesiones con nota pública → post `progressed`**

```sql
insert into public.posts (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler, created_at)
select gen_random_uuid(), s.user_id, 'progressed', pa.item_type::text::public.post_anchor_type,
       pa.item_id, 'progress_session', s.id, n.body, n.is_spoiler, s.created_at
from public.progress_sessions s
join public.passes pa on pa.id = s.pass_id
join lateral (
  select body, is_spoiler from public.notes
  where session_id = s.id and is_public = true
  order by created_at desc limit 1
) n on true
on conflict do nothing;

update public.interaction_targets it
set kind = 'post', source_id = np.id, href = '/post/' || np.id::text,
    comment_notification_type = 'post_commented', reaction_notification_type = 'post_liked'
from public.posts np
where np.kind = 'progressed' and np.source_kind = 'progress_session'
  and it.kind = 'progress_session' and it.source_id = np.source_id;
```

- [ ] **Step 3b: Reactivar el trigger y materializar targets faltantes (fallback)**

```sql
alter table public.posts enable trigger posts_sync_interaction_target;
-- Cualquier post backfilleado cuyo target fuente NO existía (dato viejo sin
-- target) se materializa ahora con el MISMO helper que usa el trigger.
select private.upsert_interaction_target(
  'post', p.id, p.author_id, 'profile', p.author_id,
  '/post/' || p.id::text, true, true, 'post_commented', 'post_liked')
from public.posts p
where not exists (
  select 1 from public.interaction_targets it
  where it.kind = 'post' and it.source_id = p.id);
```

- [ ] **Step 4: Contabilizar y decidir los targets sin post (edge case)**

Antes de aplicar en prod, MEDIR interacciones sobre targets que NO se promueven a post (`pass`/added, `episode_watch`, `progress_session` sin nota pública):
```sql
select it.kind, count(*) filter (where c.id is not null) as comentarios,
       count(*) filter (where r.id is not null) as reacciones
from public.interaction_targets it
left join public.comments c on c.interaction_target_id = it.id
left join public.reactions r on r.interaction_target_id = it.id
where it.kind in ('pass','episode_watch','progress_session')
group by it.kind;
```
Si hay interacciones huérfanas (poco probable — el feed suprimía «added» propio), **abrir issue** `area:social`/`tipo:deuda`/`P2` y decidir (dejarlas en el target viejo, invisibles en el feed nuevo, es aceptable para v1). NO borrarlas.

- [ ] **Step 5: Aplicar en dev y verificar invariantes (conteos idénticos paso a paso)**

Tras aplicar: verificar que el nº de comentarios y reacciones TOTAL no cambió (la promoción no borra nada), y que no quedan `posts` con target sin materializar:
```sql
select
  (select count(*) from public.comments) as comentarios,
  (select count(*) from public.reactions) as reacciones,
  (select count(*) from public.posts) as posts,
  (select count(*) from public.posts p
     where not exists (select 1 from public.interaction_targets it
                       where it.kind='post' and it.source_id=p.id)) as posts_sin_target;
```
Esperado: `posts_sin_target = 0`; comentarios/reacciones iguales a antes del backfill.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026XXXX_posts_backfill.sql
git commit -m "feat(posts): backfill + promocion in-place de targets + absorcion thoughts (dev)"
```

---

## Task 6: `interaction-targets.ts` + `getInteractionSummary` para `post`

**Files:**
- Modify: `src/lib/social/interaction-targets.ts` (ya tocado en Task 2)
- Test: `src/lib/social/interactions.test.ts` (o crear un caso)

**Interfaces:**
- Consumes: `TargetType` con `'post'` (Task 2).
- Produces: `getInteractionSummary(supabase, "post", postIds)` resuelve `(kind='post', source_id=postId)` → `interaction_target_id` y agrega reacciones/comentarios. Sin cambios de lógica: solo el tipo lo permite.

- [ ] **Step 1: Verificar que `getInteractionSummary` acepta `"post"`**

Confirmar que `TargetType = Exclude<CanonicalTargetType, "comment">` ya incluye `"post"` tras Task 2. No hay cambio de código en `interactions.ts` — el resolutor `getInteractionTargetRefs` es genérico por `(kind, sourceId)`.

- [ ] **Step 2: Test unitario del resumen para posts**

Escribir un test que, con un fake de supabase (patrón de los tests existentes de `feed`/`interactions`), pida `getInteractionSummary(sb, "post", [id])` y compruebe que agrupa reacciones por kind y comentarios. Run: `npm run test -- interactions`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/social/interactions.test.ts
git commit -m "test(posts): getInteractionSummary soporta target 'post'"
```

---

## Task 7: `createPost` / `deletePost` (generaliza `thought-actions.ts`)

**Files:**
- Create: `src/lib/social/post-actions.ts`
- Create: `src/lib/social/post-actions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type CreatePostInput = {
    kind: "thought" | "progressed" | "started" | "finished" | "dropped" | "watched";
    anchorType: "book"|"movie"|"series"|"saga"|"person";
    anchorId: string;
    sourceKind?: "pass"|"progress_session"|"episode_watch";
    sourceId?: string;
    body?: string;      // requerido si kind==="thought"
    isSpoiler?: boolean;
  };
  type CreatePostResult = { ok: true; id: string } | { ok: false; error: string };
  createPost(input: CreatePostInput): Promise<CreatePostResult>;
  deletePost(postId: string): Promise<{ ok: true } | { ok: false; error: string }>;
  ```
- Consume: Task 8 (compositor de Pensamiento), Task 9 (autopost).

- [ ] **Step 1: Escribir el test primero (patrón `thought-actions`, discriminado, nunca lanza)**

```ts
// post-actions.test.ts — con fake de supabase (mismo patrón que thought-actions.test.ts)
test("createPost thought sin sesion => unauthenticated", async () => {
  const r = await createPost({ kind: "thought", anchorType: "book", anchorId: "x", body: "hola" });
  expect(r).toEqual({ ok: false, error: "unauthenticated" });
});
test("createPost thought con body vacio => empty", async () => { /* ... */ });
test("createPost finished sin body => ok (body opcional para hitos)", async () => { /* ... */ });
```

- [ ] **Step 2: Implementar `createPost`**

Basado en `createThought` (resultado discriminado, nunca `throw` que el cliente lea; resolver ancla en catálogo antes del insert para book/movie/series/saga/person; cliente de SESIÓN, la RLS `posts insert own` protege la autoría). Diferencias:
- `body` obligatorio solo si `kind==="thought"`; opcional en el resto.
- Insertar `kind`, `anchor_*`, `source_*`, `body`, `is_spoiler`.
- Tras el insert, menciones `@usuario` best-effort resolviendo el target `('post', inserted.id)` y `notifyMentions` (igual que `createThought`).
- `revalidateFeed()`.

- [ ] **Step 3: Implementar `deletePost`** (espejo de `deleteThought`: delete con `.select("id")`, RLS decide).

- [ ] **Step 4: Correr tests**

Run: `npm run test -- post-actions`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/post-actions.ts src/lib/social/post-actions.test.ts
git commit -m "feat(posts): createPost/deletePost server actions"
```

---

## Task 8: Repuntar el compositor de Pensamiento a `createPost`

**Files:**
- Modify: el componente compositor de Pensamiento (grep `createThought`) y sus consumidores.

**Interfaces:**
- Consumes: `createPost` (Task 7).

- [ ] **Step 1: Localizar los llamadores de `createThought`/`deleteThought`**

Run: `grep -rn "createThought\|deleteThought\|searchAnchorsAction" src`

- [ ] **Step 2: Repuntar**

Sustituir `createThought(x)` por `createPost({ kind: "thought", ...x })` y `deleteThought(id)` por `deletePost(id)`. `searchAnchorsAction` se conserva (mover a `post-actions.ts` o re-exportar). El compositor no cambia de forma — solo el destino.

- [ ] **Step 3: Typecheck + tests**

Run: `npm run typecheck && npm run test -- thought`. Expected: PASS (o migrar los tests de `thought-actions` a `post-actions`).

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(posts): el compositor de Pensamiento escribe posts (kind=thought)"
```

---

## Task 9: Writer de hito `maybeAutopostMilestone`

**Files:**
- Create: `src/lib/social/autopost.ts`
- Create: `src/lib/social/autopost.test.ts`
- Modify: la acción de transición de ficha del usuario (grep `applyTransition` en `src/lib/passes/actions.ts` y en los componentes de ficha `pass-progress.tsx`/`new-pass-sheet.tsx`).

**Interfaces:**
- Produces:
  ```ts
  // to = el estado destino de la transición; from = estado previo (o null).
  maybeAutopostMilestone(supabase, {
    userId: string; passId: string; itemType: "book"|"movie"|"series"; itemId: string;
    to: MediaStatus; created: boolean; closed: boolean;
  }): Promise<void>;  // best-effort, NUNCA lanza
  ```
- **CLAVE:** se invoca SOLO desde la acción de transición **iniciada por el usuario en la ficha**, no dentro de `applyTransition` (que corre también en import/quick-add → «admin nunca publica»).

- [ ] **Step 1: Test primero — mapea transición → kind, respeta preferencia**

```ts
test("to=in_progress con autopost_started=false => no post", async () => {...});
test("to=in_progress con autopost_started=true => post started", async () => {...});
test("closed completed con autopost_finished (default true) => post finished", async () => {...});
test("to=dropped con autopost_dropped=false => no post", async () => {...});
```

- [ ] **Step 2: Implementar**

Lógica: leer `post_preferences` del usuario (sin fila → defaults: finished ON, started/dropped OFF). Mapear:
- `to === "in_progress"` → `started` (si `autopost_started`).
- `closed && to === "completed"` → `finished` (si `autopost_finished`).
- `closed && to === "dropped"` → `dropped` (si `autopost_dropped`).
Si procede, `createPost({ kind, anchorType: itemType, anchorId: itemId, sourceKind: "pass", sourceId: passId })`. Todo en `try/catch` que solo loguea (best-effort; el `unique` da idempotencia ante doble-click).

- [ ] **Step 3: Enganchar en la acción de transición de ficha**

En la server action que la ficha llama para cambiar estado (la que invoca `applyTransition` en respuesta a un click del usuario), tras un `TransitionOutcome` `done`, llamar `await maybeAutopostMilestone(...)`. NO tocar `apply-transition.ts` ni los llamadores de import/quick-add.

- [ ] **Step 4: Tests + typecheck**

Run: `npm run test -- autopost && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/autopost.ts src/lib/social/autopost.test.ts
git commit -m "feat(posts): autopost de hitos (started/finished/dropped) desde la ficha"
```

---

## Task 10: Reescritura de `getFeed` para leer de `posts`

**Files:**
- Modify: `src/lib/social/feed.ts`
- Modify: `src/lib/social/feed-order.ts` (cursor simplificado)
- Modify/Test: `src/lib/social/feed.test.ts`, `feed-paging.test.ts`, `feed-order.test.ts`

**Interfaces:**
- Consumes: `posts` (Task 3), `getInteractionSummary(..., "post", ...)` (Task 6), `getClubActivityEvents` (sin cambios).
- Produces: `getFeed` devuelve `FeedPage` con eventos derivados de `posts`; el cursor keyset es `(created_at, id)` de `posts`; los eventos de club se siguen mezclando.

- [ ] **Step 1: Actualizar los tests del feed a la nueva fuente**

Reescribir `feed.test.ts` para sembrar `posts` (no las 6 fuentes) y comprobar: orden `created_at desc,id desc`; cursor keyset; mezcla con eventos de club; que cada evento lleva `interactionTarget` con `targetType:"post"` y `interactionTargetId` resuelto. Run para verlos fallar primero.

- [ ] **Step 2: Reescribir `getFeed`**

Reemplazar el *fan-out* de 6 queries por UNA sobre `posts` (`author_id in (seguidos ∪ viewer)`, `order created_at desc, id desc, limit pageSize+1`, filtro de cursor keyset). En batch: catálogo del ancla (`books/movies/series/sagas/people` por `anchor_type/anchor_id`), filas fuente para display (`passes.rating/review` en `finished`, `progress_sessions.position` en `progressed`, episodio en `watched`), identidades de actor, y `getInteractionSummary(sb, "post", ids)`. Mantener `getClubActivityEvents` y la mezcla final por `created_at`. Eliminar: `orderDate/sortDate/eventDate/sessionRelativeBasis`, cursores por-fuente, `planFeedPageCut`/`openTailIds` (ya no hay solapamiento de grupos multi-fuente; el feed ordena por publicación). El filtro `FeedFilter` (`book/screen/reviews/clubs`) se re-mapea sobre `posts.anchor_type`/`kind` (`reviews` = `kind='finished'` con `review` no vacío; `book`/`screen` por `anchor_type`).

- [ ] **Step 3: Simplificar `feed-order.ts`**

El cursor pasa a ser `(created_at, id)` de una sola tabla. Retirar `FEED_SOURCE_COLUMNS`/`cursorSourceFilter` multi-fuente (o reducir a la única fuente `posts` + `clubs`). Actualizar `feed-order.test.ts`.

- [ ] **Step 4: Correr toda la suite de feed**

Run: `npm run test -- feed`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/feed.ts src/lib/social/feed-order.ts src/lib/social/*.test.ts
git commit -m "refactor(posts): getFeed lee de posts (orden por fecha de publicacion)"
```

---

## Task 11: Ruta `/post/[id]` (post + hilo)

**Files:**
- Create: `src/app/post/[id]/page.tsx`
- (Reutiliza los componentes de tarjeta/ hilo existentes del feed.)
- Test: `e2e/posts.spec.ts`

**Interfaces:**
- Consumes: `posts` + `getInteractionSummary(..., "post", [id])`.

- [ ] **Step 1: Implementar la page (Server Component, NO cacheable — regla #437)**

Cargar el post por `id` (la RLS `posts select visible` gatea la audiencia). 404 (`notFound()`) si no visible. Resolver ancla (catálogo) + fila fuente para display + `getInteractionSummary(sb, "post", [id])`. Renderizar la tarjeta del post + **el hilo completo** con la caja de comentario prominente y texto grande (objetivo de interacción §1.1 de la spec). El hilo reutiliza el componente de comentarios del feed. Mantener detrás de `<Suspense>`, sin `use cache`.

> Recordatorio PPR (#514): si la ruta entra en Partial Prerender, un `notFound()` del body puede dar 200 en prod — probar el gate 404 contra `next build`+`start`, no solo `next dev`.

- [ ] **Step 2: e2e `posts.spec.ts`**

Publicar un Pensamiento (post kind=thought) → navegar a `/post/[id]` → ver el cuerpo + hilo → comentar → reaccionar 🔥 → recargar y comprobar persistencia. Repetir abriendo `/post/[id]` de un post `finished` (hito). (Ejecutable por quien tenga `.env.local`; en el worktree sin credenciales queda committeado como entregable, como `thoughts.spec.ts`.)

- [ ] **Step 3: Verificar contra build de producción**

Run: `npm run build && npm run start` + navegar/`test:e2e`. Confirmar 200 en post visible y 404 en no visible.

- [ ] **Step 4: Commit**

```bash
git add src/app/post/[id]/page.tsx e2e/posts.spec.ts
git commit -m "feat(posts): ruta /post/[id] con hilo destacado"
```

---

## Task 12: Notificaciones al post + despacho de tarjeta por `kind`

**Files:**
- Modify: el despacho de tarjeta del feed (grep `feed-item.tsx`).
- (Notificaciones: sin cambio de código — el `href` del target ya es `/post/[id]` por el trigger/backfill.)

**Interfaces:**
- Consumes: `FeedEvent` con `verb`/`kind` de post (Task 10).

- [ ] **Step 1: Verificar el deep-link de notificación**

Confirmar (query o e2e) que una notificación `post_commented` lleva a `/post/[id]` (su target tiene ese `href`). Sin cambio de código esperado; si la UI de notificaciones construye el href de otra forma, ajustarla para leer `target.href`.

- [ ] **Step 2: Despacho de tarjeta por `kind` de post**

En `feed-item.tsx`, enrutar cada evento a su tarjeta según `kind` (`thought`→tarjeta de pensamiento existente; `finished`→tarjeta de reseña; `progressed`→tarjeta de avance; `started`/`dropped`/`watched`→tarjeta de hito). Reutilizar las tarjetas actuales; el enrutado por `kind` sustituye al enrutado por `verb`.

- [ ] **Step 3: e2e de notificación**

Añadir a `posts.spec.ts`: un segundo usuario comenta el post → el autor recibe notificación → clic lleva a `/post/[id]`.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(posts): notificaciones deep-linkan a /post/[id]; despacho de tarjeta por kind"
```

---

## Task 13: Retirada de triggers fuente + `drop table thoughts` (DESPUÉS del merge)

**Files:**
- Create: `supabase/migrations/2026XXXX_posts_retire_source_triggers.sql`

**Interfaces:**
- **Orden de despliegue NO NEGOCIABLE:** esta migración se aplica **DESPUÉS** de que el código (Tasks 1-12) esté desplegado y ya NO lea `thoughts` ni cree targets `diary_entry`/`pass`/`progress_session`/`episode_watch`. Código primero, esquema después.

- [ ] **Step 1: Escribir la migración de retirada**

```sql
-- Retirar los triggers que materializaban targets desde las tablas fuente
-- (ya los sustituye el trigger de posts). Conservar los de comment/club_post/
-- club_activity/activity_checkpoint (no son posts).
drop trigger if exists <trigger_pass_sync> on public.passes;        -- diary_entry + pass
drop trigger if exists <trigger_session_sync> on public.progress_sessions;
drop trigger if exists <trigger_episode_sync> on public.episode_watches;

-- Absorción completada: retirar thoughts (su código ya no la lee).
drop trigger if exists thoughts_sync_interaction_target on public.thoughts;
drop trigger if exists thoughts_cleanup_social_target on public.thoughts;
drop table if exists public.thoughts;
-- Los valores de enum muertos ('thought' en target_kind, thought_* en
-- notification_type) NO se dropean (recrear el tipo es caro; son inertes).
```
(Sustituir `<trigger_*>` por los nombres reales — `grep -rn "after insert on public.passes\|after insert on public.progress_sessions\|after insert on public.episode_watches" supabase/migrations`.)

- [ ] **Step 2: Aplicar en dev y verificar**

Confirmar que insertar un pase/sesión/watch nuevo ya NO crea targets `diary_entry`/`pass`/`progress_session`/`episode_watch`, que `to_regclass('public.thoughts')` es null, y que el feed/`/post/[id]` siguen verdes. Advisors sin findings.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026XXXX_posts_retire_source_triggers.sql
git commit -m "chore(posts): retirar triggers fuente y drop thoughts (dev, POST-merge)"
```

---

## Task 14: Despliegue a producción + sincronización documental

**Files:**
- Modify: `docs/requirements/data-model.md` (§5/§6.2), `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`, `schema-baseline.sql`.

- [ ] **Step 1: Orden de despliegue a prod**

Aplicar en prod, verificando contra objetos reales tras cada paso: (1) enums (Task 1), (2) tabla `posts` + trigger + `post_preferences` (Tasks 3-4), (3) backfill (Task 5) midiendo conteos idénticos, (4) **merge del código** (Tasks 2,6-12), (5) **solo entonces** la retirada de triggers + `drop thoughts` (Task 13). Regla del repo: código primero, `DROP` después.

- [ ] **Step 2: Actualizar `data-model.md`**

Nueva sección de `posts` en §5 (Social): tabla, target `post`, `post_preferences`, absorción de `thoughts` (marcar §6.2 como supersedida), y la fecha de verificación. Añadir el delta de cabecera con las migraciones en el orden que recibió prod.

- [ ] **Step 3: `backlog.md` + `decisiones.md`**

Marcar la casilla de «posts como capa social (Spec 1)». Añadir al FINAL de `decisiones.md` (append-only) las decisiones tomadas: posts 1:1 con target sin migrar interacciones; feed ordena por fecha de publicación; visibilidad = perfil; milestone writers en la acción de ficha (no en `applyTransition`).

- [ ] **Step 4: Abrir issues de lo diferido** (con tres etiquetas):
- Spec 2 (compartir en sesión/episodio + UI de preferencias) — `area:social`/`tipo:feature`/`P2`.
- Spec 3 (episodios agrupados) — `area:social`/`tipo:feature`/`P3`.
- Interacciones huérfanas del backfill si Task 5 Step 4 encontró alguna — `tipo:deuda`/`P2`.
- «posts sobre esta entidad» en fichas — `tipo:feature`/`P3`.

- [ ] **Step 5: Commit**

```bash
git commit -am "docs(posts): sincronizar data-model/backlog/decisiones (Spec 1 en prod)"
```

---

## Self-Review (cobertura de la spec)

- §4.1 tabla posts → Task 3. §4.2 enums → Tasks 1-2. §4.3 target 'post'/trigger → Task 3. §4.4 post_preferences → Task 4.
- §5 modelo híbrido: thought → Tasks 7-8; started/finished/dropped → Task 9; progressed/watched (share) → **Spec 2** (fuera de este plan, ver Nota de fase); admin nunca → garantizado por enganchar en la acción de ficha, no en `applyTransition` (Task 9 Step 3).
- §6 migración/backfill → Task 5 (promoción in-place) + Task 13 (drop thoughts). §6.2 absorción → Task 5 Step 2 + Task 13.
- §7 lectura: feed → Task 10; perfil → reutiliza `getFeed(actorId)` (sin tarea propia, cubierto por Task 10); `/post/[id]` → Task 11; notificaciones → Task 12; gate de prototipos → **Spec 2** (fase de UI).
- §8 escritura: compositor thought → Task 8; writers hito → Task 9; sesión/episodio/UI prefs → **Spec 2**.
- §11 reglas repo (grants, cache+RLS, enum en txn propia, DROP tardío, tipos TS) → recogidas en Global Constraints y en cada tarea.

**Gaps conocidos (deliberados, a Spec 2/3):** toggle de compartir en sesión/episodio, autopublicación de episodios y su agrupación, UI de `post_preferences`, gate de prototipos PC+móvil. Se abren como issues en Task 14 Step 4.
