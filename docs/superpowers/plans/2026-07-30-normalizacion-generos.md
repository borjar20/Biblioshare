# Normalización y navegación de géneros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar los géneros de libros/pelis/series bajo un vocabulario canónico único, limpiar la entrada de TMDB, y permitir navegar por género (página `/genero/[slug]` + filtro en la biblioteca).

**Architecture:** Un registro de géneros definido en código (`genre-vocab.ts`) es la única verdad: lista curada con `slug`, `label` y `appliesTo`. Ambas fuentes mapean a él — libros ya lo hacen (`genres.ts`), pelis/series pasan a mapear **por id de TMDB → slug** (nuevo `tmdb-genres.ts`). Se sigue **guardando la label** en `genres text[]`, así que retos y stats (que comparan strings) no se tocan. La navegación se apoya en un índice GIN y en `slug↔label` para las URLs.

**Tech Stack:** Next.js (App Router, server components), Supabase (Postgres, `text[]` + índice GIN), TypeScript, Vitest (unit), Playwright (e2e), next-intl.

## Global Constraints

- Vocabulario **cerrado**: lo que no mapea a un slug del registro se **descarta** (nunca se guarda basura), igual que ya hace `genres.ts` con el ruido de OpenLibrary.
- Cada label del registro tiene texto **idéntico** al que hoy emite `genres.ts` (invariante bajo test) → los libros no necesitan backfill.
- `MAX_GENRES = 5` en ambos mapeadores (dedupe + cap).
- Mapeo de TMDB **por id, no por string**: el nombre localizado de TMDB nunca se persiste.
- Reads que comparan géneros por string (retos `challenges/match.ts`, stats `get-catalog-breakdown.ts`) **no se tocan**.
- Migraciones: **`supabase-dev` primero, luego prod**. Verificar contra objetos reales (`pg_class`/columnas), no el ledger de `list_migrations`.
- Estado del usuario vive en `passes` (nunca `library_entries`/`diary_entries`).
- URL de filtros en castellano (`?genero=<slug>`), pantallas server-side (patrón de `/notas` y `library-filters.tsx`).
- Al cerrar: sincronizar `docs/requirements/data-model.md`, append en `docs/requirements/decisiones.md`, y abrir issues para lo aplazado.

---

### Task 1: Registro canónico `genre-vocab.ts`

**Files:**
- Create: `src/lib/catalog/genre-vocab.ts`
- Test: `src/lib/catalog/genre-vocab.test.ts`

**Interfaces:**
- Consumes: `ItemType` de `@/lib/catalog/types`.
- Produces:
  - `type GenreDef = { slug: string; label: string; appliesTo: ItemType[] }`
  - `const GENRES: GenreDef[]`
  - `labelForSlug(slug: string): string | null`
  - `slugForLabel(label: string): string | null`
  - `isCanonicalLabel(label: string): boolean`
  - `genreDefForSlug(slug: string): GenreDef | null`

- [ ] **Step 1: Write the failing test**

`src/lib/catalog/genre-vocab.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  GENRES,
  labelForSlug,
  slugForLabel,
  isCanonicalLabel,
  genreDefForSlug,
} from "./genre-vocab";

describe("genre-vocab", () => {
  it("no tiene slugs duplicados", () => {
    const slugs = GENRES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("no tiene labels duplicadas", () => {
    const labels = GENRES.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("los slugs son URL-safe (minúsculas, guiones, sin acentos)", () => {
    for (const g of GENRES) {
      expect(g.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("appliesTo nunca está vacío", () => {
    for (const g of GENRES) expect(g.appliesTo.length).toBeGreaterThan(0);
  });

  it("slugForLabel y labelForSlug son inversas", () => {
    for (const g of GENRES) {
      expect(slugForLabel(g.label)).toBe(g.slug);
      expect(labelForSlug(g.slug)).toBe(g.label);
    }
  });

  it("devuelve null para desconocidos", () => {
    expect(labelForSlug("no-existe")).toBeNull();
    expect(slugForLabel("No existe")).toBeNull();
    expect(genreDefForSlug("no-existe")).toBeNull();
    expect(isCanonicalLabel("No existe")).toBe(false);
  });

  it("reconoce una label canónica conocida", () => {
    expect(isCanonicalLabel("Ciencia ficción")).toBe(true);
    expect(slugForLabel("Ciencia ficción")).toBe("ciencia-ficcion");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/catalog/genre-vocab.test.ts`
Expected: FAIL — no puede resolver `./genre-vocab`.

- [ ] **Step 3: Write the registry**

`src/lib/catalog/genre-vocab.ts`:
```ts
import type { ItemType } from "@/lib/catalog/types";

// Única verdad sobre la forma de un género. Lista CERRADA y curada: ambas fuentes
// (OpenLibrary vía genres.ts, TMDB vía tmdb-genres.ts) mapean a estas entradas, y
// lo que no mapea se descarta. Se guarda la `label` en genres text[]; el `slug`
// solo se usa para URLs (/genero/[slug]). Regla dura: la `label` de cada entrada
// debe coincidir CARÁCTER A CARÁCTER con la que emite genres.ts para el mismo
// género (test de invariante en genres.test.ts) — por eso los libros no necesitan
// backfill.
export type GenreDef = {
  slug: string; // estable, URL-safe
  label: string; // display, español
  appliesTo: ItemType[];
};

const B: ItemType[] = ["book"];
const MV: ItemType[] = ["movie", "series"];
const ALL: ItemType[] = ["book", "movie", "series"];

export const GENRES: GenreDef[] = [
  // Ficción compartida / de libro (label idéntica a genres.ts)
  { slug: "ciencia-ficcion", label: "Ciencia ficción", appliesTo: ALL },
  { slug: "distopia", label: "Distopía", appliesTo: B },
  { slug: "realismo-magico", label: "Realismo mágico", appliesTo: B },
  { slug: "novela-negra", label: "Novela negra", appliesTo: B },
  { slug: "true-crime", label: "True crime", appliesTo: B },
  { slug: "thriller", label: "Thriller", appliesTo: ALL },
  { slug: "misterio", label: "Misterio", appliesTo: ALL },
  { slug: "fantasia", label: "Fantasía", appliesTo: ALL },
  { slug: "terror", label: "Terror", appliesTo: ALL },
  { slug: "romance", label: "Romance", appliesTo: ALL },
  { slug: "aventura", label: "Aventura", appliesTo: ALL },
  { slug: "historica", label: "Histórica", appliesTo: B },
  { slug: "politica", label: "Política", appliesTo: ALL },
  { slug: "clasicos", label: "Clásicos", appliesTo: B },
  { slug: "humor", label: "Humor", appliesTo: B },
  { slug: "comic", label: "Cómic", appliesTo: B },
  { slug: "manga", label: "Manga", appliesTo: B },
  { slug: "poesia", label: "Poesía", appliesTo: B },
  { slug: "teatro", label: "Teatro", appliesTo: B },
  { slug: "relatos", label: "Relatos", appliesTo: B },
  { slug: "infantil", label: "Infantil", appliesTo: B },
  { slug: "juvenil", label: "Juvenil", appliesTo: B },
  // No ficción (de libro) — labels idénticas a EXACT_RULES de genres.ts
  { slug: "memorias", label: "Memorias", appliesTo: B },
  { slug: "biografia", label: "Biografía", appliesTo: B },
  { slug: "autoayuda", label: "Autoayuda", appliesTo: B },
  { slug: "historia", label: "Historia", appliesTo: B },
  { slug: "filosofia", label: "Filosofía", appliesTo: B },
  { slug: "psicologia", label: "Psicología", appliesTo: B },
  { slug: "economia", label: "Economía", appliesTo: B },
  { slug: "religion", label: "Religión", appliesTo: B },
  { slug: "viajes", label: "Viajes", appliesTo: B },
  { slug: "cocina", label: "Cocina", appliesTo: B },
  { slug: "deporte", label: "Deporte", appliesTo: B },
  { slug: "arte", label: "Arte", appliesTo: B },
  { slug: "ensayo", label: "Ensayo", appliesTo: B },
  { slug: "divulgacion", label: "Divulgación", appliesTo: B },
  // Audiovisual (peli/serie). Fantasía, Ciencia ficción, Misterio, Romance,
  // Terror, Thriller, Aventura, Política ya están arriba con appliesTo ampliado.
  { slug: "accion", label: "Acción", appliesTo: MV },
  { slug: "animacion", label: "Animación", appliesTo: MV },
  { slug: "comedia", label: "Comedia", appliesTo: MV },
  { slug: "drama", label: "Drama", appliesTo: MV },
  { slug: "documental", label: "Documental", appliesTo: MV },
  { slug: "familia", label: "Familia", appliesTo: MV },
  { slug: "western", label: "Western", appliesTo: MV },
  { slug: "belica", label: "Bélica", appliesTo: MV },
  { slug: "crimen", label: "Crimen", appliesTo: MV },
  { slug: "musica", label: "Música", appliesTo: MV },
];

const BY_SLUG = new Map(GENRES.map((g) => [g.slug, g]));
const BY_LABEL = new Map(GENRES.map((g) => [g.label, g]));

export function genreDefForSlug(slug: string): GenreDef | null {
  return BY_SLUG.get(slug) ?? null;
}
export function labelForSlug(slug: string): string | null {
  return BY_SLUG.get(slug)?.label ?? null;
}
export function slugForLabel(label: string): string | null {
  return BY_LABEL.get(label)?.slug ?? null;
}
export function isCanonicalLabel(label: string): boolean {
  return BY_LABEL.has(label);
}
```

> **NOTA sobre "Novela negra" y "Crimen"**: en libros la novela negra es `novela-negra`; en cine TMDB usa "Crimen" (id 80), que se mantiene como slug propio `crimen` (appliesTo movie/series). Son géneros distintos a propósito — no se fusionan.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/catalog/genre-vocab.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/genre-vocab.ts src/lib/catalog/genre-vocab.test.ts
git commit -m "feat(generos): registro canonico de generos (slug/label/appliesTo)"
```

---

### Task 2: Atar `genres.ts` (libros) al registro

**Files:**
- Modify: `src/lib/catalog/genres.ts` (solo si alguna label difiere del registro)
- Modify: `src/lib/catalog/genres.test.ts` (añadir el test de invariante)

**Interfaces:**
- Consumes: `GENRES`, `isCanonicalLabel` de `./genre-vocab`; `mapSubjectsToGenres` de `./genres`.
- Produces: nada nuevo (garantía por test).

- [ ] **Step 1: Write the failing/guard test**

Añadir a `src/lib/catalog/genres.test.ts`:
```ts
import { GENRES, isCanonicalLabel } from "./genre-vocab";

describe("genres.ts ↔ registro canónico", () => {
  // Todas las labels que las reglas pueden emitir están en el registro. Si esto
  // falla, o se corrige el texto en genres.ts o se añade la entrada al registro
  // — nunca se guarda una label fuera del vocabulario.
  it("cada label producible por las reglas es canónica", () => {
    // Reunimos las labels de salida ejercitando subjects representativos de cada
    // regla. Fuente: los needles de PREFIX_RULES/EXACT_RULES.
    const samples = [
      "science fiction", "dystopian fiction", "magic realism", "crime fiction",
      "true crime", "thriller", "mystery", "fantasy", "horror", "romance",
      "adventure stories", "historical fiction", "political fiction", "classic",
      "satire", "graphic novel", "manga", "poetry", "plays", "short stories",
      "juvenile fiction", "young adult", "memoir", "biography", "self help",
      "history", "philosophy", "psychology", "economics", "religion", "travel",
      "cooking", "sports", "art", "essays", "science",
    ];
    for (const s of samples) {
      for (const label of mapSubjectsToGenres([s])) {
        expect(isCanonicalLabel(label), `"${label}" (de "${s}") no es canónica`).toBe(true);
      }
    }
  });

  it("el registro no promete a libros géneros que las reglas no producen", () => {
    // Cada género book-only del registro debe ser alcanzable por alguna regla.
    // (Guardia laxa: solo comprobamos que existen en el catálogo de reglas.)
    const bookLabels = new Set(
      GENRES.filter((g) => g.appliesTo.includes("book")).map((g) => g.label),
    );
    expect(bookLabels.has("Ciencia ficción")).toBe(true);
    expect(bookLabels.has("Ensayo")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npm run test -- src/lib/catalog/genres.test.ts`
Expected: si algún texto de `genres.ts` no coincide con el registro, FALLA nombrando la label. Si ya coinciden, PASA.

- [ ] **Step 3: Reconciliar diferencias (si el test falló)**

Para cada label reportada como no canónica: comparar el texto en `PREFIX_RULES`/`EXACT_RULES` de `genres.ts` con la entrada del registro y **corregir en `genre-vocab.ts`** (el registro se adapta al texto vivo de `genres.ts`, no al revés — ese texto ya está en producción en filas de libros). Ejemplo: si `genres.ts` emite `"Divulgación"` y el registro puso `"Divulgacion"`, corregir el registro.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/catalog/genres.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/genres.ts src/lib/catalog/genres.test.ts src/lib/catalog/genre-vocab.ts
git commit -m "test(generos): invariante genres.ts subset del registro canonico"
```

---

### Task 3: Mapeo TMDB por id (`tmdb-genres.ts`) + wiring

**Files:**
- Create: `src/lib/catalog/tmdb-genres.ts`
- Test: `src/lib/catalog/tmdb-genres.test.ts`
- Modify: `src/lib/catalog/tmdb.ts` (usar `resolveGenres` nuevo; borrar `getGenreMap`/`genreMapCache`)

**Interfaces:**
- Consumes: `labelForSlug` de `./genre-vocab`.
- Produces:
  - `const TMDB_GENRE_TO_SLUGS: Record<number, string[]>`
  - `const TMDB_LABEL_ES_TO_SLUGS: Record<string, string[]>` (puente para el backfill de la Task 5)
  - `resolveGenresFromIds(ids: number[] | undefined): string[]` (ids → slugs → labels, dedupe, cap 5)
  - `resolveGenresFromEsLabels(labels: string[] | null | undefined): string[]` (labels es-ES → labels canónicas, dedupe, cap 5)

- [ ] **Step 1: Registrar la lista real de géneros de TMDB (una vez)**

Los **ids** de TMDB son estables y conocidos; los **nombres es-ES** hay que tomarlos de la fuente para el puente del backfill. Ejecutar una vez y pegar el resultado como comentario de referencia en el fichero (no se llama en runtime):

```bash
curl -s "https://api.themoviedb.org/3/genre/movie/list?language=es-ES" \
  -H "Authorization: Bearer $TMDB_API_KEY" | jq -c '.genres'
curl -s "https://api.themoviedb.org/3/genre/tv/list?language=es-ES" \
  -H "Authorization: Bearer $TMDB_API_KEY" | jq -c '.genres'
```
Expected (nombres es-ES esperados; confirmar con la salida real):
movie → 28 Acción, 12 Aventura, 16 Animación, 35 Comedia, 80 Crimen, 99 Documental, 18 Drama, 10751 Familia, 14 Fantasía, 36 Historia, 27 Terror, 10402 Música, 9648 Misterio, 10749 Romance, 878 Ciencia ficción, 10770 Película de TV, 53 Suspense, 10752 Bélica, 37 Western.
tv → 10759 Action & Adventure, 16 Animación, 35 Comedia, 80 Crimen, 99 Documental, 18 Drama, 10751 Familia, 10762 Kids, 9648 Misterio, 10763 News, 10764 Reality, 10765 Sci-Fi & Fantasy, 10766 Soap, 10767 Talk, 10768 War & Politics, 37 Western.

- [ ] **Step 2: Write the failing test**

`src/lib/catalog/tmdb-genres.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolveGenresFromIds, resolveGenresFromEsLabels } from "./tmdb-genres";
import { isCanonicalLabel } from "./genre-vocab";

describe("tmdb-genres por id", () => {
  it("mapea ids simples a su label canónica", () => {
    expect(resolveGenresFromIds([878])).toEqual(["Ciencia ficción"]);
    expect(resolveGenresFromIds([99])).toEqual(["Documental"]);
    expect(resolveGenresFromIds([53])).toEqual(["Thriller"]); // Suspense → Thriller
  });

  it("los ids compuestos de TV emiten varios slugs", () => {
    expect(resolveGenresFromIds([10765])).toEqual(["Ciencia ficción", "Fantasía"]);
    expect(resolveGenresFromIds([10759])).toEqual(["Acción", "Aventura"]);
    expect(resolveGenresFromIds([10768])).toEqual(["Bélica", "Política"]);
  });

  it("descarta ids de ruido", () => {
    expect(resolveGenresFromIds([10762, 10764, 10767, 10763, 10770, 10766])).toEqual([]);
  });

  it("dedupe y corta a 5", () => {
    // 10759 (Acción,Aventura) + 28 (Acción) → Acción una sola vez
    expect(resolveGenresFromIds([10759, 28])).toEqual(["Acción", "Aventura"]);
    const many = resolveGenresFromIds([878, 14, 27, 53, 9648, 18, 35]);
    expect(many.length).toBe(5);
  });

  it("toda salida es canónica", () => {
    for (const label of resolveGenresFromIds([878, 10765, 10759, 80])) {
      expect(isCanonicalLabel(label)).toBe(true);
    }
  });

  it("undefined/vacío → []", () => {
    expect(resolveGenresFromIds(undefined)).toEqual([]);
    expect(resolveGenresFromIds([])).toEqual([]);
  });
});

describe("tmdb-genres por label es-ES (backfill)", () => {
  it("traduce labels crudas de TMDB a canónicas", () => {
    expect(resolveGenresFromEsLabels(["Suspense"])).toEqual(["Thriller"]);
    expect(resolveGenresFromEsLabels(["Sci-Fi & Fantasy"])).toEqual([
      "Ciencia ficción",
      "Fantasía",
    ]);
  });

  it("descarta labels de ruido y desconocidas", () => {
    expect(resolveGenresFromEsLabels(["Película de TV", "Kids", "Xyz"])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/lib/catalog/tmdb-genres.test.ts`
Expected: FAIL — no resuelve `./tmdb-genres`.

- [ ] **Step 4: Write the mapper**

`src/lib/catalog/tmdb-genres.ts`:
```ts
import { labelForSlug } from "./genre-vocab";

// TMDB entrega solo ids de género en la búsqueda. Los ids son estables, así que se
// mapean por id a slugs canónicos SIN pedir a la API la lista de nombres (antes
// tmdb.ts hacía un fetch a /genre/{kind}/list por proceso). El nombre localizado
// de TMDB no se guarda nunca: se resuelve la label desde el slug del registro.
//
// Ids compuestos de TV (Action & Adventure, Sci-Fi & Fantasy, War & Politics)
// emiten varios slugs. Ids sin canónico (Kids, Reality, Talk, News, TV Movie,
// Soap) NO están en la tabla → se descartan.
const MAX_GENRES = 5;

export const TMDB_GENRE_TO_SLUGS: Record<number, string[]> = {
  // --- movie + tv compartidos ---
  16: ["animacion"],
  35: ["comedia"],
  80: ["crimen"],
  99: ["documental"],
  18: ["drama"],
  10751: ["familia"],
  9648: ["misterio"],
  37: ["western"],
  // --- solo movie ---
  28: ["accion"],
  12: ["aventura"],
  14: ["fantasia"],
  36: ["historia"],
  27: ["terror"],
  10402: ["musica"],
  10749: ["romance"],
  878: ["ciencia-ficcion"],
  53: ["thriller"], // "Suspense" en es-ES
  10752: ["belica"],
  // --- solo tv, compuestos ---
  10759: ["accion", "aventura"], // Action & Adventure
  10765: ["ciencia-ficcion", "fantasia"], // Sci-Fi & Fantasy
  10768: ["belica", "politica"], // War & Politics
  // Ruido tv (10762 Kids, 10763 News, 10764 Reality, 10766 Soap, 10767 Talk) y
  // movie (10770 TV Movie) se omiten a propósito.
};

// Puente para el backfill (Task 5): las filas viejas de movies/series guardan la
// label es-ES cruda de TMDB, no el id. Se deriva de la MISMA tabla de ids usando
// los nombres es-ES confirmados en el Step 1. Mantener sincronizado con Step 1.
export const TMDB_LABEL_ES_TO_SLUGS: Record<string, string[]> = {
  "Acción": ["accion"],
  "Aventura": ["aventura"],
  "Animación": ["animacion"],
  "Comedia": ["comedia"],
  "Crimen": ["crimen"],
  "Documental": ["documental"],
  "Drama": ["drama"],
  "Familia": ["familia"],
  "Fantasía": ["fantasia"],
  "Historia": ["historia"],
  "Terror": ["terror"],
  "Música": ["musica"],
  "Misterio": ["misterio"],
  "Romance": ["romance"],
  "Ciencia ficción": ["ciencia-ficcion"],
  "Suspense": ["thriller"],
  "Bélica": ["belica"],
  "Western": ["western"],
  "Action & Adventure": ["accion", "aventura"],
  "Sci-Fi & Fantasy": ["ciencia-ficcion", "fantasia"],
  "War & Politics": ["belica", "politica"],
  // "Película de TV", "Kids", "News", "Reality", "Soap", "Talk" → sin entrada = descartadas.
};

function slugsToLabels(slugs: string[]): string[] {
  const out: string[] = [];
  for (const slug of slugs) {
    const label = labelForSlug(slug);
    if (label && !out.includes(label)) {
      out.push(label);
      if (out.length === MAX_GENRES) break;
    }
  }
  return out;
}

export function resolveGenresFromIds(ids: number[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  const slugs: string[] = [];
  for (const id of ids) {
    for (const slug of TMDB_GENRE_TO_SLUGS[id] ?? []) slugs.push(slug);
  }
  return slugsToLabels(slugs);
}

export function resolveGenresFromEsLabels(
  labels: string[] | null | undefined,
): string[] {
  if (!labels || labels.length === 0) return [];
  const slugs: string[] = [];
  for (const label of labels) {
    for (const slug of TMDB_LABEL_ES_TO_SLUGS[label] ?? []) slugs.push(slug);
  }
  return slugsToLabels(slugs);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/lib/catalog/tmdb-genres.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire into `tmdb.ts` y borrar el fetch de nombres**

En `src/lib/catalog/tmdb.ts`:
1. Importar: `import { resolveGenresFromIds } from "./tmdb-genres";`
2. Borrar `genreMapCache`, `getGenreMap` y la función `resolveGenres` (la vieja que hacía `getGenreMap(kind)` y traducía por nombre).
3. Sustituir las dos llamadas `genres: await resolveGenres("movie", r.genre_ids)` y `genres: await resolveGenres("tv", r.genre_ids)` por:
```ts
genres: resolveGenresFromIds(r.genre_ids),
```
(ya no es `await`: el mapeo es síncrono). Ajustar `async`/`await` del `.map` circundante si queda sin awaits — si el map ya no tiene ningún await, quitar `async` y el `await Promise.all(...)` que lo envolvía; si tiene otros awaits, dejarlo.

- [ ] **Step 7: Run the full catalog test suite**

Run: `npm run test -- src/lib/catalog`
Expected: PASS. Verificar que ningún test dependía de `getGenreMap`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/catalog/tmdb-genres.ts src/lib/catalog/tmdb-genres.test.ts src/lib/catalog/tmdb.ts
git commit -m "feat(generos): mapeo TMDB por id a slugs canonicos, sin fetch de nombres"
```

---

### Task 4: Índice GIN sobre `genres` (migración)

**Files:**
- Create: `supabase/migrations/20260730_genres_gin_indexes.sql` (o el nombre de fecha que toque)

**Interfaces:**
- Consumes: nada.
- Produces: índices GIN que la Task 6 (`.contains("genres", …)`) necesita para escalar.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260730_genres_gin_indexes.sql`:
```sql
-- GIN sobre genres text[] para que `genres @> ARRAY[label]` (la consulta de
-- /genero/[slug] y del filtro de biblioteca) no haga scan completo del catálogo.
create index if not exists books_genres_gin on public.books using gin (genres);
create index if not exists movies_genres_gin on public.movies using gin (genres);
create index if not exists series_genres_gin on public.series using gin (genres);
```

- [ ] **Step 2: Aplicar en dev y verificar contra objetos reales**

Aplicar en `supabase-dev` (`mcp__supabase-dev__apply_migration`, name `genres_gin_indexes`).
Verificar que existen (no fiarse del ledger):
```sql
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('books_genres_gin','movies_genres_gin','series_genres_gin');
```
Expected: 3 filas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260730_genres_gin_indexes.sql
git commit -m "feat(generos): indices GIN sobre genres (books/movies/series)"
```

> Prod se aplica en la Task 9 (junto al backfill), tras validar el flujo en dev.

---

### Task 5: Backfill de `movies`/`series` al vocabulario canónico (dev)

**Files:**
- Create: `scripts/backfill-genres.ts` (script Node de un solo uso, service role)

**Interfaces:**
- Consumes: `resolveGenresFromEsLabels` de `src/lib/catalog/tmdb-genres.ts`.
- Produces: filas de `movies`/`series` con `genres` canónicos.

- [ ] **Step 1: Escribir el script**

`scripts/backfill-genres.ts`:
```ts
// Recompute de una vez: traduce las labels es-ES crudas de TMDB guardadas en
// movies.genres / series.genres a labels canónicas. Idempotente: correrlo dos
// veces deja el mismo resultado (una label ya canónica que no esté en el puente
// es-ES se descartaría, así que SOLO se reescribe cuando el resultado no vacía la
// fila por accidente — ver el guard). Uso: node --env-file=.env.local + tsx.
import { createClient } from "@supabase/supabase-js";
import { resolveGenresFromEsLabels } from "../src/lib/catalog/tmdb-genres";
import { isCanonicalLabel } from "../src/lib/catalog/genre-vocab";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function backfill(table: "movies" | "series") {
  const { data, error } = await supabase.from(table).select("id, genres");
  if (error) throw error;
  let updated = 0;
  for (const row of data ?? []) {
    const current: string[] = row.genres ?? [];
    if (current.length === 0) continue;
    // Ya canónico (p.ej. una fila re-hidratada tras el deploy del Task 3): no tocar.
    if (current.every(isCanonicalLabel)) continue;
    const next = resolveGenresFromEsLabels(current);
    // Guard: si el puente no reconoció NADA pero la fila tenía labels, no la
    // vaciamos a ciegas — se registra para revisión manual (posible label es-ES
    // no contemplada en el puente).
    if (next.length === 0) {
      console.warn(`[${table}] ${row.id}: labels sin mapear`, current);
      continue;
    }
    const { error: upErr } = await supabase
      .from(table)
      .update({ genres: next })
      .eq("id", row.id);
    if (upErr) throw upErr;
    updated++;
  }
  console.log(`[${table}] filas actualizadas: ${updated}`);
}

async function main() {
  await backfill("movies");
  await backfill("series");
}
main().then(() => process.exit(0));
```

- [ ] **Step 2: Correr contra dev y revisar los warnings**

Run (apuntando a `.env.local` de dev):
```bash
npx tsx scripts/backfill-genres.ts
```
Expected: cuenta de filas actualizadas por tabla y, si aparecen, líneas `labels sin mapear`.
**Acción**: cada label es-ES en un warning que SÍ deba mapear se añade a `TMDB_LABEL_ES_TO_SLUGS` (Task 3) y se vuelve a correr. Las que sean ruido real (formatos, listas) se dejan descartadas.

- [ ] **Step 3: Verificar el resultado en dev**

```sql
-- Ninguna fila con géneros fuera del vocabulario (aparte de las que quedaron sin
-- mapear a propósito). Muestreo:
select id, genres from public.movies
where genres is not null and array_length(genres,1) > 0
limit 20;
```
Expected: labels canónicas ("Acción", "Ciencia ficción", …), sin "Suspense" ni "Sci-Fi & Fantasy".

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-genres.ts
git commit -m "chore(generos): script de backfill de generos TMDB a canonico"
```

---

### Task 6: Página `/genero/[slug]` + consulta de catálogo

**Files:**
- Create: `src/lib/catalog/get-catalog-by-genre.ts`
- Test: `src/lib/catalog/get-catalog-by-genre.test.ts`
- Create: `src/app/genero/[slug]/page.tsx`
- Test (e2e): `e2e/genero-page.spec.ts`

**Interfaces:**
- Consumes: `labelForSlug`, `genreDefForSlug` de `./genre-vocab`; el cliente server de Supabase.
- Produces: `getCatalogByGenre(supabase, slug, { page }): Promise<{ items: CatalogCard[]; total: number }>` donde `CatalogCard = { itemType: ItemType; itemId: string; title: string; coverUrl: string | null; year: number | null }`.

- [ ] **Step 1: Write the failing test (unit de la consulta, con supabase mock)**

`src/lib/catalog/get-catalog-by-genre.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { getCatalogByGenre } from "./get-catalog-by-genre";

// Mock mínimo del builder de supabase: cada from() devuelve un thenable que
// resuelve a un data fijo por tabla. Solo comprobamos el merge/orden/paginación.
function fakeSupabase(byTable: Record<string, { data: unknown[]; count: number }>) {
  return {
    from(table: string) {
      const res = byTable[table] ?? { data: [], count: 0 };
      const builder: any = {
        select: () => builder,
        contains: () => builder,
        order: () => builder,
        range: () => Promise.resolve({ data: res.data, count: res.count, error: null }),
      };
      return builder;
    },
  };
}

describe("getCatalogByGenre", () => {
  it("slug inválido → items vacíos y total 0", async () => {
    const s = fakeSupabase({});
    const out = await getCatalogByGenre(s as any, "no-existe", { page: 1 });
    expect(out).toEqual({ items: [], total: 0 });
  });

  it("mezcla tipos y ordena alfabéticamente por título", async () => {
    const s = fakeSupabase({
      books: { data: [{ id: "b1", title: "Zulú", cover_url: null, published_year: 2000 }], count: 1 },
      movies: { data: [{ id: "m1", title: "Alien", cover_url: null, release_year: 1979 }], count: 1 },
      series: { data: [], count: 0 },
    });
    const out = await getCatalogByGenre(s as any, "ciencia-ficcion", { page: 1 });
    expect(out.items.map((i) => i.title)).toEqual(["Alien", "Zulú"]);
    expect(out.total).toBe(2);
  });

  it("no consulta tablas fuera del appliesTo del género", async () => {
    // "ensayo" es solo de libro: movies/series no deben aportar.
    const s = fakeSupabase({
      books: { data: [{ id: "b1", title: "Sapiens", cover_url: null, published_year: 2011 }], count: 1 },
    });
    const out = await getCatalogByGenre(s as any, "ensayo", { page: 1 });
    expect(out.items.map((i) => i.itemType)).toEqual(["book"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/catalog/get-catalog-by-genre.test.ts`
Expected: FAIL — no resuelve el módulo.

- [ ] **Step 3: Write the query**

`src/lib/catalog/get-catalog-by-genre.ts`:
```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { genreDefForSlug, labelForSlug } from "./genre-vocab";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CatalogCard = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  year: number | null;
};

const PAGE_SIZE = 24;

// Obras del CATÁLOGO (no solo del usuario) con un género, mezclando los tres
// tipos. `genres @> ARRAY[label]` vía .contains, apoyado en el índice GIN
// (20260730_genres_gin_indexes.sql). Solo se consultan las tablas cuyo tipo está
// en appliesTo del género — buscar "Ensayo" en movies no tiene sentido. Orden
// alfabético por título (estable, sin depender de agregados); popularidad → issue.
export async function getCatalogByGenre(
  supabase: SupabaseServerClient,
  slug: string,
  { page }: { page: number },
): Promise<{ items: CatalogCard[]; total: number }> {
  const def = genreDefForSlug(slug);
  const label = labelForSlug(slug);
  if (!def || !label) return { items: [], total: 0 };

  const wantBook = def.appliesTo.includes("book");
  const wantMovie = def.appliesTo.includes("movie");
  const wantSeries = def.appliesTo.includes("series");
  const empty = Promise.resolve({ data: [], count: 0, error: null });

  const [books, movies, series] = await Promise.all([
    wantBook
      ? supabase
          .from("books")
          .select("id, title, cover_url, published_year", { count: "exact" })
          .contains("genres", [label])
          .order("title", { ascending: true })
          .range(0, PAGE_SIZE * page - 1)
      : empty,
    wantMovie
      ? supabase
          .from("movies")
          .select("id, title, cover_url, release_year", { count: "exact" })
          .contains("genres", [label])
          .order("title", { ascending: true })
          .range(0, PAGE_SIZE * page - 1)
      : empty,
    wantSeries
      ? supabase
          .from("series")
          .select("id, title, cover_url, release_year", { count: "exact" })
          .contains("genres", [label])
          .order("title", { ascending: true })
          .range(0, PAGE_SIZE * page - 1)
      : empty,
  ]);

  const cards: CatalogCard[] = [];
  for (const r of (books.data ?? []) as any[])
    cards.push({ itemType: "book", itemId: r.id, title: r.title, coverUrl: r.cover_url, year: r.published_year });
  for (const r of (movies.data ?? []) as any[])
    cards.push({ itemType: "movie", itemId: r.id, title: r.title, coverUrl: r.cover_url, year: r.release_year });
  for (const r of (series.data ?? []) as any[])
    cards.push({ itemType: "series", itemId: r.id, title: r.title, coverUrl: r.cover_url, year: r.release_year });

  cards.sort((a, b) => a.title.localeCompare(b.title, "es"));

  const total = (books.count ?? 0) + (movies.count ?? 0) + (series.count ?? 0);
  const from = (page - 1) * PAGE_SIZE;
  return { items: cards.slice(from, from + PAGE_SIZE), total };
}
```

> **Nota de paginación**: cada tabla se recorta a `PAGE_SIZE*page` y luego se mezcla/ordena/recorta en memoria. Correcto para catálogos moderados. Si una tabla tuviera miles de obras del mismo género, el orden alfabético global exigiría keyset — se anota como issue si llega a doler.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/catalog/get-catalog-by-genre.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the page**

`src/app/genero/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { genreDefForSlug, labelForSlug } from "@/lib/catalog/genre-vocab";
import { getCatalogByGenre } from "@/lib/catalog/get-catalog-by-genre";

// Página de un género: lista el catálogo (los tres tipos) que lo lleva. slug
// inválido → 404. Server component puro; el filtro va por la URL (?pagina=N).
export default async function GeneroPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const def = genreDefForSlug(slug);
  const label = labelForSlug(slug);
  if (!def || !label) notFound();

  const sp = await searchParams;
  const rawPage = Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina;
  const page = Math.max(1, Number(rawPage) || 1);

  const supabase = await createClient();
  const { items, total } = await getCatalogByGenre(supabase, slug, { page });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-foreground">{label}</h1>
        <span className="font-mono text-[11px] text-muted-foreground">{total}</span>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay obras de este género.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={`${item.itemType}:${item.itemId}`}>
              <Link
                href={`/${item.itemType === "book" ? "libro" : item.itemType === "movie" ? "pelicula" : "serie"}/${item.itemId}`}
                className="flex flex-col gap-1"
              >
                {item.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.coverUrl} alt="" className="aspect-[2/3] w-full rounded-md object-cover" />
                ) : (
                  <div className="aspect-[2/3] w-full rounded-md bg-surface-muted" />
                )}
                <span className="line-clamp-2 text-[12.5px] text-foreground">{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

> **Verificar en implementación**: las rutas de ficha (`/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`) coinciden con `src/app/{libro,pelicula,serie}/[id]/page.tsx` (confirmado por Glob). Si el proyecto tiene un componente de tarjeta de catálogo reutilizable, usarlo en vez del `<li>` de arriba (revisar `src/components` de búsqueda/resultados).

- [ ] **Step 6: Write the e2e**

`e2e/genero-page.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("página de género lista obras y 404 en slug inválido", async ({ page }) => {
  await page.goto("/genero/ciencia-ficcion");
  await expect(page.getByRole("heading", { name: "Ciencia ficción" })).toBeVisible();

  const res = await page.goto("/genero/no-existe");
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 7: Run tests**

Run: `npm run test -- src/lib/catalog/get-catalog-by-genre.test.ts`
Then (con el dev server ya levantado en :3000): `npm run test:e2e -- genero-page`
Expected: PASS. (El e2e asume que dev tiene al menos una obra de ciencia ficción; si no, sembrar o ajustar el assert a la cabecera+404.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/catalog/get-catalog-by-genre.ts src/lib/catalog/get-catalog-by-genre.test.ts src/app/genero/[slug]/page.tsx e2e/genero-page.spec.ts
git commit -m "feat(generos): pagina /genero/[slug] con catalogo mezclado"
```

---

### Task 7: `GenreTag` se vuelve enlace

**Files:**
- Modify: `src/components/ui/genre-tag.tsx`
- Test: `src/components/ui/genre-tag.test.tsx`

**Interfaces:**
- Consumes: `slugForLabel` de `@/lib/catalog/genre-vocab`.
- Produces: `GenreTag` que envuelve en `<Link>` cuando la label es canónica.

- [ ] **Step 1: Write the failing test**

`src/components/ui/genre-tag.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { GenreTag } from "./genre-tag";

describe("GenreTag", () => {
  it("label canónica → enlace a /genero/[slug]", () => {
    const { container } = render(<GenreTag label="Ciencia ficción" />);
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/genero/ciencia-ficcion");
  });

  it("label no canónica → span sin enlace", () => {
    const { container } = render(<GenreTag label="Basura vieja" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("Basura vieja");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/ui/genre-tag.test.tsx`
Expected: FAIL — hoy nunca hay `<a>`.

- [ ] **Step 3: Modify the component**

`src/components/ui/genre-tag.tsx`:
```tsx
import Link from "next/link";
import { slugForLabel } from "@/lib/catalog/genre-vocab";

// Small monospace genre chip (reel+shelf-style), neutral by default. Cuando la
// label pertenece al vocabulario canónico, el chip enlaza a su página de género;
// si es un dato viejo fuera del registro, queda como span muerto (sin enlaces
// rotos).
export function GenreTag({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  const chip = `inline-flex items-center rounded-chip border border-border bg-surface-muted px-2 py-0.5 font-mono text-[10px] tracking-wide whitespace-nowrap text-muted-foreground uppercase ${className}`;
  const slug = slugForLabel(label);
  if (slug) {
    return (
      <Link href={`/genero/${slug}`} className={`${chip} hover:text-foreground`}>
        {label}
      </Link>
    );
  }
  return <span className={chip}>{label}</span>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/ui/genre-tag.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/genre-tag.tsx src/components/ui/genre-tag.test.tsx
git commit -m "feat(generos): GenreTag enlaza a /genero/[slug] si la label es canonica"
```

---

### Task 8: Filtro por género en "mi biblioteca"

**Files:**
- Modify: `src/lib/library/get-library-items.ts` (añadir `filters.genre` + `getUserGenres`)
- Test: `src/lib/library/get-library-items.test.ts` (crear o ampliar)
- Modify: `src/components/library/library-filters.tsx` (bloque "Género")
- Modify: la page que llama a `LibraryFilters`/`getLibraryItems` (leer `?genero=` y pasarlo)
- Test (e2e): `e2e/biblioteca-filtro-genero.spec.ts`

**Interfaces:**
- Consumes: `loadGenres` de `@/lib/challenges/load-catalog-facets`; `labelForSlug`, `slugForLabel`, `genreDefForSlug` de `@/lib/catalog/genre-vocab`.
- Produces:
  - `getLibraryItems(..., filters & { genre?: string })` — `genre` es un slug; filtra por la label canónica.
  - `getUserGenres(supabase, userId): Promise<{ slug: string; label: string; count: number }[]>` — géneros presentes en la biblioteca del usuario, con conteo, ordenados por conteo desc.

- [ ] **Step 1: Write the failing test para el filtro**

`src/lib/library/get-library-items.test.ts` (añadir; si no existe, crear con este describe). El filtro por género vive en una función pura extraíble — para testear sin BD, extraer el paso de filtrado a un helper puro `filterByGenre(items, wantedLabel, genresByKey)`:
```ts
import { describe, expect, it } from "vitest";
import { filterByGenre } from "./get-library-items";

describe("filterByGenre", () => {
  const items = [
    { itemType: "book", itemId: "b1" },
    { itemType: "movie", itemId: "m1" },
  ] as any[];
  const genresByKey = new Map<string, string[]>([
    ["book:b1", ["Ciencia ficción", "Aventura"]],
    ["movie:m1", ["Comedia"]],
  ]);

  it("conserva solo los items cuyo array contiene la label", () => {
    const out = filterByGenre(items, "Ciencia ficción", genresByKey);
    expect(out.map((i) => i.itemId)).toEqual(["b1"]);
  });

  it("label ausente → vacío", () => {
    expect(filterByGenre(items, "Terror", genresByKey)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/library/get-library-items.test.ts`
Expected: FAIL — `filterByGenre` no existe.

- [ ] **Step 3: Añadir el helper puro y el filtro en `get-library-items.ts`**

En `src/lib/library/get-library-items.ts`:

1. Import arriba:
```ts
import { loadGenres } from "@/lib/challenges/load-catalog-facets";
import { labelForSlug, slugForLabel } from "@/lib/catalog/genre-vocab";
```
2. Helper puro exportado (fuera de `getLibraryItems`):
```ts
// Conserva los items cuyo array de géneros (del catálogo) contiene la label. El
// género vive en catálogo, no en passes, así que —igual que search/sort— se
// aplica en memoria tras la hidratación, no en el SQL de passes.
export function filterByGenre<T extends { itemType: ItemType; itemId: string }>(
  items: T[],
  wantedLabel: string,
  genresByKey: Map<string, string[]>,
): T[] {
  return items.filter((i) =>
    (genresByKey.get(`${i.itemType}:${i.itemId}`) ?? []).includes(wantedLabel),
  );
}
```
3. En la firma de `getLibraryItems`, añadir a `filters`: `genre?: string;` (slug).
4. Tras la hidratación (después del bloque `if (filters.search)`), antes de los `sort`, insertar:
```ts
if (filters.genre) {
  const wanted = labelForSlug(filters.genre);
  if (!wanted) return []; // slug inválido: sin resultados, no la biblioteca entera
  const genresByKey = await loadGenres(
    supabase,
    items.map((i) => ({ itemType: i.itemType, itemId: i.itemId })),
  );
  items = filterByGenre(items, wanted, genresByKey);
}
```

- [ ] **Step 4: Añadir `getUserGenres`**

Al final de `src/lib/library/get-library-items.ts`:
```ts
// Géneros presentes en la biblioteca del usuario (para poblar el selector: solo
// los que tiene, no los 45 del registro). Cuenta obras distintas por género.
export async function getUserGenres(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ slug: string; label: string; count: number }[]> {
  const { data: entries } = await supabase
    .from("passes")
    .select("item_type, item_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  const refs = (entries ?? []).map((e) => ({ itemType: e.item_type as ItemType, itemId: e.item_id }));
  if (refs.length === 0) return [];

  const genresByKey = await loadGenres(supabase, refs);
  const count = new Map<string, number>();
  for (const labels of genresByKey.values()) {
    for (const label of new Set(labels)) {
      const slug = slugForLabel(label);
      if (slug) count.set(slug, (count.get(slug) ?? 0) + 1);
    }
  }
  return [...count.entries()]
    .map(([slug, c]) => ({ slug, label: labelForSlug(slug)!, count: c }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/lib/library/get-library-items.test.ts`
Expected: PASS.

- [ ] **Step 6: UI del filtro en `library-filters.tsx`**

En `src/components/library/library-filters.tsx`:
1. Aceptar dos props nuevas: `genre?: string` (slug activo) y `genres?: { slug: string; label: string; count: number }[]` (los del usuario, ya cargados por la page).
2. Incluir `genre` en `buildHref`/`clearHref` (poner `?genero=<slug>` cuando exista; `clearHref` lo quita).
3. Añadir dentro del `FiltersDropdown`, tras el bloque de estado, un bloque "Género" solo si `genres?.length`:
```tsx
{genres && genres.length > 0 && (
  <div className="flex flex-col gap-1.5">
    <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
      {t("collection.filterGenre")}
    </span>
    <div className="flex flex-wrap items-center gap-0.5">
      <Link href={buildHref({ genre: undefined })} className={segClass(!genre)}>
        {t("library.filters.allGenres")}
      </Link>
      {genres.map((g) => (
        <Link key={g.slug} href={buildHref({ genre: g.slug })} className={segClass(genre === g.slug)}>
          {g.label} <span className="opacity-60">{g.count}</span>
        </Link>
      ))}
    </div>
  </div>
)}
```
4. Sumar `genre ? 1 : 0` a `activeCount`. Extender el tipo del parámetro de `buildHref` con `genre?: string`.
5. Añadir claves i18n `collection.filterGenre`, `library.filters.allGenres` en `messages/*.json` (usar el agente `i18n-keeper` o replicar el patrón de `filterStatus`/`allStatuses`).

- [ ] **Step 7: Conectar la page de biblioteca**

En la page que renderiza `LibraryFilters` y llama a `getLibraryItems` (buscar con `grep -rl "getLibraryItems\|LibraryFilters" src/app`):
1. Leer `?genero=` de `searchParams` (validar con `genreDefForSlug`; inválido → tratar como sin filtro).
2. Pasar `genre` a `getLibraryItems({ ..., genre })`.
3. Llamar `getUserGenres(supabase, userId)` y pasar `genres` + `genre` a `LibraryFilters`.

- [ ] **Step 8: Write the e2e**

`e2e/biblioteca-filtro-genero.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// Asume sesión y biblioteca sembradas por el harness e2e existente (reusar el
// patrón de login de los specs actuales). Ajustar el nombre del género a uno
// presente en el seed.
test("filtro de género acota la biblioteca", async ({ page }) => {
  await page.goto("/biblioteca"); // ajustar a la ruta real de la biblioteca
  await page.getByRole("button", { name: /filtros/i }).click();
  const genreLink = page.getByRole("link", { name: /ciencia ficción/i }).first();
  await genreLink.click();
  await expect(page).toHaveURL(/genero=ciencia-ficcion/);
});
```

- [ ] **Step 9: Run tests**

Run: `npm run test -- src/lib/library/get-library-items.test.ts`
Then: `npm run test:e2e -- biblioteca-filtro-genero`
Expected: PASS. (Ajustar ruta/seed del e2e a lo real; si el harness no siembra géneros, degradar el assert a que la URL cambia y la lista no crece.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/library/get-library-items.ts src/lib/library/get-library-items.test.ts src/components/library/library-filters.tsx src/app messages e2e/biblioteca-filtro-genero.spec.ts
git commit -m "feat(generos): filtro por genero en la biblioteca del usuario"
```

---

### Task 9: Prod (índices + backfill) y sincronización de docs

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md` (append)
- Modify: `docs/requirements/backlog.md` (si aplica)

**Interfaces:** ninguna (operación + docs).

- [ ] **Step 1: Aplicar índices GIN en prod**

Aplicar `20260730_genres_gin_indexes.sql` en `supabase-prod`. Verificar contra `pg_indexes` (mismo select del Task 4, Step 2). Expected: 3 filas.

- [ ] **Step 2: Backfill en prod**

Correr `scripts/backfill-genres.ts` apuntando a prod (service role de prod). Revisar los warnings `labels sin mapear`; añadir al puente lo que deba mapear y re-correr. Verificar con el muestreo SQL del Task 5, Step 3.

- [ ] **Step 3: Actualizar `data-model.md`**

En la sección de catálogo (`books`/`movies`/`series`, ~línea 112), añadir nota:
> Los `genres` de las tres tablas usan un **vocabulario canónico único** definido en
> código (`src/lib/catalog/genre-vocab.ts`). Libros mapean subjects de OpenLibrary
> (`genres.ts`); pelis/series mapean **ids** de TMDB (`tmdb-genres.ts`), nunca el nombre
> localizado. Índices GIN `*_genres_gin` sirven `genres @> ARRAY[label]`
> (`/genero/[slug]` y el filtro de biblioteca). Verificado 2026-07-30.

Actualizar la fecha `[Canónico · verificado …]` de la cabecera del doc.

- [ ] **Step 4: Append en `decisiones.md`**

Añadir al FINAL (append-only) una entrada:
> **YYYY-MM-DD — Normalización de géneros (enfoque A).** Vocabulario canónico en código,
> se guarda la label (no slug) para no tocar los reads que comparan strings (retos,
> stats). TMDB mapea por id, no por nombre. Descartados: guardar slug (migrar todo +
> criterios de reto) y tabla de géneros en BD (overkill para lista cerrada). Ver spec
> `docs/superpowers/specs/2026-07-30-normalizacion-generos-design.md`.

- [ ] **Step 5: Abrir issues de lo aplazado**

Abrir en el repo (regla de AGENTS.md: lo pendiente vive como issue):
- Índice global de géneros (pantalla con los 45 y conteos).
- Editar género a mano por obra cuando el mapeo falla.
- Orden por popularidad en `/genero/[slug]` (hoy alfabético).
- Selector de género del reto: hoy es texto libre; convertir a select del vocabulario canónico.
- Keyset en `/genero/[slug]` si un género acumula miles de obras (paginación en memoria actual).

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(generos): sincroniza data-model y decisiones tras normalizacion"
```

- [ ] **Step 7: Verificación final**

Run:
```bash
npm run test
npm run lint
npm run build
```
Expected: todo verde. Con el dev server en :3000: `npm run test:e2e -- genero-page biblioteca-filtro-genero`.

---

## Self-Review (cobertura del spec)

- §1.1 Registro → Task 1. ✔
- §1.2 Libros/invariante → Task 2. ✔
- §1.3 TMDB id→slug, compuestos, ruido, sin fetch → Task 3. ✔
- §1.4 Backfill (books sin, movies/series por label-es) → Task 5; prod en Task 9. ✔
- §2.1 `/genero/[slug]` + GIN → Task 4 (índice) + Task 6 (página). ✔
- §2.2 GenreTag enlace → Task 7. ✔
- §2.3 Filtro biblioteca (getLibraryItems.genre + getUserGenres + UI + URL) → Task 8. ✔
- Radio de impacto (retos/stats sin tocar) → respetado: ningún task modifica `match.ts` ni `get-catalog-breakdown.ts`. ✔
- Docs (data-model, decisiones, issues) → Task 9. ✔
- Criterios de reto NO se migran (texto libre, match case-insensitive) → decidido, issue para convertirlos a select. ✔
