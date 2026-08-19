# Diseño: catálogo global server-authoritative (cierre del envenenamiento)

- **Fecha:** 2026-08-14
- **Issue:** #674 (`area:catalogo · tipo:bug · P0`)
- **Estado:** propuesta, pendiente de aprobación
- **Relacionadas:** #676 (DoS `total_seasons`) — comparte mecanismo, ver §8.

## 1. Problema

Un usuario `authenticated` puede crear filas canónicas de `movies`/`series`/`books`
con metadatos arbitrarios ligados a un identificador externo real
(`tmdb_id`/`openlibrary_work_key`). Como el resto de usuarios resuelve la obra por
ese id, la fila envenenada pasa a ser la canónica que ve **todo el mundo**, y —peor—
el `UNIQUE` sobre el id externo impide crear después el registro auténtico.

Dos superficies de entrada, ambas verificadas:

1. **PostgREST directo.** Policy INSERT `with check (true)` a `authenticated` +
   grants de columna que permiten escribir `title, synopsis, genres,
   director/creator/author, release_year/published_year, original_title, cover_url`
   y las de hidratación (`duration_minutes, total_seasons, total_episodes,
   episode_runtime_minutes`). Un `POST /rest/v1/movies` basta.
2. **Server Actions.** `openCatalogItem(result)` y `addToLibrary(result)`
   (`src/app/buscar/actions.ts:25,65`) son `"use server"` y aceptan el objeto
   `SearchResult` completo del cliente, que se persiste vía
   `catalogInsertPayload` (`src/lib/catalog/find-or-create.ts:21-46`) sin
   reconciliar contra el proveedor.

El UPDATE de los campos de ficha ya está blindado a `collaborator+` por el trigger
`enforce_catalog_edit_collaborator_only`
(`supabase/migrations/20260714_editions_h_catalog_edit_grants.sql`); el hueco es el
**INSERT**, que hoy lleva los datos precisamente porque hidratar por UPDATE lo
bloquearía ese trigger.

## 2. Principio de diseño

**El cliente aporta como máximo un `externalId` opaco + `itemType`. El servidor es
la única fuente de la verdad de los campos canónicos**, que obtiene del proveedor
oficial (TMDB/OpenLibrary) por ese id. La base de datos deja de aceptar escrituras
de campos canónicos desde `authenticated` por vías directas; esos datos entran
**solo** por funciones `SECURITY DEFINER` fill-only cuyas entradas provienen de un
fetch server-side.

Es la generalización de un patrón que el repo **ya tiene y da por bueno** para
libros: `ensureBookHydrated` (`src/lib/catalog/hydrate-book.ts`) obtiene sinopsis y
géneros de un fetch a OpenLibrary y los escribe con la RPC definer fill-only
`hydrate_book` (`supabase/migrations/20260715_book_hydration.sql`), que "rellena
huecos, no pisa curación".

## 3. Modelo de escritura en dos partes

### 3a. Insert = shell sin datos canónicos

Nueva RPC `SECURITY DEFINER`:

```
register_catalog_item(p_item_type text, p_external_id text) returns uuid
```

- Inserta una fila shell: **solo** la columna de id externo + `created_by =
  auth.uid()` + `created_at`. Todos los campos canónicos quedan `NULL`.
- `on conflict (<id externo>) do nothing`; devuelve el id (existente o nuevo)
  releyendo por el id externo. Resuelve la carrera igual que hoy (23505).
- `raise exception` si `auth.uid() is null` (anónimo no crea catálogo; mismo
  comportamiento observable que el 42501 de hoy).
- `revoke all from public; grant execute to authenticated`.

**Garantía dura:** el atacante no puede fijar `title` (ni ningún canónico) en el
insert, y no puede crear una fila que bloquee la auténtica — la shell **es** la
fila auténtica, con el id externo correcto; se hidratará bien en la primera
apertura de ficha por cualquiera. El peor caso de esta vía es crear shells vacías
(abuso menor, no de integridad).

Se **revoca el INSERT entero** de `authenticated` sobre `movies`/`series`/`books`:
la RPC es `SECURITY DEFINER` y escribe como owner, así que no necesita el grant. La
policy/​grant de INSERT directo desaparece y la única vía de alta pasa a ser esta
RPC.

### 3b. Hidratación = escritor fiable, datos de fetch server-side

Los campos canónicos los rellena la hidratación, que obtiene los datos del
proveedor por el id externo y escribe por RPC definer fill-only.

- **Libros:** ya existe (`hydrate_book` + `ensureBookHydrated`). Se conserva.
- **Películas/series:** se añaden.
  - Columna guard `hydrated_at timestamptz` en `movies` y `series` (hoy no existe;
    hermana de `books.hydrated_at`), con `grant update (hydrated_at) to
    authenticated`.
  - RPCs `hydrate_movie(p_movie_id, ...)` y `hydrate_series(p_series_id, ...)`
    definer, fill-only, que marcan `hydrated_at = now()`. Campos:
    - movie: `title, original_title, director, synopsis, genres, release_year,
      cover_url, duration_minutes`.
    - series: idem + `creator` (no director), `total_seasons, total_episodes,
      episode_runtime_minutes`.
  - `ensureMovieHydrated`/`ensureSeriesHydrated` (hermanas de `ensureBookHydrated`):
    guard por `hydrated_at`, fetch server-side por id
    (`getMovieAsSearchResult(tmdbId)` ya existe; para series
    `getSeriesDetails`/equivalente), escritura por la RPC. Nunca lanzan.

### 3c. Semántica de la RPC de hidratación (cierra la carrera)

`hydrate_book` es fill-only puro: solo escribe columnas que estaban `NULL`/vacías.
Eso protege la **curación de un colaborador**, pero **no** impide envenenar una
shell recién creada (todo `NULL`): un atacante podría llamar `hydrate_movie(shell,
basura)` antes de que un fetch legítimo la rellene.

Para cerrar esa carrera, las RPC de hidratación distinguen dos estados por el guard
`hydrated_at`:

- **`hydrated_at IS NULL` (shell sin hidratar): escritura autoritativa.** La
  hidratación pisa cualquier valor previo con lo que trae el proveedor y marca
  `hydrated_at`. Así, aunque una shell llegue pre-envenenada, la primera apertura
  legítima de ficha (fetch server-side) la corrige.
- **`hydrated_at IS NOT NULL` (ya hidratada): fill-only** de huecos que sigan
  vacíos, sin pisar nunca lo curado. Igual que `hydrate_book` hoy.

Consecuencia: cualquier obra que alguien llegue a **abrir** queda con datos del
proveedor. Una shell que nadie abre jamás queda **vacía**, nunca envenenada con un
título falso visible. `hydrate_book` se alinea a esta semántica (hoy es fill-only
puro; pasa a autoritativa-si-no-hidratada) para uniformidad — cambio de
comportamiento acotado y deliberado, se registra en `decisiones.md`.

## 4. Cambios en los call sites

`findOrCreateCatalogItem(supabase, result, userId)` — reescrito:

1. `id = rpc register_catalog_item(itemType, externalId)`.
2. Dispara la hidratación del tipo correspondiente. **Descarta por completo los
   campos canónicos de `result`**; solo usa `externalId`, `itemType` y
   `matchedIsbn` (este último para `ensureBookEdition`, que ya valida server-side).

`findOrCreateCatalogItemsBulk` (créditos de persona,
`src/lib/people/hydrate-person-credits.ts`) — es un camino **de origen servidor y
fiable**: sus `SearchResult` se construyen desde la propia llamada a
`person/combined_credits` de TMDB, no del cliente. Alta shell + hidratación con los
datos de TMDB **ya en mano** (sin re-fetch por ítem, para no convertir 300 créditos
en 300 llamadas): tras la shell, llama a `hydrate_movie/series` con los campos que
ya trae. Legítimo porque el dato es de origen servidor, y la RPC fill-only no puede
pisar curación.

Entradas de **origen cliente** que hoy pasan `SearchResult`:
`src/app/buscar/actions.ts`, importación (`src/lib/import/*`), actividad de club
(`src/components/clubs/activity-actions.ts`), saga manual
(`src/lib/sagas/get-saga.ts`). Todas quedan cubiertas sin tocar su firma: al pasar
por `findOrCreateCatalogItem`, sus campos canónicos se ignoran y el servidor
re-obtiene por id. La ficha de peli/serie cablea `ensureMovieHydrated`/
`ensureSeriesHydrated` en su `after()`/curador, igual que hace hoy la de libro.

## 5. Cambios de esquema (migración, dev primero)

1. `revoke insert` entero de `authenticated` en `movies`/`series`/`books` y drop de
   la policy INSERT `catalog * insertable`; la RPC definer es el único alta.
2. `alter table movies/series add column hydrated_at timestamptz;` +
   `grant update (hydrated_at) to authenticated`.
3. `register_catalog_item`, `hydrate_movie`, `hydrate_series` (definer, revoke
   public, grant execute authenticated).
4. `hydrate_book`: ajustar a semántica autoritativa-si-no-hidratada.
5. Verificar la superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) — se
   añaden columnas y se cambian grants.

## 6. Qué NO cambia (fuera de alcance de #674)

- La RLS de `passes` y datos de usuario: intacta; esto es solo catálogo global.
- El editor de ficha de colaborador (trigger UPDATE): intacto; sigue siendo la vía
  de corrección manual.
- El clamp de concurrencia TMDB y el `CHECK` de rango de `total_seasons` viven en
  **#676**; aquí solo se prepara el terreno (ver §8).

## 7. Verificación

- Unit: `find-or-create` ya tiene tests (`find-or-create-bulk.test.ts`,
  `match-row.test.ts`) — se adaptan al nuevo flujo shell+hidratar.
- Nuevos unit para `hydrate_movie/series` fill-only vs autoritativa (mockeando el
  fetch).
- SQL de regresión: como `authenticated`, un `insert into movies(tmdb_id, title)`
  directo debe **fallar**; `register_catalog_item` debe crear shell vacía; abrir
  ficha debe rellenar desde el proveedor; un segundo `hydrate_*` con basura sobre
  fila ya hidratada **no** debe pisar.
- e2e: alta desde `/buscar` sigue mostrando la ficha con título/sinopsis correctos.

## 8. Sinergia con #676 (`total_seasons` DoS)

Una vez `total_seasons` lo escribe **solo** `hydrate_series` con el valor real de
TMDB (y se revoca el `grant update (total_seasons)` directo a `authenticated`), el
usuario deja de poder inflarlo. #676 añade encima el `CHECK`/clamp de rango y la
concurrencia limitada en `getSeriesEpisodes`. Este diseño hace la primera de las
tres capas de #676; se implementan en PRs separadas pero conviene ordenarlas
seguidas.

## 9. Residual conocido

Una shell que **nadie llega a abrir nunca** puede ser rellenada con basura por un
atacante vía `hydrate_*` mientras `hydrated_at IS NULL`. Como nadie abre esa ficha,
nadie ve la basura; y la primera apertura legítima la corrige (escritura
autoritativa). No hay título falso visible sobre una obra que la gente consulte. Se
acepta como residual y se documenta; si se quisiera cerrar del todo haría falta un
canal de escritura que el cliente crudo no pueda invocar (service_role), descartado
en la decisión de alcance.
