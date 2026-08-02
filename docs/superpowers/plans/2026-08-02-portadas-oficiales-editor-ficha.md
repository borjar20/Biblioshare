# Portadas oficiales alternas en el editor de ficha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En el editor de ficha, junto al upload manual de portada, mostrar bajo demanda una galería de portadas oficiales de la obra (TMDB para peli/serie, OpenLibrary para libro) y cambiar la portada actual con un clic.

**Architecture:** Dos server actions nuevas en `edit-actions.ts` — una que trae las URLs de portadas oficiales leyendo el id externo del ítem desde la BD, otra que fija `cover_url` a la URL elegida con allowlist de host. La lógica de mapeo/fetch vive en helpers puros y testeables (`tmdb.ts`, `openlibrary/covers.ts`, `openlibrary/work-detail.ts`, nuevo `official-covers.ts`). La UI amplía `CatalogEditorForm` sin tocar el upload manual.

**Tech Stack:** Next.js (server actions), React 19 (`useTransition`, estado local), Supabase JS, TMDB API, OpenLibrary API, next-intl, Vitest.

## Global Constraints

- **Persistencia = URL externa directa.** `cover_url` guarda la URL de `image.tmdb.org` / `covers.openlibrary.org` tal cual; no se copia a Storage.
- **Base de imagen TMDB = `w342`** (`TMDB_IMAGE_BASE` ya definido en `tmdb.ts`), coherente con `searchMovies`/`searchSeries`.
- **Portadas de libro OpenLibrary = tamaño `L`** (`buildCoverUrl(id, "L")`).
- **Allowlist de host obligatoria** en cualquier action que fije `cover_url` desde el cliente: solo `image.tmdb.org` y `covers.openlibrary.org`, protocolo `https:`.
- **Tope 12 portadas**, deduplicadas.
- Las server actions llamadas directamente desde el cliente validan `isValidItemType` + `isValidUuid` al entrar (args manipulables), y pasan por `requireCollaborator`.
- Los helpers de fetch **nunca lanzan**: fuente caída / sin id / sin API key → lista vacía.
- Un solo locale: `messages/es.json`.
- Vitest: `npx vitest run <ruta>`. Lint: `npm run lint`. Typecheck: `npx tsc --noEmit`.

---

### Task 1: Mapper + fetcher de posters TMDB

**Files:**
- Modify: `src/lib/catalog/tmdb.ts` (añadir al final, junto a los otros helpers TMDB)
- Test: `src/lib/catalog/tmdb.test.ts` (crear)

**Interfaces:**
- Consumes: `TMDB_IMAGE_BASE` (constante ya en el módulo, `https://image.tmdb.org/t/p/w342`), `tmdbGet<T>` (helper privado ya en el módulo; devuelve `null` sin API key o `!res.ok`).
- Produces:
  - `mapPosterPaths(data: TmdbImagesResponse | null): string[]`
  - `getPosterPaths(kind: "movie" | "tv", tmdbId: number): Promise<string[]>`
  - `type TmdbImagesResponse = { posters?: Array<{ file_path?: string | null }> }`

- [ ] **Step 1: Write the failing test**

Crear `src/lib/catalog/tmdb.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapPosterPaths } from "./tmdb";

describe("mapPosterPaths", () => {
  it("convierte file_path en URL absoluta con base w342", () => {
    const urls = mapPosterPaths({
      posters: [{ file_path: "/aaa.jpg" }, { file_path: "/bbb.jpg" }],
    });
    expect(urls).toEqual([
      "https://image.tmdb.org/t/p/w342/aaa.jpg",
      "https://image.tmdb.org/t/p/w342/bbb.jpg",
    ]);
  });

  it("descarta file_path nulo/vacío", () => {
    const urls = mapPosterPaths({
      posters: [{ file_path: null }, { file_path: "" }, { file_path: "/ok.jpg" }],
    });
    expect(urls).toEqual(["https://image.tmdb.org/t/p/w342/ok.jpg"]);
  });

  it("respuesta null o sin posters -> []", () => {
    expect(mapPosterPaths(null)).toEqual([]);
    expect(mapPosterPaths({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog/tmdb.test.ts`
Expected: FAIL — `mapPosterPaths` no exportado.

- [ ] **Step 3: Write minimal implementation**

Añadir al final de `src/lib/catalog/tmdb.ts`:

```ts
// ── Galería de portadas oficiales (editor de ficha) ──────────────────────────
// TMDB /images devuelve TODOS los posters de la obra (varios idiomas/ediciones).
// Se usan para ofrecer al colaborador portadas oficiales alternas a la actual.
export type TmdbImagesResponse = {
  posters?: Array<{ file_path?: string | null }>;
};

// Puro: mapea file_path -> URL absoluta con el mismo base (w342) que las
// portadas importadas, para que la elegida sea coherente con el resto.
export function mapPosterPaths(data: TmdbImagesResponse | null): string[] {
  return (data?.posters ?? [])
    .map((p) => p.file_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p) => `${TMDB_IMAGE_BASE}${p}`);
}

// `include_image_language=es,en,null` prioriza posters en español/inglés y los
// sin idioma (arte sin texto); TMDB los ordena por votos. Nunca lanza: tmdbGet
// ya devuelve null si no hay API key o la llamada falla.
export async function getPosterPaths(
  kind: "movie" | "tv",
  tmdbId: number
): Promise<string[]> {
  const data = await tmdbGet<TmdbImagesResponse>(
    `/${kind}/${tmdbId}/images?include_image_language=es,en,null`
  );
  return mapPosterPaths(data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/tmdb.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/tmdb.ts src/lib/catalog/tmdb.test.ts
git commit -m "feat(covers): mapper y fetcher de posters TMDB"
```

---

### Task 2: Mapper + fetcher de portadas OpenLibrary

**Files:**
- Modify: `src/lib/catalog/openlibrary/covers.ts` (añadir mapper puro)
- Modify: `src/lib/catalog/openlibrary/work-detail.ts` (añadir fetcher)
- Test: `src/lib/catalog/openlibrary/covers.test.ts` (crear)

**Interfaces:**
- Consumes: `buildCoverUrl(coverId, size)` (ya en `covers.ts`), `normalizeWorkKey`, `FETCH_TIMEOUT_MS`, `WorkResponse` (ya en `work-detail.ts`).
- Produces:
  - `mapWorkCovers(covers?: number[] | null): string[]` (en `covers.ts`)
  - `fetchWorkCovers(workKey: string): Promise<string[]>` (en `work-detail.ts`)

- [ ] **Step 1: Write the failing test**

Crear `src/lib/catalog/openlibrary/covers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapWorkCovers } from "./covers";

describe("mapWorkCovers", () => {
  it("mapea cada cover id a una URL de tamaño L", () => {
    expect(mapWorkCovers([123, 456])).toEqual([
      "https://covers.openlibrary.org/b/id/123-L.jpg",
      "https://covers.openlibrary.org/b/id/456-L.jpg",
    ]);
  });

  it("filtra ids no positivos (OpenLibrary usa -1 como 'sin portada')", () => {
    expect(mapWorkCovers([-1, 0, 789])).toEqual([
      "https://covers.openlibrary.org/b/id/789-L.jpg",
    ]);
  });

  it("undefined/null -> []", () => {
    expect(mapWorkCovers(undefined)).toEqual([]);
    expect(mapWorkCovers(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog/openlibrary/covers.test.ts`
Expected: FAIL — `mapWorkCovers` no exportado.

- [ ] **Step 3: Write minimal implementation**

Añadir al final de `src/lib/catalog/openlibrary/covers.ts`:

```ts
// Todas las portadas de una obra (JSON `covers: number[]`), en tamaño L para la
// ficha. OpenLibrary marca "sin portada" con -1, así que se filtran los <= 0.
export function mapWorkCovers(covers?: number[] | null): string[] {
  return (covers ?? [])
    .filter((id) => id > 0)
    .map((id) => buildCoverUrl(id, "L"))
    .filter((url): url is string => url !== null);
}
```

Añadir al final de `src/lib/catalog/openlibrary/work-detail.ts` (el `import { buildCoverUrl } from "./covers"` de la cabecera pasa a incluir `mapWorkCovers`):

```ts
// Portadas oficiales de la obra para el editor de ficha. Mismo endpoint que
// fetchWork; aquí solo interesa el array `covers`. Nunca lanza: fuente caída o
// clave vacía -> [].
export async function fetchWorkCovers(workKey: string): Promise<string[]> {
  try {
    const key = normalizeWorkKey(workKey);
    if (!key) return [];

    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: WorkResponse = await res.json();
    return mapWorkCovers(data.covers);
  } catch {
    return [];
  }
}
```

Y actualizar el import de la cabecera de `work-detail.ts`:

```ts
import { buildCoverUrl, mapWorkCovers } from "./covers";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/openlibrary/covers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/openlibrary/covers.ts src/lib/catalog/openlibrary/covers.test.ts src/lib/catalog/openlibrary/work-detail.ts
git commit -m "feat(covers): mapper y fetcher de portadas de obra OpenLibrary"
```

---

### Task 3: Helpers de allowlist y tope

**Files:**
- Create: `src/lib/catalog/official-covers.ts`
- Test: `src/lib/catalog/official-covers.test.ts`

**Interfaces:**
- Produces:
  - `isAllowedCoverHost(url: string): boolean`
  - `capOfficialCovers(urls: string[]): string[]`
  - `MAX_OFFICIAL_COVERS = 12`

- [ ] **Step 1: Write the failing test**

Crear `src/lib/catalog/official-covers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedCoverHost, capOfficialCovers } from "./official-covers";

describe("isAllowedCoverHost", () => {
  it("acepta los CDN oficiales por https", () => {
    expect(isAllowedCoverHost("https://image.tmdb.org/t/p/w342/x.jpg")).toBe(true);
    expect(isAllowedCoverHost("https://covers.openlibrary.org/b/id/1-L.jpg")).toBe(true);
  });

  it("rechaza otros hosts, http y basura", () => {
    expect(isAllowedCoverHost("https://evil.example.com/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("http://image.tmdb.org/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("no-soy-una-url")).toBe(false);
    expect(isAllowedCoverHost("")).toBe(false);
  });
});

describe("capOfficialCovers", () => {
  it("deduplica conservando el orden", () => {
    expect(capOfficialCovers(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("corta en 12", () => {
    const many = Array.from({ length: 30 }, (_, i) => `u${i}`);
    expect(capOfficialCovers(many)).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog/official-covers.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

Crear `src/lib/catalog/official-covers.ts`:

```ts
// Piezas puras compartidas por las server actions de portadas oficiales del
// editor de ficha (src/lib/catalog/edit-actions.ts). Aquí no hay fetch ni
// Supabase: solo la allowlist de host y el recorte de la galería, para poder
// testearlas sin red.

export const MAX_OFFICIAL_COVERS = 12;

// Los únicos hosts desde los que se puede fijar cover_url. setOfficialCover se
// llama DIRECTO desde el cliente (la URL es manipulable), así que sin esto
// cualquiera dejaría una URL arbitraria servida en la ficha compartida.
const ALLOWED_COVER_HOSTS = new Set(["image.tmdb.org", "covers.openlibrary.org"]);

export function isAllowedCoverHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_COVER_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Deduplica (conservando orden) y corta al tope: TMDB puede devolver decenas de
// posters y nadie elige entre 40 miniaturas.
export function capOfficialCovers(urls: string[]): string[] {
  return [...new Set(urls)].slice(0, MAX_OFFICIAL_COVERS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/official-covers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/official-covers.ts src/lib/catalog/official-covers.test.ts
git commit -m "feat(covers): allowlist de host y tope de galería"
```

---

### Task 4: Server actions `fetchOfficialCovers` y `setOfficialCover`

**Files:**
- Modify: `src/lib/catalog/edit-actions.ts` (añadir tras `uploadCover`)

**Interfaces:**
- Consumes: `getPosterPaths` (Task 1), `fetchWorkCovers` (Task 2), `isAllowedCoverHost` + `capOfficialCovers` (Task 3); helpers ya existentes en el fichero: `isValidItemType`, `isValidUuid`, `requireCollaborator`, `createClient`, `revalidateItemPage`, tipo `EditItemState`.
- Produces:
  - `fetchOfficialCovers(itemType: ItemType, itemId: string): Promise<{ covers: string[] }>`
  - `setOfficialCover(itemType: ItemType, itemId: string, url: string): Promise<EditItemState>`

- [ ] **Step 1: Añadir imports**

En la cabecera de `src/lib/catalog/edit-actions.ts`, tras el import de `uploadPublicImage`:

```ts
import { getPosterPaths } from "@/lib/catalog/tmdb";
import { fetchWorkCovers } from "@/lib/catalog/openlibrary/work-detail";
import { isAllowedCoverHost, capOfficialCovers } from "@/lib/catalog/official-covers";
```

- [ ] **Step 2: Implementar `fetchOfficialCovers`**

Añadir tras la función `uploadCover` (después de su cierre, ~línea 234):

```ts
// Trae las portadas oficiales de la obra para la galería del editor. Lee el id
// externo (tmdb_id / openlibrary_work_key) desde la BD por itemId — nunca del
// cliente. Se llama DIRECTO desde el cliente, de ahí la validación de runtime.
// Nunca lanza: sin id externo, fuente caída o sin API key -> { covers: [] }.
export async function fetchOfficialCovers(
  itemType: ItemType,
  itemId: string
): Promise<{ covers: string[] }> {
  if (!isValidItemType(itemType) || !isValidUuid(itemId)) return { covers: [] };

  const supabase = await createClient();
  const guard = await requireCollaborator(supabase);
  if (guard) return { covers: [] };

  let urls: string[] = [];

  if (itemType === "movie" || itemType === "series") {
    const table = itemType === "movie" ? "movies" : "series";
    const { data } = await supabase
      .from(table)
      .select("tmdb_id")
      .eq("id", itemId)
      .single();
    if (data?.tmdb_id) {
      urls = await getPosterPaths(itemType === "movie" ? "movie" : "tv", data.tmdb_id);
    }
  } else {
    const { data } = await supabase
      .from("books")
      .select("openlibrary_work_key")
      .eq("id", itemId)
      .single();
    if (data?.openlibrary_work_key) {
      urls = await fetchWorkCovers(data.openlibrary_work_key);
    }
  }

  return { covers: capOfficialCovers(urls) };
}
```

- [ ] **Step 3: Implementar `setOfficialCover`**

Añadir justo después:

```ts
// Fija cover_url a una portada oficial elegida en la galería. La allowlist de
// host es la defensa clave: como uploadCover, esta action se invoca directa
// desde el cliente y `url` es 100% manipulable. Guardamos la URL externa tal
// cual (misma política que el importador), sin copiar a Storage.
export async function setOfficialCover(
  itemType: ItemType,
  itemId: string,
  url: string
): Promise<EditItemState> {
  if (!isValidItemType(itemType) || !isValidUuid(itemId)) return { error: "generic" };
  if (!isAllowedCoverHost(url)) return { error: "generic" };

  const supabase = await createClient();
  const guard = await requireCollaborator(supabase);
  if (guard) return guard;

  const { error } =
    itemType === "book"
      ? await supabase.from("books").update({ cover_url: url }).eq("id", itemId)
      : itemType === "movie"
        ? await supabase.from("movies").update({ cover_url: url }).eq("id", itemId)
        : await supabase.from("series").update({ cover_url: url }).eq("id", itemId);

  if (error) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  return { ok: true };
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: sin errores en `edit-actions.ts`.

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/edit-actions.ts
git commit -m "feat(covers): server actions para galería y selección de portada oficial"
```

---

### Task 5: i18n — claves de la galería

**Files:**
- Modify: `messages/es.json` (namespace `catalogEdit`)

**Interfaces:**
- Produces: claves `catalogEdit.showOfficialCovers`, `hideOfficialCovers`, `noOfficialCovers`, `coversLoading` (consumidas por Task 6).

- [ ] **Step 1: Añadir las claves**

En `messages/es.json`, dentro del objeto `catalogEdit`, tras `"changeCover": "Cambiar",` añadir:

```json
    "showOfficialCovers": "Ver otras portadas",
    "hideOfficialCovers": "Ocultar portadas",
    "noOfficialCovers": "No hay otras portadas oficiales",
    "coversLoading": "Buscando portadas…",
```

- [ ] **Step 2: Verificar JSON válido**

Run: `node -e "require('./messages/es.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "feat(covers): copia i18n de la galería de portadas oficiales"
```

---

### Task 6: UI de la galería en `CatalogEditorForm`

**Files:**
- Modify: `src/components/detail/catalog-editor.tsx`

**Interfaces:**
- Consumes: `fetchOfficialCovers`, `setOfficialCover` (Task 4); claves i18n (Task 5); estado/patrón existentes (`coverUrl`, `setCoverUrl`, `t`, `accent`).

- [ ] **Step 1: Importar las nuevas actions**

En el bloque de import de `@/lib/catalog/edit-actions` (líneas ~23-31), añadir `fetchOfficialCovers` y `setOfficialCover`:

```ts
import {
  updateCatalogItem,
  uploadCover,
  fetchOfficialCovers,
  setOfficialCover,
  updateEdition,
  deleteEdition,
  resyncEditions,
  type EditItemState,
  type DeleteEditionState,
} from "@/lib/catalog/edit-actions";
```

- [ ] **Step 2: Añadir estado de la galería**

En `CatalogEditorForm`, tras el bloque de estado de portada (`objectUrlRef`, ~línea 288), añadir:

```ts
  // Galería de portadas oficiales (carga bajo demanda). `officialCovers === null`
  // = aún no se ha pedido; una vez pedida se cachea y reabrir no vuelve a la red.
  const [showCovers, setShowCovers] = useState(false);
  const [officialCovers, setOfficialCovers] = useState<string[] | null>(null);
  const [coversLoading, startCoversTransition] = useTransition();
  const [coversError, setCoversError] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);

  function toggleCovers() {
    const next = !showCovers;
    setShowCovers(next);
    // Primera apertura: pedir la galería. Reaperturas usan la caché de estado.
    if (next && officialCovers === null) {
      setCoversError(false);
      startCoversTransition(async () => {
        const result = await fetchOfficialCovers(itemType, itemId);
        setOfficialCovers(result.covers);
      });
    }
  }

  // Elegir una portada oficial: optimista igual que handleCoverChange. Si el
  // servidor rechaza (host no permitido, fallo de update), se revierte.
  async function handlePickOfficial(url: string) {
    const previousCoverUrl = coverUrl;
    setCoverUrl(url);
    setCoverSaving(true);
    setCoverError(false);
    try {
      const result = await setOfficialCover(itemType, itemId, url);
      if (result.error) {
        setCoverUrl(previousCoverUrl);
        setCoverError(true);
      }
    } catch {
      setCoverUrl(previousCoverUrl);
      setCoverError(true);
    } finally {
      setCoverSaving(false);
    }
  }
```

- [ ] **Step 3: Renderizar el toggle y la galería**

En el JSX, sustituir el bloque de error de portada existente:

```tsx
          {coverError && (
            <p className="text-sm text-status-dropped">{t("errors.generic")}</p>
          )}
```

por el toggle + galería + error:

```tsx
          {coverError && (
            <p className="text-sm text-status-dropped">{t("errors.generic")}</p>
          )}

          {/* Galería de portadas oficiales: alternativa al upload manual de
              arriba. Bajo demanda para no llamar a TMDB/OpenLibrary en cada
              edición que solo toca texto. */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={toggleCovers}
              className={`self-start font-mono text-[10px] tracking-[0.06em] uppercase ${accent.text} hover:underline`}
            >
              {showCovers ? t("hideOfficialCovers") : t("showOfficialCovers")}
            </button>

            {showCovers && (
              <>
                {coversLoading && (
                  <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
                    {t("coversLoading")}
                  </p>
                )}
                {!coversLoading && officialCovers?.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("noOfficialCovers")}</p>
                )}
                {!coversLoading && coversError && (
                  <p className="text-sm text-status-dropped">{t("errors.generic")}</p>
                )}
                {!coversLoading && officialCovers && officialCovers.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {officialCovers.map((url) => {
                      const selected = url === coverUrl;
                      return (
                        <button
                          key={url}
                          type="button"
                          disabled={coverSaving}
                          onClick={() => void handlePickOfficial(url)}
                          aria-label={t("changeCover")}
                          aria-pressed={selected}
                          className={`relative aspect-[2/3] overflow-hidden rounded-[5px] border-2 disabled:opacity-60 ${
                            selected ? accent.border : "border-transparent"
                          }`}
                        >
                          <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/catalog-editor.tsx
git commit -m "feat(covers): galería de portadas oficiales en el editor de ficha"
```

---

### Task 7: Verificación e2e del flujo (browser) + docs

**Files:**
- Modify: `docs/requirements/decisiones.md` (append)
- Modify: `docs/requirements/backlog.md` (si existe la entrada de la feature)

**Interfaces:** ninguna nueva; cierre de la feature.

- [ ] **Step 1: Verificar el flujo en navegador**

Seguir `docs/TESTING.md` (default del proyecto: verificación automatizada vía `qa-verifier` y/o `npm run test:e2e`). Con un usuario colaborador+ y un `next dev` único en el puerto 3000 (ver AGENTS.md):
1. Abrir una ficha de película, "Editar ficha" → "Ver otras portadas" → aparece grid de posters TMDB.
2. Click en un poster distinto → la portada cambia y persiste tras recargar.
3. Repetir en una ficha de libro (portadas OpenLibrary) y una de serie.
4. Ficha sin id externo → "No hay otras portadas oficiales".

Si el navegador no está disponible, escribir checklist manual (excepción de `docs/TESTING.md`).

- [ ] **Step 2: Registrar la decisión de arquitectura**

Añadir al FINAL de `docs/requirements/decisiones.md` (append-only) una entrada nueva: portadas oficiales del editor guardan la **URL externa directa** de TMDB/OpenLibrary (no se copia a Storage), con allowlist de host en `setOfficialCover`; motivo: consistencia con las portadas del importador y cero coste de Storage, aceptando el riesgo de rotura si la fuente cambia.

- [ ] **Step 3: Cerrar en backlog**

Si `docs/requirements/backlog.md` tiene la entrada de esta feature, marcar la casilla. Si no existe, no inventarla.

- [ ] **Step 4: Abrir issues de lo pendiente**

Regla AGENTS.md: cualquier pendiente/sospecha (p.ej. libros con galería pobre en OpenLibrary, portadas TMDB sin filtrar por idioma) → issue en el repo, no en el cuerpo de la PR.

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(covers): decisión de URL externa directa y cierre en backlog"
```

---

## Self-Review — cobertura del spec

| Sección del spec | Task |
|------------------|------|
| `fetchOfficialCovers` (lee id externo de BD, movie/series/book) | Task 4 (usa Task 1 + Task 2) |
| Helper TMDB `getPosterPaths` + base w342 | Task 1 |
| Portadas de libro OpenLibrary (`covers[]`, tamaño L) | Task 2 |
| `setOfficialCover` + allowlist de host | Task 4 (allowlist en Task 3) |
| Tope 12 + dedup | Task 3 |
| UI: toggle bajo demanda, grid, selección optimista, revert | Task 6 |
| i18n `catalogEdit` (4 claves nuevas) | Task 5 |
| Tests: mapper TMDB, mapper OL, allowlist, tope/dedup | Tasks 1, 2, 3 |
| e2e opcional + sync de docs (decisiones/backlog/issues) | Task 7 |

Sin placeholders. Firmas consistentes entre tasks (`getPosterPaths`, `fetchWorkCovers`, `isAllowedCoverHost`, `capOfficialCovers`, `mapPosterPaths`, `mapWorkCovers`). El upload manual (`uploadCover`/`handleCoverChange`) no se modifica en ninguna task.
