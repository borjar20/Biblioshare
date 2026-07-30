---
[Canónico · verificado 2026-07-30]
---

# Normalización y navegación de géneros

## Problema

Los géneros viven como `genres text[]` en las tres tablas de catálogo (`books`,
`movies`, `series`) y hoy se llenan desde **dos fuentes con dos vocabularios que no
casan**:

- **Libros**: `mapSubjectsToGenres` (`src/lib/catalog/genres.ts`) traduce los
  `subject` de OpenLibrary a un **vocabulario cerrado en español** (~40 etiquetas),
  descartando el ruido. Bien.
- **Películas/series**: `resolveGenres` (`src/lib/catalog/tmdb.ts`) guarda **tal
  cual el nombre localizado que devuelve TMDB** (`/genre/{movie,tv}/list?language=es-ES`).
  Sin vocabulario cerrado, sin tope, sin limpieza. Entran "Película de TV", "Kids",
  "Reality", etc., y nombres que no coinciden con la lista cerrada de libros.

Consecuencias:

1. **Los dos vocabularios no casan.** "Ciencia ficción" de un libro y de una película
   pueden ser (o no) la misma cadena. Todo lo que compara géneros por string —retos
   (`src/lib/challenges/match.ts`), desglose de stats (`src/lib/stats/get-catalog-breakdown.ts`)—
   mezcla mal entre tipos.
2. **TMDB entra sin limpiar**, igual que entraban los subjects de OpenLibrary antes de
   `genres.ts`.
3. **No se puede navegar.** Un `GenreTag` se pinta pero no lleva a ningún sitio; no
   hay página de género ni filtro por género en la biblioteca.

## Objetivo de este ciclo

1. Un **vocabulario canónico único** al que mapean AMBAS fuentes.
2. TMDB **limpiado** a través de ese vocabulario (mapeo por id, no por string).
3. **Navegación**: página `/genero/[slug]` (catálogo mezclado) y filtro por género en
   "mi biblioteca".

Fuera de este ciclo (→ issues): índice global de géneros, editar género a mano por
obra, orden por popularidad en la página de género.

## Enfoque elegido (A)

Vocabulario canónico **definido en código**, y se **sigue guardando la label** en
`genres text[]`. No se introduce columna de slug ni tabla de géneros en BD.

Razón: la normalización real es el vocabulario único. Guardando la label, todos los
puntos de lectura que ya comparan strings (retos, stats, `GenreTag`) siguen
funcionando sin tocarse; solo que ahora los strings salen todos del mismo registro y
casan por construcción. El slug se usa únicamente para URLs y se deriva del registro.
Descartados: B (guardar slug → migrar todas las filas + criterios de reto + cada punto
de lectura), C (tabla de géneros en BD → overkill para una lista cerrada de código).

## Sección 1 — Vocabulario canónico + mapeadores

### 1.1 Registro (`src/lib/catalog/genre-vocab.ts`)

Única verdad sobre la forma de un género. Lista curada, ~45 entradas = unión de lo que
hoy sale por libros y por TMDB.

```ts
export type GenreDef = {
  slug: string;          // estable, URL-safe: "ciencia-ficcion"
  label: string;         // display, en español: "Ciencia ficción"
  appliesTo: ItemType[]; // ["book","movie","series"] o subconjunto
};
```

Helpers exportados (deterministas, sin colisiones por construcción):

- `GENRES: GenreDef[]` — la lista.
- `labelForSlug(slug): string | null`
- `slugForLabel(label): string | null` — mapea la label canónica a su slug.
- `isCanonicalLabel(label): boolean` — ¿esta cadena es una label del registro?
- `genreDefForSlug(slug): GenreDef | null`

**Vocabulario** (unión; la columna `appliesTo` acota dónde aplica cada uno):

- **Ficción (compartidos y de libro)**: Ciencia ficción, Distopía, Realismo mágico,
  Novela negra, Thriller, Misterio, Fantasía, Terror, Romance, Aventura, Histórica,
  Política, Clásicos, Humor, Cómic, Manga, Poesía, Teatro, Relatos, Infantil, Juvenil.
- **No ficción (de libro)**: Memorias, Biografía, Autoayuda, Historia, Filosofía,
  Psicología, Economía, Religión, Viajes, Cocina, Deporte, Arte, Ensayo, Divulgación.
- **Audiovisual (de peli/serie)**: Acción, Animación, Comedia, Drama, Documental,
  Familia, Western, Bélica, Crimen, Música (más Fantasía, Ciencia ficción, Misterio,
  Romance, Terror, Thriller, Aventura, Histórica reutilizadas de la sección de ficción).
  Los ids de TMDB sin canónico se descartan (ver §1.3).

> **NOTA para implementación**: la lista exacta con su `appliesTo` se congela en el
> plan. Regla de oro: cada label que HOY produce `genres.ts` debe existir en el
> registro (garantizado por test, ver 1.2), y cada id de TMDB relevante debe mapear a
> un slug del registro (ver 1.3).

### 1.2 Libros (`src/lib/catalog/genres.ts`)

Ya emite labels de un vocabulario cerrado. Cambio:

- Alinear las labels de `PREFIX_RULES`/`EXACT_RULES` a las del registro (deben ser
  idénticas carácter a carácter).
- **Test de invariante**: para toda regla de `genres.ts`, su label de salida está en
  `GENRES` (`isCanonicalLabel`). Un género en `genres.ts` que no exista en el registro
  es un fallo de test. Esto ata las dos piezas para siempre.
- `MAX_GENRES = 5` se mantiene.

### 1.3 Películas/series (`src/lib/catalog/tmdb-genres.ts`, nuevo)

Reemplaza a `getGenreMap`/`resolveGenres` de `tmdb.ts`.

- Tabla **`TMDB_GENRE_TO_SLUGS: Record<number, string[]>`**: id de género de TMDB →
  lista de slugs canónicos.
- **Mapeo por id, no por string**: así el nombre localizado de TMDB NUNCA se guarda; se
  guarda la label canónica resuelta desde el slug. Elimina el drift de localización.
- **Sin red extra**: hoy `getGenreMap` hace un fetch a `/genre/{kind}/list`. Con la
  tabla estática por id se puede quitar ese fetch (los ids de TMDB son estables). El
  cache `genreMapCache` y `getGenreMap` se retiran.
- **Ids compuestos de TV emiten varios slugs**:
  - `10765` (Sci-Fi & Fantasy) → `["ciencia-ficcion","fantasia"]`
  - `10759` (Action & Adventure) → `["accion","aventura"]`
  - `10768` (War & Politics) → `["belica","politica"]`
- **Ids sin canónico se descartan** (Kids `10762`, Reality `10764`, Talk `10767`,
  News `10763`, TV Movie `10770`, Soap `10766`): igual que el ruido de OpenLibrary.
- La salida se dedupe y se corta a `MAX_GENRES = 5`.
- `resolveGenres(kind, ids)` pasa a: `ids → slugs (dedupe, cap) → labels`.

### 1.4 Migración / backfill (dev primero, luego prod)

Las tablas de catálogo son **compartidas** (`SELECT` abierto). Recalcular `genres`:

- **`movies` / `series`**: es el backfill real. Sus filas actuales guardan labels TMDB
  crudas. No se puede recalcular en SQL puro (el mapeo vive en TS). Estrategia: **script
  de recompute** (Node, con service role) que lee cada fila, remapea desde su
  `genre_ids` de TMDB si está disponible, o —si solo tiene labels— traduce label TMDB
  conocida → slug canónico con una tabla puente. **A verificar en implementación**: si
  `movies`/`series` NO guardan los `genre_ids` originales, se necesita una tabla
  auxiliar label-TMDB→slug para el backfill (los nombres es-ES de TMDB son estables y
  finitos). Documentar cuál de las dos vías se usó.
- **`books`**: su vocab ya era cerrado. Solo hace falta backfill si alguna label del
  registro cambió de texto respecto a lo que `genres.ts` emitía antes. Si `books` guarda
  los `subject` crudos, re-mapear; si no, mapear label-vieja→label-nueva solo para las
  que cambiaron. **A verificar**: ¿existe columna de subjects crudos en `books`?
- Regla del repo: **"no aparece en `list_migrations` ≠ no está en prod"** — verificar el
  estado real de las columnas/filas, no el ledger.

## Sección 2 — Navegación

### 2.1 Página por género `/genero/[slug]`

- **Server component** en `src/app/genero/[slug]/page.tsx`.
- `slug` no válido (`genreDefForSlug` → null) ⇒ `notFound()`.
- Lista obras del **catálogo** (no solo las del usuario) con ese género, **mezclando los
  tres tipos**:
  - Se resuelve la label con `labelForSlug(slug)`.
  - Tres queries en paralelo, una por tabla, filtro de pertenencia al array:
    `.contains("genres", [label])` (equivale a `genres @> ARRAY[label]`).
  - Merge de los tres + paginación (mismo tamaño de página que otras listas del repo).
  - Solo se consultan las tablas cuyos géneros incluyen `appliesTo` de ese slug (no
    tiene sentido buscar "Ensayo" en `movies`).
- **Índice GIN** en `genres` de cada tabla (migración) para que el `@>` escale.
- **Tarjeta**: reusa la tarjeta de resultado de catálogo existente.
- **Orden**: alfabético por título (no depende de agregados). Popularidad → issue.
- **Cabecera**: label del género + conteo total.

### 2.2 `GenreTag` se vuelve enlace (`src/components/ui/genre-tag.tsx`)

- Hoy es un `<span>`. Pasa a envolver en `<Link href={/genero/${slug}}>` **cuando**
  `slugForLabel(label)` devuelve slug (label del registro).
- Si la label no está en el registro (dato viejo sin migrar), se queda como `<span>`
  muerto — sin enlaces rotos.
- Un solo cambio, se propaga a todas las fichas que ya usan `GenreTag`.

### 2.3 Filtro por género en "mi biblioteca"

- **Entrada UI** en `LibraryFilters`/`FiltersDropdown`
  (`src/components/library/library-filters.tsx`): un bloque "Género" con **solo los
  géneros que el usuario realmente tiene** (no los 45), como enlaces que fijan
  `?genero=<slug>` en la URL. Chip activo con "quitar". Estado en URL, pantalla server
  (mismo patrón que `/notas` y el resto de filtros de biblioteca).
- **Datos**: extender `getLibraryItems` (`src/lib/library/get-library-items.ts`) con
  `filters.genre?: string` (slug). El género vive en catálogo, no en `passes`, así que
  **no se puede empujar al SQL de `passes`** — se aplica igual que `search`/`sort`
  (post-hidratación):
  - Cargar géneros de las claves candidatas (reusar `loadGenres` de
    `src/lib/challenges/load-catalog-facets.ts`, que ya agrupa por tipo).
  - Conservar los items cuyo array de géneros contiene `labelForSlug(genre)`.
- Para poblar el selector "solo los que tengo": una función que, dado el conjunto de
  obras del usuario, devuelve los géneros distintos presentes (con conteo). Puede vivir
  junto a `getLibraryItems` o derivarse en la página.

## Radio de impacto (lo que NO cambia)

- `challenges/match.ts` y `get-catalog-breakdown.ts` comparan géneros por **string,
  case-insensitive**. No se tocan: tras la normalización los strings ya casan.
- Criterios de reto guardados (label del género): siguen siendo labels canónicas. Si el
  backfill cambia el TEXTO de alguna label, hay que migrar también esos criterios →
  **a verificar en implementación** qué labels cambian de texto y si algún reto las usa.
- `GenreTag` es el único componente de presentación de género que cambia.

## Componentes y sus fronteras

| Unidad | Qué hace | Depende de |
|---|---|---|
| `genre-vocab.ts` | Única verdad: lista + `slug↔label` + validación | nada (datos puros) |
| `genres.ts` (libros) | subjects OpenLibrary → labels canónicas | `genre-vocab` (test de invariante) |
| `tmdb-genres.ts` | ids TMDB → slugs → labels canónicas | `genre-vocab` |
| script de backfill | recalcula `genres` de filas existentes | los dos mapeadores + service role |
| `/genero/[slug]/page.tsx` | lista catálogo por género | `genre-vocab`, catálogo, índice GIN |
| `GenreTag` | chip → enlace si label canónica | `genre-vocab` (`slugForLabel`) |
| `getLibraryItems` (+`genre`) | filtra la biblioteca del usuario por género | `loadGenres`, `genre-vocab` |

## Testing

- **Unit** `genre-vocab`: `slugForLabel`/`labelForSlug` son inversas; sin slugs
  duplicados; sin labels duplicadas.
- **Unit** invariante `genres.ts`: toda label de salida ∈ registro.
- **Unit** `tmdb-genres.ts`: ids compuestos → varios slugs; ids de ruido → vacío; cap 5;
  dedupe.
- **Unit** filtro de biblioteca: dado un set de items con géneros, `genre=<slug>`
  conserva los correctos.
- **e2e**: abrir ficha → clic en `GenreTag` → `/genero/[slug]` lista la obra; filtro de
  género en biblioteca acota la lista.

## Riesgos / trampas

- **TMDB label sin id en backfill**: si las filas viejas no guardan `genre_ids`, el
  backfill depende de una tabla puente label-es-ES→slug. Confirmar la vía antes de
  correr el script (§1.4).
- **Índice GIN**: sin él, `@>` sobre `text[]` hace scan completo del catálogo. Va en la
  misma migración que habilita la página.
- **Labels que cambian de texto** rompen criterios de reto guardados y conteos
  históricos de stats. Enumerar los cambios de texto en el plan y migrar criterios si
  hace falta.
- **Doc a sincronizar al cerrar** (definición de "hecho", AGENTS.md):
  `docs/requirements/data-model.md` (índice GIN, nota de normalización de géneros),
  `docs/requirements/decisiones.md` (append: enfoque A), backlog si aplica.
