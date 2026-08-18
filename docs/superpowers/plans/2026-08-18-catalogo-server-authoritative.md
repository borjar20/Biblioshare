# Catálogo global server-authoritative (cierre del envenenamiento #674) — Plan de implementación

> **Ajuste post-verificación (2026-08-18):** durante la ejecución, la verificación en dev
> cambió el diseño de la parte SQL — la hidratación es fill-only (no autoritativa §3c) y se
> añadió el bypass del trigger por flag `app.hydrating`; ver `docs/requirements/decisiones.md`.
> Migraciones reales: `20260818_catalog_a..f`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el envenenamiento del catálogo global (#674): que un usuario `authenticated` no pueda escribir campos canónicos (`title`, `synopsis`, `director`…) de `movies`/`series`/`books`; el servidor pasa a ser la única fuente de esos datos, obtenidos del proveedor oficial por el id externo.

**Architecture:** Alta en dos partes. (1) **Shell**: una RPC `SECURITY DEFINER` (`register_catalog_item`) inserta una fila con **solo** el id externo; se revoca el `INSERT` directo. (2) **Hidratación**: RPCs definer fill-only (`hydrate_movie`/`hydrate_series`, hermanas de `hydrate_book`) rellenan los canónicos con datos de un fetch server-side por id. Guard `hydrated_at`: shell sin hidratar → escritura autoritativa (corrige pre-envenenamiento); ya hidratada → fill-only (no pisa curación de colaborador). Los call sites descartan los canónicos que trae el cliente y dejan que el servidor re-obtenga por id.

**Tech Stack:** Next.js (variante del repo, RSC + server actions), Supabase (Postgres + RLS + PostgREST + RPC `SECURITY DEFINER`), TMDB/OpenLibrary como proveedores, Vitest (unit de funciones puras), Playwright (e2e), pgTAP/SQL de regresión para el esquema.

## Global Constraints

- **Migraciones: dev primero (`supabase-dev`), luego prod.** "No aparece en `list_migrations`" ≠ "no está en prod": verificar contra objetos reales (`pg_proc`/`pg_class`), no el ledger. (AGENTS.md)
- **Superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) es obligatoria** al añadir columnas o cambiar grants: una columna sin su grant rompe la escritura ENTERA de la tabla, compila y revienta en prod (#375).
- **Fuente de verdad del esquema:** `docs/requirements/data-model.md` (actualizar fecha de verificación). Ficheros de migración: `supabase/migrations/`. Dump consolidado: `supabase/schema-baseline.sql`.
- **Convención de nombre de migración de esta PR:** `20260818_catalog_<letra>_<desc>.sql` (sufijo de letra fuerza el orden dentro del día).
- **Toda RPC nueva `SECURITY DEFINER`:** `set search_path = public`, `raise exception` si `auth.uid() is null`, `revoke all from public; grant execute to authenticated`.
- **`ensure*Hydrated` NUNCA lanza** (envuelto en try/catch); un fallo de API externa no puede tumbar el render de una ficha.
- **Regla #437 (caché/RLS):** este trabajo NO introduce `use cache`; el catálogo se lee bajo `<Suspense>` con el cliente de la petición como hoy. No cambiar eso.
- **Definición de "hecho":** al cerrar, `data-model.md` + `decisiones.md` sincronizados, superficie 6 corrida, casilla de backlog / issue #674 actualizada. Un cambio no está hecho hasta que el doc canónico vuelve a ser cierto.

## Decisiones tomadas (ajustes al spec, verificados contra código)

Estas resuelven gaps que la verificación contra el código destapó respecto al spec `docs/superpowers/specs/2026-08-14-catalogo-server-authoritative-design.md`. Se registran en `decisiones.md` (Task 13).

1. **`title` pasa a NULLABLE** en `movies`/`series`/`books`. El spec dice "la shell nace con canónicos NULL", pero `title` es `NOT NULL` hoy → una shell vacía violaría el constraint. Se hace `drop not null`; la UI muestra placeholder mientras `hydrated_at IS NULL`.
2. **Sin `created_by`.** El spec pide `created_by = auth.uid()` en la shell, pero esa columna NO existe en las tres tablas (solo en `book_editions`/`movie_versions`). No aporta a cerrar #674 (la garantía es que la shell tiene el id externo correcto). Se omite; si se quiere auditoría, issue aparte.
3. **Revocar INSERT = `drop policy` + `revoke insert`.** El INSERT no cuelga de grants por columna (no existen) sino de las policies `catalog * insertable with check(true)` (`schema-baseline.sql:147-155`) + el privilegio de tabla por defecto. Hay que quitar ambos.
4. **Fetchers de hidratación dedicados**, no `getMovieAsSearchResult`. Éste (`SearchResult`) NO trae `director` ni `duration_minutes`, y no existe `getSeriesAsSearchResult`. `director`/`creator` viven en `ScreenDetails.credits` (rol `"director"`/`"creator"`). Se crean `getMovieForHydration`/`getSeriesForHydration`: una llamada `?append_to_response=credits` que mapea todos los canónicos + director/creator + runtime/seasons.
5. **RPCs bulk para el camino de créditos de persona.** `findOrCreateCatalogItemsBulk` fue optimizado a ~6 consultas para 300 créditos (comentario en `find-or-create.ts:49-58`); RPC-por-ítem sería 300+ llamadas. Se añaden `register_catalog_items_bulk` + `hydrate_screens_bulk`. La revocación del INSERT (Task 11) va al final para no romper este camino durante la migración.

---

## Orden y acoplamiento (leer antes de empezar)

La revocación del INSERT (Task 11) **rompe todos los call sites que aún inserten directo**. Por eso el orden es: construir RPCs (Tasks 1-4) → migrar TODO el código a las RPCs (Tasks 5-9) → tests (Task 10) → **recién entonces** revocar (Task 11). En dev se aplican todas las migraciones seguidas; el código nuevo debe estar desplegado antes/junto a la migración de revocación en prod (mergear código + migraciones juntos, aplicar a prod con el deploy).

## File Structure

- `supabase/migrations/20260818_catalog_a_shell_columns.sql` — **crear**. `title` nullable + `hydrated_at` en movies/series + grants.
- `supabase/migrations/20260818_catalog_b_hydrate_screen.sql` — **crear**. `hydrate_movie`, `hydrate_series`, `hydrate_screens_bulk`.
- `supabase/migrations/20260818_catalog_c_hydrate_book_authoritative.sql` — **crear**. `hydrate_book` → autoritativa-si-no-hidratada.
- `supabase/migrations/20260818_catalog_d_register.sql` — **crear**. `register_catalog_item`, `register_catalog_items_bulk`.
- `supabase/migrations/20260818_catalog_e_revoke_insert.sql` — **crear**. Drop policies + revoke insert.
- `src/lib/catalog/tmdb.ts` — **modificar**. Añadir `getMovieForHydration`, `getSeriesForHydration` y sus tipos.
- `src/lib/catalog/hydrate-screen.ts` — **crear**. `ensureMovieHydrated`, `ensureSeriesHydrated`.
- `src/lib/catalog/hydrate-screen.test.ts` — **crear**. Unit (fetch mockeado) fill-only vs autoritativa.
- `src/lib/catalog/tmdb-hydration.test.ts` — **crear**. Unit del mapeo de los fetchers.
- `src/lib/catalog/find-or-create.ts` — **modificar**. Shell+hidratar; descartar canónicos.
- `src/lib/catalog/find-or-create-bulk.test.ts` — **modificar**. Adaptar al flujo shell.
- `src/lib/import/match-row.test.ts` — **modificar** si cambia el contrato observado.
- `src/app/buscar/actions.ts` — **modificar**. Generalizar hidratación a movie/series.
- `src/app/pelicula/[id]/page.tsx` — **modificar**. `after(() => ensureMovieHydrated(...))`.
- `src/app/serie/[id]/page.tsx` — **modificar**. `after(() => ensureSeriesHydrated(...))`.
- `src/components/**` (catálogo/detail/library) — **modificar**. Fallback de `title` null.
- `messages/es.json` — **modificar**. Clave `catalog.untitled`.
- `e2e/catalogo-server-authoritative.spec.ts` — **crear**.
- `docs/requirements/data-model.md`, `docs/requirements/decisiones.md`, `docs/DRIFT-CHECK.md`, `docs/requirements/backlog.md` — **modificar** (cierre).

---

### Task 1: Migración A — `title` nullable + `hydrated_at` en movies/series + grants

**Files:**
- Create: `supabase/migrations/20260818_catalog_a_shell_columns.sql`

**Interfaces:**
- Produces: columnas `movies.hydrated_at timestamptz`, `series.hydrated_at timestamptz`; `title` nullable en las tres tablas; `grant update (hydrated_at)` a `authenticated` en movies/series.

- [ ] **Step 1: Escribir la migración**

```sql
-- #674 catálogo server-authoritative — parte A: preparar las columnas de la shell.
--
-- La shell nace SIN canónicos (todos NULL) y los rellena la hidratación al abrir
-- la ficha. `title` era NOT NULL en las tres tablas, lo que impedía la shell
-- vacía; se hace nullable. La UI muestra un placeholder mientras hydrated_at IS
-- NULL (ver find-or-create y los renders de obra).
alter table public.movies alter column title drop not null;
alter table public.series alter column title drop not null;
alter table public.books  alter column title drop not null;

-- Guard de hidratación, hermano de books.hydrated_at (20260715_book_hydration):
-- si está puesto, no se vuelve a preguntar al proveedor por esta obra.
alter table public.movies add column hydrated_at timestamptz;
alter table public.series add column hydrated_at timestamptz;

-- La hidratación la dispara la ficha con la sesión del visitante (no colaborador),
-- igual que books.hydrated_at. Sin este grant, un authenticated no puede marcar la
-- fila y la escritura de la RPC fill-only fallaría en silencio (#375).
grant update (hydrated_at) on public.movies to authenticated;
grant update (hydrated_at) on public.series to authenticated;
```

- [ ] **Step 2: Aplicar en dev y verificar objetos reales**

Aplicar contra `supabase-dev` (MCP `apply_migration` o CLI). Verificar (no el ledger, los objetos):

```sql
select table_name, is_nullable from information_schema.columns
 where table_schema='public' and column_name='title' and table_name in ('movies','series','books');
-- Esperado: las tres YES.
select table_name from information_schema.columns
 where table_schema='public' and column_name='hydrated_at' and table_name in ('movies','series');
-- Esperado: movies, series.
select table_name, privilege_type, column_name from information_schema.column_privileges
 where grantee='authenticated' and column_name='hydrated_at' and table_name in ('movies','series');
-- Esperado: UPDATE en movies y series.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260818_catalog_a_shell_columns.sql
git commit -m "feat(catalog): title nullable + hydrated_at en movies/series (#674)"
```

---

### Task 2: Migración B — `hydrate_movie` / `hydrate_series` / `hydrate_screens_bulk`

**Files:**
- Create: `supabase/migrations/20260818_catalog_b_hydrate_screen.sql`

**Interfaces:**
- Consumes: `movies.hydrated_at`, `series.hydrated_at` (Task 1).
- Produces:
  - `hydrate_movie(p_movie_id uuid, p_title text, p_original_title text, p_director text, p_synopsis text, p_genres text[], p_release_year int, p_cover_url text, p_duration_minutes int) returns void`
  - `hydrate_series(p_series_id uuid, p_title text, p_original_title text, p_creator text, p_synopsis text, p_genres text[], p_release_year int, p_cover_url text, p_total_seasons int, p_total_episodes int, p_episode_runtime_minutes int) returns void`
  - `hydrate_screens_bulk(p_item_type text, p_rows jsonb) returns void`

**Semántica (§3c del spec):** `hydrated_at IS NULL` → **autoritativa** (pisa lo que haya, marca `hydrated_at`). `hydrated_at IS NOT NULL` → **fill-only** (solo huecos, nunca pisa). Un `p_*` NULL nunca borra un valor existente.

- [ ] **Step 1: Escribir la migración**

```sql
-- #674 parte B: hidratación de pantalla (peli/serie), hermana de hydrate_book.
-- Guard hydrated_at: shell sin hidratar => escritura AUTORITATIVA (corrige una
-- shell que llegara pre-envenenada; la primera apertura legítima manda). Ya
-- hidratada => FILL-ONLY, jamás pisa lo que un colaborador curó a mano.
create or replace function public.hydrate_movie(
  p_movie_id uuid,
  p_title text default null,
  p_original_title text default null,
  p_director text default null,
  p_synopsis text default null,
  p_genres text[] default null,
  p_release_year int default null,
  p_cover_url text default null,
  p_duration_minutes int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fresh boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select hydrated_at is null into v_fresh from public.movies where id = p_movie_id;
  if v_fresh is null then return; end if; -- no existe

  update public.movies set
    title            = case when v_fresh then coalesce(p_title, title)
                            when title is null or title = '' then p_title else title end,
    original_title   = case when v_fresh then coalesce(p_original_title, original_title)
                            when original_title is null or original_title = '' then p_original_title else original_title end,
    director         = case when v_fresh then coalesce(p_director, director)
                            when director is null or director = '' then p_director else director end,
    synopsis         = case when v_fresh then coalesce(p_synopsis, synopsis)
                            when synopsis is null or synopsis = '' then left(p_synopsis, 5000) else synopsis end,
    genres           = case when v_fresh then coalesce(p_genres, genres)
                            when genres is null or cardinality(genres) = 0 then p_genres else genres end,
    release_year     = case when v_fresh then coalesce(p_release_year, release_year)
                            when release_year is null then p_release_year else release_year end,
    cover_url        = case when v_fresh then coalesce(p_cover_url, cover_url)
                            when cover_url is null or cover_url = '' then p_cover_url else cover_url end,
    duration_minutes = case when v_fresh then coalesce(p_duration_minutes, duration_minutes)
                            when duration_minutes is null then p_duration_minutes else duration_minutes end,
    hydrated_at      = now()
  where id = p_movie_id;
end;
$$;

create or replace function public.hydrate_series(
  p_series_id uuid,
  p_title text default null,
  p_original_title text default null,
  p_creator text default null,
  p_synopsis text default null,
  p_genres text[] default null,
  p_release_year int default null,
  p_cover_url text default null,
  p_total_seasons int default null,
  p_total_episodes int default null,
  p_episode_runtime_minutes int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fresh boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select hydrated_at is null into v_fresh from public.series where id = p_series_id;
  if v_fresh is null then return; end if;

  update public.series set
    title                   = case when v_fresh then coalesce(p_title, title)
                                   when title is null or title = '' then p_title else title end,
    original_title          = case when v_fresh then coalesce(p_original_title, original_title)
                                   when original_title is null or original_title = '' then p_original_title else original_title end,
    creator                 = case when v_fresh then coalesce(p_creator, creator)
                                   when creator is null or creator = '' then p_creator else creator end,
    synopsis                = case when v_fresh then coalesce(p_synopsis, synopsis)
                                   when synopsis is null or synopsis = '' then left(p_synopsis, 5000) else synopsis end,
    genres                  = case when v_fresh then coalesce(p_genres, genres)
                                   when genres is null or cardinality(genres) = 0 then p_genres else genres end,
    release_year            = case when v_fresh then coalesce(p_release_year, release_year)
                                   when release_year is null then p_release_year else release_year end,
    cover_url               = case when v_fresh then coalesce(p_cover_url, cover_url)
                                   when cover_url is null or cover_url = '' then p_cover_url else cover_url end,
    total_seasons           = case when v_fresh then coalesce(p_total_seasons, total_seasons)
                                   when total_seasons is null then p_total_seasons else total_seasons end,
    total_episodes          = case when v_fresh then coalesce(p_total_episodes, total_episodes)
                                   when total_episodes is null then p_total_episodes else total_episodes end,
    episode_runtime_minutes = case when v_fresh then coalesce(p_episode_runtime_minutes, episode_runtime_minutes)
                                   when episode_runtime_minutes is null then p_episode_runtime_minutes else episode_runtime_minutes end,
    hydrated_at             = now()
  where id = p_series_id;
end;
$$;

-- Camino de créditos de persona (origen servidor, datos de TMDB ya en mano): una
-- sola llamada aplica muchas filas. p_rows = jsonb array de objetos con las mismas
-- claves que los parámetros de hydrate_movie/hydrate_series (sin el prefijo p_ y en
-- camelCase se mapean fuera; aquí llegan ya como snake_case: item_id, title, ...).
create or replace function public.hydrate_screens_bulk(
  p_item_type text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type = 'movie' then
    for r in select * from jsonb_array_elements(p_rows) loop
      perform public.hydrate_movie(
        (r->>'item_id')::uuid,
        r->>'title', r->>'original_title', r->>'director', r->>'synopsis',
        case when r ? 'genres' then array(select jsonb_array_elements_text(r->'genres')) else null end,
        (r->>'release_year')::int, r->>'cover_url', (r->>'duration_minutes')::int
      );
    end loop;
  elsif p_item_type = 'series' then
    for r in select * from jsonb_array_elements(p_rows) loop
      perform public.hydrate_series(
        (r->>'item_id')::uuid,
        r->>'title', r->>'original_title', r->>'creator', r->>'synopsis',
        case when r ? 'genres' then array(select jsonb_array_elements_text(r->'genres')) else null end,
        (r->>'release_year')::int, r->>'cover_url',
        (r->>'total_seasons')::int, (r->>'total_episodes')::int, (r->>'episode_runtime_minutes')::int
      );
    end loop;
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;
end;
$$;

revoke all on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int) from public;
grant execute on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int) to authenticated;
revoke all on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int) from public;
grant execute on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int) to authenticated;
revoke all on function public.hydrate_screens_bulk(text, jsonb) from public;
grant execute on function public.hydrate_screens_bulk(text, jsonb) to authenticated;

comment on function public.hydrate_movie is
  '#674: hidrata una película desde el proveedor. hydrated_at NULL => autoritativa; ya hidratada => fill-only. Ver spec 2026-08-14.';
comment on function public.hydrate_series is
  '#674: hidrata una serie desde el proveedor. hydrated_at NULL => autoritativa; ya hidratada => fill-only. Ver spec 2026-08-14.';
```

- [ ] **Step 2: Aplicar en dev + SQL de regresión de la semántica**

Aplicar en `supabase-dev`. Ejecutar como un usuario autenticado de prueba (o con `auth.uid()` simulado según el helper de tests SQL del repo). Verificar:

```sql
-- Fresca (hydrated_at NULL): autoritativa pisa un valor "envenenado".
-- 1) crear shell envenenada manualmente como owner: insert movies(tmdb_id, title) values (999001,'FAKE');
-- 2) hydrate_movie(id, p_title=>'Real', ...) => title pasa a 'Real', hydrated_at NOT NULL.
-- Ya hidratada: fill-only, no pisa.
-- 3) hydrate_movie(id, p_title=>'Basura') de nuevo => title sigue 'Real'.
```

Esperado: paso 2 pisa; paso 3 no. Documentar el resultado en el commit o en el PR.

- [ ] **Step 3: Verificar los objetos**

```sql
select proname from pg_proc where proname in ('hydrate_movie','hydrate_series','hydrate_screens_bulk');
-- Esperado: las tres.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818_catalog_b_hydrate_screen.sql
git commit -m "feat(catalog): hydrate_movie/series fill-only+autoritativa (#674)"
```

---

### Task 3: Migración C — `hydrate_book` a autoritativa-si-no-hidratada

**Files:**
- Create: `supabase/migrations/20260818_catalog_c_hydrate_book_authoritative.sql`

**Interfaces:**
- Consumes: `hydrate_book(uuid, text, text[], text)` existente (`20260715_book_hydration.sql`).
- Produces: misma firma, nueva semántica (uniforme con Task 2).

**Cambio de comportamiento deliberado (se registra en `decisiones.md`, Task 13):** hoy `hydrate_book` es fill-only puro; pasa a autoritativa cuando `hydrated_at IS NULL` para que una shell pre-envenenada se corrija en la primera apertura, igual que peli/serie.

- [ ] **Step 1: Escribir la migración**

```sql
-- #674 parte C: hydrate_book se alinea con hydrate_movie/series. Antes fill-only
-- puro; ahora AUTORITATIVA si la fila no estaba hidratada (hydrated_at NULL), y
-- fill-only una vez hidratada. Cambio de comportamiento acotado y deliberado
-- (decisiones.md 2026-08-18): cierra el envenenamiento de una shell recién creada.
create or replace function public.hydrate_book(
  p_book_id uuid,
  p_synopsis text default null,
  p_genres text[] default null,
  p_cover_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fresh boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select hydrated_at is null into v_fresh from public.books where id = p_book_id;
  if v_fresh is null then return; end if;

  update public.books set
    synopsis  = case when v_fresh then coalesce(left(p_synopsis, 5000), synopsis)
                     when (synopsis is null or synopsis = '') and p_synopsis is not null then left(p_synopsis, 5000) else synopsis end,
    genres    = case when v_fresh then coalesce(p_genres, genres)
                     when (genres is null or cardinality(genres) = 0) and p_genres is not null then p_genres else genres end,
    cover_url = case when v_fresh then coalesce(p_cover_url, cover_url)
                     when (cover_url is null or cover_url = '') and p_cover_url is not null then p_cover_url else cover_url end,
    hydrated_at = now()
  where id = p_book_id;
end;
$$;

comment on function public.hydrate_book is
  '#674: cache-as-you-go de la obra. hydrated_at NULL => autoritativa; ya hidratada => fill-only (no pisa curación). Antes era fill-only puro (spec 2026-07-14, ajustado 2026-08-14).';
```

- [ ] **Step 2: Aplicar en dev, verificar que sigue rellenando huecos y ahora pisa una shell fresca**

Aplicar en `supabase-dev`. Regresión: sobre una fila con `hydrated_at NOT NULL` y `synopsis` curada, `hydrate_book(id, 'basura')` NO pisa; sobre una shell `hydrated_at NULL`, sí escribe.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260818_catalog_c_hydrate_book_authoritative.sql
git commit -m "feat(catalog): hydrate_book autoritativa-si-no-hidratada (#674)"
```

---

### Task 4: Migración D — `register_catalog_item` + `register_catalog_items_bulk`

**Files:**
- Create: `supabase/migrations/20260818_catalog_d_register.sql`

**Interfaces:**
- Produces:
  - `register_catalog_item(p_item_type text, p_external_id text) returns uuid`
  - `register_catalog_items_bulk(p_item_type text, p_external_ids text[]) returns table(external_id text, id uuid)`

- [ ] **Step 1: Escribir la migración**

```sql
-- #674 parte D: alta = shell sin canónicos. El cliente aporta SOLO el id externo;
-- ningún campo canónico entra por aquí. SECURITY DEFINER escribe como owner, así
-- que no necesita el grant de INSERT (que se revoca en la parte E). on conflict
-- do nothing + re-select resuelve la carrera igual que hoy (23505).
create or replace function public.register_catalog_item(
  p_item_type text,
  p_external_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type = 'book' then
    insert into public.books (openlibrary_work_key) values (p_external_id)
      on conflict (openlibrary_work_key) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.books where openlibrary_work_key = p_external_id;
    end if;
  elsif p_item_type = 'movie' then
    insert into public.movies (tmdb_id) values (p_external_id::int)
      on conflict (tmdb_id) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.movies where tmdb_id = p_external_id::int;
    end if;
  elsif p_item_type = 'series' then
    insert into public.series (tmdb_id) values (p_external_id::int)
      on conflict (tmdb_id) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.series where tmdb_id = p_external_id::int;
    end if;
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;

  return v_id;
end;
$$;

-- Alta en lote para el camino de créditos de persona (una llamada, no N).
create or replace function public.register_catalog_items_bulk(
  p_item_type text,
  p_external_ids text[]
)
returns table(external_id text, id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type = 'book' then
    insert into public.books (openlibrary_work_key)
      select unnest(p_external_ids) on conflict (openlibrary_work_key) do nothing;
    return query
      select b.openlibrary_work_key, b.id from public.books b
       where b.openlibrary_work_key = any(p_external_ids);
  elsif p_item_type = 'movie' then
    insert into public.movies (tmdb_id)
      select unnest(p_external_ids)::int on conflict (tmdb_id) do nothing;
    return query
      select m.tmdb_id::text, m.id from public.movies m
       where m.tmdb_id = any(select unnest(p_external_ids)::int);
  elsif p_item_type = 'series' then
    insert into public.series (tmdb_id)
      select unnest(p_external_ids)::int on conflict (tmdb_id) do nothing;
    return query
      select s.tmdb_id::text, s.id from public.series s
       where s.tmdb_id = any(select unnest(p_external_ids)::int);
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;
end;
$$;

revoke all on function public.register_catalog_item(text, text) from public;
grant execute on function public.register_catalog_item(text, text) to authenticated;
revoke all on function public.register_catalog_items_bulk(text, text[]) from public;
grant execute on function public.register_catalog_items_bulk(text, text[]) to authenticated;

comment on function public.register_catalog_item is
  '#674: alta de catálogo = shell con SOLO el id externo. Los canónicos los pone la hidratación server-side. Ver spec 2026-08-14.';
```

- [ ] **Step 2: Aplicar en dev + regresión**

Aplicar en `supabase-dev`. Como usuario autenticado de prueba:
- `select register_catalog_item('movie','999123')` → devuelve un uuid; la fila tiene `title IS NULL`, `tmdb_id=999123`, `hydrated_at IS NULL`.
- Segunda llamada con el mismo id → devuelve el MISMO uuid (no crea otra).
- `select * from register_catalog_items_bulk('movie', array['999123','999124'])` → dos filas con sus ids.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260818_catalog_d_register.sql
git commit -m "feat(catalog): register_catalog_item(+bulk) shell definer (#674)"
```

---

### Task 5: Fetchers de hidratación TMDB (`getMovieForHydration`, `getSeriesForHydration`)

**Files:**
- Modify: `src/lib/catalog/tmdb.ts`
- Test: `src/lib/catalog/tmdb-hydration.test.ts` (crear)

**Interfaces:**
- Produces:
```ts
export type MovieHydration = {
  title: string | null; originalTitle: string | null; director: string | null;
  synopsis: string | null; genres: string[] | null; year: number | null;
  coverUrl: string | null; durationMinutes: number | null;
};
export type SeriesHydration = {
  title: string | null; originalTitle: string | null; creator: string | null;
  synopsis: string | null; genres: string[] | null; year: number | null;
  coverUrl: string | null; totalSeasons: number | null; totalEpisodes: number | null;
  episodeRuntimeMinutes: number | null;
};
export function getMovieForHydration(tmdbId: number): Promise<MovieHydration | null>;
export function getSeriesForHydration(tmdbId: number): Promise<SeriesHydration | null>;
```
- Consumes: `tmdbGet`, `resolveGenresFromIds`, `pickEpisodeRuntime`, `TMDB_IMAGE_BASE` (ya en `tmdb.ts`).

- [ ] **Step 1: Escribir el test que falla**

`src/lib/catalog/tmdb-hydration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const g = globalThis as unknown as { fetch: typeof fetch };

function mockTmdb(payload: unknown) {
  g.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as Response);
}

describe("getMovieForHydration", () => {
  const prev = process.env.TMDB_API_KEY;
  beforeEach(() => { process.env.TMDB_API_KEY = "test-token"; });
  afterEach(() => { process.env.TMDB_API_KEY = prev; vi.restoreAllMocks(); });

  it("mapea título, director (de credits), año, duración y géneros", async () => {
    mockTmdb({
      title: "El viaje de Chihiro",
      original_title: "千と千尋の神隠し",
      overview: "Una niña…",
      poster_path: "/p.jpg",
      release_date: "2001-07-20",
      runtime: 125,
      genres: [{ id: 16 }, { id: 10751 }],
      credits: { crew: [{ id: 1, name: "Hayao Miyazaki", job: "Director" }], cast: [] },
    });
    const { getMovieForHydration } = await import("./tmdb");
    const r = await getMovieForHydration(129);
    expect(r?.title).toBe("El viaje de Chihiro");
    expect(r?.director).toBe("Hayao Miyazaki");
    expect(r?.year).toBe(2001);
    expect(r?.durationMinutes).toBe(125);
    expect(r?.coverUrl).toContain("/p.jpg");
    expect(r?.genres).not.toBeNull();
  });

  it("devuelve null si el token no está configurado", async () => {
    process.env.TMDB_API_KEY = "";
    const { getMovieForHydration } = await import("./tmdb");
    expect(await getMovieForHydration(1)).toBeNull();
  });
});

describe("getSeriesForHydration", () => {
  const prev = process.env.TMDB_API_KEY;
  beforeEach(() => { process.env.TMDB_API_KEY = "test-token"; });
  afterEach(() => { process.env.TMDB_API_KEY = prev; vi.restoreAllMocks(); });

  it("mapea creator (de created_by), temporadas, episodios y runtime", async () => {
    mockTmdb({
      name: "Breaking Bad",
      original_name: "Breaking Bad",
      overview: "Un profe…",
      poster_path: "/bb.jpg",
      first_air_date: "2008-01-20",
      number_of_seasons: 5,
      number_of_episodes: 62,
      episode_run_time: [47],
      created_by: [{ id: 66633, name: "Vince Gilligan", profile_path: null }],
      genres: [{ id: 18 }],
      credits: { crew: [], cast: [] },
    });
    const { getSeriesForHydration } = await import("./tmdb");
    const r = await getSeriesForHydration(1396);
    expect(r?.title).toBe("Breaking Bad");
    expect(r?.creator).toBe("Vince Gilligan");
    expect(r?.totalSeasons).toBe(5);
    expect(r?.totalEpisodes).toBe(62);
    expect(r?.episodeRuntimeMinutes).toBe(47);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/catalog/tmdb-hydration.test.ts`
Expected: FAIL con "getMovieForHydration is not a function" / no exportada.

- [ ] **Step 3: Implementar en `tmdb.ts`**

Añadir (junto a `getMovieAsSearchResult`/`getSeriesDetails`; reutiliza `tmdbGet`, `resolveGenresFromIds`, `pickEpisodeRuntime`, `TMDB_IMAGE_BASE`):

```ts
export type MovieHydration = {
  title: string | null; originalTitle: string | null; director: string | null;
  synopsis: string | null; genres: string[] | null; year: number | null;
  coverUrl: string | null; durationMinutes: number | null;
};

export type SeriesHydration = {
  title: string | null; originalTitle: string | null; creator: string | null;
  synopsis: string | null; genres: string[] | null; year: number | null;
  coverUrl: string | null; totalSeasons: number | null; totalEpisodes: number | null;
  episodeRuntimeMinutes: number | null;
};

function yearFrom(date: string | undefined | null): number | null {
  return date ? Number(date.slice(0, 4)) || null : null;
}

// #674: fetch server-side por id con TODO lo que la hidratación escribe en una
// sola llamada. director/creator salen de credits/created_by, que getMovieAs-
// SearchResult NO trae. Ver spec 2026-08-14.
export async function getMovieForHydration(tmdbId: number): Promise<MovieHydration | null> {
  const data = await tmdbGet<{
    title?: string; original_title?: string; overview?: string;
    poster_path: string | null; release_date?: string; runtime?: number | null;
    genres?: Array<{ id: number }>;
    credits?: { crew?: Array<{ name: string; job?: string }> };
  }>(`/movie/${tmdbId}?language=es-ES&append_to_response=credits`);
  if (!data) return null;

  const director =
    (data.credits?.crew ?? []).find((c) => c.job === "Director")?.name ?? null;

  return {
    title: data.title ?? null,
    originalTitle: data.original_title ?? null,
    director,
    synopsis: data.overview ?? null,
    genres: resolveGenresFromIds((data.genres ?? []).map((g) => g.id)),
    year: yearFrom(data.release_date),
    coverUrl: data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null,
    durationMinutes:
      typeof data.runtime === "number" && data.runtime > 0 ? data.runtime : null,
  };
}

export async function getSeriesForHydration(tmdbId: number): Promise<SeriesHydration | null> {
  const data = await tmdbGet<{
    name?: string; original_name?: string; overview?: string;
    poster_path: string | null; first_air_date?: string;
    number_of_seasons?: number | null; number_of_episodes?: number | null;
    episode_run_time?: number[]; last_episode_to_air?: { runtime?: number | null } | null;
    genres?: Array<{ id: number }>;
    created_by?: Array<{ name: string }>;
  }>(`/tv/${tmdbId}?language=es-ES&append_to_response=credits`);
  if (!data) return null;

  return {
    title: data.name ?? null,
    originalTitle: data.original_name ?? null,
    creator: (data.created_by ?? [])[0]?.name ?? null,
    synopsis: data.overview ?? null,
    genres: resolveGenresFromIds((data.genres ?? []).map((g) => g.id)),
    year: yearFrom(data.first_air_date),
    coverUrl: data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null,
    totalSeasons:
      typeof data.number_of_seasons === "number" && data.number_of_seasons > 0
        ? data.number_of_seasons : null,
    totalEpisodes:
      typeof data.number_of_episodes === "number" && data.number_of_episodes > 0
        ? data.number_of_episodes : null,
    episodeRuntimeMinutes: pickEpisodeRuntime(
      data.episode_run_time, data.last_episode_to_air?.runtime
    ),
  };
}
```

Nota: si `resolveGenresFromIds([])` devuelve `[]`, el test `not.toBeNull()` pasa igual. Si prefieres `null` cuando no hay géneros, envuélvelo: `const gs = resolveGenresFromIds(...); genres: gs.length ? gs : null`. Mantener consistente con lo que `hydrate_*` espera (array vacío = hueco).

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/catalog/tmdb-hydration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/tmdb.ts src/lib/catalog/tmdb-hydration.test.ts
git commit -m "feat(catalog): getMovie/SeriesForHydration (director+runtime) (#674)"
```

---

### Task 6: `ensureMovieHydrated` / `ensureSeriesHydrated`

**Files:**
- Create: `src/lib/catalog/hydrate-screen.ts`
- Test: `src/lib/catalog/hydrate-screen.test.ts`

**Interfaces:**
- Consumes: `getMovieForHydration`/`getSeriesForHydration` (Task 5); RPCs `hydrate_movie`/`hydrate_series` (Task 2).
- Produces:
```ts
export type HydratableScreen = { id: string; tmdb_id: number | null; hydrated_at: string | null };
export function ensureMovieHydrated(supabase: SupabaseServerClient, movie: HydratableScreen): Promise<void>;
export function ensureSeriesHydrated(supabase: SupabaseServerClient, series: HydratableScreen): Promise<void>;
```
Contrato (hermano de `ensureBookHydrated`): si `hydrated_at !== null` no hace nada; sin `tmdb_id` marca hidratado para no reintentar; si el fetch falla NO marca (reintenta a la próxima); NUNCA lanza.

- [ ] **Step 1: Escribir el test que falla**

`src/lib/catalog/hydrate-screen.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ensureMovieHydrated } from "./hydrate-screen";
import * as tmdb from "./tmdb";

function fakeSupabase() {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return { supabase: { rpc, from: () => ({ update }) } as never, rpc, update };
}

describe("ensureMovieHydrated", () => {
  it("no hace nada si ya está hidratada", async () => {
    const { supabase, rpc } = fakeSupabase();
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 1, hydrated_at: "2026-01-01" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("llama a hydrate_movie con los campos del proveedor", async () => {
    const { supabase, rpc } = fakeSupabase();
    vi.spyOn(tmdb, "getMovieForHydration").mockResolvedValue({
      title: "T", originalTitle: null, director: "D", synopsis: "S",
      genres: ["g"], year: 2001, coverUrl: "c", durationMinutes: 100,
    });
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 129, hydrated_at: null });
    expect(rpc).toHaveBeenCalledWith("hydrate_movie", expect.objectContaining({
      p_movie_id: "m1", p_title: "T", p_director: "D", p_duration_minutes: 100,
    }));
  });

  it("marca hidratada sin tmdb_id, sin llamar al proveedor", async () => {
    const { supabase, rpc, update } = fakeSupabase();
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: null, hydrated_at: null });
    expect(rpc).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it("no marca si el fetch devuelve null (reintenta luego)", async () => {
    const { supabase, rpc, update } = fakeSupabase();
    vi.spyOn(tmdb, "getMovieForHydration").mockResolvedValue(null);
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 129, hydrated_at: null });
    expect(rpc).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("nunca lanza aunque la RPC falle", async () => {
    const { supabase } = fakeSupabase();
    (supabase as never as { rpc: unknown }).rpc = vi.fn().mockRejectedValue(new Error("boom"));
    vi.spyOn(tmdb, "getMovieForHydration").mockResolvedValue({
      title: "T", originalTitle: null, director: null, synopsis: null,
      genres: null, year: null, coverUrl: null, durationMinutes: null,
    });
    await expect(
      ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 1, hydrated_at: null })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/catalog/hydrate-screen.test.ts`
Expected: FAIL con "Cannot find module './hydrate-screen'".

- [ ] **Step 3: Implementar `hydrate-screen.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import { getMovieForHydration, getSeriesForHydration } from "./tmdb";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HydratableScreen = {
  id: string;
  tmdb_id: number | null;
  hydrated_at: string | null;
};

// Hermano de ensureBookHydrated (hydrate-book.ts): idempotente, guarded por
// hydrated_at, y NUNCA lanza. La primera apertura de ficha trae del proveedor los
// campos canónicos y los escribe por la RPC definer (autoritativa si la fila no
// estaba hidratada, fill-only si ya lo estaba). #674.
export async function ensureMovieHydrated(
  supabase: SupabaseServerClient,
  movie: HydratableScreen
): Promise<void> {
  try {
    if (movie.hydrated_at !== null) return;
    if (!movie.tmdb_id) {
      await markHydrated(supabase, "movies", movie.id);
      return;
    }
    const d = await getMovieForHydration(movie.tmdb_id);
    if (!d) return; // API falló: no marcar, reintentar en la próxima visita.

    const { error } = await supabase.rpc("hydrate_movie", {
      p_movie_id: movie.id,
      p_title: d.title ?? undefined,
      p_original_title: d.originalTitle ?? undefined,
      p_director: d.director ?? undefined,
      p_synopsis: d.synopsis ?? undefined,
      p_genres: d.genres && d.genres.length > 0 ? d.genres : undefined,
      p_release_year: d.year ?? undefined,
      p_cover_url: d.coverUrl ?? undefined,
      p_duration_minutes: d.durationMinutes ?? undefined,
    });
    if (error) console.error("hydrate_movie rpc failed", { movieId: movie.id, error });
  } catch (error) {
    console.error("ensureMovieHydrated failed", { movieId: movie.id, error });
  }
}

export async function ensureSeriesHydrated(
  supabase: SupabaseServerClient,
  series: HydratableScreen
): Promise<void> {
  try {
    if (series.hydrated_at !== null) return;
    if (!series.tmdb_id) {
      await markHydrated(supabase, "series", series.id);
      return;
    }
    const d = await getSeriesForHydration(series.tmdb_id);
    if (!d) return;

    const { error } = await supabase.rpc("hydrate_series", {
      p_series_id: series.id,
      p_title: d.title ?? undefined,
      p_original_title: d.originalTitle ?? undefined,
      p_creator: d.creator ?? undefined,
      p_synopsis: d.synopsis ?? undefined,
      p_genres: d.genres && d.genres.length > 0 ? d.genres : undefined,
      p_release_year: d.year ?? undefined,
      p_cover_url: d.coverUrl ?? undefined,
      p_total_seasons: d.totalSeasons ?? undefined,
      p_total_episodes: d.totalEpisodes ?? undefined,
      p_episode_runtime_minutes: d.episodeRuntimeMinutes ?? undefined,
    });
    if (error) console.error("hydrate_series rpc failed", { seriesId: series.id, error });
  } catch (error) {
    console.error("ensureSeriesHydrated failed", { seriesId: series.id, error });
  }
}

async function markHydrated(
  supabase: SupabaseServerClient,
  table: "movies" | "series",
  id: string
): Promise<void> {
  await supabase.from(table).update({ hydrated_at: new Date().toISOString() }).eq("id", id);
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/catalog/hydrate-screen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/hydrate-screen.ts src/lib/catalog/hydrate-screen.test.ts
git commit -m "feat(catalog): ensureMovie/SeriesHydrated (#674)"
```

---

### Task 7: Reescribir `findOrCreateCatalogItem` (shell vía RPC, descarta canónicos)

**Files:**
- Modify: `src/lib/catalog/find-or-create.ts`
- Test: `src/lib/catalog/find-or-create-bulk.test.ts` (afecta también al `catalogInsertPayload` compartido — ver Task 8)

**Interfaces:**
- Consumes: `register_catalog_item(p_item_type, p_external_id)` (Task 4).
- Produces: misma firma pública `findOrCreateCatalogItem(supabase, result, userId?) => Promise<string>` (los call sites no cambian de firma). Ahora crea shell y descarta `result.title/synopsis/genres/...`; conserva `ensureBookEdition` (usa `matchedIsbn`, ya valida server-side).

- [ ] **Step 1: Escribir el test que falla**

Añadir a `src/lib/catalog/find-or-create-bulk.test.ts` (o crear `find-or-create.test.ts`) un `describe("findOrCreateCatalogItem")`:

```ts
describe("findOrCreateCatalogItem", () => {
  it("crea la shell por RPC y NO manda campos canónicos", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "movie-id-1", error: null });
    const supabase = { rpc } as never;
    const { findOrCreateCatalogItem } = await import("./find-or-create");
    const id = await findOrCreateCatalogItem(supabase, {
      itemType: "movie", externalId: "129", title: "FAKE",
      subtitle: null, coverUrl: null, year: 2001, synopsis: "x", genres: ["g"],
    } as never, "user-1");
    expect(id).toBe("movie-id-1");
    expect(rpc).toHaveBeenCalledWith("register_catalog_item", {
      p_item_type: "movie", p_external_id: "129",
    });
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/catalog/find-or-create-bulk.test.ts`
Expected: FAIL (aún inserta directo, no llama a la RPC).

- [ ] **Step 3: Reescribir `findOrCreateCatalogItem`**

Reemplazar el cuerpo (líneas ~154-209). Eliminar el `select existing` + `insert directo`; usar la RPC. Mantener `ensureBookEdition`. Borrar `catalogInsertPayload` si ya no lo usa nadie (lo usa el bulk — ver Task 8; coordinar el borrado ahí).

```ts
export async function findOrCreateCatalogItem(
  supabase: SupabaseServerClient,
  result: SearchResult,
  userId?: string | null
): Promise<string> {
  // #674: el cliente NO fija canónicos. La shell nace con solo el id externo por
  // RPC definer; los campos de ficha los pone la hidratación server-side.
  const { data: id, error } = await supabase.rpc("register_catalog_item", {
    p_item_type: result.itemType,
    p_external_id: result.externalId,
  });
  if (error || !id) throw error ?? new Error("register_catalog_item returned no id");

  // La edición del libro (ISBN escaneado) sigue su camino validado server-side.
  if (result.itemType === "book") {
    await ensureBookEdition(supabase, id as string, result, userId);
  }
  return id as string;
}
```

Nota: `userId` deja de usarse para `created_by` (se omite, ver Decisión 2) pero se conserva en la firma porque `ensureBookEdition` lo usa.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/catalog/find-or-create-bulk.test.ts`
Expected: PASS (el nuevo describe; el de bulk se adapta en Task 8).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/find-or-create.ts src/lib/catalog/find-or-create-bulk.test.ts
git commit -m "refactor(catalog): findOrCreateCatalogItem crea shell por RPC (#674)"
```

---

### Task 8: `findOrCreateCatalogItemsBulk` — shell en lote + hidratar con datos en mano

**Files:**
- Modify: `src/lib/catalog/find-or-create.ts`
- Test: `src/lib/catalog/find-or-create-bulk.test.ts`

**Interfaces:**
- Consumes: `register_catalog_items_bulk(p_item_type, p_external_ids)` y `hydrate_screens_bulk(p_item_type, p_rows)` (Tasks 2, 4).
- Produces: misma firma `findOrCreateCatalogItemsBulk(supabase, results) => Promise<Map<string,string>>`. Camino de origen servidor (créditos de persona): tras crear shells, hidrata con los `SearchResult` que ya trae (sin re-fetch por ítem). Sigue sin lanzar.

**Nota de alcance:** los `SearchResult` del bulk vienen de `getPersonCombinedCredits` (TMDB) — origen servidor fiable. Sus canónicos SÍ se usan aquí (a diferencia del camino de uno) porque no son de origen cliente; la RPC fill-only no puede pisar curación de todos modos.

- [ ] **Step 1: Adaptar los tests de bulk**

En `find-or-create-bulk.test.ts`, cambiar el doble para que `register_catalog_items_bulk` devuelva los pares `{external_id, id}` y `hydrate_screens_bulk` sea observado. Casos a conservar/ajustar: lote vacío (sin RPC); dedup de externalId; recuperación de ids; que la hidratación reciba los campos de TMDB. (El error 42501 deja de aplicar: la RPC exige sesión con `raise exception`, así que el caso pasa a "sin sesión → la RPC lanza y se traga".)

```ts
it("crea shells en lote e hidrata con los datos en mano", async () => {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: [{ external_id: "129", id: "m1" }], error: null }) // register bulk
    .mockResolvedValueOnce({ data: null, error: null }); // hydrate bulk
  const supabase = { rpc } as never;
  const { findOrCreateCatalogItemsBulk } = await import("./find-or-create");
  const map = await findOrCreateCatalogItemsBulk(supabase, [{
    itemType: "movie", externalId: "129", title: "T", subtitle: null,
    coverUrl: "c", year: 2001, synopsis: "S", genres: ["g"],
  } as never]);
  expect(map.get("movie:129")).toBe("m1");
  expect(rpc).toHaveBeenNthCalledWith(1, "register_catalog_items_bulk",
    { p_item_type: "movie", p_external_ids: ["129"] });
  expect(rpc.mock.calls[1][0]).toBe("hydrate_screens_bulk");
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/catalog/find-or-create-bulk.test.ts`
Expected: FAIL.

- [ ] **Step 3: Reescribir el bulk**

Sustituir el `select`/`insert` directo por: un `register_catalog_items_bulk` por tipo (obtiene el mapa `externalId→id`), luego un `hydrate_screens_bulk` por tipo (movie/series) con las filas `{ item_id, title, original_title, director|creator, synopsis, genres, release_year, cover_url, duration_minutes|total_*|episode_runtime_minutes }` construidas desde cada `SearchResult`. Para libros, el bulk NO hidrata (la ficha lo hace; el bulk de créditos rara vez trae libros con sinopsis). Mantener "NUNCA lanza" con try/catch por tipo. Reutilizar `catalogInsertPayload`→ ya no; construir el objeto de hidratación inline. El mapeo `SearchResult`→fila de hidratación de peli/serie no tiene `director/creator` en `SearchResult` (¡no existen esos campos!), así que **para el bulk el director/creator queda NULL** y lo completará la apertura de ficha; se hidratan los canónicos que sí trae (title/original/synopsis/genres/year/cover). Documentar esta limitación en un comentario.

```ts
// (dentro del map por tipo, tras obtener el register bulk map)
if (itemType === "movie" || itemType === "series") {
  const rows = missingResolved.map((r) => ({
    item_id: map.get(`${itemType}:${r.externalId}`),
    title: r.title,
    original_title: r.originalTitle ?? null,
    synopsis: r.synopsis,
    genres: r.genres,
    release_year: r.year,
    cover_url: r.coverUrl,
    // director/creator, duration/seasons/episodes NO viven en SearchResult:
    // los completa la apertura de ficha (ensureMovie/SeriesHydrated). #674.
  })).filter((row) => row.item_id);
  if (rows.length > 0) {
    const { error } = await supabase.rpc("hydrate_screens_bulk", {
      p_item_type: itemType, p_rows: rows,
    });
    if (error) console.error("hydrate_screens_bulk failed", { itemType, error });
  }
}
```

(El detalle exacto de `missingResolved`/re-select se adapta del cuerpo actual, que ya trocea y re-selecciona; conservar `chunkIds` si sigue haciendo falta para el `any(...)` de lectura, aunque el register bulk ya devuelve todos los ids.)

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/catalog/find-or-create-bulk.test.ts`
Expected: PASS.

- [ ] **Step 5: `catalogInsertPayload` — retirar si queda huérfano**

Grep: `git grep -n catalogInsertPayload src/`. Si solo aparece su definición, borrarla.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/find-or-create.ts src/lib/catalog/find-or-create-bulk.test.ts
git commit -m "refactor(catalog): bulk crea shells e hidrata por RPC (#674)"
```

---

### Task 9: Cablear hidratación de peli/serie en fichas y en `openCatalogItem`/`addToLibrary`

**Files:**
- Modify: `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx`, `src/app/buscar/actions.ts`

**Interfaces:**
- Consumes: `ensureMovieHydrated`/`ensureSeriesHydrated` (Task 6).

- [ ] **Step 1: Ficha de película — `after(() => ensureMovieHydrated(...))`**

En `pelicula/[id]/page.tsx`, tras cargar `movie` y con `user` presente (patrón de `libro/[id]/page.tsx:145-151`). Asegurar que `fetchMovie` selecciona `hydrated_at` y `tmdb_id`:

```ts
import { after } from "next/server";
import { ensureMovieHydrated } from "@/lib/catalog/hydrate-screen";
// …tras obtener `movie` y `user`:
if (user) {
  after(() =>
    ensureMovieHydrated(supabase, {
      id: movie.id,
      tmdb_id: movie.tmdb_id,
      hydrated_at: movie.hydrated_at,
    })
  );
}
```

Verificar el `select` de `fetchMovie`: debe incluir `hydrated_at`. Si usa `*`, ya está; si enumera columnas, añadir `hydrated_at`.

- [ ] **Step 2: Ficha de serie — igual con `ensureSeriesHydrated`**

En `serie/[id]/page.tsx`, mismo patrón; `fetchSeries` debe traer `hydrated_at` y `tmdb_id`.

```ts
import { ensureSeriesHydrated } from "@/lib/catalog/hydrate-screen";
if (user) {
  after(() =>
    ensureSeriesHydrated(supabase, {
      id: series.id, tmdb_id: series.tmdb_id, hydrated_at: series.hydrated_at,
    })
  );
}
```

- [ ] **Step 3: `openCatalogItem` — generalizar la hidratación con presupuesto a las tres**

En `src/app/buscar/actions.ts`, el bloque hoy solo cubre `book`. Extraer un dispatcher y aplicar el mismo presupuesto `HYDRATION_BUDGET_MS` + `after()` para movie/series (la fila recién creada por `findOrCreateCatalogItem` tiene `hydrated_at: null`, `tmdb_id` = `Number(result.externalId)`):

```ts
import { ensureMovieHydrated, ensureSeriesHydrated } from "@/lib/catalog/hydrate-screen";
// …tras `const itemId = await findOrCreateCatalogItem(...)`:
const hydration =
  result.itemType === "book"
    ? ensureBookHydrated(supabase, {
        id: itemId, openlibrary_work_key: result.externalId,
        isbn: result.matchedIsbn ?? null, hydrated_at: null,
      })
    : result.itemType === "movie"
    ? ensureMovieHydrated(supabase, { id: itemId, tmdb_id: Number(result.externalId), hydrated_at: null })
    : ensureSeriesHydrated(supabase, { id: itemId, tmdb_id: Number(result.externalId), hydrated_at: null });
if (!(await settledWithin(hydration, HYDRATION_BUDGET_MS))) after(() => hydration);
```

- [ ] **Step 4: `addToLibrary` — hidratar en `after()` (background)**

Para que una obra añadida a "Para más tarde" sin abrir ficha no quede con `title` NULL indefinidamente, disparar la hidratación del tipo correspondiente en `after()` tras el alta (solo cuando la fila se acaba de crear, i.e. `!result.catalogId`).

```ts
if (!result.catalogId) {
  after(() =>
    result.itemType === "book"
      ? ensureBookHydrated(supabase, { id: itemId, openlibrary_work_key: result.externalId, isbn: result.matchedIsbn ?? null, hydrated_at: null })
      : result.itemType === "movie"
      ? ensureMovieHydrated(supabase, { id: itemId, tmdb_id: Number(result.externalId), hydrated_at: null })
      : ensureSeriesHydrated(supabase, { id: itemId, tmdb_id: Number(result.externalId), hydrated_at: null })
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` (o `npm run typecheck` si existe). Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/pelicula/[id]/page.tsx src/app/serie/[id]/page.tsx src/app/buscar/actions.ts
git commit -m "feat(catalog): cablea hidratación de peli/serie en fichas y alta (#674)"
```

---

### Task 10: Tolerar `title` NULL en la UI (placeholder) + i18n

**Files:**
- Modify: componentes que renderizan el título de una obra de catálogo (identificar con grep)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: nada nuevo; solo defensivo ante `title: string | null`.

- [ ] **Step 1: Añadir la clave i18n**

En `messages/es.json`, en el namespace de catálogo (o `common`), añadir:

```json
"catalog": { "untitled": "Sin título" }
```

(Ubicar el namespace real; si ya hay uno de catálogo/detail, colgar `untitled` de él.)

- [ ] **Step 2: Localizar los renders de título de obra**

Run: `git grep -nE "\.title" src/components src/app | grep -iE "book|movie|series|item|catalog|entry|obra"`
Anotar los sitios donde el título de una obra de catálogo se pinta asumiendo string. Los candidatos probables: tarjetas de item (`src/components/detail/*`, `src/components/library/*`, `who-to-follow`/listados). NO tocar títulos que no sean de catálogo (posts, clubes).

- [ ] **Step 3: Aplicar el fallback**

En cada render identificado, `title ?? t("catalog.untitled")` (server) o el equivalente cliente. Para tipos, propagar `title: string | null` donde el tipo lo declaraba `string`. Priorizar los renders que puedan mostrar una shell recién creada (biblioteca "Para más tarde", resultados que enlacen a ficha).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (los `string | null` nuevos quedan cubiertos por el fallback).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catalog): placeholder para obras sin título (shell sin hidratar) (#674)"
```

---

### Task 11: Migración E — revocar el INSERT directo (el cierre)

**Files:**
- Create: `supabase/migrations/20260818_catalog_e_revoke_insert.sql`

**Interfaces:** ninguna nueva. **Va la última**: sólo cuando Tasks 5-9 ya migraron todos los call sites.

- [ ] **Step 1: Escribir la migración**

```sql
-- #674 parte E — EL CIERRE. Con register_catalog_item como única alta, se retira
-- el INSERT directo de authenticated: se caen las policies permisivas y el
-- privilegio de tabla. La RPC es SECURITY DEFINER (escribe como owner), así que
-- sigue funcionando. Aplicar SOLO con el código nuevo ya desplegado.
drop policy if exists "catalog books insertable" on public.books;
drop policy if exists "catalog movies insertable" on public.movies;
drop policy if exists "catalog series insertable" on public.series;

revoke insert on public.books  from authenticated, anon;
revoke insert on public.movies from authenticated, anon;
revoke insert on public.series from authenticated, anon;
```

- [ ] **Step 2: Aplicar en dev + regresión de seguridad**

Aplicar en `supabase-dev`. Como usuario `authenticated` de prueba (no owner):

```sql
-- DEBE fallar (ya no hay policy ni grant de insert):
insert into public.movies (tmdb_id, title) values (888001, 'HACK');   -- esperado: error
-- DEBE funcionar (RPC definer):
select register_catalog_item('movie', '888002');                      -- esperado: uuid
```

- [ ] **Step 3: Verificar objetos**

```sql
select polname from pg_policies where tablename in ('books','movies','series') and polname like '%insertable%';
-- Esperado: cero filas.
select grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('books','movies','series') and privilege_type='INSERT' and grantee in ('authenticated','anon');
-- Esperado: cero filas.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818_catalog_e_revoke_insert.sql
git commit -m "feat(catalog): revoca INSERT directo, RPC como única alta (#674)"
```

---

### Task 12: e2e — el alta desde `/buscar` sigue mostrando la ficha correcta

**Files:**
- Create: `e2e/catalogo-server-authoritative.spec.ts`

**Interfaces:** usa el patrón de seeding del repo (REST + service key, usuario desechable, `onboarded_at` no nulo, limpiar cookie `bs_onb`). Ver `e2e/onboarding.spec.ts` y `e2e/inicio-feed-agrupado.spec.ts`.

- [ ] **Step 1: Escribir el e2e**

Flujo mínimo que prueba el camino real: login → `/buscar` → buscar una película conocida → abrir su ficha → la ficha muestra título y sinopsis reales (hidratados server-side), no vacío. Y (regresión de seguridad, si el runner permite SQL) que un insert directo falla — o dejar esa parte al SQL de Task 11.

```ts
import { test, expect } from "@playwright/test";
// (adaptar helpers de seeding de e2e/inicio-feed-agrupado.spec.ts)

test.describe("catálogo server-authoritative (#674)", () => {
  test.setTimeout(120_000);

  test("alta desde /buscar muestra la ficha con datos del proveedor", async ({ page }) => {
    // login con usuario desechable ya onboardeado (setOnboardedAt no-null + clearCookies bs_onb)
    // …
    await page.goto("/buscar");
    await page.getByRole("searchbox").fill("El viaje de Chihiro");
    // abrir el primer resultado de tipo película
    // …
    // la ficha debe mostrar título y sinopsis reales (hidratación server-side)
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Sin título");
    await expect(page.getByText(/./)).toBeVisible(); // sinopsis presente
  });
});
```

(Completar los selectores contra la UI real de `/buscar` y de la ficha; reutilizar los helpers de seeding existentes en `e2e/`.)

- [ ] **Step 2: Ejecutar contra el dev server en 3000**

Run: `npm run test:e2e -- catalogo-server-authoritative`
Expected: PASS. (El e2e reutiliza el dev server ya levantado; no arrancar otro.)

- [ ] **Step 3: Commit**

```bash
git add e2e/catalogo-server-authoritative.spec.ts
git commit -m "test(catalog): e2e alta+ficha server-authoritative (#674)"
```

---

### Task 13: Cierre documental (definición de "hecho")

**Files:**
- Modify: `docs/requirements/data-model.md`, `docs/requirements/decisiones.md`, `docs/DRIFT-CHECK.md`, `docs/requirements/backlog.md`

- [ ] **Step 1: `data-model.md`**

Documentar: `movies.hydrated_at`, `series.hydrated_at`; `title` nullable en las tres tablas; RPCs `register_catalog_item(+bulk)`, `hydrate_movie`, `hydrate_series`, `hydrate_screens_bulk`; `hydrate_book` con semántica nueva; INSERT directo revocado (RPC como única alta). Actualizar la fecha de verificación.

- [ ] **Step 2: `decisiones.md` (append-only, al final)**

Una entrada con: la semántica autoritativa-si-no-hidratada (cambio de comportamiento de `hydrate_book`), y las 4 desviaciones del spec (title nullable, sin created_by, revoke=policy+grant, fetchers dedicados + limitación director/creator en el bulk). Enlazar al spec 2026-08-14 y a #674.

- [ ] **Step 3: `DRIFT-CHECK.md` — correr superficie 6 (grants por columna)**

Verificar que `hydrated_at` tiene su `grant update` en movies/series y que ninguna columna quedó sin grant tras los cambios. Registrar el resultado.

- [ ] **Step 4: `backlog.md` + issue #674**

Marcar el estado de la feature en `backlog.md`. En #674, comentar el cierre con el resumen del enfoque y cerrar la issue. Si el residual conocido (§9 del spec: shell nunca abierta rellenable con basura mientras `hydrated_at IS NULL`) merece seguimiento, abrir issue `area:catalogo · tipo:deuda · P3` enlazando el spec. Ordenar #676 a continuación (la primera capa la deja esta PR, §8).

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(catalog): sincroniza data-model/decisiones/drift tras #674"
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** §3a→Task 4; §3b→Tasks 1,2,5,6; §3c→Tasks 2,3; §4 (call sites)→Tasks 7,8,9 (las entradas de origen cliente quedan cubiertas al pasar por `findOrCreateCatalogItem`, que ignora canónicos); §5 (esquema)→Tasks 1-4,11 + superficie 6 en Task 13; §7 (verificación)→Tasks 2,4,11 (SQL), 5,6,7,8 (unit), 12 (e2e); §8 (#676)→Task 13 nota; §9 (residual)→Task 13 issue.
- **Gap material resuelto:** `title NOT NULL` (Task 1 + Task 10), inexistencia de `created_by` (Decisión 2), INSERT vía policy no grants (Task 11), ausencia de `getSeriesAsSearchResult`/`director` en SearchResult (Task 5), rendimiento del bulk (Tasks 2,4,8).
- **Consistencia de tipos:** `HydratableScreen` (Task 6) ↔ `{id, tmdb_id, hydrated_at}` usado en Task 9; firmas de RPC idénticas entre migración (Tasks 2,4) y llamadas TS (Tasks 6,7,8); `MovieHydration`/`SeriesHydration` (Task 5) ↔ mapeo en Task 6.
- **Limitación consciente registrada:** el bulk no puede rellenar `director/creator`/tamaños (no están en `SearchResult`); los completa la apertura de ficha. Documentado en Task 8 y Task 13.
