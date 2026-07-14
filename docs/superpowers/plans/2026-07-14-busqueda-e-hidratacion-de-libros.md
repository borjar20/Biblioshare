# Búsqueda e hidratación de libros — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la capa de catálogo de libros pida a Open Library exactamente lo que
cada pantalla muestra —obra en la tarjeta, obra hidratada en la ficha, tirada en
la edición— y deje de hornear datos sucios en la base de datos.

**Architecture:** Escalera de tres peldaños. (1) La búsqueda pide solo los campos
de la tarjeta a `search.json` y **no escribe en la BD**; lo local se fusiona con
lo de la API por `openlibrary_work_key`. El ISBN es un *lookup* aparte, el único
atajo que salta la API. (2) Al abrir la ficha, `ensureBookHydrated` trae la
sinopsis y los géneros de `/works/<key>.json` (guard: `books.hydrated_at`), junto
al `ensureBookEditions` que ya existe. (3) Editorial, ISBN y páginas viven en
`book_editions` y nadie más los escribe.

**Tech Stack:** Next.js (App Router, Server Components), TypeScript, Supabase
(Postgres + RLS), vitest, Open Library API.

## Global Constraints

- **Base: #32 ya mergeada en main.** Todo el modelo obra/edición (`book_editions`,
  `books.openlibrary_work_key`, `books.editions_synced_at`, la RPC
  `register_book_edition`, `sync-editions.ts`, `openlibrary-editions.ts`) llega de
  la PR #32 (`worktree-ediciones-ficha-editor`). **No empieces este plan hasta que
  #32 esté en main**, y crea la rama desde main. No apilar PRs (lección de #18/#20).
- **Node 22.** El repo pinnea `.nvmrc` a `22.23.1`. En un shell no interactivo con
  fnm hay que activarlo antes de correr tests:
  `fnm env --use-on-cd | Out-String | Invoke-Expression` (PowerShell).
- **Alcance: solo libros.** Las ramas de `movie` y `series` (TMDB) de `search.ts`,
  `local-search.ts` y `find-or-create.ts` no cambian de comportamiento.
- **Toda llamada a Open Library es best-effort:** nunca lanza, nunca bloquea el
  render. Si falla, se degrada a lo que ya haya en la BD.
- Spec: `docs/superpowers/specs/2026-07-14-busqueda-e-hidratacion-de-libros-design.md`.
- **Corrección al spec:** el spec dice "renombrar `google_books_id` →
  `openlibrary_work_key`". Eso **ya lo hizo #32** (añadió la columna y la rellenó
  desde `google_books_id where like '/works/%'`). Lo que queda aquí es *añadir*
  `hydrated_at` y *borrar* la columna legacy `google_books_id`.
- **Corrección al spec:** el spec dice borrar `title-match.ts`. **No se borra**:
  lo usa el importador de Goodreads (`src/lib/import/match-row.ts`) para comparar
  el título del CSV con el de la API, que es un uso legítimo. Se borran solo
  `group-editions.ts` (+ su test) y `google-books.ts`.

## Estructura de ficheros

| Fichero | Responsabilidad |
| --- | --- |
| `src/lib/catalog/genres.ts` (nuevo) | Vocabulario canónico de géneros + mapeo `subject → género`. Puro. |
| `src/lib/catalog/openlibrary/covers.ts` (nuevo) | `buildCoverUrl(coverId, size)`. Lo comparten todos los de abajo. |
| `src/lib/catalog/openlibrary/work-search.ts` (nuevo) | `searchWorks(query)`: `search.json` → obras (solo campos de tarjeta). |
| `src/lib/catalog/openlibrary/work-detail.ts` (nuevo) | `fetchWork(key)` y `fetchFirstEditionDescription(key)`. |
| `src/lib/catalog/openlibrary/isbn-lookup.ts` (nuevo) | `lookupIsbn(isbn)` → `{ workKey, work }`. |
| `src/lib/catalog/openlibrary/editions.ts` (movido) | El actual `openlibrary-editions.ts`, tal cual. |
| `src/lib/catalog/openlibrary/authors.ts` (movido) | `resolveOpenLibraryAuthor`, tal cual. |
| `src/lib/catalog/hydrate-book.ts` (nuevo) | `ensureBookHydrated`: peldaño 2. Guarded, idempotente, nunca lanza. |
| `src/lib/catalog/search.ts` (reescrito) | Orquesta: lookup por ISBN, o `searchWorks` + local fusionados por work key. |
| `src/lib/catalog/local-search.ts` (modificado) | Deja de mapear campos de edición; expone búsqueda por work keys. |
| `src/lib/catalog/types.ts` (modificado) | `SearchResult` pierde `publisher`/`pageCount`/`isbn`; gana `matchedIsbn`. |
| `src/lib/catalog/find-or-create.ts` (modificado) | Lookup por `openlibrary_work_key`; el insert de libro deja de escribir campos de edición. |
| `src/lib/catalog/open-library.ts` (borrado) | Se reparte entre los `openlibrary/*`. |
| `src/lib/catalog/group-editions.ts` (borrado) | La API ya devuelve obras agrupadas. |
| `src/lib/catalog/google-books.ts` (borrado) | Código muerto. |
| `supabase/migrations/20260715_book_hydration.sql` (nuevo) | `books.hydrated_at` + grant; `drop column google_books_id`. |

---

### Task 1: Vocabulario canónico de géneros

Los `subject` de Open Library son cientos de etiquetas crudas. Este módulo es
puro y es donde vive toda la decisión de qué es un género y qué es ruido.

**Files:**
- Create: `src/lib/catalog/genres.ts`
- Test: `src/lib/catalog/genres.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `mapSubjectsToGenres(subjects: string[] | null | undefined): string[]`
  — devuelve como mucho 5 géneros canónicos en español, sin duplicados,
  respetando el orden en que aparecen los subjects.

- [ ] **Step 1: Write the failing test**

`src/lib/catalog/genres.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapSubjectsToGenres } from "./genres";

describe("mapSubjectsToGenres", () => {
  it("mapea subjects conocidos a géneros canónicos en español", () => {
    expect(mapSubjectsToGenres(["Science fiction"])).toEqual(["Ciencia ficción"]);
    expect(mapSubjectsToGenres(["Fantasy fiction"])).toEqual(["Fantasía"]);
    expect(mapSubjectsToGenres(["Biography"])).toEqual(["Biografía"]);
  });

  it("descarta el ruido de catalogación", () => {
    expect(
      mapSubjectsToGenres([
        "Accessible book",
        "Protected DAISY",
        "In library",
        "New York Times bestseller",
        "Translations into Spanish",
        "Large type books",
        "Reading Level-Grade 9",
      ])
    ).toEqual([]);
  });

  it("prefiere la regla más específica sobre la genérica", () => {
    // "science fiction" no puede caer en "Ciencia" (divulgación).
    expect(mapSubjectsToGenres(["Science fiction"])).toEqual(["Ciencia ficción"]);
    // "detective and mystery stories" es novela negra, no "Misterio" a secas.
    expect(mapSubjectsToGenres(["Detective and mystery stories"])).toEqual([
      "Novela negra",
    ]);
  });

  it("deduplica géneros y respeta el orden de los subjects", () => {
    expect(
      mapSubjectsToGenres(["Fantasy", "Epic fantasy", "Adventure stories"])
    ).toEqual(["Fantasía", "Aventura"]);
  });

  it("corta en 5 géneros", () => {
    const genres = mapSubjectsToGenres([
      "Fantasy",
      "Science fiction",
      "Horror",
      "Romance",
      "Poetry",
      "Biography",
      "History",
    ]);
    expect(genres).toHaveLength(5);
    expect(genres).toEqual([
      "Fantasía",
      "Ciencia ficción",
      "Terror",
      "Romance",
      "Poesía",
    ]);
  });

  it("es indiferente a mayúsculas y acentos", () => {
    expect(mapSubjectsToGenres(["FANTASÍA", "ciencia-ficción"])).toEqual([
      "Fantasía",
      "Ciencia ficción",
    ]);
  });

  it("tolera null y lista vacía", () => {
    expect(mapSubjectsToGenres(null)).toEqual([]);
    expect(mapSubjectsToGenres([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (PowerShell):
```powershell
fnm env --use-on-cd | Out-String | Invoke-Expression
npx vitest run src/lib/catalog/genres.test.ts
```
Expected: FAIL — `Failed to resolve import "./genres"`.

- [ ] **Step 3: Write the implementation**

`src/lib/catalog/genres.ts`:

```ts
// Los `subject` de OpenLibrary son texto libre y sucio: junto a "Fantasy" vienen
// "Protected DAISY", "Accessible book" o "New York Times bestseller". Volcarlos
// tal cual como GenreTags (lo que se hacía antes) llenaba la ficha de basura.
//
// Aquí se traducen a un vocabulario CERRADO en español, alineado con el estilo de
// los géneros que TMDB ya devuelve para películas y series. Lo que no mapea, se
// descarta: es preferible un libro sin géneros a un libro etiquetado "In library".
// Ver docs/REQUIREMENTS.md §7.2.

const MAX_GENRES = 5;

// Minúsculas, sin diacríticos y con los separadores unificados a espacio, para
// que "Ciencia-Ficción" y "science fiction" pasen por el mismo camino.
function normalize(subject: string): string {
  return subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[-_/,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Ruido de catalogación: no describe el libro, describe el registro (formato de
// accesibilidad, préstamo, premios, nivel de lectura...). Se compara por
// "contiene" sobre el subject normalizado.
const NOISE = [
  "accessible book",
  "protected daisy",
  "daisy",
  "in library",
  "internet archive",
  "overdrive",
  "large type books",
  "large print",
  "bestseller",
  "reading level",
  "lending library",
  "open library staff picks",
  "translations into",
  "translated into",
  "nyt",
  "award",
  "text",
  "collectible",
  "specimens",
];

// ORDEN SIGNIFICATIVO: gana la primera regla cuyo needle esté contenido en el
// subject normalizado, así que lo específico va SIEMPRE antes que lo genérico
// ("science fiction" antes que "science", si no "Dune" acabaría en Divulgación).
const RULES: Array<[needle: string, genre: string]> = [
  // Ficción de género — lo específico primero.
  ["science fiction", "Ciencia ficción"],
  ["ciencia ficcion", "Ciencia ficción"],
  ["dystopi", "Distopía"],
  ["distopi", "Distopía"],
  ["magic realism", "Realismo mágico"],
  ["realismo magico", "Realismo mágico"],
  ["detective and mystery", "Novela negra"],
  ["detective", "Novela negra"],
  ["noir", "Novela negra"],
  ["crime", "Novela negra"],
  ["novela negra", "Novela negra"],
  ["true crime", "True crime"],
  ["thriller", "Thriller"],
  ["suspense", "Thriller"],
  ["mystery", "Misterio"],
  ["misterio", "Misterio"],
  ["fantasy", "Fantasía"],
  ["fantasia", "Fantasía"],
  ["horror", "Terror"],
  ["terror", "Terror"],
  ["ghost stories", "Terror"],
  ["romance", "Romance"],
  ["love stories", "Romance"],
  ["adventure", "Aventura"],
  ["aventura", "Aventura"],
  ["historical fiction", "Histórica"],
  ["novela historica", "Histórica"],
  ["war stories", "Histórica"],
  ["classic", "Clásicos"],
  ["clasico", "Clásicos"],
  ["humor", "Humor"],
  ["satire", "Humor"],
  ["comic", "Cómic"],
  ["graphic novel", "Cómic"],
  ["manga", "Manga"],
  ["poetry", "Poesía"],
  ["poesia", "Poesía"],
  ["drama", "Teatro"],
  ["plays", "Teatro"],
  ["teatro", "Teatro"],
  ["short stories", "Relatos"],
  ["relatos", "Relatos"],
  ["young adult", "Juvenil"],
  ["juvenil", "Juvenil"],
  ["juvenile", "Infantil"],
  ["children", "Infantil"],
  ["infantil", "Infantil"],
  ["picture books", "Infantil"],

  // No ficción.
  ["autobiograph", "Memorias"],
  ["memoir", "Memorias"],
  ["memorias", "Memorias"],
  ["biograph", "Biografía"],
  ["biografia", "Biografía"],
  ["history", "Historia"],
  ["historia", "Historia"],
  ["philosoph", "Filosofía"],
  ["filosofia", "Filosofía"],
  ["psycholog", "Psicología"],
  ["psicologia", "Psicología"],
  ["self-help", "Autoayuda"],
  ["self help", "Autoayuda"],
  ["autoayuda", "Autoayuda"],
  ["economic", "Economía"],
  ["business", "Economía"],
  ["economia", "Economía"],
  ["politic", "Política"],
  ["politica", "Política"],
  ["religio", "Religión"],
  ["religion", "Religión"],
  ["travel", "Viajes"],
  ["viajes", "Viajes"],
  ["cooking", "Cocina"],
  ["cookery", "Cocina"],
  ["cocina", "Cocina"],
  ["sports", "Deporte"],
  ["deporte", "Deporte"],
  ["art", "Arte"],
  ["arte", "Arte"],
  ["essay", "Ensayo"],
  ["ensayo", "Ensayo"],
  ["science", "Divulgación"],
  ["ciencia", "Divulgación"],
  ["nature", "Divulgación"],
  ["technology", "Divulgación"],
];

function isNoise(normalized: string): boolean {
  return NOISE.some((needle) => normalized.includes(needle));
}

function genreFor(normalized: string): string | null {
  for (const [needle, genre] of RULES) {
    if (normalized.includes(needle)) return genre;
  }
  return null;
}

export function mapSubjectsToGenres(
  subjects: string[] | null | undefined
): string[] {
  if (!subjects || subjects.length === 0) return [];

  const genres: string[] = [];

  for (const subject of subjects) {
    if (typeof subject !== "string") continue;

    const normalized = normalize(subject);
    if (!normalized || isNoise(normalized)) continue;

    const genre = genreFor(normalized);
    if (!genre || genres.includes(genre)) continue;

    genres.push(genre);
    if (genres.length === MAX_GENRES) break;
  }

  return genres;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/genres.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/genres.ts src/lib/catalog/genres.test.ts
git commit -m "feat(catalogo): vocabulario canonico de generos para libros"
```

---

### Task 2: Cliente de Open Library en piezas

`open-library.ts` mezcla hoy búsqueda, lookup por ISBN, un fallback heurístico y
autores en un solo fichero. Se parte, y de paso aparecen las dos piezas que
faltaban: el detalle de la obra (donde vive la sinopsis) y un lookup de ISBN que
devuelve la work key.

**Files:**
- Create: `src/lib/catalog/openlibrary/covers.ts`
- Create: `src/lib/catalog/openlibrary/work-search.ts`
- Create: `src/lib/catalog/openlibrary/work-detail.ts`
- Create: `src/lib/catalog/openlibrary/isbn-lookup.ts`
- Move: `src/lib/catalog/openlibrary-editions.ts` → `src/lib/catalog/openlibrary/editions.ts` (y su test)
- Move: `resolveOpenLibraryAuthor` → `src/lib/catalog/openlibrary/authors.ts`
- Delete: `src/lib/catalog/open-library.ts`, `src/lib/catalog/google-books.ts`
- Test: `src/lib/catalog/openlibrary/work-search.test.ts`

**Interfaces:**
- Consumes: `normalizeIsbn`, `isValidIsbnCheckDigit` de `src/lib/catalog/isbn.ts`;
  `SearchResult` de `src/lib/catalog/types.ts` (con la forma NUEVA de la Tarea 3 —
  si haces esta tarea antes, deja `publisher`/`pageCount`/`isbn` fuera del mapeo,
  que es justo el objetivo).
- Produces:
  - `buildCoverUrl(coverId?: number | null, size?: "S" | "M" | "L"): string | null`
  - `mapWorkDoc(doc: OpenLibraryWorkDoc): SearchResult` (exportada solo para el test)
  - `searchWorks(query: string): Promise<SearchResult[]>`
  - `fetchWork(workKey: string): Promise<WorkDetail | null>` con
    `type WorkDetail = { description: string | null; subjects: string[]; coverUrl: string | null }`
  - `fetchFirstEditionDescription(workKey: string): Promise<string | null>`
  - `lookupIsbn(isbn: string): Promise<SearchResult | null>` (la OBRA, con `matchedIsbn` puesto)
  - `fetchWorkEditions`, `pickEditions`, `resolveWorkKey` (sin cambios, solo mudados)
  - `resolveOpenLibraryAuthor` (sin cambios, solo mudada)

- [ ] **Step 1: Mueve editions y authors sin tocar su contenido**

```bash
mkdir -p src/lib/catalog/openlibrary
git mv src/lib/catalog/openlibrary-editions.ts src/lib/catalog/openlibrary/editions.ts
git mv src/lib/catalog/openlibrary-editions.test.ts src/lib/catalog/openlibrary/editions.test.ts
```

Crea `src/lib/catalog/openlibrary/covers.ts`:

```ts
// Tamaños del CDN de portadas de OpenLibrary: S (miniatura), M (listados),
// L (ficha/detalle).
export function buildCoverUrl(
  coverId?: number | null,
  size: "S" | "M" | "L" = "M"
): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}
```

Crea `src/lib/catalog/openlibrary/authors.ts` moviendo íntegro el bloque
"Autores como entidad" de `open-library.ts` (el tipo `OpenLibraryAuthor` y la
función `resolveOpenLibraryAuthor`, desde el comentario `// ── Autores como
entidad` hasta el final del fichero), y cambia su import de portada a
`import { buildCoverUrl } from "./covers";` (usa `buildCoverUrl(photoId)`… ojo:
las fotos de autor NO usan `buildCoverUrl`, van a `/a/id/`; deja esa URL literal
como está hoy).

En `editions.ts`, corrige el import: `import { buildCoverUrl } from "./covers";`
y `import { normalizeIsbn, isValidIsbnCheckDigit } from "../isbn";`.

- [ ] **Step 2: Write the failing test para el mapeo de obras**

`src/lib/catalog/openlibrary/work-search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapWorkDoc } from "./work-search";

describe("mapWorkDoc", () => {
  it("mapea un doc de search.json como OBRA, sin datos de edición", () => {
    const result = mapWorkDoc({
      key: "/works/OL893415W",
      title: "Dune",
      author_name: ["Frank Herbert"],
      cover_i: 8100921,
      first_publish_year: 1965,
      edition_count: 312,
    });

    expect(result).toEqual({
      itemType: "book",
      externalId: "/works/OL893415W",
      title: "Dune",
      subtitle: "Frank Herbert",
      coverUrl: "https://covers.openlibrary.org/b/id/8100921-M.jpg",
      year: 1965,
      synopsis: null,
      genres: null,
      editionCount: 312,
    });
  });

  it("junta varios autores y tolera campos ausentes", () => {
    const result = mapWorkDoc({
      key: "/works/OL1W",
      title: "Buenos presagios",
      author_name: ["Terry Pratchett", "Neil Gaiman"],
    });

    expect(result.subtitle).toBe("Terry Pratchett, Neil Gaiman");
    expect(result.coverUrl).toBeNull();
    expect(result.year).toBeNull();
    expect(result.editionCount).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog/openlibrary/work-search.test.ts`
Expected: FAIL — `Failed to resolve import "./work-search"`.

- [ ] **Step 4: Escribe work-search.ts**

`src/lib/catalog/openlibrary/work-search.ts`:

```ts
import type { SearchResult } from "../types";
import { buildCoverUrl } from "./covers";

// PELDAÑO 1 de la escalera de hidratación (ver el spec): una tarjeta de
// resultado muestra portada, título, autor y año — y eso es EXACTAMENTE lo que
// se pide aquí. Los campos que antes se pedían de más (`description`, `subject`,
// `publisher`, `number_of_pages_median`, `isbn`) no los muestra la tarjeta y
// llegaban sucios o vacíos: la sinopsis no la devuelve este endpoint (vive en
// /works/<key>.json) y las páginas eran la MEDIANA de todas las ediciones.
//
// Un doc de search.json ES una obra (`key` = /works/OL...W). No hay que
// reagruparlo: OpenLibrary ya lo entrega agrupado, y `edition_count` dice
// cuántas tiradas cubre.
export type OpenLibraryWorkDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
};

type WorkSearchResponse = {
  docs?: OpenLibraryWorkDoc[];
};

const SEARCH_FIELDS = "key,title,author_name,cover_i,first_publish_year,edition_count";
const SEARCH_LIMIT = 20;
const FETCH_TIMEOUT_MS = 5000;

export function mapWorkDoc(doc: OpenLibraryWorkDoc): SearchResult {
  return {
    itemType: "book",
    externalId: doc.key ?? "",
    title: doc.title ?? "",
    subtitle: doc.author_name?.join(", ") ?? null,
    coverUrl: buildCoverUrl(doc.cover_i),
    year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
    // La obra se hidrata al abrir su ficha (ensureBookHydrated), no aquí.
    synopsis: null,
    genres: null,
    editionCount: typeof doc.edition_count === "number" ? doc.edition_count : 1,
  };
}

// Nunca lanza: si OpenLibrary falla o tarda, la búsqueda se degrada a lo que
// haya en el catálogo local (ver search.ts).
export async function searchWorks(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", String(SEARCH_LIMIT));
    url.searchParams.set("fields", SEARCH_FIELDS);

    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: WorkSearchResponse = await res.json();
    return (data.docs ?? [])
      .filter((doc) => doc.title && doc.key)
      .map(mapWorkDoc);
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/openlibrary/work-search.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Escribe work-detail.ts**

`src/lib/catalog/openlibrary/work-detail.ts`:

```ts
import { buildCoverUrl } from "./covers";

// PELDAÑO 2: el detalle de la OBRA. Aquí vive la sinopsis de verdad — el
// endpoint de búsqueda no la devuelve, por mucho que se pida en `fields`, y de
// ahí venía el "sin sinopsis" crónico de las fichas.
export type WorkDetail = {
  description: string | null;
  subjects: string[];
  coverUrl: string | null;
};

type WorkResponse = {
  description?: string | { value?: string };
  subjects?: string[];
  covers?: number[];
};

type EditionsResponse = {
  entries?: Array<{ description?: string | { value?: string } }>;
};

const FETCH_TIMEOUT_MS = 5000;

// OpenLibrary devuelve description a veces como string y a veces como
// { type, value }. Las dos formas son válidas y hay que tragar ambas.
function parseDescription(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

// Normaliza "/works/OL893415W", "works/OL893415W" y "OL893415W" a "OL893415W".
export function normalizeWorkKey(workKey: string): string {
  return workKey.replace(/^\/?works\//, "").replace(/^\//, "");
}

// Nunca lanza: null significa "no se pudo hidratar ahora", y el llamador deja
// hydrated_at a null para reintentar en la siguiente visita.
export async function fetchWork(workKey: string): Promise<WorkDetail | null> {
  try {
    const key = normalizeWorkKey(workKey);
    if (!key) return null;

    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data: WorkResponse = await res.json();

    return {
      description: parseDescription(data.description),
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      coverUrl: buildCoverUrl(data.covers?.find((id) => id > 0), "L"),
    };
  } catch {
    return null;
  }
}

// Fallback de sinopsis: hay obras sin `description` en las que alguna de sus
// ediciones sí la trae. Se llama SOLO cuando la obra no tiene ninguna, y como
// mucho una vez por libro (lo protege el guard `books.hydrated_at`), así que
// no vale la pena reutilizar la respuesta del sync de ediciones.
export async function fetchFirstEditionDescription(
  workKey: string
): Promise<string | null> {
  try {
    const key = normalizeWorkKey(workKey);
    if (!key) return null;

    const res = await fetch(
      `https://openlibrary.org/works/${key}/editions.json?limit=20`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return null;

    const data: EditionsResponse = await res.json();
    for (const entry of data.entries ?? []) {
      const description = parseDescription(entry.description);
      if (description) return description;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Escribe isbn-lookup.ts**

`src/lib/catalog/openlibrary/isbn-lookup.ts`:

```ts
import type { SearchResult } from "../types";
import { buildCoverUrl } from "./covers";
import { normalizeWorkKey } from "./work-detail";

// Un ISBN no es una búsqueda, es un LOOKUP: identifica una tirada concreta (el
// caso del escáner de código de barras y del importador de Goodreads). Lo que se
// devuelve, sin embargo, es la OBRA — que es lo que la app muestra —, anotando en
// `matchedIsbn` qué edición exacta se escaneó, para poder registrarla luego.
type IsbnResponse = {
  title?: string;
  authors?: Array<{ key?: string }>;
  covers?: number[];
  publish_date?: string;
  works?: Array<{ key?: string }>;
};

type WorkTitleResponse = {
  title?: string;
  covers?: number[];
  first_publish_date?: string;
};

const FETCH_TIMEOUT_MS = 5000;

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

// Nunca lanza. Devuelve null si el ISBN no existe en OpenLibrary o si no se le
// conoce obra (sin work key no hay nada que hidratar ni ediciones que pedir).
export async function lookupIsbn(isbn: string): Promise<SearchResult | null> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const edition: IsbnResponse = await res.json();
    const workKey = edition.works?.[0]?.key;
    if (!workKey) return null;

    // El doc de /isbn/ trae el título de la EDICIÓN; el de la obra es más
    // canónico (y la portada de la obra suele ser mejor). Si la obra no
    // responde, se cae a los datos de la edición antes que devolver nada.
    const work = await fetchWorkTitle(workKey);

    return {
      itemType: "book",
      externalId: workKey,
      title: work?.title ?? edition.title ?? "",
      subtitle: null, // la autoría la pone ensureBookHydrated / ensureItemEnriched
      coverUrl:
        buildCoverUrl(work?.covers?.find((id) => id > 0), "M") ??
        buildCoverUrl(edition.covers?.[0], "M"),
      year: parseYear(work?.first_publish_date ?? edition.publish_date),
      synopsis: null,
      genres: null,
      matchedIsbn: isbn,
    };
  } catch {
    return null;
  }
}

async function fetchWorkTitle(workKey: string): Promise<WorkTitleResponse | null> {
  try {
    const key = normalizeWorkKey(workKey);
    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Borra los ficheros muertos**

```bash
git rm src/lib/catalog/open-library.ts src/lib/catalog/google-books.ts
```

`open-library.ts` queda sin contenido propio: el mapeo de búsqueda lo sustituye
`work-search.ts`, el de ISBN `isbn-lookup.ts`, `buildCoverUrl` está en
`covers.ts` y los autores en `authors.ts`. Los imports rotos que deja
(`enrich-item.ts`, `find-or-create.ts`, `match-row.ts`, `search.ts`) se arreglan
en las Tareas 3 y 5 — es esperable que `npx tsc --noEmit` falle hasta entonces.
`google-books.ts` no lo importaba nadie ya.

- [ ] **Step 9: Corre los tests movidos**

Run: `npx vitest run src/lib/catalog/openlibrary`
Expected: PASS — `editions.test.ts` (los de #32) y `work-search.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add -A src/lib/catalog
git commit -m "refactor(catalogo): partir el cliente de OpenLibrary en piezas por endpoint"
```

---

### Task 3: La búsqueda deja de aplanar y de escribir

Reescribe `search.ts`: fusiona local + API por work key, el ISBN es el único
atajo, y no se persiste nada. `SearchResult` pierde los campos de edición y
`group-editions.ts` desaparece.

**Files:**
- Modify: `src/lib/catalog/types.ts`
- Modify: `src/lib/catalog/search.ts` (reescritura completa)
- Modify: `src/lib/catalog/local-search.ts`
- Modify: `src/lib/catalog/mock-data.ts`
- Modify: `src/app/buscar/search-result-card.tsx`
- Modify: `src/lib/import/match-row.ts`
- Delete: `src/lib/catalog/group-editions.ts`, `src/lib/catalog/group-editions.test.ts`
- Test: `src/lib/catalog/merge-results.test.ts`
- Create: `src/lib/catalog/merge-results.ts`

**Interfaces:**
- Consumes: `searchWorks`, `lookupIsbn` (Tarea 2); `normalizeIsbn` de `isbn.ts`.
- Produces:
  - `SearchResult` sin `publisher`/`pageCount`/`isbn`, con `matchedIsbn?: string`.
  - `mergeByWorkKey(local: SearchResult[], api: SearchResult[]): SearchResult[]`
  - `searchCatalog(itemType, query)` (misma firma que hoy).
  - `findLocalBookByIsbn(supabase, isbn)`, `searchLocalCatalog(supabase, itemType, query)` (mismas firmas).

- [ ] **Step 1: Actualiza el tipo**

`src/lib/catalog/types.ts` completo:

```ts
export type ItemType = "book" | "movie" | "series";

// Lo que una TARJETA de resultado muestra, y nada más. Editorial, ISBN y
// páginas son datos de una tirada concreta: viven en `book_editions` y se
// pintan al pulsar una edición en la ficha, no aquí. Ver el spec
// docs/superpowers/specs/2026-07-14-busqueda-e-hidratacion-de-libros-design.md
export type SearchResult = {
  itemType: ItemType;
  // Libros: work key de OpenLibrary ("/works/OL893415W").
  // Películas/series: id de TMDB.
  externalId: string;
  // Puesto cuando el resultado ya tiene fila en books/movies/series (vino del
  // catálogo local, o se fusionó con él por work key). La BÚSQUEDA NO CREA
  // filas: si no está puesto, el ítem se creará al añadirlo o al abrir su ficha.
  catalogId?: string;
  title: string;
  subtitle: string | null; // libros: autoría
  coverUrl: string | null;
  year: number | null;
  // Películas/series: TMDB los da ya en la búsqueda. Libros: SIEMPRE null — la
  // obra se hidrata al abrir su ficha (ensureBookHydrated).
  synopsis: string | null;
  genres: string[] | null;
  // Libros: nº real de ediciones de la obra según OpenLibrary (`edition_count`).
  editionCount?: number;
  // Libros, SOLO en el lookup por ISBN (escáner, importador): la tirada exacta
  // que se escaneó, para registrarla como edición al añadir el libro.
  matchedIsbn?: string;
};
```

- [ ] **Step 2: Write the failing test para la fusión**

`src/lib/catalog/merge-results.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeByWorkKey } from "./merge-results";
import type { SearchResult } from "./types";

function book(externalId: string, title: string, catalogId?: string): SearchResult {
  return {
    itemType: "book",
    externalId,
    catalogId,
    title,
    subtitle: null,
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
  };
}

describe("mergeByWorkKey", () => {
  it("una obra que ya está en el catálogo aparece UNA vez, con su catalogId", () => {
    const local = [book("/works/OL1W", "Dune", "uuid-1")];
    const api = [book("/works/OL1W", "Dune"), book("/works/OL2W", "Dune Messiah")];

    const merged = mergeByWorkKey(local, api);

    expect(merged).toHaveLength(2);
    expect(merged[0].catalogId).toBe("uuid-1");
    expect(merged[1].externalId).toBe("/works/OL2W");
    expect(merged[1].catalogId).toBeUndefined();
  });

  it("lo local va primero: es lo que el usuario ya tiene", () => {
    const local = [book("/works/OL9W", "El nombre del viento", "uuid-9")];
    const api = [book("/works/OL2W", "Otra"), book("/works/OL9W", "El nombre del viento")];

    expect(mergeByWorkKey(local, api).map((r) => r.externalId)).toEqual([
      "/works/OL9W",
      "/works/OL2W",
    ]);
  });

  it("un libro local SIN work key (creado a mano, importado) no se pierde", () => {
    const local = [book("", "Libro casero", "uuid-x")];
    const api = [book("/works/OL1W", "Dune")];

    const merged = mergeByWorkKey(local, api);

    expect(merged).toHaveLength(2);
    expect(merged[0].catalogId).toBe("uuid-x");
  });

  it("la API caída deja solo los resultados locales", () => {
    const local = [book("/works/OL1W", "Dune", "uuid-1")];
    expect(mergeByWorkKey(local, [])).toHaveLength(1);
  });

  it("sin nada local, devuelve la API tal cual", () => {
    const api = [book("/works/OL1W", "Dune")];
    expect(mergeByWorkKey([], api)).toEqual(api);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog/merge-results.test.ts`
Expected: FAIL — `Failed to resolve import "./merge-results"`.

- [ ] **Step 4: Escribe merge-results.ts**

`src/lib/catalog/merge-results.ts`:

```ts
import type { SearchResult } from "./types";

// La búsqueda por texto SIEMPRE pregunta a OpenLibrary (buscar por título es
// descubrir: cortocircuitar con un hit local escondía el resto de obras) y
// SIEMPRE mira el catálogo local. Aquí se juntan.
//
// La clave de fusión es la work key: identifica la obra en las dos fuentes. Lo
// local va primero —es lo que el usuario ya tiene, y trae catalogId, así que
// añadirlo no crea fila nueva— y de la API solo entran las obras que no
// estuvieran ya. Un libro local sin work key (alta manual, import antiguo) no
// puede fusionarse con nada: se conserva tal cual.
export function mergeByWorkKey(
  local: SearchResult[],
  api: SearchResult[]
): SearchResult[] {
  const localKeys = new Set(
    local.map((result) => result.externalId).filter((key) => key.length > 0)
  );

  return [...local, ...api.filter((result) => !localKeys.has(result.externalId))];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/merge-results.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Reescribe search.ts**

`src/lib/catalog/search.ts` completo:

```ts
import { createClient } from "@/lib/supabase/server";
import { searchWorks } from "./openlibrary/work-search";
import { lookupIsbn } from "./openlibrary/isbn-lookup";
import { searchMovies, searchSeries } from "./tmdb";
import { MOCK_BOOKS, MOCK_MOVIES, MOCK_SERIES } from "./mock-data";
import { normalizeIsbn } from "./isbn";
import { searchLocalCatalog, findLocalBookByIsbn } from "./local-search";
import { mergeByWorkKey } from "./merge-results";
import type { ItemType, SearchResult } from "./types";

// PELDAÑO 1 de la escalera de hidratación (ver docs/REQUIREMENTS.md §7.32 y el
// spec de 2026-07-14). Dos reglas que sustituyen a las de antes:
//
// 1. LA BÚSQUEDA NO ESCRIBE EN LA BASE DE DATOS. Antes se persistía cada
//    resultado de la API nada más verlo, lo que llenaba `books` de obras que
//    nadie llegaba a mirar, con datos de edición inventados (páginas = la
//    mediana de todas las tiradas). La fila nace al ABRIR la ficha o al AÑADIR
//    el libro, y nace hidratada.
// 2. EL ÚNICO ATAJO ES EL ISBN. Un ISBN es un lookup de una tirada concreta (el
//    escáner), así que si ya la tenemos cacheada no se llama a la API. Una
//    búsqueda por TEXTO siempre pregunta a OpenLibrary y se fusiona con lo
//    local: cortocircuitarla con un hit local (lo de antes) escondía el resto
//    de obras y congelaba para siempre los datos sucios del catálogo.
export async function searchCatalog(
  itemType: ItemType,
  query: string
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (process.env.MOCK_EXTERNAL_APIS === "true") {
    return searchMockData(itemType, trimmed);
  }

  const supabase = await createClient();

  if (itemType === "book") {
    const isbn = normalizeIsbn(trimmed);
    if (isbn) {
      const cached = await findLocalBookByIsbn(supabase, isbn);
      if (cached) return [cached];

      const found = await lookupIsbn(isbn);
      return found ? [found] : [];
    }

    const [local, api] = await Promise.all([
      searchLocalCatalog(supabase, "book", trimmed),
      searchWorks(trimmed),
    ]);
    return mergeByWorkKey(local, api);
  }

  // Películas y series: TMDB, sin cambios respecto al comportamiento anterior
  // (su búsqueda ya devuelve datos limpios y géneros de vocabulario cerrado).
  const [local, api] = await Promise.all([
    searchLocalCatalog(supabase, itemType, trimmed),
    itemType === "movie" ? searchMovies(trimmed) : searchSeries(trimmed),
  ]);
  const localIds = new Set(local.map((r) => r.externalId));
  return [...local, ...api.filter((r) => !localIds.has(r.externalId))];
}

function searchMockData(itemType: ItemType, query: string): SearchResult[] {
  const pool =
    itemType === "book" ? MOCK_BOOKS : itemType === "movie" ? MOCK_MOVIES : MOCK_SERIES;

  if (itemType === "book") {
    const isbn = normalizeIsbn(query);
    if (isbn) return pool.filter((item) => item.matchedIsbn === isbn);
  }

  const needle = query.toLowerCase();
  return pool.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      item.subtitle?.toLowerCase().includes(needle)
  );
}
```

- [ ] **Step 7: Ajusta local-search.ts**

En `src/lib/catalog/local-search.ts`: `BookRow` cambia `google_books_id` por
`openlibrary_work_key`, y `mapBookRow` deja de emitir campos de edición. Sustituye
el tipo y la función de mapeo (y las dos listas de `select`, que pasan a pedir
`openlibrary_work_key` en vez de `google_books_id`, y ya no necesitan
`publisher, total_pages`):

```ts
type BookRow = {
  id: string;
  openlibrary_work_key: string | null;
  title: string;
  author: string | null;
  cover_url: string | null;
  published_year: number | null;
  isbn: string | null;
  synopsis: string | null;
  genres: string[] | null;
};

const BOOK_COLUMNS =
  "id, openlibrary_work_key, title, author, cover_url, published_year, isbn, synopsis, genres";

function mapBookRow(row: BookRow): SearchResult {
  return {
    itemType: "book",
    // La work key es la clave de fusión con los resultados de la API
    // (merge-results.ts). Un libro sin ella (alta manual, import antiguo) se
    // queda con string vacío: no fusiona con nada, pero tampoco se pierde.
    externalId: row.openlibrary_work_key ?? "",
    catalogId: row.id,
    title: row.title,
    subtitle: row.author,
    coverUrl: row.cover_url,
    year: row.published_year,
    synopsis: row.synopsis,
    genres: row.genres,
    // El ISBN de `books` es el espejo de la edición primaria; se conserva aquí
    // para que el lookup por ISBN de un libro ya cacheado pueda registrar/elegir
    // esa misma tirada al añadirlo.
    ...(row.isbn ? { matchedIsbn: row.isbn } : {}),
  };
}
```

Usa `BOOK_COLUMNS` en los dos `.select(...)` de libros del fichero
(`findLocalBookByIsbn` y `searchLocalCatalog`). `mapScreenRow` no se toca.

- [ ] **Step 8: Ajusta mock-data.ts y la tarjeta**

En `src/lib/catalog/mock-data.ts`, para cada entrada de `MOCK_BOOKS`: quita
`publisher` y `pageCount`, y renombra `isbn` a `matchedIsbn`. `MOCK_MOVIES` y
`MOCK_SERIES` no se tocan.

En `src/app/buscar/search-result-card.tsx`, elimina el bloque que pinta editorial
y páginas (son datos de edición, y la tarjeta ya no los recibe):

```tsx
        {(result.publisher || result.pageCount) && (
          ...
        )}
```

El bloque de `editionCount` se queda: ahora muestra el número real de ediciones
que OpenLibrary declara para la obra.

- [ ] **Step 9: Ajusta el importador**

En `src/lib/import/match-row.ts`, cambia los imports y las dos llamadas a
`searchBooks`:

```ts
import { searchWorks } from "@/lib/catalog/openlibrary/work-search";
import { lookupIsbn } from "@/lib/catalog/openlibrary/isbn-lookup";
```

En `matchBook`, la rama de ISBN pasa de `searchBooks(row.isbn)` a:

```ts
    const found = await lookupIsbn(row.isbn);
    if (found) return findOrCreateCatalogItem(supabase, found);
```

(`matchBook` no recibe `userId`, igual que hoy: el importador no registra la
edición escaneada, solo empareja la obra. La tirada la traerá
`ensureBookEditions` cuando se abra la ficha.)

y la rama de título de `searchBooks(row.title)` a `searchWorks(row.title)`. El
resto (el `isSameTitle` contra el título del CSV) se queda igual: `title-match.ts`
NO se borra, este es su uso legítimo.

- [ ] **Step 10: Borra el agrupador**

```bash
git rm src/lib/catalog/group-editions.ts src/lib/catalog/group-editions.test.ts
```

- [ ] **Step 11: Typecheck y suite completa**

Run:
```powershell
npx tsc --noEmit
npx vitest run
```
Expected: `tsc` limpio salvo los errores que arregla la Tarea 4 en
`find-or-create.ts` (el `google_books_id` del payload). Si aparecen otros, son
consumidores de los campos borrados de `SearchResult`: arréglalos aquí.
Vitest: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A src
git commit -m "feat(busqueda): obras en vez de ediciones aplanadas, sin escribir en el catalogo"
```

---

### Task 4: Migración — `hydrated_at` y adiós a `google_books_id`

**Files:**
- Create: `supabase/migrations/20260715_book_hydration.sql`
- Modify: `src/lib/catalog/find-or-create.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: `SearchResult` (Tarea 3).
- Produces: columna `books.hydrated_at timestamptz`; `findOrCreateCatalogItem`
  con la misma firma, buscando por `openlibrary_work_key`.

- [ ] **Step 1: Escribe la migración**

`supabase/migrations/20260715_book_hydration.sql`:

```sql
-- PELDAÑO 2 de la escalera de hidratación (spec 2026-07-14): la obra se hidrata
-- al abrir su ficha, no al buscarla. `hydrated_at` es el guard de ese
-- cache-as-you-go, hermano de `editions_synced_at`: si está puesta, no se
-- vuelve a preguntar a OpenLibrary por esta obra.
--
-- Las filas que ya existen quedan con null a propósito: se rehidratan solas la
-- primera vez que alguien abra su ficha, y así se curan las que se cachearon
-- sucias con el flujo antiguo (sinopsis vacía, géneros de basura).
alter table public.books
  add column hydrated_at timestamptz;

-- Mismo grant que `editions_synced_at` (ver 20260714_editions_d_sync.sql): la
-- hidratación la dispara la ficha con la sesión del visitante autenticado, que
-- no es colaborador. Las columnas de contenido (title, synopsis, genres,
-- cover_url) las protege el trigger de 20260714_editions_h_catalog_edit_grants,
-- que solo deja cambiarlas a collaborator+ ... salvo cuando estaban vacías: ver
-- la función de abajo.
grant update (hydrated_at) on public.books to authenticated;

-- La hidratación escribe synopsis/genres/cover_url/author, que son columnas
-- curadas (solo collaborator+). Pero rellenar un hueco NO es curar: se hace vía
-- función security definer, que solo escribe donde la fila NO tenía nada. Así un
-- authenticated cualquiera puede completar una obra vacía abriendo su ficha, sin
-- poder pisar jamás lo que un colaborador ya escribió a mano.
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
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.books
     set synopsis   = case when synopsis is null or synopsis = ''
                           then left(p_synopsis, 5000) else synopsis end,
         genres     = case when genres is null or cardinality(genres) = 0
                           then p_genres else genres end,
         cover_url  = case when cover_url is null or cover_url = ''
                           then p_cover_url else cover_url end,
         hydrated_at = now()
   where id = p_book_id;
end;
$$;

revoke all on function public.hydrate_book(uuid, text, text[], text) from public;
grant execute on function public.hydrate_book(uuid, text, text[], text) to authenticated;

-- La columna legacy: guardaba la work key de OpenLibrary bajo un nombre que
-- mentía (el código de Google Books está muerto desde hace tiempo).
-- 20260714_editions_d_sync.sql ya copió su contenido a `openlibrary_work_key`.
alter table public.books
  drop column google_books_id;
```

- [ ] **Step 2: Aplica la migración en dev**

Aplícala en el proyecto de **dev** (ver [[supabase-environments]]: el MCP apunta
a prod, dev va por Management API). No la apliques en prod hasta que la PR esté
revisada.

Comprueba:
```sql
select column_name from information_schema.columns
 where table_name = 'books' and column_name in ('hydrated_at','google_books_id','openlibrary_work_key');
```
Expected: `hydrated_at` y `openlibrary_work_key`; `google_books_id` ya no está.

- [ ] **Step 3: Regenera los tipos**

Regenera `src/lib/supabase/database.types.ts` contra dev (herramienta de
Supabase). Verifica que `books` tiene `hydrated_at` y ya no tiene
`google_books_id`.

- [ ] **Step 4: Ajusta find-or-create.ts**

En `src/lib/catalog/find-or-create.ts`:

```ts
const ID_COLUMN_BY_TYPE = {
  book: "openlibrary_work_key",
  movie: "tmdb_id",
  series: "tmdb_id",
} as const;
```

y el payload de libro pierde los campos de edición y el id legacy:

```ts
  const payload =
    result.itemType === "book"
      ? {
          openlibrary_work_key: result.externalId,
          title: result.title,
          author: result.subtitle,
          cover_url: result.coverUrl,
          published_year: result.year,
          // synopsis y genres NO se escriben aquí: la obra se hidrata al abrir
          // su ficha (ensureBookHydrated). publisher/isbn/total_pages tampoco:
          // son de la tirada, y los pone el trigger desde la edición primaria.
        }
      : {
          tmdb_id: Number(result.externalId),
          title: result.title,
          cover_url: result.coverUrl,
          release_year: result.year,
          synopsis: result.synopsis,
          genres: result.genres,
        };
```

En `ensureBookEdition` (la de #32, al final del fichero), la edición ya no viene
de los campos aplanados del resultado, sino del ISBN escaneado. Sustituye su
cuerpo por:

```ts
async function ensureBookEdition(
  supabase: SupabaseServerClient,
  bookId: string,
  result: SearchResult,
  userId?: string | null
): Promise<void> {
  // Solo el lookup por ISBN (escáner, importador) sabe qué tirada exacta tiene
  // el usuario en la mano. Una búsqueda por texto devuelve la obra y punto: sus
  // ediciones las trae ensureBookEditions al abrir la ficha.
  const isbn = result.matchedIsbn;
  if (!isbn || !userId) return;

  try {
    const { error } = await supabase.rpc("register_book_edition", {
      p_book_id: bookId,
      p_isbn: isbn,
      p_cover_url: result.coverUrl ?? undefined,
    });
    if (error) {
      console.error("ensureBookEdition rpc failed", { bookId, isbn, error });
    }
  } catch (error) {
    console.error("ensureBookEdition failed", { bookId, isbn, error });
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260715_book_hydration.sql src/lib/catalog/find-or-create.ts src/lib/supabase/database.types.ts
git commit -m "feat(catalogo): columna hydrated_at, rpc hydrate_book y adios a google_books_id"
```

---

### Task 5: `ensureBookHydrated` y la ficha

El peldaño 2, conectado. Mismo patrón que `ensureItemEnriched` y
`ensureBookEditions`: guarded, idempotente, nunca lanza.

**Files:**
- Create: `src/lib/catalog/hydrate-book.ts`
- Modify: `src/app/libro/[id]/page.tsx`
- Modify: `src/lib/people/enrich-item.ts` (import de autores)

**Interfaces:**
- Consumes: `fetchWork`, `fetchFirstEditionDescription` (Tarea 2);
  `resolveWorkKey` de `openlibrary/editions.ts`; `mapSubjectsToGenres` (Tarea 1);
  la RPC `hydrate_book` (Tarea 4).
- Produces:
  `ensureBookHydrated(supabase: SupabaseServerClient, book: HydratableBook): Promise<void>`
  con `type HydratableBook = { id: string; openlibrary_work_key: string | null; isbn: string | null; hydrated_at: string | null }`.

- [ ] **Step 1: Escribe hydrate-book.ts**

`src/lib/catalog/hydrate-book.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { fetchWork, fetchFirstEditionDescription } from "./openlibrary/work-detail";
import { resolveWorkKey } from "./openlibrary/editions";
import { mapSubjectsToGenres } from "./genres";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HydratableBook = {
  id: string;
  openlibrary_work_key: string | null;
  isbn: string | null;
  hydrated_at: string | null;
};

// PELDAÑO 2 de la escalera de hidratación: la primera vez que se abre la ficha
// de una obra se traen de OpenLibrary la sinopsis y los géneros —los datos que
// la ficha muestra y que la búsqueda ya NO trae— y se guardan. Las siguientes
// visitas no vuelven a llamar a la API.
//
// Es hermano de ensureItemEnriched (créditos) y ensureBookEditions (tiradas), y
// comparte su contrato: idempotente, guarded por una columna, y NUNCA lanza — un
// fallo de una API externa no puede tumbar el render de la ficha.
//
// Escribe a través de la RPC hydrate_book, no con un update directo: synopsis,
// genres y cover_url son columnas curadas (solo collaborator+ puede cambiarlas),
// y la RPC solo rellena los huecos — jamás pisa lo que un colaborador escribió.
export async function ensureBookHydrated(
  supabase: SupabaseServerClient,
  book: HydratableBook
): Promise<void> {
  try {
    if (book.hydrated_at !== null) return;

    let workKey = book.openlibrary_work_key;

    // Sin work key propia (alta antigua, import): se intenta resolver por ISBN y
    // se guarda, para no repetir esta resolución en cada visita.
    if (!workKey && book.isbn) {
      workKey = await resolveWorkKey(book.isbn);
      if (workKey) {
        await supabase
          .from("books")
          .update({ openlibrary_work_key: workKey })
          .eq("id", book.id);
      }
    }

    // Sin work key no hay nada que pedirle a OpenLibrary sobre esta obra, y no
    // va a aparecer una en la próxima visita: se marca hidratada igual, para no
    // repetir el intento fallido en cada apertura de la ficha. (Mismo criterio
    // deliberado que ensureBookEditions.)
    if (!workKey) {
      await markHydrated(supabase, book.id);
      return;
    }

    const work = await fetchWork(workKey);
    if (!work) {
      // La API falló o tardó: NO se marca hidratada. Se reintenta en la
      // siguiente visita, y mientras tanto la ficha se pinta con lo que haya.
      return;
    }

    // La obra manda; si no trae sinopsis, se cae a la de alguna de sus ediciones
    // (una llamada extra, y solo en este caso).
    const synopsis =
      work.description ?? (await fetchFirstEditionDescription(workKey));

    const genres = mapSubjectsToGenres(work.subjects);

    const { error } = await supabase.rpc("hydrate_book", {
      p_book_id: book.id,
      p_synopsis: synopsis ?? undefined,
      p_genres: genres.length > 0 ? genres : undefined,
      p_cover_url: work.coverUrl ?? undefined,
    });

    if (error) console.error("hydrate_book rpc failed", { bookId: book.id, error });
  } catch (error) {
    console.error("ensureBookHydrated failed", { bookId: book.id, error });
  }
}

// hydrate_book ya pone hydrated_at; esto es solo para el caso "no hay nada que
// hidratar", en el que ni siquiera se llama a la RPC.
async function markHydrated(
  supabase: SupabaseServerClient,
  bookId: string
): Promise<void> {
  await supabase
    .from("books")
    .update({ hydrated_at: new Date().toISOString() })
    .eq("id", bookId);
}
```

- [ ] **Step 2: Conecta la ficha**

En `src/app/libro/[id]/page.tsx`:

1. Añade al `select` de `books` la columna `hydrated_at` (ya pide
   `openlibrary_work_key`, `editions_synced_at` e `isbn`).
2. Importa `import { ensureBookHydrated } from "@/lib/catalog/hydrate-book";`.
3. Llámala **junto a `ensureBookEditions`**, con el mismo tratamiento de
   no-bloqueo que #32 ya aplica ahí (mira el bloque de la línea ~93: si #32 lo
   envuelve en `after()` / no lo espera antes de pintar, haz exactamente lo
   mismo — no inventes un patrón nuevo):

```ts
      ensureBookHydrated(supabase, {
        id: book.id,
        openlibrary_work_key: book.openlibrary_work_key,
        isbn: book.isbn,
        hydrated_at: book.hydrated_at,
      }),
```

- [ ] **Step 3: Arregla el import de autores**

En `src/lib/people/enrich-item.ts` (y en cualquier otro consumidor que el
typecheck señale), el import de `resolveOpenLibraryAuthor` pasa de
`@/lib/catalog/open-library` a `@/lib/catalog/openlibrary/authors`.

- [ ] **Step 4: Typecheck y suite**

Run:
```powershell
npx tsc --noEmit
npx vitest run
npx next lint
```
Expected: los tres limpios.

- [ ] **Step 5: Verifica a mano contra dev**

Arranca la app (`npm run dev`), busca "dune", abre la ficha del libro y comprueba
en la BD de dev:

```sql
select title, hydrated_at, synopsis is not null as tiene_sinopsis, genres
  from books order by hydrated_at desc nulls last limit 3;
```
Expected: la obra que abriste tiene `hydrated_at` puesto, `tiene_sinopsis` en
true y `genres` con etiquetas del vocabulario canónico (no "Protected DAISY").

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/hydrate-book.ts src/app/libro/[id]/page.tsx src/lib/people/enrich-item.ts
git commit -m "feat(ficha): hidratar la obra desde OpenLibrary al abrirla"
```

---

### Task 6: Documentación y checklist manual

**Files:**
- Modify: `docs/REQUIREMENTS.md` (§7.2 y §7.32)
- Create: `docs/superpowers/plans/2026-07-14-busqueda-e-hidratacion-manual-test.md`

- [ ] **Step 1: Actualiza REQUIREMENTS.md**

En **§7.32** sustituye la descripción del cache-as-you-go de la búsqueda: ya no se
persiste al buscar; la fila nace al abrir la ficha o al añadir, y se hidrata
entonces (`hydrated_at`). En **§7.2** sustituye el agrupado de ediciones por
título+autor: OpenLibrary ya devuelve obras, y `editionCount` es su
`edition_count` real. Menciona el vocabulario canónico de géneros
(`src/lib/catalog/genres.ts`).

- [ ] **Step 2: Escribe el checklist manual**

`docs/superpowers/plans/2026-07-14-busqueda-e-hidratacion-manual-test.md`, con
estos casos (formato: pasos + resultado esperado, como los checklists anteriores
del repo):

1. **Buscar "dune"** → una tarjeta por obra (no diez ediciones casi iguales), con
   portada, título, autor y año. Las tarjetas ya **no** muestran editorial ni
   páginas. Si la obra tiene varias ediciones, el contador de ediciones sale.
2. **Buscar un libro que ya esté en el catálogo** → aparece una sola vez (no
   duplicado entre lo local y lo de la API) y arriba del listado.
3. **Buscar y NO añadir** → `select count(*) from books` no cambia.
4. **Abrir la ficha de un libro nuevo** → sinopsis y géneros limpios donde antes
   ponía "sin sinopsis". Los géneros son del vocabulario canónico.
5. **Recargar la ficha** → no hay una segunda llamada a OpenLibrary
   (`hydrated_at` ya está puesto). Comprobable en los logs de red del server.
6. **Abrir la ficha de uno de los libros viejos** (los cacheados con el flujo
   anterior, `hydrated_at` null) → se rehidrata solo.
7. **Escanear / buscar por ISBN** → cae en la obra correcta. Al añadirla, esa
   tirada concreta aparece registrada en la tira de ediciones.
8. **Panel de metadatos de la obra** → no muestra editorial, ISBN ni páginas.
   Esos datos aparecen al pulsar una edición de la tira (Sección A de #32).
9. **OpenLibrary caído** (simúlalo cortando la red o apuntando el host a un
   puerto muerto) → la búsqueda devuelve solo lo local y la ficha se pinta con lo
   que hay. Nada revienta.
10. **Importar un CSV de Goodreads** con ISBN → sigue emparejando los libros.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(catalogo): requisitos actualizados y checklist manual de busqueda e hidratacion"
```

---

## Notas de cierre

- Las migraciones se aplican **solo en dev** durante la implementación. A prod van
  cuando la PR se revise, junto con las de #32.
- Prod tenía 10 libros cacheados con el flujo antiguo y ninguno en la biblioteca
  de nadie; con `hydrated_at` a null se curan solos en cuanto alguien abra su
  ficha. No hay que borrar nada.
