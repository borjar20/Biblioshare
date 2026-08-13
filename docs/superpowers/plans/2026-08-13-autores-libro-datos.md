# Autores de libro: identidad por obra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar de crear autores de libro buscando su nombre suelto en Open Library, pasar a identificarlos por la clave de autor que da la obra, y limpiar con un script lo que la vía vieja ya escribió.

**Architecture:** La identidad de un autor deja de ser el texto `books.author` y pasa a ser su `openlibrary_key`, que llega o desde `search.json?fields=…,author_key` (alta y resolución) o desde `/works/<key>.json` (libros ya guardados). Una regla de escritura latina elige el nombre visible entre `name`/`personal_name`/`alternate_names` y manda el resto a una columna nueva `people.aliases`; los autores sin ninguna forma latina se descartan. Lo ya escrito lo arregla un script de Node a mano, idempotente, con `service_role`.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Supabase/PostgREST, Vitest, `npx tsx` para los scripts.

**Spec:** `docs/superpowers/specs/2026-08-13-autores-libro-datos-design.md`

## Global Constraints

- **Node 22 obligatorio.** El shell arranca en v20 y rompe Vitest. Antes de cualquier `npm`/`npx`: `fnm use 22`. Comprobar con `node -v` → `v22.x`.
- **Formato de claves, tal como ya están en la BD:** `people.openlibrary_key` guarda la forma **corta** (`OL22161A`); `books.openlibrary_work_key` guarda la forma **larga** (`/works/OL893414W`). Ver `src/lib/catalog/openlibrary/author-works.ts:20` y `:34`. No cambiar ninguna de las dos.
- **`use cache`:** este trabajo no añade ni modifica ninguno. Si algún paso te tienta a poner uno, pára y pregunta (regla #437 de `AGENTS.md`).
- **Ninguna función de red lanza.** Todo el módulo de Open Library devuelve `null`/`[]` ante fallo o timeout, con `AbortSignal.timeout(5000)` y `next: { revalidate: 86400 }`. Sigue ese patrón exacto.
- **Errores esperados que NO se registran:** `42501` (visitante anónimo sin grant de escritura) y `23505` (carrera entre renders). Cualquier otro sí va a `console.error`.
- **Comentarios en castellano**, explicando el *porqué*, como el resto de `src/lib/`.
- **Migraciones:** `supabase/migrations/`, numeración correlativa; la última es `20260852_event_reminder_default_1w.sql`. Dev (`supabase-dev`) primero, prod después.

---

### Task 1: Regla de escritura latina y elección del nombre visible

**Files:**
- Create: `src/lib/catalog/openlibrary/author-names.ts`
- Test: `src/lib/catalog/openlibrary/author-names.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export type OpenLibraryAuthorDetail = {
    name?: string;
    personal_name?: string;
    alternate_names?: string[];
  };
  export function pickDisplayName(
    detail: OpenLibraryAuthorDetail
  ): { name: string; aliases: string[] } | null;
  ```

- [ ] **Step 1: Write the failing test**

Crea `src/lib/catalog/openlibrary/author-names.test.ts`. Los tres primeros casos son respuestas **reales** de la API capturadas el 2026-08-13; no los cambies por otros inventados.

```ts
import { describe, expect, it } from "vitest";
import { pickDisplayName } from "./author-names";

describe("pickDisplayName", () => {
  it("prefiere la forma latina cuando el nombre canónico no lo es", () => {
    // /authors/OL22242A.json real
    const result = pickDisplayName({
      name: "Фёдор Достоевский",
      personal_name: "Fyodor Mikhaylovich Dostoyevsky",
      alternate_names: ["Fyodor Dostoyevsky", "Dostoievski"],
    });

    expect(result).toEqual({
      name: "Fyodor Mikhaylovich Dostoyevsky",
      aliases: ["Фёдор Достоевский", "Fyodor Dostoyevsky", "Dostoievski"],
    });
  });

  it("recorta el punto final que Open Library deja pegado", () => {
    // /authors/OL22242A real: Homero, con el punto pegado tal cual lo devuelve OL
    const result = pickDisplayName({ name: "Όμηρος", personal_name: "Homer." });

    expect(result?.name).toBe("Homer");
    expect(result?.aliases).toEqual(["Όμηρος"]);
  });

  it("descarta al autor sin ninguna forma latina", () => {
    // /authors/OL7388009A.json real: el duplicado cirílico de Frank Herbert en
    // el work de Dune. Stub sin personal_name ni alternate_names.
    expect(pickDisplayName({ name: "Френк Герберт" })).toBeNull();
  });

  it("con el canónico ya latino, no inventa alias de más", () => {
    expect(pickDisplayName({ name: "Marc Simonetti" })).toEqual({
      name: "Marc Simonetti",
      aliases: [],
    });
  });

  it("no repite el nombre visible entre los alias ni duplica grafías", () => {
    const result = pickDisplayName({
      name: "Frank Herbert",
      personal_name: "Frank Herbert",
      alternate_names: ["Frank Herbert", "Френк Герберт"],
    });

    expect(result).toEqual({ name: "Frank Herbert", aliases: ["Френк Герберт"] });
  });

  it("sin ningún candidato utilizable devuelve null", () => {
    expect(pickDisplayName({})).toBeNull();
    expect(pickDisplayName({ name: "   " })).toBeNull();
    expect(pickDisplayName({ name: "1234" })).toBeNull();
  });

  it("corta la lista de alias para no guardar ruido sin fin", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Alias ${i}`);
    const result = pickDisplayName({ name: "Autor Prolífico", alternate_names: many });

    expect(result?.aliases).toHaveLength(20);
    expect(result?.aliases[0]).toBe("Alias 0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
fnm use 22
npx vitest run src/lib/catalog/openlibrary/author-names.test.ts
```

Expected: FAIL — `Failed to resolve import "./author-names"`.

- [ ] **Step 3: Write minimal implementation**

Crea `src/lib/catalog/openlibrary/author-names.ts`:

```ts
// Qué nombre de un autor de Open Library se le enseña a quien lee la app.
//
// No es una preferencia estética. El campo `name` de /authors/<key>.json es el
// canónico de OL y NO tiene por qué ser latino: Dostoyevski es "Фёдор
// Достоевский" y Homero es "Όμηρος". Enseñar eso en una app en castellano es
// enseñar un nombre ilegible.
//
// Y hace un segundo trabajo, más importante: un work de OL puede listar DOS
// veces al mismo humano en alfabetos distintos (Dune lista OL79034A "Frank
// Herbert" y OL7388009A "Френк Герберт"). El segundo es un stub sin
// `personal_name` ni `alternate_names`, así que no tiene ninguna forma latina y
// esta función lo descarta — que es justo como se corta ese duplicado.

export type OpenLibraryAuthorDetail = {
  name?: string;
  personal_name?: string;
  alternate_names?: string[];
};

const MAX_ALIASES = 20;

// Latino = tiene letras y, al quitarle todos los caracteres de escritura
// latina, no queda ninguna letra. Los signos y espacios no cuentan.
function isLatinScript(value: string): boolean {
  if (!/\p{L}/u.test(value)) return false;
  return !/\p{L}/u.test(value.replace(/\p{Script=Latin}/gu, ""));
}

// OL deja puntos pegados al final de algunos nombres ("Homer."). Se recortan,
// salvo cuando el nombre acaba en inicial ("Philip K. D."), donde el punto es
// parte del nombre.
function tidy(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (/\s\p{L}\.$/u.test(trimmed)) return trimmed;
  return trimmed.replace(/\.+$/, "");
}

/**
 * Devuelve el nombre visible y las demás grafías conocidas, o `null` si el
 * autor no tiene ninguna forma latina (en cuyo caso NO se crea la persona ni se
 * escribe su crédito).
 */
export function pickDisplayName(
  detail: OpenLibraryAuthorDetail
): { name: string; aliases: string[] } | null {
  const candidates = [
    detail.name,
    detail.personal_name,
    ...(detail.alternate_names ?? []),
  ]
    .filter((c): c is string => typeof c === "string")
    .map(tidy)
    .filter((c) => c.length > 0);

  // Deduplicado conservando el orden: el orden ES la preferencia (name antes
  // que personal_name, y este antes que los alternate_names).
  const unique = [...new Set(candidates)];
  const display = unique.find(isLatinScript);
  if (!display) return null;

  return {
    name: display,
    aliases: unique.filter((c) => c !== display).slice(0, MAX_ALIASES),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run src/lib/catalog/openlibrary/author-names.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary/author-names.ts src/lib/catalog/openlibrary/author-names.test.ts
git commit -m "feat(openlibrary): elegir nombre visible de autor por escritura latina"
```

---

### Task 2: Autores de una obra y ficha de autor por clave

**Files:**
- Create: `src/lib/catalog/openlibrary/work-authors.ts`
- Test: `src/lib/catalog/openlibrary/work-authors.test.ts`

**Interfaces:**
- Consumes: `pickDisplayName`, `OpenLibraryAuthorDetail` (Task 1); `normalizeWorkKey` de `./work-detail`; `buildCoverUrl` **no** (las fotos de autor van por otro CDN, ver abajo).
- Produces:
  ```ts
  export type OpenLibraryAuthor = {
    key: string;          // forma corta: "OL22161A"
    name: string;
    aliases: string[];
    bio: string | null;
    photoUrl: string | null;
    birthDate: string | null;
    deathDate: string | null;
  };
  export async function fetchWorkAuthorKeys(workKey: string): Promise<string[]>;
  export async function fetchOpenLibraryAuthorByKey(key: string): Promise<OpenLibraryAuthor | null>;
  ```

- [ ] **Step 1: Write the failing test**

Crea `src/lib/catalog/openlibrary/work-authors.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWorkAuthorKeys, fetchOpenLibraryAuthorByKey } from "./work-authors";

function mockJson(payload: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => payload });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWorkAuthorKeys", () => {
  it("devuelve las claves cortas en el orden del work", async () => {
    // /works/OL8479867W.json real: Rothfuss y el ilustrador Marc Simonetti,
    // los dos con type "/type/author_role". OL no distingue el rol; por eso
    // aquí no se filtra nada.
    vi.stubGlobal(
      "fetch",
      mockJson({
        authors: [
          { author: { key: "/authors/OL2830895A" }, type: { key: "/type/author_role" } },
          { type: { key: "/type/author_role" }, author: { key: "/authors/OL9118672A" } },
        ],
      })
    );

    expect(await fetchWorkAuthorKeys("/works/OL8479867W")).toEqual([
      "OL2830895A",
      "OL9118672A",
    ]);
  });

  it("tolera entradas rotas y claves repetidas", async () => {
    vi.stubGlobal(
      "fetch",
      mockJson({
        authors: [
          { author: { key: "/authors/OL79034A" } },
          { author: {} },
          {},
          { author: { key: "/authors/OL79034A" } },
        ],
      })
    );

    expect(await fetchWorkAuthorKeys("OL893414W")).toEqual(["OL79034A"]);
  });

  it("con la obra sin autores o la API caída devuelve lista vacía", async () => {
    vi.stubGlobal("fetch", mockJson({}));
    expect(await fetchWorkAuthorKeys("OL1W")).toEqual([]);

    vi.stubGlobal("fetch", mockJson({}, false));
    expect(await fetchWorkAuthorKeys("OL1W")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await fetchWorkAuthorKeys("OL1W")).toEqual([]);

    expect(await fetchWorkAuthorKeys("")).toEqual([]);
  });
});

describe("fetchOpenLibraryAuthorByKey", () => {
  it("mapea la ficha completa, con la foto por el CDN de autores", async () => {
    vi.stubGlobal(
      "fetch",
      mockJson({
        name: "H.P. Lovecraft",
        bio: { value: "  Escritor estadounidense.  " },
        photos: [-1, 6607781],
        birth_date: "20 August 1890",
        death_date: "15 March 1937",
      })
    );

    expect(await fetchOpenLibraryAuthorByKey("/authors/OL22161A")).toEqual({
      key: "OL22161A",
      name: "H.P. Lovecraft",
      aliases: [],
      bio: "Escritor estadounidense.",
      photoUrl: "https://covers.openlibrary.org/a/id/6607781-M.jpg",
      birthDate: "20 August 1890",
      deathDate: "15 March 1937",
    });
  });

  it("descarta al autor sin forma latina", async () => {
    vi.stubGlobal("fetch", mockJson({ name: "Френк Герберт" }));
    expect(await fetchOpenLibraryAuthorByKey("OL7388009A")).toBeNull();
  });

  it("con la API caída devuelve null", async () => {
    vi.stubGlobal("fetch", mockJson({}, false));
    expect(await fetchOpenLibraryAuthorByKey("OL22161A")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await fetchOpenLibraryAuthorByKey("OL22161A")).toBeNull();

    expect(await fetchOpenLibraryAuthorByKey("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/catalog/openlibrary/work-authors.test.ts
```

Expected: FAIL — `Failed to resolve import "./work-authors"`.

- [ ] **Step 3: Write minimal implementation**

Crea `src/lib/catalog/openlibrary/work-authors.ts`:

```ts
import { normalizeWorkKey } from "./work-detail";
import { pickDisplayName, type OpenLibraryAuthorDetail } from "./author-names";

// La identidad de un autor de libro viene de la OBRA, nunca de su nombre.
//
// Lo que había antes (search/authors.json?q=<nombre> y quedarse con docs[0])
// resolvía "Frank Herbert" a un señor nacido en 1872 que no escribió Dune. La
// clave que da el work no se adivina: es identidad.
//
// LÍMITE CONOCIDO: OL marca a TODOS los autores del work con el mismo
// type "/type/author_role", así que desde aquí es imposible distinguir al autor
// del ilustrador — El nombre del viento lista a Rothfuss y a Marc Simonetti sin
// diferencia alguna. Las ediciones tampoco ayudan: `contributions` vino
// undefined en las 12 ediciones que se probaron. Asumido a propósito.

export type OpenLibraryAuthor = {
  /** Forma corta, la misma que guarda `people.openlibrary_key`: "OL22161A". */
  key: string;
  name: string;
  aliases: string[];
  bio: string | null;
  photoUrl: string | null;
  birthDate: string | null;
  deathDate: string | null;
};

type WorkAuthorsResponse = {
  authors?: Array<{ author?: { key?: string } }>;
};

type AuthorDetailResponse = OpenLibraryAuthorDetail & {
  bio?: string | { value?: string };
  photos?: number[];
  birth_date?: string;
  death_date?: string;
};

const FETCH_TIMEOUT_MS = 5000;
const REVALIDATE_SECONDS = 86400;

function normalizeAuthorKey(key: string): string {
  return key.trim().replace(/^\/?authors\//, "");
}

// Nunca lanza: [] significa "no se pudo saber", y el llamador no escribe
// créditos (mejor sin autor que con uno inventado).
export async function fetchWorkAuthorKeys(workKey: string): Promise<string[]> {
  try {
    const key = normalizeWorkKey(workKey ?? "");
    if (!key) return [];

    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: WorkAuthorsResponse = await res.json();
    const out: string[] = [];
    const seen = new Set<string>();

    for (const entry of data.authors ?? []) {
      const raw = entry?.author?.key;
      if (!raw) continue;
      const authorKey = normalizeAuthorKey(raw);
      if (!authorKey || seen.has(authorKey)) continue;
      seen.add(authorKey);
      out.push(authorKey);
    }

    return out;
  } catch {
    return [];
  }
}

// OpenLibrary devuelve `bio` unas veces como string y otras como { value }.
function parseBio(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

// Nunca lanza. `null` = no se pudo resolver O el autor no tiene ninguna grafía
// latina; en ambos casos el llamador lo omite.
export async function fetchOpenLibraryAuthorByKey(
  key: string
): Promise<OpenLibraryAuthor | null> {
  try {
    const authorKey = normalizeAuthorKey(key ?? "");
    if (!authorKey) return null;

    const res = await fetch(`https://openlibrary.org/authors/${authorKey}.json`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const detail: AuthorDetailResponse = await res.json();
    const picked = pickDisplayName(detail);
    if (!picked) return null;

    // Las fotos de autor NO van por el CDN de portadas de libro (/b/id/), sino
    // por /a/id/ — por eso esto no usa buildCoverUrl.
    const photoId = detail.photos?.find((id) => id > 0);

    return {
      key: authorKey,
      name: picked.name,
      aliases: picked.aliases,
      bio: parseBio(detail.bio),
      photoUrl: photoId ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg` : null,
      birthDate: detail.birth_date ?? null,
      deathDate: detail.death_date ?? null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run src/lib/catalog/openlibrary/work-authors.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary/work-authors.ts src/lib/catalog/openlibrary/work-authors.test.ts
git commit -m "feat(openlibrary): resolver autores de un libro por la clave de la obra"
```

---

### Task 3: La búsqueda de obras devuelve también la clave de autor

**Files:**
- Modify: `src/lib/catalog/openlibrary/work-search.ts:17-30` (tipo y `SEARCH_FIELDS`), y añadir función al final
- Test: `src/lib/catalog/openlibrary/work-search.test.ts` (añadir describe)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  ```ts
  export type OpenLibraryWorkDoc = { /* … */ author_key?: string[] };
  export type ResolvedWork = { workKey: string; authorKeys: string[] };
  export async function resolveWorkByTitleAuthor(
    title: string,
    author: string | null
  ): Promise<ResolvedWork | null>;
  ```

- [ ] **Step 1: Write the failing test**

Añade al final de `src/lib/catalog/openlibrary/work-search.test.ts`:

```ts
import { afterEach, vi } from "vitest";
import { resolveWorkByTitleAuthor } from "./work-search";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveWorkByTitleAuthor", () => {
  it("devuelve la obra y sus claves de autor del primer resultado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL893414W",
              title: "Dune",
              author_name: ["Frank Herbert"],
              author_key: ["OL79034A"],
            },
          ],
        }),
      })
    );

    expect(await resolveWorkByTitleAuthor("Dune", "Frank Herbert")).toEqual({
      workKey: "/works/OL893414W",
      authorKeys: ["OL79034A"],
    });
  });

  it("pide el título y el autor por separado, no en una sola cadena", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await resolveWorkByTitleAuthor("Dune", "Frank Herbert");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("title=Dune");
    expect(url).toContain("author=Frank+Herbert");
    expect(url).toContain("author_key");
  });

  it("sin resultados, sin título, o con la API caída devuelve null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
    expect(await resolveWorkByTitleAuthor("Nada de nada", null)).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await resolveWorkByTitleAuthor("Dune", null)).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await resolveWorkByTitleAuthor("Dune", null)).toBeNull();

    expect(await resolveWorkByTitleAuthor("   ", null)).toBeNull();
  });

  it("descarta un doc sin key aunque venga primero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [{ title: "Dune" }, { key: "/works/OL893414W", title: "Dune", author_key: [] }],
        }),
      })
    );

    expect(await resolveWorkByTitleAuthor("Dune", null)).toEqual({
      workKey: "/works/OL893414W",
      authorKeys: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/catalog/openlibrary/work-search.test.ts
```

Expected: FAIL — `resolveWorkByTitleAuthor is not a function` / no exportada.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/catalog/openlibrary/work-search.ts`, añade `author_key` al tipo:

```ts
export type OpenLibraryWorkDoc = {
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
};
```

y a los campos pedidos:

```ts
const SEARCH_FIELDS =
  "key,title,author_name,author_key,cover_i,first_publish_year,edition_count";
```

`mapWorkDoc` no cambia: la tarjeta de resultado sigue enseñando solo el nombre.

Al final del fichero:

```ts
// Resolución de la OBRA para un libro que no guardó su work key (alta manual,
// import de CSV, ISBN que no resolvió). Se pide título y autor por separado
// —no concatenados en `q`— porque los campos dedicados de OL puntúan mucho
// mejor que la cadena libre, y de ahí sale además `author_key`: la identidad
// del autor, gratis y sin una segunda llamada.
export type ResolvedWork = { workKey: string; authorKeys: string[] };

export async function resolveWorkByTitleAuthor(
  title: string,
  author: string | null
): Promise<ResolvedWork | null> {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) return null;

  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("title", trimmedTitle);
    if (author?.trim()) url.searchParams.set("author", author.trim());
    url.searchParams.set("limit", "1");
    url.searchParams.set("fields", "key,title,author_name,author_key");

    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data: WorkSearchResponse = await res.json();
    const doc = (data.docs ?? []).find((d) => d.key);
    if (!doc?.key) return null;

    return {
      workKey: doc.key,
      authorKeys: (doc.author_key ?? []).filter((k) => typeof k === "string" && k.length > 0),
    };
  } catch {
    return null;
  }
}
```

⚠️ `limit=1` en la petición y aun así `.find((d) => d.key)`: OL a veces devuelve docs sin `key`. Y añade arriba, junto a `FETCH_TIMEOUT_MS`:

```ts
const REVALIDATE_SECONDS = 3600;
```

reemplazando el `revalidate: 3600` literal de `searchWorks` por la constante, para que las dos funciones compartan el mismo criterio.

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run src/lib/catalog/openlibrary/work-search.test.ts
```

Expected: PASS — los 2 tests previos de `mapWorkDoc` siguen verdes más los 4 nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary/work-search.ts src/lib/catalog/openlibrary/work-search.test.ts
git commit -m "feat(openlibrary): pedir author_key en la busqueda y resolver obra por titulo y autor"
```

---

### Task 4: Columna `people.aliases` con su grant

**Files:**
- Create: `supabase/migrations/20260853_people_aliases.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)
- Modify: `docs/requirements/data-model.md` (tabla `people` + fecha de verificación)

**Interfaces:**
- Consumes: nada.
- Produces: columna `people.aliases text[] not null default '{}'`, escribible en INSERT por `anon` y `authenticated`.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/20260853_people_aliases.sql`:

```sql
-- Las demás grafías conocidas del nombre de una persona.
--
-- Para qué: Open Library da un nombre canónico que puede estar en otro alfabeto
-- ("Фёдор Достоевский") y una lista de variantes. Se enseña la forma latina y
-- las demás se guardan aquí, que es lo que permite reconocer que "Dostoievski"
-- y "Fyodor Dostoyevsky" son la MISMA fila en vez de crear una por idioma.
alter table public.people
  add column aliases text[] not null default '{}';

-- ⚠️ El grant de columna NO es opcional: `people` tiene grants finos, y una
-- columna nueva sin su grant de INSERT rompe la escritura ENTERA de la tabla,
-- no solo este campo (issue #375, superficie 6 de docs/DRIFT-CHECK.md).
grant insert (aliases), references (aliases) on public.people to anon, authenticated;

-- Sin grant de UPDATE a propósito: la app no reescribe personas (hoy
-- `authenticated` solo puede tocar bio, fechas, foto y lugar de nacimiento), y
-- el backfill que corrige nombres y alias va con service_role.

comment on column public.people.aliases is
  'Otras grafías del nombre (otros idiomas y alfabetos). El nombre visible vive en `name`.';
```

- [ ] **Step 2: Aplicar en dev y comprobar el grant**

Aplica la migración con el MCP `supabase-dev` (`apply_migration`, nombre `20260853_people_aliases`). Después, comprueba que el grant existe de verdad — no basta con que la migración no diera error:

```sql
select grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'people' and column_name = 'aliases'
order by grantee, privilege_type;
```

Expected: cuatro filas — `anon`/INSERT, `anon`/REFERENCES, `authenticated`/INSERT, `authenticated`/REFERENCES.

- [ ] **Step 3: Comprobar que la escritura de `people` sigue viva**

Esta es la comprobación que faltó las dos veces que #375 explotó. `set local role` **solo
vale dentro de una transacción**, y el `rollback` deja la tabla como estaba, así que no hay
que limpiar nada después:

```sql
begin;
set local role authenticated;
insert into public.people (name, aliases) values ('[drift] prueba', array['x'])
returning id;
rollback;
```

Expected: devuelve un id. Si sale `permission denied for column aliases`, falta el grant y
**la escritura entera de `people` está rota** — no sigas hasta arreglarlo. Un fallo por RLS
(`new row violates row-level security policy`) sería otra cosa y también valdría como
prueba de que el permiso de columna sí está.

- [ ] **Step 4: Regenerar los tipos**

```
npx supabase gen types typescript --project-id tyvzpuhxfwxrnkcpzxyg > src/lib/supabase/database.types.ts
```

Si el CLI no está disponible en esta máquina (no lo estaba el 2026-08-12), usa la herramienta `generate_typescript_types` del MCP `supabase-dev` y vuelca su salida al mismo fichero. Comprueba después:

```
npx tsc --noEmit
```

Expected: sin errores, y `aliases: string[]` presente en el bloque `people` de `database.types.ts`.

- [ ] **Step 5: Actualizar `data-model.md`**

En la ficha de la tabla `people` de `docs/requirements/data-model.md`, añade la fila:

```
| `aliases` | `text[] not null default '{}'` | Otras grafías del nombre (otros idiomas y alfabetos). El visible es `name`. Solo lo escribe el alta de autor y el backfill. |
```

Y actualiza la fecha de verificación de la cabecera del documento a `2026-08-13`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260853_people_aliases.sql src/lib/supabase/database.types.ts docs/requirements/data-model.md
git commit -m "feat(db): columna people.aliases con su grant de insert"
```

---

### Task 5: Alta de autor por clave, sin nombres de por medio

**Files:**
- Modify: `src/lib/people/find-or-create-person.ts:69-114` (sustituir `findOrCreateBookAuthor`)
- Delete: `src/lib/catalog/openlibrary/authors.ts` (entero)
- Test: `src/lib/people/find-or-create-book-author.test.ts` (nuevo)

**Interfaces:**
- Consumes: `fetchOpenLibraryAuthorByKey` (Task 2); columna `aliases` (Task 4).
- Produces:
  ```ts
  export async function findOrCreateBookAuthorByKey(
    supabase: SupabaseServerClient,
    key: string
  ): Promise<string | null>;
  ```
  `findOrCreateBookAuthor(supabase, name)` deja de existir. `findOrCreatePeopleByTmdb` no se toca.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/people/find-or-create-book-author.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { findOrCreateBookAuthorByKey } from "./find-or-create-person";

// El caso que importa es el 23505. Hasta hoy, cuando dos grafías del mismo autor
// chocaban contra el índice único parcial `people_openlibrary_key_key`, el catch
// re-seleccionaba POR NOMBRE, no encontraba nada, lanzaba, y
// `ensureItemEnriched` se tragaba la excepción: el libro se quedaba sin NINGÚN
// crédito, en silencio. Aquí se comprueba que ya no.

type PeopleRow = { id: string; openlibrary_key: string };

/** Doble mínimo: `people` responde a select por openlibrary_key y a insert. */
function fakeSupabase(options: {
  existing?: PeopleRow[];
  insertError?: { code: string; message: string };
  /** Filas visibles SOLO en el re-select posterior al error (la carrera). */
  afterRace?: PeopleRow[];
}) {
  let selectCount = 0;
  const inserted: Array<Record<string, unknown>> = [];

  return {
    inserted,
    from() {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              selectCount += 1;
              const pool = selectCount === 1 ? (options.existing ?? []) : (options.afterRace ?? []);
              const row = pool.find((r) => r.openlibrary_key === value) ?? null;
              return {
                limit() {
                  return { maybeSingle: async () => ({ data: row, error: null }) };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return {
            select() {
              return {
                single: async () =>
                  options.insertError
                    ? { data: null, error: options.insertError }
                    : { data: { id: "nueva-persona" }, error: null },
              };
            },
          };
        },
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubAuthorFetch(payload: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => payload }));
}

describe("findOrCreateBookAuthorByKey", () => {
  it("con la persona ya guardada, la reutiliza sin llamar a la API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const supabase = fakeSupabase({
      existing: [{ id: "persona-1", openlibrary_key: "OL22161A" }],
    });

    const id = await findOrCreateBookAuthorByKey(supabase as never, "/authors/OL22161A");

    expect(id).toBe("persona-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("crea la persona con nombre canónico, alias y clave corta", async () => {
    stubAuthorFetch({
      name: "Фёдор Достоевский",
      personal_name: "Fyodor Mikhaylovich Dostoyevsky",
      photos: [12345],
    });
    const supabase = fakeSupabase({});

    const id = await findOrCreateBookAuthorByKey(supabase as never, "OL22242A");

    expect(id).toBe("nueva-persona");
    expect(supabase.inserted[0]).toMatchObject({
      name: "Fyodor Mikhaylovich Dostoyevsky",
      aliases: ["Фёдор Достоевский"],
      openlibrary_key: "OL22242A",
      photo_url: "https://covers.openlibrary.org/a/id/12345-M.jpg",
    });
  });

  it("ante 23505 recupera la fila por openlibrary_key y NO lanza", async () => {
    stubAuthorFetch({ name: "Frank Herbert" });
    const supabase = fakeSupabase({
      insertError: { code: "23505", message: "duplicate key" },
      afterRace: [{ id: "persona-ganadora", openlibrary_key: "OL79034A" }],
    });

    await expect(
      findOrCreateBookAuthorByKey(supabase as never, "OL79034A")
    ).resolves.toBe("persona-ganadora");
  });

  it("ante un error que no se puede recuperar devuelve null en vez de lanzar", async () => {
    stubAuthorFetch({ name: "Frank Herbert" });
    const supabase = fakeSupabase({
      insertError: { code: "42501", message: "permission denied" },
      afterRace: [],
    });

    await expect(
      findOrCreateBookAuthorByKey(supabase as never, "OL79034A")
    ).resolves.toBeNull();
  });

  it("sin forma latina no crea nada", async () => {
    stubAuthorFetch({ name: "Френк Герберт" });
    const supabase = fakeSupabase({});

    expect(await findOrCreateBookAuthorByKey(supabase as never, "OL7388009A")).toBeNull();
    expect(supabase.inserted).toHaveLength(0);
  });

  it("con clave vacía sale sin tocar nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const supabase = fakeSupabase({});

    expect(await findOrCreateBookAuthorByKey(supabase as never, "")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/people/find-or-create-book-author.test.ts
```

Expected: FAIL — `findOrCreateBookAuthorByKey is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/people/find-or-create-person.ts`, cambia el import de cabecera:

```ts
import { fetchOpenLibraryAuthorByKey } from "@/lib/catalog/openlibrary/work-authors";
```

y **sustituye entera** `findOrCreateBookAuthor` (líneas 69-114) por:

```ts
// Autores de libro: los identifica por su CLAVE de Open Library, nunca por el
// nombre. El nombre no es identidad —"Fiódor Dostoyevski" y "Fyodor Dostoevsky"
// son el mismo humano, y "Frank Herbert" son dos personas distintas en OL— y
// buscarlo era el origen de las fichas falsas y de una fila por idioma.
//
// `tmdb_id` nulo sigue distinguiendo a los autores de las personas de cine.
//
// Devuelve `null`, nunca lanza: si el autor no se puede resolver, el libro se
// queda sin crédito y su ficha enseña `books.author` como texto plano. Es
// preferible a inventarse a alguien.
export async function findOrCreateBookAuthorByKey(
  supabase: SupabaseServerClient,
  key: string
): Promise<string | null> {
  const authorKey = (key ?? "").trim().replace(/^\/?authors\//, "");
  if (!authorKey) return null;

  const { data: existing } = await supabase
    .from("people")
    .select("id")
    .eq("openlibrary_key", authorKey)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const ol = await fetchOpenLibraryAuthorByKey(authorKey);
  // Sin ficha, o sin ninguna grafía latina: no se crea la persona.
  if (!ol) return null;

  const { data: inserted, error } = await supabase
    .from("people")
    .insert({
      name: ol.name,
      aliases: ol.aliases,
      openlibrary_key: ol.key,
      photo_url: ol.photoUrl,
      bio: ol.bio,
      birth_date: ol.birthDate,
      death_date: ol.deathDate,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = otra request lo insertó a la vez (índice único parcial
    // `people_openlibrary_key_key`). Se recupera re-seleccionando POR CLAVE —
    // por nombre NO funcionaba, y ese era justo el bug que dejaba el libro sin
    // ningún crédito.
    const { data: raced } = await supabase
      .from("people")
      .select("id")
      .eq("openlibrary_key", authorKey)
      .limit(1)
      .maybeSingle();
    if (raced) return raced.id;

    // 42501 = visitante anónimo sin grant de escritura; esperado, no se
    // registra. Cualquier otro sí.
    if (error.code !== "42501" && error.code !== "23505") {
      console.error("people insert failed", { authorKey, error });
    }
    return null;
  }

  return inserted.id;
}
```

Borra el fichero de la resolución vieja:

```bash
git rm src/lib/catalog/openlibrary/authors.ts
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run src/lib/people/find-or-create-book-author.test.ts
```

Expected: PASS, 6 tests. `npx tsc --noEmit` fallará todavía en `src/lib/people/enrich-item.ts` (sigue importando `findOrCreateBookAuthor`); es lo que arregla la Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/find-or-create-person.ts src/lib/people/find-or-create-book-author.test.ts src/lib/catalog/openlibrary/authors.ts
git commit -m "feat(people): dar de alta autores de libro por clave de Open Library"
```

---

### Task 6: El enriquecido de un libro deriva sus autores de la obra

**Files:**
- Modify: `src/lib/people/enrich-item.ts:5` (import), `:11-18` (`EnrichableItem`), `:31-34` (borrar `splitAuthors`), `:131-162` (rama de libro)
- Modify: `src/app/libro/[id]/page.tsx:304`
- Test: `src/lib/people/enrich-item-book.test.ts` (nuevo)

**Interfaces:**
- Consumes: `findOrCreateBookAuthorByKey` (Task 5), `fetchWorkAuthorKeys` (Task 2), `resolveWorkByTitleAuthor` (Task 3).
- Produces: `EnrichableItem` gana `title?: string | null` y `openlibraryWorkKey?: string | null`.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/people/enrich-item-book.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { ensureItemEnriched } from "./enrich-item";

// La rama de libro ya no mira el string `books.author` para saber QUIÉN escribió
// el libro: pregunta a la obra. Lo que se comprueba aquí es el contrato de
// bordes — de dónde salen las claves y qué pasa cuando no hay ninguna — no el
// mapeo de OpenLibrary (eso es de work-authors.test.ts).

type Upserted = Array<Record<string, unknown>>;

function fakeSupabase(upserted: Upserted) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return this;
            },
            // El guard `hasBilledCast`: sin créditos facturados.
            not: async () => ({ count: 0, error: null }),
            limit() {
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
          };
        },
        insert() {
          return { select: () => ({ single: async () => ({ data: { id: `p-${table}` }, error: null }) }) };
        },
        update() {
          return { eq: async () => ({ error: null }) };
        },
        upsert: async (rows: Upserted) => {
          upserted.push(...rows);
          return { error: null };
        },
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureItemEnriched · libros", () => {
  it("con work key, acredita a los autores del work en su orden", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/")) {
        return {
          ok: true,
          json: async () => ({
            authors: [
              { author: { key: "/authors/OL2830895A" } },
              { author: { key: "/authors/OL9118672A" } },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ name: `Autor ${url.split("/").pop()}` }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const upserted: Upserted = [];
    await ensureItemEnriched(fakeSupabase(upserted) as never, "book", {
      id: "libro-1",
      title: "El nombre del viento",
      author: "Patrick Rothfuss, Marc Simonetti",
      openlibraryWorkKey: "/works/OL8479867W",
    });

    expect(upserted).toHaveLength(2);
    expect(upserted[0]).toMatchObject({ item_type: "book", role: "author", billing_order: 0 });
    expect(upserted[1]).toMatchObject({ billing_order: 1 });
  });

  it("sin work key, la resuelve por título y autor y la guarda", async () => {
    const updates: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("search.json")) {
        return {
          ok: true,
          json: async () => ({
            docs: [{ key: "/works/OL893414W", author_key: ["OL79034A"] }],
          }),
        };
      }
      return { ok: true, json: async () => ({ name: "Frank Herbert" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const upserted: Upserted = [];
    const supabase = fakeSupabase(upserted);
    const original = supabase.from;
    supabase.from = (table: string) => {
      const api = original.call(supabase, table);
      return {
        ...api,
        update: (patch: Record<string, unknown>) => {
          updates.push(JSON.stringify(patch));
          return { eq: async () => ({ error: null }) };
        },
      };
    };

    await ensureItemEnriched(supabase as never, "book", {
      id: "libro-2",
      title: "Dune",
      author: "Frank Herbert",
      openlibraryWorkKey: null,
    });

    expect(updates.some((u) => u.includes("/works/OL893414W"))).toBe(true);
    expect(upserted).toHaveLength(1);
  });

  it("sin obra resoluble no escribe ningún crédito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) })
    );

    const upserted: Upserted = [];
    await ensureItemEnriched(fakeSupabase(upserted) as never, "book", {
      id: "libro-3",
      title: "Libro sin obra",
      author: "Alguien Desconocido",
      openlibraryWorkKey: null,
    });

    expect(upserted).toHaveLength(0);
  });

  it("el string `books.author` ya no crea personas por su cuenta", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/")) return { ok: true, json: async () => ({ authors: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const upserted: Upserted = [];
    await ensureItemEnriched(fakeSupabase(upserted) as never, "book", {
      id: "libro-4",
      title: "Obra sin autores",
      author: "Traductor Fulano, Ilustrador Mengano",
      openlibraryWorkKey: "/works/OL1W",
    });

    expect(upserted).toHaveLength(0);
    // Ni una llamada a search/authors.json: esa vía está borrada.
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("search/authors"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/people/enrich-item-book.test.ts
```

Expected: FAIL — el import de `findOrCreateBookAuthor` ya no existe (Task 5 lo borró), así que el módulo no carga.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/people/enrich-item.ts`:

1. Cambia el import de la línea 5:

```ts
import { findOrCreatePeopleByTmdb, findOrCreateBookAuthorByKey } from "./find-or-create-person";
import { fetchWorkAuthorKeys } from "@/lib/catalog/openlibrary/work-authors";
import { resolveWorkByTitleAuthor } from "@/lib/catalog/openlibrary/work-search";
```

2. Amplía `EnrichableItem`:

```ts
export type EnrichableItem = {
  id: string;
  tmdbId?: number | null;
  /** Solo libros: el texto de portada, ya NO fuente de identidad de personas. */
  author?: string | null;
  /** Solo libros: hace falta para resolver la obra cuando no hay work key. */
  title?: string | null;
  /** Solo libros: "/works/OL…W". La identidad de los autores sale de aquí. */
  openlibraryWorkKey?: string | null;
  durationMinutes?: number | null;
  totalEpisodes?: number | null;
  episodeRuntimeMinutes?: number | null;
};
```

3. **Borra** `splitAuthors` (líneas 31-34). Ya no hay nada que partir: el string de autor dejó de ser fuente de personas.

4. Sustituye la rama de libro entera (líneas 131-162):

```ts
    if (itemType === "book") {
      if (!needsCredits) return;

      // La identidad de los autores sale de la OBRA, no del texto de portada.
      // Si el libro no guardó su work key (alta manual, CSV, ISBN que no
      // resolvió), se resuelve por título+autor y se guarda para no repetir la
      // búsqueda en cada visita — y de paso esa misma respuesta ya trae las
      // claves de autor, sin una segunda llamada.
      let authorKeys: string[] = [];
      if (item.openlibraryWorkKey) {
        authorKeys = await fetchWorkAuthorKeys(item.openlibraryWorkKey);
      } else if (item.title) {
        const resolved = await resolveWorkByTitleAuthor(item.title, item.author ?? null);
        if (resolved) {
          authorKeys = resolved.authorKeys;
          // 42501 = visitante anónimo, que no tiene UPDATE sobre `books`.
          // Esperado e inocuo: la guardará el primer visitante con sesión.
          const { error } = await supabase
            .from("books")
            .update({ openlibrary_work_key: resolved.workKey })
            .eq("id", item.id);
          if (error && error.code !== "42501") {
            console.error("book work key update failed", { id: item.id, error });
          }
        }
      }

      // Sin obra o sin autores en ella no se escribe NADA. La ficha enseñará
      // `books.author` como texto plano, sin enlace a ficha de persona. Es
      // deliberado: mejor sin autor que con uno inventado (spec de 2026-08-13).
      if (authorKeys.length === 0) return;

      const rows: Array<{
        item_type: ItemType;
        item_id: string;
        person_id: string;
        role: string;
        billing_order: number;
      }> = [];
      let order = 0;
      for (const key of authorKeys) {
        const personId = await findOrCreateBookAuthorByKey(supabase, key);
        // null = autor sin grafía latina (duplicado en otro alfabeto) o alta
        // fallida. Se omite ESE autor, no el libro entero.
        if (!personId) continue;
        rows.push({
          item_type: "book",
          item_id: item.id,
          person_id: personId,
          role: "author",
          billing_order: order++,
        });
      }

      // UPSERT y no INSERT: el autor puede estar ya puesto por la hidratación
      // de su ficha de persona.
      if (rows.length > 0) {
        await supabase.from("credits").upsert(rows, {
          onConflict: "item_type,item_id,person_id,role",
          ignoreDuplicates: true,
        });
      }
      return;
    }
```

⚠️ Fíjate en que desaparece el `if (!item.author) return;`: un libro sin texto de autor pero con work key ahora sí se puede enriquecer.

5. En `src/app/libro/[id]/page.tsx`, línea 304, pasa los dos campos nuevos (ambos ya vienen en el `select` de la línea 92):

```ts
    ensureItemEnriched(supabase, "book", {
      id: book.id,
      title: book.title,
      author: book.author,
      openlibraryWorkKey: book.openlibrary_work_key,
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/lib/people
npx tsc --noEmit
npx eslint src/lib/people src/lib/catalog/openlibrary "src/app/libro/[id]/page.tsx"
```

Expected: los tests de `src/lib/people` en verde (incluido `enrich-item-guard.test.ts`, que no debe haberse roto), `tsc` sin errores y eslint limpio sobre esos ficheros. Ojo: `npm run lint` sobre todo el repo sale con 12 errores **preexistentes** en ficheros que esta rama no toca; no intentes arreglarlos aquí.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/enrich-item.ts src/lib/people/enrich-item-book.test.ts "src/app/libro/[id]/page.tsx"
git commit -m "feat(libros): derivar los autores de la obra en vez del texto de portada"
```

---

### Task 7: Backfill de lo ya escrito

**Files:**
- Create: `scripts/backfill-book-authors.ts`

**Interfaces:**
- Consumes: `fetchWorkAuthorKeys`, `fetchOpenLibraryAuthorByKey` (Task 2), `resolveWorkByTitleAuthor` (Task 3).
- Produces: nada que consuma código de la app.

- [ ] **Step 1: Escribir el script**

Crea `scripts/backfill-book-authors.ts`. Importa las **mismas** funciones que usa la app: un criterio copiado se desincroniza del de producción a la primera.

```ts
// Limpieza de una vez de los autores de libro que escribió la vía vieja
// (buscar el nombre suelto en Open Library y quedarse con docs[0]).
//
// Por qué hace falta además de arreglar la fuente: cambiar `ensureItemEnriched`
// arregla el futuro, no el pasado. En producción al 2026-08-13 había 61 autores
// de libro para 194 libros, con identidades falsas (Frank Herbert nacido en
// 1872), una fila por grafía de idioma, y traductores e ilustradores guardados
// con role="author".
//
// Idempotente: una segunda pasada no debe imprimir ni una acción.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/backfill-book-authors.ts            # dry-run
//   npx tsx --env-file=.env.local scripts/backfill-book-authors.ts --apply    # escribe
//
// (`tsx` NO está en devDependencies a propósito: se baja al vuelo con npx, como
// backfill-sizes.ts y backfill-genres.ts.)
//
// Necesita SUPABASE_SERVICE_ROLE_KEY del entorno que toque — ojo: .env.local
// apunta a DEV; para prod, exporta las suyas. Dev primero, se lee el log, y
// luego prod.
import { createClient } from "@supabase/supabase-js";
import {
  fetchWorkAuthorKeys,
  fetchOpenLibraryAuthorByKey,
} from "../src/lib/catalog/openlibrary/work-authors";
import { resolveWorkByTitleAuthor } from "../src/lib/catalog/openlibrary/work-search";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

function log(action: string, detail: string) {
  console.log(`${APPLY ? "[HECHO]" : "[DRY] "} ${action.padEnd(18)} ${detail}`);
}

type BookRow = { id: string; title: string; author: string | null; openlibrary_work_key: string | null };
type PersonRow = {
  id: string;
  name: string;
  aliases: string[];
  openlibrary_key: string | null;
  created_at: string;
};

// Misma normalización que se usa para reconocer que "Fiódor Dostoyevski" y
// "Fiodor Dostoyevski" son el mismo texto: minúsculas, sin acentos, solo letras.
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento, ya separadas por NFD
    .replace(/[^a-z]/g, "");
}

async function main() {
  if (!APPLY) console.log("*** DRY-RUN: no se escribe nada. Añade --apply para ejecutar. ***\n");

  // ── Fase 1 y 2: work key de cada libro y autores correctos ────────────────
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, author, openlibrary_work_key");
  if (booksError) throw booksError;

  const correctByBook = new Map<string, string[]>(); // bookId -> claves de autor
  let resueltas = 0;
  let sinObra = 0;

  for (const book of (books ?? []) as BookRow[]) {
    let workKey = book.openlibrary_work_key;
    let authorKeys: string[] = [];

    if (workKey) {
      authorKeys = await fetchWorkAuthorKeys(workKey);
    } else {
      const resolved = await resolveWorkByTitleAuthor(book.title, book.author);
      if (resolved) {
        workKey = resolved.workKey;
        authorKeys = resolved.authorKeys;
        resueltas++;
        log("work key", `${book.title} -> ${workKey}`);
        if (APPLY) {
          const { error } = await supabase
            .from("books")
            .update({ openlibrary_work_key: workKey })
            .eq("id", book.id);
          if (error) throw error;
        }
      }
    }

    if (authorKeys.length === 0) {
      sinObra++;
      log("sin autores", `${book.title} (se quedará sin crédito)`);
    }
    correctByBook.set(book.id, authorKeys);
  }

  // ── Fase 3: casar cada clave con `people`, corrigiendo en vez de duplicar ──
  const { data: peopleRows, error: peopleError } = await supabase
    .from("people")
    .select("id, name, aliases, openlibrary_key, created_at")
    .is("tmdb_id", null);
  if (peopleError) throw peopleError;

  const people = (peopleRows ?? []) as PersonRow[];
  const byKey = new Map<string, PersonRow[]>();
  const byName = new Map<string, PersonRow>();
  for (const p of people) {
    if (p.openlibrary_key) {
      byKey.set(p.openlibrary_key, [...(byKey.get(p.openlibrary_key) ?? []), p]);
    }
    for (const grafia of [p.name, ...(p.aliases ?? [])]) {
      const n = normalize(grafia);
      if (n && !byName.has(n)) byName.set(n, p);
    }
  }

  const personIdByKey = new Map<string, string>();
  const todasLasClaves = [...new Set([...correctByBook.values()].flat())];

  for (const authorKey of todasLasClaves) {
    const yaPorClave = byKey.get(authorKey)?.[0];
    if (yaPorClave) {
      personIdByKey.set(authorKey, yaPorClave.id);
      continue;
    }

    const ol = await fetchOpenLibraryAuthorByKey(authorKey);
    if (!ol) {
      log("descartado", `${authorKey} (sin ficha o sin grafía latina)`);
      continue;
    }

    // ¿Existe ya con otro nombre? Se corrige la fila; no se crea una segunda.
    const porNombre =
      byName.get(normalize(ol.name)) ??
      ol.aliases.map((a) => byName.get(normalize(a))).find(Boolean);

    if (porNombre) {
      log("corregida", `${porNombre.name} -> ${ol.name} (${authorKey})`);
      personIdByKey.set(authorKey, porNombre.id);
      if (APPLY) {
        const { error } = await supabase
          .from("people")
          .update({
            name: ol.name,
            aliases: [...new Set([...ol.aliases, porNombre.name])].filter((a) => a !== ol.name),
            openlibrary_key: ol.key,
            photo_url: ol.photoUrl,
            bio: ol.bio,
            birth_date: ol.birthDate,
            death_date: ol.deathDate,
          })
          .eq("id", porNombre.id);
        if (error) throw error;
      }
      continue;
    }

    log("alta", `${ol.name} (${authorKey})`);
    if (APPLY) {
      const { data, error } = await supabase
        .from("people")
        .insert({
          name: ol.name,
          aliases: ol.aliases,
          openlibrary_key: ol.key,
          photo_url: ol.photoUrl,
          bio: ol.bio,
          birth_date: ol.birthDate,
          death_date: ol.deathDate,
        })
        .select("id")
        .single();
      if (error) throw error;
      personIdByKey.set(authorKey, data.id);
    }
  }

  // ── Fase 4: fusionar duplicados con la misma clave ────────────────────────
  // `credits.person_id` es la ÚNICA FK a `people` (verificado en prod el
  // 2026-08-13), así que fusionar = repuntar créditos y borrar la fila.
  for (const [claveDuplicada, filas] of byKey) {
    if (filas.length < 2) continue;
    const [superviviente, ...resto] = [...filas].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    for (const dup of resto) {
      log("fusión", `${dup.name} (${dup.id}) -> ${superviviente.name} [${claveDuplicada}]`);
      if (APPLY) {
        const { error: upErr } = await supabase
          .from("credits")
          .update({ person_id: superviviente.id })
          .eq("person_id", dup.id);
        if (upErr) throw upErr;
        const { error: delErr } = await supabase.from("people").delete().eq("id", dup.id);
        if (delErr) throw delErr;
      }
    }
  }

  // ── Fase 5: reescribir los créditos `author` de cada libro ────────────────
  let creditosBorrados = 0;
  let creditosPuestos = 0;

  for (const [bookId, authorKeys] of correctByBook) {
    const correctos = authorKeys
      .map((k) => personIdByKey.get(k))
      .filter((id): id is string => !!id);

    const { data: actuales, error } = await supabase
      .from("credits")
      .select("id, person_id")
      .eq("item_type", "book")
      .eq("item_id", bookId)
      .eq("role", "author");
    if (error) throw error;

    for (const credito of actuales ?? []) {
      if (correctos.includes(credito.person_id)) continue;
      creditosBorrados++;
      log("crédito fuera", `libro ${bookId} persona ${credito.person_id}`);
      if (APPLY) {
        const { error: delErr } = await supabase.from("credits").delete().eq("id", credito.id);
        if (delErr) throw delErr;
      }
    }

    const filas = correctos.map((personId, i) => ({
      item_type: "book",
      item_id: bookId,
      person_id: personId,
      role: "author",
      billing_order: i,
    }));
    if (filas.length > 0) {
      creditosPuestos += filas.length;
      if (APPLY) {
        const { error: upErr } = await supabase
          .from("credits")
          .upsert(filas, { onConflict: "item_type,item_id,person_id,role", ignoreDuplicates: true });
        if (upErr) throw upErr;
      }
    }
  }

  // ── Fase 6: barrer personas huérfanas ─────────────────────────────────────
  const { data: huerfanas, error: huerfanasError } = await supabase
    .from("people")
    .select("id, name, credits(id)")
    .is("tmdb_id", null);
  if (huerfanasError) throw huerfanasError;

  let borradas = 0;
  for (const p of (huerfanas ?? []) as Array<{ id: string; name: string; credits: unknown[] }>) {
    if ((p.credits ?? []).length > 0) continue;
    borradas++;
    log("huérfana", `${p.name} (${p.id})`);
    if (APPLY) {
      const { error } = await supabase.from("people").delete().eq("id", p.id);
      if (error) throw error;
    }
  }

  console.log(
    `\nlibros: ${books?.length ?? 0} | work keys resueltas: ${resueltas} | sin obra: ${sinObra}` +
      `\ncréditos retirados: ${creditosBorrados} | créditos asegurados: ${creditosPuestos}` +
      `\npersonas huérfanas borradas: ${borradas}`
  );
  console.log(
    "\nOJO: esto escribe por fuera de Next, así que las fichas cacheadas seguirán " +
      "enseñando lo viejo hasta que caduque su cacheLife. No es que no haya hecho nada."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Contar el estado de dev antes de tocarlo**

Con el MCP `supabase-dev`:

```sql
select
  (select count(*) from people where tmdb_id is null) as autores,
  (select count(*) from credits where item_type = 'book' and role = 'author') as creditos,
  (select count(*) from books) as libros,
  (select count(*) from books where openlibrary_work_key is null) as sin_work_key;
```

Apunta los cuatro números.

- [ ] **Step 3: Dry-run contra dev**

```
fnm use 22
npx tsx --env-file=.env.local scripts/backfill-book-authors.ts > $CLAUDE_JOB_DIR/tmp/backfill-dev-dry.log
```

Expected: termina sin excepción y el log lista acciones con el prefijo `[DRY]`. **Léelo entero** antes de seguir: si aparece una fusión o un borrado que no sabrías justificar, pára y pregunta.

⚠️ En dry-run, los créditos que dependen de un alta nueva no se contabilizan: la persona no llega a existir, así que `personIdByKey` no tiene su id y la fase 5 la salta. Es esperado — el recuento de «créditos asegurados» del dry-run sale por debajo del real.

- [ ] **Step 4: Aplicar en dev y comprobar idempotencia**

```
npx tsx --env-file=.env.local scripts/backfill-book-authors.ts --apply
npx tsx --env-file=.env.local scripts/backfill-book-authors.ts
```

Expected: la segunda pasada (dry-run) no imprime **ninguna** línea de acción — solo el resumen. Si imprime alguna, el script no es idempotente: arréglalo antes de commitear.

Vuelve a correr la consulta del Step 2 y compara: los autores deben bajar (fusiones + huérfanas) y los créditos `author` no deben quedar en cero.

- [ ] **Step 5: Comprobación a ojo en dev**

Levanta un único `next dev` en el puerto 3000 (mata antes lo que lo ocupe: `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`), abre la ficha de *Dune* y comprueba: «Frank Herbert» aparece **una sola vez**, el enlace lleva a `/persona/<id>` y esa ficha trae bio, foto y 1920–1986. Deja el servidor parado al terminar.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-book-authors.ts
git commit -m "chore(scripts): backfill de autores de libro por clave de obra"
```

---

### Task 8: Cerrar la documentación y abrir lo que queda fuera

**Files:**
- Modify: `docs/requirements/decisiones.md` (fila nueva **al final**; el fichero es una TABLA markdown y es append-only)
- Create: tres issues en GitHub

**Interfaces:** ninguna.

- [ ] **Step 1: Añadir la decisión**

Añade **al final** de la tabla de `docs/requirements/decisiones.md` (una sola fila, sin reescribir las anteriores):

```
| 2026-08-13 | **La identidad de un autor de libro es su clave de Open Library, no su nombre** | Buscar el nombre suelto y quedarse con `docs[0]` daba fichas de otra persona (Frank Herbert nacido en 1872), una fila por cada grafía de idioma y, cuando dos grafías chocaban contra `people_openlibrary_key_key`, un libro sin ningún crédito en silencio. Ahora la clave sale de la obra (`search.json?fields=…,author_key` o `/works/<key>.json`), el nombre visible se elige por escritura latina —lo que además descarta duplicados como el «Френк Герберт» que el work de Dune lista junto a Frank Herbert— y las demás grafías van a `people.aliases`. Sin obra resoluble no se escribe crédito: la ficha enseña el texto de portada y punto, porque un autor inventado es peor que ninguno. Open Library marca a TODOS los autores de un work con `type: "/type/author_role"`, así que un ilustrador puede seguir colándose; se asume y se rastrea aparte. |
```

- [ ] **Step 2: Abrir las issues de lo que queda fuera**

Tres issues, cada una con sus tres etiquetas (área, tipo, prioridad) **en el mismo comando**.
Los cuerpos llevan backticks y comillas, así que escríbelos primero a fichero con la
herramienta Write y pásalos con `--body-file`: meterlos inline en el comando se rompe al
escapar.

**Issue 1** — escribe este contenido en `$CLAUDE_JOB_DIR/tmp/issue-ilustradores.md`:

```markdown
Open Library marca a todos los autores de un work con `type: "/type/author_role"`, así que no hay forma de saber quién es el autor y quién el ilustrador.

**Casos reales medidos el 2026-08-13:** `/works/OL8479867W` (El nombre del viento) lista `OL2830895A` (Rothfuss) y `OL9118672A` (Marc Simonetti, ilustrador). `/works/OL152268W` lista a Lovecraft y a `OL2943988A` (Enrique Breccia, ilustrador).

**Qué SÍ funciona.** Las ediciones son más limpias que el work: las ediciones españolas de OL8479867W listan `authors: [OL2830895A]` únicamente, sin Simonetti. O sea que intersectar los autores del work con los de sus ediciones eliminaría al ilustrador.

**Por qué no se hizo ya.** Cuesta una llamada más por libro y la cobertura es irregular: en 12 ediciones probadas de ese work, `contributions` vino `undefined` en todas y una edición española trae `authors: []`. Con la opción elegida (acreditar a todos los del work, con `billing_order`) el ilustrador ya no encabeza la ficha, que era el daño visible.

**Cómo reproducirlo.** Abrir `/libro/<id>` de El nombre del viento tras el backfill: Marc Simonetti sigue acreditado como autor.

Spec: `docs/superpowers/specs/2026-08-13-autores-libro-datos-design.md`
```

```bash
gh issue create --label "area:catalogo,tipo:deuda,P2" \
  --title "Ilustradores acreditados como autores: el work de Open Library no distingue el rol" \
  --body-file "$CLAUDE_JOB_DIR/tmp/issue-ilustradores.md"
```

**Issue 2** — escribe este contenido en `$CLAUDE_JOB_DIR/tmp/issue-fechas-bios.md`:

```markdown
`people.birth_date` y `people.death_date` son `text` y guardan lo que da Open Library tal cual: conviven al menos seis formatos ("20 August 1890", "1890-08-20", "1890", "16.02.1954"…). Las bios llegan con markdown crudo, que la ficha pinta como texto plano.

**Medido en producción el 2026-08-13** sobre 61 autores de libro: 30 sin bio, 23 sin foto.

**Cómo reproducirlo.** Abrir dos fichas de `/persona/<id>` de autores de libro distintos y comparar cómo se lee la fecha en cada una.

Es presentación, no identidad: el cambio de 2026-08-13 (identidad por clave de obra) no lo empeora — solo hace que ahora las fichas sean de la persona correcta. Al arreglarlo, decidir primero si se normaliza al escribir o al pintar.
```

```bash
gh issue create --label "area:catalogo,tipo:deuda,P2" \
  --title "Fechas y bios de autor sin normalizar: seis formatos de fecha y markdown crudo" \
  --body-file "$CLAUDE_JOB_DIR/tmp/issue-fechas-bios.md"
```

**Issue 3** — escribe este contenido en `$CLAUDE_JOB_DIR/tmp/issue-no-latinos.md`:

```markdown
`pickDisplayName` (`src/lib/catalog/openlibrary/author-names.ts`) elige como nombre visible la primera grafía en escritura latina entre `name`, `personal_name` y `alternate_names`, y **descarta al autor** si no hay ninguna.

**Por qué.** Es lo que corta los duplicados entre alfabetos: el work de Dune lista `OL79034A` (Frank Herbert) y `OL7388009A`, que es un stub `{"name": "Френк Герберт"}` sin `personal_name` ni `alternate_names` — el mismo humano, otra vez. Sin esta regla, ese duplicado entra como coautor.

**Qué se pierde.** Un autor cuya única grafía conocida sea no latina (japonés, coreano) no se crea, y su libro se queda sin ficha de persona: la ficha enseña `books.author` como texto plano.

**No es trabajo pendiente, es memoria.** Si algún día aparece el caso de verdad en el catálogo, la solución no es quitar la regla —volverían los duplicados— sino transliterar o casar por otra vía.

Decisión registrada en `docs/requirements/decisiones.md` (2026-08-13).
```

```bash
gh issue create --label "area:catalogo,tipo:acta,P3" \
  --title "Autores sin ninguna grafía latina se descartan a propósito" \
  --body-file "$CLAUDE_JOB_DIR/tmp/issue-no-latinos.md"
```

- [ ] **Step 3: Correr el repaso de deriva**

Se tocó el esquema (columna nueva con grant fino), así que corre la **superficie 6** de `docs/DRIFT-CHECK.md` (grants por columna) contra dev y prod, y comprueba que `data-model.md` ya refleja `aliases` (se hizo en la Task 4).

- [ ] **Step 4: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): la identidad de un autor de libro es su clave, no su nombre"
```

---

### Task 9: Aplicar en producción

**Files:** ninguno.

**Interfaces:** ninguna.

- [ ] **Step 1: Migración en prod**

Aplica `20260853_people_aliases.sql` en `supabase-prod` (project id `vmutcradmodhiltuohys`). El MCP puede bloquear `apply_migration` sobre prod en modo automático: si pasa, pide autorización explícita en el chat antes de seguir.

Comprueba el grant con la misma consulta del Step 2 de la Task 4, contra prod.

- [ ] **Step 2: Dry-run del backfill contra prod**

Exporta las credenciales de prod (no uses `.env.local`, que apunta a dev) y corre:

```
npx tsx scripts/backfill-book-authors.ts > $CLAUDE_JOB_DIR/tmp/backfill-prod-dry.log
```

**Lee el log entero.** Referencia de lo que debería aparecer, medido el 2026-08-13: identidades a corregir como Frank Herbert (`OL1758387A` → `OL79034A`), Lovecraft (`OL12771220A` → `OL22161A`) y Homero (`OL6010306A`); y créditos a retirar de Marc Simonetti, Alejandro Colucci, Manu Viciano, Borja García Bercero y Carlos di Urarte, más el duplicado «Rodolfo Acuña / Rodolfo Acuna».

- [ ] **Step 3: Aplicar en prod y verificar**

```
npx tsx scripts/backfill-book-authors.ts --apply
npx tsx scripts/backfill-book-authors.ts
```

Expected: la segunda pasada no imprime ninguna acción.

Comprueba en prod que no quedó ninguna clave duplicada:

```sql
select openlibrary_key, count(*)
from people
where openlibrary_key is not null
group by openlibrary_key having count(*) > 1;
```

Expected: cero filas.

- [ ] **Step 4: Limpiar el entorno**

Ningún `next dev` ni watcher de Vitest en segundo plano; puerto 3000 libre. Comprueba con `Get-Process node`.
