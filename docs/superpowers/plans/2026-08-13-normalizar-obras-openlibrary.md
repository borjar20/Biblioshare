# Normalizar las listas de obras de Open Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la bibliografía de una ficha de autor deje de volcar basura en el catálogo: obras únicas, con año, portada y título en español cuando exista.

**Architecture:** Se cambia el endpoint de origen —`/authors/<key>/works.json`, un volcado en crudo, por dos pasadas de `search.json` (`lang=es` y `lang=en`)— y se mete entre medias un módulo puro `normalize.ts` que aplica cinco reglas: título por preferencia de idioma con regla de contención, filtro de idioma, descarte de omnibus por título, desduplicación por intersección de títulos candidatos, y orden de Open Library. La única función con red envuelve al normalizador; `hydratePersonCredits` pasa a rellenar año y portada, que hoy tira.

**Tech Stack:** TypeScript, Next.js (App Router), Vitest, Open Library REST.

**Spec:** `docs/superpowers/specs/2026-08-13-normalizar-obras-openlibrary-design.md`

## Global Constraints

- **Node 22 obligatorio.** El shell arranca en v20 y rompe Vitest. Antes de cualquier `npm`/`npx`: `fnm use 22`, y comprobar con `node -v` → `v22.x`. Usa la herramienta Bash (Git Bash), no PowerShell.
- **Identificadores en INGLÉS, comentarios en CASTELLANO.** La spec nombra las piezas en castellano (`normalizarObras`, `ObraNormalizada`); todo el código del repo usa identificadores ingleses (`pickDisplayName`, `mapWorkDoc`, `fetchWorkAuthorKeys`). Este plan sigue la convención del repo. **No es una desviación del diseño**, solo de su redacción.
- **Formato de claves, tal como ya están en la BD:** `books.openlibrary_work_key` guarda la forma **larga** (`/works/OL893414W`); `people.openlibrary_key` guarda la **corta** (`OL22161A`). No cambiar ninguna.
- **Ninguna función de red lanza.** Devuelve `[]`/`null` ante fallo o timeout, con `AbortSignal.timeout(5000)` y `next: { revalidate: 86400 }`. Es el contrato de todo `src/lib/catalog/openlibrary/`.
- **`use cache`:** este trabajo no añade ni modifica ninguno. Si algún paso te tienta a poner uno, pára y pregunta (regla #437 de `AGENTS.md`).
- **Sin cambios de esquema.** Ni tablas, ni columnas, ni RLS, ni migraciones. `data-model.md` no se toca.
- **`npm run lint` sobre todo el repo sale con 12 errores PREEXISTENTES** en ficheros que esta rama no toca. No los arregles; lint solo las rutas que toques.

---

### Task 1: Fixtures reales y elección de título

**Files:**
- Create: `src/lib/catalog/openlibrary/__fixtures__/collins-es.json`
- Create: `src/lib/catalog/openlibrary/__fixtures__/collins-en.json`
- Create: `src/lib/catalog/openlibrary/__fixtures__/shusterman-es.json`
- Create: `src/lib/catalog/openlibrary/__fixtures__/shusterman-en.json`
- Create: `src/lib/catalog/openlibrary/normalize.ts`
- Create: `src/lib/catalog/openlibrary/normalize.test.ts`
- Modify: `src/lib/catalog/openlibrary/work-search.ts:80-90` (borrar la copia privada de `normalizeTitleForComparison` e importarla)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  ```ts
  export type OpenLibraryAuthorWorkDoc = {
    key?: string;
    title?: string;
    cover_i?: number;
    first_publish_year?: number;
    edition_count?: number;
    language?: string[];
    editions?: { docs?: Array<{ title?: string; language?: string[] }> };
  };
  export function normalizeTitleForComparison(value: string): string;
  export function acceptEditionTitle(
    workTitle: string,
    editionTitle: string | undefined,
    editionLanguages: string[] | undefined,
    want: "spa" | "eng"
  ): string | null;
  ```

- [ ] **Step 1: Capturar los fixtures**

Son respuestas reales de Open Library. Cápturalas con estos cuatro comandos exactos, desde la raíz del worktree:

```bash
curl -s "https://openlibrary.org/search.json?author_key=OL1394359A&fields=key,title,cover_i,first_publish_year,edition_count,language,editions,editions.title,editions.language&limit=100&sort=readinglog&lang=es" -o src/lib/catalog/openlibrary/__fixtures__/collins-es.json
curl -s "https://openlibrary.org/search.json?author_key=OL1394359A&fields=key,title,cover_i,first_publish_year,edition_count,language,editions,editions.title,editions.language&limit=100&sort=readinglog&lang=en" -o src/lib/catalog/openlibrary/__fixtures__/collins-en.json
curl -s "https://openlibrary.org/search.json?author_key=OL234454A&fields=key,title,cover_i,first_publish_year,edition_count,language,editions,editions.title,editions.language&limit=100&sort=readinglog&lang=es" -o src/lib/catalog/openlibrary/__fixtures__/shusterman-es.json
curl -s "https://openlibrary.org/search.json?author_key=OL234454A&fields=key,title,cover_i,first_publish_year,edition_count,language,editions,editions.title,editions.language&limit=100&sort=readinglog&lang=en" -o src/lib/catalog/openlibrary/__fixtures__/shusterman-en.json
```

Comprueba que los cuatro traen datos y no un error:

```bash
node -e "for (const f of ['collins-es','collins-en','shusterman-es','shusterman-en']) { const d = require('./src/lib/catalog/openlibrary/__fixtures__/'+f+'.json'); console.log(f, 'numFound=', d.numFound, 'docs=', (d.docs||[]).length); }"
```

Expected: `collins-* numFound= 25 docs= 25` y `shusterman-* numFound= 86 docs= 86`.

⚠️ Si los números difieren de esos, **pára y dilo en tu informe**: Open Library ha cambiado desde el 2026-08-13 y los recuentos que este plan da como esperados en la Task 2 ya no valen. No ajustes los tests a ojo sin avisar.

- [ ] **Step 2: Write the failing test**

Crea `src/lib/catalog/openlibrary/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { acceptEditionTitle, normalizeTitleForComparison } from "./normalize";

describe("normalizeTitleForComparison", () => {
  it("iguala mayúsculas, acentos y puntuación", () => {
    expect(normalizeTitleForComparison("Duckling ugly")).toBe(
      normalizeTitleForComparison("Duckling Ugly")
    );
    expect(normalizeTitleForComparison("It's O.K. to say no!")).toBe(
      normalizeTitleForComparison("It's Ok to Say No!")
    );
    expect(normalizeTitleForComparison("En llamas")).toBe(
      normalizeTitleForComparison("  EN  LLAMAS  ")
    );
  });

  it("no confunde dos títulos distintos de la misma saga", () => {
    expect(normalizeTitleForComparison("Fundación")).not.toBe(
      normalizeTitleForComparison("Fundación e Imperio")
    );
  });
});

describe("acceptEditionTitle", () => {
  it("acepta el título de la edición en el idioma pedido", () => {
    expect(acceptEditionTitle("Fatta Eld", "En llamas", ["spa"], "spa")).toBe("En llamas");
  });

  it("rechaza una edición en otro idioma aunque venga primera", () => {
    // `lang=es` devuelve la MEJOR edición disponible, no necesariamente en
    // español: sin esta comprobación se cuelan títulos en alemán y turco, que
    // son peores que el título inglés de la obra.
    expect(
      acceptEditionTitle("Gregor and the Marks of Secret", "Gregor Und Der Fluch DES Unterlandes", ["ger"], "spa")
    ).toBeNull();
  });

  it("rechaza un título de edición que pierde información respecto al de la obra", () => {
    // El work «Gregor and the Code of Claw» no puede quedarse en «Gregor».
    expect(acceptEditionTitle("Gregor and the Code of Claw", "Gregor", ["eng"], "eng")).toBeNull();
  });

  it("acepta un título más largo o distinto, aunque comparta prefijo", () => {
    expect(acceptEditionTitle("Gregor", "Gregor the Overlander", ["eng"], "eng")).toBe(
      "Gregor the Overlander"
    );
    expect(acceptEditionTitle("The Hunger Games", "Los juegos del hambre", ["spa"], "spa")).toBe(
      "Los juegos del hambre"
    );
  });

  it("tolera edición ausente o sin idiomas", () => {
    expect(acceptEditionTitle("Scythe", undefined, ["spa"], "spa")).toBeNull();
    expect(acceptEditionTitle("Scythe", "Siega", undefined, "spa")).toBeNull();
    expect(acceptEditionTitle("Scythe", "", ["spa"], "spa")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```
fnm use 22
npx vitest run src/lib/catalog/openlibrary/normalize.test.ts
```

Expected: FAIL — `Failed to resolve import "./normalize"`.

- [ ] **Step 4: Write minimal implementation**

Crea `src/lib/catalog/openlibrary/normalize.ts`:

```ts
import { buildCoverUrl } from "./covers";

// Normalización de las LISTAS de obras de un autor.
//
// Por qué existe: la bibliografía salía de /authors/<key>/works.json, un
// volcado en crudo sin orden, sin edition_count y con fecha de publicación en
// menos de la mitad de las entradas. De ahí salían 84 «libros» de Neal
// Shusterman con 83 sin año, tres registros del mismo `Dread locks`, estuches y
// obras fantasma sin ninguna edición.
//
// La misma fuente, pedida por search.json, trae año, portada, idiomas y
// conteo de ediciones — y con `editions.title` + `lang=es`, el título ya
// traducido, sin llamadas extra. Este módulo es PURO: recibe los `docs` de las
// dos pasadas y no toca red ni base de datos.

/** Un doc de `search.json` pedido con `editions.title` y `editions.language`. */
export type OpenLibraryAuthorWorkDoc = {
  key?: string;
  title?: string;
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
  /** Idiomas de TODAS las ediciones de la obra. Es el filtro de inclusión. */
  language?: string[];
  /** Solo la mejor edición según el `lang` pedido. */
  editions?: { docs?: Array<{ title?: string; language?: string[] }> };
};

// Normaliza un título para COMPARAR, nunca para mostrar: minúsculas, sin
// marcas diacríticas y solo letras/dígitos. Deja «Duckling ugly» y «Duckling
// Ugly» iguales, y «It's O.K. to say no» igual que «It's Ok to Say No», que es
// justo la tolerancia que hace falta para reconocer dos registros del mismo
// libro. No iguala «Fundación» con «Fundación e Imperio».
export function normalizeTitleForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Decide si el título de una edición sirve para mostrarse en vez del de la obra.
 *
 * Dos razones para decir que no, y las dos vienen de casos reales:
 * 1. El idioma. `lang=es` devuelve la mejor edición DISPONIBLE, no una en
 *    español: sin comprobarlo se cuela «Gregor Und Der Fluch DES Unterlandes».
 * 2. La pérdida de información. El work «Gregor and the Code of Claw» tiene una
 *    edición titulada «Gregor» a secas; quedarse con ella empeora la ficha.
 */
export function acceptEditionTitle(
  workTitle: string,
  editionTitle: string | undefined,
  editionLanguages: string[] | undefined,
  want: "spa" | "eng"
): string | null {
  if (!editionTitle) return null;
  if (!(editionLanguages ?? []).includes(want)) return null;

  const work = normalizeTitleForComparison(workTitle);
  const edition = normalizeTitleForComparison(editionTitle);
  if (!edition) return null;
  if (edition.length < work.length && work.includes(edition)) return null;

  return editionTitle;
}
```

- [ ] **Step 5: Run test to verify it passes**

```
npx vitest run src/lib/catalog/openlibrary/normalize.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Quitar la copia privada de `work-search.ts`**

`src/lib/catalog/openlibrary/work-search.ts` tiene su propia `normalizeTitleForComparison` (líneas 80-90), idéntica. Bórrala y añade el import al principio del fichero:

```ts
import { normalizeTitleForComparison } from "./normalize";
```

⚠️ El import va en esa dirección y **solo** en esa: `normalize.ts` no debe importar nada de `work-search.ts`, o se crea un ciclo.

- [ ] **Step 7: Verificar que no se rompió la búsqueda**

```
npx vitest run src/lib/catalog/openlibrary
npx tsc --noEmit
```

Expected: todo verde, incluidos los tests de `resolveWorkByTitleAuthor`, que usan esa función a través de `titleMatches`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/catalog/openlibrary/__fixtures__ src/lib/catalog/openlibrary/normalize.ts src/lib/catalog/openlibrary/normalize.test.ts src/lib/catalog/openlibrary/work-search.ts
git commit -m "feat(openlibrary): eleccion de titulo de obra por preferencia de idioma"
```

---

### Task 2: La tubería completa de normalización

**Files:**
- Modify: `src/lib/catalog/openlibrary/normalize.ts` (añadir al final)
- Modify: `src/lib/catalog/openlibrary/normalize.test.ts` (añadir describes)

**Interfaces:**
- Consumes: `OpenLibraryAuthorWorkDoc`, `normalizeTitleForComparison`, `acceptEditionTitle` (Task 1); `buildCoverUrl` de `./covers`.
- Produces:
  ```ts
  export type NormalizedWork = {
    /** "/works/OL5735363W" — el formato que guarda `books.openlibrary_work_key`. */
    workKey: string;
    title: string;
    year: number | null;
    coverUrl: string | null;
  };
  export function normalizeAuthorWorks(
    docsEs: OpenLibraryAuthorWorkDoc[],
    docsEn: OpenLibraryAuthorWorkDoc[]
  ): NormalizedWork[];
  ```

- [ ] **Step 1: Write the failing test**

Añade a `src/lib/catalog/openlibrary/normalize.test.ts`. Cambia primero la línea del import para incluir lo nuevo:

```ts
import { acceptEditionTitle, normalizeAuthorWorks, normalizeTitleForComparison } from "./normalize";
import collinsEs from "./__fixtures__/collins-es.json";
import collinsEn from "./__fixtures__/collins-en.json";
import shustermanEs from "./__fixtures__/shusterman-es.json";
import shustermanEn from "./__fixtures__/shusterman-en.json";
```

y añade al final del fichero:

```ts
// Los fixtures son respuestas REALES capturadas el 2026-08-13. Al estar
// congelados, estos recuentos son estables aunque Open Library cambie.
const collins = normalizeAuthorWorks(collinsEs.docs, collinsEn.docs);
const shusterman = normalizeAuthorWorks(shustermanEs.docs, shustermanEn.docs);
const titulos = (obras: { title: string }[]) => obras.map((o) => o.title);

describe("normalizeAuthorWorks · recuentos", () => {
  it("Collins pasa de 25 entradas crudas a 14 obras", () => {
    expect(collinsEs.docs).toHaveLength(25);
    expect(collins).toHaveLength(14);
  });

  it("Shusterman pasa de 86 entradas crudas a 68 obras", () => {
    expect(shustermanEs.docs).toHaveLength(86);
    expect(shusterman).toHaveLength(68);
  });

  it("sin `collection` entre los patrones, sobrevive «The Unwind Collection»", () => {
    // El precio exacto de haber quitado ese patrón: es el único estuche que
    // pasa el filtro en las 111 obras probadas. Se documenta aquí para que la
    // próxima persona no lo lea como un fallo.
    expect(titulos(shusterman)).toContain("The Unwind Collection");
  });

  it("todas las obras salen con año, que es el fallo que originó esto", () => {
    // En dev, 83 de los 84 «libros» de Shusterman no tenían año.
    expect(collins.every((o) => o.year !== null)).toBe(true);
    expect(shusterman.every((o) => o.year !== null)).toBe(true);
  });
});

describe("normalizeAuthorWorks · título", () => {
  it("usa el título español de la edición, no el arbitrario de la obra", () => {
    // El work OL36410330W se titula «Fatta Eld» (sueco) y tiene 116 ediciones,
    // de las que solo 2 son suecas y 7 españolas, tituladas «En llamas».
    expect(titulos(collins)).toContain("En llamas");
    expect(titulos(collins)).not.toContain("Fatta Eld");
    expect(titulos(collins)).toContain("Los juegos del hambre");
    expect(titulos(collins)).toContain("Sinsajo");
  });

  it("no trunca un título cuando la edición pierde información", () => {
    expect(titulos(collins)).toContain("Gregor and the Code of Claw");
    expect(titulos(collins)).not.toContain("Gregor");
  });
});

describe("normalizeAuthorWorks · filtros", () => {
  it("descarta las obras sin edición en español ni inglés", () => {
    // «Dena sutan» es Catching Fire en euskera, con tres registros de obra.
    expect(titulos(collins).some((t) => t.includes("Dena sutan"))).toBe(false);
  });

  it("descarta estuches y omnibus", () => {
    for (const basura of [
      "Gregor the Overlander Box Set",
      "Hunger Games 5-Book Box Set",
      "The Underland Chronicles 5 Volume Set",
    ]) {
      expect(titulos(collins)).not.toContain(basura);
    }
    expect(titulos(collins).some((t) => t.toLowerCase().includes("trilog"))).toBe(false);
  });

  it("NO usa un umbral de ediciones: una novedad con una sola edición sobrevive", () => {
    // `Sunrise on the Reaping` tenía 1 edición y es una novela real de 2025.
    // Se fusiona con `Amanecer de la Cosecha`, que tiene 11.
    expect(titulos(collins)).toContain("Amanecer de la Cosecha");
  });
});

describe("normalizeAuthorWorks · desduplicación", () => {
  it("fusiona dos registros del mismo libro en idiomas distintos", () => {
    // «Amanecer de la Cosecha» y «Sunrise on the Reaping» son el mismo libro en
    // dos works: sus conjuntos de títulos candidatos se cruzan por el inglés.
    expect(titulos(collins).filter((t) => t.toLowerCase().includes("reaping"))).toHaveLength(0);
    expect(titulos(collins).filter((t) => t === "Amanecer de la Cosecha")).toHaveLength(1);
  });

  it("fusiona los registros repetidos de Shusterman", () => {
    // `Dread locks` estaba tres veces y `Duckling ugly` dos.
    const repetidos = titulos(shusterman).filter((t) => /dread locks/i.test(t));
    expect(repetidos).toHaveLength(1);
  });

  it("no fusiona dos libros distintos de una misma saga", () => {
    const clave = titulos(shusterman).filter((t) => /^Everlost$|^Everwild$|^Everfound$/.test(t));
    expect(clave.length).toBeGreaterThanOrEqual(2);
  });

  it("no deja dos obras con la misma work key", () => {
    const keys = collins.map((o) => o.workKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("normalizeAuthorWorks · bordes", () => {
  it("con listas vacías devuelve lista vacía", () => {
    expect(normalizeAuthorWorks([], [])).toEqual([]);
  });

  it("descarta docs sin key o sin título", () => {
    expect(
      normalizeAuthorWorks(
        [{ title: "Sin key", language: ["eng"] }, { key: "/works/OL1W", language: ["eng"] }],
        []
      )
    ).toEqual([]);
  });

  it("un libro real llamado «Omnibus» cae — falso positivo asumido", () => {
    expect(
      normalizeAuthorWorks(
        [{ key: "/works/OL9W", title: "Omnibus", language: ["eng"], edition_count: 3 }],
        []
      )
    ).toEqual([]);
  });

  it("respeta el orden de Open Library, no el alfabético", () => {
    expect(collins[0].title).toBe("Los juegos del hambre");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/catalog/openlibrary/normalize.test.ts
```

Expected: FAIL — `normalizeAuthorWorks is not a function`.

Si además falla el import de los `.json`, añade `"resolveJsonModule": true` a `compilerOptions` de `tsconfig.json` (Vitest lo respeta) y vuelve a correr.

- [ ] **Step 3: Write minimal implementation**

Añade al final de `src/lib/catalog/openlibrary/normalize.ts`:

```ts
export type NormalizedWork = {
  /** "/works/OL5735363W" — el formato que guarda `books.openlibrary_work_key`. */
  workKey: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
};

// Estuches y recopilaciones. Se comparan contra el título en minúsculas y sin
// acentos, y contra TODOS los títulos candidatos de la obra —no solo el
// elegido—, porque el work titulado «Gregor» solo se delata por su edición
// «The Underland Chronicles 5 Volume Set».
//
// `collection` NO está en la lista a propósito: es el único patrón con riesgo
// real de tragarse un libro legítimo. Los siete que quedan son inequívocos, y
// el precio asumido es que un libro que se llame «Omnibus» caería.
const OMNIBUS_PATTERNS = [
  "box set",
  "boxed set",
  "trilogy",
  "trilogia",
  "tetralogia",
  "volume set",
  "complete series",
  "omnibus",
];

// Minúsculas y sin acentos, PERO conservando espacios: los patrones de arriba
// son frases, no palabras pegadas.
function looseTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function isOmnibus(titles: string[]): boolean {
  return titles.some((title) => {
    const loose = looseTitle(title);
    if (OMNIBUS_PATTERNS.some((pattern) => loose.includes(pattern))) return true;
    // «The Hunger Games / Catching Fire / Mockingjay / …»: tres o más obras
    // listadas en el mismo título.
    return title.split(" / ").filter(Boolean).length >= 3;
  });
}

type Merged = {
  doc: OpenLibraryAuthorWorkDoc;
  order: number;
  es: string | null;
  en: string | null;
};

/**
 * Las cinco reglas, en orden. Recibe los `docs` de las dos pasadas de
 * `search.json` (`lang=es` y `lang=en`) y devuelve obras únicas y presentables.
 */
export function normalizeAuthorWorks(
  docsEs: OpenLibraryAuthorWorkDoc[],
  docsEn: OpenLibraryAuthorWorkDoc[]
): NormalizedWork[] {
  // 1. Juntar las dos pasadas por clave de obra. El orden lo marca la pasada
  //    española; las obras que solo aparecen en la inglesa van detrás.
  const merged = new Map<string, Merged>();
  for (const [docs, want] of [
    [docsEs, "spa"],
    [docsEn, "eng"],
  ] as const) {
    for (const doc of docs) {
      if (!doc.key || !doc.title) continue;
      const entry =
        merged.get(doc.key) ?? { doc, order: merged.size, es: null, en: null };
      const edition = doc.editions?.docs?.[0];
      const accepted = acceptEditionTitle(doc.title, edition?.title, edition?.language, want);
      if (accepted) {
        if (want === "spa") entry.es = accepted;
        else entry.en = accepted;
      }
      merged.set(doc.key, entry);
    }
  }

  const candidates: Array<{ work: NormalizedWork; titles: Set<string>; editions: number; order: number }> = [];

  for (const entry of merged.values()) {
    const { doc } = entry;
    const workTitle = doc.title as string;

    // 3. Idioma: fuera lo que no tenga ninguna edición en español ni inglés.
    //    Se lleva los tres «Dena sutan» en euskera y los registros fantasma,
    //    que no traen idiomas porque no tienen ediciones.
    const languages = doc.language ?? [];
    if (!languages.includes("spa") && !languages.includes("eng")) continue;

    const allTitles = [workTitle, entry.es, entry.en].filter(
      (title): title is string => typeof title === "string" && title.length > 0
    );

    // 4. Omnibus.
    if (isOmnibus(allTitles)) continue;

    // 2. Título: español, si no inglés, si no el de la obra.
    const title = entry.es ?? entry.en ?? workTitle;

    candidates.push({
      work: {
        workKey: doc.key as string,
        title,
        year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
        coverUrl: buildCoverUrl(doc.cover_i),
      },
      titles: new Set(allTitles.map(normalizeTitleForComparison)),
      editions: typeof doc.edition_count === "number" ? doc.edition_count : 0,
      order: entry.order,
    });
  }

  // 5. Desduplicar. Dos obras son la misma si sus conjuntos de títulos se
  //    cruzan — es lo que une «Fatta Eld» con «Catching Fire» y «Amanecer de la
  //    Cosecha» con «Sunrise on the Reaping», que no comparten idioma pero sí
  //    un título candidato. Sobrevive la de más ediciones, y HEREDA los títulos
  //    de la fusionada para que una tercera también case.
  const survivors: typeof candidates = [];
  for (const candidate of [...candidates].sort((a, b) => b.editions - a.editions)) {
    const twin = survivors.find((s) => [...candidate.titles].some((t) => s.titles.has(t)));
    if (twin) {
      for (const t of candidate.titles) twin.titles.add(t);
      continue;
    }
    survivors.push(candidate);
  }

  // 6. Orden: el de Open Library (`sort=readinglog`, por popularidad), no el de
  //    la desduplicación ni el alfabético.
  return survivors.sort((a, b) => a.order - b.order).map((s) => s.work);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run src/lib/catalog/openlibrary/normalize.test.ts
```

Expected: PASS, 21 tests.

⚠️ Si los recuentos de 14 y 68 no salen, **no toques los números del test para que pase**. Imprime la lista y averigua qué regla sobra o falta:

```bash
npx tsx -e "import('./src/lib/catalog/openlibrary/normalize.ts').then(async (m) => { const es = require('./src/lib/catalog/openlibrary/__fixtures__/collins-es.json'); const en = require('./src/lib/catalog/openlibrary/__fixtures__/collins-en.json'); console.log(m.normalizeAuthorWorks(es.docs, en.docs).map(o => o.year + ' ' + o.title).join('\n')); })"
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary/normalize.ts src/lib/catalog/openlibrary/normalize.test.ts
git commit -m "feat(openlibrary): obras unicas, filtradas y tituladas por idioma"
```

---

### Task 3: La llamada, y el entierro del endpoint viejo

**Files:**
- Create: `src/lib/catalog/openlibrary/author-books.ts`
- Create: `src/lib/catalog/openlibrary/author-books.test.ts`
- Delete: `src/lib/catalog/openlibrary/author-works.ts`
- Delete: `src/lib/catalog/openlibrary/author-works.test.ts`

**Interfaces:**
- Consumes: `normalizeAuthorWorks`, `NormalizedWork`, `OpenLibraryAuthorWorkDoc` (Task 2).
- Produces:
  ```ts
  export async function fetchAuthorWorks(authorKey: string): Promise<NormalizedWork[]>;
  ```
  `getAuthorWorks` y el tipo `AuthorWork` dejan de existir.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/catalog/openlibrary/author-books.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAuthorWorks } from "./author-books";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubTwoPasses(esDocs: unknown[], enDocs: unknown[]) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const docs = url.includes("lang=es") ? esDocs : enDocs;
    return { ok: true, json: async () => ({ docs }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("fetchAuthorWorks", () => {
  it("hace las DOS pasadas de idioma y normaliza el resultado", async () => {
    const { calls } = stubTwoPasses(
      [
        {
          key: "/works/OL1W",
          title: "The Hunger Games",
          language: ["eng", "spa"],
          edition_count: 142,
          first_publish_year: 2008,
          cover_i: 111,
          editions: { docs: [{ title: "Los juegos del hambre", language: ["spa"] }] },
        },
      ],
      [
        {
          key: "/works/OL1W",
          title: "The Hunger Games",
          language: ["eng", "spa"],
          edition_count: 142,
          first_publish_year: 2008,
          cover_i: 111,
          editions: { docs: [{ title: "The Hunger Games", language: ["eng"] }] },
        },
      ]
    );

    const obras = await fetchAuthorWorks("OL1394359A");

    expect(calls).toHaveLength(2);
    expect(calls.some((u) => u.includes("lang=es"))).toBe(true);
    expect(calls.some((u) => u.includes("lang=en"))).toBe(true);
    expect(calls.every((u) => u.includes("author_key=OL1394359A"))).toBe(true);
    expect(calls.every((u) => u.includes("editions.title"))).toBe(true);
    expect(obras).toEqual([
      {
        workKey: "/works/OL1W",
        title: "Los juegos del hambre",
        year: 2008,
        coverUrl: "https://covers.openlibrary.org/b/id/111-M.jpg",
      },
    ]);
  });

  it("acepta la clave larga y la corta", async () => {
    const { calls } = stubTwoPasses([], []);
    await fetchAuthorWorks("/authors/OL234454A");
    expect(calls.every((u) => u.includes("author_key=OL234454A"))).toBe(true);
  });

  it("con clave vacía no toca la red", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAuthorWorks("")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si una de las dos pasadas falla, devuelve lista vacía sin lanzar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        String(input).includes("lang=es")
          ? { ok: true, json: async () => ({ docs: [] }) }
          : { ok: false, json: async () => ({}) }
      )
    );
    await expect(fetchAuthorWorks("OL1A")).resolves.toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(fetchAuthorWorks("OL1A")).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/catalog/openlibrary/author-books.test.ts
```

Expected: FAIL — `Failed to resolve import "./author-books"`.

- [ ] **Step 3: Write minimal implementation**

Crea `src/lib/catalog/openlibrary/author-books.ts`:

```ts
import { normalizeAuthorWorks, type NormalizedWork, type OpenLibraryAuthorWorkDoc } from "./normalize";

// La bibliografía de un autor, en DOS llamadas a search.json.
//
// Sustituye a /authors/<key>/works.json, que era un volcado en crudo: sin
// orden, sin edition_count y con fecha en menos de la mitad de las entradas.
// search.json trae año, portada, idiomas y conteo, y con `editions.title` +
// `lang` devuelve además el título de la mejor edición en ese idioma — de ahí
// que hagan falta dos pasadas y no una: la española da «En llamas» y la
// inglesa da «Catching Fire», y tener las dos es lo que permite reconocer que
// dos registros distintos son el mismo libro.
//
// LÍMITE ASUMIDO: `limit=100` y sin paginar. Un autor con más de cien obras se
// queda con las cien más populares, que es mejor que las mil sin ordenar que
// traía el endpoint anterior.

const SEARCH_FIELDS =
  "key,title,cover_i,first_publish_year,edition_count,language,editions,editions.title,editions.language";
const WORKS_LIMIT = 100;
const REVALIDATE_SECONDS = 86400;
const FETCH_TIMEOUT_MS = 5000;

type SearchResponse = { docs?: OpenLibraryAuthorWorkDoc[] };

// Acepta "OL1A" y "/authors/OL1A": `people.openlibrary_key` guarda la forma
// corta, pero no cuesta nada tolerar la larga.
function normalizeAuthorKey(key: string): string {
  return key.trim().replace(/^\/?authors\//, "");
}

async function fetchPass(authorKey: string, lang: "es" | "en"): Promise<OpenLibraryAuthorWorkDoc[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("author_key", authorKey);
  url.searchParams.set("fields", SEARCH_FIELDS);
  url.searchParams.set("limit", String(WORKS_LIMIT));
  url.searchParams.set("sort", "readinglog");
  url.searchParams.set("lang", lang);

  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`search.json ${lang}: ${res.status}`);

  const data: SearchResponse = await res.json();
  return data.docs ?? [];
}

// Nunca lanza: [] significa «no se pudo saber», y la ficha se degrada a lo que
// haya en la base de datos.
export async function fetchAuthorWorks(authorKey: string): Promise<NormalizedWork[]> {
  const key = normalizeAuthorKey(authorKey ?? "");
  if (!key) return [];

  try {
    // En paralelo: son independientes y así la ficha no espera el doble.
    const [docsEs, docsEn] = await Promise.all([fetchPass(key, "es"), fetchPass(key, "en")]);
    return normalizeAuthorWorks(docsEs, docsEn);
  } catch (error) {
    console.error("fetchAuthorWorks failed", { authorKey, error });
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run src/lib/catalog/openlibrary/author-books.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Borrar el endpoint viejo**

```bash
git rm src/lib/catalog/openlibrary/author-works.ts src/lib/catalog/openlibrary/author-works.test.ts
```

`npx tsc --noEmit` fallará ahora en `src/lib/people/hydrate-person-credits.ts`, que sigue importando `getAuthorWorks`. Es lo que arregla la Task 4 — **no lo toques aquí**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/openlibrary/author-books.ts src/lib/catalog/openlibrary/author-books.test.ts src/lib/catalog/openlibrary/author-works.ts src/lib/catalog/openlibrary/author-works.test.ts
git commit -m "feat(openlibrary): bibliografia de autor por search.json en dos idiomas"
```

---

### Task 4: Dejar de tirar el año y la portada

**Files:**
- Modify: `src/lib/people/hydrate-person-credits.ts:4` (import), `:74-97` (la rama de libros)
- Test: `src/lib/people/hydrate-person-credits-books.test.ts` (nuevo)

**Interfaces:**
- Consumes: `fetchAuthorWorks` (Task 3).
- Produces: nada nuevo. `hydratePersonCredits` mantiene su firma.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/people/hydrate-person-credits-books.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydratePersonCredits } from "./hydrate-person-credits";

// Lo que se comprueba: que el año y la portada que trae la obra normalizada
// llegan al catálogo. Hasta ahora esta rama escribía `year: null` literal, y
// por eso en dev había 84 libros de Neal Shusterman con 83 sin año.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeSupabase() {
  return {
    from() {
      return {
        select() {
          return { eq: () => ({ data: [], error: null }) };
        },
        upsert: async () => ({ error: null }),
        update() {
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

describe("hydratePersonCredits · libros", () => {
  it("pasa título, año y portada de la obra normalizada al catálogo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL1W",
              title: "The Hunger Games",
              language: ["spa", "eng"],
              edition_count: 142,
              first_publish_year: 2008,
              cover_i: 111,
              editions: { docs: [{ title: "Los juegos del hambre", language: ["spa"] }] },
            },
          ],
        }),
      }))
    );

    const bulk = vi.fn(async () => new Map<string, string>());
    vi.doMock("@/lib/catalog/find-or-create", () => ({ findOrCreateCatalogItemsBulk: bulk }));

    await hydratePersonCredits(fakeSupabase() as never, {
      id: "persona-1",
      name: "Suzanne Collins",
      tmdbId: null,
      openlibraryKey: "OL1394359A",
      creditsHydratedAt: null,
    });

    expect(bulk).toHaveBeenCalled();
    const resultados = bulk.mock.calls[0][1] as Array<Record<string, unknown>>;
    expect(resultados[0]).toMatchObject({
      itemType: "book",
      externalId: "/works/OL1W",
      title: "Los juegos del hambre",
      year: 2008,
      coverUrl: "https://covers.openlibrary.org/b/id/111-M.jpg",
    });
  });

  it("sin clave de Open Library no pide nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await hydratePersonCredits(fakeSupabase() as never, {
      id: "persona-2",
      name: "Alguien",
      tmdbId: null,
      openlibraryKey: null,
      creditsHydratedAt: null,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

⚠️ Si `vi.doMock` no intercepta el import (depende de cómo esté resuelto el alias `@/`), **no reescribas la función para hacerla testeable**: simplifica el test a comprobar que el `fetch` se hizo contra `search.json` con `author_key`, y anótalo en tu informe como límite del test.

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/people/hydrate-person-credits-books.test.ts
```

Expected: FAIL — el módulo no compila, porque la Task 3 borró `getAuthorWorks` y este fichero aún lo importa.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/people/hydrate-person-credits.ts`, cambia el import de la línea 4:

```ts
import { fetchAuthorWorks } from "@/lib/catalog/openlibrary/author-books";
```

y sustituye la rama de libros (líneas 74-97) por:

```ts
    } else if (person.openlibraryKey) {
      for (const w of await fetchAuthorWorks(person.openlibraryKey)) {
        searchResults.push({
          itemType: "book",
          externalId: w.workKey,
          title: w.title,
          // `subtitle` acaba en `books.author`. Lo sabemos —es la persona cuya
          // ficha estamos hidratando—, y dejarlo a null haría nacer el libro sin
          // autor: la ficha lo mostraría vacío.
          subtitle: person.name,
          coverUrl: w.coverUrl,
          // El año viene de `first_publish_year`. Antes se escribía `null`
          // literal aquí, y de ahí salían los 83 libros sin año de Shusterman:
          // el endpoint viejo no lo daba y este sí.
          year: w.year,
          synopsis: null,
          genres: null,
        } as SearchResult);
        pending.push({
          itemType: "book",
          externalId: w.workKey,
          role: "author",
          character: null,
        });
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/lib/people src/lib/catalog/openlibrary
npx tsc --noEmit
npx eslint src/lib/people src/lib/catalog/openlibrary
```

Expected: todo verde y `tsc` sin errores — aquí es donde se cierra la rotura que dejó la Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/hydrate-person-credits.ts src/lib/people/hydrate-person-credits-books.test.ts
git commit -m "fix(people): la bibliografia de un autor ya no nace sin anio ni portada"
```

---

### Task 5: Cerrar la documentación

**Files:**
- Modify: `docs/requirements/decisiones.md` (una fila nueva **al final**; el fichero es una TABLA markdown y es append-only)

**Interfaces:** ninguna.

- [ ] **Step 1: Añadir la decisión**

Añade **al final** de la tabla de `docs/requirements/decisiones.md`, sin reescribir ninguna fila anterior:

```
| 2026-08-13 | **La bibliografía de un autor se pide a `search.json`, no al volcado de `/authors/<key>/works.json`** | El endpoint viejo no daba orden, ni `edition_count`, ni fecha en más de la mitad de las entradas: en dev metió 112 libros con el 87% sin año, estuches, tres registros del mismo `Dread locks` y obras fantasma sin ninguna edición. Producción estaba limpia porque sus libros vinieron de la búsqueda. Dos pasadas de `search.json` (`lang=es` y `lang=en`) traen año, portada, idiomas, conteo de ediciones y el título de la mejor edición en cada idioma, sin llamadas extra. Sobre eso, cinco reglas: el título sale de la edición española, si no de la inglesa, si no de la obra —descartando el de la edición cuando pierde información, para no dejar «Gregor and the Code of Claw» en «Gregor»—; fuera lo que no tenga edición en español ni inglés; fuera estuches y omnibus por título; y dos obras son la misma si sus títulos candidatos se cruzan, que es lo que une «Amanecer de la Cosecha» con «Sunrise on the Reaping» —dos works del mismo libro en idiomas distintos— y los tres registros de «Dread locks» de Shusterman entre sí. Collins pasa de 25 entradas a 14 obras y Shusterman de 86 a 68, todas con año. **Sin umbral de ediciones a propósito**: se llevaría por delante las novedades reales, que es lo que más interesa. **`collection` fuera de los patrones de omnibus**: es el único con riesgo de tragarse un libro legítimo. Medido, el precio de quitarlo es exactamente una obra en las 111 probadas —«The Unwind Collection», un estuche que ahora sobrevive—, y a cambio ningún libro real cae. Que la bibliografía deje de CREAR filas de catálogo es otro proyecto, y limpiar lo ya contaminado también. |
```

- [ ] **Step 2: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): la bibliografia de autor sale de search.json"
```
