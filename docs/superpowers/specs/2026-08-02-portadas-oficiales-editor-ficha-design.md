# Portadas oficiales alternas en el editor de ficha

**Fecha:** 2026-08-02
**Estado:** Diseño aprobado
**Ámbito:** un plan de implementación

## Problema

El editor de ficha (`CatalogEditor` / `CatalogEditorForm`, `src/components/detail/catalog-editor.tsx`)
solo deja **subir** una portada nueva desde el dispositivo (`uploadCover`). No hay forma de
elegir entre las **portadas oficiales** que la fuente externa ya ofrece para esa obra. Un
colaborador que quiere cambiar la portada por otra oficial (mejor idioma, mejor edición) tiene
que ir a buscar el fichero a mano y subirlo.

Objetivo: en el editor, junto al upload manual, mostrar una galería de portadas oficiales de la
obra para cambiar la actual con un clic.

## Alcance

Los tres tipos de ficha: **película, serie, libro**.

- **Película / serie**: guardan `movies.tmdb_id` / `series.tmdb_id`. TMDB expone
  `GET /movie|tv/{id}/images` con `posters[]` — galería rica de posters oficiales.
- **Libro**: guarda `books.openlibrary_work_key`. El JSON de la obra en OpenLibrary trae
  `covers: number[]` — varias portadas de la obra. Cobertura más pobre y desigual que TMDB,
  asumido.

No entra: subir/editar el conjunto de portadas oficiales (son de solo lectura desde la fuente),
ni cambiar el flujo de upload manual existente (se conserva intacto).

## Decisiones tomadas en brainstorming

1. **Persistencia = URL externa directa.** Al elegir una portada, `cover_url` guarda la URL de
   `image.tmdb.org` / `covers.openlibrary.org` tal cual — exactamente como ya hace el importador
   al crear el ítem. Cero Storage, cero descarga server-side. Riesgo asumido: si la fuente cae o
   cambia, la portada se rompe (mismo riesgo que ya tienen todas las fichas importadas).
2. **Carga bajo demanda.** La galería NO se pide al abrir el editor. Aparece un botón
   "Ver otras portadas"; solo al pulsarlo se hace el fetch a TMDB/OpenLibrary. Corregir solo texto
   no gasta ninguna llamada externa.

## Arquitectura

Dos server actions nuevas en `src/lib/catalog/edit-actions.ts` (junto a `uploadCover`), un helper
de TMDB, y ampliación de `CatalogEditorForm`. El upload manual (`uploadCover`, `handleCoverChange`)
no se toca.

### 1. `fetchOfficialCovers(itemType, itemId): Promise<{ covers: string[] }>`

Server action. Devuelve la lista de URLs de portadas oficiales de la obra.

- Validación runtime al entrar: `isValidItemType(itemType)` + `isValidUuid(itemId)` (helpers ya
  existentes en el fichero). Se llama directo desde el cliente → args manipulables.
- `requireCollaborator` (misma guardia que el resto del editor): la galería solo la ve quien puede
  cambiar la portada.
- Lee el **id externo desde la BD** por `itemId` (no se pasa desde el cliente):
  - `movie` → `movies.tmdb_id`
  - `series` → `series.tmdb_id`
  - `book` → `books.openlibrary_work_key`
- Según el tipo:
  - **movie/series**: nuevo helper `getPosterPaths(kind, tmdbId)` en `src/lib/catalog/tmdb.ts`
    → `GET /movie|tv/{id}/images?include_image_language=es,en,null` → mapea `posters[].file_path`
    a `${TMDB_IMAGE_BASE}${file_path}` (base `w342`, el mismo que usa `searchMovies`/`searchSeries`,
    para que la portada elegida sea coherente con las importadas).
  - **book**: reusa/añade helper sobre el JSON de la obra de OpenLibrary
    (`https://openlibrary.org/works/{key}.json`, patrón de `fetchWork`) → `covers.filter(id => id > 0)`
    → `buildCoverUrl(id, "L")` (`src/lib/catalog/openlibrary/covers.ts`).
- **Nunca lanza.** Fuente caída, sin id externo, o `TMDB_API_KEY` ausente → `{ covers: [] }`.
- Tope: **12** portadas (`slice(0, 12)`), para no volcar galerías enormes de TMDB.
- Deduplica URLs.

### 2. `setOfficialCover(itemType, itemId, url): Promise<EditItemState>`

Server action. Fija `cover_url` a una URL de portada oficial elegida.

- Validación runtime: `isValidItemType` + `isValidUuid`.
- **Allowlist de host — obligatoria.** `url` debe parsear como `https:` con hostname en
  `{ "image.tmdb.org", "covers.openlibrary.org" }`. Igual que `uploadCover`/`deleteEdition`, esta
  action se invoca **directamente** desde el cliente (no vía `.bind()` cifrado de un `<form>`), así
  que `url` es 100% manipulable. Sin allowlist, cualquiera con el cliente fija `cover_url` a una URL
  arbitraria que luego se sirve en la ficha compartida por toda la comunidad. Host no permitido →
  `{ error: "generic" }`.
- `requireCollaborator`.
- `update({ cover_url: url })` sobre `books`/`movies`/`series` según tipo (mismo switch que
  `uploadCover`).
- `revalidateItemPage(itemType, itemId)` + `{ ok: true }`.

Reutiliza `EditItemState` (`error?: ... | "generic"; ok?: boolean`) — no necesita códigos nuevos.

### 3. UI en `CatalogEditorForm` (`src/components/detail/catalog-editor.tsx`)

Estado nuevo (junto a `coverUrl`/`coverUploading`/`coverError`):

- `showCovers: boolean` — galería abierta/cerrada.
- `officialCovers: string[] | null` — `null` = aún no pedidas.
- `coversLoading` vía `useTransition`.
- `coversError: boolean`.

Interacción:

- Bajo el bloque de la portada (después del `coverError` existente), botón toggle
  **"Ver otras portadas"** / **"Ocultar portadas"** (solo modo edición, ya garantizado por estar
  dentro de `CatalogEditorForm`).
- Primera apertura → `startTransition(async () => { const r = await fetchOfficialCovers(itemType, itemId); setOfficialCovers(r.covers) })`.
  Cachea en estado: reabrir no vuelve a pedir. Estados: cargando (`coversLoading`), vacío
  (`officialCovers.length === 0` → texto "no hay otras portadas"), con error de red (`coversError`).
- Grid de miniaturas `aspect-[2/3]` (reutilizar el mismo look del botón de portada). La miniatura
  cuyo `url === coverUrl` se marca (borde de acento) como seleccionada.
- Click en una miniatura → **optimista**: `previous = coverUrl; setCoverUrl(url)`, luego
  `await setOfficialCover(itemType, itemId, url)`; si `result.error` → `setCoverUrl(previous)` +
  marcar error. Mismo patrón exacto que `handleCoverChange` con el upload manual.

Elegir una portada oficial y subir una manual escriben ambas `cover_url`: la última acción gana,
sin conflicto de estado (las dos hacen `setCoverUrl` + su propio server action + `revalidateItemPage`).

### 4. i18n

Añadir al namespace `catalogEdit` en `messages/*.json` (todos los locales que existan):

- `showOfficialCovers` — "Ver otras portadas"
- `hideOfficialCovers` — "Ocultar portadas"
- `noOfficialCovers` — "No hay otras portadas oficiales"
- `coversLoading` — "Buscando portadas…"

(El error reusa `errors.generic`, ya existente.)

## Flujo de datos

```
[Editor abierto]
   │  click "Ver otras portadas"
   ▼
fetchOfficialCovers(itemType, itemId)  ── lee id externo de BD ──▶ TMDB /images  o  OL work.json
   │                                                                    │
   ◀───────────────────  { covers: string[] }  ◀────────────────────────┘
   │  render grid
   │  click miniatura (optimista: setCoverUrl)
   ▼
setOfficialCover(itemType, itemId, url)  ── allowlist host ─▶ update cover_url ─▶ revalidateItemPage
   │  ok → portada nueva persiste ;  error → revert setCoverUrl(previous)
```

## Manejo de errores

| Caso | Comportamiento |
|------|----------------|
| Sin `TMDB_API_KEY` / fuente caída / sin id externo | `fetchOfficialCovers` → `{ covers: [] }` → UI "no hay otras portadas" |
| `url` con host no permitido (POST directo) | `setOfficialCover` → `{ error: "generic" }`, `cover_url` intacto |
| `setOfficialCover` falla el update | revert de la preview optimista + `errors.generic` |
| `itemType`/`itemId` inválidos (POST directo) | ambas actions → salida temprana `generic` / `covers: []` |
| No colaborador | `requireCollaborator` corta (redirect a login o `forbidden`); RLS es la defensa real |

## Testing

Vitest sobre las piezas puras y las guardias (sin red real — `fetch` mockeado):

1. **Mapper TMDB images** (`getPosterPaths`): `posters[].file_path` → URLs con base `w342`;
   respuesta vacía / `!res.ok` / sin API key → `[]`.
2. **Mapper OL covers**: `covers: number[]` → URLs `buildCoverUrl(..,"L")`; filtra ids `<= 0`.
3. **Allowlist de `setOfficialCover`**: acepta `image.tmdb.org` y `covers.openlibrary.org`;
   rechaza otros hosts, `http:`, y basura no-URL → `{ error: "generic" }` sin tocar BD.
4. **Tope y dedup** de `fetchOfficialCovers`: ≤ 12, sin duplicados.

e2e (Playwright) del flujo galería: opcional, según default de `docs/TESTING.md`. El núcleo de
seguridad (allowlist) y de mapeo va cubierto por los unit tests.

## Notas de implementación (CLAUDE.md / GitNexus)

- Correr `impact({target, direction:"upstream"})` sobre `CatalogEditorForm` y `uploadCover` antes
  de editarlos, y reportar blast radius.
- `detect_changes({scope:"compare", base_ref:"main"})` antes de commitear.
- **Doc a sincronizar al cerrar**: no toca esquema (reusa `cover_url`). Marcar la feature en
  `docs/requirements/backlog.md` si existe la entrada; decisión de "URL externa directa vs copiar a
  Storage" va como entrada nueva al final de `docs/requirements/decisiones.md`.
- Cualquier pendiente/sospecha descubierta → issue en el repo (regla AGENTS.md).
