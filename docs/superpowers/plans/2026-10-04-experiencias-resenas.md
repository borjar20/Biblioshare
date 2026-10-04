# Experiencias: reseñas por momento — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada participante que asistió a un momento de una experiencia vivida puede reseñarlo (nota 1–10 y/o texto), con consentimiento por reseña para salir del grupo, publicación explícita en Actividad/feed, media derivada en tarjetas y hub, más «Lo vivimos», favorito sin estrella y cuatro tipos de momento nuevos.

**Architecture:** Tabla propia `experience_moment_reviews` con FK a la fila de asistencia, RLS por helper `SECURITY DEFINER` en `private` (mismo patrón que `experience_photos`) y escrituras solo por RPC. La publicación reutiliza `posts` con `kind='experience_review'` anclado a la experiencia y `source_id` a la reseña; el feed reutiliza la variante `source:'experience'` con un campo `review` opcional. La media se calcula `SECURITY INVOKER` sobre las filas que el que llama puede ver; nada de esto se cachea.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase Postgres + RLS, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-experiencias-resenas-design.md` (con las correcciones de la Tarea 0).

## Global Constraints

- Node 22 (el shell trae v20, que rompe vitest): `fnm use 22` antes de `npm test`. En un worktree, copiar `.env.local`.
- Un solo `next dev`/`next start` en el puerto 3000; matar el viejo antes (`Get-NetTCPConnection -LocalPort 3000`).
- Ninguna función nueva lleva `use cache`: todo depende de la sesión (regla #437).
- Funciones SQL nuevas: `set search_path=''`, nombres cualificados, identidad desde `auth.uid()`, `revoke all ... from public` (y `anon` si no la usa), `grant execute` mínimo.
- Tablas nuevas: `enable row level security`, `revoke all from public,anon,authenticated`, `grant select to anon,authenticated`, `grant all to service_role`. Sin escritura directa.
- Errores SQL → `ExperienceError` vía `experienceSqlError` (`42501` forbidden, `PT409` conflict, `PT404` not_found, `PT429` limit, `22*`/`23*` invalid).
- Límites: `rating` entero 1–10; `body` recortado 1–4000 caracteres; al menos uno de los dos.
- Copy nuevo: primero `docs/UI-GLOSARIO.md`, después `messages/es.json` (namespace `experiences`, salvo admin en el suyo).
- Objetivos táctiles ≥44 px (`min-h-11`), errores con `role="alert"`, tokens Paper. Ni estrellas (`StarIcon`) ni librerías nuevas.
- Migraciones: bootstrap local → `biblioshare-dev` → producción. Verificar contra `pg_proc`/`pg_class`/`pg_policies`, no contra el ledger.
- Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20261004100000_experience_reviews_enums.sql` | Valores de enum (solos, en su propia transacción) |
| `supabase/migrations/20261004100100_experience_moment_kinds.sql` | Helper `private.is_experience_kind`, CHECK y RPC que validan el tipo |
| `supabase/migrations/20261004100200_experience_reviews_core.sql` | Tabla, triggers, RLS, RPC de reseña, asistencia, media y hub ordenado |
| `supabase/migrations/20261004100300_experience_reviews_social.sql` | Publicación, guard/policy de posts, `can_view_target`, limpieza |
| `supabase/migrations/20261004100400_experience_reviews_moderation.sql` | Kind de moderación `experience_review` y denuncia |
| `supabase/tests/experiences_reviews.sql` | Matriz SQL con rollback |
| `src/lib/experiences/review-actions.ts` (+ `.test.ts`) | Server actions de reseña |
| `src/lib/experiences/types.ts`, `validation.ts`, `queries.ts` | Tipos, validación, lecturas |
| `src/lib/social/feed.ts`, `notification-types.ts`, `notify-categories.ts`, `post-kinds.ts` | Feed y avisos |
| `src/components/experiences/moment-reviews.tsx` (+ `.test.tsx`) | Bloque y hoja de reseña |
| `src/components/experiences/experience-lived-action.tsx` (+ `.test.tsx`) | «Lo vivimos» |
| `src/components/experiences/experience-rating.tsx` | Dots + número para cabecera y tarjeta |
| `src/components/experiences/review-report.tsx` | Denunciar reseña |
| `e2e/experiencias-resenas.spec.ts`, `e2e/experiencias-resenas-social.spec.ts` | E2E |

---

### Tarea 0: Corregir la spec con lo encontrado en el código

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-experiencias-resenas-design.md`

- [ ] **Paso 1: Aplicar las cuatro correcciones**

1. §2.3: sustituir «`moment_kind += …`» por: «`experience_moments.kind` es `text` con `CHECK`, no un enum. Se amplía el CHECK y la lista se centraliza en `private.is_experience_kind(text)`, que usan `experience_create`, `experience_save_moment`, `get_profile_experiences` y el hub ordenado.»
2. §2.2: sustituir el párrafo del «flag de sesión» por: «La RPC `experience_set_attendance(p_moment_id, p_state, p_drop_reviews)` borra primero la reseña cuando `p_drop_reviews=true` y después actualiza. El trigger sobre `experience_moment_participants` rechaza con `PT409` cualquier cambio desde `attended` mientras exista reseña, así que ningún otro camino la deja huérfana. No hace falta un flag de sesión.»
3. §2.2 y tabla de §3.2: quitar `experience_delete_moment_review` «tras salir». Retirar a un participante borra sus filas de `experience_moment_participants` y sus reseñas caen en cascada. `experience_delete_moment_review` sigue existiendo para borrar la propia reseña estando dentro.
4. §4.2: sustituir «`source:'experience_review'`» por: «Se reutiliza `source:'experience'`. `ExperienceFeedEvent` gana `review: ExperienceFeedReview | null`, y `ExperienceFeedCard` renderiza la variante de reseña cuando no es nulo. Así se evita duplicar el camino de cursor, reacciones y comentarios.»

- [ ] **Paso 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-04-experiencias-resenas-design.md
git commit -m "docs(experiencias): ajustar spec de reseñas a los contratos reales"
```

---

### Tarea 1: Valores de enum

**Files:**
- Create: `supabase/migrations/20261004100000_experience_reviews_enums.sql`
- Modify: `supabase/bootstrap/manifest.json` (añadir la migración a la lista, en orden)

**Interfaces:**
- Produces: `post_kind.experience_review`, `post_source_kind.experience_review`, `target_kind.experience_review`, `notification_type.experience_reviewed`.

- [ ] **Paso 1: Escribir la migración**

```sql
-- Enum values must commit before their consumers in experience_reviews_*.
alter type public.post_kind add value if not exists 'experience_review';
alter type public.post_source_kind add value if not exists 'experience_review';
alter type public.target_kind add value if not exists 'experience_review';
alter type public.notification_type add value if not exists 'experience_reviewed';
```

- [ ] **Paso 2: Añadirla al manifiesto**

En `supabase/bootstrap/manifest.json`, añadir `"20261004100000_experience_reviews_enums.sql"` justo después de la última entrada existente (`20261003153110_guard_comment_target_recursion.sql` o la que haya al final). Mantener el orden por versión.

- [ ] **Paso 3: Bootstrap local**

Run: `npm run db:local:prepare`
Expected: termina sin error y el resumen incluye `20261004100000`.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/20261004100000_experience_reviews_enums.sql supabase/bootstrap/manifest.json
git commit -m "feat(experiencias): enums de reseñas de momento"
```

---

### Tarea 2: Tipos de momento nuevos (SQL)

**Files:**
- Create: `supabase/migrations/20261004100100_experience_moment_kinds.sql`
- Create: `supabase/tests/experiences_reviews.sql` (primer bloque; las tareas 3–6 lo amplían)
- Modify: `scripts/db/verify.mjs` (añadir el test tras `experiences_own_photo_preview.sql`)
- Modify: `supabase/bootstrap/manifest.json`

**Interfaces:**
- Produces: `private.is_experience_kind(p_kind text) returns boolean`, ejecutable por `anon,authenticated`. Tipos válidos: `concert, show, exhibition, museum, walk, food, festival, sport, nature, other`.

- [ ] **Paso 1: Escribir el test que falla**

Crear `supabase/tests/experiences_reviews.sql`. La cabecera de actores se reutiliza en todas las tareas:

```sql
begin;
create temporary table xr(k text primary key,id uuid not null default gen_random_uuid());
insert into xr(k) values('owner'),('member'),('absent'),('outsider'),('blocked'),('root'),('moment'),('moment2'),('memberrow'),('absentrow'),('review'),('post');
grant select,update on xr to anon,authenticated;
insert into auth.users(id) select id from xr where k in ('owner','member','absent','outsider','blocked');
insert into public.profiles(user_id,username,is_public) select id,'rev_'||left(replace(id::text,'-',''),15),true from xr where k in ('owner','member','absent','outsider','blocked');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
-- Task 2: new kinds are accepted; unknown kinds are rejected.
update xr set id=(public.experience_create('{"title":"[TEST] reviews","kind":"food","state":"lived"}')->>'id')::uuid where k='root';
do $$ begin
  if (select kind from public.experience_moments where experience_id=(select id from xr where k='root'))<>'food' then raise exception 'FAIL food kind'; end if;
  begin perform public.experience_create('{"title":"x","kind":"karaoke","state":"lived"}'); raise exception 'FAIL unknown kind'; exception when sqlstate '22023' then null; end;
end $$;
rollback;
```

Añadir a `scripts/db/verify.mjs`, después de la línea de `experiences_own_photo_preview.sql`:

```js
sql(readFileSync(join(repoRoot, 'supabase/tests/experiences_reviews.sql'), 'utf8'));
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm run test:db:local`
Expected: FAIL con `invalid` (22023) en `experience_create` para `food`.

- [ ] **Paso 3: Escribir la migración**

Antes, confirmar el nombre real del CHECK:

Run: `docker exec -i supabase_db_<projectId> psql -U postgres -At -c "select conname from pg_constraint where conrelid='public.experience_moments'::regclass and contype='c' and pg_get_constraintdef(oid) like '%kind%'"`
(`<projectId>` sale de `.superpowers/supabase-local/bootstrap.json`.)
Expected: `experience_moments_kind_check`. Si el nombre es otro, usarlo abajo.

`supabase/migrations/20261004100100_experience_moment_kinds.sql`. Los cuerpos son copia literal de sus últimas definiciones (`20261002092737_experiences_core.sql` para create/save, `20261002132635_experiences_review_fixes.sql` para el perfil), cambiando solo la validación de tipo:

```sql
-- One source of truth for moment kinds; RPCs used to repeat the literal list.
create function private.is_experience_kind(p_kind text) returns boolean
language sql immutable set search_path='' as $$
  select p_kind in ('concert','show','exhibition','museum','walk','food','festival','sport','nature','other');
$$;
revoke all on function private.is_experience_kind(text) from public;
grant execute on function private.is_experience_kind(text) to anon,authenticated;

alter table public.experience_moments drop constraint experience_moments_kind_check;
alter table public.experience_moments add constraint experience_moments_kind_check
  check (kind in ('concert','show','exhibition','museum','walk','food','festival','sport','nature','other'));

create or replace function public.experience_create(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e uuid; m uuid; member uuid; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  perform private.require_request_quota('experience_write');
  perform private.experience_validate_input(p_input,array['title','state','kind','placeLabel','startsOn','endsOn']);
  if coalesce(p_input->>'state','') not in ('planned','lived') or not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid' using errcode='22023'; end if;
  insert into public.experiences(creator_id,title,state,starts_on,ends_on)
    values(auth.uid(),btrim(p_input->>'title'),p_input->>'state',(p_input->>'startsOn')::date,(p_input->>'endsOn')::date) returning id into e;
  insert into public.experience_moments(experience_id,title,kind,place_label,starts_on,ends_on,position)
    values(e,btrim(p_input->>'title'),p_input->>'kind',nullif(btrim(p_input->>'placeLabel'),''),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,0) returning id into m;
  insert into public.experience_participants(experience_id,user_id,invitation_state) values(e,auth.uid(),'accepted') returning id into member;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state)
    values(e,m,member,case when p_input->>'state'='lived' then 'attended' else 'planned' end);
  return jsonb_build_object('id',e);
end $$;

create or replace function public.experience_save_moment(p_id uuid,p_revision bigint,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m uuid; n integer; begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  perform private.experience_validate_input(p_input,array['id','title','kind','placeLabel','startsOn','endsOn']);
  if not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid kind' using errcode='22023'; end if;
  if p_input ? 'id' then
    begin m:=(p_input->>'id')::uuid; exception when invalid_text_representation then raise exception 'invalid id' using errcode='22023'; end;
    if m is null or not exists(select 1 from public.experience_moments where id=m and experience_id=p_id) then raise exception 'invalid moment' using errcode='22023'; end if;
    update public.experience_moments set title=btrim(p_input->>'title'),kind=p_input->>'kind',place_label=nullif(btrim(p_input->>'placeLabel'),''),starts_on=(p_input->>'startsOn')::date,ends_on=(p_input->>'endsOn')::date,updated_at=now() where id=m;
  else
    select count(*) into n from public.experience_moments where experience_id=p_id;
    if n>=50 then raise exception 'moment limit' using errcode='PT429'; end if;
    insert into public.experience_moments(experience_id,title,kind,place_label,starts_on,ends_on,position)
      values(p_id,btrim(p_input->>'title'),p_input->>'kind',nullif(btrim(p_input->>'placeLabel'),''),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,(select coalesce(max(position),-1)+1 from public.experience_moments where experience_id=p_id)) returning id into m;
    -- Propose attendance only; an account confirms its own attended/skipped state.
    insert into public.experience_moment_participants(experience_id,moment_id,participant_id)
      select p_id,m,id from public.experience_participants where experience_id=p_id and invitation_state='accepted';
    if n>=1 then update public.experiences set shape='trip' where id=p_id; end if;
  end if;
  update public.experiences set revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('id',m,'revision',p_revision+1);
end $$;

create or replace function public.get_profile_experiences(p_user_id uuid,p_state text default 'all',p_kind text default null,p_after_created timestamptz default null,p_after_id uuid default null)
returns setof public.experiences language plpgsql stable security definer set search_path='' as $$
begin
  if p_state is null or p_state not in ('all','planned','lived','cancelled') or (p_kind is not null and not private.is_experience_kind(p_kind)) or ((p_after_created is null)<>(p_after_id is null)) then raise exception 'invalid filters' using errcode='22023'; end if;
  if not public.can_view_profile(p_user_id) or public.users_are_blocked(p_user_id) then return; end if;
  return query select e.* from public.experiences e join public.experience_participants own on own.experience_id=e.id and own.user_id=p_user_id and own.invitation_state='accepted'
    where private.can_view_experience(e.id) and (p_user_id=auth.uid() or (e.audience='profile' and (e.creator_id=p_user_id or (own.share_identity and not exists(select 1 from public.user_blocks b where (b.blocker_id=e.creator_id and b.blocked_id=p_user_id) or (b.blocker_id=p_user_id and b.blocked_id=e.creator_id))))))
      and (p_state='all' or (p_state='lived' and e.state<>'cancelled' and exists(select 1 from public.experience_moment_participants m where m.participant_id=own.id and m.attendance_state='attended')) or (p_state in ('planned','cancelled') and e.state=p_state))
      and (p_kind is null or exists(select 1 from public.experience_moments m where m.experience_id=e.id and m.kind=p_kind))
      and (p_after_created is null or (e.created_at,e.id)<(p_after_created,p_after_id))
    order by e.created_at desc,e.id desc limit 21;
end $$;
```

`create or replace` conserva los ACL existentes. Añadir el fichero al manifiesto.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm run db:local:prepare; npm run test:db:local`
Expected: PASS (todos los tests SQL, incluido `experiences_reviews.sql`).

- [ ] **Paso 5: Comprobar que no queda ninguna lista literal**

Run: `docker exec -i supabase_db_<projectId> psql -U postgres -At -c "select proname from pg_proc where prosrc like '%''museum'',''walk'',''other''%'"`
Expected: sin filas.

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/20261004100100_experience_moment_kinds.sql supabase/tests/experiences_reviews.sql scripts/db/verify.mjs supabase/bootstrap/manifest.json
git commit -m "feat(experiencias): centralizar y ampliar los tipos de momento"
```

---

### Tarea 3: Tabla de reseñas, RLS y RPC de reseña

**Files:**
- Create: `supabase/migrations/20261004100200_experience_reviews_core.sql`
- Modify: `supabase/tests/experiences_reviews.sql`, `supabase/bootstrap/manifest.json`

**Interfaces:**
- Produces (SQL):
  - Tabla `public.experience_moment_reviews(id, experience_id, moment_id, participant_id, author_id, rating, body, share_with_profile, created_at, updated_at)`.
  - `private.can_view_experience_review(p_id uuid) returns boolean`.
  - `public.experience_save_moment_review(p_moment_id uuid, p_rating smallint, p_body text) returns jsonb`. Devuelve `{"id":uuid|null,"experienceId":uuid,"created":bool,"notifyUserIds":uuid[]}`; `id` nulo significa borrada.
  - `public.experience_set_review_sharing(p_review_id uuid, p_enabled boolean) returns jsonb` → `{"experienceId":uuid}`.
  - `public.experience_delete_moment_review(p_review_id uuid) returns jsonb` → `{"experienceId":uuid}`.

- [ ] **Paso 1: Ampliar el test (falla)**

En `supabase/tests/experiences_reviews.sql`, sustituir el `rollback;` final por este bloque seguido de `rollback;`:

```sql
-- Task 3 setup: owner invites member and absent; both accept. The experience is lived.
update xr set id=(select id from public.experience_moments where experience_id=(select id from xr where k='root')) where k='moment';
update xr set id=(public.experience_invite((select id from xr where k='root'),(select id from xr where k='member'))->>'id')::uuid where k='memberrow';
update xr set id=(public.experience_invite((select id from xr where k='root'),(select id from xr where k='absent'))->>'id')::uuid where k='absentrow';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_respond_invitation((select id from xr where k='memberrow'),'accept');
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
select public.experience_respond_invitation((select id from xr where k='absentrow'),'accept');
select public.experience_set_attendance((select id from xr where k='moment'),'skipped');
-- Member without confirmed attendance cannot review.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Genial'); raise exception 'FAIL review without attendance'; exception when insufficient_privilege then null; end;
end $$;
select public.experience_set_attendance((select id from xr where k='moment'),'attended');
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'  Genial  ')->>'id')::uuid where k='review';
do $$ declare r public.experience_moment_reviews; begin
  select * into r from public.experience_moment_reviews where id=(select id from xr where k='review');
  if r.body<>'Genial' or r.rating<>8 or r.share_with_profile then raise exception 'FAIL normalized review'; end if;
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),11::smallint,null); raise exception 'FAIL rating range'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),null,repeat('a',4001)); raise exception 'FAIL body limit'; exception when sqlstate '22023' then null; end;
  -- Upsert keeps one row per person and moment.
  perform public.experience_save_moment_review((select id from xr where k='moment'),9::smallint,'Genial');
  if (select count(*) from public.experience_moment_reviews where moment_id=(select id from xr where k='moment'))<>1 then raise exception 'FAIL upsert duplicated'; end if;
  -- Direct writes are closed.
  begin insert into public.experience_moment_reviews(experience_id,moment_id,participant_id,author_id,rating) values((select id from xr where k='root'),(select id from xr where k='moment'),(select id from xr where k='memberrow'),auth.uid(),5); raise exception 'FAIL direct insert'; exception when insufficient_privilege then null; end;
end $$;
-- Group members read it; outsiders and anon do not without consent.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ begin if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL group read'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_update((select id from xr where k='root'),(select revision from public.experiences where id=(select id from xr where k='root')),'{"title":"[TEST] reviews","state":"lived","shape":"single","audience":"profile"}');
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL outsider read without consent'; end if; end $$;
-- Consent needs both review sharing and the author's share_identity.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),true);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL shared without identity'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_share_identity((select id from xr where k='root'),true);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL consented outsider read'; end if; end $$;
-- Only the author changes sharing or deletes.
do $$ begin
  begin perform public.experience_set_review_sharing((select id from xr where k='review'),false); raise exception 'FAIL foreign sharing'; exception when insufficient_privilege then null; end;
  begin perform public.experience_delete_moment_review((select id from xr where k='review')); raise exception 'FAIL foreign delete'; exception when insufficient_privilege then null; end;
end $$;
-- Hidden, not destroyed, while not lived.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_update((select id from xr where k='root'),(select revision from public.experiences where id=(select id from xr where k='root')),'{"title":"[TEST] reviews","state":"planned","shape":"single","audience":"profile"}');
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL planned shows reviews'; end if; end $$;
reset role;
do $$ begin if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL planned destroyed review'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_update((select id from xr where k='root'),(select revision from public.experiences where id=(select id from xr where k='root')),'{"title":"[TEST] reviews","state":"lived","shape":"single","audience":"profile"}');
-- Guests cannot review; anon has no EXECUTE.
reset role;
do $$ begin
  if has_function_privilege('anon','public.experience_save_moment_review(uuid,smallint,text)','execute') then raise exception 'FAIL anon execute'; end if;
  if exists(select 1 from pg_proc p where p.proname like 'experience%review%' and has_function_privilege('public',p.oid,'execute')) then raise exception 'FAIL public execute'; end if;
end $$;
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm run test:db:local`
Expected: FAIL, `function public.experience_save_moment_review(...) does not exist`.

- [ ] **Paso 3: Escribir la migración (parte de tabla y RPC)**

`supabase/migrations/20261004100200_experience_reviews_core.sql`:

```sql
-- One review per person and moment; it lives on the attendance row it depends on.
create table public.experience_moment_reviews (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  moment_id uuid not null,
  participant_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating between 1 and 10),
  body text check (body=btrim(body) and char_length(body) between 1 and 4000),
  share_with_profile boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rating is not null or body is not null),
  unique (moment_id,participant_id),
  foreign key (moment_id,participant_id) references public.experience_moment_participants(moment_id,participant_id) on delete cascade,
  foreign key (moment_id,experience_id) references public.experience_moments(id,experience_id) on delete cascade,
  foreign key (participant_id,experience_id) references public.experience_participants(id,experience_id) on delete cascade
);
create index experience_moment_reviews_root on public.experience_moment_reviews(experience_id);
create index experience_moment_reviews_author on public.experience_moment_reviews(author_id);
create index experience_moment_reviews_moment_root on public.experience_moment_reviews(moment_id,experience_id);
create index experience_moment_reviews_person_root on public.experience_moment_reviews(participant_id,experience_id);

alter table public.experience_moment_reviews enable row level security;
revoke all on public.experience_moment_reviews from public,anon,authenticated;
grant select on public.experience_moment_reviews to anon,authenticated;
grant all on public.experience_moment_reviews to service_role;

-- Inside the group: every review of a lived memory. Outside: author consent per review
-- plus share_identity and a visible profile, as with photos.
create function private.can_view_experience_review(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experience_moment_reviews r
    join public.experiences e on e.id=r.experience_id
    join public.experience_participants p on p.id=r.participant_id
    where r.id=p_id and e.state='lived'
      and private.moderation_available('experience_review',r.id)
      and private.can_view_experience(e.id)
      and not public.users_are_blocked(r.author_id)
      and (private.can_contribute_experience(e.id)
        or (e.audience='profile' and r.share_with_profile and p.share_identity
          and p.invitation_state='accepted' and public.can_view_profile(r.author_id))));
$$;
revoke all on function private.can_view_experience_review(uuid) from public;
grant execute on function private.can_view_experience_review(uuid) to anon,authenticated;
create policy experience_moment_reviews_read on public.experience_moment_reviews for select
  using(private.can_view_experience_review(id));

-- Defense in depth for any path: a review needs a lived memory, an account and attendance.
create function private.guard_experience_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.experience_moment_participants a
      join public.experience_participants p on p.id=a.participant_id
      join public.experiences e on e.id=a.experience_id
      where a.moment_id=new.moment_id and a.participant_id=new.participant_id and a.experience_id=new.experience_id
        and a.attendance_state='attended' and p.user_id=new.author_id and p.invitation_state='accepted' and e.state='lived')
    then raise exception 'attended lived account required' using errcode='42501'; end if;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function private.guard_experience_review() from public,anon,authenticated;
create trigger experience_moment_reviews_guard before insert or update of rating,body,moment_id,participant_id,author_id
  on public.experience_moment_reviews for each row execute function private.guard_experience_review();

-- Attendance cannot leave a review orphaned; the attendance RPC deletes first when asked.
create function private.guard_reviewed_attendance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.attendance_state='attended' and new.attendance_state<>'attended' and exists(
    select 1 from public.experience_moment_reviews r where r.moment_id=old.moment_id and r.participant_id=old.participant_id)
    then raise exception 'review exists' using errcode='PT409'; end if;
  return new;
end $$;
revoke all on function private.guard_reviewed_attendance() from public,anon,authenticated;
create trigger experience_attendance_review_guard before update of attendance_state on public.experience_moment_participants
  for each row execute function private.guard_reviewed_attendance();

create function public.experience_save_moment_review(p_moment_id uuid,p_rating smallint,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare root uuid; person uuid; body text:=nullif(btrim(coalesce(p_body,'')),''); existing uuid; saved uuid; recipients uuid[];
begin
  select experience_id into root from public.experience_moments where id=p_moment_id;
  if root is null then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(root);
  if not private.can_contribute_experience(root) then raise exception 'member required' using errcode='42501'; end if;
  if p_rating is not null and p_rating not between 1 and 10 then raise exception 'invalid rating' using errcode='22023'; end if;
  if char_length(body)>4000 then raise exception 'invalid body' using errcode='22023'; end if;
  select p.id into person from public.experience_participants p
    join public.experience_moment_participants a on a.participant_id=p.id and a.moment_id=p_moment_id and a.attendance_state='attended'
    join public.experiences e on e.id=p.experience_id and e.state='lived'
    where p.experience_id=root and p.user_id=auth.uid() and p.invitation_state='accepted';
  if person is null then raise exception 'attended lived member required' using errcode='42501'; end if;
  select id into existing from public.experience_moment_reviews where moment_id=p_moment_id and participant_id=person;
  if p_rating is null and body is null then
    delete from public.experience_moment_reviews where id=existing;
    return jsonb_build_object('id',null,'experienceId',root,'created',false,'notifyUserIds','[]'::jsonb);
  end if;
  insert into public.experience_moment_reviews(experience_id,moment_id,participant_id,author_id,rating,body)
    values(root,p_moment_id,person,auth.uid(),p_rating,body)
    on conflict(moment_id,participant_id) do update set rating=excluded.rating,body=excluded.body
    returning id into saved;
  if existing is null then
    select coalesce(array_agg(p.user_id),'{}') into recipients from public.experience_participants p
      where p.experience_id=root and p.invitation_state='accepted' and p.user_id is not null
        and p.user_id<>auth.uid() and not public.users_are_blocked(p.user_id);
  end if;
  return jsonb_build_object('id',saved,'experienceId',root,'created',existing is null,'notifyUserIds',to_jsonb(coalesce(recipients,'{}')));
end $$;

create function public.experience_set_review_sharing(p_review_id uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if r.author_id<>auth.uid() or p_enabled is null then raise exception 'author required' using errcode='42501'; end if;
  update public.experience_moment_reviews set share_with_profile=p_enabled,updated_at=now() where id=p_review_id;
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

create function public.experience_delete_moment_review(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if r.author_id<>auth.uid() then raise exception 'author required' using errcode='42501'; end if;
  delete from public.experience_moment_reviews where id=p_review_id;
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

revoke all on function public.experience_save_moment_review(uuid,smallint,text),
  public.experience_set_review_sharing(uuid,boolean),public.experience_delete_moment_review(uuid) from public,anon;
grant execute on function public.experience_save_moment_review(uuid,smallint,text),
  public.experience_set_review_sharing(uuid,boolean),public.experience_delete_moment_review(uuid) to authenticated;
```

Nota: el trigger `guard_experience_review` no se dispara en `update of share_with_profile`, a propósito: retirar el consentimiento tiene que funcionar aunque la experiencia ya no esté como `lived`.

Añadir la migración al manifiesto.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm run db:local:prepare; npm run test:db:local`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/20261004100200_experience_reviews_core.sql supabase/tests/experiences_reviews.sql supabase/bootstrap/manifest.json
git commit -m "feat(experiencias): tabla de reseñas por momento con RLS y RPC"
```

---

### Tarea 4: Asistencia, media y hub ordenado (SQL)

**Files:**
- Modify: `supabase/migrations/20261004100200_experience_reviews_core.sql` (añadir al final; aún no ha salido de local)
- Modify: `supabase/tests/experiences_reviews.sql`

**Interfaces:**
- Produces:
  - `public.experience_set_attendance(p_moment_id uuid, p_state text, p_drop_reviews boolean default false) returns jsonb`. **Sustituye** la de dos argumentos; se borra la vieja para no dejar una sobrecarga ambigua.
  - `public.get_experience_rating_summaries(p_ids uuid[]) returns table(experience_id uuid, moment_id uuid, avg_rating numeric, rating_count integer)`. `moment_id` nulo = fila de la experiencia. `SECURITY INVOKER`.
  - `public.get_own_experiences_ranked(p_state text default 'all', p_kind text default null, p_companion uuid default null, p_offset integer default 0) returns setof public.experiences`. `SECURITY INVOKER`, 21 filas como máximo.

- [ ] **Paso 1: Ampliar el test (falla)**

Antes del `rollback;` final:

```sql
-- Task 4: attendance change with a review is a conflict unless reviews are dropped.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_set_attendance((select id from xr where k='moment'),'skipped'); raise exception 'FAIL orphan review'; exception when sqlstate 'PT409' then null; end;
end $$;
-- Rating summary only counts what the caller can see.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ declare s record; begin
  select * into s from public.get_experience_rating_summaries(array[(select id from xr where k='root')]) where moment_id is null;
  if s.avg_rating<>9.0 or s.rating_count<>1 then raise exception 'FAIL group summary %',s; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin
  if exists(select 1 from public.get_experience_rating_summaries(array[(select id from xr where k='root')])) then raise exception 'FAIL summary leaks private rating'; end if;
end $$;
-- Ranked hub: own accepted experiences only, rated first.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  if (select id from public.get_own_experiences_ranked('all',null,null,0) limit 1)<>(select id from xr where k='root') then raise exception 'FAIL ranked hub'; end if;
  begin perform public.get_own_experiences_ranked('all','karaoke',null,0); raise exception 'FAIL ranked kind'; exception when sqlstate '22023' then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.get_own_experiences_ranked('all',null,null,0)) then raise exception 'FAIL ranked foreign'; end if; end $$;
-- Dropping deletes the review in the same transaction.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_attendance((select id from xr where k='moment'),'skipped',true);
reset role;
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL drop reviews'; end if; end $$;
do $$ begin if exists(select 1 from pg_proc where proname='experience_set_attendance' and pronargs=2) then raise exception 'FAIL ambiguous overload'; end if; end $$;
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm run test:db:local`
Expected: FAIL, `function public.get_experience_rating_summaries(uuid[]) does not exist` (o un error de sobrecarga en `experience_set_attendance(...,true)`).

- [ ] **Paso 3: Añadir al final de la migración core**

```sql
drop function public.experience_set_attendance(uuid,text);
create function public.experience_set_attendance(p_moment_id uuid,p_state text,p_drop_reviews boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare root uuid; person uuid;
begin
  select experience_id into root from public.experience_moments where id=p_moment_id;
  perform private.experience_lock(root);
  if not private.can_contribute_experience(root) then raise exception 'member required' using errcode='42501'; end if;
  select id into person from public.experience_participants where experience_id=root and user_id=auth.uid() and invitation_state='accepted';
  if person is null then raise exception 'member required' using errcode='42501'; end if;
  if p_state is null or p_state not in ('planned','attended','skipped') then raise exception 'invalid attendance' using errcode='22023'; end if;
  -- The trigger rejects orphaning a review; only an explicit confirmation removes it first.
  if p_state<>'attended' and coalesce(p_drop_reviews,false) then
    delete from public.experience_moment_reviews where moment_id=p_moment_id and participant_id=person;
  end if;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state) values(root,p_moment_id,person,p_state)
    on conflict(moment_id,participant_id) do update set attendance_state=excluded.attendance_state;
  return jsonb_build_object('experienceId',root);
end $$;
revoke all on function public.experience_set_attendance(uuid,text,boolean) from public,anon;
grant execute on function public.experience_set_attendance(uuid,text,boolean) to authenticated;

-- Invoker on purpose: the average is over the rows the caller can read (decisiones.md).
create function public.get_experience_rating_summaries(p_ids uuid[])
returns table(experience_id uuid,moment_id uuid,avg_rating numeric,rating_count integer)
language sql stable security invoker set search_path='' as $$
  select r.experience_id,r.moment_id,round(avg(r.rating)::numeric,1),count(r.rating)::integer
  from public.experience_moment_reviews r
  where r.experience_id=any(p_ids[1:100]) and r.rating is not null
  group by grouping sets((r.experience_id),(r.experience_id,r.moment_id));
$$;
revoke all on function public.get_experience_rating_summaries(uuid[]) from public;
grant execute on function public.get_experience_rating_summaries(uuid[]) to anon,authenticated;

create function public.get_own_experiences_ranked(p_state text default 'all',p_kind text default null,p_companion uuid default null,p_offset integer default 0)
returns setof public.experiences language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then return; end if;
  if p_state is null or p_state not in ('all','planned','lived','cancelled') or (p_kind is not null and not private.is_experience_kind(p_kind))
    or p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'invalid filters' using errcode='22023'; end if;
  return query select e.* from public.experiences e
    join public.experience_participants own on own.experience_id=e.id and own.user_id=auth.uid() and own.invitation_state='accepted'
    left join lateral (select avg(r.rating) a from public.experience_moment_reviews r where r.experience_id=e.id and r.rating is not null) s on true
    where (p_state='all' or (p_state='lived' and e.state<>'cancelled' and exists(select 1 from public.experience_moment_participants m where m.participant_id=own.id and m.attendance_state='attended'))
        or (p_state in ('planned','cancelled') and e.state=p_state))
      and (p_kind is null or exists(select 1 from public.experience_moments m where m.experience_id=e.id and m.kind=p_kind))
      and (p_companion is null or exists(select 1 from public.experience_participants c where c.experience_id=e.id and (c.user_id=p_companion or c.id=p_companion)))
    order by s.a desc nulls last,e.created_at desc,e.id desc limit 21 offset p_offset;
end $$;
revoke all on function public.get_own_experiences_ranked(text,text,uuid,integer) from public,anon;
grant execute on function public.get_own_experiences_ranked(text,text,uuid,integer) to authenticated;
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm run db:local:prepare; npm run test:db:local`
Expected: PASS, incluidos los SQL de experiencias anteriores (`experiences_participation.sql` llama a `experience_set_attendance` con dos argumentos; el `default` lo resuelve).

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/20261004100200_experience_reviews_core.sql supabase/tests/experiences_reviews.sql
git commit -m "feat(experiencias): asistencia protege reseñas, media visible y hub ordenado"
```

---

### Tarea 5: Publicación social de reseñas (SQL)

**Files:**
- Create: `supabase/migrations/20261004100300_experience_reviews_social.sql`
- Modify: `supabase/tests/experiences_reviews.sql`, `supabase/bootstrap/manifest.json`

**Interfaces:**
- Produces:
  - `public.experience_publish_review(p_review_id uuid) returns jsonb` → `{"id":postId,"experienceId","reviewId","actorId","targetId","created"}`.
  - `public.experience_unpublish_review(p_review_id uuid) returns jsonb` → `{"experienceId"}`.
  - `public.get_experience_review_publications(p_ids uuid[]) returns table(review_id uuid, post_id uuid)`: solo devuelve las del autor.
  - Posts `kind='experience_review'`, `anchor_type='experience'`, `source_kind='experience_review'`, `source_id=review.id`, `body` nulo.

- [ ] **Paso 1: Obtener las definiciones vigentes a ampliar**

Run (bootstrap local):
```bash
docker exec -i supabase_db_<projectId> psql -U postgres -At -c "select pg_get_functiondef('public.can_view_target(public.target_kind,uuid)'::regprocedure)" > "$TMP/can_view_target.sql"
docker exec -i supabase_db_<projectId> psql -U postgres -At -c "select conname||': '||pg_get_constraintdef(oid) from pg_constraint where conrelid='public.posts'::regclass and contype='c'"
```
Expected: la definición de `can_view_target` (la última es la de `20261003153110`) y la lista de CHECK de `posts`. Si algún CHECK ata `source_kind` a ciertos `kind`, la migración tiene que reemplazarlo admitiendo `('experience_review','experience_review')`. Copiar su texto exacto y añadir solo esa rama.

- [ ] **Paso 2: Ampliar el test (falla)**

Antes del `rollback;` final:

```sql
-- Task 5: publication needs consent + profile audience; one post; revoked with consent.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_attendance((select id from xr where k='moment'),'attended');
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),7::smallint,'Otra vez')->>'id')::uuid where k='review';
do $$ begin
  begin perform public.experience_publish_review((select id from xr where k='review')); raise exception 'FAIL publish without consent'; exception when insufficient_privilege then null; end;
end $$;
select public.experience_set_review_sharing((select id from xr where k='review'),true);
update xr set id=(public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid where k='post';
do $$ begin
  if (public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid<>(select id from xr where k='post') then raise exception 'FAIL duplicate post'; end if;
  begin insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id) values(auth.uid(),'experience_review','experience',(select id from xr where k='root'),'experience_review',(select id from xr where k='review')); raise exception 'FAIL REST post'; exception when insufficient_privilege or check_violation or unique_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if not exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL outsider sees published review'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
reset role;
do $$ begin if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL consent revoke keeps post'; end if; end $$;
-- Deleting the review deletes its post too.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),true);
update xr set id=(public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid where k='post';
select public.experience_delete_moment_review((select id from xr where k='review'));
reset role;
do $$ begin if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL review delete keeps post'; end if; end $$;
```

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npm run test:db:local`
Expected: FAIL, `function public.experience_publish_review(uuid) does not exist`.

- [ ] **Paso 4: Escribir la migración**

`supabase/migrations/20261004100300_experience_reviews_social.sql`:

```sql
create unique index posts_one_experience_review on public.posts(source_id) where kind='experience_review';

-- Review posts are anchored to the memory and sourced from the review; only the RPC creates them.
create or replace function private.guard_experience_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='experience_review' then
    if tg_op='INSERT' and not exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'publication RPC required' using errcode='42501'; end if;
    if new.anchor_type<>'experience' or new.source_kind is distinct from 'experience_review' or new.source_id is null
      or not exists(select 1 from public.experience_moment_reviews r join public.experiences e on e.id=r.experience_id
        where r.id=new.source_id and r.author_id=new.author_id and r.experience_id=new.anchor_id and r.share_with_profile
          and e.audience='profile' and e.state='lived' and private.moderation_available('experience_review',r.id))
      then raise exception 'invalid experience review publication' using errcode='23514'; end if;
    return new;
  end if;
  if new.kind='experience' or new.anchor_type='experience' then
    if tg_op='INSERT' and not exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'publication RPC required' using errcode='42501'; end if;
    if new.kind<>'experience' or new.anchor_type<>'experience' or new.source_kind is not null or new.source_id is not null
      or not exists(select 1 from public.experiences e where e.id=new.anchor_id and e.creator_id=new.author_id and e.audience='profile' and private.moderation_available('experience',e.id))
      then raise exception 'invalid experience publication' using errcode='23514'; end if;
    if exists(select 1 from private.moderation_history h where h.kind='post' and h.action='delete' and h.snapshot->>'anchor_type'='experience' and h.snapshot->>'anchor_id'=new.anchor_id::text)
      then raise exception 'publication unavailable' using errcode='42501'; end if;
  end if;
  return new;
end $$;

drop policy posts_experience_visible on public.posts;
create policy posts_experience_visible on public.posts as restrictive for select to anon,authenticated using(
  anchor_type<>'experience' or (exists(select 1 from public.experiences e where e.id=anchor_id and e.audience='profile' and private.can_view_experience(e.id))
    and (kind<>'experience_review' or private.can_view_experience_review(source_id))));
```

Debajo, pegar la definición de `can_view_target` obtenida en el Paso 1 como `create or replace`, sustituyendo **solo** la rama `when 'post'` por:

```sql
    when 'post' then exists(select 1 from public.posts p where p.id=p_target_id and public.can_view_profile(p.author_id) and not public.users_are_blocked(p.author_id)
      and (p.anchor_type<>'experience' or (exists(select 1 from public.experiences e where e.id=p.anchor_id and e.audience='profile' and private.can_view_experience(e.id))
        and (p.kind<>'experience_review' or private.can_view_experience_review(p.source_id)))))
```

Y a continuación:

```sql
create function public.experience_publish_review(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews; post uuid; target uuid; created boolean:=false;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if r.author_id<>auth.uid() or not r.share_with_profile or not exists(select 1 from public.experiences e where e.id=r.experience_id and e.audience='profile' and e.state='lived')
    then raise exception 'shared review required' using errcode='42501'; end if;
  select id into post from public.posts where kind='experience_review' and source_id=p_review_id;
  if post is not null and not private.moderation_available('post',post) then raise exception 'publication unavailable' using errcode='42501'; end if;
  if post is null then
    insert into private.moderation_operations values(txid_current()) on conflict do nothing;
    insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id)
      values(auth.uid(),'experience_review','experience',r.experience_id,'experience_review',p_review_id) returning id into post;
    delete from private.moderation_operations where transaction_id=txid_current();
    created:=true;
  end if;
  select id into target from public.interaction_targets where kind='post' and source_id=post;
  return jsonb_build_object('id',post,'experienceId',r.experience_id,'reviewId',p_review_id,'actorId',auth.uid(),'targetId',target,'created',created);
end $$;

create function public.experience_unpublish_review(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if r.author_id<>auth.uid() then raise exception 'author required' using errcode='42501'; end if;
  delete from public.posts where kind='experience_review' and source_id=p_review_id;
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

create function public.get_experience_review_publications(p_ids uuid[]) returns table(review_id uuid,post_id uuid)
language sql stable security definer set search_path='' as $$
  select p.source_id,p.id from public.posts p join public.experience_moment_reviews r on r.id=p.source_id
  where p.kind='experience_review' and p.source_id=any(p_ids[1:200]) and r.author_id=auth.uid();
$$;

revoke all on function public.experience_publish_review(uuid),public.experience_unpublish_review(uuid),public.get_experience_review_publications(uuid[]) from public,anon;
grant execute on function public.experience_publish_review(uuid),public.experience_unpublish_review(uuid),public.get_experience_review_publications(uuid[]) to authenticated;

-- Consent withdrawal or deletion removes the publication with it.
create function private.cleanup_experience_review_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or (old.share_with_profile and not new.share_with_profile) then
    delete from public.posts where kind='experience_review' and source_id=old.id;
  end if;
  return null;
end $$;
revoke all on function private.cleanup_experience_review_post() from public,anon,authenticated;
create trigger experience_review_cleanup_post after delete or update of share_with_profile on public.experience_moment_reviews
  for each row execute function private.cleanup_experience_review_post();
```

Añadir la migración al manifiesto.

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npm run db:local:prepare; npm run test:db:local`
Expected: PASS, incluido `experiences_social.sql`, que comprueba que el guard de los posts `experience` sigue intacto.

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/20261004100300_experience_reviews_social.sql supabase/tests/experiences_reviews.sql supabase/bootstrap/manifest.json
git commit -m "feat(experiencias): publicar reseñas en actividad con revocación"
```

---

### Tarea 6: Moderación de reseñas (SQL)

**Files:**
- Create: `supabase/migrations/20261004100400_experience_reviews_moderation.sql`
- Modify: `supabase/tests/experiences_reviews.sql`, `supabase/bootstrap/manifest.json`

**Interfaces:**
- Produces: kind de moderación `experience_review` (tabla `experience_moment_reviews`, autor `author_id`) y `public.experience_report_review(p_review_id uuid, p_reason text, p_details text default null) returns jsonb` → `{"id":reportId,"experienceId"}`.

- [ ] **Paso 1: Volcar las definiciones vigentes a ampliar**

Run, una por función, guardando cada una en `$TMP`:
```bash
for f in "private.moderation_available(text,uuid)" "private.admin_moderation_list(text,text,text,integer)" "private.moderation_row_available(text,jsonb)" "private.admin_moderate_content(text,uuid,text,text,text)" "private.capture_moderation_deletion()" "private.prepare_content_report()" "private.social_target_owner_id(public.target_kind,uuid)" "public.can_view_target(public.target_kind,uuid)"; do docker exec -i supabase_db_<projectId> psql -U postgres -At -c "select pg_get_functiondef('$f'::regprocedure)"; done
```
Expected: ocho definiciones. `can_view_target` ya incluye la rama `post` de la Tarea 5.

- [ ] **Paso 2: Ampliar el test (falla)**

Antes del `rollback;` final:

```sql
-- Task 6: reports need current access; removal hides the review and its post.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),6::smallint,'Reportable')->>'id')::uuid where k='review';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin
  begin perform public.experience_report_review((select id from xr where k='review'),'spam'); raise exception 'FAIL report without access'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ declare rep uuid; begin
  rep:=(public.experience_report_review((select id from xr where k='review'),'spam')->>'id')::uuid;
  if rep is null then raise exception 'FAIL group report'; end if;
end $$;
reset role;
insert into private.moderation_state(kind,target_id,removed_at) values('experience_review',(select id from xr where k='review'),now());
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL removed review visible'; end if; end $$;
```

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npm run test:db:local`
Expected: FAIL, `function public.experience_report_review(...) does not exist`.

- [ ] **Paso 4: Escribir la migración**

`supabase/migrations/20261004100400_experience_reviews_moderation.sql`: primero el CHECK y luego cada definición volcada en el Paso 1, como `create or replace`, con **solo** estas ramas añadidas:

```sql
alter table private.moderation_state drop constraint moderation_state_kind_check;
alter table private.moderation_state add constraint moderation_state_kind_check
  check(kind in ('club','post','club_post','comment','experience','experience_review'));
```

| Función | Cambio exacto |
|---|---|
| `private.moderation_available` | Antes de `elsif p_kind='club_post'`: `elsif p_kind='experience_review' then return coalesce((select private.moderation_available('experience',r.experience_id) from public.experience_moment_reviews r where r.id=p_id),true);` |
| `private.admin_moderation_list` | En el `case p_kind` de `tbl`: `when 'experience_review' then 'experience_moment_reviews'`. `field` sigue siendo `author_id` (rama `else`). |
| `private.moderation_row_available` | En el `case p_table`: `when 'experience_moment_reviews' then 'experience_review'`. |
| `private.admin_moderate_content` | En el `case p_kind` de `tbl`: `when 'experience_review' then 'experience_moment_reviews'`. |
| `private.capture_moderation_deletion` | En el `case tg_table_name`: `when 'experience_moment_reviews' then 'experience_review'` (hoy cae en `else 'comment'`, que sería un error). |
| `private.prepare_content_report` | Nueva rama: `when 'experience_review' then select r.author_id, jsonb_build_object('rating',r.rating,'body',r.body,'experience_id',r.experience_id,'moment_id',r.moment_id,'created_at',r.created_at) into v_reported_user_id, v_snapshot from public.experience_moment_reviews r where r.id = new.target_id;` |
| `private.social_target_owner_id` | `when 'experience_review' then (select author_id from public.experience_moment_reviews where id=p_target_id)` |
| `public.can_view_target` | `when 'experience_review' then private.can_view_experience_review(p_target_id)` |

Después, en la misma migración:

```sql
create trigger moderation_capture_delete before delete on public.experience_moment_reviews for each row execute function private.capture_moderation_deletion();

create function public.experience_report_review(p_review_id uuid,p_reason text,p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews; report uuid;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if not private.can_view_experience_review(p_review_id) or r.author_id=auth.uid() then raise exception 'visible target required' using errcode='42501'; end if;
  if p_reason is null or p_reason not in ('spam','harassment','spoiler','hate','other') or char_length(coalesce(p_details,''))>2000 then raise exception 'invalid report' using errcode='22023'; end if;
  insert into public.content_reports(reporter_id,target_type,target_id,reason,details)
    values(auth.uid(),'experience_review',p_review_id,p_reason::public.content_report_reason,nullif(btrim(p_details),'')) returning id into report;
  return jsonb_build_object('id',report,'experienceId',r.experience_id);
end $$;
revoke all on function public.experience_report_review(uuid,text,text) from public,anon;
grant execute on function public.experience_report_review(uuid,text,text) to authenticated;
```

Añadir la migración al manifiesto.

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npm run db:local:prepare; npm run test:db:local`
Expected: PASS, incluido `admin_content_moderation.sql`.

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/20261004100400_experience_reviews_moderation.sql supabase/tests/experiences_reviews.sql supabase/bootstrap/manifest.json
git commit -m "feat(experiencias): denunciar y moderar reseñas de momento"
```

---

### Tarea 7: Tipos generados y contratos TS

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (regenerado)
- Modify: `src/lib/experiences/types.ts`, `src/lib/experiences/validation.ts`, `src/lib/experiences/validation.test.ts`
- Modify: `src/lib/social/post-kinds.ts`, `src/lib/social/notify-categories.ts`, `src/lib/social/notification-types.ts`, `src/lib/moderation/contracts.ts`

**Interfaces:**
- Produces (TS):
```ts
export const MOMENT_KINDS = ["concert","show","exhibition","museum","walk","food","festival","sport","nature","other"] as const;
export const EXPERIENCE_LIMITS = { ...existing, reviewBody: 4000 } as const;
export interface ExperienceRating { avg: number; count: number }
export interface ExperienceReview { id:string; momentId:string; authorId:string; authorName:string|null; authorUsername:string|null; authorAvatarUrl:string|null; rating:number|null; body:string|null; shareWithProfile:boolean; isAuthor:boolean; publicationId:string|null; createdAt:string; updatedAt:string }
export interface SaveReviewInput { rating:number|null; body:string|null }
// ExperiencePreview gains: rating: ExperienceRating|null; momentRatings: Record<string, ExperienceRating>
// ExperienceDetail gains: reviews: ExperienceReview[]
// ExperienceFilters gains: sort?: "recent"|"rating"; offset?: number
export function validateReview(input: unknown): SaveReviewInput | null;
```

- [ ] **Paso 1: Regenerar tipos**

Run: `npx supabase gen types typescript --db-url "postgresql://postgres:postgres@127.0.0.1:<dbPort>/postgres" --schema public > src/lib/supabase/database.types.ts`
(`<dbPort>` sale de `.superpowers/supabase-local/bootstrap.json`. Si ese JSON trae otro comando de generación, usar ese.)
Expected: el diff añade `experience_moment_reviews`, las RPC nuevas y los valores de enum. Comprobar que `Constants` conserva `club_post_kind` (#1322).

- [ ] **Paso 2: Escribir el test de validación que falla**

Añadir a `src/lib/experiences/validation.test.ts`:

```ts
import { validateReview } from "./validation";
describe("validateReview", () => {
  it("accepts rating, body or both, trimming body", () => {
    expect(validateReview({ rating: 8, body: null })).toEqual({ rating: 8, body: null });
    expect(validateReview({ rating: null, body: "  Bien  " })).toEqual({ rating: null, body: "Bien" });
    expect(validateReview({ rating: 10, body: "x" })).toEqual({ rating: 10, body: "x" });
  });
  it("treats empty as clear and rejects out-of-range or malformed", () => {
    expect(validateReview({ rating: null, body: "   " })).toEqual({ rating: null, body: null });
    expect(validateReview({ rating: 0, body: null })).toBeNull();
    expect(validateReview({ rating: 11, body: null })).toBeNull();
    expect(validateReview({ rating: 7.5, body: null })).toBeNull();
    expect(validateReview({ rating: null, body: "a".repeat(4001) })).toBeNull();
    expect(validateReview({ rating: 5, body: null, author: "x" })).toBeNull();
  });
});
```

(Si el fichero no importa `describe`, añadirlo al `import {…} from "vitest"` existente.)

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/experiences/validation.test.ts`
Expected: FAIL, `validateReview is not a function`.

- [ ] **Paso 4: Implementar**

En `src/lib/experiences/types.ts`: sustituir `MOMENT_KINDS` y `EXPERIENCE_LIMITS` por las versiones de **Interfaces**, añadir las interfaces nuevas y ampliar:

```ts
export interface ExperiencePreview {
  // …campos existentes…
  rating: ExperienceRating | null;
  momentRatings: Record<string, ExperienceRating>;
}
export interface ExperienceDetail extends ExperiencePreview {
  // …campos existentes…
  reviews: ExperienceReview[];
}
export interface ExperienceFilters {
  state?: ExperienceState | "all";
  kind?: MomentKind;
  companion?: string;
  cursor?: string;
  sort?: "recent" | "rating";
  offset?: number;
}
```

En `src/lib/experiences/validation.ts`, añadir:

```ts
export function validateReview(input: unknown): SaveReviewInput | null {
  const value = record(input);
  if (!value || !allowed(value, ["rating", "body"])) return null;
  const rating = value.rating === null || value.rating === undefined ? null : value.rating;
  if (rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 10)) return null;
  const body = text(value.body, EXPERIENCE_LIMITS.reviewBody);
  if (body === undefined) return null;
  return { rating: rating as number | null, body };
}
```

(Importar `SaveReviewInput` desde `./types` en el import existente.)

En `src/lib/social/post-kinds.ts`, añadir `"experience_review"` a la lista (después de `"experience"`).

En `src/lib/social/notification-types.ts`, añadir `| "experience_reviewed"` tras `"followed_experience"`.

En `src/lib/social/notify-categories.ts`:

```ts
  experience: "milestone",
  experience_review: "milestone",
```
y
```ts
  experience: "followed_experience",
  // Review posts do not notify followers (only the group, via experience_reviewed);
  // the Record still needs a type so a new kind cannot be forgotten.
  experience_review: "experience_reviewed",
```

En `src/lib/moderation/contracts.ts`:

```ts
export const CONTENT_KINDS = ["post", "club_post", "comment", "club", "experience", "experience_review"] as const;
```

- [ ] **Paso 5: Typecheck y tests**

Run: `npx tsc --noEmit; npx vitest run src/lib/experiences src/lib/social src/lib/moderation`
Expected: tsc sale con 0 errores salvo los de `queries.ts`/`feed.ts`/componentes que crean `ExperiencePreview` sin `rating`/`momentRatings` o `ExperienceDetail` sin `reviews`. **Arreglarlos aquí** con `rating:null,momentRatings:{}` y `reviews:[]` como valor provisional (la Tarea 9 los rellena), y añadir los textos de copy que pidan los `Record` de notificación/push (buscar con `rg "followed_experience" src messages`; en cada mapa poner `experience_reviewed` junto a `followed_experience`). Vitest en PASS.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/experiences src/lib/social src/lib/moderation messages/es.json
git commit -m "feat(experiencias): contratos TS de reseñas y tipos de momento"
```

---

### Tarea 8: Server actions de reseña

**Files:**
- Create: `src/lib/experiences/review-actions.ts`, `src/lib/experiences/review-actions.test.ts`
- Modify: `src/lib/experiences/participant-actions.ts`, `src/lib/experiences/participant-actions.test.ts`, `src/lib/experiences/report-actions.ts`

**Interfaces:**
- Consumes: RPC de las tareas 3–6; `experienceMutation`, `experienceSqlError`; `notify` y `notifyFollowersOfPost` no (las reseñas no avisan a seguidores).
- Produces:
```ts
saveMomentReview(momentId: string, input: SaveReviewInput): Promise<ExperienceResult<{ id: string | null }>>
setReviewSharing(reviewId: string, enabled: boolean): Promise<ExperienceResult<null>>
deleteMomentReview(reviewId: string): Promise<ExperienceResult<null>>
publishReview(reviewId: string): Promise<ExperienceResult<{ id: string }>>
unpublishReview(reviewId: string): Promise<ExperienceResult<null>>
reportReview(reviewId: string, reason: string, details: string): Promise<ExperienceResult<null>>   // en report-actions.ts
setMomentAttendance(id: string, state: AttendanceState, dropReviews?: boolean)                     // firma ampliada
```

- [ ] **Paso 1: Escribir los tests que fallan**

`src/lib/experiences/review-actions.test.ts`:

```ts
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),revalidate:vi.fn(),notify:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:m.getUser},rpc:m.rpc})}));
vi.mock("@/lib/reactivity/revalidate",()=>({revalidateExperiences:m.revalidate}));
vi.mock("@/lib/social/notifications",()=>({notify:m.notify}));
import {saveMomentReview,setReviewSharing,deleteMomentReview,publishReview,unpublishReview} from "./review-actions";
const root="de9eb8c7-08f5-464d-8c5b-76f5b58bfce4",moment="de9eb8c7-08f5-464d-8c5b-76f5b58bfce5",review="de9eb8c7-08f5-464d-8c5b-76f5b58bfce6",friend="de9eb8c7-08f5-464d-8c5b-76f5b58bfce7",me="de9eb8c7-08f5-464d-8c5b-76f5b58bfce8";
beforeEach(()=>{vi.clearAllMocks();m.getUser.mockResolvedValue({data:{user:{id:me}}});m.rpc.mockResolvedValue({data:{id:review,experienceId:root,created:false,notifyUserIds:[]},error:null});});
it("requires a session",async()=>{m.getUser.mockResolvedValue({data:{user:null}});expect(await saveMomentReview(moment,{rating:8,body:null})).toEqual({ok:false,error:"unauthenticated"});expect(m.rpc).not.toHaveBeenCalled();});
it("validates before calling SQL",async()=>{
  expect(await saveMomentReview("bad",{rating:8,body:null})).toEqual({ok:false,error:"invalid"});
  expect(await saveMomentReview(moment,{rating:11,body:null})).toEqual({ok:false,error:"invalid"});
  expect(await setReviewSharing(review,"yes" as never)).toEqual({ok:false,error:"invalid"});
  expect(m.rpc).not.toHaveBeenCalled();
});
it("saves normalized input and invalidates the root",async()=>{
  expect(await saveMomentReview(moment,{rating:8,body:"  Bien "})).toEqual({ok:true,data:{id:review}});
  expect(m.rpc).toHaveBeenCalledWith("experience_save_moment_review",{p_moment_id:moment,p_rating:8,p_body:"Bien"});
  expect(m.revalidate).toHaveBeenCalledWith(root);
});
it("notifies the group once, only on creation, without the review text",async()=>{
  m.rpc.mockResolvedValue({data:{id:review,experienceId:root,created:true,notifyUserIds:[friend]},error:null});
  await saveMomentReview(moment,{rating:8,body:"secreto"});
  expect(m.notify).toHaveBeenCalledTimes(1);
  expect(m.notify).toHaveBeenCalledWith(expect.anything(),{userId:friend,actorId:me,type:"experience_reviewed",targetType:"experience",targetId:root,dedupeKey:`experience_reviewed:${review}`,context:undefined});
});
it("maps SQL errors and does not notify on failure",async()=>{
  m.rpc.mockResolvedValue({data:null,error:{code:"42501"}});
  expect(await saveMomentReview(moment,{rating:8,body:null})).toEqual({ok:false,error:"forbidden"});
  expect(m.notify).not.toHaveBeenCalled();
});
it("sharing, deletion and publication go through author-only RPCs",async()=>{
  m.rpc.mockResolvedValue({data:{experienceId:root},error:null});
  expect(await setReviewSharing(review,true)).toEqual({ok:true,data:null});
  expect(m.rpc).toHaveBeenLastCalledWith("experience_set_review_sharing",{p_review_id:review,p_enabled:true});
  expect(await deleteMomentReview(review)).toEqual({ok:true,data:null});
  expect(m.rpc).toHaveBeenLastCalledWith("experience_delete_moment_review",{p_review_id:review});
  m.rpc.mockResolvedValue({data:{id:friend,experienceId:root,created:true},error:null});
  expect(await publishReview(review)).toEqual({ok:true,data:{id:friend}});
  m.rpc.mockResolvedValue({data:{experienceId:root},error:null});
  expect(await unpublishReview(review)).toEqual({ok:true,data:null});
  expect(m.rpc).toHaveBeenLastCalledWith("experience_unpublish_review",{p_review_id:review});
});
```

Añadir a `src/lib/experiences/participant-actions.test.ts`:

```ts
it("only drops reviews when asked explicitly",async()=>{
  await setMomentAttendance(person,"skipped");
  expect(mocks.rpc).toHaveBeenLastCalledWith("experience_set_attendance",{p_moment_id:person,p_state:"skipped",p_drop_reviews:false});
  await setMomentAttendance(person,"skipped",true);
  expect(mocks.rpc).toHaveBeenLastCalledWith("experience_set_attendance",{p_moment_id:person,p_state:"skipped",p_drop_reviews:true});
});
```

Y en ese mismo fichero, actualizar la expectativa existente `{p_moment_id:person,p_state:"skipped"}` a `{p_moment_id:person,p_state:"skipped",p_drop_reviews:false}`.

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/experiences/review-actions.test.ts src/lib/experiences/participant-actions.test.ts`
Expected: FAIL, `Cannot find module './review-actions'` y la expectativa de `p_drop_reviews`.

- [ ] **Paso 3: Implementar**

`src/lib/experiences/review-actions.ts`:

```ts
"use server";
import {notify} from "@/lib/social/notifications";
import type {ExperienceResult,SaveReviewInput} from "./types";
import {experienceMutation} from "./mutation";
import {isExperienceId,validateReview} from "./validation";
type Saved={id:string|null;experienceId:string;created:boolean;notifyUserIds:string[]};
export async function saveMomentReview(momentId:string,input:SaveReviewInput):Promise<ExperienceResult<{id:string|null}>> {
  const value=validateReview(input);
  const result=await experienceMutation<Saved>(isExperienceId(momentId)&&value!==null,async client=>{
    const saved=await client.rpc("experience_save_moment_review",{p_moment_id:momentId,p_rating:value!.rating as number,p_body:value!.body as string});
    const data=saved.data as Saved|null;
    if(!saved.error&&data?.created&&data.id) {
      const {data:{user}}=await client.auth.getUser();
      // The review text never travels: the notice only names the memory.
      for(const userId of data.notifyUserIds) await notify(client,{userId,actorId:user!.id,type:"experience_reviewed",targetType:"experience",targetId:data.experienceId,dedupeKey:`experience_reviewed:${data.id}`,context:undefined});
    }
    return saved;
  });
  return result.ok?{ok:true,data:{id:result.data.id}}:result;
}
export async function setReviewSharing(reviewId:string,enabled:boolean):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(reviewId)&&typeof enabled==="boolean",client=>client.rpc("experience_set_review_sharing",{p_review_id:reviewId,p_enabled:enabled}));
  return result.ok?{ok:true,data:null}:result;
}
export async function deleteMomentReview(reviewId:string):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(reviewId),client=>client.rpc("experience_delete_moment_review",{p_review_id:reviewId}));
  return result.ok?{ok:true,data:null}:result;
}
export async function publishReview(reviewId:string):Promise<ExperienceResult<{id:string}>> {
  const result=await experienceMutation<{id:string;experienceId:string}>(isExperienceId(reviewId),client=>client.rpc("experience_publish_review",{p_review_id:reviewId}));
  return result.ok?{ok:true,data:{id:result.data.id}}:result;
}
export async function unpublishReview(reviewId:string):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(reviewId),client=>client.rpc("experience_unpublish_review",{p_review_id:reviewId}));
  return result.ok?{ok:true,data:null}:result;
}
```

`experienceMutation` ya invalida con el `experienceId` que devuelve el RPC. Comprobarlo: en `mutation.ts`, `createdId` lee `data.experienceId`.

En `participant-actions.ts`, sustituir `setMomentAttendance`:

```ts
export async function setMomentAttendance(id:string,state:AttendanceState,dropReviews=false) {
  return participation(isExperienceId(id)&&["planned","attended","skipped"].includes(state)&&typeof dropReviews==="boolean",client=>client.rpc("experience_set_attendance",{p_moment_id:id,p_state:state,p_drop_reviews:dropReviews}));
}
```

En `report-actions.ts`, añadir:

```ts
export async function reportReview(id:string,reason:string,details:string):Promise<ExperienceResult<null>> {
  const valid=isExperienceId(id)&&typeof reason==="string"&&isReportReason(reason)&&typeof details==="string"&&details.length<=2000;
  const result=await experienceMutation(valid,client=>client.rpc("experience_report_review",{p_review_id:id,p_reason:reason,p_details:details.trim()}));
  return result.ok?{ok:true,data:null}:result;
}
```

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/lib/experiences`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/experiences
git commit -m "feat(experiencias): server actions de reseñas y asistencia con confirmación"
```

---

### Tarea 9: Lecturas: reseñas, medias y hub ordenado

**Files:**
- Modify: `src/lib/experiences/queries.ts`
- Create: `src/lib/experiences/review-queries.test.ts`

**Interfaces:**
- Consumes: `get_experience_rating_summaries`, `get_experience_review_publications`, `get_own_experiences_ranked`, tabla `experience_moment_reviews` (RLS).
- Produces: `getExperiencePreviews` rellena `rating` y `momentRatings`; `getExperience` rellena `reviews`; `getExperiences(filters)` respeta `sort:"rating"` con `offset`; `parseExperienceFilters` lee `sort` (`"rating"` o por defecto `"recent"`) y `offset` (entero 0–10000).

- [ ] **Paso 1: Escribir el test que falla**

`src/lib/experiences/review-queries.test.ts`. Prueba las funciones puras que se exportan para mapear filas:

```ts
import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
import {ratingsByRoot,mapReviews,parseExperienceFilters} from "./queries";
const root="de9eb8c7-08f5-464d-8c5b-76f5b58bfce4",moment="de9eb8c7-08f5-464d-8c5b-76f5b58bfce5",me="de9eb8c7-08f5-464d-8c5b-76f5b58bfce8";
describe("ratingsByRoot",()=>{
  it("splits experience and moment rows",()=>{
    const map=ratingsByRoot([{experience_id:root,moment_id:null,avg_rating:8.5,rating_count:2},{experience_id:root,moment_id:moment,avg_rating:9,rating_count:1}]);
    expect(map.get(root)).toEqual({rating:{avg:8.5,count:2},momentRatings:{[moment]:{avg:9,count:1}}});
  });
});
describe("mapReviews",()=>{
  it("attaches identity, authorship and own publication",()=>{
    const reviews=mapReviews([{id:"r1",moment_id:moment,author_id:me,rating:7,body:"Bien",share_with_profile:true,created_at:"2026-10-04T10:00:00Z",updated_at:"2026-10-04T10:00:00Z"}],new Map([[me,{username:"yo",display_name:"Yo",avatar_url:null}]]),new Map([["r1","p1"]]),me);
    expect(reviews[0]).toMatchObject({id:"r1",momentId:moment,authorName:"Yo",authorUsername:"yo",isAuthor:true,publicationId:"p1",rating:7});
  });
});
describe("parseExperienceFilters",()=>{
  it("reads sort and offset safely",()=>{
    expect(parseExperienceFilters({sort:"rating",offset:"20"})).toMatchObject({sort:"rating",offset:20});
    expect(parseExperienceFilters({sort:"bogus",offset:"-1"})).toMatchObject({sort:"recent",offset:0});
  });
});
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/experiences/review-queries.test.ts`
Expected: FAIL, `ratingsByRoot is not a function`.

- [ ] **Paso 3: Implementar en `queries.ts`**

Añadir los helpers exportados:

```ts
type SummaryRow={experience_id:string;moment_id:string|null;avg_rating:number;rating_count:number};
export function ratingsByRoot(rows:SummaryRow[]):Map<string,{rating:ExperienceRating|null;momentRatings:Record<string,ExperienceRating>}> {
  const map=new Map<string,{rating:ExperienceRating|null;momentRatings:Record<string,ExperienceRating>}>();
  for(const row of rows) {
    const entry=map.get(row.experience_id)??{rating:null,momentRatings:{}};
    const value={avg:Number(row.avg_rating),count:row.rating_count};
    if(row.moment_id) entry.momentRatings[row.moment_id]=value; else entry.rating=value;
    map.set(row.experience_id,entry);
  }
  return map;
}
type ReviewRow={id:string;moment_id:string;author_id:string;rating:number|null;body:string|null;share_with_profile:boolean;created_at:string;updated_at:string};
type Identity={username:string|null;display_name:string|null;avatar_url:string|null};
export function mapReviews(rows:ReviewRow[],identities:Map<string,Identity>,publications:Map<string,string>,viewerId:string|null):ExperienceReview[] {
  return rows.map(r=>({id:r.id,momentId:r.moment_id,authorId:r.author_id,authorName:identities.get(r.author_id)?.display_name??null,authorUsername:identities.get(r.author_id)?.username??null,authorAvatarUrl:identities.get(r.author_id)?.avatar_url??null,
    rating:r.rating,body:r.body,shareWithProfile:r.share_with_profile,isAuthor:r.author_id===viewerId,publicationId:publications.get(r.id)??null,createdAt:r.created_at,updatedAt:r.updated_at}));
}
```

(Añadir `ExperienceRating` y `ExperienceReview` al import de `./types`.)

En `getExperiencePreviews`, añadir una cuarta consulta al `Promise.all`:

```ts
client.rpc("get_experience_rating_summaries",{p_ids:ids}),
```
con `if(summaries.error) throw summaries.error;`, `const ratings=ratingsByRoot((summaries.data??[]) as SummaryRow[]);` y, en el objeto devuelto por raíz:
```ts
rating:ratings.get(root.id)?.rating??null,momentRatings:ratings.get(root.id)?.momentRatings??{},
```

En `getExperience`, tras calcular `viewerId`:

```ts
const reviewRows=await client.from("experience_moment_reviews").select("id,moment_id,author_id,rating,body,share_with_profile,created_at,updated_at").eq("experience_id",id).order("created_at");
if(reviewRows.error) throw reviewRows.error;
const authorIds=[...new Set((reviewRows.data??[]).map(r=>r.author_id))];
const [authors,pubs]=await Promise.all([
  authorIds.length?client.from("profile_identities").select("user_id,username,display_name,avatar_url").in("user_id",authorIds):Promise.resolve({data:[],error:null}),
  viewerId?client.rpc("get_experience_review_publications",{p_ids:(reviewRows.data??[]).filter(r=>r.author_id===viewerId).map(r=>r.id)}):Promise.resolve({data:[],error:null}),
]);
if(authors.error) throw authors.error; if(pubs.error) throw pubs.error;
const reviews=mapReviews(reviewRows.data??[],new Map((authors.data??[]).map(a=>[a.user_id,a])),new Map((pubs.data??[]).map(p=>[p.review_id,p.post_id])),viewerId);
```
y añadir `reviews` al objeto devuelto (quitar el `reviews:[]` provisional de la Tarea 7).

En `parseExperienceFilters`, añadir al objeto devuelto:

```ts
sort:first("sort")==="rating" ? "rating" : "recent",
offset:(()=>{const n=Number(first("offset"));return Number.isInteger(n)&&n>=0&&n<=10000 ? n : 0;})(),
```

Y que el `cursor` siga siendo solo para `recent`. Al principio de `getExperiences`, después de comprobar el usuario:

```ts
if(filters.sort==="rating") {
  const offset=filters.offset??0;
  const {data,error}=await client.rpc("get_own_experiences_ranked",{p_state:filters.state??"all",p_kind:filters.kind,p_companion:filters.companion,p_offset:offset});
  if(error) throw error;
  const rows=data??[],page=rows.slice(0,20);
  return {items:await getExperiencePreviews(client,page),nextCursor:rows.length>20?String(offset+20):null};
}
```

Con `sort=rating`, `nextCursor` es el siguiente `offset` en texto; el hub lo pasa como `offset` (Tarea 13).

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/experiences; npx tsc --noEmit`
Expected: PASS y 0 errores.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/experiences/queries.ts src/lib/experiences/review-queries.test.ts
git commit -m "feat(experiencias): leer reseñas, medias visibles y hub por nota"
```

---

### Tarea 10: Feed, Actividad y pestaña del perfil

**Files:**
- Modify: `src/lib/social/feed.ts`, `src/lib/social/fake-feed-supabase.ts`, `src/lib/social/feed-experiences.test.ts`
- Modify: `src/components/social/experience-feed-card.tsx`
- Modify: `src/app/u/[username]/_tabs/experiences-tab.tsx`, `src/components/experiences/experience-card.tsx`

**Interfaces:**
- Produces: `ExperienceFeedEvent.review: ExperienceFeedReview | null`, con `interface ExperienceFeedReview { id:string; momentId:string; momentTitle:string; rating:number|null; body:string|null }`. `ExperienceCard` acepta `excerpt?: {momentId:string; rating:number|null; body:string|null}`.

- [ ] **Paso 1: Escribir el test que falla**

En `src/lib/social/feed-experiences.test.ts`, siguiendo el patrón de sus casos (usan `fake-feed-supabase`), añadir:

```ts
it("maps experience_review posts to the experience entry with its live review",async()=>{
  const fake=fakeFeed({
    posts:[{id:"p2",author_id:actor,kind:"experience_review",anchor_type:"experience",anchor_id:root,source_kind:"experience_review",source_id:"r1",body:null,created_at:"2026-10-04T10:00:00Z"}],
    experiences:[rootRow],
    experience_moment_reviews:[{id:"r1",experience_id:root,moment_id:moment,rating:9,body:"Inolvidable"}],
  });
  const page=await getFeed(fake,viewer,{});
  const entry=page.entries.find(e=>e.id==="posts:p2");
  expect(entry?.source).toBe("experience");
  expect(entry&&"event" in entry&&(entry.event as ExperienceFeedEvent).review).toEqual({id:"r1",momentId:moment,momentTitle:"Concierto",rating:9,body:"Inolvidable"});
});
it("drops review posts whose review the viewer cannot read",async()=>{
  const fake=fakeFeed({posts:[{id:"p3",author_id:actor,kind:"experience_review",anchor_type:"experience",anchor_id:root,source_kind:"experience_review",source_id:"gone",body:null,created_at:"2026-10-04T10:00:00Z"}],experiences:[rootRow],experience_moment_reviews:[]});
  const page=await getFeed(fake,viewer,{});
  expect(page.entries.some(e=>e.id==="posts:p3")).toBe(false);
});
```

Adaptar `fakeFeed`, `rootRow`, `actor`, `viewer`, `root` y `moment` a los nombres reales de ese fichero. Si `fake-feed-supabase.ts` no soporta la tabla `experience_moment_reviews`, añadirla igual que `experiences`.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/social/feed-experiences.test.ts`
Expected: FAIL, la entrada `posts:p2` no existe.

- [ ] **Paso 3: Implementar en `feed.ts`**

1. Tipo: añadir `review:ExperienceFeedReview|null` a `ExperienceFeedEvent` y exportar `ExperienceFeedReview`.
2. En la línea ~454, el filtro que aparta los posts de experiencia ya excluye `anchor_type==="experience"`; no hace falta tocarlo.
3. En la línea ~769, sustituir la selección de `xp` y el mapeo:

```ts
const xp=reviewsOnly?[]:rows.filter(r=>(r.kind==="experience"||r.kind==="experience_review")&&r.anchor_type==="experience");
const reviewIds=xp.filter(r=>r.kind==="experience_review"&&r.source_id).map(r=>r.source_id as string);
```
Añadir al `Promise.all` de esa función:
```ts
reviewIds.length?supabase.from("experience_moment_reviews").select("id,moment_id,rating,body").in("id",reviewIds):Promise.resolve({data:[],error:null}),
```
y dentro de `flatMap`:
```ts
let review:ExperienceFeedReview|null=null;
if(row.kind==="experience_review") {
  const r=reviewById.get(row.source_id);if(!r)return [];
  const moment=experience.moments.find(m=>m.id===r.moment_id);if(!moment)return [];
  review={id:r.id,momentId:r.moment_id,momentTitle:moment.title,rating:r.rating,body:r.body};
}
return [{...existingFields,review}];
```
`reviewById` es `new Map((reviews.data??[]).map(r=>[r.id,r]))`. La RLS ya oculta las reseñas sin acceso, y entonces el post se descarta.

- [ ] **Paso 4: Tarjeta del feed**

En `experience-feed-card.tsx`, sustituir el texto de la cabecera y el cuerpo:

```tsx
<span className="text-xs text-muted-foreground">{e.review?t("reviewedMoment",{name:e.review.momentTitle}):t("sharedMemory")}</span>
```
y justo después de `<ExperienceCard …/>`:
```tsx
{e.review&&<Link href={`/experiencia/${e.experience.id}#moment-${e.review.momentId}`} className="block space-y-2 rounded-cover border border-border p-3 hover:border-foreground-soft">{e.review.rating!==null&&<RatingDots value={e.review.rating} size="sm"/>}{e.review.body&&<p className="line-clamp-4 whitespace-pre-wrap text-sm">{e.review.body}</p>}</Link>}
```
(Importar `RatingDots` de `@/components/ui/rating-dots`. Sin `itemType`, se pinta en oro.)

- [ ] **Paso 5: Extracto en la pestaña del perfil**

En `queries.ts`, añadir y exportar:

```ts
export async function getProfileReviewExcerpts(userId:string,experienceIds:string[]):Promise<Map<string,{momentId:string;rating:number|null;body:string|null}>> {
  if(!isExperienceId(userId)||!experienceIds.length) return new Map();
  const client=await createClient();
  const {data,error}=await client.from("experience_moment_reviews").select("experience_id,moment_id,rating,body,created_at").eq("author_id",userId).in("experience_id",experienceIds)
    .order("rating",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false});
  if(error) throw error;
  const map=new Map<string,{momentId:string;rating:number|null;body:string|null}>();
  for(const r of data??[]) if(!map.has(r.experience_id)) map.set(r.experience_id,{momentId:r.moment_id,rating:r.rating,body:r.body});
  return map;
}
```

En `experiences-tab.tsx`, tras obtener `page`:
```tsx
const excerpts=await getProfileReviewExcerpts(userId,page.items.map(e=>e.id));
```
y `<ExperienceCard key={e.id} experience={e} excerpt={excerpts.get(e.id)}/>`.

En `experience-card.tsx`, añadir la prop `excerpt` y, antes del pie de acompañantes:
```tsx
{excerpt&&(excerpt.body||excerpt.rating!==null)&&<p className="line-clamp-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">{excerpt.body??t("ratedOnly")}</p>}
```
La tarjeta entera ya es un `Link` al detalle, así que el extracto no puede llevar otro enlace dentro (sería HTML inválido); el momento se ve en el propio detalle.

- [ ] **Paso 6: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/social src/components/social src/components/experiences; npx tsc --noEmit`
Expected: PASS y 0 errores.

- [ ] **Paso 7: Commit**

```bash
git add src/lib/social src/lib/experiences/queries.ts src/components/social/experience-feed-card.tsx "src/app/u/[username]/_tabs/experiences-tab.tsx" src/components/experiences/experience-card.tsx
git commit -m "feat(experiencias): reseñas publicadas en feed y extracto en el perfil"
```

---

### Tarea 11: Bloque de reseñas en el detalle

**Files:**
- Create: `src/components/experiences/moment-reviews.tsx`, `src/components/experiences/moment-reviews.test.tsx`, `src/components/experiences/review-report.tsx`, `src/components/experiences/experience-rating.tsx`
- Modify: `src/components/experiences/experience-detail.tsx`, `docs/UI-GLOSARIO.md`, `messages/es.json`

**Interfaces:**
- Consumes: `ExperienceDetail.reviews`, `momentRatings`, `rating`; actions de la Tarea 8.
- Produces: `<MomentReviews experience moment />`, `<ExperienceRating rating size? />`, `<ReviewReport id />`.

- [ ] **Paso 1: Copy en el glosario y en `messages/es.json`**

Primero, en `docs/UI-GLOSARIO.md`, en la sección de Experiencias, añadir las entradas «Reseña de momento», «Compartir fuera del grupo», «Publicar en tu actividad», «Mi momento» y «Lo vivimos», con la definición de la spec. Después, en `messages/es.json` → `experiences`, añadir:

```json
"reviews": {
  "title": "Reseñas",
  "write": "Reseñar",
  "edit": "Editar reseña",
  "sheetTitle": "Tu reseña de {name}",
  "rating": "Nota",
  "body": "Qué tal fue",
  "bodyHint": "Opcional. Hasta 4000 caracteres.",
  "share": "Compartir fuera del grupo",
  "shareHint": "La verán quienes vean esta experiencia en tu perfil, si compartes tu identidad en ella.",
  "publish": "Publicar en tu actividad",
  "unpublish": "Quitar de tu actividad",
  "published": "Publicada en tu actividad",
  "publishNeedsProfile": "Para publicarla, la experiencia tiene que ser visible en el perfil.",
  "delete": "Borrar reseña",
  "deleteConfirm": "Se borrará tu reseña de {name} y su publicación, si la tiene.",
  "save": "Guardar reseña",
  "needAttendance": "Confirma que fuiste a {name} para poder reseñarlo.",
  "needLived": "Podrás reseñarlo cuando la experiencia esté como vivida.",
  "readMore": "Leer más",
  "readLess": "Leer menos",
  "count": "{count, plural, one {# reseña} other {# reseñas}}",
  "empty": "Nadie ha reseñado este momento todavía.",
  "report": "Denunciar reseña",
  "actions": "Acciones de la reseña de {name}"
},
"reviewedMoment": "reseñó {name}",
"ratedOnly": "Solo puso nota"
```

- [ ] **Paso 2: Escribir el test de componente que falla**

`src/components/experiences/moment-reviews.test.tsx`. Seguir el arranque de `experience-album-controls.test.tsx` (proveedor de next-intl con `messages/es.json` y mock de `next/navigation`):

```tsx
import {describe,expect,it,vi,beforeEach} from "vitest";
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const actions=vi.hoisted(()=>({saveMomentReview:vi.fn(),setReviewSharing:vi.fn(),deleteMomentReview:vi.fn(),publishReview:vi.fn(),unpublishReview:vi.fn()}));
vi.mock("@/lib/experiences/review-actions",()=>actions);
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
import {MomentReviews} from "./moment-reviews";
import {withIntl,detailFixture} from "./test-helpers";
beforeEach(()=>{vi.clearAllMocks();actions.saveMomentReview.mockResolvedValue({ok:true,data:{id:"r1"}});});
describe("MomentReviews",()=>{
  it("asks to confirm attendance instead of offering a disabled button",()=>{
    const e=detailFixture({state:"lived",ownAttendance:"planned"});
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]}/>));
    expect(screen.queryByRole("button",{name:"Reseñar"})).toBeNull();
    expect(screen.getByText(/Confirma que fuiste/)).toBeTruthy();
  });
  it("saves rating and text from the sheet",async()=>{
    const e=detailFixture({state:"lived",ownAttendance:"attended"});
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]}/>));
    await userEvent.click(screen.getByRole("button",{name:"Reseñar"}));
    await userEvent.type(screen.getByLabelText("Qué tal fue"),"Muy bien");
    await userEvent.click(screen.getByRole("button",{name:"Guardar reseña"}));
    expect(actions.saveMomentReview).toHaveBeenCalledWith(e.moments[0].id,{rating:null,body:"Muy bien"});
  });
  it("shows others' reviews with their author",()=>{
    const e=detailFixture({state:"lived",ownAttendance:"attended",reviews:[{author:"Ana",rating:9,body:"Lo mejor"}]});
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]}/>));
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Lo mejor")).toBeTruthy();
  });
  it("only enables publishing for a shared review in a profile experience",()=>{
    const e=detailFixture({state:"lived",ownAttendance:"attended",audience:"participants",reviews:[{author:"Yo",mine:true,rating:8,body:"x",shared:true}]});
    render(withIntl(<MomentReviews experience={e} moment={e.moments[0]}/>));
    expect(screen.getByText(/tiene que ser visible en el perfil/)).toBeTruthy();
  });
});
```

Crear `src/components/experiences/test-helpers.tsx` con `withIntl(node)` (envuelve en `NextIntlClientProvider locale="es" messages={es}`) y `detailFixture(opts)`, que construye un `ExperienceDetail` con un momento, el visor como participante aceptado, la asistencia `ownAttendance`, `audience` (por defecto `profile`) y las `reviews` dadas (`mine` → `authorId=viewerId`). Si `experience-album-controls.test.tsx` ya tiene helpers equivalentes, moverlos a este fichero y reutilizarlos desde los dos tests.

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npx vitest run src/components/experiences/moment-reviews.test.tsx`
Expected: FAIL, `Cannot find module './moment-reviews'`.

- [ ] **Paso 4: Implementar los componentes**

`src/components/experiences/experience-rating.tsx`:

```tsx
"use client";
import {useTranslations} from "next-intl";
import {RatingDots} from "@/components/ui/rating-dots";
import type {ExperienceRating as Rating} from "@/lib/experiences/types";
export function ExperienceRating({rating,size="sm"}:{rating:Rating|null;size?:"sm"|"md"}) {
  const t=useTranslations("experiences");
  if(!rating||!rating.count) return null;
  return <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><RatingDots value={Math.round(rating.avg)} size={size}/><span className="font-mono">{rating.avg.toFixed(1)}</span><span>· {t("reviews.count",{count:rating.count})}</span></span>;
}
```

(Comprobar que `RatingDots` acepta `size="sm"|"md"`; si las claves de `SIZES` se llaman de otra forma, usar las reales.)

`src/components/experiences/moment-reviews.tsx`:

```tsx
"use client";
import {useId,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {ActionMenu} from "@/components/ui/action-menu";
import {Field} from "@/components/ui/field";
import {RatingDots} from "@/components/ui/rating-dots";
import {SheetShell} from "@/components/saga/sheet-shell";
import {UserAvatar} from "@/components/social/user-avatar";
import {saveMomentReview,setReviewSharing,deleteMomentReview,publishReview,unpublishReview} from "@/lib/experiences/review-actions";
import type {ExperienceDetail,ExperienceMoment,ExperienceReview,ExperienceError} from "@/lib/experiences/types";
import {ExperienceRating} from "./experience-rating";
import {ReviewReport} from "./review-report";

function ReviewBody({review}:{review:ExperienceReview}) {
  const t=useTranslations("experiences"),[open,setOpen]=useState(false);
  if(!review.body) return null;
  const long=review.body.length>280;
  return <div className="space-y-1"><p className={`whitespace-pre-wrap text-sm ${long&&!open?"line-clamp-4":""}`}>{review.body}</p>{long&&<button type="button" className="min-h-11 text-xs underline underline-offset-4" onClick={()=>setOpen(v=>!v)}>{t(open?"reviews.readLess":"reviews.readMore")}</button>}</div>;
}

function ReviewSheet({experience:e,moment:m,review,onClose}:{experience:ExperienceDetail;moment:ExperienceMoment;review?:ExperienceReview;onClose:()=>void}) {
  const t=useTranslations("experiences"),router=useRouter(),id=useId();
  const [rating,setRating]=useState<number|null>(review?.rating??null),[body,setBody]=useState(review?.body??"");
  const [error,setError]=useState<ExperienceError|null>(null),[pending,start]=useTransition();
  return <SheetShell title={t("reviews.sheetTitle",{name:m.title})} onClose={onClose}>
    <form className="space-y-5" onSubmit={event=>{event.preventDefault();setError(null);start(async()=>{const result=await saveMomentReview(m.id,{rating,body:body.trim()||null});if(!result.ok) setError(result.error);else {onClose();router.refresh();}});}}>
      <fieldset disabled={pending} className="space-y-5">
        <div><p id={`${id}-rating`} className="mb-2 text-sm font-medium">{t("reviews.rating")}</p><RatingDots value={rating} onChange={setRating} size="lg" aria-labelledby={`${id}-rating`}/></div>
        <Field label={t("reviews.body")} htmlFor={`${id}-body`} hint={t("reviews.bodyHint")}><textarea id={`${id}-body`} value={body} onChange={event=>setBody(event.target.value)} maxLength={4000} rows={5} className="w-full rounded-lg border border-border bg-surface p-3"/></Field>
      </fieldset>
      {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
      <Button type="submit" disabled={pending||(rating===null&&!body.trim()&&!review)} className="min-h-12 w-full">{pending?t("saving"):t("reviews.save")}</Button>
    </form>
  </SheetShell>;
}

function OwnReviewControls({experience:e,review}:{experience:ExperienceDetail;review:ExperienceReview}) {
  const t=useTranslations("experiences"),router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  const run=(work:()=>Promise<{ok:boolean;error?:ExperienceError}>)=>{setError(null);start(async()=>{const r=await work();if(!r.ok) setError(r.error??"unknown");else router.refresh();});};
  const canPublish=review.shareWithProfile&&e.audience==="profile";
  return <div className="space-y-2">
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={review.shareWithProfile} disabled={pending} onChange={event=>run(()=>setReviewSharing(review.id,event.target.checked))}/>{t("reviews.share")}</label>
    <p className="text-xs text-muted-foreground">{t("reviews.shareHint")}</p>
    {review.shareWithProfile&&(canPublish
      ? review.publicationId
        ? <div className="flex flex-wrap items-center gap-2 text-xs"><span>{t("reviews.published")}</span><Button variant="ghost" className="min-h-11" disabled={pending} onClick={()=>run(()=>unpublishReview(review.id))}>{t("reviews.unpublish")}</Button></div>
        : <Button variant="secondary" className="min-h-11" disabled={pending} onClick={()=>run(()=>publishReview(review.id))}>{t("reviews.publish")}</Button>
      : <p className="text-xs text-muted-foreground">{t("reviews.publishNeedsProfile")}</p>)}
    {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
  </div>;
}

export function MomentReviews({experience:e,moment:m}:{experience:ExperienceDetail;moment:ExperienceMoment}) {
  const t=useTranslations("experiences"),router=useRouter();
  const [editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false),[pending,start]=useTransition();
  const reviews=e.reviews.filter(r=>r.momentId===m.id),own=reviews.find(r=>r.isAuthor),others=reviews.filter(r=>!r.isAuthor);
  const me=e.participants.find(p=>p.userId===e.viewerId&&p.invitationState==="accepted");
  const attended=me&&e.attendance.some(a=>a.momentId===m.id&&a.participantId===me.id&&a.state==="attended");
  return <section aria-label={t("reviews.title")} className="space-y-3 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">{t("reviews.title")}</h4><ExperienceRating rating={e.momentRatings[m.id]??null}/></div>
    {e.canContribute&&me&&(e.state!=="lived"
      ? <p className="text-xs text-muted-foreground">{t("reviews.needLived")}</p>
      : !attended
        ? <p className="text-xs text-muted-foreground">{t("reviews.needAttendance",{name:m.title})}</p>
        : own
          ? <article className="space-y-2 rounded-cover bg-surface-muted p-3"><div className="flex items-center justify-between gap-2">{own.rating!==null&&<RatingDots value={own.rating} size="sm"/>}<ActionMenu label={t("reviews.actions",{name:m.title})} items={[{key:"edit",label:t("reviews.edit"),onSelect:()=>setEditing(true)},{key:"delete",label:t("reviews.delete"),danger:true,onSelect:()=>setDeleting(true)}]}/></div><ReviewBody review={own}/><OwnReviewControls experience={e} review={own}/></article>
          : <Button variant="secondary" className="min-h-11" onClick={()=>setEditing(true)}>{t("reviews.write")}</Button>)}
    {others.length>0&&<ul className="space-y-3">{others.map(r=><li key={r.id} className="space-y-1.5"><div className="flex items-center gap-2"><UserAvatar name={r.authorName??r.authorUsername??t("companion")} avatarUrl={r.authorAvatarUrl} size={24}/><span className="text-sm font-medium">{r.authorName??r.authorUsername??t("companion")}</span>{r.rating!==null&&<RatingDots value={r.rating} size="sm"/>}<span className="ml-auto"><ReviewReport id={r.id}/></span></div><ReviewBody review={r}/></li>)}</ul>}
    {!own&&!others.length&&e.state==="lived"&&<p className="text-xs text-muted-foreground">{t("reviews.empty")}</p>}
    {editing&&<ReviewSheet experience={e} moment={m} review={own} onClose={()=>setEditing(false)}/>}
    {deleting&&own&&<SheetShell title={t("reviews.delete")} onClose={()=>setDeleting(false)}><p className="mb-4 text-sm">{t("reviews.deleteConfirm",{name:m.title})}</p><Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={()=>start(async()=>{const r=await deleteMomentReview(own.id);if(r.ok){setDeleting(false);router.refresh();}})}>{t("reviews.delete")}</Button></SheetShell>}
  </section>;
}
```

(Comprobar los props reales de `RatingDots`: si no acepta `aria-labelledby`, envolverlo en un `div role="group" aria-labelledby=…`. Ajustar las claves de `size` a las de `SIZES`.)

`src/components/experiences/review-report.tsx`: igual que `experience-report.tsx`, con `reportReview` y la clave `experiences.reviews.report`. Variante compacta: el botón disparador es un `ActionMenu` con la única opción «Denunciar reseña».

```tsx
"use client";
import {useId,useState,useTransition} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {ActionMenu} from "@/components/ui/action-menu";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {SheetShell} from "@/components/saga/sheet-shell";
import {REPORT_REASONS} from "@/lib/social/moderation";
import {reportReview} from "@/lib/experiences/report-actions";
export function ReviewReport({id}:{id:string}) {
  const t=useTranslations("social"),tx=useTranslations("experiences"),field=useId(),[open,setOpen]=useState(false),[sent,setSent]=useState(false),[failed,setFailed]=useState(false),[pending,start]=useTransition();
  if(sent) return <span role="status" className="text-xs text-muted-foreground">{t("reportSent")}</span>;
  return <><ActionMenu label={tx("reviews.report")} items={[{key:"report",label:tx("reviews.report"),onSelect:()=>setOpen(true)}]}/>{open&&<SheetShell title={tx("reviews.report")} onClose={()=>setOpen(false)}><form className="space-y-4" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setFailed(false);start(async()=>{const r=await reportReview(id,String(data.get("reason")),String(data.get("details")??""));if(!r.ok)setFailed(true);else{setOpen(false);setSent(true);}});}}><Field label={t("reportReasonLabel")} htmlFor={`${field}-reason`}><Select id={`${field}-reason`} name="reason" className="min-h-11 w-full">{REPORT_REASONS.map(r=><option key={r} value={r}>{t(`reportReason.${r}`)}</option>)}</Select></Field><Field label={t("reportDetailsLabel")} htmlFor={`${field}-details`}><textarea id={`${field}-details`} name="details" maxLength={2000} rows={3} className="w-full rounded-lg border border-border bg-surface p-3"/></Field>{failed&&<p role="alert" className="text-sm text-status-dropped">{t("actionError")}</p>}<Button type="submit" disabled={pending} className="min-h-11 w-full">{t("sendReport")}</Button></form></SheetShell>}</>;
}
```

En `experience-detail.tsx`:
- En el `<li>` de cada momento, añadir `id={`moment-${m.id}`}` y `className="… scroll-mt-24"`.
- Tras `<MomentFavorite …/>`, añadir `<MomentReviews experience={e} moment={m}/>`.
- En la cabecera, tras la línea de fecha: `<ExperienceRating rating={e.rating} size="md"/>`.

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npx vitest run src/components/experiences; npx tsc --noEmit`
Expected: PASS y 0 errores.

- [ ] **Paso 6: Commit**

```bash
git add src/components/experiences docs/UI-GLOSARIO.md messages/es.json
git commit -m "feat(experiencias): reseñar momentos desde el detalle"
```

---

### Tarea 12: Asistencia con confirmación y «Lo vivimos»

**Files:**
- Modify: `src/components/experiences/moment-attendance.tsx`
- Create: `src/components/experiences/experience-lived-action.tsx`, `src/components/experiences/experience-lived-action.test.tsx`
- Modify: `src/components/experiences/experience-detail.tsx`, `docs/UI-GLOSARIO.md`, `messages/es.json`

**Interfaces:**
- Consumes: `updateExperience(id, revision, UpdateExperienceInput)`, `setMomentAttendance(id, state, dropReviews)`.
- Produces: `<ExperienceLivedAction experience />`, visible solo si `canEdit && state==="planned"`.

- [ ] **Paso 1: Copy**

En el glosario primero y después en `messages/es.json` → `experiences`:

```json
"lived": {
  "action": "Lo vivimos",
  "title": "¿A qué fuiste?",
  "hint": "Marca los momentos en los que estuviste. Podrás cambiarlo después.",
  "confirm": "Guardar",
  "reviewNow": "Reseñar ahora",
  "later": "Más tarde",
  "confirmAttendance": "¿Fuiste? Confirma y reseña"
},
"dropReview": {
  "title": "Borrar tu reseña",
  "message": "Tienes una reseña de {name}. Si dices que no fuiste, se borrará junto con su publicación.",
  "confirm": "Cambiar y borrar la reseña"
}
```

- [ ] **Paso 2: Escribir el test que falla**

`src/components/experiences/experience-lived-action.test.tsx`:

```tsx
import {describe,expect,it,vi,beforeEach} from "vitest";
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const a=vi.hoisted(()=>({updateExperience:vi.fn(),setMomentAttendance:vi.fn()}));
vi.mock("@/lib/experiences/actions",()=>({updateExperience:a.updateExperience}));
vi.mock("@/lib/experiences/participant-actions",()=>({setMomentAttendance:a.setMomentAttendance}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
import {ExperienceLivedAction} from "./experience-lived-action";
import {withIntl,detailFixture} from "./test-helpers";
beforeEach(()=>{vi.clearAllMocks();a.updateExperience.mockResolvedValue({ok:true,data:{revision:2}});a.setMomentAttendance.mockResolvedValue({ok:true,data:{experienceId:"x"}});});
describe("ExperienceLivedAction",()=>{
  it("is hidden unless the organizer looks at a plan",()=>{
    const {container}=render(withIntl(<ExperienceLivedAction experience={detailFixture({state:"lived",canEdit:true})}/>));
    expect(container.textContent).toBe("");
  });
  it("marks lived keeping fields, then confirms only checked moments",async()=>{
    const e=detailFixture({state:"planned",canEdit:true,moments:2});
    render(withIntl(<ExperienceLivedAction experience={e}/>));
    await userEvent.click(screen.getByRole("button",{name:"Lo vivimos"}));
    expect(a.updateExperience).toHaveBeenCalledWith(e.id,e.revision,{title:e.title,shape:e.shape,state:"lived",audience:e.audience,startsOn:e.startsOn,endsOn:e.endsOn});
    await userEvent.click(screen.getByRole("checkbox",{name:e.moments[1].title}));
    await userEvent.click(screen.getByRole("button",{name:"Guardar"}));
    expect(a.setMomentAttendance).toHaveBeenCalledTimes(1);
    expect(a.setMomentAttendance).toHaveBeenCalledWith(e.moments[0].id,"attended");
    expect(screen.getByRole("link",{name:"Reseñar ahora"}).getAttribute("href")).toBe(`#moment-${e.moments[0].id}`);
  });
});
```

(`detailFixture` admite `canEdit` y `moments:n`; ampliarlo si hace falta.)

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npx vitest run src/components/experiences/experience-lived-action.test.tsx`
Expected: FAIL, `Cannot find module './experience-lived-action'`.

- [ ] **Paso 4: Implementar**

`src/components/experiences/experience-lived-action.tsx`:

```tsx
"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button,buttonVariants} from "@/components/ui/button";
import {SheetShell} from "@/components/saga/sheet-shell";
import {updateExperience} from "@/lib/experiences/actions";
import {setMomentAttendance} from "@/lib/experiences/participant-actions";
import type {ExperienceDetail,ExperienceError} from "@/lib/experiences/types";
export function ExperienceLivedAction({experience:e}:{experience:ExperienceDetail}) {
  const t=useTranslations("experiences"),router=useRouter();
  const [step,setStep]=useState<"closed"|"attendance"|"done">("closed"),[checked,setChecked]=useState<string[]>(e.moments.map(m=>m.id));
  const [error,setError]=useState<ExperienceError|null>(null),[pending,start]=useTransition();
  if(!e.canEdit||(e.state!=="planned"&&step==="closed")) return null;
  const first=e.moments.find(m=>checked.includes(m.id));
  return <>
    {step==="closed"&&<Button className="min-h-11" disabled={pending} onClick={()=>{setError(null);start(async()=>{const r=await updateExperience(e.id,e.revision,{title:e.title,shape:e.shape,state:"lived",audience:e.audience,startsOn:e.startsOn,endsOn:e.endsOn});if(!r.ok) setError(r.error);else setStep("attendance");});}}>{t("lived.action")}</Button>}
    {error&&step==="closed"&&<div role="alert" className="space-y-2 text-sm text-status-dropped"><p>{t(`errors.${error}`)}</p>{error==="conflict"&&<Button variant="secondary" className="min-h-11" onClick={()=>router.refresh()}>{t("refresh")}</Button>}</div>}
    {step!=="closed"&&<SheetShell title={t("lived.title")} onClose={()=>{setStep("closed");router.refresh();}}>
      {step==="attendance"?<form className="space-y-4" onSubmit={event=>{event.preventDefault();setError(null);start(async()=>{for(const id of checked){const r=await setMomentAttendance(id,"attended");if(!r.ok){setError(r.error);return;}}setStep("done");router.refresh();});}}>
        <p className="text-sm text-muted-foreground">{t("lived.hint")}</p>
        <fieldset disabled={pending} className="space-y-1">{e.moments.map(m=><label key={m.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={checked.includes(m.id)} onChange={event=>setChecked(ids=>event.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id))}/>{m.title}</label>)}</fieldset>
        {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
        <Button type="submit" disabled={pending} className="min-h-12 w-full">{t("lived.confirm")}</Button>
      </form>:<div className="flex flex-wrap gap-2">{first&&<a href={`#moment-${first.id}`} onClick={()=>setStep("closed")} className={buttonVariants("primary","min-h-11")}>{t("lived.reviewNow")}</a>}<Button variant="ghost" className="min-h-11" onClick={()=>setStep("closed")}>{t("lived.later")}</Button></div>}
    </SheetShell>}
  </>;
}
```

En `experience-detail.tsx`, dentro de la cabecera, tras `<ExperienceRating …/>`: `<ExperienceLivedAction experience={e}/>`.

En `moment-attendance.tsx`:
- Cuando la experiencia es `lived` y la asistencia propia es `planned`, mostrar encima de las opciones `<p className="text-xs font-medium">{t("lived.confirmAttendance")}</p>`.
- En `change`, si `state!=="attended"` y el visor tiene reseña en ese momento (`e.reviews.some(r=>r.isAuthor&&r.momentId===m.id)`), no llamar a la action: guardar `pendingState` y abrir un `SheetShell` con `dropReview.message`. El botón `dropReview.confirm` (variante `danger`) llama a `setMomentAttendance(m.id,pendingState,true)`.
- Mapear el error `conflict` de esa ruta al mismo diálogo, por si la reseña la creó otra pestaña.

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npx vitest run src/components/experiences; npx tsc --noEmit`
Expected: PASS y 0 errores.

- [ ] **Paso 6: Commit**

```bash
git add src/components/experiences docs/UI-GLOSARIO.md messages/es.json
git commit -m "feat(experiencias): lo vivimos y confirmación al retirar asistencia reseñada"
```

---

### Tarea 13: Favorito sin estrella, tipos nuevos en UI, nota en tarjetas y orden del hub

**Files:**
- Modify: `src/components/ui/icons.tsx`, `src/components/experiences/moment-favorite.tsx`
- Modify: `src/components/experiences/experience-artwork.tsx`, `src/app/experiencias/page.tsx`
- Modify: `src/components/experiences/experience-card.tsx`, `src/components/experiences/experience-filters.tsx`
- Modify: `docs/UI-GLOSARIO.md`, `messages/es.json`
- Test: `src/components/experiences/experience-album-controls.test.tsx`

**Interfaces:**
- Produces: `RibbonIcon`; `ExperienceFiltersBar` muestra el selector de orden cuando `showSort` es `true` (hub), y el perfil no lo muestra.

- [ ] **Paso 1: Copy**

Glosario primero. Después, en `messages/es.json` → `experiences`:
- `kinds`: añadir `"food": "Gastronomía"`, `"festival": "Festival"`, `"sport": "Deporte"`, `"nature": "Naturaleza"`.
- Cambiar `"favorite"` a `"Mi momento"` y `"favoriteBy"` a `"Momento de {name}"`. Revisar que `selectFavorite`/`removeFavorite` sigan teniendo sentido («Marcar {name} como mi momento» / «Quitar {name} como mi momento»).
- Añadir `"sort": "Orden"`, `"sortRecent": "Recientes"`, `"sortRating": "Mejor valoradas"`.

- [ ] **Paso 2: Escribir el test que falla**

Añadir a `experience-album-controls.test.tsx`:

```tsx
it("favorite uses the ribbon, never a star",()=>{
  const e=detailFixture({state:"lived",ownAttendance:"attended"});
  const {container}=render(withIntl(<MomentFavorite experience={e} moment={e.moments[0]}/>));
  expect(container.querySelector("[data-icon='ribbon']")).not.toBeNull();
  expect(screen.getByRole("button",{name:/mi momento/i})).toBeTruthy();
});
it("card shows the visible average only when there is one",()=>{
  const e=detailFixture({});
  const {rerender}=render(withIntl(<ExperienceCard experience={{...e,rating:null}}/>));
  expect(screen.queryByText(/reseña/)).toBeNull();
  rerender(withIntl(<ExperienceCard experience={{...e,rating:{avg:8.5,count:2}}}/>));
  expect(screen.getByText("8.5")).toBeTruthy();
});
it("hub offers sorting by rating",()=>{
  render(withIntl(<ExperienceFiltersBar filters={{state:"all",sort:"recent"}} people={[]} showSort/>));
  expect(screen.getByRole("link",{name:"Mejor valoradas"}).getAttribute("href")).toBe("/experiencias?sort=rating");
});
```

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npx vitest run src/components/experiences/experience-album-controls.test.tsx`
Expected: FAIL en los tres casos nuevos.

- [ ] **Paso 4: Implementar**

En `icons.tsx`, después de `StarIcon`:

```tsx
export function RibbonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon data-icon="ribbon" {...props}>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </Icon>
  );
}
```

(Si `Icon` no reenvía atributos `data-*`, poner el `data-icon` en el `<path>` y ajustar el selector del test.)

En `moment-favorite.tsx`: sustituir `StarIcon` por `RibbonIcon` en las dos apariciones y `fill-gold/25` por `fill-gold/40`.

En `experience-artwork.tsx`: añadir a cada mapa (`tone`, ilustración grande, icono) las claves `food`, `festival`, `sport` y `nature`, con el mismo trazo de 24×24:
- `food`: `<><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 8h3v10" /></>`, tono `text-status-dropped`.
- `festival`: `<><path d="M3 21 12 3l9 18zM8 21l4-8 4 8" /><path d="M12 3V1" /></>`, tono `text-gold-ink`.
- `sport`: `<><circle cx="12" cy="12" r="9" /><path d="M12 3a15 15 0 0 1 0 18M3 12h18M5 6c4 3 10 3 14 0M5 18c4-3 10-3 14 0" /></>`, tono `text-accent`.
- `nature`: `<><path d="M12 22V12M7 12l5-9 5 9zM4 18l4-6 3 4" /></>`, tono `text-status-completed-ink`.

Para la ilustración grande, reutilizar el mismo `path` escalado como en las ramas existentes (copiar la forma de la rama `walk`). TypeScript fallará si falta alguna clave en un `Record<MomentKind,…>`: es la red de seguridad.

En `src/app/experiencias/page.tsx`: cambiar la rejilla de tipos de `grid-cols-3 … sm:grid-cols-6` a `grid-cols-3 sm:grid-cols-5`, y pasar `showSort` a `ExperienceFiltersBar`. Además, el enlace «Más» con `sort=rating` tiene que llevar `offset` en lugar de `cursor`:

```tsx
const more=new URLSearchParams();
for(const [key,value] of Object.entries({state:filters.state,kind:filters.kind,companion:filters.companion,sort:filters.sort==="rating"?"rating":undefined})) if(value&&value!=="all") more.set(key,value);
if(page.nextCursor) more.set(filters.sort==="rating"?"offset":"cursor",page.nextCursor);
```

En `experience-filters.tsx`: añadir la prop `showSort?:boolean`. En `href()`, borrar también `offset` (además de `cursor`). Junto al `nav` de estados, si `showSort`:

```tsx
{showSort&&<nav aria-label={t("sort")} className="flex gap-1">{(["recent","rating"] as const).map(sort=><Link key={sort} href={href({sort:sort==="recent"?undefined:sort})} aria-current={(filters.sort??"recent")===sort?"page":undefined} className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${(filters.sort??"recent")===sort?"bg-foreground text-background":"text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}>{t(sort==="recent"?"sortRecent":"sortRating")}</Link>)}</nav>}
```

`href` serializa `sort` como cualquier otro filtro. Para que «Recientes» genere una URL limpia, tratar `"recent"` como el `"all"` de `state`: no se escribe.

En `experience-card.tsx`: en la fila de estado/fecha, añadir `<ExperienceRating rating={e.rating}/>` antes de `<ExperienceDate …/>`.

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npx vitest run src/components; npx tsc --noEmit; npm run lint`
Expected: PASS, 0 errores de tipos y ningún error de lint nuevo.

- [ ] **Paso 6: Commit**

```bash
git add src/components src/app/experiencias/page.tsx docs/UI-GLOSARIO.md messages/es.json
git commit -m "feat(experiencias): favorito con cinta, tipos nuevos, nota en tarjetas y orden por nota"
```

---

### Tarea 14: Moderación en el panel de admin

**Files:**
- Modify: `messages/es.json` (`kinds` del panel de moderación, línea ~2563)
- Modify: los componentes del panel que listan `CONTENT_KINDS` (localizar con `rg "CONTENT_KINDS" src`)

- [ ] **Paso 1: Localizar los consumidores**

Run: `rg -n "CONTENT_KINDS|kinds\.experience\b|\"experience\": \"Experiencia\"" src messages`
Expected: el selector de tipo del panel de moderación y la traducción de `kinds`.

- [ ] **Paso 2: Copy y renderizado**

Añadir `"experience_review": "Reseña de experiencia"` al objeto `kinds` del namespace de moderación. Si el panel renderiza el snapshot por tipo con un `switch`, añadir el caso `experience_review`: muestra `rating` (con `RatingDots` de solo lectura) y `body`, que son los campos que guarda `prepare_content_report` en la Tarea 6.

- [ ] **Paso 3: Ejecutar tests del panel**

Run: `npx vitest run src/components/admin src/lib/moderation; npx tsc --noEmit`
Expected: PASS y 0 errores. (Si la carpeta tiene otro nombre, usar la que salió en el Paso 1.)

- [ ] **Paso 4: Commit**

```bash
git add src messages/es.json
git commit -m "feat(moderacion): reseñas de experiencia en el panel"
```

---

### Tarea 15: E2E contra build de producción

**Files:**
- Create: `e2e/experiencias-resenas.spec.ts`, `e2e/experiencias-resenas-social.spec.ts`
- Modify: `e2e/support/experience-fixtures.ts` (solo si falta algún helper)

**Requisito previo:** los E2E con actores corren contra `biblioshare-dev` (`experienceClientRest` lo exige). Antes de esta tarea, hacer los Pasos 1–2 de la Tarea 16 (aplicar y verificar las migraciones en dev).

**Interfaces:**
- Consumes: `experienceOwner`, `experienceActor`, `deleteExperienceActor`, `clearExperienceFixtures`, `loginExperienceUser`, `experienceRest`, `experienceClientRest`, `setExperienceAudience`, `EXPERIENCE_QA_PREFIX`.

- [ ] **Paso 1: Escribir los specs**

`e2e/experiencias-resenas.spec.ts`:

```ts
import {test,expect} from "@playwright/test";
import {EXPERIENCE_QA_PREFIX,experienceOwner,experienceActor,deleteExperienceActor,clearExperienceFixtures,loginExperienceUser,experienceRest} from "./support/experience-fixtures";
test.describe.configure({mode:"serial"});
let owner="",friend:Awaited<ReturnType<typeof experienceActor>>,id="";
test.beforeAll(async()=>{owner=await experienceOwner();friend=await experienceActor("resenas-friend");await clearExperienceFixtures(owner);});
test.afterAll(async()=>{await clearExperienceFixtures(owner);await deleteExperienceActor(friend);});
test("organizer marks a plan lived, confirms attendance and reviews",async({page})=>{
  await loginExperienceUser(page);
  await page.goto("/experiencias/nueva?kind=food");
  await page.getByLabel("Nombre").fill(`${EXPERIENCE_QA_PREFIX}Cena reseñable`);
  await page.getByRole("button",{name:"Guardar"}).click();
  await page.waitForURL(/\/experiencia\//);id=page.url().split("/experiencia/")[1];
  await page.getByRole("button",{name:"Lo vivimos"}).click();
  await page.getByRole("button",{name:"Guardar"}).click();
  await page.getByRole("link",{name:"Reseñar ahora"}).click();
  await page.getByRole("button",{name:"Reseñar"}).click();
  await page.getByLabel("Qué tal fue").fill("Repetiría");
  await page.getByRole("button",{name:"Guardar reseña"}).click();
  await expect(page.getByText("Repetiría")).toBeVisible();
});
test("a companion sees the review and the average",async({browser})=>{
  // Seed the accepted companion with the service role, as experiencias-participacion.spec.ts does.
  const moment=(await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=id`)).json() as {id:string}[])[0].id;
  await experienceRest(`experiences?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({audience:"participants"})});
  const [person]=await (await experienceRest("experience_participants",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({experience_id:id,user_id:friend.id,invitation_state:"accepted"})})).json() as {id:string}[];
  await experienceRest("experience_moment_participants",{method:"POST",body:JSON.stringify({experience_id:id,moment_id:moment,participant_id:person.id,attendance_state:"attended"})});
  const page=await browser.newPage();
  await loginExperienceUser(page,friend);
  await page.goto(`/experiencia/${id}`);
  await expect(page.getByText("Repetiría")).toBeVisible();
});
test("unattending with a review asks to delete it",async({page})=>{
  await loginExperienceUser(page);
  await page.goto(`/experiencia/${id}`);
  await page.getByRole("radio",{name:"No fui"}).check({force:true});
  await expect(page.getByText(/se borrará junto con su publicación/)).toBeVisible();
  await page.getByRole("button",{name:"Cambiar y borrar la reseña"}).click();
  await expect(page.getByText("Repetiría")).toHaveCount(0);
});
```

`experienceRest` usa la service role (solo local/dev), igual que `experiencias-participacion.spec.ts`. Ahí, `experienceActor` devuelve `{id,email,password,…}`; comprobar la forma exacta en `e2e/support/experience-fixtures.ts:71`. La etiqueta del radio («No fui») es la de `attendance.skipped` en `messages/es.json`; comprobarla allí. Los E2E con actores necesitan `biblioshare-dev`: `experienceClientRest` lo exige.

`e2e/experiencias-resenas-social.spec.ts` sigue el mismo esqueleto, con un tercer actor `outsider` público:
1. El organizador crea una experiencia vivida con audiencia `profile` (`setExperienceAudience(page,"profile")`) y la reseña.
2. Activa «Compartir fuera del grupo» y la identidad compartida (el control existente de participantes), y pulsa «Publicar en tu actividad».
3. `outsider` abre `/` y ve el post con «reseñó …»; abre el perfil del organizador → pestaña Experiencias y ve el extracto.
4. El organizador desactiva «Compartir fuera del grupo».
5. `outsider` abre la URL `/post/<id>` que tenía y recibe 404; el post ya no está en el feed.

Para la URL del post, leerla del enlace de la tarjeta del feed en el paso 3 (`href` de `PostSummary`).

- [ ] **Paso 2: Build y servidor**

Run (PowerShell): `Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess` → si hay proceso, `Stop-Process -Id <pid>`. Después `npm run build`, y `npm run start` en segundo plano; esperar a que `curl -s -o NUL -w "%{http_code}" http://localhost:3000` devuelva `200`.
Expected: build sin errores y servidor en 3000.

- [ ] **Paso 3: Ejecutar los E2E nuevos y los de experiencias**

Run: `npx playwright test e2e/experiencias-resenas.spec.ts e2e/experiencias-resenas-social.spec.ts --workers=1`
Expected: PASS. Después: `npx playwright test e2e/experiencias- --workers=1` → PASS (sin regresiones en participación, fotos, social, moderación, historial y retirada).

- [ ] **Paso 4: Parar el servidor y commit**

Parar el `next start`.

```bash
git add e2e
git commit -m "test(experiencias): e2e de reseñas, publicación y revocación"
```

---

### Tarea 16: Despliegue en dev y producción, y documentación de cierre

**Files:**
- Modify: `docs/requirements/data-model.md`, `docs/requirements/decisiones.md`, `docs/requirements/backlog.md`, `docs/architecture/graph.json`
- Create: `docs/testing/2026-10-04-experiencias-resenas.md`

- [ ] **Paso 1: Aplicar en `biblioshare-dev`**

Aplicar las cinco migraciones en orden con el MCP `supabase-dev` (`apply_migration`), con el contenido exacto de cada fichero. Si el MCP no conecta, usar el conector de claude.ai con el `project_id` de dev (ver memoria `supabase-mcp-fallback`). La de enums va sola.

- [ ] **Paso 2: Verificar dev contra objetos reales**

Ejecutar en dev:
```sql
select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in ('experience_save_moment_review','experience_set_review_sharing','experience_delete_moment_review','experience_publish_review','experience_unpublish_review','get_experience_review_publications','get_experience_rating_summaries','get_own_experiences_ranked','experience_report_review','experience_set_attendance','is_experience_kind','can_view_experience_review') order by 1;
select relrowsecurity from pg_class where oid='public.experience_moment_reviews'::regclass;
select policyname from pg_policies where tablename in ('experience_moment_reviews','posts') and policyname like '%experience%';
select grantee, privilege_type from information_schema.role_table_grants where table_name='experience_moment_reviews';
```
Expected: 12 funciones (`experience_set_attendance` solo con 3 argumentos), RLS `true`, las dos policies, y solo `SELECT` para `anon`/`authenticated`. Ejecutar también `supabase/tests/experiences_reviews.sql` en dev (acaba en `rollback`). Correr la superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) para `experience_moment_reviews` y `posts`.

- [ ] **Paso 3: Documentación**

- `data-model.md`: sección de Experiencias con la tabla nueva, helper, RPC, triggers, ampliación del CHECK de tipos y nueva firma de `experience_set_attendance`, con fecha «verificado en dev 2026-10-0X».
- `decisiones.md` (al final, append-only): (1) reseña por momento condicionada a asistencia confirmada; (2) media sobre las reseñas visibles para quien mira, que fuera del grupo difiere de la del grupo (precedente #436); (3) tabla propia frente a columnas en la asistencia; (4) los posts de reseña no avisan a seguidores, solo al grupo.
- `backlog.md`: casilla nueva marcada bajo Experiencias, con enlace a la spec y a la evidencia.
- `graph.json`: nodo de la tabla y flujo «reseñar un momento» con sus ficheros. Regenerar según `docs/architecture/README.md`.
- `docs/testing/2026-10-04-experiencias-resenas.md`: resultados de unitarios, SQL local y dev, E2E y verificación de objetos, distinguiendo entorno por entorno.

- [ ] **Paso 4: Commit y PR**

```bash
git add docs
git commit -m "docs(experiencias): reseñas por momento verificadas en dev"
git push -u origin feat/experiencias-resenas
gh pr create --title "Experiencias: reseñas por momento" --body-file <cuerpo con resumen, pruebas y enlace a la spec>
```

La PR incluye la respuesta escrita a la regla #437: ninguna función nueva usa `use cache`, y la media depende de la sesión.

- [ ] **Paso 5: Producción (operación final aparte)**

Solo cuando la PR esté revisada y el propietario dé el visto bueno, y en un turno aparte: aplicar las cinco migraciones en producción en el mismo orden, repetir las consultas del Paso 2 contra producción y añadir el resultado a la evidencia. No declarar producción por el ledger.

---

## Fuera de este plan (issues ya abiertas)

- #1353: la cabecera del detalle omite al organizador cuando mira un invitado.
- #1354: cada momento del álbum muestra solo su primera foto.
