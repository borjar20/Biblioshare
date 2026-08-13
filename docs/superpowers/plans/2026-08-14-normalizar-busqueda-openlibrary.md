# Normalizar la búsqueda de libros de Open Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la búsqueda de libros devuelva obras únicas, con el título en español cuando existe, sin estuches ni traducciones sueltas — sin borrar libros legítimos como hace la regla de la bibliografía si se reutiliza tal cual.

**Architecture:** Un SEGUNDO normalizador puro (`search-normalize.ts`), hermano del de bibliografías (`normalize.ts`) y no una rama suya. `searchWorks` pasa de una llamada a dos pasadas en paralelo (`lang=es` y `lang=en`, `limit=40`) y las pasa por él. Dos reglas cambian respecto a la bibliografía —una guarda de colisión sobre los títulos de edición, y desduplicación solo por título de obra— porque `editions.docs[0]` de `search.json` es la edición que casa con la CONSULTA, no la mejor de la obra.

**Tech Stack:** TypeScript, Next.js 16, Vitest 4. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-14-normalizar-busqueda-openlibrary-design.md` — léela antes de empezar.

## Global Constraints

- **La búsqueda NO escribe en la base de datos.** Ninguna tarea de este plan añade una escritura. Regla documentada en la cabecera de `src/lib/catalog/search.ts`.
- **`searchWorks` no lanza NUNCA.** Devuelve `[]` si Open Library falla, y la búsqueda se degrada al catálogo local.
- **Cine y series no se tocan.** Ni TMDB, ni `matchMovie`, ni el atajo por ISBN.
- **`resolveWorkByTitleAuthor` no se toca.**
- **Los módulos `normalize.ts` y `search-normalize.ts` son PUROS**: sin `fetch`, sin Supabase, sin `cookies()`.
- **Firma pública estable:** `searchWorks(query: string): Promise<SearchResult[]>` no cambia.
- Fixtures ya commiteados en `5e6f2daf`: `src/lib/catalog/openlibrary/__fixtures__/search-hunger-games-{es,en}.json` y `search-en-llamas-{es,en}.json`, 40 docs cada uno. **No los regeneres**: los recuentos de este plan están medidos contra ESAS capturas, y Open Library deriva de un día para otro.
- Vitest 4 **no** admite la firma `test(nombre, fn, {options})`. Usa `vi.mock` (que se iza) y no `vi.doMock`.
- Idioma del código y los comentarios: español, como el resto de `src/lib/catalog/openlibrary/`.
- Ejecutar los tests con Node 22: `fnm use 22` antes de `npx vitest run`.

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `src/lib/catalog/openlibrary/normalize.ts` | Bibliografías (sin cambios de lógica). Pasa a exportar `isOmnibus`. | 1 |
| `src/lib/catalog/openlibrary/search-normalize.ts` | **Nuevo.** Puro. Tipo del doc, `mapWorkDoc` y las siete reglas de búsqueda. | 1, 2 |
| `src/lib/catalog/openlibrary/search-normalize.test.ts` | **Nuevo.** Tests del anterior, sintéticos y contra fixtures. | 1, 2 |
| `src/lib/catalog/openlibrary/work-search.ts` | Red: dos pasadas, degradación. | 3 |
| `src/lib/catalog/openlibrary/work-search.test.ts` | Pierde los tests de `mapWorkDoc` (se mudan) y gana los de las dos pasadas. | 1, 3 |
| `src/lib/catalog/types.ts` | `SearchResult.altTitles?: string[]` | 4 |
| `src/lib/import/match-row.ts` | Casa contra los títulos alternativos. | 4 |
| `src/lib/import/match-row.test.ts` | Test del caso «En llamas». | 4 |
| `docs/requirements/decisiones.md` | Entrada al final. | 5 |

---

### Task 1: Mudar `mapWorkDoc` y abrir `isOmnibus`

Tarea mecánica y sin cambio de comportamiento: deja el sitio preparado para la Task 2 y el repo compilando.

**Files:**
- Create: `src/lib/catalog/openlibrary/search-normalize.ts`
- Create: `src/lib/catalog/openlibrary/search-normalize.test.ts`
- Modify: `src/lib/catalog/openlibrary/normalize.ts` (línea 104, `function isOmnibus`)
- Modify: `src/lib/catalog/openlibrary/work-search.ts` (líneas 18-53 y 75)
- Modify: `src/lib/catalog/openlibrary/work-search.test.ts` (líneas 1-40)

**Interfaces:**
- Consumes: `buildCoverUrl(coverId?: number): string | null` de `./covers`; `SearchResult` de `../types`.
- Produces:
  - `export type OpenLibrarySearchDoc` (en `search-normalize.ts`) — el doc de `search.json` con los campos de idioma y ediciones.
  - `export function mapWorkDoc(doc: OpenLibrarySearchDoc): SearchResult` (mudada desde `work-search.ts`, **sin cambiar su cuerpo**).
  - `export function isOmnibus(titles: string[]): boolean` (en `normalize.ts`, antes privada).

- [ ] **Step 1: Exportar `isOmnibus`**

En `src/lib/catalog/openlibrary/normalize.ts`, cambia la declaración (está sobre la línea 104):

```ts
export function isOmnibus(titles: string[]): boolean {
```

El cuerpo no se toca. `normalizeAuthorWorks` la sigue usando igual.

- [ ] **Step 2: Crear `search-normalize.ts` con el tipo y `mapWorkDoc`**

Crea `src/lib/catalog/openlibrary/search-normalize.ts`:

```ts
import type { SearchResult } from "../types";
import { buildCoverUrl } from "./covers";

// Normalización de los RESULTADOS DE BÚSQUEDA de Open Library.
//
// Hermano de `normalize.ts` (bibliografías), no una rama suya. Las reglas se
// llaman igual pero el mecanismo no es el mismo, y la causa es una sola:
// `editions.docs[0]` de search.json NO es «la mejor edición de la obra», es la
// edición que mejor casa con la CONSULTA. Con `author_key` la consulta es el
// autor y cada obra saca su propia edición; con `q=` la consulta es un título
// y contamina la elección — toda la serie recibe la edición que se llama como
// lo que escribiste. Medido: `q="hunger games"` le pone a Mockingjay
// (OL14908941W) y a Fatta Eld (OL36410330W) la edición «The Hunger Games», y
// la desduplicación de la bibliografía las borraría a las dos.
//
// Ver docs/superpowers/specs/2026-08-14-normalizar-busqueda-openlibrary-design.md
// Este módulo es PURO: no toca red ni base de datos.

/** Un doc de `search.json` pedido con `language` y `editions.title`. */
export type OpenLibrarySearchDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  /**
   * Claves de autor, alineadas con `author_name`. Es identidad, no texto: la
   * usa la resolución de autores para no tener que adivinar quién es quién.
   */
  author_key?: string[];
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
  /** Idiomas de TODAS las ediciones de la obra. Es el filtro de inclusión. */
  language?: string[];
  /** Solo la mejor edición según el `lang` pedido — y según la CONSULTA. */
  editions?: { docs?: Array<{ title?: string; language?: string[] }> };
};

export function mapWorkDoc(doc: OpenLibrarySearchDoc): SearchResult {
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
```

- [ ] **Step 3: Mudar los tests de `mapWorkDoc`**

Crea `src/lib/catalog/openlibrary/search-normalize.test.ts` con los dos tests que hoy viven en `work-search.test.ts` (líneas 4-40), **idénticos salvo el import**:

```ts
import { describe, expect, it } from "vitest";
import { mapWorkDoc } from "./search-normalize";

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

- [ ] **Step 4: Quitar `mapWorkDoc` y su tipo de `work-search.ts`**

En `src/lib/catalog/openlibrary/work-search.ts`:
- borra `export type OpenLibraryWorkDoc = {...}` (líneas 18-29) y `export function mapWorkDoc` (41-53);
- importa lo mudado y renombra el tipo en `WorkSearchResponse`:

```ts
import { mapWorkDoc, type OpenLibrarySearchDoc } from "./search-normalize";

type WorkSearchResponse = {
  docs?: OpenLibrarySearchDoc[];
};
```

El resto del fichero no cambia en esta tarea. `buildCoverUrl` ya no se usa allí: quita también ese import si el linter lo marca.

- [ ] **Step 5: Quitar el `describe("mapWorkDoc")` de `work-search.test.ts`**

Borra las líneas 4-40 (el bloque entero) y deja el import como `import { resolveWorkByTitleAuthor } from "./work-search";`.

- [ ] **Step 6: Comprobar que no hay cambio de comportamiento**

```bash
fnm use 22
npx vitest run src/lib/catalog/openlibrary
npx tsc --noEmit
npx eslint src/lib/catalog
```

Esperado: todos los tests del directorio en verde (los dos de `mapWorkDoc` ahora bajo `search-normalize.test.ts`), `tsc` con código de salida 0, eslint limpio.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog/openlibrary/search-normalize.ts src/lib/catalog/openlibrary/search-normalize.test.ts src/lib/catalog/openlibrary/normalize.ts src/lib/catalog/openlibrary/work-search.ts src/lib/catalog/openlibrary/work-search.test.ts
git commit -m "refactor(catalogo): mueve mapWorkDoc a search-normalize y exporta isOmnibus"
```

---

### Task 2: Las siete reglas — `normalizeSearchWorks`

El corazón del cambio. TDD: cada regla entra con su test.

**Files:**
- Modify: `src/lib/catalog/openlibrary/search-normalize.ts`
- Modify: `src/lib/catalog/openlibrary/search-normalize.test.ts`

**Interfaces:**
- Consumes: `acceptEditionTitle(workTitle: string, editionTitle: string | undefined, editionLanguages: string[] | undefined, want: "spa" | "eng"): string | null`, `normalizeTitleForComparison(value: string): string` e `isOmnibus(titles: string[]): boolean`, todas de `./normalize`. `mapWorkDoc` y `OpenLibrarySearchDoc` de la Task 1.
- Produces: `export function normalizeSearchWorks(docsEs: OpenLibrarySearchDoc[], docsEn: OpenLibrarySearchDoc[]): SearchResult[]` — devuelve como mucho 20 resultados, cada uno con `title` ya elegido y `altTitles` relleno.

- [ ] **Step 1: Escribir los tests sintéticos de la guarda de colisión**

Añade a `src/lib/catalog/openlibrary/search-normalize.test.ts`:

```ts
import { normalizeSearchWorks } from "./search-normalize";

// Un doc mínimo con edición: `language` en la obra para pasar el filtro de
// idioma, y una sola edición con su título y su idioma.
function doc(
  key: string,
  title: string,
  editionTitle: string,
  editionLang: string,
  editionCount = 1
) {
  return {
    key,
    title,
    edition_count: editionCount,
    language: ["eng", "spa"],
    editions: { docs: [{ title: editionTitle, language: [editionLang] }] },
  };
}

describe("normalizeSearchWorks · guarda de colisión", () => {
  it("anula un título de edición que reclaman dos obras distintas", () => {
    // Caso real de q="hunger games": search.json le da a Mockingjay y a Fatta
    // Eld la edición «The Hunger Games», porque es la que casa con la consulta.
    const results = normalizeSearchWorks(
      [],
      [
        doc("/works/OL1W", "Mockingjay", "The Hunger Games", "eng", 98),
        doc("/works/OL2W", "Fatta Eld", "The Hunger Games", "eng", 116),
      ]
    );

    expect(results.map((r) => r.title)).toEqual(["Mockingjay", "Fatta Eld"]);
    expect(results.map((r) => r.externalId)).toEqual(["/works/OL1W", "/works/OL2W"]);
  });

  it("acepta el título de edición cuando lo reclama una sola obra", () => {
    const results = normalizeSearchWorks(
      [doc("/works/OL2W", "Fatta Eld", "En llamas", "spa", 116)],
      []
    );

    expect(results[0].title).toBe("En llamas");
    expect(results[0].altTitles).toEqual(["Fatta Eld", "En llamas"]);
  });
});
```

- [ ] **Step 2: Escribir los tests sintéticos de idioma, omnibus y desduplicación**

Añade al mismo fichero:

```ts
describe("normalizeSearchWorks · idioma, omnibus y desduplicación", () => {
  it("descarta la obra sin ninguna edición en español ni inglés", () => {
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "Dena sutan", language: ["eus"], edition_count: 3 },
        { key: "/works/OL2W", title: "Dune", language: ["eng"], edition_count: 312 },
      ]
    );

    expect(results.map((r) => r.externalId)).toEqual(["/works/OL2W"]);
  });

  it("descarta la obra sin campo `language`", () => {
    const results = normalizeSearchWorks([], [{ key: "/works/OL1W", title: "Fantasma" }]);

    expect(results).toEqual([]);
  });

  it("descarta un estuche por su título de obra", () => {
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "The Hunger Games Trilogy", language: ["eng"] },
        { key: "/works/OL2W", title: "Mockingjay", language: ["eng"] },
      ]
    );

    expect(results.map((r) => r.externalId)).toEqual(["/works/OL2W"]);
  });

  it("NO descarta una obra por un título de edición envenenado que sea un estuche", () => {
    // Si el omnibus se evaluara antes de la guarda, esta edición —que casa con
    // la consulta y la reclaman dos obras— se llevaría por delante dos libros.
    const results = normalizeSearchWorks(
      [],
      [
        doc("/works/OL1W", "Mockingjay", "The Hunger Games Trilogy", "eng", 98),
        doc("/works/OL2W", "Fatta Eld", "The Hunger Games Trilogy", "eng", 116),
      ]
    );

    expect(results.map((r) => r.title)).toEqual(["Mockingjay", "Fatta Eld"]);
  });

  it("funde dos registros con el mismo título de OBRA y deja el de más ediciones", () => {
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "The Hunger Games", language: ["eng"], edition_count: 5 },
        { key: "/works/OL2W", title: "The Hunger games", language: ["eng"], edition_count: 142 },
      ]
    );

    expect(results).toHaveLength(1);
    expect(results[0].externalId).toBe("/works/OL2W");
  });

  it("NO funde dos obras que solo comparten un título de edición", () => {
    // Aquí la guarda NO salta —solo una obra reclama «The Hunger Games» como
    // título de edición—, así que Mockingjay se MUESTRA como «The Hunger
    // Games». La regla de la bibliografía cruzaría los conjuntos de títulos y
    // la borraría; la de búsqueda compara SOLO el título de obra, que sigue
    // siendo «Mockingjay», y las deja pasar a las dos.
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "The Hunger Games", language: ["eng"], edition_count: 142 },
        doc("/works/OL3W", "Mockingjay", "The Hunger Games", "eng", 98),
      ]
    );

    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({ externalId: "/works/OL3W", title: "The Hunger Games" });
  });

  it("descarta docs sin key o sin título y recorta a 20 resultados", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      key: `/works/OL${i}W`,
      title: `Obra ${i}`,
      language: ["eng"],
      edition_count: 1,
    }));

    const results = normalizeSearchWorks(
      [],
      [{ title: "Sin key", language: ["eng"] }, { key: "/works/OLXW", language: ["eng"] }, ...many]
    );

    expect(results).toHaveLength(20);
    expect(results[0].externalId).toBe("/works/OL0W");
  });
});
```

- [ ] **Step 3: Verificar que fallan**

```bash
fnm use 22
npx vitest run src/lib/catalog/openlibrary/search-normalize.test.ts
```

Esperado: FAIL con `normalizeSearchWorks is not a function` (o el error de import de Vitest equivalente).

- [ ] **Step 4: Implementar `normalizeSearchWorks`**

Añade al final de `src/lib/catalog/openlibrary/search-normalize.ts`:

```ts
import { acceptEditionTitle, isOmnibus, normalizeTitleForComparison } from "./normalize";

const MAX_RESULTS = 20;

type Merged = {
  doc: OpenLibrarySearchDoc;
  order: number;
  es: string | null;
  en: string | null;
};

/**
 * Las siete reglas, en el orden en que las aplica el cuerpo de la función:
 * 1. Juntar. 2. Guarda de colisión. 3. Idioma. 4. Omnibus. 5. Título.
 * 6. Desduplicar por título de obra. 7. Recortar.
 *
 * Recibe los `docs` de las dos pasadas de `search.json` (`lang=es` y `lang=en`)
 * sobre la MISMA consulta.
 */
export function normalizeSearchWorks(
  docsEs: OpenLibrarySearchDoc[],
  docsEn: OpenLibrarySearchDoc[]
): SearchResult[] {
  // 1. Juntar las dos pasadas por clave de obra. El orden lo marca la pasada
  //    española; las obras que solo aparecen en la inglesa van detrás. En
  //    búsqueda ese orden es RELEVANCIA (no se pide `sort`), y es el que se
  //    devuelve al final.
  const merged = new Map<string, Merged>();
  for (const [docs, want] of [
    [docsEs, "spa"],
    [docsEn, "eng"],
  ] as const) {
    for (const doc of docs) {
      if (!doc.key || !doc.title) continue;
      const entry = merged.get(doc.key) ?? { doc, order: merged.size, es: null, en: null };
      const edition = doc.editions?.docs?.[0];
      const accepted = acceptEditionTitle(doc.title, edition?.title, edition?.language, want);
      if (accepted) {
        if (want === "spa") entry.es = accepted;
        else entry.en = accepted;
      }
      merged.set(doc.key, entry);
    }
  }

  // 2. Guarda de colisión. Un título de edición que reclaman DOS obras
  //    distintas no es el título de ninguna: es la edición que casa con la
  //    consulta. Se anula para todas. Sin esto, `q="hunger games"` le pone
  //    «The Hunger Games» a Mockingjay y a Fatta Eld, y el paso 6 —o peor, la
  //    regla de la bibliografía— las borra.
  const owners = new Map<string, Set<string>>();
  for (const [key, entry] of merged) {
    for (const title of [entry.es, entry.en]) {
      if (!title) continue;
      const normalized = normalizeTitleForComparison(title);
      if (!normalized) continue;
      const set = owners.get(normalized) ?? new Set<string>();
      set.add(key);
      owners.set(normalized, set);
    }
  }
  for (const entry of merged.values()) {
    if (entry.es && (owners.get(normalizeTitleForComparison(entry.es))?.size ?? 0) > 1) {
      entry.es = null;
    }
    if (entry.en && (owners.get(normalizeTitleForComparison(entry.en))?.size ?? 0) > 1) {
      entry.en = null;
    }
  }

  const candidates: Array<{
    result: SearchResult;
    workTitle: string;
    editions: number;
    order: number;
  }> = [];

  for (const entry of merged.values()) {
    const { doc } = entry;
    const workTitle = doc.title as string;

    // 3. Idioma: fuera lo que no tenga ninguna edición en español ni inglés, y
    //    fuera también lo que no traiga `language` en absoluto (Open Library lo
    //    omite en ~1 de cada 10 docs, y admitirlos readmite las traducciones
    //    sueltas que este filtro existe para quitar).
    const languages = doc.language ?? [];
    if (!languages.includes("spa") && !languages.includes("eng")) continue;

    // Los títulos candidatos, sin los envenenados: el paso 4 mira estos, no los
    // originales. Un estuche que casa con la consulta no puede tumbar una obra.
    const allTitles = [workTitle, entry.es, entry.en].filter(
      (title): title is string => typeof title === "string" && title.length > 0
    );

    // 4. Omnibus.
    if (isOmnibus(allTitles)) continue;

    // 5. Título: español, si no inglés, si no el de la obra.
    const title = entry.es ?? entry.en ?? workTitle;

    candidates.push({
      result: { ...mapWorkDoc(doc), title, altTitles: allTitles },
      workTitle,
      editions: typeof doc.edition_count === "number" ? doc.edition_count : 0,
      order: entry.order,
    });
  }

  // 6. Desduplicar por título de OBRA solamente. Los títulos de edición NO
  //    cruzan: son los que la consulta contamina. Esto funde los registros
  //    repetidos de la misma obra y deja en paz a sus hermanos de saga.
  //    Sobrevive la de más ediciones.
  const survivors: typeof candidates = [];
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) => b.editions - a.editions)) {
    const key = normalizeTitleForComparison(candidate.workTitle);
    // Un título que normaliza a la cadena vacía («!!!», «—») casaría con el de
    // cualquier otra obra en el mismo caso y las fundiría: no desduplica.
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    survivors.push(candidate);
  }

  // 7. Recortar, en el orden de relevancia del paso 1.
  return survivors
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_RESULTS)
    .map((candidate) => candidate.result);
}
```

Mueve el `import { acceptEditionTitle, ... } from "./normalize";` arriba con los demás imports del fichero.

- [ ] **Step 5: Verificar que pasan los sintéticos**

```bash
npx vitest run src/lib/catalog/openlibrary/search-normalize.test.ts
```

Esperado: PASS, 9 tests + los 2 de `mapWorkDoc`.

- [ ] **Step 6: Escribir los tests contra los fixtures reales**

Los recuentos están MEDIDOS contra los fixtures commiteados en `5e6f2daf`. Si alguno no cuadra, **no toques el número: escala el desajuste**, porque significa que la implementación se desvía del diseño.

```ts
import searchHungerGamesEs from "./__fixtures__/search-hunger-games-es.json";
import searchHungerGamesEn from "./__fixtures__/search-hunger-games-en.json";
import searchEnLlamasEs from "./__fixtures__/search-en-llamas-es.json";
import searchEnLlamasEn from "./__fixtures__/search-en-llamas-en.json";

describe("normalizeSearchWorks · fixtures reales", () => {
  it("q='hunger games': 40 docs por pasada dan 20 resultados", () => {
    const results = normalizeSearchWorks(
      searchHungerGamesEs.docs,
      searchHungerGamesEn.docs
    );

    expect(results).toHaveLength(20);
  });

  it("q='hunger games': Mockingjay y Catching Fire SIGUEN en la lista", () => {
    // La regresión que definió el diseño: con la desduplicación de la
    // bibliografía, estas dos obras desaparecen porque search.json les pone la
    // edición «The Hunger Games».
    const results = normalizeSearchWorks(
      searchHungerGamesEs.docs,
      searchHungerGamesEn.docs
    );

    expect(results[1]).toMatchObject({
      externalId: "/works/OL14908941W",
      title: "Mockingjay",
    });
    expect(results[2]).toMatchObject({
      externalId: "/works/OL36410330W",
      title: "Fatta Eld",
    });
  });

  it("q='hunger games': los registros repetidos de la obra se funden en uno", () => {
    const results = normalizeSearchWorks(
      searchHungerGamesEs.docs,
      searchHungerGamesEn.docs
    );

    expect(results[0].externalId).toBe("/works/OL5735363W");
    expect(results.filter((r) => r.title === "The Hunger Games")).toHaveLength(1);
  });

  it("q='en llamas': la MISMA obra sale con su título español", () => {
    // OL36410330W es «Fatta Eld» buscando «hunger games» y «En llamas»
    // buscando «en llamas»: la edición que search.json saca depende de la
    // consulta. Aquí la guarda no salta porque nadie más reclama ese título.
    const results = normalizeSearchWorks(searchEnLlamasEs.docs, searchEnLlamasEn.docs);

    const catchingFire = results.find((r) => r.externalId === "/works/OL36410330W");
    expect(catchingFire?.title).toBe("En llamas");
    expect(catchingFire?.altTitles).toContain("Fatta Eld");
  });

  it("q='en llamas': 40 docs por pasada dan 20 resultados", () => {
    const results = normalizeSearchWorks(searchEnLlamasEs.docs, searchEnLlamasEn.docs);

    expect(results).toHaveLength(20);
  });
});
```

- [ ] **Step 7: Verificar el directorio entero**

```bash
npx vitest run src/lib/catalog/openlibrary
npx tsc --noEmit
npx eslint src/lib/catalog
```

Esperado: todo en verde, `tsc` 0, eslint limpio.

- [ ] **Step 8: Commit**

```bash
git add src/lib/catalog/openlibrary/search-normalize.ts src/lib/catalog/openlibrary/search-normalize.test.ts
git commit -m "feat(catalogo): normalizador de los resultados de busqueda de Open Library"
```

---

### Task 3: `searchWorks` con dos pasadas

**Files:**
- Modify: `src/lib/catalog/openlibrary/work-search.ts` (constantes y `searchWorks`)
- Modify: `src/lib/catalog/openlibrary/work-search.test.ts`

**Interfaces:**
- Consumes: `normalizeSearchWorks(docsEs, docsEn): SearchResult[]` de la Task 2.
- Produces: `searchWorks(query: string): Promise<SearchResult[]>` — **misma firma**, ahora dos peticiones HTTP en paralelo.

- [ ] **Step 1: Escribir los tests**

En `src/lib/catalog/openlibrary/work-search.test.ts`, añade (el fichero ya tiene su `afterEach(() => vi.unstubAllGlobals())`):

```ts
import { searchWorks } from "./work-search";

function respondWith(byLang: Record<string, unknown[]>) {
  return vi.fn().mockImplementation((url: URL | string) => {
    const lang = new URL(String(url)).searchParams.get("lang") ?? "";
    return Promise.resolve({ ok: true, json: async () => ({ docs: byLang[lang] ?? [] }) });
  });
}

describe("searchWorks", () => {
  it("hace DOS pasadas, es e inglés, con 40 y sin sort", async () => {
    const fetchMock = respondWith({ es: [], en: [] });
    vi.stubGlobal("fetch", fetchMock);

    await searchWorks("dune");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("lang=es"))).toBe(true);
    expect(urls.some((u) => u.includes("lang=en"))).toBe(true);
    for (const url of urls) {
      expect(url).toContain("limit=40");
      expect(url).toContain("editions.title");
      expect(url).toContain("language");
      expect(url).not.toContain("sort=");
    }
  });

  it("con una sola pasada vacía devuelve lo normalizado de la otra", async () => {
    // Divergencia deliberada con la bibliografía: allí media respuesta se
    // ESCRIBE y quedaría congelada, aquí no se escribe nada, así que media
    // respuesta es mejor que ninguna.
    vi.stubGlobal(
      "fetch",
      respondWith({
        es: [],
        en: [{ key: "/works/OL893415W", title: "Dune", language: ["eng"], edition_count: 312 }],
      })
    );

    const results = await searchWorks("dune");

    expect(results).toHaveLength(1);
    expect(results[0].externalId).toBe("/works/OL893415W");
  });

  it("con la API caída o la consulta vacía devuelve [] sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(searchWorks("dune")).resolves.toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(searchWorks("dune")).resolves.toEqual([]);

    const fetchMock = respondWith({ es: [], en: [] });
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchWorks("   ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

```bash
npx vitest run src/lib/catalog/openlibrary/work-search.test.ts
```

Esperado: FAIL — `expect(fetchMock).toHaveBeenCalledTimes(2)` recibe 1.

- [ ] **Step 3: Implementar las dos pasadas**

En `src/lib/catalog/openlibrary/work-search.ts`, sustituye las constantes y `searchWorks`:

```ts
// `mapWorkDoc` deja de usarse aquí: ahora lo llama el normalizador.
import { normalizeSearchWorks, type OpenLibrarySearchDoc } from "./search-normalize";

const SEARCH_FIELDS =
  "key,title,author_name,author_key,cover_i,first_publish_year,edition_count,language,editions,editions.title,editions.language";
const REVALIDATE_SECONDS = 3600;
// 40 por pasada y recorte a 20: las reglas del normalizador se comen cerca de
// la mitad de los docs (medido: 40 -> 20 en las cuatro consultas de prueba),
// y pidiendo 20 la lista salía más corta que la de hoy.
const SEARCH_LIMIT = 40;
const FETCH_TIMEOUT_MS = 5000;

async function fetchSearchPass(
  query: string,
  lang: "es" | "en"
): Promise<OpenLibrarySearchDoc[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("fields", SEARCH_FIELDS);
  // Sin `sort`: en una búsqueda manda la relevancia de Open Library. La
  // bibliografía sí pide `sort=readinglog`, que aquí sería un orden ajeno a lo
  // que el usuario ha escrito.
  url.searchParams.set("lang", lang);

  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`search.json ${lang}: ${res.status}`);

  const data: WorkSearchResponse = await res.json();
  return data.docs ?? [];
}

// Nunca lanza: si OpenLibrary falla o tarda, la búsqueda se degrada a lo que
// haya en el catálogo local (ver search.ts).
export async function searchWorks(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    // En paralelo: son independientes, así la búsqueda no espera el doble.
    const [docsEs, docsEn] = await Promise.all([
      fetchSearchPass(trimmed, "es"),
      fetchSearchPass(trimmed, "en"),
    ]);
    return normalizeSearchWorks(docsEs, docsEn);
  } catch {
    return [];
  }
}
```

`resolveWorkByTitleAuthor` y su bloque de comentarios se quedan exactamente como están, y siguen usando `WorkSearchResponse` y `normalizeTitleForComparison`.

- [ ] **Step 4: Verificar que pasan**

```bash
npx vitest run src/lib/catalog/openlibrary
npx tsc --noEmit
```

Esperado: verde, `tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary/work-search.ts src/lib/catalog/openlibrary/work-search.test.ts
git commit -m "feat(catalogo): la busqueda de libros pide dos pasadas de idioma y las normaliza"
```

---

### Task 4: `altTitles` y el importador de CSV

Aquí se cierra el fallo concreto: una fila «En llamas» que hoy no casa.

**Files:**
- Modify: `src/lib/catalog/types.ts:44` (dentro de `SearchResult`)
- Modify: `src/lib/import/match-row.ts:46-50`
- Modify: `src/lib/import/match-row.test.ts`

**Interfaces:**
- Consumes: `SearchResult` de `@/lib/catalog/types`; `isSameTitle(a: string, b: string): boolean` de `@/lib/catalog/title-match`; `searchWorks` de la Task 3.
- Produces: `SearchResult.altTitles?: string[]`.

- [ ] **Step 1: Añadir el campo al tipo**

En `src/lib/catalog/types.ts`, antes del cierre de `SearchResult` (tras `matchedIsbn`):

```ts
  // Libros, solo desde la búsqueda de Open Library: los títulos candidatos de
  // la obra (el del work, y los de sus mejores ediciones en español e inglés).
  // El importador de CSV compara contra TODOS, igual que `matchMovie` compara
  // contra `title`/`originalTitle`/`englishTitle`: la fila «En llamas» tiene
  // que casar con el work que Open Library titula «Fatta Eld». Opcional — el
  // catálogo local, el lookup por ISBN y TMDB no lo rellenan.
  altTitles?: string[];
```

- [ ] **Step 2: Escribir el test del importador**

`src/lib/import/match-row.test.ts` hoy solo cubre CINE, y no mockea las dos fuentes de libros. Hay que añadir sus mocks. **Van con `vi.mock`, que se iza — nunca `vi.doMock`**, que no se iza y dejaría el módulo real cargado (ya pasó en esta rama).

Junto a los `vi.mock` que ya hay en la cabecera del fichero (líneas 10-20):

```ts
vi.mock("@/lib/catalog/openlibrary/work-search", () => ({
  searchWorks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/catalog/openlibrary/isbn-lookup", () => ({
  lookupIsbn: vi.fn().mockResolvedValue(null),
}));
```

Añade los imports que piden esos mocks, junto a los que ya existen arriba:

```ts
import { searchWorks } from "@/lib/catalog/openlibrary/work-search";
import type { SearchResult } from "@/lib/catalog/types";
```

Y al final del fichero, el bloque nuevo. `bookRow` replica el `movieRow` que ya está en el fichero (líneas 36-51), cambiando solo lo que distingue una fila de libro:

```ts
const bookRow = (over: Partial<ImportRow> = {}): ImportRow => ({
  rowNumber: 1,
  title: "En llamas",
  author: "Suzanne Collins",
  isbn: null,
  publisher: null,
  pageCount: null,
  year: null,
  status: "completed",
  rating: null,
  bookFormat: null,
  diaryDates: [],
  unknownStatusLabel: null,
  ...over,
});

describe("matchBook: los títulos alternativos de una obra", () => {
  beforeEach(() => {
    vi.mocked(searchLocalCatalog).mockResolvedValue([]);
  });

  it("casa una fila cuyo título coincide con un altTitle, no con el mostrado", async () => {
    // El work OL36410330W se llama «Fatta Eld» en Open Library. Sin los títulos
    // alternativos, esta fila de un CSV español se quedaba sin casar.
    const work: SearchResult = {
      itemType: "book",
      externalId: "/works/OL36410330W",
      title: "Fatta Eld",
      altTitles: ["Fatta Eld", "En llamas"],
      subtitle: "Suzanne Collins",
      coverUrl: null,
      year: 2009,
      synopsis: null,
      genres: null,
    };
    vi.mocked(searchWorks).mockResolvedValue([work]);

    expect(await matchImportRow(client, "book", bookRow())).toEqual({
      kind: "matched",
      catalogId: "created-id",
    });
  });

  it("sigue sin casar cuando no coincide ningún título", async () => {
    vi.mocked(searchWorks).mockResolvedValue([
      {
        itemType: "book",
        externalId: "/works/OL5735363W",
        title: "The Hunger Games",
        altTitles: ["The Hunger Games", "Los juegos del hambre"],
        subtitle: "Suzanne Collins",
        coverUrl: null,
        year: 2008,
        synopsis: null,
        genres: null,
      },
    ]);

    expect(await matchImportRow(client, "book", bookRow())).toEqual({ kind: "unmatched" });
  });
});
```

`client` y `searchLocalCatalog` ya están definidos en el fichero (líneas 21 y 53); no los redeclares.

- [ ] **Step 3: Verificar que falla**

```bash
npx vitest run src/lib/import/match-row.test.ts
```

Esperado: FAIL — devuelve `{ kind: "unmatched" }`, porque `isSameTitle("Fatta Eld", "En llamas")` es falso.

- [ ] **Step 4: Comparar contra todos los títulos**

En `src/lib/import/match-row.ts`, sustituye las líneas 46-47:

```ts
  // Un libro tiene hasta TRES títulos que nos pueden llegar: el del work de
  // Open Library —que es arbitrario: OL36410330W se llama «Fatta Eld»— y los
  // de sus mejores ediciones en español y en inglés. Comparar solo contra el
  // mostrado dejaba sin casar toda fila española cuyo work esté titulado en
  // otro idioma. Mismo patrón que `matchMovie` con sus tres títulos.
  const apiTitleResults = await searchWorks(row.title);
  const apiTitleMatch = apiTitleResults.find((r) =>
    [r.title, ...(r.altTitles ?? [])].some((title) => isSameTitle(title, row.title))
  );
```

- [ ] **Step 5: Verificar que pasa**

```bash
npx vitest run src/lib/import
npx tsc --noEmit
npx eslint src/lib
```

Esperado: verde, `tsc` 0, eslint limpio.

- [ ] **Step 6: Suite completa**

```bash
npx vitest run
```

Esperado: 177 ficheros en verde. Cualquier fallo en `src/lib/catalog/search.test.ts` o en los e2e por el número de resultados hay que mirarlo, no silenciarlo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog/types.ts src/lib/import/match-row.ts src/lib/import/match-row.test.ts
git commit -m "fix(importar): una fila en español casa aunque el work de Open Library se titule en otro idioma"
```

---

### Task 5: Documentación e issues

**Files:**
- Modify: `docs/requirements/decisiones.md` (append al final, **sin reescribir nada anterior**)

- [ ] **Step 1: Añadir la entrada de decisión**

Al FINAL de `docs/requirements/decisiones.md`, siguiendo el formato de las entradas que ya hay:

```markdown
## La búsqueda de libros tiene su propio normalizador, no el de las bibliografías

`editions.docs[0]` de `search.json` no es «la mejor edición de la obra»: es la edición que
mejor casa con la CONSULTA. Con `author_key` la consulta es el autor y cada obra saca su
propia edición; con `q=` es un título y contamina toda la serie. Medido: `q="hunger games"`
le pone la edición «The Hunger Games» a Mockingjay (`OL14908941W`) y a Catching Fire
(`OL36410330W`), y reutilizar la desduplicación de `normalize.ts` borraba los dos de los
resultados — no se podían ni añadir.

De ahí dos reglas propias en `search-normalize.ts`: una **guarda de colisión** (un título de
edición reclamado por dos obras se anula para las dos) y **desduplicación solo por título de
obra**. Idioma y omnibus se reutilizan tal cual, porque leen campos que la consulta no toca.

Se acepta que la búsqueda esconda estuches y traducciones sueltas, igual que la bibliografía.
Lo que NO se acepta es esconder un libro por confundirlo con su hermano de saga.

Spec: `docs/superpowers/specs/2026-08-14-normalizar-busqueda-openlibrary-design.md`.
```

- [ ] **Step 2: Abrir las issues de los límites asumidos**

Cuatro issues, cada una con sus tres etiquetas en el mismo comando (ver AGENTS.md). Escribe cada cuerpo a un fichero temporal y pásalo con `--body-file`, para no pelearse con las comillas en PowerShell:

```sh
gh issue create --label "area:catalogo,tipo:deuda,P2" --title "La guarda de colisión no detecta un título de edición envenenado que reclama una sola obra" --body-file body-1.md
gh issue create --label "area:catalogo,tipo:deuda,P2" --title "Los patrones de omnibus son ingleses: «Estuche…» pasa el filtro" --body-file body-2.md
gh issue create --label "area:catalogo,tipo:deuda,P2" --title "Los libros ya guardados conservan su título crudo en la búsqueda" --body-file body-3.md
gh issue create --label "area:catalogo,tipo:deuda,P3" --title "resolveWorkByTitleAuthor no casa contra títulos de edición" --body-file body-4.md
```

Los ficheros temporales van fuera del repo y se borran después. Cada cuerpo, escrito para quien lo lea dentro de seis meses sin contexto: qué falla y qué se esperaba, cómo reproducirlo, qué SÍ funciona, y la sección «Límites asumidos» del spec como origen. El contenido concreto de cada uno:

1. **Envenenamiento de un solo dueño** — reproducible con `q="dune"`: la obra `Hunter's Moon & Other American Gothic Tales` se muestra como `Hunters of Dune`. La guarda solo dispara con dos o más reclamantes. Lo que SÍ funciona: el caso de dos reclamantes (`q="hunger games"`). Por qué no hay guarda barata: exigir que el título de edición comparta una palabra con el de la obra rompería «Fatta Eld» → «En llamas», que es correcto.
2. **Patrones de omnibus ingleses** — reproducible con `q="el señor de los anillos"`: sobreviven dos resultados que empiezan por «Estuche». Los ocho patrones están en `OMNIBUS_PATTERNS`, `src/lib/catalog/openlibrary/normalize.ts`. Añadir «estuche» cambia también el comportamiento de las bibliografías, por eso no entró aquí.
3. **Títulos ya guardados** — `mergeByExternalId` (`src/lib/catalog/merge-results.ts`) da preferencia a lo local, y `find-or-create.ts` solo escribe `title` en el INSERT. Un libro creado antes de este cambio sigue saliendo como «Fatta Eld». La alternativa —mostrar el título de la API sobre una fila local— daría dos nombres al mismo libro entre la búsqueda y su ficha. Va junto con la limpieza de los 112 libros basura de dev.
4. **`resolveWorkByTitleAuthor`** — pide `limit=1` y sin ediciones, así que su `titleMatches` compara contra el título crudo del work. Una obra titulada en sueco no casa aunque la fila esté en español. Es la ruta de hidratación, no la de búsqueda.

- [ ] **Step 3: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): por que la busqueda tiene su propio normalizador"
```

---

## Verificación final de la rama

```bash
fnm use 22
npx vitest run
npx tsc --noEmit
npx eslint .
```

Y una comprobación manual contra la app, con el dev server en el puerto 3000 (**uno solo**, ver AGENTS.md):

1. Buscar «hunger games» → salen `The Hunger Games`, `Mockingjay` y `Fatta Eld`, y **un solo** «The Hunger Games».
2. Buscar «en llamas» → sale un resultado titulado **`En llamas`**.
3. Importar un CSV con una fila `En llamas` → casa, no cae en «sin match».
