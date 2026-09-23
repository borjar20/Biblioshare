# Ficha cinemática · PR 1 — `backdrop_url` desde TMDB · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar el backdrop apaisado de TMDB (`backdrop_path`) de películas y series en una columna `backdrop_url`, rellenada por la hidratación perezosa de la ficha, para que la PR 2 pueda pintar el hero cinemático.

**Architecture:** Columna nueva `backdrop_url text` en `movies` y `series`, escrita SOLO por las RPC `hydrate_movie`/`hydrate_series` (SECURITY DEFINER, fill-only) con un parámetro nuevo `p_backdrop_url`. `getMovieDetails`/`getSeriesDetails` mapean `backdrop_path` de la MISMA respuesta que ya piden; `ensureItemEnriched` gana un guard propio `needsBackdrop` independiente de créditos y tamaños. Las tres fichas leen la columna y la pasan al enriquecimiento. Sin backfill: cada ficha se completa la próxima vez que alguien con sesión la abre.

**Tech Stack:** Supabase Postgres (migración SQL + RPC plpgsql), Next.js 16 (App Router, server components), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md` §2.

## Global Constraints

- Esquema: `backdrop_url text null` en `movies` y `series`; URL completa de TMDB a **`w1280`** (`https://image.tmdb.org/t/p/w1280/<path>`).
- Escritura **solo por RPC** (lección #676): **no** se da grant de UPDATE sobre `backdrop_url` a `authenticated`.
- Fill-only: la RPC solo rellena si la columna es NULL o `''`.
- Sin centinela: una obra sin backdrop en TMDB se queda NULL y reintenta al abrirse (el `fetch` ya se cachea 24h).
- Sin backfill masivo.
- Orden de aplicación: **dev (`tyvzpuhxfwxrnkcpzxyg`) → prod (`vmutcradmodhiltuohys`)**; verificar contra `pg_proc`/`information_schema`, nunca contra `list_migrations`. `apply_migration` en prod necesita autorización explícita del usuario en el chat.
- Registrar la migración en `supabase/bootstrap/manifest.json` y regenerar `supabase/schema-baseline.sql` (lo que falló en #1201).
- #437: no se añade ningún `use cache`.
- Node 22 para cualquier comando de test/typecheck (ver Task 0).

---

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20260924120000_movies_series_backdrop_url.sql` | Crear | Columnas + check de host + RPC con `p_backdrop_url` + bulk |
| `supabase/bootstrap/manifest.json` | Modificar | Registrar la migración |
| `supabase/schema-baseline.sql` | Regenerar | `node scripts/db/bootstrap.mjs --baseline` |
| `src/lib/supabase/database.types.ts` | Modificar | Tipos de las columnas y de los args de las RPC |
| `src/lib/catalog/tmdb.ts` | Modificar | `ScreenDetails.backdropUrl` + `backdropUrl()` helper |
| `src/lib/catalog/tmdb.test.ts` | Modificar | Tests del mapeo |
| `src/lib/people/enrich-item.ts` | Modificar | `needsBackdrop`, `writeBackdrop`, guard en `ensureItemEnriched` |
| `src/lib/people/enrich-item.test.ts` | Modificar | Tests de `needsBackdrop` |
| `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx` | Modificar | Leer `backdrop_url` y pasarlo a `ensureItemEnriched` |
| `docs/requirements/data-model.md`, `docs/DRIFT-CHECK.md` | Modificar | Doc canónica |

---

### Task 0: Preparar el worktree

**Files:** ninguno versionado.

- [ ] **Step 1: Copiar `.env.local` e instalar dependencias**

El worktree nace sin `node_modules` ni `.env.local`. En PowerShell:

```powershell
Copy-Item ..\..\..\.env.local .env.local
fnm env | Out-String | Invoke-Expression; fnm use 22; node --version; npm ci
```

Expected: `v22.x`, y `npm ci` termina sin errores. Si luego vitest muere con `MODULE_NOT_FOUND` en `binding-*.mjs`: `npm install @rolldown/binding-win32-x64-msvc@<versión de rolldown en package-lock> --no-save`.

- [ ] **Step 2: Comprobar que la suite parte en verde**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/people/enrich-item.test.ts src/lib/catalog/tmdb.test.ts
```

Expected: PASS.

---

### Task 1: Migración — columnas, check de host y RPC

**Files:**
- Create: `supabase/migrations/20260924120000_movies_series_backdrop_url.sql`
- Modify: `supabase/bootstrap/manifest.json` (añadir al final del array, tras `"20260923150000_hydrate_screens_bulk_no_hydrated_at.sql"`)
- Regenerate: `supabase/schema-baseline.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: columnas `movies.backdrop_url`, `series.backdrop_url` (`text | null`); RPC `hydrate_movie(..., p_backdrop_url text default null)` y `hydrate_series(..., p_backdrop_url text default null)`; clave opcional `backdrop_url` en las filas jsonb de `hydrate_screens_bulk`.

- [ ] **Step 1: Comprobar el cuerpo vivo de las RPC en dev y en prod**

Antes de reemplazarlas, confirmar que lo que hay en la BD es lo que la migración asume (prod puede ir por detrás del repo). Con `execute_sql` (MCP `supabase-dev`/`supabase-prod`, o el conector de claude.ai con `project_id`):

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       position('hydrated_at      = now()' in pg_get_functiondef(p.oid)) > 0
         or position('hydrated_at             = now()' in pg_get_functiondef(p.oid)) > 0 as marks_hydrated
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('hydrate_movie','hydrate_series','hydrate_screens_bulk');
```

Expected (en dev y en prod): `hydrate_movie` con args `p_movie_id uuid, p_title text, p_original_title text, p_director text, p_synopsis text, p_genres text[], p_release_year integer, p_cover_url text, p_duration_minutes integer` y `marks_hydrated = true`; `hydrate_series` con sus 11 args y `marks_hydrated = true`; `hydrate_screens_bulk` con `p_item_type text, p_rows jsonb` y `marks_hydrated = false` (la de #1201). Si prod no coincide, **parar** y avisar: no aplicar un `create` que la deje atrasada.

- [ ] **Step 2: Comprobar cómo se concede SELECT sobre `movies`/`series`**

```sql
select table_name, grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and table_name in ('movies','series')
   and grantee in ('anon','authenticated') and privilege_type = 'SELECT';
```

Expected: una fila por tabla y rol (SELECT **de tabla**). Si alguna no sale, el SELECT es por columna y hay que añadir `grant select (backdrop_url) on public.<tabla> to anon, authenticated;` al final de la migración del Step 3.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260924120000_movies_series_backdrop_url.sql`:

```sql
-- Ficha cinemática (spec 2026-09-23-ficha-cinematica-design.md §2): el backdrop
-- apaisado de TMDB para el hero de películas y series.
--
-- Se escribe SOLO por las RPC hydrate_movie/hydrate_series (SECURITY DEFINER,
-- fill-only), igual que las columnas de tamaño desde #676: NO hay grant de
-- UPDATE sobre backdrop_url para `authenticated`. Por eso esta columna aparece
-- en la superficie 6 del DRIFT-CHECK como hueco de UPDATE: es a propósito.
--
-- Las RPC cambian de firma (parámetro nuevo). `create or replace` con un
-- parámetro más crearía una SOBRECARGA, y una llamada con argumentos por nombre
-- que casara con las dos fallaría con «could not choose the best candidate».
-- Por eso se BORRAN las firmas viejas y se crean de nuevo, con sus grants.

alter table public.movies add column if not exists backdrop_url text;
alter table public.series add column if not exists backdrop_url text;

-- Cualquier `authenticated` puede llamar a la RPC con el valor que quiera, y la
-- ficha pinta la URL a todo el mundo. Solo se admite el CDN de imágenes de TMDB.
alter table public.movies
  add constraint movies_backdrop_url_tmdb
    check (backdrop_url is null or backdrop_url like 'https://image.tmdb.org/t/p/%');
alter table public.series
  add constraint series_backdrop_url_tmdb
    check (backdrop_url is null or backdrop_url like 'https://image.tmdb.org/t/p/%');

drop function if exists public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int);
drop function if exists public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int);

create function public.hydrate_movie(
  p_movie_id uuid,
  p_title text default null,
  p_original_title text default null,
  p_director text default null,
  p_synopsis text default null,
  p_genres text[] default null,
  p_release_year int default null,
  p_cover_url text default null,
  p_duration_minutes int default null,
  p_backdrop_url text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform set_config('app.hydrating', 'on', true);
  update public.movies set
    title            = case when (title is null or title = '') and p_title is not null then p_title else title end,
    original_title   = case when (original_title is null or original_title = '') and p_original_title is not null then p_original_title else original_title end,
    director         = case when (director is null or director = '') and p_director is not null then p_director else director end,
    synopsis         = case when (synopsis is null or synopsis = '') and p_synopsis is not null then left(p_synopsis, 5000) else synopsis end,
    genres           = case when (genres is null or cardinality(genres) = 0) and p_genres is not null then p_genres else genres end,
    release_year     = case when release_year is null and p_release_year is not null then p_release_year else release_year end,
    cover_url        = case when (cover_url is null or cover_url = '') and p_cover_url is not null then p_cover_url else cover_url end,
    duration_minutes = case when duration_minutes is null and p_duration_minutes is not null then p_duration_minutes else duration_minutes end,
    backdrop_url     = case when (backdrop_url is null or backdrop_url = '') and p_backdrop_url is not null then p_backdrop_url else backdrop_url end,
    hydrated_at      = now()
  where id = p_movie_id;
  perform set_config('app.hydrating', 'off', true);
end;
$$;

create function public.hydrate_series(
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
  p_episode_runtime_minutes int default null,
  p_backdrop_url text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform set_config('app.hydrating', 'on', true);
  update public.series set
    title                   = case when (title is null or title = '') and p_title is not null then p_title else title end,
    original_title          = case when (original_title is null or original_title = '') and p_original_title is not null then p_original_title else original_title end,
    creator                 = case when (creator is null or creator = '') and p_creator is not null then p_creator else creator end,
    synopsis                = case when (synopsis is null or synopsis = '') and p_synopsis is not null then left(p_synopsis, 5000) else synopsis end,
    genres                  = case when (genres is null or cardinality(genres) = 0) and p_genres is not null then p_genres else genres end,
    release_year            = case when release_year is null and p_release_year is not null then p_release_year else release_year end,
    cover_url               = case when (cover_url is null or cover_url = '') and p_cover_url is not null then p_cover_url else cover_url end,
    total_seasons           = case when total_seasons is null and p_total_seasons is not null then p_total_seasons else total_seasons end,
    total_episodes          = case when total_episodes is null and p_total_episodes is not null then p_total_episodes else total_episodes end,
    episode_runtime_minutes = case when episode_runtime_minutes is null and p_episode_runtime_minutes is not null then p_episode_runtime_minutes else episode_runtime_minutes end,
    backdrop_url            = case when (backdrop_url is null or backdrop_url = '') and p_backdrop_url is not null then p_backdrop_url else backdrop_url end,
    hydrated_at             = now()
  where id = p_series_id;
  perform set_config('app.hydrating', 'off', true);
end;
$$;

revoke all on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int, text) from public;
grant execute on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int, text) to authenticated;
revoke all on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int, text) from public;
grant execute on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int, text) to authenticated;

comment on column public.movies.backdrop_url is
  'Backdrop apaisado de TMDB (w1280) para el hero de la ficha. Solo lo escribe hydrate_movie (fill-only). NULL = sin consultar o TMDB no tiene.';
comment on column public.series.backdrop_url is
  'Backdrop apaisado de TMDB (w1280) para el hero de la ficha. Solo lo escribe hydrate_series (fill-only). NULL = sin consultar o TMDB no tiene.';

-- hydrate_screens_bulk (la de #1201, sin hydrated_at) acepta también la clave
-- `backdrop_url`. Hoy ningún llamador la manda; se añade para que el lote no
-- tenga que volver a tocarse si la filmografía empieza a traerla.
create or replace function public.hydrate_screens_bulk(
  p_item_type text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  v_genres text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type not in ('movie', 'series') then
    raise exception 'unknown item type: %', p_item_type;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_genres := case
      when jsonb_typeof(r->'genres') = 'array' and jsonb_array_length(r->'genres') > 0
        then array(select jsonb_array_elements_text(r->'genres'))
      else null
    end;

    perform set_config('app.hydrating', 'on', true);
    if p_item_type = 'movie' then
      update public.movies set
        title            = case when (title is null or title = '') and r->>'title' is not null then r->>'title' else title end,
        original_title   = case when (original_title is null or original_title = '') and r->>'original_title' is not null then r->>'original_title' else original_title end,
        director         = case when (director is null or director = '') and r->>'director' is not null then r->>'director' else director end,
        synopsis         = case when (synopsis is null or synopsis = '') and r->>'synopsis' is not null then left(r->>'synopsis', 5000) else synopsis end,
        genres           = case when (genres is null or cardinality(genres) = 0) and v_genres is not null then v_genres else genres end,
        release_year     = case when release_year is null and r->>'release_year' is not null then (r->>'release_year')::int else release_year end,
        cover_url        = case when (cover_url is null or cover_url = '') and r->>'cover_url' is not null then r->>'cover_url' else cover_url end,
        duration_minutes = case when duration_minutes is null and r->>'duration_minutes' is not null then (r->>'duration_minutes')::int else duration_minutes end,
        backdrop_url     = case when (backdrop_url is null or backdrop_url = '') and r->>'backdrop_url' is not null then r->>'backdrop_url' else backdrop_url end
      where id = (r->>'item_id')::uuid;
    else
      update public.series set
        title                   = case when (title is null or title = '') and r->>'title' is not null then r->>'title' else title end,
        original_title          = case when (original_title is null or original_title = '') and r->>'original_title' is not null then r->>'original_title' else original_title end,
        creator                 = case when (creator is null or creator = '') and r->>'creator' is not null then r->>'creator' else creator end,
        synopsis                = case when (synopsis is null or synopsis = '') and r->>'synopsis' is not null then left(r->>'synopsis', 5000) else synopsis end,
        genres                  = case when (genres is null or cardinality(genres) = 0) and v_genres is not null then v_genres else genres end,
        release_year            = case when release_year is null and r->>'release_year' is not null then (r->>'release_year')::int else release_year end,
        cover_url               = case when (cover_url is null or cover_url = '') and r->>'cover_url' is not null then r->>'cover_url' else cover_url end,
        total_seasons           = case when total_seasons is null and r->>'total_seasons' is not null then (r->>'total_seasons')::int else total_seasons end,
        total_episodes          = case when total_episodes is null and r->>'total_episodes' is not null then (r->>'total_episodes')::int else total_episodes end,
        episode_runtime_minutes = case when episode_runtime_minutes is null and r->>'episode_runtime_minutes' is not null then (r->>'episode_runtime_minutes')::int else episode_runtime_minutes end,
        backdrop_url            = case when (backdrop_url is null or backdrop_url = '') and r->>'backdrop_url' is not null then r->>'backdrop_url' else backdrop_url end
      where id = (r->>'item_id')::uuid;
    end if;
    perform set_config('app.hydrating', 'off', true);
  end loop;
end;
$$;

-- Verificación (contra objetos reales, no contra el ledger):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--    where proname in ('hydrate_movie','hydrate_series') and pronamespace = 'public'::regnamespace;
--   -- esperado: UNA fila por función, con p_backdrop_url text al final.
--   select table_name, column_name from information_schema.columns
--    where table_schema='public' and column_name='backdrop_url';
--   -- esperado: movies y series.
```

(Si el Step 2 detectó SELECT por columna, añadir al final: `grant select (backdrop_url) on public.movies to anon, authenticated;` y lo mismo para `series`.)

- [ ] **Step 4: Registrar en el manifiesto y regenerar el baseline**

En `supabase/bootstrap/manifest.json`, cambiar la última entrada del array:

```json
    "20260923150000_hydrate_screens_bulk_no_hydrated_at.sql",
    "20260924120000_movies_series_backdrop_url.sql"
  ]
```

Regenerar:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; node scripts/db/bootstrap.mjs --baseline; npm run test:db:bootstrap
```

Expected: `supabase/schema-baseline.sql` termina con el bloque `-- 20260924120000_movies_series_backdrop_url` / `\ir migrations/20260924120000_movies_series_backdrop_url.sql`, y el test del bootstrap pasa.

- [ ] **Step 5: Aplicar en DEV y verificar**

`apply_migration` contra dev (`tyvzpuhxfwxrnkcpzxyg`), nombre `movies_series_backdrop_url`, con el SQL del Step 3. Luego `execute_sql`:

```sql
select proname, pg_get_function_identity_arguments(oid) as args
  from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('hydrate_movie','hydrate_series') order by 1;
select has_column_privilege('anon', 'public.movies', 'backdrop_url', 'SELECT') as anon_movies,
       has_column_privilege('anon', 'public.series', 'backdrop_url', 'SELECT') as anon_series,
       has_column_privilege('authenticated', 'public.movies', 'backdrop_url', 'UPDATE') as auth_upd_movies;
```

Expected: una sola fila por función, terminando en `p_backdrop_url text`; `anon_movies = true`, `anon_series = true`, `auth_upd_movies = false`.

Probar el fill-only y el check dentro de una transacción que se deshace (sustituir `<movie_id>` por un id real de dev con `backdrop_url` null, y `<user_id>` por un usuario de dev):

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub','<user_id>','role','authenticated')::text, true);
select public.hydrate_movie('<movie_id>'::uuid, p_backdrop_url => 'https://image.tmdb.org/t/p/w1280/a.jpg');
select public.hydrate_movie('<movie_id>'::uuid, p_backdrop_url => 'https://image.tmdb.org/t/p/w1280/b.jpg');
select backdrop_url from public.movies where id = '<movie_id>';
rollback;
```

Expected: `https://image.tmdb.org/t/p/w1280/a.jpg` (la segunda llamada no pisa). Y aparte:

```sql
begin;
update public.movies set backdrop_url = 'https://evil.example/x.jpg' where id = '<movie_id>';
rollback;
```

Expected: ERROR `violates check constraint "movies_backdrop_url_tmdb"`.

- [ ] **Step 6: Actualizar los tipos generados**

Regenerar con `generate_typescript_types` (proyecto dev) y sustituir `src/lib/supabase/database.types.ts`. Si la herramienta no está disponible, editar a mano:
- En `movies` y `series`: `backdrop_url: string | null` en `Row`, y `backdrop_url?: string | null` en `Insert` y `Update` (orden alfabético, justo antes de `cover_url`).
- En `Functions.hydrate_movie.Args` y `Functions.hydrate_series.Args`: `p_backdrop_url?: string` (orden alfabético, primero de la lista).

Comprobar:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260924120000_movies_series_backdrop_url.sql supabase/bootstrap/manifest.json supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "feat(catalogo): columna backdrop_url en movies/series, escrita solo por hydrate_* (ficha cinemática)"
```

---

### Task 2: `ScreenDetails.backdropUrl` en los detalles de TMDB

**Files:**
- Modify: `src/lib/catalog/tmdb.ts` (tipo `ScreenDetails` ~l.264; `getMovieDetails` ~l.353; `getSeriesDetails` ~l.409; constantes ~l.9)
- Test: `src/lib/catalog/tmdb.test.ts`

**Interfaces:**
- Produces: `ScreenDetails.backdropUrl: string | null` (también en `SeriesDetails`, que lo extiende); `export function tmdbBackdropUrl(path: string | null | undefined): string | null`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/catalog/tmdb.test.ts` (y añadir `getMovieDetails, getSeriesDetails, tmdbBackdropUrl` al import de `./tmdb`):

```ts
describe("tmdbBackdropUrl", () => {
  it("convierte backdrop_path en URL absoluta w1280", () => {
    expect(tmdbBackdropUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w1280/abc.jpg");
  });

  it("null, undefined o vacío -> null", () => {
    expect(tmdbBackdropUrl(null)).toBeNull();
    expect(tmdbBackdropUrl(undefined)).toBeNull();
    expect(tmdbBackdropUrl("")).toBeNull();
  });
});

describe("backdrop en los detalles de pantalla", () => {
  const originalApiKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = "test-token";
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  function stubJson(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
  }

  it("getMovieDetails lo saca de la MISMA respuesta de detalles", async () => {
    stubJson({ belongs_to_collection: null, backdrop_path: "/peli.jpg", runtime: 166 });
    const details = await getMovieDetails(693134);
    expect(details?.backdropUrl).toBe("https://image.tmdb.org/t/p/w1280/peli.jpg");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("getMovieDetails sin backdrop_path -> null", async () => {
    stubJson({ belongs_to_collection: null, backdrop_path: null });
    const details = await getMovieDetails(1);
    expect(details?.backdropUrl).toBeNull();
  });

  it("getSeriesDetails lo saca de la respuesta de /tv", async () => {
    stubJson({ backdrop_path: "/serie.jpg", number_of_seasons: 4 });
    const details = await getSeriesDetails(76331);
    expect(details?.backdropUrl).toBe("https://image.tmdb.org/t/p/w1280/serie.jpg");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/catalog/tmdb.test.ts
```

Expected: FAIL — `tmdbBackdropUrl is not a function` / `backdropUrl` undefined.

- [ ] **Step 3: Implementar**

En `src/lib/catalog/tmdb.ts`, junto a `TMDB_PROFILE_BASE` (~l.11):

```ts
// Backdrop apaisado para el hero de la ficha (spec 2026-09-23 ficha cinemática).
// w1280 y no `original`: el hero mide como mucho ~1920 de ancho a 420 de alto, y
// next/image ya pide el tamaño que toque al CDN.
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280";

export function tmdbBackdropUrl(path: string | null | undefined): string | null {
  return path ? `${TMDB_BACKDROP_BASE}${path}` : null;
}
```

En el tipo `ScreenDetails`, añadir tras `credits: CreditPerson[];`:

```ts
  /** Backdrop apaisado (w1280) para el hero de la ficha; null si TMDB no tiene. */
  backdropUrl: string | null;
```

En `getMovieDetails`, añadir `backdrop_path?: string | null;` al tipo genérico de `tmdbGet` (tras `runtime?: number | null;`) y `backdropUrl: tmdbBackdropUrl(data.backdrop_path),` al objeto devuelto (tras `credits: mapScreenCredits(data.credits),`).

En `getSeriesDetails`, añadir `backdrop_path?: string | null;` al tipo genérico (tras `status?: string | null;`) y `backdropUrl: tmdbBackdropUrl(data.backdrop_path),` tras `credits: mapScreenCredits(data.credits, data.created_by ?? []),`.

- [ ] **Step 4: Ejecutar y ver que pasan**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/catalog/tmdb.test.ts; npx tsc --noEmit
```

Expected: PASS y typecheck limpio. Si `tsc` falla porque algún test o fixture construye un `ScreenDetails` literal sin `backdropUrl`, añadirle `backdropUrl: null`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/tmdb.ts src/lib/catalog/tmdb.test.ts
git commit -m "feat(catalogo): ScreenDetails trae el backdrop de TMDB en la misma respuesta"
```

---

### Task 3: Guard `needsBackdrop` y escritura en `ensureItemEnriched`, cableado en las fichas

**Files:**
- Modify: `src/lib/people/enrich-item.ts` (tipo `EnrichableItem` ~l.29; tras `needsSizeHydration` ~l.52; tras `writeSizes` ~l.140; cuerpo de `ensureItemEnriched` ~l.165 y ~l.263)
- Test: `src/lib/people/enrich-item.test.ts`
- Modify: `src/app/pelicula/[id]/page.tsx` (`fetchMovie` ~l.90; llamada a `ensureItemEnriched` en `MovieTabs`)
- Modify: `src/app/serie/[id]/page.tsx` (`fetchSeries` ~l.97; llamada a `ensureItemEnriched` en `SeriesTabs`)

**Interfaces:**
- Consumes: `ScreenDetails.backdropUrl` (Task 2); RPC con `p_backdrop_url` (Task 1).
- Produces: `EnrichableItem.backdropUrl?: string | null`; `export function needsBackdrop(itemType: ItemType, item: EnrichableItem): boolean`; `MovieRow`/`SeriesRow` con `backdrop_url` (lo usa la PR 2 para el hero).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `src/lib/people/enrich-item.test.ts` (y `needsBackdrop` al import):

```ts
describe("needsBackdrop", () => {
  it("pide backdrop cuando la película o la serie no lo tiene", () => {
    expect(needsBackdrop("movie", { id: "m1", backdropUrl: null })).toBe(true);
    expect(needsBackdrop("series", { id: "s1", backdropUrl: null })).toBe(true);
  });

  it("no repite trabajo si ya lo tiene", () => {
    expect(
      needsBackdrop("movie", { id: "m1", backdropUrl: "https://image.tmdb.org/t/p/w1280/x.jpg" }),
    ).toBe(false);
  });

  // Mismo motivo que needsSizeHydration: es independiente de créditos y
  // tamaños. Una obra que ya tiene reparto y duración (casi todas las viejas)
  // no lo pediría nunca si dependiera de ellos.
  it("undefined cuenta como que falta", () => {
    expect(needsBackdrop("movie", { id: "m1", durationMinutes: 120 })).toBe(true);
  });

  it("los libros no tienen backdrop de TMDB", () => {
    expect(needsBackdrop("book", { id: "b1" })).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/people/enrich-item.test.ts
```

Expected: FAIL — `needsBackdrop is not a function`.

- [ ] **Step 3: Implementar el guard y la escritura**

En `EnrichableItem`, tras `episodeRuntimeMinutes?: number | null;`:

```ts
  /** Cine y series: el backdrop de TMDB ya guardado (ficha cinemática). */
  backdropUrl?: string | null;
```

Tras `needsSizeHydration`:

```ts
// Guard del backdrop, independiente de créditos y tamaños por la misma razón
// que el de arriba: casi todas las obras viejas ya tienen reparto y duración, y
// si el backdrop colgara de esos guards no se pediría nunca. Una obra que en
// TMDB NO tiene backdrop se queda a null y vuelve a preguntar al abrirse; el
// fetch de detalles ya se cachea 24h (`revalidate: 86400`), así que eso cuesta
// como mucho una llamada por obra y día, y se ahorra un valor centinela.
export function needsBackdrop(itemType: ItemType, item: EnrichableItem): boolean {
  if (itemType === "book") return false;
  return item.backdropUrl == null;
}
```

Tras `writeSizes`:

```ts
// Mismo camino que los tamaños: RPC fill-only (#674/#676), sin grant directo de
// UPDATE sobre la columna. 42501/P0001 = visitante anónimo, esperado e inocuo:
// lo guardará el primer visitante con sesión.
async function writeBackdrop(
  supabase: SupabaseServerClient,
  itemType: "movie" | "series",
  id: string,
  backdropUrl: string
): Promise<void> {
  const { error } =
    itemType === "movie"
      ? await supabase.rpc("hydrate_movie", { p_movie_id: id, p_backdrop_url: backdropUrl })
      : await supabase.rpc("hydrate_series", { p_series_id: id, p_backdrop_url: backdropUrl });
  if (error && error.code !== "42501" && error.code !== "P0001") {
    console.error("writeBackdrop failed", { itemType, id, error });
  }
}
```

En `ensureItemEnriched`, sustituir:

```ts
    const needsSize = needsSizeHydration(itemType, item);
    const needsCredits = !(await hasBilledCast(supabase, itemType, item.id));
    if (!needsCredits && !needsSize) return effects;
```

por:

```ts
    const needsSize = needsSizeHydration(itemType, item);
    const wantsBackdrop = needsBackdrop(itemType, item);
    const needsCredits = !(await hasBilledCast(supabase, itemType, item.id));
    if (!needsCredits && !needsSize && !wantsBackdrop) return effects;
```

Y sustituir:

```ts
    if (needsSize) await writeSizes(supabase, itemType, item.id, details);
    if (!needsCredits) return effects;
```

por:

```ts
    if (needsSize) await writeSizes(supabase, itemType, item.id, details);
    if (wantsBackdrop && details.backdropUrl) {
      await writeBackdrop(supabase, itemType, item.id, details.backdropUrl);
    }
    if (!needsCredits) return effects;
```

(La rama de libro devuelve antes de llegar aquí y `needsBackdrop` es false para libros, así que `itemType` ya es `"movie" | "series"`; si TypeScript no lo estrecha, usar `itemType as "movie" | "series"` en la llamada.)

**No** se añade nada a `EnrichmentEffects`: la fila de la obra se lee con el cliente de la petición en cada visita (`fetchMovie`/`fetchSeries`), no hay caché que expirar. Es una desviación consciente de la spec §2 («expira su caché en `after()`»): no existe esa caché.

- [ ] **Step 4: Ejecutar los tests**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/people/
```

Expected: PASS.

- [ ] **Step 5: Leer la columna en las fichas y pasarla**

En `src/app/pelicula/[id]/page.tsx`, `fetchMovie`: añadir `backdrop_url` a la lista del `select`:

```ts
      "id, title, director, cover_url, backdrop_url, synopsis, release_year, duration_minutes, genres, tmdb_id, hydrated_at",
```

y en la llamada `ensureItemEnriched(supabase, "movie", { ... })` de `MovieTabs`, añadir tras `durationMinutes: movie.duration_minutes,`:

```ts
        backdropUrl: movie.backdrop_url,
```

En `src/app/serie/[id]/page.tsx`, lo mismo: `backdrop_url` en el `select` de `fetchSeries` (junto a `cover_url`) y `backdropUrl: series.backdrop_url,` en su llamada a `ensureItemEnriched`.

- [ ] **Step 6: Typecheck y lint**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit; npm run lint
```

Expected: limpio.

- [ ] **Step 7: Verificación real en dev**

Arrancar el dev server (ver memoria del entorno: `npm run dev` a mano en el worktree, puerto 3000, comprobando antes que 3000 está libre). Con sesión iniciada, abrir `/pelicula/<id>` de una película de dev con `tmdb_id` y sin backdrop, esperar a que carguen las pestañas, y comprobar en dev:

```sql
select id, title, backdrop_url from public.movies where id = '<id>';
```

Expected: `backdrop_url` = `https://image.tmdb.org/t/p/w1280/...`. Repetir con una serie. Parar el dev server al acabar.

- [ ] **Step 8: Commit**

```bash
git add src/lib/people/enrich-item.ts src/lib/people/enrich-item.test.ts "src/app/pelicula/[id]/page.tsx" "src/app/serie/[id]/page.tsx"
git commit -m "feat(catalogo): la ficha rellena backdrop_url al abrirse (guard propio, fill-only)"
```

---

### Task 4: Documentación y aplicación en prod

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/DRIFT-CHECK.md`

- [ ] **Step 1: `data-model.md`**

Añadir un delta al principio (tras la cabecera de frescura, con el mismo formato que el delta de #1201) y actualizar la fecha de verificación:

```markdown
> **Delta 2026-09-24 (ficha cinemática, PR 1):** `movies.backdrop_url` y `series.backdrop_url`
> (`text`, nullable; migración `20260924120000_movies_series_backdrop_url.sql`). Backdrop apaisado
> de TMDB a `w1280` para el hero de la ficha. Check `*_backdrop_url_tmdb`: solo
> `https://image.tmdb.org/t/p/%`. Lo escriben **solo** `hydrate_movie`/`hydrate_series` (nuevo
> parámetro `p_backdrop_url`, fill-only) desde `ensureItemEnriched`; sin grant de UPDATE para
> `authenticated`. `hydrate_screens_bulk` acepta la clave `backdrop_url`. NULL = sin consultar
> o TMDB no tiene (sin centinela; reintenta al abrir la ficha).
```

Y en la sección de `books`, `movies`, `series` (~l.210), mencionar `backdrop_url` junto a la portada.

- [ ] **Step 2: `DRIFT-CHECK.md`, superficie 6**

Añadir una nota fechada bajo las notas existentes de la superficie 6:

```markdown
> **Nota del 2026-09-24 (ficha cinemática).** `movies` y `series` ganan `backdrop_url` **sin**
> grant de UPDATE, a propósito: se escribe solo por `hydrate_movie`/`hydrate_series` (SECURITY
> DEFINER), igual que las columnas de tamaño desde #676. Cada tabla sube en 1 su `cols` y NO su
> `con_update`. Si aparece con grant de UPDATE, alguien lo ha abierto y hay que revocarlo.
```

- [ ] **Step 3: Aplicar en PROD (con autorización explícita del usuario)**

Pedir en el chat: «¿Aplico la migración `20260924120000_movies_series_backdrop_url` en prod?». Solo con un sí, `apply_migration` contra `vmutcradmodhiltuohys` con el mismo SQL, y repetir las consultas de verificación del Task 1 Step 5 (sin las pruebas de escritura). Expected: igual que en dev.

- [ ] **Step 4: Commit**

```bash
git add docs/requirements/data-model.md docs/DRIFT-CHECK.md
git commit -m "docs(data-model): backdrop_url en movies/series, verificado en dev y prod"
```

- [ ] **Step 5: PR**

Push de la rama y PR con título `feat(catalogo): backdrop de TMDB para la ficha cinemática (PR 1/4)`, cuerpo con: resumen, enlace a la spec, verificación (consultas y resultados de dev y prod), y la nota de #437 («el backdrop es igual para todo el mundo; no se añade `use cache`»).
