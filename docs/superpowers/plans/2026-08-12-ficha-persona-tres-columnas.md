# Ficha de persona a tres columnas + hidratación de créditos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/persona/[id]` en un explorador de créditos a tres columnas y hacer que la ficha muestre la obra COMPLETA de la persona (TMDB / Open Library), no solo lo que alguien haya abierto alguna vez.

**Architecture:** Dos piezas independientes unidas por un contrato de datos. (1) `hydratePersonCredits` trae la filmografía o bibliografía de la API externa, la persiste en catálogo + `credits` **en lote** (~6 consultas, no ~600) y marca `people.credits_hydrated_at`. (2) La página se parte en `PersonCard` (inmediata) y `PersonWorks` dentro de un `<Suspense>` que hidrata y pinta. Toda la lógica de forma vive en funciones puras testables sin BD.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Supabase (PostgREST + RLS), Tailwind, next-intl, Vitest, Playwright.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-08-12-ficha-persona-tres-columnas-design.md`. Ante duda, manda el spec.
- **Mockup:** `D:\Proyectos\Personal\Mockups\Rediseño - Ficha de persona (PC + móvil).html`, marco **5 · PC ancho — tres columnas (1e)**. Los marcos 1–4 cubren una columna, móvil, una sola obra y créditos mixtos.
- **Nada de hex del mockup.** El mockup es CSS vainilla con la paleta Paper en oscuro. Se mapea a los tokens reales: `--surface`, `--surface-2`, `--surface-3`, `--border`, `--accent`, `--gold`, `--status-*`, `--type-*`.
- **Regla #437 — CERO `use cache` en todo este trabajo.** El perfil depende de `passes` del que mira. Un `use cache` aquí es una fuga de datos ENTRE CUENTAS, y no se ve en desarrollo con una sola cuenta abierta. La ruta mantiene `export const instant = false`.
- **Nunca lanzar desde la hidratación.** Todo camino externo va en `try/catch` + `console.error`. Un fallo de API degrada la ficha a lo que haya en BD; no la rompe.
- **42501 y 23505 se tragan en silencio.** 42501 = visitante anónimo sin grant de escritura (esperado: existe navegación anónima, #359/#360). 23505 = enriquecimiento concurrente. Cualquier OTRO error sí se registra.
- **Roles válidos** (`credits.role`, `src/lib/people/types.ts:5`): `cast | director | writer | creator | author`. No hay ningún otro. Lo que no mapee, se descarta.
- **Node ≥ 22.11** (`package.json:6`). Si el shell trae Node 20, vitest falla: `fnm use 22` antes de nada.
- Comandos: tests `npm test`, e2e `npm run test:e2e`, tipos `npx tsc --noEmit`, lint `npx eslint`.
- **Un solo `next dev`, en el puerto 3000.** Si 3000 está ocupado por una sesión anterior, matar el proceso antes de arrancar (`Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`).
- Commits en español, formato `tipo(ámbito): descripción`, con la línea `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## Estructura de ficheros

**Fase A — hidratación (sin UI)**

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260823_people_credits_hydrated_at.sql` | Columna `credits_hydrated_at` **y su grant**. |
| `src/lib/people/map-tmdb-job.ts` | `job` de TMDB → `CreditRole \| null`. Puro. |
| `src/lib/catalog/tmdb.ts` (modificar) | `getPersonCombinedCredits(tmdbId)`. |
| `src/lib/catalog/openlibrary/author-works.ts` | `getAuthorWorks(key)`. |
| `src/lib/catalog/find-or-create.ts` (modificar) | `findOrCreateCatalogItemsBulk`; el singular pasa a envoltorio. |
| `src/lib/people/hydrate-person-credits.ts` | Orquesta: fuente → filtro → lote → `credits` → marca. |

**Fase B — datos del perfil**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/people/profile-types.ts` | Los tipos del contrato (`PersonProfile`, `ProfileWork`, …). |
| `src/lib/people/derive-person-works.ts` | Las 8 funciones puras de derivación. |
| `src/lib/people/get-person-profile.ts` | Consultas + hidratación + agregados → `PersonProfile`. |

**Fase C — UI**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/ui/layout.ts` (modificar) | `SHELL_PERSON`. |
| `src/app/globals.css` (modificar) | `.person-grid`. |
| `messages/es.json` (modificar) | Namespace `person` ampliado. |
| `src/components/people/person-card.tsx` | Columna izquierda. |
| `src/components/people/bio-clamp.tsx` | El «Ver más» (única pieza cliente de la card). |
| `src/components/people/person-filters.tsx` | Chips de tipo y crédito, como `<Link>`. |
| `src/components/people/person-featured.tsx` | Rejilla de destacadas. |
| `src/components/people/person-work-row.tsx` | La fila de cuatro zonas. |
| `src/components/people/person-works.tsx` | Centro: cabecera + filtros + destacadas + lista/secciones. |
| `src/components/people/person-rail.tsx` | Columna derecha. |
| `src/app/persona/[id]/page.tsx` (reescribir) | Composición y estados de volumen. |
| `src/app/persona/[id]/loading.tsx` | Esqueleto con la MISMA rejilla. |

---

## Fase A — Hidratación

### Task 1: Migración `credits_hydrated_at` (+ su grant)

**Files:**
- Create: `supabase/migrations/20260823_people_credits_hydrated_at.sql`
- Modify: `docs/requirements/data-model.md`

⚠️ **La razón de que el grant vaya en la MISMA migración.** `authenticated` tiene `UPDATE` acotado **por columnas** sobre `people` — hoy solo `bio, birth_date, death_date, photo_url, place_of_birth`. Una columna nueva sin su grant **rompe la escritura ENTERA de la tabla**, no solo el campo nuevo: `enrichTmdbBio` dejaría de guardar biografías. Compila, pasa typecheck, pasa los unitarios y revienta en producción. Superficie 6 de `docs/DRIFT-CHECK.md`; ha mordido dos veces (issue #375).

**Interfaces:**
- Produces: columna `public.people.credits_hydrated_at timestamptz null`, escribible por `authenticated`.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260823_people_credits_hydrated_at.sql`:

```sql
-- Marca de "ya traje la obra completa de esta persona desde su API externa"
-- (TMDB combined_credits / Open Library author works). Con valor, la ficha no
-- vuelve a llamar a la API: lee de `credits` y punto.
--
-- El GRANT va en la MISMA migración a propósito: el UPDATE de `authenticated`
-- sobre `people` está acotado por columnas, y una columna nueva sin su grant
-- rompe la escritura ENTERA de la tabla (issue #375, superficie 6 de
-- docs/DRIFT-CHECK.md), no solo el campo nuevo.
alter table public.people
  add column if not exists credits_hydrated_at timestamptz;

grant update (credits_hydrated_at) on public.people to authenticated;
```

- [ ] **Step 2: Aplicar en DEV y verificar contra los objetos reales**

Aplicar con `mcp__supabase-dev__apply_migration`, nombre `people_credits_hydrated_at`.

Verificar con `mcp__supabase-dev__execute_sql`:

```sql
select grantee, privilege_type, string_agg(column_name, ', ' order by column_name) as cols
from information_schema.column_privileges
where table_schema='public' and table_name='people'
  and grantee='authenticated' and privilege_type='UPDATE'
group by grantee, privilege_type;
```

Esperado: la lista incluye `credits_hydrated_at` junto a `bio, birth_date, death_date, photo_url, place_of_birth`.

⚠️ **«No aparece en `list_migrations`» ≠ «no está aplicada».** Se verifica contra `information_schema` / `pg_class`, nunca contra el ledger.

- [ ] **Step 3: Aplicar en PROD y verificar igual**

Misma migración con `mcp__supabase-prod__apply_migration`, misma consulta de verificación con `mcp__supabase-prod__execute_sql`. **Dev primero, prod después** — nunca al revés.

- [ ] **Step 4: Regenerar los tipos de Supabase**

Ejecutar `mcp__supabase-dev__generate_typescript_types` y volcar el resultado sobre el fichero de tipos generados del repo (localizarlo con `Glob src/**/database.types.ts`; si el proyecto no tiene tipos generados en el árbol, saltar este paso y anotarlo en el commit).

- [ ] **Step 5: Documentar en `data-model.md`**

En `docs/requirements/data-model.md`, sección **2. Catálogo**, tras el párrafo que empieza «`people` + `credits` guardan autoría/dirección/reparto», añadir:

```markdown
**`people.credits_hydrated_at`** (`timestamptz`, nullable; migración
`20260823_people_credits_hydrated_at.sql`, aplicada y **verificada en DEV y PROD el
2026-08-12** contra `information_schema.column_privileges`). Marca que ya se trajo la obra
COMPLETA de la persona desde su API externa —`/person/{id}/combined_credits` de TMDB, o
`/authors/{key}/works.json` de Open Library—. Con valor, la ficha de persona no vuelve a
llamar a la API: sirve `credits` y punto.

Lleva **`grant update (credits_hydrated_at) on people to authenticated`** en la misma
migración: el `UPDATE` de `authenticated` sobre `people` está acotado por columnas
(`bio, birth_date, death_date, photo_url, place_of_birth` antes de esto), y una columna sin
su grant rompe la escritura ENTERA de la tabla — `enrichTmdbBio` dejaría de guardar
biografías. Ver issue #375 y la superficie 6 de `docs/DRIFT-CHECK.md`.

Antes de esto, «Su obra» de una ficha de persona era solo lo que `ensureItemEnriched`
hubiera escrito al abrir la ficha de una obra concreta: una persona con una sola película
abierta afirmaba, sin matices, que esa era toda su obra.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260823_people_credits_hydrated_at.sql docs/requirements/data-model.md
git commit -m "feat(people): columna credits_hydrated_at con su grant por columna"
```

---

### Task 2: `mapTmdbJob` — `job` de TMDB a nuestro rol

**Files:**
- Create: `src/lib/people/map-tmdb-job.ts`
- Test: `src/lib/people/map-tmdb-job.test.ts`

**Interfaces:**
- Consumes: `CreditRole` de `src/lib/people/types.ts`.
- Produces: `mapTmdbJob(job: string | null | undefined): CreditRole | null`.

- [ ] **Step 1: Escribir el test que falla**

`src/lib/people/map-tmdb-job.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapTmdbJob } from "./map-tmdb-job";

describe("mapTmdbJob", () => {
  it("Director -> director", () => {
    expect(mapTmdbJob("Director")).toBe("director");
  });

  it("los tres jobs de guion -> writer", () => {
    expect(mapTmdbJob("Writer")).toBe("writer");
    expect(mapTmdbJob("Screenplay")).toBe("writer");
    expect(mapTmdbJob("Story")).toBe("writer");
  });

  it("Creator -> creator", () => {
    expect(mapTmdbJob("Creator")).toBe("creator");
  });

  it("es indiferente a mayúsculas y espacios", () => {
    expect(mapTmdbJob("  director ")).toBe("director");
    expect(mapTmdbJob("SCREENPLAY")).toBe("writer");
  });

  it("un job sin rol equivalente -> null (se descarta el crédito)", () => {
    expect(mapTmdbJob("Producer")).toBeNull();
    expect(mapTmdbJob("Director of Photography")).toBeNull();
    expect(mapTmdbJob("Original Music Composer")).toBeNull();
  });

  it("null/undefined/vacío -> null", () => {
    expect(mapTmdbJob(null)).toBeNull();
    expect(mapTmdbJob(undefined)).toBeNull();
    expect(mapTmdbJob("")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npm test -- src/lib/people/map-tmdb-job.test.ts`
Esperado: FAIL — `Failed to resolve import "./map-tmdb-job"`.

- [ ] **Step 3: Implementar**

`src/lib/people/map-tmdb-job.ts`:

```ts
import type { CreditRole } from "./types";

// `credits.role` solo admite cast/director/writer/creator/author. TMDB devuelve
// DECENAS de `job` distintos en el equipo (Producer, Director of Photography,
// Editor, Original Music Composer…) y no hay rol donde meterlos: lo que no mapea
// se DESCARTA, no se inventa un rol ni se guarda como texto libre.
//
// "Director of Photography" NO es dirección: por eso el mapa es exacto, no un
// `includes("Director")`.
const JOB_TO_ROLE: Record<string, CreditRole> = {
  director: "director",
  writer: "writer",
  screenplay: "writer",
  story: "writer",
  creator: "creator",
};

export function mapTmdbJob(job: string | null | undefined): CreditRole | null {
  if (!job) return null;
  return JOB_TO_ROLE[job.trim().toLowerCase()] ?? null;
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/people/map-tmdb-job.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/map-tmdb-job.ts src/lib/people/map-tmdb-job.test.ts
git commit -m "feat(people): mapear el job de TMDB a nuestro CreditRole"
```

---

### Task 3: `getPersonCombinedCredits` — la filmografía de TMDB

**Files:**
- Modify: `src/lib/catalog/tmdb.ts` (añadir al final, junto a `getPersonDetails`, línea ~493)
- Test: `src/lib/catalog/person-credits.test.ts`

**Interfaces:**
- Consumes: `tmdbGet<T>` (privada, `tmdb.ts:250`), `TMDB_IMAGE_BASE` (`tmdb.ts:5`), `resolveGenresFromIds` (`./tmdb-genres`), `mapTmdbJob` (Task 2).
- Produces:

```ts
export type PersonCreditEntry = {
  itemType: "movie" | "series";
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  coverUrl: string | null;
  year: number | null;
  synopsis: string | null;
  genres: string[] | null;
  role: CreditRole;          // cast | director | writer | creator
  character: string | null;  // solo con role === "cast"
  voteAverage: number | null;
};

export async function getPersonCombinedCredits(tmdbId: number): Promise<PersonCreditEntry[]>;
```

- [ ] **Step 1: Escribir el test que falla**

`src/lib/catalog/person-credits.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonCombinedCredits } from "./tmdb";

const originalApiKey = process.env.TMDB_API_KEY;

function mockResponse(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

beforeEach(() => {
  process.env.TMDB_API_KEY = "dummy-key";
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalApiKey;
  vi.unstubAllGlobals();
});

describe("getPersonCombinedCredits", () => {
  it("mapea cast de película y de serie, con personaje y portada absoluta", async () => {
    mockResponse({
      cast: [
        {
          id: 1,
          media_type: "movie",
          title: "Duna",
          original_title: "Dune",
          poster_path: "/duna.jpg",
          release_date: "2021-09-15",
          overview: "Arena.",
          genre_ids: [878],
          character: "Paul Atreides",
          vote_average: 7.8,
        },
        {
          id: 2,
          media_type: "tv",
          name: "Serie",
          original_name: "Series",
          poster_path: null,
          first_air_date: "2019-01-01",
          character: "Alguien",
          vote_average: 6,
        },
      ],
      crew: [],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(2);
    expect(credits[0]).toMatchObject({
      itemType: "movie",
      tmdbId: 1,
      title: "Duna",
      originalTitle: "Dune",
      coverUrl: "https://image.tmdb.org/t/p/w342/duna.jpg",
      year: 2021,
      role: "cast",
      character: "Paul Atreides",
      voteAverage: 7.8,
    });
    expect(credits[1]).toMatchObject({
      itemType: "series",
      tmdbId: 2,
      title: "Serie",
      coverUrl: null,
      year: 2019,
      role: "cast",
    });
  });

  it("del equipo solo conserva los job mapeables; descarta el resto", async () => {
    mockResponse({
      cast: [],
      crew: [
        { id: 10, media_type: "movie", title: "A", job: "Director", poster_path: null },
        { id: 11, media_type: "movie", title: "B", job: "Producer", poster_path: null },
        { id: 12, media_type: "movie", title: "C", job: "Screenplay", poster_path: null },
        { id: 13, media_type: "movie", title: "D", job: "Director of Photography", poster_path: null },
      ],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits.map((c) => [c.tmdbId, c.role])).toEqual([
      [10, "director"],
      [12, "writer"],
    ]);
  });

  it("un mismo ítem con dos roles produce DOS entradas", async () => {
    mockResponse({
      cast: [{ id: 7, media_type: "movie", title: "Doble", poster_path: null, character: "Él" }],
      crew: [{ id: 7, media_type: "movie", title: "Doble", poster_path: null, job: "Director" }],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(2);
    expect(credits.map((c) => c.role).sort()).toEqual(["cast", "director"]);
  });

  it("el MISMO par (ítem, rol) repetido se deduplica", async () => {
    mockResponse({
      cast: [],
      crew: [
        { id: 9, media_type: "movie", title: "X", poster_path: null, job: "Writer" },
        { id: 9, media_type: "movie", title: "X", poster_path: null, job: "Story" },
      ],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(1);
    expect(credits[0].role).toBe("writer");
  });

  it("descarta media_type que no sea movie/tv, y entradas sin título", async () => {
    mockResponse({
      cast: [
        { id: 1, media_type: "person", name: "No", poster_path: null },
        { id: 2, media_type: "movie", title: "", poster_path: null },
        { id: 3, media_type: "movie", title: "Sí", poster_path: null },
      ],
      crew: [],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits.map((c) => c.tmdbId)).toEqual([3]);
  });

  it("CONSERVA las obras sin póster y sin fecha", async () => {
    mockResponse({
      cast: [{ id: 4, media_type: "movie", title: "Perdida", poster_path: null }],
      crew: [],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ coverUrl: null, year: null });
  });

  it("sin TMDB_API_KEY -> [] sin llamar a fetch", async () => {
    delete process.env.TMDB_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getPersonCombinedCredits(500)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respuesta no ok -> []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await getPersonCombinedCredits(500)).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npm test -- src/lib/catalog/person-credits.test.ts`
Esperado: FAIL — `getPersonCombinedCredits is not a function`.

- [ ] **Step 3: Implementar en `src/lib/catalog/tmdb.ts`**

Añadir el import al principio del fichero, junto a los que ya hay:

```ts
import { mapTmdbJob } from "@/lib/people/map-tmdb-job";
```

Y al final del fichero, después de `getPersonDetails`:

```ts
// La obra COMPLETA de una persona en UNA sola llamada. Es lo que arregla el
// bug de fondo de la ficha de persona: `credits` solo tenía lo que alguien
// hubiera abierto alguna vez, así que una persona con una sola película en BD
// afirmaba —sin matices— que esa era toda su obra.
//
// SIN TOPE (decisión 2026-08-12): se devuelve la filmografía entera. Los dos
// filtros que hay no son recorte de volumen sino necesidad de esquema:
//   1. `media_type` fuera de movie/tv no es obra de catálogo.
//   2. `job` que no mapee a CreditRole se descarta (ver mapTmdbJob).
// Las obras SIN póster y SIN fecha SÍ entran: descartarlas sería recortar la
// obra de la persona, que es justo el bug que arreglamos.
export type PersonCreditEntry = {
  itemType: "movie" | "series";
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  coverUrl: string | null;
  year: number | null;
  synopsis: string | null;
  genres: string[] | null;
  role: CreditRole;
  character: string | null;
  voteAverage: number | null;
};

type TmdbCombinedCreditEntry = {
  id: number;
  media_type?: string;
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  genre_ids?: number[];
  character?: string | null;
  job?: string | null;
  vote_average?: number | null;
};

function mapCombinedEntry(
  raw: TmdbCombinedCreditEntry,
  role: CreditRole
): PersonCreditEntry | null {
  const itemType =
    raw.media_type === "movie" ? "movie" : raw.media_type === "tv" ? "series" : null;
  if (!itemType) return null;

  const title = (itemType === "movie" ? raw.title : raw.name)?.trim();
  if (!title) return null;

  const date = itemType === "movie" ? raw.release_date : raw.first_air_date;

  return {
    itemType,
    tmdbId: raw.id,
    title,
    originalTitle:
      (itemType === "movie" ? raw.original_title : raw.original_name)?.trim() || null,
    coverUrl: raw.poster_path ? `${TMDB_IMAGE_BASE}${raw.poster_path}` : null,
    year: date ? Number(date.slice(0, 4)) || null : null,
    synopsis: raw.overview?.trim() || null,
    genres: resolveGenresFromIds(raw.genre_ids),
    role,
    character: role === "cast" ? (raw.character?.trim() || null) : null,
    voteAverage: typeof raw.vote_average === "number" ? raw.vote_average : null,
  };
}

export async function getPersonCombinedCredits(
  tmdbId: number
): Promise<PersonCreditEntry[]> {
  const data = await tmdbGet<{
    cast?: TmdbCombinedCreditEntry[];
    crew?: TmdbCombinedCreditEntry[];
  }>(`/person/${tmdbId}/combined_credits?language=es-ES`);
  if (!data) return [];

  const out: PersonCreditEntry[] = [];
  // Dedupe por (ítem, ROL), no por ítem: quien actúa y además dirige la misma
  // película tiene DOS créditos ahí, y el centro de la ficha los pinta como dos
  // chips en una sola fila. Lo que sí colapsa es "Writer" + "Story" en la misma
  // obra, que mapean los dos a `writer`.
  const seen = new Set<string>();

  const push = (raw: TmdbCombinedCreditEntry, role: CreditRole) => {
    const entry = mapCombinedEntry(raw, role);
    if (!entry) return;
    const key = `${entry.itemType}:${entry.tmdbId}:${entry.role}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };

  for (const raw of data.cast ?? []) push(raw, "cast");
  for (const raw of data.crew ?? []) {
    const role = mapTmdbJob(raw.job);
    if (role) push(raw, role);
  }

  return out;
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/catalog/person-credits.test.ts`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Comprobar tipos (el import cruzado people↔catalog es nuevo en este sentido)**

Run: `npx tsc --noEmit`
Esperado: sin errores. `tmdb.ts` ya importaba `CreditRole` de `@/lib/people/types` (línea 1), así que el sentido de la dependencia no cambia.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/tmdb.ts src/lib/catalog/person-credits.test.ts
git commit -m "feat(catalog): getPersonCombinedCredits, la filmografia completa de TMDB"
```

---

### Task 4: `getAuthorWorks` — la bibliografía de Open Library

**Files:**
- Create: `src/lib/catalog/openlibrary/author-works.ts`
- Test: `src/lib/catalog/openlibrary/author-works.test.ts`

**Interfaces:**
- Consumes: `buildCoverUrl` de `./covers` (verificar la firma exacta al implementar; en el repo es `covers.ts:7`, `buildCoverUrl(coverId, size)` → `https://covers.openlibrary.org/b/id/{id}-{size}.jpg`).
- Produces:

```ts
export type AuthorWork = {
  workKey: string;   // "/works/OL123W" — el formato que usa books.openlibrary_work_key
  title: string;
  coverUrl: string | null;
};

export async function getAuthorWorks(authorKey: string): Promise<AuthorWork[]>;
```

- [ ] **Step 1: Escribir el test que falla**

`src/lib/catalog/openlibrary/author-works.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthorWorks } from "./author-works";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockOk(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

describe("getAuthorWorks", () => {
  it("mapea entries a workKey/title/coverUrl", async () => {
    mockOk({
      entries: [
        { key: "/works/OL1W", title: "Fundación", covers: [111] },
        { key: "/works/OL2W", title: "Yo, robot", covers: [] },
      ],
    });

    const works = await getAuthorWorks("OL34221A");

    expect(works).toEqual([
      {
        workKey: "/works/OL1W",
        title: "Fundación",
        coverUrl: "https://covers.openlibrary.org/b/id/111-L.jpg",
      },
      { workKey: "/works/OL2W", title: "Yo, robot", coverUrl: null },
    ]);
  });

  it("normaliza la clave del autor: acepta 'OL1A' y '/authors/OL1A'", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await getAuthorWorks("/authors/OL1A");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/authors/OL1A/works.json");
  });

  it("descarta entradas sin title o sin key", async () => {
    mockOk({
      entries: [
        { key: "/works/OL1W", title: "" },
        { title: "Sin clave" },
        { key: "/works/OL3W", title: "Buena" },
      ],
    });

    const works = await getAuthorWorks("OL1A");

    expect(works.map((w) => w.workKey)).toEqual(["/works/OL3W"]);
  });

  it("descarta covers negativos (OL usa -1 para 'no hay portada')", async () => {
    mockOk({ entries: [{ key: "/works/OL1W", title: "T", covers: [-1, 222] }] });

    const works = await getAuthorWorks("OL1A");

    expect(works[0].coverUrl).toBe("https://covers.openlibrary.org/b/id/222-L.jpg");
  });

  it("respuesta no ok -> []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await getAuthorWorks("OL1A")).toEqual([]);
  });

  it("fetch que lanza -> [] (nunca propaga)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("red caída")));
    expect(await getAuthorWorks("OL1A")).toEqual([]);
  });

  it("clave vacía -> [] sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getAuthorWorks("")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npm test -- src/lib/catalog/openlibrary/author-works.test.ts`
Esperado: FAIL — `Failed to resolve import "./author-works"`.

- [ ] **Step 3: Implementar**

`src/lib/catalog/openlibrary/author-works.ts`:

```ts
// La bibliografía de un autor en UNA llamada: /authors/{key}/works.json.
// Es la simétrica de getPersonCombinedCredits (TMDB) para el lado de los libros.
//
// LÍMITE ASUMIDO: `limit=1000` es el tope de la API en una sola página y NO se
// pagina. Un segundo viaje HTTP dentro de un render por un autor con más de mil
// obras no compensa. Ver la issue de deuda del spec de 2026-08-12.
//
// RUIDO CONOCIDO: /works de un autor mezcla la obra original con traducciones,
// recopilaciones y ediciones registradas como obra. NO se desduplica por título
// a propósito: produce falsos positivos («Fundación» y «Fundación e Imperio» no
// son la misma obra). Se descarta solo lo que no tenga title o key.

const WORKS_LIMIT = 1000;
const REVALIDATE_SECONDS = 86400;

export type AuthorWork = {
  /** "/works/OL123W" — el mismo formato que `books.openlibrary_work_key`. */
  workKey: string;
  title: string;
  coverUrl: string | null;
};

type AuthorWorksResponse = {
  entries?: Array<{
    key?: string;
    title?: string;
    covers?: number[];
  }>;
};

// Acepta "OL1A" y "/authors/OL1A": `people.openlibrary_key` guarda la forma
// corta (findOrCreateBookAuthor hace `.replace("/authors/", "")`), pero no
// cuesta nada tolerar la larga.
function normalizeAuthorKey(key: string): string {
  return key.trim().replace(/^\/?authors\//, "");
}

export async function getAuthorWorks(authorKey: string): Promise<AuthorWork[]> {
  const key = normalizeAuthorKey(authorKey ?? "");
  if (!key) return [];

  try {
    const res = await fetch(
      `https://openlibrary.org/authors/${key}/works.json?limit=${WORKS_LIMIT}`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!res.ok) return [];

    const data: AuthorWorksResponse = await res.json();
    const out: AuthorWork[] = [];
    const seen = new Set<string>();

    for (const entry of data.entries ?? []) {
      const workKey = entry.key?.trim();
      const title = entry.title?.trim();
      if (!workKey || !title) continue;
      if (seen.has(workKey)) continue;
      seen.add(workKey);

      // OL usa -1 (y a veces 0) para «no hay portada».
      const coverId = entry.covers?.find((id) => id > 0);
      out.push({
        workKey,
        title,
        coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
      });
    }

    return out;
  } catch (error) {
    console.error("getAuthorWorks failed", { authorKey, error });
    return [];
  }
}
```

⚠️ Si `./covers.ts` exporta un helper con esta forma exacta (`buildCoverUrl(coverId, "L")`), **usarlo en lugar del literal** y ajustar el test. Comprobarlo con `Read src/lib/catalog/openlibrary/covers.ts` antes de implementar.

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/catalog/openlibrary/author-works.test.ts`
Esperado: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary/author-works.ts src/lib/catalog/openlibrary/author-works.test.ts
git commit -m "feat(catalog): getAuthorWorks, la bibliografia completa de Open Library"
```

---

### Task 5: `findOrCreateCatalogItemsBulk` — alta de catálogo en lote

**Files:**
- Modify: `src/lib/catalog/find-or-create.ts`
- Test: `src/lib/catalog/find-or-create-bulk.test.ts`

⚠️ **Por qué existe.** `findOrCreateCatalogItem` resuelve **un** ítem por llamada (un `select` + un `insert`). Para una filmografía de 300 créditos son ~600 viajes a la base dentro de un render: inviable. Con el lote, la hidratación entera son **~6 consultas**.

**Interfaces:**
- Consumes: `SearchResult` de `./types`; `TABLE_BY_TYPE` / `ID_COLUMN_BY_TYPE` (ya en el fichero, líneas 6–16).
- Produces:

```ts
export async function findOrCreateCatalogItemsBulk(
  supabase: SupabaseServerClient,
  results: SearchResult[]
): Promise<Map<string, string>>; // clave `${itemType}:${externalId}` -> catalogId
```

- [ ] **Step 1: Escribir el test que falla**

`src/lib/catalog/find-or-create-bulk.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { findOrCreateCatalogItemsBulk } from "./find-or-create";
import type { SearchResult } from "./types";

function movie(externalId: string, title: string): SearchResult {
  return {
    itemType: "movie",
    externalId,
    title,
    subtitle: null,
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
  } as SearchResult;
}

/**
 * Doble mínimo del cliente de Supabase para el camino del lote:
 * `.from(t).select(c).in(col, ids)` y `.from(t).insert(rows).select(c)`.
 * `existing` son las filas que ya están; `inserted`, las que devuelve el insert.
 */
function fakeSupabase(opts: {
  existing: Array<{ id: string; tmdb_id: number }>;
  inserted?: Array<{ id: string; tmdb_id: number }>;
  insertError?: { code: string } | null;
  onInsert?: (rows: unknown[]) => void;
}) {
  const selectCalls: unknown[] = [];
  const insertCalls: unknown[][] = [];

  const api = {
    from() {
      return {
        select() {
          return {
            in(_col: string, ids: unknown[]) {
              selectCalls.push(ids);
              return Promise.resolve({ data: opts.existing, error: null });
            },
          };
        },
        insert(rows: unknown[]) {
          insertCalls.push(rows);
          opts.onInsert?.(rows);
          return {
            select() {
              return Promise.resolve({
                data: opts.insertError ? null : (opts.inserted ?? []),
                error: opts.insertError ?? null,
              });
            },
          };
        },
      };
    },
    _selectCalls: selectCalls,
    _insertCalls: insertCalls,
  };
  return api;
}

describe("findOrCreateCatalogItemsBulk", () => {
  it("lote vacío -> mapa vacío, sin tocar la base", async () => {
    const supabase = fakeSupabase({ existing: [] });
    const map = await findOrCreateCatalogItemsBulk(supabase as never, []);
    expect(map.size).toBe(0);
    expect(supabase._selectCalls).toHaveLength(0);
  });

  it("todos existentes -> un solo select, ningún insert", async () => {
    const supabase = fakeSupabase({ existing: [{ id: "uuid-1", tmdb_id: 1 }] });

    const map = await findOrCreateCatalogItemsBulk(supabase as never, [movie("1", "A")]);

    expect(map.get("movie:1")).toBe("uuid-1");
    expect(supabase._selectCalls).toHaveLength(1);
    expect(supabase._insertCalls).toHaveLength(0);
  });

  it("lote mixto -> inserta SOLO los que faltan, en UNA llamada", async () => {
    const supabase = fakeSupabase({
      existing: [{ id: "uuid-1", tmdb_id: 1 }],
      inserted: [
        { id: "uuid-2", tmdb_id: 2 },
        { id: "uuid-3", tmdb_id: 3 },
      ],
    });

    const map = await findOrCreateCatalogItemsBulk(supabase as never, [
      movie("1", "A"),
      movie("2", "B"),
      movie("3", "C"),
    ]);

    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toHaveLength(2);
    expect([...map.entries()].sort()).toEqual([
      ["movie:1", "uuid-1"],
      ["movie:2", "uuid-2"],
      ["movie:3", "uuid-3"],
    ]);
  });

  it("deduplica externalId repetidos antes de insertar", async () => {
    const supabase = fakeSupabase({
      existing: [],
      inserted: [{ id: "uuid-9", tmdb_id: 9 }],
    });

    await findOrCreateCatalogItemsBulk(supabase as never, [
      movie("9", "Repe"),
      movie("9", "Repe"),
    ]);

    expect(supabase._insertCalls[0]).toHaveLength(1);
  });

  it("42501 (anónimo sin grant) -> devuelve solo los existentes, sin lanzar", async () => {
    const supabase = fakeSupabase({
      existing: [{ id: "uuid-1", tmdb_id: 1 }],
      insertError: { code: "42501" },
    });

    const map = await findOrCreateCatalogItemsBulk(supabase as never, [
      movie("1", "A"),
      movie("2", "B"),
    ]);

    expect(map.get("movie:1")).toBe("uuid-1");
    expect(map.has("movie:2")).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npm test -- src/lib/catalog/find-or-create-bulk.test.ts`
Esperado: FAIL — `findOrCreateCatalogItemsBulk is not a function`.

- [ ] **Step 3: Implementar en `src/lib/catalog/find-or-create.ts`**

Añadir **antes** de `findOrCreateCatalogItem`:

```ts
// Extraído para que el alta de UNO y el alta EN LOTE construyan exactamente la
// misma fila y no puedan divergir.
function catalogInsertPayload(result: SearchResult) {
  return result.itemType === "book"
    ? {
        openlibrary_work_key: result.externalId,
        title: result.title,
        author: result.subtitle,
        cover_url: result.coverUrl,
        published_year: result.year,
      }
    : {
        tmdb_id: Number(result.externalId),
        title: result.title,
        original_title: result.originalTitle ?? null,
        cover_url: result.coverUrl,
        release_year: result.year,
        synopsis: result.synopsis,
        genres: result.genres,
      };
}

/**
 * Alta de catálogo EN LOTE: un `select` + un `insert` POR TIPO, en vez de dos
 * consultas por ítem. Devuelve `${itemType}:${externalId}` -> id de catálogo.
 *
 * Existe por la hidratación de la ficha de persona: una filmografía de 300
 * créditos por el camino de uno-en-uno son ~600 viajes a la base dentro de un
 * render. Con el lote, la hidratación entera son ~6 consultas.
 *
 * NO registra ediciones de libro (`ensureBookEdition`): eso necesita el ISBN de
 * la tirada que el usuario tiene en la mano y un userId, y el lote no tiene ni
 * lo uno ni lo otro. Ese camino se queda en `findOrCreateCatalogItem`.
 *
 * NUNCA lanza: el llamador es un render de lectura. Si el insert falla se
 * devuelven los que sí se resolvieron.
 *   - 42501 = visitante ANÓNIMO sin grant de escritura sobre el catálogo.
 *     Esperado e inocuo desde la navegación anónima (#359/#360): la ficha se
 *     pinta igual desde la respuesta de la API y persiste el primer visitante
 *     con sesión. No se registra.
 *   - 23505 = otro render insertó los mismos ítems a la vez. Se recuperan los
 *     ids re-seleccionando el lote entero, igual que findOrCreatePeopleByTmdb.
 */
export async function findOrCreateCatalogItemsBulk(
  supabase: SupabaseServerClient,
  results: SearchResult[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (results.length === 0) return map;

  const byType = new Map<SearchResult["itemType"], Map<string, SearchResult>>();
  for (const r of results) {
    let bucket = byType.get(r.itemType);
    if (!bucket) {
      bucket = new Map();
      byType.set(r.itemType, bucket);
    }
    if (!bucket.has(r.externalId)) bucket.set(r.externalId, r);
  }

  await Promise.all(
    [...byType.entries()].map(async ([itemType, bucket]) => {
      const table = TABLE_BY_TYPE[itemType];
      const idColumn = ID_COLUMN_BY_TYPE[itemType];
      const toExternal = (value: unknown) => String(value);
      const externalIds = [...bucket.keys()];
      const queryIds =
        itemType === "book" ? externalIds : externalIds.map((id) => Number(id));

      const readExisting = async () => {
        const { data } = await supabase
          .from(table)
          .select(`id, ${idColumn}`)
          .in(idColumn as never, queryIds as never);
        for (const row of (data ?? []) as Array<Record<string, unknown>>) {
          map.set(`${itemType}:${toExternal(row[idColumn])}`, row.id as string);
        }
      };

      await readExisting();

      const missing = externalIds.filter((id) => !map.has(`${itemType}:${id}`));
      if (missing.length === 0) return;

      const payload = missing.map((id) => catalogInsertPayload(bucket.get(id)!));

      const { data: inserted, error } = await supabase
        .from(table)
        .insert(payload as never)
        .select(`id, ${idColumn}`);

      if (error) {
        if (error.code === "23505") {
          await readExisting();
        } else if (error.code !== "42501") {
          console.error("catalog bulk insert failed", {
            itemType,
            count: payload.length,
            error,
          });
        }
        return;
      }

      for (const row of (inserted ?? []) as Array<Record<string, unknown>>) {
        map.set(`${itemType}:${toExternal(row[idColumn])}`, row.id as string);
      }
    })
  );

  return map;
}
```

Y en `findOrCreateCatalogItem`, sustituir el objeto `payload` en línea (líneas 47–71) por la llamada al helper compartido, dejando el resto del cuerpo intacto:

```ts
  const payload = catalogInsertPayload(result);
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/catalog/find-or-create-bulk.test.ts`
Esperado: PASS, 5 tests.

- [ ] **Step 5: Ejecutar TODA la suite — `findOrCreateCatalogItem` lo usan búsqueda, alta y sagas**

Run: `npm test`
Esperado: PASS, sin regresiones. Si algún test de `find-or-create` o de sagas falla, el refactor del `payload` cambió una fila: comparar con `git diff` y corregir.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/find-or-create.ts src/lib/catalog/find-or-create-bulk.test.ts
git commit -m "feat(catalog): alta de catalogo en lote (findOrCreateCatalogItemsBulk)"
```

---

### Task 6: `hydratePersonCredits` — el orquestador

**Files:**
- Create: `src/lib/people/hydrate-person-credits.ts`
- Test: `src/lib/people/hydrate-person-credits.test.ts`

**Interfaces:**
- Consumes: `getPersonCombinedCredits` (Task 3), `getAuthorWorks` (Task 4), `findOrCreateCatalogItemsBulk` (Task 5).
- Produces:

```ts
export type HydratablePerson = {
  id: string;
  tmdbId: number | null;
  openlibraryKey: string | null;
  creditsHydratedAt: string | null;
};

export function needsCreditHydration(person: HydratablePerson): boolean;

export async function hydratePersonCredits(
  supabase: SupabaseServerClient,
  person: HydratablePerson
): Promise<void>;
```

- [ ] **Step 1: Escribir el test que falla**

`src/lib/people/hydrate-person-credits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { needsCreditHydration } from "./hydrate-person-credits";

describe("needsCreditHydration", () => {
  it("con tmdbId y sin marca -> sí", () => {
    expect(
      needsCreditHydration({ id: "p", tmdbId: 500, openlibraryKey: null, creditsHydratedAt: null })
    ).toBe(true);
  });

  it("con openlibraryKey y sin marca -> sí", () => {
    expect(
      needsCreditHydration({ id: "p", tmdbId: null, openlibraryKey: "OL1A", creditsHydratedAt: null })
    ).toBe(true);
  });

  it("ya marcada -> no, aunque tenga id externo", () => {
    expect(
      needsCreditHydration({
        id: "p",
        tmdbId: 500,
        openlibraryKey: null,
        creditsHydratedAt: "2026-08-12T00:00:00Z",
      })
    ).toBe(false);
  });

  it("sin ningún id externo -> no (no hay a quién preguntar)", () => {
    expect(
      needsCreditHydration({ id: "p", tmdbId: null, openlibraryKey: null, creditsHydratedAt: null })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npm test -- src/lib/people/hydrate-person-credits.test.ts`
Esperado: FAIL — `Failed to resolve import "./hydrate-person-credits"`.

- [ ] **Step 3: Implementar**

`src/lib/people/hydrate-person-credits.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType, SearchResult } from "@/lib/catalog/types";
import { getPersonCombinedCredits } from "@/lib/catalog/tmdb";
import { getAuthorWorks } from "@/lib/catalog/openlibrary/author-works";
import { findOrCreateCatalogItemsBulk } from "@/lib/catalog/find-or-create";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HydratablePerson = {
  id: string;
  tmdbId: number | null;
  openlibraryKey: string | null;
  creditsHydratedAt: string | null;
};

// Solo hidrata quien tiene a quién preguntar y no se ha hidratado ya. La marca
// es definitiva: no se re-consulta la API por persona hidratada. Un backfill de
// obra NUEVA de una persona ya hidratada es trabajo aparte (issue de deuda).
export function needsCreditHydration(person: HydratablePerson): boolean {
  if (person.creditsHydratedAt) return false;
  return person.tmdbId != null || Boolean(person.openlibraryKey);
}

type PendingCredit = {
  itemType: ItemType;
  externalId: string;
  role: string;
  character: string | null;
};

/**
 * Trae la obra COMPLETA de una persona desde su API externa y la persiste:
 * catálogo (en lote) + `credits` (un solo insert) + la marca.
 *
 * Arregla el bug de fondo de la ficha: `credits` solo tenía lo que alguien
 * hubiera abierto alguna vez, así que una persona con una sola película en BD
 * afirmaba —sin matices— que esa era toda su obra.
 *
 * NUNCA lanza. Un fallo de API externa degrada la ficha a lo que ya hubiera en
 * BD; no la rompe. Mismo criterio que ensureItemEnriched y
 * populateTmdbCollection.
 */
export async function hydratePersonCredits(
  supabase: SupabaseServerClient,
  person: HydratablePerson
): Promise<void> {
  if (!needsCreditHydration(person)) return;

  try {
    const searchResults: SearchResult[] = [];
    const pending: PendingCredit[] = [];

    if (person.tmdbId != null) {
      for (const c of await getPersonCombinedCredits(person.tmdbId)) {
        searchResults.push({
          itemType: c.itemType,
          externalId: String(c.tmdbId),
          title: c.title,
          originalTitle: c.originalTitle,
          subtitle: null,
          coverUrl: c.coverUrl,
          year: c.year,
          synopsis: c.synopsis,
          genres: c.genres,
        } as SearchResult);
        pending.push({
          itemType: c.itemType,
          externalId: String(c.tmdbId),
          role: c.role,
          character: c.character,
        });
      }
    } else if (person.openlibraryKey) {
      for (const w of await getAuthorWorks(person.openlibraryKey)) {
        searchResults.push({
          itemType: "book",
          externalId: w.workKey,
          title: w.title,
          subtitle: null,
          coverUrl: w.coverUrl,
          year: null,
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

    // La API no devolvió nada (o no hay clave): NO se marca. Un fallo temporal
    // de red no debe condenar a esta persona a no hidratarse nunca.
    if (searchResults.length === 0) return;

    const idsByExternal = await findOrCreateCatalogItemsBulk(supabase, searchResults);

    // El anónimo no pudo escribir catálogo (42501): sin ids no hay créditos que
    // insertar ni marca que poner. La ficha se pinta igual desde la respuesta de
    // la API; persistirá el primer visitante con sesión.
    if (idsByExternal.size === 0) return;

    const rows = pending
      .map((p) => {
        const itemId = idsByExternal.get(`${p.itemType}:${p.externalId}`);
        if (!itemId) return null;
        return {
          item_type: p.itemType,
          item_id: itemId,
          person_id: person.id,
          role: p.role,
          character: p.character,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      const { error } = await supabase.from("credits").insert(rows);
      // 23505 = los créditos ya estaban (ensureItemEnriched los escribió al
      // abrir la ficha de una de las obras). Esperado e inocuo: es justo el
      // caso normal, la persona llegó a `people` POR uno de esos créditos.
      // 42501 = anónimo. Cualquier otro error sí se registra.
      if (error && error.code !== "23505" && error.code !== "42501") {
        console.error("person credits insert failed", {
          personId: person.id,
          count: rows.length,
          error,
        });
        return;
      }
    }

    const { error: markError } = await supabase
      .from("people")
      .update({ credits_hydrated_at: new Date().toISOString() })
      .eq("id", person.id);
    if (markError && markError.code !== "42501") {
      console.error("credits_hydrated_at update failed", { personId: person.id, error: markError });
    }
  } catch (error) {
    console.error("hydratePersonCredits failed", { personId: person.id, error });
  }
}
```

⚠️ **El insert de `credits` puede chocar con filas ya existentes.** Si `credits` tiene índice único sobre `(item_type, item_id, person_id, role)`, el `insert` en bloque falla ENTERO con 23505 y no se inserta ninguna de las nuevas. **Comprobarlo antes de dar la tarea por buena**:

```sql
select indexname, indexdef from pg_indexes
where schemaname='public' and tablename='credits';
```

Si existe ese índice único, cambiar el `insert` por un upsert que ignore duplicados:

```ts
      const { error } = await supabase
        .from("credits")
        .upsert(rows, { onConflict: "item_type,item_id,person_id,role", ignoreDuplicates: true });
```

Si NO existe, hay que **filtrar los créditos ya presentes** antes de insertar (un `select item_type, item_id, role from credits where person_id = ...` y descartar los que casen), o la hidratación duplicará las filas que `ensureItemEnriched` ya escribió. Elegir según lo que diga `pg_indexes` y **anotar la decisión en el commit**.

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/people/hydrate-person-credits.test.ts`
Esperado: PASS, 4 tests.

- [ ] **Step 5: Comprobar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores. Si `SearchResult` exige campos que aquí no se pasan (p. ej. `matchedIsbn`), añadirlos como `null` en lugar de ensanchar el cast.

- [ ] **Step 6: Commit**

```bash
git add src/lib/people/hydrate-person-credits.ts src/lib/people/hydrate-person-credits.test.ts
git commit -m "feat(people): hidratar la obra completa de una persona (TMDB y Open Library)"
```

---

## Fase B — Datos del perfil

### Task 7: Tipos del perfil y funciones puras de derivación

**Files:**
- Create: `src/lib/people/profile-types.ts`
- Create: `src/lib/people/derive-person-works.ts`
- Test: `src/lib/people/derive-person-works.test.ts`

**Interfaces:**
- Produces (`profile-types.ts`):

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole, Person } from "./types";

export type WorkStatus = "planned" | "in_progress" | "completed" | "dropped";

export type ProfileWork = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  href: string;
  year: number | null;
  /** Minutos en película; en serie, duración de episodio. Null si no se sabe. */
  durationMinutes: number | null;
  /** TODOS los créditos de ESTA persona en ESTA obra. Nunca vacío. */
  roles: CreditRole[];
  /** Personaje, si alguno de sus créditos es `cast`. */
  character: string | null;
  /** Media de la comunidad (1–10), o null. */
  globalRating: number | null;
  sagaId: string | null;
  sagaName: string | null;
  /** Estado del VISITANTE. Todo null sin sesión. */
  status: WorkStatus | null;
  userRating: number | null;
  finishedOn: string | null;
  progressPercent: number | null;
};

export type Collaborator = {
  id: string;
  name: string;
  photoUrl: string | null;
  href: string;
  role: CreditRole;
  sharedCount: number;
};

export type SagaProgress = {
  sagaId: string;
  name: string;
  href: string;
  total: number;
  completed: number;
};

export type PersonProfile = {
  person: Person;
  works: ProfileWork[];
  roleCounts: Array<{ role: CreditRole; count: number }>;
  collaborators: Collaborator[];
  sagas: SagaProgress[];
  /** Media del visitante sobre las obras de esta persona (1–10), o null. */
  userAverage: number | null;
  /** Media de la comunidad sobre las obras de esta persona (1–10), o null. */
  globalAverage: number | null;
};
```

- Produces (`derive-person-works.ts`): `deriveRoleCounts`, `deriveDominantType`, `deriveLibrarySummary`, `pickFeatured`, `splitFeaturedAndRest`, `groupByYear`, `deriveRoleSections`, `deriveCollaborators`, `filterWorks`.

- [ ] **Step 1: Escribir los tipos**

Crear `src/lib/people/profile-types.ts` con el bloque de arriba, tal cual.

- [ ] **Step 2: Escribir el test que falla**

`src/lib/people/derive-person-works.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CreditRole } from "./types";
import type { ProfileWork } from "./profile-types";
import {
  deriveCollaborators,
  deriveDominantType,
  deriveLibrarySummary,
  deriveRoleCounts,
  deriveRoleSections,
  filterWorks,
  groupByYear,
  pickFeatured,
  splitFeaturedAndRest,
} from "./derive-person-works";

function work(over: Partial<ProfileWork> & { itemId: string }): ProfileWork {
  return {
    itemType: "movie",
    title: `Obra ${over.itemId}`,
    coverUrl: null,
    href: `/pelicula/${over.itemId}`,
    year: 2000,
    durationMinutes: null,
    roles: ["cast"] as CreditRole[],
    character: null,
    globalRating: null,
    sagaId: null,
    sagaName: null,
    status: null,
    userRating: null,
    finishedOn: null,
    progressPercent: null,
    ...over,
  } as ProfileWork;
}

describe("deriveRoleCounts", () => {
  it("cuenta por rol y ORDENA por volumen descendente", () => {
    const works = [
      work({ itemId: "1", roles: ["cast"] }),
      work({ itemId: "2", roles: ["cast"] }),
      work({ itemId: "3", roles: ["director"] }),
      work({ itemId: "4", roles: ["cast", "director"] }),
    ];

    expect(deriveRoleCounts(works)).toEqual([
      { role: "cast", count: 3 },
      { role: "director", count: 2 },
    ]);
  });

  it("una obra con dos roles cuenta en LOS DOS", () => {
    const counts = deriveRoleCounts([work({ itemId: "1", roles: ["cast", "director"] })]);
    expect(counts).toEqual([
      { role: "cast", count: 1 },
      { role: "director", count: 1 },
    ]);
  });
});

describe("deriveDominantType", () => {
  it("mayoría de pantalla -> watched", () => {
    expect(
      deriveDominantType([
        work({ itemId: "1", itemType: "movie" }),
        work({ itemId: "2", itemType: "series" }),
        work({ itemId: "3", itemType: "book" }),
      ])
    ).toBe("watched");
  });

  it("mayoría de libros -> read", () => {
    expect(
      deriveDominantType([
        work({ itemId: "1", itemType: "book" }),
        work({ itemId: "2", itemType: "book" }),
        work({ itemId: "3", itemType: "movie" }),
      ])
    ).toBe("read");
  });

  it("empate exacto -> mixed", () => {
    expect(
      deriveDominantType([
        work({ itemId: "1", itemType: "book" }),
        work({ itemId: "2", itemType: "movie" }),
      ])
    ).toBe("mixed");
  });
});

describe("deriveLibrarySummary", () => {
  it("M>=3 y N>=1 -> visible, con recuento y verbo", () => {
    const works = [
      work({ itemId: "1", status: "completed" }),
      work({ itemId: "2", status: "planned" }),
      work({ itemId: "3" }),
    ];

    expect(deriveLibrarySummary(works)).toEqual({
      visible: true,
      total: 3,
      done: 1,
      verb: "watched",
    });
  });

  it("M < 3 -> NO visible («has visto 0 de 1» no informa de nada)", () => {
    expect(deriveLibrarySummary([work({ itemId: "1", status: "completed" })]).visible).toBe(false);
  });

  it("N === 0 -> NO visible", () => {
    expect(
      deriveLibrarySummary([work({ itemId: "1" }), work({ itemId: "2" }), work({ itemId: "3" })])
        .visible
    ).toBe(false);
  });
});

describe("pickFeatured", () => {
  it("prioriza tu nota alta, luego la global, luego la más reciente", () => {
    const works = [
      work({ itemId: "reciente", year: 2024 }),
      work({ itemId: "global", globalRating: 9 }),
      work({ itemId: "mia", userRating: 8 }),
      work({ itemId: "vieja", year: 1990 }),
    ];

    expect(pickFeatured(works).map((w) => w.itemId)).toEqual([
      "mia",
      "global",
      "reciente",
      "vieja",
    ]);
  });

  it("tope de 5", () => {
    const works = Array.from({ length: 9 }, (_, i) => work({ itemId: String(i), year: 2000 + i }));
    expect(pickFeatured(works)).toHaveLength(5);
  });

  it("con menos de 4 obras NO hay destacadas", () => {
    expect(pickFeatured([work({ itemId: "1" }), work({ itemId: "2" }), work({ itemId: "3" })])).toEqual(
      []
    );
  });
});

describe("splitFeaturedAndRest", () => {
  it("las destacadas NO se repiten en el resto", () => {
    const works = Array.from({ length: 8 }, (_, i) =>
      work({ itemId: String(i), year: 2000 + i })
    );

    const { featured, rest } = splitFeaturedAndRest(works);

    expect(featured).toHaveLength(5);
    expect(rest).toHaveLength(3);
    const featuredIds = new Set(featured.map((w) => w.itemId));
    expect(rest.every((w) => !featuredIds.has(w.itemId))).toBe(true);
  });
});

describe("groupByYear", () => {
  it("agrupa por año descendente; los sin año van al final", () => {
    const groups = groupByYear([
      work({ itemId: "a", year: 1999 }),
      work({ itemId: "b", year: 2020 }),
      work({ itemId: "c", year: null }),
      work({ itemId: "d", year: 2020 }),
    ]);

    expect(groups.map((g) => g.year)).toEqual([2020, 1999, null]);
    expect(groups[0].works.map((w) => w.itemId)).toEqual(["b", "d"]);
  });
});

describe("deriveRoleSections", () => {
  it("rol secundario con >=3 obras -> secciones", () => {
    const works = [
      ...Array.from({ length: 4 }, (_, i) => work({ itemId: `d${i}`, roles: ["director"] })),
      ...Array.from({ length: 3 }, (_, i) => work({ itemId: `c${i}`, roles: ["cast"] })),
    ];

    const sections = deriveRoleSections(works);

    expect(sections.map((s) => [s.role, s.works.length])).toEqual([
      ["director", 4],
      ["cast", 3],
    ]);
  });

  it("rol secundario con >=20% del total -> secciones aunque sean 2 obras", () => {
    const works = [
      ...Array.from({ length: 8 }, (_, i) => work({ itemId: `d${i}`, roles: ["director"] })),
      work({ itemId: "c0", roles: ["cast"] }),
      work({ itemId: "c1", roles: ["cast"] }),
    ];

    expect(deriveRoleSections(works)).toHaveLength(2);
  });

  it("un cameo suelto NO genera sección -> lista plana ([])", () => {
    const works = [
      ...Array.from({ length: 10 }, (_, i) => work({ itemId: `d${i}`, roles: ["director"] })),
      work({ itemId: "c0", roles: ["cast"] }),
    ];

    expect(deriveRoleSections(works)).toEqual([]);
  });

  it("un solo rol -> lista plana", () => {
    expect(deriveRoleSections([work({ itemId: "1", roles: ["cast"] })])).toEqual([]);
  });
});

describe("filterWorks", () => {
  const works = [
    work({ itemId: "1", itemType: "movie", roles: ["cast"] }),
    work({ itemId: "2", itemType: "series", roles: ["director"] }),
    work({ itemId: "3", itemType: "book", roles: ["author"] }),
    work({ itemId: "4", itemType: "movie", roles: ["cast", "director"] }),
  ];

  it("sin filtros -> todo", () => {
    expect(filterWorks(works, {})).toHaveLength(4);
  });

  it("filtra por tipo", () => {
    expect(filterWorks(works, { type: "movie" }).map((w) => w.itemId)).toEqual(["1", "4"]);
  });

  it("filtra por crédito, incluyendo obras con varios roles", () => {
    expect(filterWorks(works, { role: "director" }).map((w) => w.itemId)).toEqual(["2", "4"]);
  });

  it("combina tipo y crédito", () => {
    expect(filterWorks(works, { type: "movie", role: "director" }).map((w) => w.itemId)).toEqual([
      "4",
    ]);
  });
});

describe("deriveCollaborators", () => {
  it("solo personas con >=2 obras compartidas, ordenadas por recuento", () => {
    const rows = [
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:1" },
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:2" },
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:3" },
      { personId: "b", name: "Bea", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:1" },
      { personId: "b", name: "Bea", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:2" },
      { personId: "c", name: "Caro", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:1" },
    ];

    const out = deriveCollaborators(rows);

    expect(out.map((c) => [c.id, c.sharedCount])).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    expect(out[0].href).toBe("/persona/a");
  });

  it("la misma obra contada dos veces (dos roles) NO infla el recuento", () => {
    const rows = [
      { personId: "a", name: "Ana", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:1" },
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:1" },
    ];

    expect(deriveCollaborators(rows)).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar el test y comprobar que falla**

Run: `npm test -- src/lib/people/derive-person-works.test.ts`
Esperado: FAIL — `Failed to resolve import "./derive-person-works"`.

- [ ] **Step 4: Implementar**

`src/lib/people/derive-person-works.ts`:

```ts
import type { ItemType } from "@/lib/catalog/types";
import { personHref } from "@/lib/catalog/item-href";
import type { CreditRole } from "./types";
import type { Collaborator, ProfileWork } from "./profile-types";

const FEATURED_MAX = 5;
// Con 3 obras o menos no hay «destacadas»: destacar 3 de 3 no destaca nada, y
// la lista de abajo se quedaría vacía. Ver los estados de volumen del spec.
const FEATURED_MIN_WORKS = 4;
// Umbral de sección por rol: un cameo suelto no parte el centro en dos.
const SECTION_MIN_WORKS = 3;
const SECTION_MIN_SHARE = 0.2;
const COLLABORATOR_MIN_SHARED = 2;

export function deriveRoleCounts(works: ProfileWork[]): Array<{ role: CreditRole; count: number }> {
  const counts = new Map<CreditRole, number>();
  for (const w of works) {
    // Una obra con dos créditos de la misma persona cuenta en LOS DOS chips: es
    // lo que hace que "Reparto · 12 / Dirección · 4" sume más que las obras.
    for (const role of new Set(w.roles)) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
}

export type DominantType = "watched" | "read" | "mixed";

// El verbo del resumen: "Has visto" (pantalla), "Has leído" (libros) o
// "Has registrado" (empate exacto).
export function deriveDominantType(works: ProfileWork[]): DominantType {
  let screen = 0;
  let books = 0;
  for (const w of works) {
    if (w.itemType === "book") books++;
    else screen++;
  }
  if (screen === books) return "mixed";
  return screen > books ? "watched" : "read";
}

export type LibrarySummary = {
  visible: boolean;
  total: number;
  done: number;
  verb: DominantType;
};

// "Has visto 0 de 1" no informa de nada y ocupa un bloque entero: el resumen
// solo aparece con al menos 3 obras y al menos una terminada.
export function deriveLibrarySummary(works: ProfileWork[]): LibrarySummary {
  const total = works.length;
  const done = works.filter((w) => w.status === "completed").length;
  return {
    visible: total >= 3 && done >= 1,
    total,
    done,
    verb: deriveDominantType(works),
  };
}

// Criterio del spec, EN ESTE ORDEN: tu nota alta > mejor nota global > más
// reciente. El orden es estable para que dos renders del mismo perfil no
// bailen.
export function pickFeatured(works: ProfileWork[], max = FEATURED_MAX): ProfileWork[] {
  if (works.length < FEATURED_MIN_WORKS) return [];
  return [...works]
    .sort(
      (a, b) =>
        (b.userRating ?? 0) - (a.userRating ?? 0) ||
        (b.globalRating ?? 0) - (a.globalRating ?? 0) ||
        (b.year ?? 0) - (a.year ?? 0) ||
        a.itemId.localeCompare(b.itemId)
    )
    .slice(0, max);
}

// La exclusión ES la razón de que la lista de abajo se titule "El resto, por
// año": sin ella las cinco destacadas salían DOS veces en la misma pantalla.
export function splitFeaturedAndRest(works: ProfileWork[]): {
  featured: ProfileWork[];
  rest: ProfileWork[];
} {
  const featured = pickFeatured(works);
  const ids = new Set(featured.map((w) => `${w.itemType}:${w.itemId}`));
  return { featured, rest: works.filter((w) => !ids.has(`${w.itemType}:${w.itemId}`)) };
}

export type YearGroup = { year: number | null; works: ProfileWork[] };

export function groupByYear(works: ProfileWork[]): YearGroup[] {
  const byYear = new Map<number | null, ProfileWork[]>();
  for (const w of works) {
    const bucket = byYear.get(w.year);
    if (bucket) bucket.push(w);
    else byYear.set(w.year, [w]);
  }
  return [...byYear.entries()]
    .map(([year, list]) => ({ year, works: list }))
    // Descendente, y las obras SIN año al final (no arriba: un null no es
    // "lo más reciente").
    .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
}

export type RoleSection = { role: CreditRole; works: ProfileWork[] };

// Parte el centro en "Como directora" / "Como intérprete" solo cuando el rol
// secundario pesa de verdad: >=3 obras o >=20% del total. Devuelve [] para
// "no partas nada, pinta una lista plana".
export function deriveRoleSections(works: ProfileWork[]): RoleSection[] {
  const counts = deriveRoleCounts(works);
  if (counts.length < 2) return [];

  const total = works.length;
  const qualifying = counts.filter(
    (c) => c.count >= SECTION_MIN_WORKS || c.count / total >= SECTION_MIN_SHARE
  );
  if (qualifying.length < 2) return [];

  return qualifying.map(({ role }) => ({
    role,
    works: works.filter((w) => w.roles.includes(role)),
  }));
}

export type WorkFilters = { type?: ItemType; role?: CreditRole };

export function filterWorks(works: ProfileWork[], filters: WorkFilters): ProfileWork[] {
  return works.filter(
    (w) =>
      (!filters.type || w.itemType === filters.type) &&
      (!filters.role || w.roles.includes(filters.role))
  );
}

export type CollaboratorRow = {
  personId: string;
  name: string;
  photoUrl: string | null;
  role: CreditRole;
  /** `${itemType}:${itemId}` — la clave por la que se cuentan OBRAS, no filas. */
  itemKey: string;
};

// "Colabora a menudo con": >=2 OBRAS compartidas. Se cuentan obras distintas,
// no filas de crédito — si no, alguien que actúa y dirige la misma película
// aparecería como colaborador habitual con una sola obra en común.
export function deriveCollaborators(rows: CollaboratorRow[]): Collaborator[] {
  const byPerson = new Map<
    string,
    { name: string; photoUrl: string | null; roles: Map<CreditRole, number>; items: Set<string> }
  >();

  for (const r of rows) {
    let entry = byPerson.get(r.personId);
    if (!entry) {
      entry = { name: r.name, photoUrl: r.photoUrl, roles: new Map(), items: new Set() };
      byPerson.set(r.personId, entry);
    }
    entry.items.add(r.itemKey);
    entry.roles.set(r.role, (entry.roles.get(r.role) ?? 0) + 1);
  }

  return [...byPerson.entries()]
    .filter(([, e]) => e.items.size >= COLLABORATOR_MIN_SHARED)
    .map(([id, e]) => ({
      id,
      name: e.name,
      photoUrl: e.photoUrl,
      href: personHref(id),
      // El rol con el que más veces coincide: es el que se enseña bajo el nombre.
      role: [...e.roles.entries()].sort((a, b) => b[1] - a[1])[0][0],
      sharedCount: e.items.size,
    }))
    .sort((a, b) => b.sharedCount - a.sharedCount || a.name.localeCompare(b.name));
}
```

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/people/derive-person-works.test.ts`
Esperado: PASS, 22 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/people/profile-types.ts src/lib/people/derive-person-works.ts src/lib/people/derive-person-works.test.ts
git commit -m "feat(people): tipos del perfil y derivacion pura de la obra de una persona"
```

---

### Task 8: `getPersonProfile` — el contrato de datos

**Files:**
- Create: `src/lib/people/get-person-profile.ts`
- Modify: `src/lib/people/get-person.ts` (exportar `enrichTmdbBio` y la lectura de la fila para no duplicarlas)

**Interfaces:**
- Consumes: `hydratePersonCredits` / `needsCreditHydration` (Task 6), `deriveCollaborators` (Task 7), `itemHref` / `personHref` / `sagaHref` (`@/lib/catalog/item-href`).
- Produces:

```ts
export async function getPersonProfile(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  personId: string
): Promise<PersonProfile | null>;
```

**Patrón de referencia:** `src/lib/sagas/get-saga-detail.ts` hace exactamente esta forma de consulta (catálogo por tipo en paralelo, estado desde `passes`, media de comunidad desde `passes` con rating no nulo y sin `dropped`). **Leerlo antes de escribir esta tarea** y seguir su estructura.

- [ ] **Step 1: Refactorizar `get-person.ts` para poder reutilizar la lectura de la persona**

En `src/lib/people/get-person.ts`, cambiar el `select` de `getPerson` (línea 117) para incluir la columna nueva, y exportar el tipo y el enriquecimiento:

```ts
export const PERSON_COLUMNS =
  "id, name, tmdb_id, openlibrary_key, photo_url, bio, birth_date, death_date, place_of_birth, credits_hydrated_at";

export type PersonRow = {
  id: string;
  name: string;
  tmdb_id: number | null;
  openlibrary_key: string | null;
  photo_url: string | null;
  bio: string | null;
  birth_date: string | null;
  death_date: string | null;
  place_of_birth: string | null;
  credits_hydrated_at: string | null;
};

export { toPerson, enrichTmdbBio };
```

Sustituir los tres literales de columnas del fichero (líneas 58, 117) por `PERSON_COLUMNS`, y añadir `openlibrary_key` y `credits_hydrated_at` al tipo `PersonRow` existente.

⚠️ **`enrichTmdbBio` hace un `.update(...).select(PERSON_COLUMNS)`.** `credits_hydrated_at` entra ahí en el `select` (permitido: `authenticated` tiene `SELECT` sobre toda la tabla) pero **NO** en el objeto del `update` — ese sigue tocando solo las cinco columnas de siempre.

- [ ] **Step 2: Implementar `getPersonProfile`**

`src/lib/people/get-person-profile.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref, sagaHref } from "@/lib/catalog/item-href";
import { PERSON_COLUMNS, enrichTmdbBio, toPerson, type PersonRow } from "./get-person";
import { hydratePersonCredits, needsCreditHydration } from "./hydrate-person-credits";
import { deriveCollaborators, type CollaboratorRow } from "./derive-person-works";
import type { CreditRole } from "./types";
import type { PersonProfile, ProfileWork, SagaProgress, WorkStatus } from "./profile-types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};

// Cada tabla de catálogo nombra el año y el tamaño a su manera.
const YEAR_COLUMN: Record<ItemType, string> = {
  book: "published_year",
  movie: "release_year",
  series: "release_year",
};

/**
 * El contrato de datos de la ficha de persona: la persona, TODAS sus obras con
 * el estado del visitante, y los agregados del raíl.
 *
 * NO es cacheable (regla #437): depende de `passes` del que mira —estado, nota,
 * progreso, "te falta ver", "tu actividad"—. Un `use cache` aquí le serviría a
 * un usuario las filas que solo otro podía ver, y NO se vería en desarrollo con
 * una sola cuenta abierta.
 *
 * Hidrata la obra completa de la persona la PRIMERA vez que se abre su ficha
 * (ver hydratePersonCredits). Va dentro del <Suspense> de la página, no en
 * after(): así todo lo que se pinta ya tiene id de catálogo y es enlazable.
 */
export async function getPersonProfile(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  personId: string
): Promise<PersonProfile | null> {
  const { data: row } = await supabase
    .from("people")
    .select(PERSON_COLUMNS)
    .eq("id", personId)
    .maybeSingle();
  if (!row) return null;

  const enriched = await enrichTmdbBio(supabase, row as PersonRow);

  const hydratable = {
    id: enriched.id,
    tmdbId: enriched.tmdb_id,
    openlibraryKey: enriched.openlibrary_key,
    creditsHydratedAt: enriched.credits_hydrated_at,
  };
  if (needsCreditHydration(hydratable)) {
    await hydratePersonCredits(supabase, hydratable);
  }

  const { data: creditRows } = await supabase
    .from("credits")
    .select("item_type, item_id, role, character")
    .eq("person_id", personId);

  const credits = (creditRows ?? []) as Array<{
    item_type: ItemType;
    item_id: string;
    role: CreditRole;
    character: string | null;
  }>;

  if (credits.length === 0) {
    return {
      person: toPerson(enriched),
      works: [],
      roleCounts: [],
      collaborators: [],
      sagas: [],
      userAverage: null,
      globalAverage: null,
    };
  }

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  const seenIds = new Set<string>();
  for (const c of credits) {
    const key = `${c.item_type}:${c.item_id}`;
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    idsByType[c.item_type].push(c.item_id);
  }

  // Metadatos de catálogo, estado del visitante, notas de la comunidad y sagas,
  // todo en paralelo: no dependen entre sí.
  const meta = new Map<
    string,
    { title: string; coverUrl: string | null; year: number | null; durationMinutes: number | null }
  >();
  const statusByItem = new Map<string, { status: WorkStatus; rating: number | null; finishedOn: string | null }>();
  const globalByItem = new Map<string, { sum: number; count: number }>();
  const sagaByItem = new Map<string, { sagaId: string; name: string }>();

  await Promise.all([
    // Catálogo.
    ...(Object.keys(idsByType) as ItemType[]).map(async (type) => {
      const ids = idsByType[type];
      if (ids.length === 0) return;
      const sizeColumn =
        type === "movie" ? "duration_minutes" : type === "series" ? "episode_runtime_minutes" : "total_pages";
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select(`id, title, cover_url, ${YEAR_COLUMN[type]}, ${sizeColumn}`)
        .in("id", ids);
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        meta.set(`${type}:${r.id as string}`, {
          title: r.title as string,
          coverUrl: (r.cover_url as string | null) ?? null,
          year: (r[YEAR_COLUMN[type]] as number | null) ?? null,
          // En libros la "duración" son páginas y NO se pinta como minutos: la
          // fila usa este campo solo para pantalla.
          durationMinutes: type === "book" ? null : ((r[sizeColumn] as number | null) ?? null),
        });
      }
    }),

    // Estado del visitante. Sin sesión, este bloque no corre.
    ...(viewerId
      ? (Object.keys(idsByType) as ItemType[]).map(async (type) => {
          const ids = idsByType[type];
          if (ids.length === 0) return;
          const { data } = await supabase
            .from("passes")
            .select("item_id, status, is_active, rating, finished_on")
            .eq("user_id", viewerId)
            .eq("item_type", type)
            .in("item_id", ids);
          for (const r of data ?? []) {
            const key = `${type}:${r.item_id}`;
            const prev = statusByItem.get(key);
            // "completed" gana sobre el resto: una relectura en curso no debe
            // restar avance. Mismo criterio que get-saga-detail.ts.
            if (r.status === "completed") {
              statusByItem.set(key, {
                status: "completed",
                rating: (r.rating as number | null) ?? prev?.rating ?? null,
                finishedOn: (r.finished_on as string | null) ?? prev?.finishedOn ?? null,
              });
            } else if (prev?.status !== "completed" && r.is_active) {
              statusByItem.set(key, {
                status: r.status as WorkStatus,
                rating: (r.rating as number | null) ?? null,
                finishedOn: (r.finished_on as string | null) ?? null,
              });
            }
          }
        })
      : []),

    // Nota de la comunidad. Sin `dropped` y sin `finished_on` nulo, igual que
    // get-saga-detail.ts: apply-transition cierra el pase abandonado con
    // finished_on SIN limpiar el rating, y sin este filtro contaminaría la media.
    ...(Object.keys(idsByType) as ItemType[]).map(async (type) => {
      const ids = idsByType[type];
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("passes")
        .select("item_id, rating")
        .eq("item_type", type)
        .in("item_id", ids)
        .not("rating", "is", null)
        .not("finished_on", "is", null)
        .neq("status", "dropped");
      for (const r of data ?? []) {
        const key = `${type}:${r.item_id}`;
        const acc = globalByItem.get(key) ?? { sum: 0, count: 0 };
        acc.sum += r.rating as number;
        acc.count += 1;
        globalByItem.set(key, acc);
      }
    }),

    // Sagas de sus obras.
    (async () => {
      const allIds = (Object.keys(idsByType) as ItemType[]).flatMap((t) => idsByType[t]);
      if (allIds.length === 0) return;
      const { data } = await supabase
        .from("saga_items")
        .select("saga_id, item_type, item_id, saga:sagas(id, name)")
        .in("item_id", allIds);
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const saga = r.saga as { id: string; name: string } | null;
        if (!saga) continue;
        sagaByItem.set(`${r.item_type as string}:${r.item_id as string}`, {
          sagaId: saga.id,
          name: saga.name,
        });
      }
    })(),
  ]);

  // Una fila por OBRA, con todos sus roles juntos.
  const byWork = new Map<string, ProfileWork>();
  for (const c of credits) {
    const key = `${c.item_type}:${c.item_id}`;
    const m = meta.get(key);
    if (!m) continue; // crédito huérfano: la obra ya no está en catálogo.

    const existing = byWork.get(key);
    if (existing) {
      if (!existing.roles.includes(c.role)) existing.roles.push(c.role);
      if (c.role === "cast" && c.character && !existing.character) existing.character = c.character;
      continue;
    }

    const state = statusByItem.get(key);
    const global = globalByItem.get(key);
    const saga = sagaByItem.get(key);

    byWork.set(key, {
      itemType: c.item_type,
      itemId: c.item_id,
      title: m.title,
      coverUrl: m.coverUrl,
      href: itemHref(c.item_type, c.item_id),
      year: m.year,
      durationMinutes: m.durationMinutes,
      roles: [c.role],
      character: c.role === "cast" ? c.character : null,
      globalRating: global ? global.sum / global.count : null,
      sagaId: saga?.sagaId ?? null,
      sagaName: saga?.name ?? null,
      status: state?.status ?? null,
      userRating: state?.rating ?? null,
      finishedOn: state?.finishedOn ?? null,
      // El porcentaje de avance vive en `passes.position` (jsonb) y su cálculo
      // depende del tipo. Se deja en null: la fila "en progreso" pinta la
      // etiqueta sin barra cuando no hay porcentaje. Refinarlo es trabajo
      // aparte (issue).
      progressPercent: null,
    });
  }

  const works = [...byWork.values()];

  // Colaboradores: personas con crédito en las MISMAS obras.
  const collaboratorRows: CollaboratorRow[] = [];
  {
    const allIds = works.map((w) => w.itemId);
    const { data } = await supabase
      .from("credits")
      .select("person_id, item_type, item_id, role, person:people(name, photo_url)")
      .in("item_id", allIds)
      .neq("person_id", personId);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const person = r.person as { name: string; photo_url: string | null } | null;
      if (!person) continue;
      collaboratorRows.push({
        personId: r.person_id as string,
        name: person.name,
        photoUrl: person.photo_url,
        role: r.role as CreditRole,
        itemKey: `${r.item_type as string}:${r.item_id as string}`,
      });
    }
  }

  // Progreso por saga: sobre las obras DE ESTA PERSONA en cada saga, no sobre
  // la saga entera — el raíl dice "de lo suyo en esta saga, has visto X".
  const sagaProgress = new Map<string, SagaProgress>();
  for (const w of works) {
    if (!w.sagaId || !w.sagaName) continue;
    const entry =
      sagaProgress.get(w.sagaId) ??
      { sagaId: w.sagaId, name: w.sagaName, href: sagaHref(w.sagaId), total: 0, completed: 0 };
    entry.total += 1;
    if (w.status === "completed") entry.completed += 1;
    sagaProgress.set(w.sagaId, entry);
  }

  const userRatings = works.map((w) => w.userRating).filter((r): r is number => r != null);
  const globalRatings = works.map((w) => w.globalRating).filter((r): r is number => r != null);
  const avg = (list: number[]) =>
    list.length === 0 ? null : list.reduce((a, b) => a + b, 0) / list.length;

  const { deriveRoleCounts } = await import("./derive-person-works");

  return {
    person: toPerson(enriched),
    works,
    roleCounts: deriveRoleCounts(works),
    collaborators: deriveCollaborators(collaboratorRows),
    sagas: [...sagaProgress.values()].sort((a, b) => b.total - a.total),
    userAverage: avg(userRatings),
    globalAverage: avg(globalRatings),
  };
}
```

⚠️ Sustituir el `await import("./derive-person-works")` del final por un import estático arriba del fichero (está en línea solo para no repetir la lista de imports en este plan). Es decir: añadir `deriveRoleCounts` al import ya existente de `./derive-person-works` y borrar esa línea.

⚠️ **Verificar los nombres de columna reales antes de dar la tarea por buena**: `books.published_year`, `books.total_pages`, `movies.release_year`, `movies.duration_minutes`, `series.release_year`, `series.episode_runtime_minutes`. Comprobarlos con:

```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('books','movies','series')
order by table_name, ordinal_position;
```

- [ ] **Step 3: Comprobar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 4: Ejecutar toda la suite**

Run: `npm test`
Esperado: PASS. `get-person.ts` cambió de forma y lo usa la página actual.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/get-person-profile.ts src/lib/people/get-person.ts
git commit -m "feat(people): getPersonProfile, el contrato de datos de la ficha"
```

---

## Fase C — UI

### Task 9: Esqueleto de tres columnas (shell, rejilla, i18n)

**Files:**
- Modify: `src/lib/ui/layout.ts`
- Modify: `src/app/globals.css`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `SHELL_PERSON`; clase CSS `.person-grid` con áreas `ficha` / `obras` / `raíl`; claves i18n del namespace `person`.

- [ ] **Step 1: Añadir `SHELL_PERSON` a `src/lib/ui/layout.ts`**

Al final del fichero, junto a `SHELL_POST`:

```ts
/**
 * Contenedor de `/persona/[id]`, la ficha de persona en TRES áreas (FICHA ·
 * OBRAS · RAÍL). Su propio ancho, NO `SHELL_APP`: el centro es un explorador de
 * obras con filas de cuatro zonas, y el reparto del mockup (308 / fluida / 344
 * con gap 28 y padding 30) pide un contenedor de ~1740.
 *
 * Por debajo de 1000 la ficha va en UNA columna y se queda en `max-w-2xl` (672)
 * —ancho de lectura, no una columna estirada a 1740—; a partir de 1000 crece y
 * el reparto lo hace `.person-grid` (en `globals.css`), que `page.tsx` y
 * `loading.tsx` comparten por nombre para no poder divergir (mismo motivo que
 * `.post-grid` y `.home-grid`, ver #372/#376).
 */
export const SHELL_PERSON = "max-w-2xl min-[1000px]:max-w-[1740px]";
```

- [ ] **Step 2: Añadir `.person-grid` a `src/app/globals.css`**

Al final del bloque de `.post-grid` (tras la media query de 1440, línea ~542):

```css
/* Ficha de persona (`/persona/[id]`) en TRES áreas: FICHA · OBRAS · RAÍL.
   Mismo patrón que `.post-grid` y `.home-grid`: la clase la comparten página y
   esqueleto para que no puedan divergir en ancho.

   Prioridad responsive OBRAS > FICHA > RAÍL. El DOM va ficha → obras → raíl y
   las áreas recolocan; a <1000 es una columna (ficha como hero, luego obras, y
   el raíl al final).

   Decisión (2026-08-12): el corte 1000–1600 va a DOS columnas —el handoff
   dejaba sin definir la franja 1000–1200—. A 1100px ya caben ficha y centro sin
   apretar, y bajar ahí a una columna desperdicia 300px. En dos columnas el raíl
   se pliega DEBAJO de la ficha izquierda, no debajo del centro: es información
   derivada, acompaña al contexto, no a la exploración. */
.person-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "ficha"
    "obras"
    "rail";
}
.person-grid > [data-area="ficha"] {
  grid-area: ficha;
}
.person-grid > [data-area="obras"] {
  grid-area: obras;
}
.person-grid > [data-area="rail"] {
  grid-area: rail;
}
/* min-width:0 para que un título largo sin espacios no fuerce scroll
   horizontal — la trampa clásica de grid+flex. */
.person-grid > * {
  min-width: 0;
}

/* 1000–1599: dos columnas. La izquierda apila ficha y raíl. */
@media (min-width: 1000px) {
  .person-grid {
    grid-template-columns: 308px minmax(0, 1fr);
    grid-template-areas:
      "ficha obras"
      "rail  obras";
    gap: 24px;
    align-items: start;
  }
  .person-grid > [data-area="obras"] {
    grid-row: span 2;
  }
}

/* ≥1600: las tres columnas del mockup (marco 5 · 1e). */
@media (min-width: 1600px) {
  .person-grid {
    grid-template-columns: 308px minmax(0, 1fr) 344px;
    grid-template-areas: "ficha obras rail";
    gap: 28px;
  }
  .person-grid > [data-area="obras"] {
    grid-row: auto;
  }
  /* Las dos laterales se pegan mientras se recorre el centro (la columna alta).
     `align-self:start` para que cada caja tome su alto de contenido y
     `position:sticky` enganche. Bajo la topbar, que también es sticky. */
  .person-grid > [data-area="ficha"],
  .person-grid > [data-area="rail"] {
    position: sticky;
    top: calc(var(--topbar-h) + 16px);
    align-self: start;
  }
}
```

- [ ] **Step 3: Ampliar el namespace `person` de `messages/es.json`**

Sustituir el bloque `"person": { ... }` (línea ~1325) por:

```json
  "person": {
    "notFoundTitle": "Persona no encontrada",
    "notFoundDescription": "Esta persona no existe en el catálogo.",
    "backHome": "Ir al inicio",
    "born": "Nacimiento: {date}",
    "died": "Fallecimiento: {date}",
    "noBio": "Sin biografía disponible.",
    "bioMore": "Ver más",
    "bioLess": "Ver menos",
    "worksHeading": "Obras",
    "worksCount": "· {count}",
    "noWorks": "Aún no hay obras de esta persona en el catálogo.",
    "inYourLibrary": "En tu biblioteca",
    "summaryWatched": "Has visto {done} de {total} obras",
    "summaryRead": "Has leído {done} de {total} obras",
    "summaryMixed": "Has registrado {done} de {total} obras",
    "yourAverage": "Tu media",
    "pending": "Pendientes",
    "inProgress": "En progreso",
    "filterTypeAll": "Todas",
    "filterTypeMovie": "Películas",
    "filterTypeSeries": "Series",
    "filterTypeBook": "Libros",
    "filterCreditAll": "Todo crédito",
    "roleCast": "Reparto",
    "roleDirector": "Dirección",
    "roleWriter": "Guion",
    "roleCreator": "Creación",
    "roleAuthor": "Autor",
    "featured": "Destacadas",
    "restByYear": "El resto, por año",
    "byYear": "Por año",
    "sectionAs": "Como {role}",
    "sectionSummary": "{works} obras · {done} vistas",
    "rate": "Valorar",
    "statusPlanned": "Pendiente",
    "statusInProgress": "En curso",
    "statusCompleted": "Terminada",
    "statusDropped": "Abandonada",
    "railPending": "Te falta ver · {count}",
    "railSagas": "Sagas",
    "railSagaProgress": "{done} de {total} vistas",
    "railCollaborators": "Colabora a menudo con",
    "railCollaboratorWorks": "{count} obras",
    "railActivity": "Tu actividad",
    "railLastFinished": "Última terminada",
    "railGlobalAverage": "Media global",
    "railAddAllPending": "Añadir todas a pendientes →",
    "noCatalogLink": "Aún no está en el catálogo"
  },
```

⚠️ **`worksTitle` («Su obra») se retira**: la cabecera pasa a ser «Obras · N». Buscar usos residuales con `Grep 'person.worksTitle'` y con `Grep 'worksTitle'` antes de borrarla.

⚠️ Si `messages/` tiene más de un idioma, replicar las claves en todos los ficheros. Comprobar con `Glob messages/*.json`.

- [ ] **Step 4: Comprobar que nada se rompió**

Run: `npx tsc --noEmit && npm test`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/layout.ts src/app/globals.css messages/
git commit -m "feat(persona): esqueleto de tres columnas (SHELL_PERSON, .person-grid, i18n)"
```

---

### Task 10: `PersonCard` — la columna izquierda

**Files:**
- Create: `src/components/people/person-card.tsx`
- Create: `src/components/people/bio-clamp.tsx`

**Interfaces:**
- Consumes: `PersonProfile` (Task 7), `deriveLibrarySummary` / `deriveRoleCounts` (Task 7).
- Produces: `<PersonCard profile={profile} />`, `<BioClamp text={string} moreLabel={string} lessLabel={string} />`.

- [ ] **Step 1: Escribir `bio-clamp.tsx` (la única pieza cliente de la card)**

```tsx
"use client";

import { useState } from "react";

// La biografía se recorta a 3 líneas y "Ver más" la expande EN SITIO. No hay
// página de biografía aparte: sacar al lector de la ficha para leer un párrafo
// no compensa.
export function BioClamp({
  text,
  moreLabel,
  lessLabel,
}: {
  text: string;
  moreLabel: string;
  lessLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <p
        className={`whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="self-start text-[12px] font-medium text-accent hover:underline"
      >
        {expanded ? lessLabel : moreLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Escribir `person-card.tsx`**

```tsx
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { PersonProfile } from "@/lib/people/profile-types";
import { deriveLibrarySummary } from "@/lib/people/derive-person-works";
import { ProgressBar } from "@/components/ui/progress-bar";
import { BioClamp } from "./bio-clamp";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_KEY = {
  cast: "roleCast",
  director: "roleDirector",
  writer: "roleWriter",
  creator: "roleCreator",
  author: "roleAuthor",
} as const;

const SUMMARY_KEY = {
  watched: "summaryWatched",
  read: "summaryRead",
  mixed: "summaryMixed",
} as const;

// Columna izquierda: el CONTEXTO de la persona. Card única, sticky a ≥1600.
// El retrato es CUADRADO a ancho completo (no el círculo de la ficha vieja):
// con 308px de columna, un círculo desperdicia las esquinas y encoge la cara.
export async function PersonCard({
  profile,
  loggedIn,
}: {
  profile: PersonProfile;
  loggedIn: boolean;
}) {
  const t = await getTranslations("person");
  const { person, works, roleCounts, userAverage } = profile;
  const summary = deriveLibrarySummary(works);

  const meta = [
    person.birthDate ? t("born", { date: person.birthDate }) : null,
    person.deathDate ? t("died", { date: person.deathDate }) : null,
    person.placeOfBirth,
  ].filter(Boolean) as string[];

  const pending = works.filter((w) => w.status === "planned").length;
  const inProgress = works.filter((w) => w.status === "in_progress").length;

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-[18px]">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-3">
        {person.photoUrl ? (
          <Image
            src={person.photoUrl}
            alt={person.name}
            fill
            sizes="308px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl font-semibold text-muted-foreground">
            {initials(person.name)}
          </div>
        )}
      </div>

      <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground">
        {person.name}
      </h1>

      {roleCounts.length > 0 && (
        // Ordenados por VOLUMEN de obras (deriveRoleCounts ya los da así): quien
        // actúa más de lo que dirige lee "Reparto · Dirección", en ese orden.
        <div className="flex flex-wrap gap-1.5">
          {roleCounts.map(({ role }) => (
            <span
              key={role}
              className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              {t(ROLE_KEY[role])}
            </span>
          ))}
        </div>
      )}

      {meta.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[12.5px] text-muted-foreground">
          {meta.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}

      {person.bio ? (
        <BioClamp text={person.bio} moreLabel={t("bioMore")} lessLabel={t("bioLess")} />
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("noBio")}</p>
      )}

      {loggedIn && summary.visible && (
        <>
          <div className="h-px w-full bg-border" />
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("inYourLibrary")}
            </span>
            <p className="text-[13px] text-foreground">
              {t(SUMMARY_KEY[summary.verb], { done: summary.done, total: summary.total })}
            </p>
            <ProgressBar value={summary.done} max={summary.total} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              {userAverage != null && (
                <span>
                  {t("yourAverage")}: {userAverage.toFixed(1)}
                </span>
              )}
              {pending > 0 && (
                <span>
                  {t("pending")}: {pending}
                </span>
              )}
              {inProgress > 0 && (
                <span>
                  {t("inProgress")}: {inProgress}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

⚠️ **No hay botón «Seguir a esta persona».** No existe tabla `person_follows` (solo `follows` usuario→usuario y `saga_follows`); pintar un botón sin backend es peor que no pintarlo. Va como issue en la Task 15.

⚠️ **Verificar la firma de `ProgressBar`** (`src/components/ui/progress-bar.tsx`) antes de usarla; si sus props son otras (p. ej. `percent`), adaptar la llamada. `Read` el fichero primero.

- [ ] **Step 3: Comprobar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/people/person-card.tsx src/components/people/bio-clamp.tsx
git commit -m "feat(persona): PersonCard, la columna de contexto de la persona"
```

---

### Task 11: `PersonWorkRow`, `PersonFilters` y `PersonFeatured`

**Files:**
- Create: `src/components/people/person-work-row.tsx`
- Create: `src/components/people/person-filters.tsx`
- Create: `src/components/people/person-featured.tsx`

**Interfaces:**
- Consumes: `ProfileWork` (Task 7), `RatingDots`, `StatusBadge`, `CoverCard`.
- Produces: `<PersonWorkRow work={ProfileWork} />`, `<PersonFilters ... />`, `<PersonFeatured works={ProfileWork[]} />`.

- [ ] **Step 1: `person-work-row.tsx` — la fila de cuatro zonas**

```tsx
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProfileWork } from "@/lib/people/profile-types";

const ROLE_KEY = {
  cast: "roleCast",
  director: "roleDirector",
  writer: "roleWriter",
  creator: "roleCreator",
  author: "roleAuthor",
} as const;

const STATUS_KEY = {
  planned: "statusPlanned",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  dropped: "statusDropped",
} as const;

const TYPE_LABEL = { movie: "Película", series: "Serie", book: "Libro" } as const;

// La fila del listado por año. CUATRO ZONAS FIJAS, y su anchura es lo que hace
// que 40 filas se lean como una tabla y no como 40 tarjetas distintas:
// obra (fluida) · crédito (auto) · estado (118px) · valoración (74px).
export async function PersonWorkRow({ work }: { work: ProfileWork }) {
  const t = await getTranslations("person");

  // Con crédito de reparto manda el PERSONAJE, no el tipo: en la ficha de un
  // intérprete lo que se busca es "¿a quién hacía?".
  const subtitle =
    work.character ??
    [TYPE_LABEL[work.itemType], work.durationMinutes ? `${work.durationMinutes} min` : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <Link href={work.href} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded bg-surface-3">
          {work.coverUrl && (
            <Image src={work.coverUrl} alt="" fill sizes="30px" className="object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-serif text-[14px] font-medium text-foreground">
            {work.title}
          </span>
          <span className="truncate text-[11.5px] text-muted-foreground">{subtitle}</span>
        </div>
      </Link>

      <div className="flex shrink-0 flex-wrap gap-1">
        {work.roles.map((role) => (
          <span
            key={role}
            className="rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground"
          >
            {t(ROLE_KEY[role])}
          </span>
        ))}
      </div>

      <div className="flex w-[118px] shrink-0 justify-start">
        {work.status && (
          <StatusBadge status={work.status} label={t(STATUS_KEY[work.status])} />
        )}
      </div>

      <div className="flex w-[74px] shrink-0 justify-end">
        {work.userRating != null ? (
          <RatingDots value={work.userRating} size="sm" itemType={work.itemType} />
        ) : (
          <Link
            href={work.href}
            className="text-[11.5px] font-medium text-accent hover:underline"
          >
            {t("rate")}
          </Link>
        )}
      </div>
    </div>
  );
}
```

⚠️ `TYPE_LABEL` está en duro en español. Si el proyecto ya tiene claves de tipo de obra en `messages/`, **usarlas**: buscar con `Grep '"movie":' messages/es.json` antes de dejarlo así.

- [ ] **Step 2: `person-filters.tsx` — chips como `<Link>`, estado en la URL**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";

const ROLE_KEY = {
  cast: "roleCast",
  director: "roleDirector",
  writer: "roleWriter",
  creator: "roleCreator",
  author: "roleAuthor",
} as const;

const TYPE_KEY = {
  movie: "filterTypeMovie",
  series: "filterTypeSeries",
  book: "filterTypeBook",
} as const;

// Slugs de la URL. Se escriben en español porque la URL es cara al usuario y es
// un enlace compartible: `?tipo=peliculas&credito=direccion`.
export const TYPE_SLUG: Record<ItemType, string> = {
  movie: "peliculas",
  series: "series",
  book: "libros",
};
export const ROLE_SLUG: Record<CreditRole, string> = {
  cast: "reparto",
  director: "direccion",
  writer: "guion",
  creator: "creacion",
  author: "autor",
};

export function parseTypeSlug(slug: string | undefined): ItemType | undefined {
  return (Object.keys(TYPE_SLUG) as ItemType[]).find((t) => TYPE_SLUG[t] === slug);
}
export function parseRoleSlug(slug: string | undefined): CreditRole | undefined {
  return (Object.keys(ROLE_SLUG) as CreditRole[]).find((r) => ROLE_SLUG[r] === slug);
}

function chipClass(active: boolean): string {
  return [
    "shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
    active
      ? "border-accent bg-accent/10 font-medium text-accent"
      : "border-border text-muted-foreground hover:text-foreground",
  ].join(" ");
}

function buildHref(base: string, type?: string, role?: string): string {
  const params = new URLSearchParams();
  if (type) params.set("tipo", type);
  if (role) params.set("credito", role);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Los filtros son `<Link>`, no estado de cliente: el filtrado ocurre en
 * servidor y así el enlace desde la ficha de un título puede llegar
 * prefiltrado (`/persona/x?tipo=peliculas&credito=direccion`) y el botón
 * "atrás" del navegador funciona.
 *
 * Solo se pintan los tipos que la persona TIENE: un chip "Libros" en la ficha
 * de un director es ruido que nunca dará resultados.
 */
export async function PersonFilters({
  basePath,
  availableTypes,
  roleCounts,
  activeType,
  activeRole,
}: {
  basePath: string;
  availableTypes: ItemType[];
  roleCounts: Array<{ role: CreditRole; count: number }>;
  activeType?: ItemType;
  activeRole?: CreditRole;
}) {
  const t = await getTranslations("person");
  const roleSlug = activeRole ? ROLE_SLUG[activeRole] : undefined;
  const typeSlug = activeType ? TYPE_SLUG[activeType] : undefined;

  return (
    <div className="flex items-center gap-3 overflow-x-auto">
      {availableTypes.length > 1 && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href={buildHref(basePath, undefined, roleSlug)} className={chipClass(!activeType)}>
            {t("filterTypeAll")}
          </Link>
          {availableTypes.map((type) => (
            <Link
              key={type}
              href={buildHref(basePath, TYPE_SLUG[type], roleSlug)}
              className={chipClass(activeType === type)}
            >
              {t(TYPE_KEY[type])}
            </Link>
          ))}
        </div>
      )}

      {roleCounts.length > 1 && (
        <>
          <div className="h-5 w-px shrink-0 bg-border" />
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href={buildHref(basePath, typeSlug, undefined)}
              className={chipClass(!activeRole)}
            >
              {t("filterCreditAll")}
            </Link>
            {roleCounts.map(({ role, count }) => (
              <Link
                key={role}
                href={buildHref(basePath, typeSlug, ROLE_SLUG[role])}
                className={chipClass(activeRole === role)}
              >
                {t(ROLE_KEY[role])} · {count}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `person-featured.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import { CoverCard } from "@/components/ui/cover-card";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProfileWork } from "@/lib/people/profile-types";

const ROLE_KEY = {
  cast: "roleCast",
  director: "roleDirector",
  writer: "roleWriter",
  creator: "roleCreator",
  author: "roleAuthor",
} as const;

const STATUS_KEY = {
  planned: "statusPlanned",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  dropped: "statusDropped",
} as const;

// Hasta 5 obras destacadas. Las que salen aquí NO se repiten en la lista de
// abajo (splitFeaturedAndRest): sin esa exclusión la misma película aparecía
// dos veces en la misma pantalla.
export async function PersonFeatured({ works }: { works: ProfileWork[] }) {
  const t = await getTranslations("person");

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("featured")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {works.map((work) => (
          <div key={`${work.itemType}-${work.itemId}`} className="flex flex-col gap-1.5">
            <CoverCard
              href={work.href}
              coverUrl={work.coverUrl}
              title={work.title}
              subtitle={[work.year, t(ROLE_KEY[work.roles[0]])].filter(Boolean).join(" · ")}
            />
            <div className="flex items-center justify-between gap-1">
              {work.userRating != null ? (
                <RatingDots value={work.userRating} size="sm" itemType={work.itemType} />
              ) : (
                <span />
              )}
              {work.status && (
                <StatusBadge status={work.status} label={t(STATUS_KEY[work.status])} dotOnly />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Comprobar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/people/person-work-row.tsx src/components/people/person-filters.tsx src/components/people/person-featured.tsx
git commit -m "feat(persona): fila de obra, filtros por URL y rejilla de destacadas"
```

---

### Task 12: `PersonWorks` — el centro

**Files:**
- Create: `src/components/people/person-works.tsx`

**Interfaces:**
- Consumes: todo lo de las Tasks 7 y 11.
- Produces: `<PersonWorks profile={...} basePath={...} activeType={...} activeRole={...} />`.

- [ ] **Step 1: Implementar**

```tsx
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";
import type { PersonProfile, ProfileWork } from "@/lib/people/profile-types";
import {
  deriveRoleSections,
  filterWorks,
  groupByYear,
  splitFeaturedAndRest,
} from "@/lib/people/derive-person-works";
import { PersonFilters } from "./person-filters";
import { PersonFeatured } from "./person-featured";
import { PersonWorkRow } from "./person-work-row";

const ROLE_SECTION_KEY = {
  cast: "roleCast",
  director: "roleDirector",
  writer: "roleWriter",
  creator: "roleCreator",
  author: "roleAuthor",
} as const;

const TYPE_ORDER: ItemType[] = ["movie", "series", "book"];

async function YearList({ works }: { works: ProfileWork[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groupByYear(works).map((group) => (
        <div key={String(group.year)} className="flex gap-3">
          <span className="w-[46px] shrink-0 pt-2 font-mono text-[11px] text-muted-foreground">
            {group.year ?? "—"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            {group.works.map((work) => (
              <PersonWorkRow key={`${work.itemType}-${work.itemId}`} work={work} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * El centro: cabecera + filtros + destacadas + lista.
 *
 * Dos reglas que dan forma a todo lo de abajo:
 *  - Las DESTACADAS se excluyen de la lista, que por eso se titula "El resto,
 *    por año". Sin la exclusión la misma obra sale dos veces.
 *  - Con "Todo crédito" activo y créditos mixtos de peso (>=3 obras o >=20%),
 *    el centro se parte en secciones por rol. Al elegir un chip de crédito
 *    concreto la lista se APLANA: ya estás mirando un rol, partir por rol no
 *    dice nada.
 */
export async function PersonWorks({
  profile,
  basePath,
  activeType,
  activeRole,
}: {
  profile: PersonProfile;
  basePath: string;
  activeType?: ItemType;
  activeRole?: CreditRole;
}) {
  const t = await getTranslations("person");

  const availableTypes = TYPE_ORDER.filter((type) =>
    profile.works.some((w) => w.itemType === type)
  );
  const visible = filterWorks(profile.works, { type: activeType, role: activeRole });

  // Con un crédito concreto elegido, la lista es UNA secuencia cronológica.
  const sections = activeRole ? [] : deriveRoleSections(visible);
  const { featured, rest } = splitFeaturedAndRest(visible);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-[21px] font-semibold text-foreground">
          {t("worksHeading")}{" "}
          <span className="text-muted-foreground">{t("worksCount", { count: visible.length })}</span>
        </h2>
        <PersonFilters
          basePath={basePath}
          availableTypes={availableTypes}
          roleCounts={profile.roleCounts}
          activeType={activeType}
          activeRole={activeRole}
        />
      </div>

      {visible.length === 0 && (
        <p className="text-[13px] text-muted-foreground">{t("noWorks")}</p>
      )}

      {featured.length > 0 && <PersonFeatured works={featured} />}

      {sections.length > 0 ? (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <div key={section.role} className="flex flex-col gap-2.5">
              <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("sectionAs", { role: t(ROLE_SECTION_KEY[section.role]) })}
                {" · "}
                {t("sectionSummary", {
                  works: section.works.length,
                  done: section.works.filter((w) => w.status === "completed").length,
                })}
              </h3>
              <YearList
                works={section.works.filter((w) =>
                  rest.some((r) => r.itemId === w.itemId && r.itemType === w.itemType)
                )}
              />
            </div>
          ))}
        </div>
      ) : (
        rest.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {featured.length > 0 ? t("restByYear") : t("byYear")}
            </h3>
            <YearList works={rest} />
          </div>
        )
      )}
    </section>
  );
}
```

- [ ] **Step 2: Comprobar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/people/person-works.tsx
git commit -m "feat(persona): PersonWorks, el explorador de obras del centro"
```

---

### Task 13: `PersonRail` — la columna derecha

**Files:**
- Create: `src/components/people/person-rail.tsx`

**Interfaces:**
- Consumes: `PersonProfile` (Task 7).
- Produces: `<PersonRail profile={...} />`, o `null` si no hay ninguna card con datos.

- [ ] **Step 1: Implementar**

```tsx
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { PersonProfile } from "@/lib/people/profile-types";

const ROLE_KEY = {
  cast: "roleCast",
  director: "roleDirector",
  writer: "roleWriter",
  creator: "roleCreator",
  author: "roleAuthor",
} as const;

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

/**
 * El raíl derecho: SOLO información DERIVADA de lo que ya está en el centro
 * (pendientes, sagas, colaboradores, tu actividad). Nunca contenido nuevo que
 * compita con el explorador.
 *
 * Cada card se OMITE si no tiene datos, y el raíl entero devuelve null si no
 * queda ninguna: un raíl de cuatro cajas vacías es peor que no tener raíl.
 */
export async function PersonRail({ profile }: { profile: PersonProfile }) {
  const t = await getTranslations("person");

  const pending = profile.works
    .filter((w) => w.status === "planned" || w.status === "in_progress")
    .slice(0, 3);

  const lastFinished = profile.works
    .filter((w) => w.status === "completed" && w.finishedOn)
    .sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? ""))[0];

  const hasActivity = Boolean(lastFinished || profile.userAverage != null || profile.globalAverage != null);
  if (
    pending.length === 0 &&
    profile.sagas.length === 0 &&
    profile.collaborators.length === 0 &&
    !hasActivity
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.length > 0 && (
        <RailCard title={t("railPending", { count: pending.length })}>
          <div className="flex flex-col gap-2">
            {pending.map((work) => (
              <Link
                key={`${work.itemType}-${work.itemId}`}
                href={work.href}
                className="flex items-center gap-2"
              >
                <div className="relative h-[51px] w-[34px] shrink-0 overflow-hidden rounded bg-surface-3">
                  {work.coverUrl && (
                    <Image src={work.coverUrl} alt="" fill sizes="34px" className="object-cover" />
                  )}
                </div>
                <span className="line-clamp-2 font-serif text-[13px] text-foreground">
                  {work.title}
                </span>
              </Link>
            ))}
          </div>
          <Link href="/buscar" className="text-[12px] font-medium text-accent hover:underline">
            {t("railAddAllPending")}
          </Link>
        </RailCard>
      )}

      {profile.sagas.length > 0 && (
        <RailCard title={t("railSagas")}>
          <div className="flex flex-col gap-2">
            {profile.sagas.map((saga) => (
              <Link key={saga.sagaId} href={saga.href} className="flex flex-col gap-1">
                <span className="font-serif text-[13px] text-foreground">{saga.name}</span>
                <span className="text-[11.5px] text-muted-foreground">
                  {t("railSagaProgress", { done: saga.completed, total: saga.total })}
                </span>
                <ProgressBar value={saga.completed} max={saga.total} />
              </Link>
            ))}
          </div>
        </RailCard>
      )}

      {profile.collaborators.length > 0 && (
        <RailCard title={t("railCollaborators")}>
          <div className="flex flex-col gap-2">
            {profile.collaborators.slice(0, 5).map((c) => (
              <Link key={c.id} href={c.href} className="flex items-center gap-2">
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-3">
                  {c.photoUrl && (
                    <Image src={c.photoUrl} alt="" fill sizes="32px" className="object-cover" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] text-foreground">{c.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {t(ROLE_KEY[c.role])} · {t("railCollaboratorWorks", { count: c.sharedCount })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </RailCard>
      )}

      {hasActivity && (
        <RailCard title={t("railActivity")}>
          <div className="flex flex-col gap-1 text-[12px] text-muted-foreground">
            {lastFinished && (
              <span>
                {t("railLastFinished")}: {lastFinished.title} · {lastFinished.finishedOn}
              </span>
            )}
            {profile.userAverage != null && (
              <span>
                {t("yourAverage")}: {profile.userAverage.toFixed(1)}
              </span>
            )}
            {profile.globalAverage != null && (
              <span>
                {t("railGlobalAverage")}: {profile.globalAverage.toFixed(1)}
              </span>
            )}
          </div>
        </RailCard>
      )}
    </div>
  );
}
```

⚠️ `railAddAllPending` apunta a `/buscar` como destino provisional. **Si no hay una acción real de «añadir todas a pendientes», quitar el botón** en lugar de dejar un enlace que no hace lo que dice — y anotarlo en la issue de la Task 15. Un botón que miente es peor que un botón que falta.

- [ ] **Step 2: Comprobar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/people/person-rail.tsx
git commit -m "feat(persona): PersonRail, el rail derivado de la ficha"
```

---

### Task 14: La página — composición, Suspense y estados de volumen

**Files:**
- Rewrite: `src/app/persona/[id]/page.tsx`
- Create: `src/app/persona/[id]/loading.tsx`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Reescribir `page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPersonProfile } from "@/lib/people/get-person-profile";
import { PersonCard } from "@/components/people/person-card";
import { PersonWorks } from "@/components/people/person-works";
import { PersonRail } from "@/components/people/person-rail";
import { parseRoleSlug, parseTypeSlug } from "@/components/people/person-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { SHELL_PERSON } from "@/lib/ui/layout";

// La ficha depende de `passes` del VISITANTE (estado, nota, progreso, "te falta
// ver", "tu actividad"): es una lectura filtrada por RLS por usuario y por tanto
// NO es cacheable en servidor (regla #437). Nada de `use cache`, ruta dinámica.
//
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return { title: person ? `${person.name} — Biblioshare` : "Biblioshare" };
}

function WorksSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/**
 * El cuerpo entero va dentro del <Suspense>: la PRIMERA visita a una persona
 * hidrata su obra completa desde TMDB / Open Library (una llamada + ~6
 * consultas en lote) y eso no debe bloquear el primer pintado.
 *
 * Se persiste AQUÍ y no en after(): con after() las obras recién traídas
 * todavía no tienen id de catálogo en este render, así que no se podrían
 * enlazar. Ver el spec de 2026-08-12.
 */
async function PersonBody({ id }: { id: string }) {
  const t = await getTranslations("person");
  const user = await getCurrentUser();
  const supabase = await createClient();

  const profile = await getPersonProfile(supabase, user?.id ?? null, id);
  if (!profile) notFound();

  const total = profile.works.length;

  // Estados de VOLUMEN (spec): sin obras y con una sola obra no se rellena el
  // ancho con cajas vacías — la página se queda en dos columnas y sin raíl.
  const rail = total >= 2 ? <PersonRail profile={profile} /> : null;

  return (
    <>
      <div data-area="ficha">
        <PersonCard profile={profile} loggedIn={Boolean(user)} />
      </div>

      <div data-area="obras">
        {total === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("noWorks")}</p>
        ) : (
          <PersonWorks profile={profile} basePath={`/persona/${id}`} />
        )}
      </div>

      {rail && <div data-area="rail">{rail}</div>}
    </>
  );
}

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; credito?: string }>;
}) {
  const { id } = await params;
  const { tipo, credito } = await searchParams;

  return (
    <div className={`mx-auto w-full ${SHELL_PERSON} px-5 pb-10 pt-[26px] lg:px-[30px]`}>
      <div className="person-grid">
        <Suspense fallback={<WorksSkeleton />}>
          <PersonBody id={id} activeType={parseTypeSlug(tipo)} activeRole={parseRoleSlug(credito)} />
        </Suspense>
      </div>
    </div>
  );
}
```

⚠️ **`PersonBody` tiene que aceptar y propagar `activeType` / `activeRole`.** Ajustar su firma a:

```tsx
async function PersonBody({
  id,
  activeType,
  activeRole,
}: {
  id: string;
  activeType?: ItemType;
  activeRole?: CreditRole;
}) {
```

y pasarlos a `<PersonWorks ... activeType={activeType} activeRole={activeRole} />`. Importar `ItemType` de `@/lib/catalog/types` y `CreditRole` de `@/lib/people/types`.

⚠️ **Verificar `getCurrentUser`**: se importa de `@/lib/supabase/server` en `src/app/post/[id]/page.tsx:3`. Comprobar que existe con esa firma.

⚠️ **Verificar la firma de `Skeleton`** (`src/components/ui/skeleton.tsx`) antes de usarla.

- [ ] **Step 2: Crear `loading.tsx` con la MISMA rejilla**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { SHELL_PERSON } from "@/lib/ui/layout";

// MISMA clase `.person-grid` y MISMO shell que `page.tsx`: si el esqueleto monta
// su propia rejilla, esqueleto y contenido divergen en ancho y la página salta
// al hidratarse. Fue el fallo de #372/#376.
export default function Loading() {
  return (
    <div className={`mx-auto w-full ${SHELL_PERSON} px-5 pb-10 pt-[26px] lg:px-[30px]`}>
      <div className="person-grid">
        <div data-area="ficha">
          <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-[18px]">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
        <div data-area="obras" className="flex flex-col gap-3">
          <Skeleton className="h-7 w-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Comprobar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/app/persona src/components/people src/lib/people`
Esperado: sin errores.

- [ ] **Step 4: Levantar la app y verla de verdad**

Antes de arrancar, comprobar que el puerto 3000 está libre:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
```

Si hay un proceso, `Stop-Process -Id <pid>`. Luego `npm run dev` y abrir `/persona/<id>` de una persona con **una sola obra** en BD.

Esperado: la ficha se pinta de inmediato; a los pocos segundos aparece el explorador con **la filmografía completa**, no con una película. Recargar: la segunda visita es instantánea (`credits_hydrated_at` ya tiene valor).

Comprobar también:
- `?tipo=peliculas` y `?credito=direccion` filtran, y «atrás» funciona.
- A 1700px hay tres columnas; a 1300px, dos con el raíl bajo la ficha; a 900px, una.
- Ninguna anchura produce scroll horizontal.

- [ ] **Step 5: Commit**

```bash
git add src/app/persona/[id]/page.tsx src/app/persona/[id]/loading.tsx
git commit -m "feat(persona): ficha a tres columnas con hidratacion en streaming"
```

---

## Fase D — Cierre

### Task 15: e2e, documentación e issues

**Files:**
- Create: `e2e/persona.spec.ts` (ajustar al directorio real de Playwright — comprobar con `Glob **/*.spec.ts` y `Read playwright.config.ts`)
- Modify: `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`

- [ ] **Step 1: Escribir el e2e**

Seguir el estilo de los specs ya existentes (selectores, helpers de login). Cubrir:

```ts
import { expect, test } from "@playwright/test";

test.describe("ficha de persona", () => {
  test("4+ obras: tres columnas, destacadas y lista por año", async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 1000 });
    await page.goto("/persona/<ID_CON_MUCHAS_OBRAS>");

    await expect(page.getByRole("heading", { name: /Obras/ })).toBeVisible();
    await expect(page.getByText("Destacadas")).toBeVisible();
    await expect(page.getByText("El resto, por año")).toBeVisible();

    // Las destacadas NO se repiten abajo.
    const featuredTitle = await page.locator('[data-area="obras"] a').first().innerText();
    const restCount = await page
      .getByText("El resto, por año")
      .locator("xpath=following::a")
      .filter({ hasText: featuredTitle })
      .count();
    expect(restCount).toBe(0);
  });

  test("filtros por URL", async ({ page }) => {
    await page.goto("/persona/<ID>?tipo=peliculas&credito=direccion");
    await expect(page.getByRole("link", { name: /Dirección · \d+/ })).toBeVisible();
  });

  test("cero obras: aviso, sin raíl", async ({ page }) => {
    await page.goto("/persona/<ID_SIN_OBRAS>");
    await expect(page.getByText("Aún no hay obras de esta persona en el catálogo.")).toBeVisible();
    await expect(page.locator('[data-area="rail"]')).toHaveCount(0);
  });

  test("sin scroll horizontal en ningún ancho", async ({ page }) => {
    for (const width of [390, 900, 1300, 1700]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/persona/<ID>");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `overflow a ${width}px`).toBe(false);
    }
  });
});
```

Sustituir `<ID...>` por ids reales de la base de dev (buscarlos con `mcp__supabase-dev__execute_sql`), o por los que use el seed de e2e si lo hay.

- [ ] **Step 2: Ejecutar los e2e CONTRA BUILD DE PRODUCCIÓN**

```bash
npm run build && npm start
```

y en otra terminal `npm run test:e2e -- persona`.

⚠️ **No basta con `next dev`.** El fallo `next-request-in-use-cache` **pasa `next build` y solo revienta en `next start`** (regla #437). Si `npm run build` falla con ese error, hay un `use cache` en la cadena: quitarlo, no intentar sortearlo.

Esperado: los 4 tests en verde.

- [ ] **Step 3: Ejecutar la suite completa**

Run: `npm test && npx tsc --noEmit && npx eslint`
Esperado: todo en verde.

- [ ] **Step 4: `backlog.md`**

Marcar la casilla de la ficha de persona. **La narrativa de cómo se hizo NO va aquí** — va en el spec. Una línea, la casilla y el enlace al spec.

- [ ] **Step 5: `decisiones.md` — append al FINAL, sin reescribir nada anterior**

```markdown
## 2026-08-12 — Ficha de persona: hidratación de la obra completa y tres columnas

- **La filmografía se persiste DENTRO del `<Suspense>`, no en `after()`.** Se
  planteó `after()` para no bloquear, pero con él las obras recién traídas no
  tienen id de catálogo en ese render y no se pueden enlazar: obligaría a una
  ruta resolvedora `/pelicula/tmdb/[id]` y a filas con estados a medias. Con el
  alta en lote (`findOrCreateCatalogItemsBulk`, ~6 consultas en vez de ~600) el
  coste cabe en el boundary, y el primer pintado sigue sin esperar a nada.
- **Los `job` de TMDB que no mapean a `CreditRole` se descartan.** `credits.role`
  solo admite cast/director/writer/creator/author. Producer, Director of
  Photography, Editor, etc. no tienen rol donde ir; guardarlos como texto libre
  habría metido un vocabulario abierto en una columna cerrada.
- **Sin tope en la filmografía** (decisión del usuario). Los únicos filtros son
  de esquema, no de volumen. Las obras sin póster y sin fecha SÍ entran:
  descartarlas sería recortar la obra de la persona, que es el bug que se
  arregla.
- **Los cuatro tweaks del mockup se cierran**: destacadas con exclusión de la
  lista, chip de crédito visible en la fila, resumen «En tu biblioteca» visible
  (solo con ≥3 obras y ≥1 terminada), secciones por rol activas (umbral ≥3 obras
  o ≥20%). No se implementa ningún conmutador: eran andamiaje de exploración.
- **El corte 1000–1600 va a dos columnas.** El handoff dejaba sin definir la
  franja 1000–1200; a 1100px caben ficha y centro sin apretar y bajar a una
  columna ahí desperdicia 300px. El raíl se pliega bajo la ficha IZQUIERDA, no
  bajo el centro: es información derivada, acompaña al contexto.
- **«Seguir a esta persona» NO se implementa.** El mockup lo pinta pero no hay
  backend: existen `follows` (usuario→usuario) y `saga_follows`, no
  `person_follows`. Es una feature entera —tabla, RLS, acciones y decidir qué
  hace seguir—, no un botón. Queda como issue.
```

- [ ] **Step 6: Correr la superficie 6 de `DRIFT-CHECK.md`**

Es la de grants por columna, obligatoria tras añadir una columna. Seguir el procedimiento del documento y anotar el resultado.

- [ ] **Step 7: Abrir las issues**

Cada una con sus **tres etiquetas** en el mismo comando de creación. Escribirlas para quien las lea dentro de seis meses sin este contexto: qué falla, qué se esperaba, cómo reproducirlo, qué SÍ funciona.

```sh
gh issue create --label "area:social,tipo:feature,P3" \
  --title "Seguir a una persona: no existe backend" \
  --body "El mockup de la ficha de persona (marco 5 · 1e) pinta un botón «Seguir a esta persona» al pie de la card izquierda. NO se implementó al rediseñar la ficha (2026-08-12) porque no hay dónde guardarlo: existen \`follows\` (usuario→usuario) y \`saga_follows\`, no hay \`person_follows\`.

Lo que hace falta decidir ANTES de construir nada: **qué hace seguir a una persona**. Si es «notifícame cuando aparezca obra nueva suya», eso pide un job periódico que re-consulte TMDB/Open Library, no solo una tabla — y hoy la hidratación es de una sola vez (\`people.credits_hydrated_at\`, ver spec de 2026-08-12).

Alcance mínimo si se hace: tabla \`person_follows\`, RLS de dueño, acción de seguir/dejar de seguir, y el botón en \`src/components/people/person-card.tsx\`."
```

```sh
gh issue create --label "area:catalogo,tipo:deuda,P2" \
  --title "La hidratación de personas es perezosa: quien no reciba visita se queda con créditos parciales" \
  --body "Desde el 2026-08-12 la ficha de persona trae su obra COMPLETA de TMDB/Open Library la primera vez que alguien la abre, y lo marca en \`people.credits_hydrated_at\`.

Consecuencia asumida: **una persona que nadie visite sigue con los créditos parciales de siempre** (solo lo que \`ensureItemEnriched\` escribió al abrir la ficha de alguna de sus obras). Su ficha, si alguien la abre, se arregla sola en esa primera visita — pero cualquier consulta que lea \`credits\` sin pasar por la ficha (byline de saga, colaboradores, búsquedas por persona) ve los datos viejos.

Para medir cuántas quedan:
\`\`\`sql
select count(*) filter (where credits_hydrated_at is null) as sin_hidratar,
       count(*) as total
from people
where tmdb_id is not null or openlibrary_key is not null;
\`\`\`

Si se decide hacer backfill, ojo con el rate limit de TMDB: es una llamada por persona."
```

```sh
gh issue create --label "area:catalogo,tipo:deuda,P2" \
  --title "getAuthorWorks: tope de 1000 obras y ruido de Open Library sin filtrar" \
  --body "\`src/lib/catalog/openlibrary/author-works.ts\` (2026-08-12) trae la bibliografía de un autor con \`/authors/{key}/works.json?limit=1000\`. Dos límites asumidos a sabiendas:

**1. No pagina.** 1000 es el tope de la API en una página. Un autor con más obras se queda recortado, en silencio. Un segundo viaje HTTP dentro de un render no compensaba.

**2. No desduplica.** \`/works\` de un autor mezcla la obra original con traducciones, recopilaciones y ediciones registradas como obra. NO se filtra por título a propósito: produce falsos positivos («Fundación» y «Fundación e Imperio» no son la misma obra). Consecuencia: la ficha de un autor prolífico puede mostrar la misma novela varias veces con títulos ligeramente distintos.

Reproducir: abrir \`/persona/<id>\` de un autor con muchas ediciones (Asimov, Christie) y contar duplicados en «El resto, por año».

Lo que SÍ funciona: el camino de TMDB (cine/series) no tiene ninguno de los dos problemas — \`combined_credits\` viene desduplicado por (ítem, rol) y en una sola llamada."
```

```sh
gh issue create --label "area:ui,tipo:cobertura,P2" \
  --title "ProfileWork.progressPercent va siempre a null: la fila «en progreso» no pinta barra" \
  --body "\`getPersonProfile\` (\`src/lib/people/get-person-profile.ts\`, 2026-08-12) devuelve \`progressPercent: null\` sin excepción.

El porcentaje real vive en \`passes.position\` (jsonb) y su cálculo depende del tipo: \`{\"page\": 42}\` en libros (÷ \`books.total_pages\`), \`{\"season\": 2, \"episode\": 5}\` en series (sobre \`series.total_episodes\`). El spec de la ficha pide que la fila en progreso muestre etiqueta **y mini barra**; hoy muestra solo la etiqueta.

No es un bug de cálculo: es que no se calcula. Se dejó fuera para no meter la lógica por tipo en el primer corte de la ficha."
```

- [ ] **Step 8: Commit final y push**

```bash
git add e2e docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "test(persona): e2e de la ficha a tres columnas + doc y decisiones"
git push -u origin worktree-persona-tres-columnas
```

Abrir PR (draft) con el resumen del cambio y **el cuestionario de la regla #437 contestado por escrito** (ver el spec, sección «Caché y RLS»).

---

## Autorrevisión del plan

**Cobertura del spec:**

| Requisito del spec | Task |
|---|---|
| Columna `credits_hydrated_at` + grant | 1 |
| Filtro de `job` de TMDB | 2 |
| `combined_credits` sin tope, dedup por (ítem, rol) | 3 |
| Open Library, límite de 1000, ruido documentado | 4 |
| Alta en lote (~6 consultas) | 5 |
| Orquestador, 42501/23505, nunca lanza | 6 |
| 8 funciones puras de derivación + tipos | 7 |
| Contrato `getPersonProfile`, sin `use cache` | 8 |
| `SHELL_PERSON`, `.person-grid`, cortes 1000/1600, i18n | 9 |
| Columna izquierda, retrato cuadrado, bio clamp, resumen condicionado | 10 |
| Fila de 4 zonas, filtros en URL, destacadas | 11 |
| Exclusión destacadas, secciones por rol, aplanado al filtrar | 12 |
| Raíl derivado, cards omitidas sin datos | 13 |
| Suspense, estados de volumen, `loading.tsx` | 14 |
| e2e contra build de producción, docs, issues | 15 |

**Sin cobertura explícita, a propósito:** «Seguir a esta persona» (issue), `progressPercent` (issue), y la variante móvil de carrusel de destacadas — la rejilla de 2 columnas de `PersonFeatured` a <640px cumple el requisito de «no romper» sin añadir un carrusel; si al verlo en el navegador (Task 14, paso 4) el resultado no convence, es un ajuste de clases, no una tarea nueva.

**Riesgos que el implementador debe verificar antes de dar por buena su tarea** (cada uno marcado con ⚠️ en su sitio):

1. **Task 6** — si `credits` tiene índice único sobre `(item_type, item_id, person_id, role)`, el insert en bloque falla entero con 23505. Consultar `pg_indexes` y elegir upsert o pre-filtrado.
2. **Task 8** — los nombres reales de columna de año y tamaño en `books`/`movies`/`series`.
3. **Tasks 10/13/14** — las firmas reales de `ProgressBar` y `Skeleton`.
4. **Task 4** — si `openlibrary/covers.ts` ya exporta el constructor de URL, usarlo en vez del literal.
