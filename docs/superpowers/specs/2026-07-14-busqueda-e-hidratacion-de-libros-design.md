# Búsqueda e hidratación de libros — diseño

Fecha: 2026-07-14
Depende de: `2026-07-14-ediciones-ficha-y-editor-design.md` (PR #32, en draft; sus
migraciones están solo en dev). Este diseño asume su modelo obra/edición como base.
Alcance: **solo libros**. Películas y series (TMDB) no se tocan.

## Problema

La API nos da obra + ediciones. La UI muestra obra + ediciones. En medio hay una
capa que lo aplana todo a "un libro" y lo cachea mal.

1. **Confundimos obra y edición en el origen.** `openlibrary.org/search.json`
   devuelve *obras* (`/works/OL…W`), pero `open-library.ts:mapSearchDoc` mapea
   cada doc como si fuera una edición: `isbn` = el primero de una lista de
   cientos, `publisher` = el primero de muchos, `pageCount` = la **mediana** de
   páginas. Después `group-editions.ts` reagrupa por título+autor normalizados,
   es decir, deduplica a mano lo que la API ya devuelve deduplicado; el
   `editionCount` que pinta la tarjeta es ruido.
2. **La sinopsis casi nunca llega.** Pedimos `description` en el parámetro
   `fields` de `search.json`, pero ese endpoint no la devuelve: vive en
   `/works/<key>.json`, que no llamamos nunca. En producción, 5 de 10 libros
   cacheados no tienen sinopsis y 6 de 10 no tienen portada.
3. **Los géneros son el volcado crudo de `subject`**, que en Open Library son
   cientos de etiquetas sucias ("Accessible book", "Protected DAISY",
   "New York Times bestseller"). Eso es lo que acaba en los `GenreTag` del hero.
4. **Lo sucio se hornea en la BD y no se cura nunca.** La búsqueda persiste cada
   resultado de la API nada más verlo, y como un hit local por título
   cortocircuita la API para siempre, ese registro ya no vuelve a mejorar.
5. **La ficha pinta editorial, ISBN y páginas de `books`** como si fueran datos
   de la obra — justamente lo que la Sección A del diseño de ediciones declara
   falso ("662 páginas" es mentira para quien lee la de bolsillo de 880).
6. La work key de Open Library se guarda en una columna llamada
   `google_books_id`, y `google-books.ts` es código muerto: nadie lo importa.

Estado del catálogo en producción (14/07/2026): 10 filas en `books`, **ninguna
en la biblioteca de nadie**. Todo lo cacheado es residuo de búsquedas y no
cuesta nada rehacerlo.

## La escalera de hidratación

Cada peldaño trae exactamente lo que su superficie muestra, y nada más.

### Peldaño 1 — Buscar (la tarjeta)

Una tarjeta de resultado muestra portada, título, autor y año. Eso es lo único
que se pide:

- `search.json` con `fields=key,title,author_name,cover_i,first_publish_year,edition_count`.
- **Se dejan de pedir** `description`, `subject`, `publisher`,
  `number_of_pages_median` e `isbn`: la tarjeta no los muestra, llegan sucios o
  vacíos, y son la fuente de toda la contaminación del catálogo.
- Un doc de `search.json` **es una obra** y como tal se trata. `editionCount`
  pasa a ser el `edition_count` real de Open Library.
- **La búsqueda no escribe en la base de datos.** Los resultados de la API
  viajan sin `catalogId`.
- El catálogo local se consulta siempre (búsqueda por título en `books`) y se
  **fusiona con los resultados de la API por `openlibrary_work_key`**: una obra
  que ya tenemos aparece una sola vez, con su `catalogId`, arriba del listado.
  Una obra local sin work key (creada a mano, importada) se muestra igual.

### El escáner de ISBN es un lookup, no una búsqueda

Es el único camino que cortocircuita la llamada a la API:

1. Buscar el ISBN en `book_editions` local. Si está, se devuelve **su obra**.
2. Si no, `/isbn/<isbn>.json` → devuelve la edición **y su work key**
   (campo `works[0].key`). Lo que se le devuelve al usuario es la obra.

### Peldaño 2 — Abrir la ficha (la obra)

La fila de `books` nace aquí, o al añadir el libro a la biblioteca — nunca antes
— y nace hidratada:

- `/works/<key>.json` da la **sinopsis** de verdad, la portada y los `subjects`.
- Si la obra no trae `description`, se cae a la `description` de la edición
  primaria (o de la mejor edición disponible). El idioma es el que venga
  (normalmente inglés); corregirlo al español es trabajo del editor de ficha
  (Sección C del diseño de ediciones).
- Los `subjects` pasan por un **vocabulario canónico** de géneros: mapeo cerrado
  `subject → género`, máximo 5 por obra, y lo que no mapea se descarta.
- Se disparan además, como ya hacen hoy: la sincronización de ediciones
  (`editions.json`, del diseño de ediciones) y el enriquecido de autores
  (`ensureItemEnriched`).
- Guards: `books.hydrated_at` y `books.editions_synced_at`. Si están puestos, no
  se vuelve a preguntar.
- **Nunca bloquea el render.** Todo va en `try/catch`; si Open Library falla o
  tarda, la ficha se pinta con lo que haya y `hydrated_at` queda a null para
  reintentar en la siguiente visita.

### Peldaño 3 — La edición (la tirada)

Sin cambios respecto al diseño de ediciones: editorial, ISBN, páginas e idioma
viven en `book_editions` y se pintan al pulsar una edición de la tira.

La consecuencia para esta capa: **nadie vuelve a escribir esos campos desde la
búsqueda.** `books.publisher`, `.isbn` y `.total_pages` quedan como espejo de la
edición primaria (el trigger que ya existe) y, mientras no haya primaria, en
`null` — que es la verdad, en lugar de la mediana inventada de hoy.

## Módulos

`open-library.ts` (232 líneas que mezclan búsqueda, lookup por ISBN, un fallback
heurístico y autores) se parte en piezas de una sola responsabilidad, bajo
`src/lib/catalog/openlibrary/`:

| Fichero | Responsabilidad |
| --- | --- |
| `work-search.ts` | `searchWorks(query)`: `search.json` → obras. Solo los campos de la tarjeta. |
| `isbn-lookup.ts` | `lookupIsbn(isbn)`: `/isbn/<isbn>.json` → `{ edition, workKey }`. |
| `work-detail.ts` | `fetchWork(key)`: `/works/<key>.json` → sinopsis, subjects, portada. |
| `editions.ts` | El `openlibrary-editions.ts` del diseño de ediciones, movido aquí sin tocarlo. |
| `authors.ts` | `resolveOpenLibraryAuthor`, tal cual, solo mudado. |

Dos módulos nuevos fuera de esa carpeta:

- `src/lib/catalog/genres.ts` — vocabulario canónico de géneros (en español,
  alineado con los que ya devuelve TMDB para películas y series) y la tabla de
  sinónimos `subject → género`. Función pura: `mapSubjectsToGenres(subjects)`.
- `src/lib/catalog/hydrate-book.ts` — `ensureBookHydrated(supabase, book)`, el
  peldaño 2. Hermano de `ensureItemEnriched`, mismo contrato: idempotente,
  guarded, nunca lanza.

Se borran:

- `group-editions.ts` y `title-match.ts` — agrupaban a mano lo que la API ya
  agrupa. (Verificar que no queden otros usos antes de borrar.)
- `google-books.ts` — código muerto.

`search.ts` queda reducido a orquestar: lookup por ISBN, o `searchWorks` +
búsqueda local fusionadas por work key.

## Tipos

`SearchResult` deja de cargar con `publisher`, `pageCount` e `isbn`: son datos de
edición y no viajan en un resultado de búsqueda. El tipo pasa a describir lo que
la tarjeta muestra.

`find-or-create.ts` ya no se llama desde la búsqueda, sino desde la ficha y desde
"añadir a la biblioteca", donde sí hay hidratación completa. Al perder los campos
de edición, desaparece también el `as never` que hoy reconcilia los inserts de
las tres tablas de catálogo.

## Esquema

Una migración, encima de las del diseño de ediciones (que siguen pendientes de
subir a producción):

- `books.google_books_id` → **`books.openlibrary_work_key`** (rename limpio: las
  10 filas existentes ya guardan work keys de Open Library).
- **`books.hydrated_at timestamptz null`**.

Las filas viejas quedan con `hydrated_at` a null, así que se rehidratan solas la
primera vez que alguien abra su ficha. No se borra nada.

## Errores

Toda llamada a Open Library es *best-effort*:

- La búsqueda devuelve los resultados locales si la API cae.
- La hidratación se traga el fallo y deja `hydrated_at` a null para reintentar.
- Ninguna rompe la página.

## Verificación

Tests unitarios puros donde hay lógica de verdad:

- `genres.ts`: el mapeo de `subject` a géneros canónicos, incluida la basura que
  debe descartarse ("Protected DAISY", "Accessible book", "New York Times
  bestseller"), y el tope de 5.
- La fusión local + API por work key (una obra ya cacheada aparece una vez y con
  `catalogId`; una local sin work key no se pierde).
- `lookupIsbn`: extracción de la work key desde el doc de `/isbn/`.

Sin tests contra la API real.

La verificación de UI va en un **checklist manual** (`docs/TESTING.md`):

1. Buscar "dune" → una tarjeta por obra, no diez ediciones casi iguales.
2. Abrir la ficha de un libro nuevo → sinopsis y géneros limpios donde antes
   salía "sin sinopsis" y etiquetas basura.
3. Abrir la ficha de uno de los 10 libros viejos → se rehidrata solo.
4. Escanear/buscar por ISBN → cae en la obra correcta, sin llamar a la API si ya
   está en `book_editions`.
5. El panel de metadatos de la obra ya no muestra editorial, ISBN ni páginas;
   esos datos aparecen al pulsar una edición de la tira.

Deuda conocida: vitest está roto con Node 20.9. Los tests nuevos se escriben
igual, pero puede que no se puedan ejecutar hasta arreglar eso.
