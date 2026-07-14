# Ediciones en la ficha y editor de ficha oficial — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la ficha muestre la edición que pulsas (y no mezcle obra con tirada), que las ediciones reales lleguen de OpenLibrary, y que un colaborador pueda corregir la ficha oficial.

**Architecture:** Tres bloques independientes sobre el modelo de ediciones que ya está en producción. (A) el panel de metadatos pasa a ser una vista de la obra o de la edición seleccionada, gobernada por la tira de ediciones. (B) al abrir la ficha se traen las ediciones del *work* de OpenLibrary, filtradas y cacheadas con una marca en `books`. (C) un editor de ficha para colaborador+, con subida de portada a Storage, CRUD de ediciones y las sagas dentro.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + RLS + Storage), next-intl, Tailwind v4, Vitest 4.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-07-14-ediciones-ficha-y-editor-design.md`. Léela antes de empezar.
- **Node 22 obligatorio.** El `node` por defecto de la máquina es 20.9 y no arranca las herramientas. Comandos:
  - Tests: `fnm exec --using=22 node ../../../node_modules/vitest/vitest.mjs run <ruta>`
  - Typecheck (LENTO, >2 min: usa timeout 300000): `fnm exec --using=22 node ../../../node_modules/typescript/bin/tsc --noEmit`
  - Lint: `fnm exec --using=22 node ../../../node_modules/eslint/bin/eslint.js --config ../../../eslint.config.mjs <ruta>`
  - Build: `fnm exec --using=22 node ../../../node_modules/next/dist/bin/next build`
- **Toda copy visible pasa por next-intl** (`messages/es.json`). Nunca literales en el JSX.
- **Prohibido `setState` dentro de `useEffect`** (regla de lint `react-hooks/set-state-in-effect`) y **prohibido `Date.now()` durante el render** (`react-hooks/purity`). Para estado derivado, ajusta durante el render — patrón `prevState` de `src/components/detail/edition-strip.tsx`.
- **Las series NO tienen ediciones.** Las películas tienen versiones (`movie_versions`).
- **La nota se guarda 1–10 y se muestra en estrellas 0,5–5.** No la toques aquí.
- **Migraciones:** se escriben en `supabase/migrations/YYYYMMDD_<nombre>.sql` y **se aplican primero en DEV** (proyecto `tyvzpuhxfwxrnkcpzxyg`, vía Management API con `$SUPABASE_ACCESS_TOKEN`, porque el MCP apunta a prod). Prod se aplica al final, con el visto bueno del usuario. Las migraciones se aplican en **orden alfabético**: si dos del mismo día dependen entre sí, el nombre debe forzar el orden.
- **Toda tabla o bucket nuevo lleva RLS y grants explícitos.** Un `grant` por columna no restringe nada si no hay un `revoke` previo (el grant de tabla cubre todas las columnas).
- **Verificación de UI:** checklist manual en markdown (`docs/TESTING.md`), nunca E2E automático.
- **Cuenta de pruebas:** `devtest` (credenciales en `.env.local`). No borrarla nunca.

---

## Estructura de ficheros

**Nuevos:**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/catalog/openlibrary-editions.ts` | Pedir y **filtrar** las ediciones de un work de OpenLibrary. Puro salvo el `fetch`. |
| `src/lib/catalog/openlibrary-editions.test.ts` | Tests del filtro y del mapeo (lo único con reglas de verdad). |
| `src/lib/editions/sync-editions.ts` | Cache-as-you-go: si el libro no está sincronizado, importa sus ediciones y marca la fecha. |
| `src/components/detail/edition-details.tsx` | El panel de la derecha: datos de la obra, o de la edición seleccionada. |
| `src/components/detail/catalog-editor.tsx` | El editor de ficha oficial (obra + ediciones + sagas). |
| `src/lib/catalog/edit-actions.ts` | Server actions del editor: guardar obra, editar/borrar edición, subir portada, resincronizar. |
| `supabase/migrations/20260714_editions_sync.sql` | `books.openlibrary_work_key`, `books.editions_synced_at`, FK restrictiva de `edition_id`. |
| `supabase/migrations/20260714_covers_bucket.sql` | Bucket `covers` de Storage, escribible solo por colaborador+. |

**Modificados:** `src/components/detail/edition-strip.tsx` (las tarjetas pasan a ser botones), `src/components/detail/metadata-sidebar.tsx` (o lo sustituye `edition-details.tsx`), `src/app/{libro,pelicula,serie}/[id]/page.tsx`, `src/components/detail/log-panel.tsx` (elegir edición al seguir/abrir pase), `src/lib/catalog/find-or-create.ts` (guardar la work key), `messages/es.json`, `docs/REQUIREMENTS.md`.

**Eliminados al final:** `src/components/saga-assign-form.tsx` (se absorbe en el editor).

**Fases:** A la ficha (T1–T3) · B OpenLibrary (T4–T7) · C el editor (T8–T12) · cierre (T13). Cada fase deja la app funcionando y se puede parar ahí.

---

## Fase A — La ficha muestra la edición que estás mirando

### Task 1: El panel de la obra deja de mentir

**Files:**
- Modify: `src/app/libro/[id]/page.tsx` (donde se construye `metaRows`, sobre la línea 155), `src/app/pelicula/[id]/page.tsx`, `messages/es.json`

**Interfaces:**
- Produces: `metaRows` del libro contiene solo autoría, año de primera publicación y (si existe) el número de obras de su saga. Ya NO contiene editorial, ISBN ni páginas.

- [ ] **Step 1: Quitar de la ficha de libro lo que es de la edición**

En `src/app/libro/[id]/page.tsx`, el bloque que hoy hace:

```tsx
if (book.publisher)
  metaRows.push({ label: tMeta("publisher"), value: book.publisher });
if (book.published_year)
  metaRows.push({ label: tMeta("published"), value: String(book.published_year) });
if (book.total_pages)
  metaRows.push({ label: tMeta("pages"), value: `${book.total_pages} ${t("pages")}` });
if (book.isbn) metaRows.push({ label: tMeta("isbn"), value: book.isbn });
```

pasa a ser solo el año, y renombrado, porque el año de la obra es el de **primera publicación**, no el de la tirada:

```tsx
if (book.published_year)
  metaRows.push({
    label: tMeta("firstPublished"),
    value: String(book.published_year),
  });
```

Editorial, páginas e ISBN desaparecen de `metaRows`: son de la edición y se verán en el panel de la edición (Tarea 2).

- [ ] **Step 2: Lo mismo en película**

En `src/app/pelicula/[id]/page.tsx`, quita la fila de duración de `metaRows` (la duración es de la versión). Deja director y año.

- [ ] **Step 3: Copy**

En `messages/es.json`, dentro de `detail.meta`, añade `"firstPublished": "Primera publicación"`. No borres `publisher`, `pages`, `isbn` ni `duration`: los va a usar el panel de la edición en la Tarea 2.

- [ ] **Step 4: Comprobar**

Run: `fnm exec --using=22 node ../../../node_modules/typescript/bin/tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/libro src/app/pelicula messages/es.json
git commit -m "fix(detail): la ficha deja de mostrar los datos de una tirada como si fueran de la obra"
```

---

### Task 2: Panel de detalles de la edición

**Files:**
- Create: `src/components/detail/edition-details.tsx`
- Modify: `src/components/detail/edition-strip.tsx`, `src/app/libro/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`, `messages/es.json`

**Interfaces:**
- Consumes: `Edition` de `src/lib/editions/types.ts` (`{ id, label, publisher, year, language, totalUnits, isbn, coverUrl, isPrimary }`; `totalUnits` = páginas en libro, minutos en película), `formatEdition` de `src/lib/editions/edition-label.ts`.
- Produces:
  - `<EditionDetails itemType editions selectedEditionId onSelect workRows genres genresLabel />`
  - La selección vive en el componente cliente que envuelve tira + panel; el servidor no sabe nada de ella.

- [ ] **Step 1: Hacer clicables las tarjetas de la tira**

En `src/components/detail/edition-strip.tsx`, las tarjetas de edición pasan de `<div>` a `<button type="button">` con `onClick={() => onSelect(edition.id)}` y `aria-pressed={viewingId === edition.id}`. Dos props nuevas: `viewingId: string | null` y `onSelect: (id: string | null) => void`.

**Ojo, esto es lo que más fácil se hace mal:** el ✓ y el badge "La tuya" marcan la edición **del pase** (`selectedEditionId`), y el borde de acento marca la que **estás mirando** (`viewingId`). Son dos cosas distintas y pueden no coincidir: mirar no adopta. No las unifiques.

- [ ] **Step 2: Escribir el panel**

`src/components/detail/edition-details.tsx`, cliente. Si `viewingId` es null, pinta las filas de la obra (`workRows`, del tipo `MetaRow` que ya existe) y los géneros, reutilizando el estilo de `metadata-sidebar.tsx`. Si hay una edición seleccionada, pinta SUS datos:

- Libro: etiqueta, editorial, año de la tirada, idioma, páginas, ISBN.
- Película: etiqueta, año, duración.
- Su portada, si tiene una distinta de la de la obra.
- Un botón "Volver a la obra" que llama a `onSelect(null)`.

Toda la copy desde `messages/es.json` (`detail.meta.*` ya tiene publisher/pages/isbn/duration; añade `detail.backToWork` y `detail.editionInfo`).

- [ ] **Step 3: Unir tira y panel en las páginas**

Tira y panel comparten estado, así que necesitan un padre cliente común. Crea ese contenedor dentro de `edition-details.tsx` (exporta también `<EditionsSection …>` que renderiza `<EditionStrip>` + `<EditionDetails>` con un `useState<string | null>(null)` para `viewingId`), y usa ESE en las tres páginas en vez de `<EditionStrip>` suelto.

En serie no se pinta nada de esto (no tiene ediciones): la ficha de serie sigue usando `MetadataSidebar` tal cual.

- [ ] **Step 4: Comprobar**

Run: `fnm exec --using=22 node ../../../node_modules/typescript/bin/tsc --noEmit && fnm exec --using=22 node ../../../node_modules/eslint/bin/eslint.js --config ../../../eslint.config.mjs src/components/detail/edition-details.tsx src/components/detail/edition-strip.tsx`
Expected: sin errores. (El repo tiene UN error de lint preexistente en `src/app/(auth)/signup/signup-form.tsx`: no es tuyo.)

- [ ] **Step 5: Commit**

```bash
git add src/components/detail src/app messages/es.json
git commit -m "feat(detail): pulsar una edicion muestra sus datos, sin adoptarla"
```

---

### Task 3: Elegir edición al seguir el libro y al abrir un pase

**Files:**
- Modify: `src/components/detail/log-panel.tsx`, `src/lib/library/add-existing-item.ts`, `src/lib/library/manage-actions.ts`, `messages/es.json`

**Interfaces:**
- Consumes: `getEditions` (`src/lib/editions/get-editions.ts`), `setPassEdition` y `openPass` (`src/lib/passes/actions.ts`).
- Produces: `addExistingItemToLibrary(itemType, itemId, queueId?, editionId?)` — un argumento opcional más al final, para no romper a los llamadores actuales.

- [ ] **Step 1: Preguntar la edición al seguir**

En `log-panel.tsx`, cuando `entry === null` y el ítem tiene MÁS DE UNA edición, el botón de añadir a la biblioteca abre primero un selector: las ediciones (etiqueta + editorial + páginas, vía `formatEdition`) y una opción **"No lo sé"**. Con una sola edición (o ninguna), no se pregunta nada: se añade directamente, como hoy.

"No lo sé" significa: no se fija `edition_id`, y el progreso se mide contra la primaria. Que la interfaz lo diga con esas palabras y sin culpa: es una salida legítima, no un error del usuario.

- [ ] **Step 2: Preguntar al abrir un pase nuevo**

Cuando el estado cambia a `in_progress` y se abre un pase (lo hace `updateStatus`), si el ítem tiene más de una edición y el pase abierto todavía no tiene `edition_id`, el panel de Progreso muestra el selector arriba del todo, como una pregunta pendiente ("¿Qué edición estás leyendo?"), resuelta con `setPassEdition`. No es un modal: es una fila en el propio panel, que desaparece al contestar.

- [ ] **Step 3: Propagar la edición al alta**

`addExistingItemToLibrary` acepta `editionId?: string | null`. Si llega, tras crear la `library_entry` **no** abre pase (seguir no es empezar a leer): solo se guarda para cuando se abra. La forma simple y sin estado nuevo: guardar la elección en la entrada NO es posible (la edición es del pase), así que si el usuario eligió edición al seguir, se aplica en cuanto se abra el primer pase. Implementación: `add-existing-item.ts` recibe `editionId` y lo pasa a `updateStatus`/`openPass` solo si el alta viene con estado `in_progress`; si el alta es "pendiente", la elección se descarta y se volverá a preguntar al empezar.

**Decisión explícita (no la cambies sin preguntar):** no se añade una columna `library_entries.preferred_edition_id`. La edición es del pase, y añadir un segundo sitio donde vive esa información es exactamente el tipo de duplicidad que este rediseño vino a quitar.

- [ ] **Step 4: Copy**

En `messages/es.json`, sección `editions`: `"whichEdition": "¿Qué edición tienes?"`, `"whichEditionReading": "¿Qué edición estás leyendo?"`, `"unknownEdition": "No lo sé"`, `"unknownEditionHint": "Tu progreso se medirá contra la edición principal. Puedes cambiarlo cuando quieras."`.

- [ ] **Step 5: Comprobar y commitear**

Run: `fnm exec --using=22 node ../../../node_modules/typescript/bin/tsc --noEmit`

```bash
git add src messages/es.json
git commit -m "feat(log): elegir tu edicion al seguir el libro y al empezar a leerlo"
```

---

## Fase B — Las ediciones reales, desde OpenLibrary

### Task 4: Columnas de sincronización y FK restrictiva

**Files:**
- Create: `supabase/migrations/20260714_editions_sync.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerar)

**Interfaces:**
- Produces: `books.openlibrary_work_key text` y `books.editions_synced_at timestamptz`.

Nota para quien busque una clave ajena aquí y no la encuentre: `diary_entries.edition_id` **no puede tenerla**, porque es polimórfica (apunta a `book_editions` o a `movie_versions` según el tipo del ítem). La protección contra borrar una edición en uso va en un trigger, en la Tarea 11.

- [ ] **Step 1: Escribir la migración**

```sql
-- La work key de OpenLibrary, que es lo que hace falta para pedir las ediciones
-- de una obra (/works/OL...W/editions.json).
--
-- Hoy se guarda —a medias— en `books.google_books_id`, una columna cuyo nombre
-- miente: el proyecto migró de Google Books a OpenLibrary y la columna se quedó
-- con el nombre viejo. En producción hay 80 libros con una work key ahí dentro,
-- 146 con IDs antiguos de Google Books y 10 sin nada. Así que se separa en una
-- columna honesta y se hace backfill de los que ya la tienen; el resto se
-- resolverá por ISBN la primera vez que alguien abra su ficha.
alter table public.books
  add column openlibrary_work_key text,
  add column editions_synced_at timestamptz;

update public.books
   set openlibrary_work_key = google_books_id
 where google_books_id like '/works/%';

create index books_openlibrary_work_key_idx
  on public.books (openlibrary_work_key) where openlibrary_work_key is not null;
```

- [ ] **Step 2: Aplicar en DEV**

El MCP de Supabase apunta a PROD, así que en dev se aplica por Management API:

```bash
node -e "
const sql = require('fs').readFileSync('supabase/migrations/20260714_editions_sync.sql','utf8');
fetch('https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query',{method:'POST',headers:{'Authorization':'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:sql})}).then(r=>r.text()).then(console.log);
"
```

- [ ] **Step 3: Verificar el backfill**

```sql
select count(*) filter (where openlibrary_work_key is not null) as con_work_key,
       count(*) as libros
from public.books;
```
Expected en dev: `con_work_key` > 0 y menor que `libros` (no todos la tienen; es lo esperado).

- [ ] **Step 4: Regenerar tipos**

```bash
node -e "
fetch('https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/types/typescript',{headers:{'Authorization':'Bearer '+process.env.SUPABASE_ACCESS_TOKEN}}).then(r=>r.json()).then(j=>require('fs').writeFileSync('src/lib/supabase/database.types.ts', j.types));
"
```

**IMPORTANTE:** `database.types.ts` lleva un parche a mano deliberado (`reorder_queue` → `target_queue: string | null`, con un comentario que lo explica). Regenerar lo pisa: **repónlo** antes de commitear.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260714_editions_sync.sql src/lib/supabase/database.types.ts
git commit -m "feat(editions): work key de openlibrary y marca de sincronizacion"
```

---

### Task 5: Traer y filtrar las ediciones de OpenLibrary

**Files:**
- Create: `src/lib/catalog/openlibrary-editions.ts`, `src/lib/catalog/openlibrary-editions.test.ts`

**Interfaces:**
- Produces:
  - `type OpenLibraryEdition = { isbn: string; label: string; publisher: string | null; year: number | null; language: string | null; totalPages: number | null; coverUrl: string | null }`
  - `pickEditions(raw: OpenLibraryEditionDoc[], limit?: number): OpenLibraryEdition[]` — **puro**, es donde vive el filtro y donde están los tests.
  - `fetchWorkEditions(workKey: string): Promise<OpenLibraryEdition[]>` — hace el `fetch` y llama a `pickEditions`. Devuelve `[]` si falla (nunca lanza).
  - `resolveWorkKey(isbn: string): Promise<string | null>` — para los libros que no tienen work key: `https://openlibrary.org/isbn/<isbn>.json` devuelve `{ works: [{ key: "/works/OL…W" }] }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/catalog/openlibrary-editions.test.ts
import { describe, expect, it } from "vitest";
import { pickEditions, type OpenLibraryEditionDoc } from "./openlibrary-editions";

function doc(over: Partial<OpenLibraryEditionDoc> = {}): OpenLibraryEditionDoc {
  return {
    title: "El nombre del viento",
    isbn_13: ["9788401352836"],
    publishers: ["Plaza & Janés"],
    publish_date: "2007",
    number_of_pages: 662,
    languages: [{ key: "/languages/spa" }],
    physical_format: "Hardcover",
    covers: [123],
    ...over,
  };
}

describe("pickEditions", () => {
  it("descarta las ediciones sin ISBN: no se puede identificar lo que no tiene ISBN", () => {
    const sinIsbn = doc({ isbn_13: undefined, isbn_10: undefined });
    expect(pickEditions([sinIsbn])).toEqual([]);
  });

  it("descarta los ISBN con digito de control invalido", () => {
    expect(pickEditions([doc({ isbn_13: ["9788401352837"] })])).toEqual([]);
  });

  it("mapea el formato fisico a una etiqueta legible", () => {
    expect(pickEditions([doc()])[0].label).toBe("Tapa dura");
    expect(pickEditions([doc({ physical_format: "Paperback" })])[0].label).toBe("Bolsillo");
    expect(pickEditions([doc({ physical_format: undefined })])[0].label).toBe("Edición");
  });

  it("saca el idioma de la clave de openlibrary", () => {
    expect(pickEditions([doc()])[0].language).toBe("ES");
    expect(pickEditions([doc({ languages: [{ key: "/languages/eng" }] })])[0].language).toBe("EN");
  });

  it("pone el espanol y el ingles por delante de otros idiomas", () => {
    const fr = doc({ isbn_13: ["9782070413119"], languages: [{ key: "/languages/fre" }] });
    const en = doc({ isbn_13: ["9780756404741"], languages: [{ key: "/languages/eng" }] });
    const orden = pickEditions([fr, en]).map((e) => e.language);
    expect(orden).toEqual(["EN", "FR"]);
  });

  it("corta en el tope, que nadie elige entre trescientas tiradas", () => {
    const muchas = Array.from({ length: 40 }, (_, i) =>
      doc({ isbn_13: [VALID_ISBNS[i % VALID_ISBNS.length]], publish_date: String(1990 + i) })
    );
    expect(pickEditions(muchas, 20).length).toBeLessThanOrEqual(20);
  });

  it("no repite el mismo ISBN dos veces", () => {
    expect(pickEditions([doc(), doc()]).length).toBe(1);
  });
});

// ISBN-13 reales y validos, para no pelearnos con el digito de control en los tests.
const VALID_ISBNS = [
  "9788401352836",
  "9780756404741",
  "9782070413119",
  "9788499080479",
  "9788401023743",
];
```

- [ ] **Step 2: Ver que falla**

Run: `fnm exec --using=22 node ../../../node_modules/vitest/vitest.mjs run src/lib/catalog/openlibrary-editions.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

Reglas exactas de `pickEditions` (el orden importa):

1. Descartar las que no traen `isbn_13` ni `isbn_10`.
2. Normalizar el ISBN con `normalizeIsbn` de `src/lib/catalog/isbn.ts` (ya existe) y **validar el dígito de control**. Si no valida, fuera. (Mira `src/lib/catalog/isbn.ts` antes: si ya hay un validador, úsalo; si no, escríbelo ahí, no aquí.)
3. Deduplicar por ISBN.
4. Ordenar: primero por idioma (ES, EN, luego el resto), después las que tienen páginas o editorial conocidas, y dentro de eso por año descendente.
5. Cortar en `limit` (por defecto **20**).

Mapeo de `physical_format` a etiqueta: `Hardcover` → "Tapa dura", `Paperback`/`Mass Market Paperback` → "Bolsillo", `Trade Paperback` → "Rústica", cualquier otro valor o ausencia → "Edición". Las etiquetas van en `messages/es.json` NO: son datos, no interfaz — se guardan ya traducidas en `book_editions.label`, como hace hoy 'Edición principal'.

Idioma: `/languages/spa` → "ES", `/languages/eng` → "EN", `/languages/fre` → "FR", etc. (código ISO de 2 letras en mayúsculas; si no se reconoce, `null`).

Portada: `https://covers.openlibrary.org/b/id/<covers[0]>-L.jpg` (el mismo patrón que ya usa `buildCoverUrl` en `open-library.ts` — reutilízalo).

`fetchWorkEditions(workKey)`: `GET https://openlibrary.org/works/<key>/editions.json?limit=100`, con un **timeout de 5 segundos** (`AbortSignal.timeout(5000)`). Si falla, tarda o devuelve algo raro: `return []`, sin lanzar. La ficha nunca se cae por esto.

- [ ] **Step 4: Ver que pasa**

Run: `fnm exec --using=22 node ../../../node_modules/vitest/vitest.mjs run src/lib/catalog/openlibrary-editions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary-editions.ts src/lib/catalog/openlibrary-editions.test.ts
git commit -m "feat(catalog): traer y filtrar las ediciones de un work de openlibrary"
```

---

### Task 6: Sincronizar las ediciones al abrir la ficha

**Files:**
- Create: `src/lib/editions/sync-editions.ts`
- Modify: `src/app/libro/[id]/page.tsx`, `src/lib/catalog/find-or-create.ts`

**Interfaces:**
- Consumes: `fetchWorkEditions`, `resolveWorkKey` (T5); la RPC `register_book_edition(p_book_id, p_isbn, p_label, p_publisher, p_year, p_pages, p_cover_url)` que YA existe (valida el ISBN y firma `created_by`).
- Produces: `ensureBookEditions(supabase, book: { id, openlibrary_work_key, isbn, editions_synced_at }): Promise<void>` — no devuelve nada y **nunca lanza**.

- [ ] **Step 1: Escribir el sincronizador**

Lógica exacta, en este orden:

1. Si `editions_synced_at` no es null → return (ya está hecho).
2. Work key: la del libro; si es null y el libro tiene ISBN, `resolveWorkKey(isbn)` y **guardarla** en `books.openlibrary_work_key`. Si sigue sin haber → marcar `editions_synced_at = now()` igualmente y return: no hay forma de pedir sus ediciones, y no queremos reintentarlo en cada visita.
3. `fetchWorkEditions(workKey)`. Si devuelve `[]` → marcar `editions_synced_at` y return.
4. Por cada edición, llamar a la RPC `register_book_edition`. Los errores individuales se ignoran (un ISBN duplicado devuelve null: es idempotente, no es un fallo).
5. Marcar `editions_synced_at = now()`.

Comentario en español explicando por qué se marca la fecha incluso cuando no se importa nada: **una obra sin ediciones en OpenLibrary no debe reintentarse en cada visita a la ficha.**

- [ ] **Step 2: Enchufarlo en la ficha de libro**

En `src/app/libro/[id]/page.tsx`, junto al `ensureItemEnriched` que ya existe (mismo patrón cache-as-you-go), y **dentro del mismo `await`**: la ficha ya espera a ese enriquecimiento, así que esto no añade una espera nueva en serie si se lanzan juntos con `Promise.all`.

Añade `openlibrary_work_key, editions_synced_at` al `select` de `books` de esa página.

- [ ] **Step 3: Guardar la work key en las altas nuevas**

En `src/lib/catalog/find-or-create.ts`, al crear un libro, además de `google_books_id: result.externalId` (que se queda como está, por compatibilidad), escribir `openlibrary_work_key: result.externalId` **solo si empieza por `/works/`**.

- [ ] **Step 4: Probar contra OpenLibrary de verdad**

El filtro ya tiene tests (Tarea 5); lo que hay que probar aquí es la integración, y mockear la red solo probaría el mock. Así que se prueba contra el OpenLibrary real: arranca el servidor (`fnm exec --using=22 node ../../../node_modules/next/dist/bin/next dev`), abre la ficha de un libro que tenga work key en dev, y comprueba por SQL que aparecieron sus ediciones:

```sql
select label, publisher, total_pages, isbn, language
from book_editions where book_id = '<id>' order by is_primary desc;
```

Prueba con **tres** libros: uno famoso con muchas ediciones, uno oscuro sin ninguna, y uno sin work key (debe resolverla por ISBN o marcarse como sincronizado sin romper nada). Pega los tres resultados en tu informe.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editions/sync-editions.ts src/app/libro src/lib/catalog/find-or-create.ts
git commit -m "feat(editions): traer las ediciones reales al abrir la ficha del libro"
```

---

### Task 7: Que las ediciones importadas no rompan la tira

**Files:**
- Modify: `src/components/detail/edition-strip.tsx`, `src/components/detail/edition-details.tsx`

**Interfaces:**
- Consumes: lo de las Tareas 2 y 6.

- [ ] **Step 1: Probar la tira con 20 ediciones**

Con un libro ya sincronizado (Tarea 6) que tenga muchas ediciones, mira la ficha. La tira es horizontal y con scroll, así que 20 tarjetas no la rompen, pero comprueba:
- Que se puede llegar a la última con el dedo/rueda.
- Que la edición marcada como "La tuya" es visible sin buscarla (si está fuera de vista, **haz scroll a ella al montar**).
- Que el contador dice el número real ("20 en esta ficha").

- [ ] **Step 2: Arreglar lo que falle**

Si la edición del pase queda fuera de la vista inicial, hazle scroll: `ref.scrollIntoView({ inline: "center", block: "nearest" })` en un `useEffect` — este es un efecto legítimo (es una llamada imperativa al DOM, no un `setState`).

- [ ] **Step 3: Commit**

```bash
git add src/components/detail
git commit -m "fix(detail): la tira aguanta veinte ediciones y muestra la tuya"
```

---

## Fase C — El editor de ficha oficial

### Task 8: Bucket de portadas

**Files:**
- Create: `supabase/migrations/20260714_covers_bucket.sql`

**Interfaces:**
- Produces: bucket `covers` en Supabase Storage, público de lectura, escribible solo por colaborador+.

- [ ] **Step 1: Escribir la migración**

Copia el patrón de `supabase/migrations/20260710_avatars_storage.sql` (léelo entero antes), con UNA diferencia clave: en avatares, cada usuario escribe en su carpeta (`{uid}/`); aquí la portada es del **catálogo compartido**, así que la puerta no es la carpeta sino el **rol**:

```sql
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- La portada es del catálogo, no de nadie: la puerta es el rol, no la carpeta.
-- Mismo criterio que crear ediciones o asignar sagas (§7.35).
create policy "covers insert by collaborators" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );

create policy "covers update by collaborators" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );

create policy "covers delete by collaborators" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );
```

Como en avatares, **no** se añade una política SELECT amplia: el bucket es público y sirve por URL, y una SELECT abierta permitiría listar y enumerar el bucket.

- [ ] **Step 2: Aplicar en DEV y verificar**

Aplica por Management API (ver Tarea 4, Step 2) y comprueba:

```sql
select id, public from storage.buckets where id = 'covers';
select policyname from pg_policies where tablename = 'objects' and policyname like 'covers%';
```
Expected: el bucket existe y salen las tres políticas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260714_covers_bucket.sql
git commit -m "feat(catalog): bucket de portadas, escribible solo por colaboradores"
```

---

### Task 9: Server actions del editor

**Files:**
- Create: `src/lib/catalog/edit-actions.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `getCurrentUserRole`, `hasMinRole` (`src/lib/auth/roles.ts`), `itemHref` (`src/lib/catalog/item-href.ts`).
- Produces:
  - `type EditItemState = { error?: "forbidden" | "invalidTitle" | "invalidYear" | "generic"; ok?: boolean }`
  - `updateCatalogItem(itemType: ItemType, itemId: string, prev: EditItemState, formData: FormData): Promise<EditItemState>` — campos: `title`, `author` (autoría/director/creador), `synopsis`, `genres` (coma-separados), `year`.
  - `uploadCover(itemType: ItemType, itemId: string, formData: FormData): Promise<EditItemState>` — campo `file`.
  - `updateEdition(editionId: string, itemType: ItemType, itemId: string, prev: EditItemState, formData: FormData): Promise<EditItemState>`
  - `type DeleteEditionState = { error?: "forbidden" | "inUse" | "generic"; ok?: boolean }`
  - `deleteEdition(editionId: string, itemType: ItemType, itemId: string): Promise<DeleteEditionState>`
  - `resyncEditions(bookId: string): Promise<EditItemState>` — pone `editions_synced_at` a null y vuelve a sincronizar.

- [ ] **Step 1: Escribir las acciones**

Patrón obligatorio (mira `src/lib/editions/actions.ts`, que ya lo hace): `"use server"`, comprobar usuario → `redirect("/login")`, comprobar rol con `hasMinRole(await getCurrentUserRole(supabase), "collaborator")` → `{ error: "forbidden" }`, escribir, `revalidatePath(itemHref(itemType, itemId))`, devolver estado tipado (nunca lanzar).

Validaciones (una server action es un endpoint POST público, no te fíes de la interfaz):
- `title`: no vacío, ≤ 300 caracteres.
- `year`: entero entre 1400 y 2200, o vacío → null.
- `genres`: se parten por coma, se recortan, máximo 10, cada uno ≤ 40 caracteres.
- `file` (portada): tipo `image/jpeg`, `image/png` o `image/webp`, y máximo 2 MB. Se sube a `covers/<itemType>/<itemId>.<ext>` con `upsert: true`, y se guarda su URL pública en `cover_url` de la tabla del ítem.

**`deleteEdition` NO puede borrar una edición en uso.** Antes de borrar, cuenta los pases que la usan:

```ts
const { count } = await supabase
  .from("diary_entries")
  .select("id", { count: "exact", head: true })
  .eq("edition_id", editionId);
if ((count ?? 0) > 0) return { error: "inUse" };
```

Ese `count` cuenta pases de TODOS los usuarios (RLS deja ver los de perfiles públicos), así que puede quedarse corto — por eso el trigger de la Tarea 11 es la protección real, y esto es solo el mensaje amable.

- [ ] **Step 2: Copy**

En `messages/es.json`, sección `catalogEdit`:

```json
"catalogEdit": {
  "edit": "Editar ficha",
  "title": "Editando la ficha oficial",
  "subtitle": "Los cambios se aplican para toda la comunidad",
  "fieldTitle": "Título",
  "fieldAuthor": "Autoría",
  "fieldDirector": "Dirección",
  "fieldCreator": "Creación",
  "fieldSynopsis": "Sinopsis",
  "fieldGenres": "Géneros",
  "fieldYear": "Año de primera publicación",
  "cover": "Portada",
  "changeCover": "Cambiar",
  "resync": "Volver a buscar ediciones",
  "save": "Guardar cambios",
  "saving": "Guardando…",
  "cancel": "Cancelar",
  "saved": "Ficha actualizada",
  "deleteEdition": "Borrar edición",
  "errors": {
    "forbidden": "Necesitas ser colaborador para editar la ficha.",
    "invalidTitle": "El título no puede estar vacío.",
    "invalidYear": "El año no es válido.",
    "inUse": "No se puede borrar: hay lecturas registradas contra esta edición.",
    "generic": "No se pudo guardar."
  }
}
```

- [ ] **Step 3: Comprobar y commitear**

Run: `fnm exec --using=22 node ../../../node_modules/typescript/bin/tsc --noEmit`

```bash
git add src/lib/catalog/edit-actions.ts messages/es.json
git commit -m "feat(catalog): server actions del editor de ficha oficial"
```

---

### Task 10: La pantalla del editor

**Files:**
- Create: `src/components/detail/catalog-editor.tsx`
- Modify: `src/app/{libro,pelicula,serie}/[id]/page.tsx`, `src/components/detail/info-panel.tsx`

**Interfaces:**
- Consumes: todas las acciones de la Tarea 9; `SagaAssignForm` (`src/components/saga-assign-form.tsx`), que se absorbe aquí.
- Produces: `<CatalogEditor itemType itemId item editions sagas canContribute />`.

- [ ] **Step 1: Escribir el editor**

Referencia visual: pantalla 6 del mockup (`Paper - Ficha de título completa.html`). Ábrela. Estructura:

- **Banner ámbar** de contexto arriba ("Editando la ficha oficial · Los cambios se aplican para toda la comunidad"), pegajoso.
- Portada con overlay "Cambiar" (input file oculto), título en serif grande, autoría, géneros como chips con ✕ y un "+ Añadir", sinopsis en textarea, año.
- **Sagas**: el contenido de `saga-assign-form.tsx`, movido aquí dentro.
- **Ediciones**: la lista, cada una con un lápiz que despliega sus campos (etiqueta, editorial, año, idioma, páginas, ISBN) y un "Borrar edición". Más el formulario de alta que ya existe en `edition-strip.tsx` (reutilízalo o extráelo a un componente común: NO lo copies y pegues).
- **Barra fija abajo**: Cancelar / Guardar cambios.

Conmuta con la ficha en la misma página (patrón de `src/components/clubs/club-form.tsx` — léelo), no en una ruta nueva.

Estado derivado de una acción: **ajústalo durante el render** (patrón `prevState` de `edition-strip.tsx`), nunca con `setState` en un `useEffect`.

- [ ] **Step 2: Botón de entrada**

En la pestaña Info, un botón "Editar ficha ✎" visible solo si `canContribute`. Las tres páginas ya calculan `canContribute`.

- [ ] **Step 3: Borrar el formulario suelto de sagas**

```bash
git rm src/components/saga-assign-form.tsx
```
Comprueba antes que nadie más lo importa: `grep -rn "saga-assign-form" src/`. Expected: sin resultados tras el cambio.

- [ ] **Step 4: Comprobar**

Run: `fnm exec --using=22 node ../../../node_modules/typescript/bin/tsc --noEmit && fnm exec --using=22 node ../../../node_modules/next/dist/bin/next build`
Expected: build limpio.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(catalog): editor de ficha oficial con portada, ediciones y sagas"
```

---

### Task 11: La base de datos protege las ediciones en uso

**Files:**
- Create: `supabase/migrations/20260714_edition_delete_guard.sql`

**Interfaces:**
- Produces: un trigger que impide borrar una `book_edition` o una `movie_version` si algún pase la usa.

- [ ] **Step 1: Escribir la migración**

`diary_entries.edition_id` es polimórfico (apunta a `book_editions` o a `movie_versions` según el tipo del ítem), así que **no admite una clave ajena**. La protección va en un trigger `BEFORE DELETE`, que además es la única forma de que valga para cualquier vía de borrado (la de hoy y las que vengan):

```sql
create or replace function public.block_edition_delete_if_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pases integer;
begin
  select count(*) into v_pases
  from public.diary_entries d
  where d.edition_id = old.id;

  if v_pases > 0 then
    raise exception 'edition_in_use'
      using hint = format('%s pases usan esta edicion', v_pases);
  end if;

  return old;
end;
$$;

drop trigger if exists book_editions_block_delete on public.book_editions;
create trigger book_editions_block_delete
  before delete on public.book_editions
  for each row execute function public.block_edition_delete_if_used();

drop trigger if exists movie_versions_block_delete on public.movie_versions;
create trigger movie_versions_block_delete
  before delete on public.movie_versions
  for each row execute function public.block_edition_delete_if_used();

-- El trigger corre como definer y no lo invoca nadie a mano: los grants de
-- EXECUTE solo serían superficie de ataque y ruido en los advisors.
revoke execute on function public.block_edition_delete_if_used() from public, anon, authenticated;

-- Borrar una edición del catálogo es curación: colaborador+.
grant delete on public.book_editions to authenticated;
grant delete on public.movie_versions to authenticated;

create policy "book_editions deletable by collaborators"
  on public.book_editions for delete to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));

create policy "movie_versions deletable by collaborators"
  on public.movie_versions for delete to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));
```

- [ ] **Step 2: Aplicar en DEV y probarlo de verdad**

Aplica por Management API y comprueba los DOS caminos:

```sql
-- 1. Una edición SIN pases se borra.
insert into public.book_editions (book_id, label, isbn)
  select id, 'ZZZ prueba', '9788499080479' from public.books limit 1
  returning id;
delete from public.book_editions where label = 'ZZZ prueba';  -- debe funcionar

-- 2. Una edición CON un pase NO se borra.
--    (coge una edición que uses en un pase de la cuenta devtest, o crea el pase)
delete from public.book_editions where id = '<una que use un pase>';
-- Expected: ERROR "edition_in_use"
```
Pega ambos resultados en tu informe.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260714_edition_delete_guard.sql
git commit -m "feat(editions): no se puede borrar una edicion que alguien esta leyendo"
```

---

### Task 12: Resincronizar ediciones desde el editor

**Files:**
- Modify: `src/lib/catalog/edit-actions.ts`, `src/components/detail/catalog-editor.tsx`

**Interfaces:**
- Consumes: `ensureBookEditions` (T6).
- Produces: `resyncEditions(bookId)` operativo desde el botón "Volver a buscar ediciones".

- [ ] **Step 1: Implementar `resyncEditions`**

Comprueba rol (colaborador+), pone `books.editions_synced_at = null`, y llama a `ensureBookEditions` con el libro recargado. Devuelve `{ ok: true }` o `{ error: "generic" }`. Revalida la ficha.

Es útil precisamente porque el filtro de la Tarea 5 va a cambiar con el tiempo: cuando lo afinemos, un colaborador podrá volver a pedir las ediciones de una obra sin tocar la base de datos a mano.

- [ ] **Step 2: Enchufar el botón**

En el editor, junto a la lista de ediciones. Solo en libros (las películas no se sincronizan con OpenLibrary).

- [ ] **Step 3: Comprobar y commitear**

Run: `fnm exec --using=22 node ../../../node_modules/typescript/bin/tsc --noEmit`

```bash
git add src/lib/catalog/edit-actions.ts src/components/detail/catalog-editor.tsx
git commit -m "feat(catalog): volver a buscar las ediciones de una obra desde el editor"
```

---

## Cierre

### Task 13: Documentación y checklist manual

**Files:**
- Create: `docs/superpowers/plans/2026-07-14-ediciones-ficha-y-editor-manual-test.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Requisitos**

En `docs/REQUIREMENTS.md` §7, añade los apartados nuevos (import de ediciones desde OpenLibrary, editor de ficha oficial) y **corrige** §7.1 y el apartado de ediciones: el panel de metadatos ya no muestra datos de tirada, y las sagas se asignan desde el editor. Deja constancia de las decisiones: por qué se impide borrar una edición en uso (en vez de reasignarla), por qué la elección de edición vive en el pase y no en la entrada, y por qué el tope de 20.

- [ ] **Step 2: Checklist manual**

Un punto por caso, con qué hacer y qué debe verse. Obligatorios:
1. Ficha de libro: el panel ya no muestra editorial, páginas ni ISBN.
2. Pulsar una edición: el panel muestra SUS datos; el registro personal no cambia; "volver a la obra" funciona.
3. La edición marcada "La tuya" sigue siendo la del pase aunque estés mirando otra.
4. Abrir un libro recién añadido: aparecen sus ediciones de OpenLibrary (probar con uno famoso, uno oscuro sin ediciones, y uno sin work key).
5. Recargar esa ficha: no se vuelve a llamar a OpenLibrary (comprobar que `editions_synced_at` no cambia).
6. Seguir un libro con varias ediciones: se pregunta cuál tienes, con "No lo sé".
7. Empezar a leerlo: si no elegiste edición, se pregunta en el panel de Progreso.
8. Como colaborador: editar título, sinopsis, géneros y subir una portada nueva.
9. Editar una edición; borrar una edición sin pases; intentar borrar una que uses (debe explicarlo, no romperse).
10. Como usuario normal: el botón "Editar ficha" no aparece.
11. "Volver a buscar ediciones" trae las que falten.

- [ ] **Step 3: Commit y PR**

```bash
git add docs/
git commit -m "docs: requisitos y checklist manual de ediciones en la ficha y editor"
git push -u origin <rama>
gh pr create --draft --title "feat: ediciones en la ficha y editor de ficha oficial" --body "…"
```
(`gh` no está instalado en esta máquina: si falla, abre el PR con el MCP de GitHub.)

---

## Notas de ejecución

- **Fases entregables por separado.** Tras la A, la ficha ya no miente y las ediciones se pueden explorar. Tras la B, hay ediciones de verdad que explorar. La C es la que abre el catálogo a los colaboradores. Se puede parar en cualquiera de las tres.
- **La Tarea 5 es la que decide si esto sirve de algo.** El filtro es todo: con un filtro malo, el selector de edición es una lista inservible de 20 tiradas idénticas. Pruébalo con obras reales (El Quijote, El nombre del viento, un libro oscuro), no con un caso de laboratorio.
- **Prod se aplica al final**, con las cuatro migraciones (`editions_sync`, `covers_bucket`, `edition_delete_guard`) y el visto bueno del usuario. Antes de aplicar, comprobar en prod lo mismo que se comprobó en dev.
