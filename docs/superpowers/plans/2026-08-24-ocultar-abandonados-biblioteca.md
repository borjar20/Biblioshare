# Ocultar obras abandonadas de la biblioteca — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda ocultar de sus rejillas de biblioteca las obras que abandonó, con una preferencia persistente que también puede anular vista a vista.

**Architecture:** Una columna booleana en `profiles` guarda la preferencia. Un helper puro (`splitDropped`) hace el trabajo; las tres queries que pintan obras propias (`getLibraryItems`, `getCollection`, `getUncollectedItems`) lo llaman **al final** de su pipeline y devuelven, además de los ítems, cuántos ocultaron. El ocultado es opt-in por sitio de llamada: seis de los diez consumidores de `getLibraryItems` (export CSV, clubes, buscadores) no deben perder filas. La anulación viaja en la URL (`?abandonados=1`).

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript, Supabase (Postgres + RLS), next-intl, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-24-ocultar-abandonados-biblioteca-design.md` — léela antes de empezar. Las decisiones se citan aquí como D1…D11.

## Global Constraints

- **Node 22 obligatorio antes de cualquier test/typecheck.** El shell puede resolver Node v20, con el que `vitest` muere al arrancar. Comprobar `node --version` primero; si no es v22:
  ```bash
  NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
  export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
  ```
- **`.env.local` tiene que estar en el worktree** o los e2e con login se auto-saltan y la suite sale verde sin probar nada. Copiarlo del repo padre (está en `.gitignore`).
- **Un solo `next dev`, en el puerto 3000.** Si 3000 está ocupado, matar el proceso viejo; no levantar un segundo.
- **Nada de `use cache` en el código nuevo** (regla #437 de `AGENTS.md`): todo lo que se toca depende de quién mira. Las rutas afectadas ya llevan `export const instant = false`.
- **Idioma de la UI: español.** Un único fichero de mensajes, `messages/es.json`.
- **El estado vivo del usuario vive en `passes`**, nunca en `library_entries` ni `diary_entries`.
- **Nombres exactos que se usan en varias tareas** (no inventar variantes): columna `hide_dropped`; parámetro de URL `abandonados`; constante `SHOW_DROPPED_PARAM`; helper `splitDropped`; predicado `shouldHideDropped`; tipos `LibraryQuery` y `LibraryView`; campo de retorno `hiddenDropped`; componente `HiddenDroppedNote`; componente `HideDroppedToggle`; server action `updateHideDropped`.
- **Comandos de verificación:**
  - Unitarios de un fichero: `npx vitest run src/lib/library/hide-dropped.test.ts`
  - Toda la suite unitaria: `npm run test`
  - Tipos: `npx tsc --noEmit`
  - Lint: `npm run lint`
  - E2E de un spec: `npx playwright test e2e/biblioteca-ocultar-abandonados.spec.ts`

---

## File Structure

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/library/hide-dropped.ts` | El helper puro `splitDropped`, el predicado `shouldHideDropped` y la constante `SHOW_DROPPED_PARAM`. Sin Supabase, sin React. |
| `src/lib/library/hide-dropped.test.ts` | Unitarios del anterior. |
| `src/components/library/hidden-dropped-note.tsx` | La línea «N abandonados ocultos · Mostrar». Componente **cliente** (`useTranslations`) para poder montarse tanto desde un server component como desde `CollectionItems`, que es cliente. |
| `src/components/settings/hide-dropped-toggle.tsx` | Interruptor de Ajustes. Cliente mínimo (`useTransition` + server action). |
| `supabase/migrations/20260876_profiles_hide_dropped.sql` | La columna. |
| `e2e/biblioteca-ocultar-abandonados.spec.ts` | Recorrido completo en navegador. |

**Se modifican:**

| Fichero | Cambio |
|---|---|
| `src/lib/library/get-library-items.ts` | Tipos `LibraryQuery`/`LibraryView`, nueva `getLibraryView`, `getLibraryItems` pasa a ser envoltorio. |
| `src/lib/library/collections.ts` | `getCollection` y `getUncollectedItems` ganan `hideDropped` y devuelven `hiddenDropped`. |
| `src/lib/profile/get-profile-by-username.ts` | `Profile.hideDropped` + columna en el `select`. |
| `src/lib/profile/actions.ts` | Server action `updateHideDropped`. |
| `src/lib/reactivity/revalidate.ts` | Helper `revalidateCollectionPages`. |
| `src/lib/supabase/database.types.ts` | `hide_dropped` en Row/Insert/Update de `profiles`. |
| `src/app/ajustes/page.tsx` | Sección «Biblioteca» con el interruptor. |
| `src/app/coleccion/page.tsx` | Lee la preferencia, la propaga, pinta la nota. |
| `src/app/coleccion/c/[id]/page.tsx` | `searchParams`, lee la preferencia, la pasa a `getCollection`. |
| `src/components/library/library-filters.tsx` | Chip «Mostrar abandonados» + propagación del parámetro. |
| `src/components/library/collection-detail.tsx` | Pasa `hiddenDropped`/`showDroppedHref` a `CollectionItems`. |
| `src/components/library/collection-items.tsx` | Nota + chip «Abandonado» como enlace cuando hay ocultos. |
| `src/components/library/uncollected-shelf.tsx` | Propaga `hideDropped`, sufijo en el rótulo. |
| `src/app/u/[username]/page.tsx` | Pasa `hideDropped` del dueño a `CollectionTab`. |
| `src/app/u/[username]/_tabs/collection-tab.tsx` | Recibe y aplica `hideDropped`. |
| `messages/es.json` | Seis claves nuevas. |
| `docs/requirements/data-model.md`, `decisiones.md`, `docs/DRIFT-CHECK.md` | Sincronización documental. (`backlog.md` solo si la feature aparece ahí — el 2026-08-24 no aparecía.) |

---

### Task 1: El helper puro

**Files:**
- Create: `src/lib/library/hide-dropped.ts`
- Test: `src/lib/library/hide-dropped.test.ts`

**Interfaces:**
- Consumes: `MediaStatus` de `src/lib/library/types.ts`.
- Produces:
  - `export const SHOW_DROPPED_PARAM = "abandonados"`
  - `export function splitDropped<T extends { status: MediaStatus }>(rows: T[], hideDropped: boolean): { visible: T[]; hiddenDropped: number }`
  - `export function shouldHideDropped(query: { hideDropped?: boolean; status?: MediaStatus }): boolean`

- [ ] **Step 1: Write the failing test**

Crear `src/lib/library/hide-dropped.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldHideDropped, splitDropped } from "./hide-dropped";
import type { MediaStatus } from "./types";

const row = (id: string, status: MediaStatus) => ({ id, status });

const BIBLIOTECA = [
  row("a", "in_progress"),
  row("b", "dropped"),
  row("c", "completed"),
  row("d", "dropped"),
];

describe("splitDropped", () => {
  it("con hideDropped=false devuelve todo y no cuenta nada", () => {
    const { visible, hiddenDropped } = splitDropped(BIBLIOTECA, false);
    expect(visible).toHaveLength(4);
    expect(hiddenDropped).toBe(0);
  });

  it("con hideDropped=true quita SOLO los dropped y los cuenta", () => {
    const { visible, hiddenDropped } = splitDropped(BIBLIOTECA, true);
    expect(visible.map((r) => r.id)).toEqual(["a", "c"]);
    expect(hiddenDropped).toBe(2);
  });

  it("lista vacía → vacía, cero ocultos", () => {
    expect(splitDropped([], true)).toEqual({ visible: [], hiddenDropped: 0 });
  });

  it("todo abandonado → vacío, y el recuento lo explica", () => {
    const { visible, hiddenDropped } = splitDropped([row("b", "dropped")], true);
    expect(visible).toEqual([]);
    expect(hiddenDropped).toBe(1);
  });

  // Es genérico a propósito: lo usan LibraryItem[] y las filas crudas de
  // `passes` (item_type/item_id/status) de getUncollectedItems.
  it("conserva las demás propiedades de la fila", () => {
    const passes = [{ item_type: "book", item_id: "b1", status: "dropped" as MediaStatus },
                    { item_type: "movie", item_id: "m1", status: "planned" as MediaStatus }];
    const { visible } = splitDropped(passes, true);
    expect(visible).toEqual([{ item_type: "movie", item_id: "m1", status: "planned" }]);
  });
});

describe("shouldHideDropped (D5: un filtro de estado explícito manda)", () => {
  it("sin preferencia → false", () => {
    expect(shouldHideDropped({})).toBe(false);
    expect(shouldHideDropped({ hideDropped: false })).toBe(false);
  });

  it("con preferencia y sin filtro de estado → true", () => {
    expect(shouldHideDropped({ hideDropped: true })).toBe(true);
  });

  it("con preferencia y filtro ?status=dropped → false", () => {
    expect(shouldHideDropped({ hideDropped: true, status: "dropped" })).toBe(false);
  });

  it("con preferencia y CUALQUIER filtro de estado → false", () => {
    expect(shouldHideDropped({ hideDropped: true, status: "completed" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/library/hide-dropped.test.ts`
Expected: FAIL — `Failed to resolve import "./hide-dropped"`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/lib/library/hide-dropped.ts`:

```ts
import type { MediaStatus } from "./types";

/**
 * Parámetro de URL que ANULA la preferencia en una vista concreta (spec D7):
 * `?abandonados=1`. No es un filtro —enseña MÁS, no menos— así que no cuenta
 * como filtro activo en el globo de «Filtros» y sobrevive a «Limpiar» (D8).
 */
export const SHOW_DROPPED_PARAM = "abandonados";

/**
 * Separa las obras abandonadas de las demás. Puro y genérico a propósito
 * (spec D11): lo llaman `getLibraryItems`/`getCollection` sobre `LibraryItem[]`
 * ya hidratados y `getUncollectedItems` sobre filas crudas de `passes`, que
 * solo traen `item_type`/`item_id`/`status`.
 *
 * `hiddenDropped` es el número que pinta la línea «N abandonados ocultos», y
 * por eso quien llama tiene que invocar esto DESPUÉS de aplicar sus filtros
 * (búsqueda, género) y ANTES de `limit` (D3, D4): si se cuenta antes, el número
 * incluye obras que el filtro habría descartado igualmente y miente.
 */
export function splitDropped<T extends { status: MediaStatus }>(
  rows: T[],
  hideDropped: boolean,
): { visible: T[]; hiddenDropped: number } {
  if (!hideDropped) return { visible: rows, hiddenDropped: 0 };
  const visible = rows.filter((row) => row.status !== "dropped");
  return { visible, hiddenDropped: rows.length - visible.length };
}

/**
 * ¿Toca ocultar en esta consulta? La preferencia del usuario, salvo que la
 * vista pida un estado concreto (D5): filtrar por «Abandonado» y ver cero
 * resultados es un bug con cara de feature.
 */
export function shouldHideDropped(query: {
  hideDropped?: boolean;
  status?: MediaStatus;
}): boolean {
  return query.hideDropped === true && query.status === undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/library/hide-dropped.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/hide-dropped.ts src/lib/library/hide-dropped.test.ts
git commit -m "feat(biblioteca): helper puro para ocultar obras abandonadas"
```

---

### Task 2: La columna en `profiles`

**Files:**
- Create: `supabase/migrations/20260876_profiles_hide_dropped.sql`
- Modify: `src/lib/supabase/database.types.ts` (bloque `profiles`, ~línea 1678)

**Interfaces:**
- Produces: columna `public.profiles.hide_dropped boolean not null default false`, tipada en `Database["public"]["Tables"]["profiles"]`.

> **Contexto que ahorra un susto:** la trampa de grants por columna (#375) **no aplica aquí**. Medido el 2026-08-24 en dev y en prod: `information_schema.role_table_grants` devuelve `DELETE,INSERT,SELECT,UPDATE` para `anon` y `authenticated` sobre `profiles`, o sea grant de TABLA, y una columna nueva lo hereda. Ojo al comprobarlo: `column_privileges` lista una fila por columna **también** con grant de tabla; la vista que distingue los dos casos es `role_table_grants`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260876_profiles_hide_dropped.sql`:

```sql
-- Preferencia de biblioteca: ocultar de las rejillas las obras abandonadas.
-- Spec: docs/superpowers/specs/2026-08-24-ocultar-abandonados-biblioteca-design.md
--
-- `not null default false` conserva el comportamiento de hoy: nadie se
-- encuentra media biblioteca escondida tras desplegar. Mismo patrón que
-- profiles.show_optional_readings (20260728).
--
-- Sin `grant` explícito A PROPÓSITO: `profiles` tiene grant de TABLA para anon
-- y authenticated (verificado en dev y prod el 2026-08-24), no `revoke all` +
-- grant por columna, así que la columna nueva lo hereda. Si algún día se
-- endurece a grants finos, esta columna necesitará el suyo (issue #375).
alter table public.profiles
  add column if not exists hide_dropped boolean not null default false;

comment on column public.profiles.hide_dropped is
  'Si true, las rejillas de biblioteca del usuario (y su perfil público) omiten las obras cuyo pase activo está en dropped. No afecta a /estadisticas ni al export CSV.';
```

- [ ] **Step 2: Aplicar en dev**

Usar el MCP `supabase-dev`, herramienta `apply_migration`, con `name: "20260876_profiles_hide_dropped"` y el cuerpo SQL de arriba.

- [ ] **Step 3: Verificar contra el objeto real, no contra el ledger**

Con `mcp__supabase-dev__execute_sql`:

```sql
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='profiles' and column_name='hide_dropped';
```
Expected: una fila — `boolean`, `NO`, `false`.

Y la superficie 6 de `docs/DRIFT-CHECK.md` (la consulta de grants por columna que hay allí).
Expected: `profiles` **no** aparece en el resultado.

- [ ] **Step 4: Aplicar en prod y verificar igual**

Mismo `apply_migration` con el MCP `supabase-prod`, y las dos consultas del paso 3 contra prod.
Expected: idéntico a dev.

- [ ] **Step 5: Tipar la columna**

En `src/lib/supabase/database.types.ts`, bloque `profiles`, añadir la línea en los **tres** sub-bloques, en orden alfabético (justo después de `display_name`, antes de `interests`):

- En `Row:` → `          hide_dropped: boolean`
- En `Insert:` → `          hide_dropped?: boolean`
- En `Update:` → `          hide_dropped?: boolean`

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260876_profiles_hide_dropped.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): profiles.hide_dropped, preferencia de ocultar abandonados"
```

---

### Task 3: `getLibraryView` y el filtro opt-in

**Files:**
- Modify: `src/lib/library/get-library-items.ts:296-379`
- Test: `src/lib/library/get-library-items.test.ts` (añadir bloque al final)

**Interfaces:**
- Consumes: `splitDropped`, `shouldHideDropped` (Task 1).
- Produces:
  - `export type LibraryQuery = { itemType?: ItemType; status?: MediaStatus; search?: string; sort?: LibrarySort; favoritesOnly?: boolean; genre?: string; limit?: number; hideDropped?: boolean }`
  - `export type LibraryView = { items: LibraryItem[]; hiddenDropped: number }`
  - `export async function getLibraryView(supabase, userId: string, filters: LibraryQuery): Promise<LibraryView>`
  - `getLibraryItems(supabase, userId, filters: LibraryQuery): Promise<LibraryItem[]>` — misma firma pública que hoy, ahora envoltorio.

- [ ] **Step 1: Write the failing test**

Añadir al final de `src/lib/library/get-library-items.test.ts`:

```ts
import { getLibraryView } from "./get-library-items";

// Cliente falso que devuelve N pases activos y corta la hidratación: `books`,
// `movies`, `series` y `book_editions` resuelven vacío, así que hydrateItems
// descarta todas las claves y devuelve []. Sirve para comprobar el CONTRATO de
// getLibraryView (que existe, que devuelve las dos propiedades y que no
// explota), no el filtrado — eso lo cubren los tests puros de splitDropped.
function fakeEmptyLibrary() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: never[] }) => unknown) => resolve({ data: [] }),
  };
  return { from: () => builder } as never;
}

describe("getLibraryView", () => {
  it("devuelve items y hiddenDropped", async () => {
    const view = await getLibraryView(fakeEmptyLibrary(), "u1", {});
    expect(view).toEqual({ items: [], hiddenDropped: 0 });
  });

  it("biblioteca vacía con hideDropped no inventa ocultos", async () => {
    const view = await getLibraryView(fakeEmptyLibrary(), "u1", { hideDropped: true });
    expect(view.hiddenDropped).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/library/get-library-items.test.ts`
Expected: FAIL — `getLibraryView is not a function` / error de import.

- [ ] **Step 3: Write the implementation**

En `src/lib/library/get-library-items.ts`:

**3a.** Añadir el import junto a los que ya hay arriba:

```ts
import { shouldHideDropped, splitDropped } from "./hide-dropped";
```

**3b.** Justo antes de `export async function getLibraryItems(`, añadir los tipos:

```ts
/** Filtros de una consulta de biblioteca. Se extrae a tipo con nombre porque
 *  ahora lo comparten `getLibraryItems` y `getLibraryView`. Se llama
 *  `LibraryQuery` y no `LibraryFilters` para no chocar con el COMPONENTE
 *  `LibraryFilters` (src/components/library/library-filters.tsx). */
export type LibraryQuery = {
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort?: LibrarySort;
  favoritesOnly?: boolean;
  /** Slug del género (@/lib/catalog/genre-vocab); filtra por su label canónica. */
  genre?: string;
  /** Recorta a los N primeros tras aplicar orden Y tras ocultar (D4). */
  limit?: number;
  /** Oculta las obras cuyo pase activo está en `dropped` (preferencia
   *  `profiles.hide_dropped`). **Opt-in a propósito**: esta función la comparten
   *  el export CSV, el selector de obras de clubes y los buscadores de añadir a
   *  colección, y ninguno debe perder filas (spec D2). Sin efecto si `status`
   *  viene puesto (D5). */
  hideDropped?: boolean;
};

/** Lo que devuelve una consulta de biblioteca de las VISTAS PROPIAS: los ítems
 *  y cuántas obras abandonadas se ocultaron para llegar a ellos. */
export type LibraryView = { items: LibraryItem[]; hiddenDropped: number };
```

**3c.** Renombrar la función existente a `getLibraryView`, cambiar su tipo de retorno y sus salidas. La cabecera pasa de:

```ts
export async function getLibraryItems(
  supabase: SupabaseServerClient,
  userId: string,
  filters: {
    itemType?: ItemType;
    status?: MediaStatus;
    search?: string;
    sort?: LibrarySort;
    favoritesOnly?: boolean;
    /** Slug del género (@/lib/catalog/genre-vocab); filtra por su label canónica. */
    genre?: string;
    /** Recorta a los N primeros tras aplicar orden (General = recientes). */
    limit?: number;
  }
): Promise<LibraryItem[]> {
```

a:

```ts
export async function getLibraryView(
  supabase: SupabaseServerClient,
  userId: string,
  filters: LibraryQuery
): Promise<LibraryView> {
```

**3d.** Dentro del cuerpo hay dos `return` tempranos que devuelven `[]`. Cambiarlos:

- `if (!entries || entries.length === 0) return [];` → `if (!entries || entries.length === 0) return { items: [], hiddenDropped: 0 };`
- Dentro del bloque `if (filters.genre) { ... if (!wanted) return []; ... }` → `if (!wanted) return { items: [], hiddenDropped: 0 };`

**3e.** Sustituir el final de la función. Pasa de:

```ts
  // "recent" (default) keeps the query's own `updated_at desc` order.

  if (filters.limit !== undefined) items = items.slice(0, filters.limit);

  return items;
}
```

a:

```ts
  // "recent" (default) keeps the query's own `updated_at desc` order.

  // Ocultar abandonados va AQUÍ, al final y antes de `limit`, no en la query de
  // `passes` de arriba: `hiddenDropped` es el número que la UI enseña, y si se
  // contara antes de búsqueda/género incluiría obras que esos filtros habrían
  // descartado igualmente (spec D3). Y antes de `limit` para que una vista con
  // tope devuelva N elementos, no N menos los que se ocultaron (D4).
  const split = splitDropped(items, shouldHideDropped(filters));
  items = split.visible;

  if (filters.limit !== undefined) items = items.slice(0, filters.limit);

  return { items, hiddenDropped: split.hiddenDropped };
}

/** La biblioteca sin el recuento de ocultos. Firma intacta desde antes de la
 *  preferencia `hide_dropped`: la usan el export CSV, el selector de obras de
 *  clubes, los buscadores de añadir a colección y los bloques de «hoy», que no
 *  pintan la línea de aviso. Las vistas propias usan `getLibraryView`. */
export async function getLibraryItems(
  supabase: SupabaseServerClient,
  userId: string,
  filters: LibraryQuery
): Promise<LibraryItem[]> {
  return (await getLibraryView(supabase, userId, filters)).items;
}
```

> **Qué NO cubren los unitarios aquí, y por qué.** El ORDEN del pipeline (ocultar después de
> búsqueda/género, antes de `limit` — D3 y D4) no se puede probar en unitario sin montar un cliente
> Supabase falso que devuelva pases, catálogo y géneros coherentes entre sí: media hora de mock para
> comprobar dos líneas de colocación. Lo que sostiene esa garantía es (a) el comentario en el propio
> sitio, que dice por qué está ahí, y (b) el e2e de la Task 11, que mira el resultado visible. Si en
> revisión alguien mueve esas dos líneas, el e2e es lo que lo caza.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/library/get-library-items.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sin errores — ningún sitio de llamada existente cambia de firma.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/get-library-items.ts src/lib/library/get-library-items.test.ts
git commit -m "feat(biblioteca): getLibraryView devuelve items y ocultos, getLibraryItems queda igual"
```

---

### Task 4: Colecciones y la tira «Sin colección»

**Files:**
- Modify: `src/lib/library/collections.ts:142-235`

**Interfaces:**
- Consumes: `splitDropped` (Task 1).
- Produces:
  - `getUncollectedItems(supabase, userId, limit = 12, hideDropped = false): Promise<{ items: LibraryItem[]; total: number; hiddenDropped: number }>`
  - `getCollection(supabase, userId, id, hideDropped = false): Promise<CollectionDetail | null>`
  - `CollectionDetail` gana `hiddenDropped: number`.

- [ ] **Step 1: Escribir el test**

Añadir al final de `src/lib/library/hide-dropped.test.ts` (el helper ya está probado; esto fija la forma exacta de fila que le pasa `getUncollectedItems`, que es donde es fácil olvidarse de pedir `status` en el `select`):

```ts
describe("splitDropped sobre las claves de getUncollectedItems", () => {
  it("las claves conservan item_type/item_id para hydrateItems", () => {
    const keys = [
      { item_type: "book" as const, item_id: "b1", status: "dropped" as MediaStatus },
      { item_type: "series" as const, item_id: "s1", status: "in_progress" as MediaStatus },
    ];
    const { visible, hiddenDropped } = splitDropped(keys, true);
    expect(hiddenDropped).toBe(1);
    expect(visible[0].item_type).toBe("series");
    expect(visible[0].item_id).toBe("s1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/library/hide-dropped.test.ts`
Expected: PASS ya (el helper es genérico). Este test es una red de regresión, no un rojo previo — **no** te detengas a "hacerlo fallar": déjalo y sigue.

- [ ] **Step 3: Implementar `getUncollectedItems`**

En `src/lib/library/collections.ts`, el import de tipos pasa de:

```ts
import type { LibraryItem } from "./types";
```

a:

```ts
import type { LibraryItem, MediaStatus } from "./types";
import { splitDropped } from "./hide-dropped";
```

Cambiar la firma y el cuerpo. De:

```ts
export async function getUncollectedItems(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 12,
): Promise<{ items: LibraryItem[]; total: number }> {
```

a:

```ts
export async function getUncollectedItems(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 12,
  /** Preferencia `profiles.hide_dropped`. Opt-in, como en getLibraryItems. */
  hideDropped = false,
): Promise<{ items: LibraryItem[]; total: number; hiddenDropped: number }> {
```

Y el bloque final. De:

```ts
  const { data: passes } = await supabase
    .from("passes")
    .select("item_type, item_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  const keys = (passes ?? [])
    .map((p) => ({ item_type: p.item_type as ItemType, item_id: p.item_id }))
    .filter((k) => !collected.has(`${k.item_type}:${k.item_id}`));

  return {
    items: await hydrateItems(supabase, userId, keys.slice(0, limit)),
    total: keys.length,
  };
}
```

a:

```ts
  // `status` se pide aquí aunque la tira no lo pinte: el `total` se cuenta
  // sobre las CLAVES, antes de hidratar, así que sin esta columna no habría
  // forma de descontar los abandonados del rótulo. Es una columna más en una
  // consulta que ya se hacía: cero queries extra.
  const { data: passes } = await supabase
    .from("passes")
    .select("item_type, item_id, status")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  const uncollected = (passes ?? [])
    .map((p) => ({
      item_type: p.item_type as ItemType,
      item_id: p.item_id,
      status: p.status as MediaStatus,
    }))
    .filter((k) => !collected.has(`${k.item_type}:${k.item_id}`));

  // Ocultar ANTES del slice: el tope de la tira son 12 portadas visibles, no 12
  // menos las que se hayan escondido (spec D4).
  const { visible: keys, hiddenDropped } = splitDropped(uncollected, hideDropped);

  return {
    items: await hydrateItems(supabase, userId, keys.slice(0, limit)),
    total: keys.length,
    hiddenDropped,
  };
}
```

- [ ] **Step 4: Implementar `getCollection`**

Ampliar el tipo:

```ts
export type CollectionDetail = {
  id: string;
  name: string;
  description: string | null;
  items: LibraryItem[];
  /** Obras de la colección escondidas por `profiles.hide_dropped`. Alimenta la
   *  línea «N abandonados ocultos» de `CollectionItems`. */
  hiddenDropped: number;
  avgRating: number | null;
  isSorteable: boolean;
};
```

Cambiar la firma:

```ts
export async function getCollection(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
  /** Preferencia `profiles.hide_dropped`. */
  hideDropped = false,
): Promise<CollectionDetail | null> {
```

Y el bloque que hidrata y calcula la media. De:

```ts
  const items = await hydrateItems(
    supabase,
    userId,
    (rows ?? []).map((r) => ({ item_type: r.item_type as ItemType, item_id: r.item_id })),
  );
  const ratings = items.map((i) => i.rating).filter((r): r is number => r !== null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  return {
    id: col.id,
    name: col.name,
    description: col.description,
    items,
    avgRating,
    isSorteable: col.is_sorteable,
  };
}
```

a:

```ts
  const hydrated = await hydrateItems(
    supabase,
    userId,
    (rows ?? []).map((r) => ({ item_type: r.item_type as ItemType, item_id: r.item_id })),
  );

  // Se oculta AQUÍ, en servidor, y no en el filtrado de cliente de
  // `CollectionItems`: «N títulos» y la nota media de la cabecera se calculan
  // en este mismo sitio, y tienen que cuadrar con lo que la rejilla enseña
  // (spec D9, D10).
  const { visible: items, hiddenDropped } = splitDropped(hydrated, hideDropped);

  const ratings = items.map((i) => i.rating).filter((r): r is number => r !== null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  return {
    id: col.id,
    name: col.name,
    description: col.description,
    items,
    hiddenDropped,
    avgRating,
    isSorteable: col.is_sorteable,
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test`
Expected: PASS (toda la suite).

Run: `npx tsc --noEmit`
Expected: sin errores. Los dos consumidores (`uncollected-shelf.tsx`, `coleccion/c/[id]/page.tsx`) siguen compilando porque los parámetros nuevos tienen valor por defecto.

- [ ] **Step 6: Commit**

```bash
git add src/lib/library/collections.ts src/lib/library/hide-dropped.test.ts
git commit -m "feat(colecciones): getCollection y getUncollectedItems saben ocultar abandonados"
```

---

### Task 5: Leer y escribir la preferencia

**Files:**
- Modify: `src/lib/profile/get-profile-by-username.ts:7-53`
- Modify: `src/lib/profile/actions.ts` (añadir al final del bloque de acciones de perfil)
- Modify: `src/lib/reactivity/revalidate.ts` (junto a `revalidateLibrary`)

**Interfaces:**
- Produces:
  - `Profile.hideDropped: boolean`
  - `export async function updateHideDropped(value: boolean): Promise<{ error?: "generic" }>`
  - `export function revalidateCollectionPages(): void`

- [ ] **Step 1: Añadir el campo al tipo `Profile`**

En `src/lib/profile/get-profile-by-username.ts`, dentro de `export type Profile = {`, después de `dailyGoalMinutes`:

```ts
  // Preferencia de biblioteca: si true, las rejillas del usuario —y su perfil
  // público, que enseña la misma biblioteca— omiten las obras abandonadas.
  // NO afecta a /estadisticas ni al export CSV (spec 2026-08-24).
  hideDropped: boolean;
```

- [ ] **Step 2: Pedir la columna y mapearla**

`PROFILE_COLUMNS` pasa de:

```ts
const PROFILE_COLUMNS =
  "user_id, username, is_public, display_name, avatar_url, bio, created_at, onboarded_at, daily_goal_minutes, role";
```

a:

```ts
const PROFILE_COLUMNS =
  "user_id, username, is_public, display_name, avatar_url, bio, created_at, onboarded_at, daily_goal_minutes, role, hide_dropped";
```

En la firma de `toProfile`, añadir tras `role: UserRole;`:

```ts
  hide_dropped: boolean;
```

Y en el objeto que devuelve, tras `role: data.role,`:

```ts
    hideDropped: data.hide_dropped,
```

- [ ] **Step 3: Añadir el helper de revalidación**

En `src/lib/reactivity/revalidate.ts`, justo después de `revalidateLibrary`:

```ts
/** Todas las fichas de colección (patrón dinámico): al cambiar una preferencia
 *  que afecta a lo que se pinta en ellas no se sabe cuál está abierta. */
export function revalidateCollectionPages(): void {
  revalidatePath("/coleccion/c/[id]", "page");
}
```

- [ ] **Step 4: Escribir la server action**

En `src/lib/profile/actions.ts`, ampliar el import de revalidación:

```ts
import {
  revalidateProfile,
  revalidateFeed,
  revalidateLibrary,
  revalidateProfilePages,
  revalidateCollectionPages,
} from "@/lib/reactivity/revalidate";
```

Y añadir la acción justo después de `updateGoals`:

```ts
/** Preferencia «ocultar obras abandonadas» (spec 2026-08-24). Booleano suelto y
 *  no un formulario porque el control es un interruptor: no hay nada que
 *  validar más allá del tipo, y el estado optimista del cliente necesita
 *  respuesta inmediata.
 *
 *  Revalida las tres zonas donde la preferencia cambia lo que se pinta: la
 *  biblioteca, las fichas de colección y los perfiles (el propio se ve desde
 *  fuera con la misma regla). */
export async function updateHideDropped(
  value: boolean
): Promise<{ error?: "generic" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ hide_dropped: value })
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidateLibrary();
  revalidateCollectionPages();
  revalidateProfilePages();
  return {};
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/profile/get-profile-by-username.ts src/lib/profile/actions.ts src/lib/reactivity/revalidate.ts
git commit -m "feat(perfil): leer y escribir la preferencia hide_dropped"
```

---

### Task 6: El interruptor en Ajustes

**Files:**
- Create: `src/components/settings/hide-dropped-toggle.tsx`
- Modify: `src/app/ajustes/page.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `updateHideDropped` (Task 5), `Profile.hideDropped` (Task 5).
- Produces: `export function HideDroppedToggle({ hideDropped }: { hideDropped: boolean })`.

- [ ] **Step 1: Añadir las cadenas**

En `messages/es.json`, dentro del objeto `settings`, después de `"dataDescription"`:

```json
    "librarySection": "Biblioteca",
    "hideDroppedLabel": "Ocultar obras abandonadas",
    "hideDroppedHint": "Seguirán en tu biblioteca y en tus estadísticas; solo dejan de aparecer en las rejillas.",
```

- [ ] **Step 2: Escribir el interruptor**

Crear `src/components/settings/hide-dropped-toggle.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateHideDropped } from "@/lib/profile/actions";

// Interruptor de «ocultar obras abandonadas». Aspecto del switch de
// PostPreferences, pero SIN su carga asíncrona: /ajustes ya es un server
// component que tiene el perfil, así que el valor inicial llega por props y la
// primera pintura ya es correcta (nada de un frame en "off" que salta a "on").
export function HideDroppedToggle({ hideDropped }: { hideDropped: boolean }) {
  const t = useTranslations("settings");
  const [on, setOn] = useState(hideDropped);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimista
    startTransition(async () => {
      const result = await updateHideDropped(next);
      if (result?.error) setOn(!next); // revertir si falla
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-foreground">{t("hideDroppedLabel")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("hideDroppedLabel")}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${
            on ? "bg-accent" : "bg-surface-muted"
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${
              on ? "bg-accent-foreground" : "bg-muted-foreground"
            } ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">{t("hideDroppedHint")}</p>
    </div>
  );
}
```

- [ ] **Step 3: Montarlo en Ajustes**

En `src/app/ajustes/page.tsx`, añadir el import junto a los demás componentes:

```tsx
import { HideDroppedToggle } from "@/components/settings/hide-dropped-toggle";
```

Y una sección nueva **entre** la de `dataSection` y la de `noticesSection`:

```tsx
      <Section title={t("librarySection")}>
        <HideDroppedToggle hideDropped={profile.hideDropped} />
      </Section>
```

- [ ] **Step 4: Verificar en el navegador**

Arrancar el server (un solo `next dev`, puerto 3000) y abrir `/ajustes`.
Expected: sección «Biblioteca» con el interruptor apagado. Al pulsarlo se queda encendido; al recargar, sigue encendido.

Comprobar la fila con `mcp__supabase-dev__execute_sql`:
```sql
select username, hide_dropped from public.profiles where hide_dropped;
```
Expected: aparece el usuario de prueba.

Devolverlo a `false` antes de seguir (el resto de tareas asume el estado limpio).

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/hide-dropped-toggle.tsx src/app/ajustes/page.tsx messages/es.json
git commit -m "feat(ajustes): interruptor para ocultar obras abandonadas"
```

---

### Task 7: La línea de aviso, componente compartido

**Files:**
- Create: `src/components/library/hidden-dropped-note.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `export function HiddenDroppedNote({ count, href }: { count: number; href: string })` — no pinta nada si `count <= 0`.

- [ ] **Step 1: Añadir las cadenas**

En `messages/es.json`, dentro del objeto `library`, al mismo nivel que `filters` y `status`:

```json
    "hiddenDropped": "{count, plural, one {# abandonado oculto} other {# abandonados ocultos}}",
    "hiddenDroppedAction": "Mostrar",
```

Y dentro de `library.filters`, después de `"allGenres"`:

```json
    "showDropped": "Mostrar abandonados"
```

- [ ] **Step 2: Escribir el componente**

Crear `src/components/library/hidden-dropped-note.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

// «3 abandonados ocultos · Mostrar». Es la contrapartida obligatoria de ocultar
// cosas: sin ella, una rejilla que enseña menos de lo que hay —o que se queda
// vacía entera— no tiene explicación ni salida.
//
// Es componente CLIENTE por un motivo concreto: se monta desde /coleccion (un
// server component) y también desde CollectionItems, que es cliente. Un server
// component no puede montarse dentro de uno de cliente, así que la versión de
// cliente es la única que sirve en los dos sitios.
export function HiddenDroppedNote({
  count,
  href,
}: {
  count: number;
  /** Enlace que anula la preferencia en ESTA vista (`?abandonados=1`). */
  href: string;
}) {
  const t = useTranslations("library");
  if (count <= 0) return null;

  return (
    <p className="text-center text-[12.5px] text-muted-foreground">
      {t("hiddenDropped", { count })}{" "}
      <span aria-hidden>·</span>{" "}
      <Link href={href} className="font-medium text-accent hover:underline">
        {t("hiddenDroppedAction")}
      </Link>
    </p>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/library/hidden-dropped-note.tsx messages/es.json
git commit -m "feat(biblioteca): nota de abandonados ocultos con salida a ?abandonados=1"
```

---

### Task 8: La rejilla «Todo» y el chip de Filtros

**Files:**
- Modify: `src/components/library/library-filters.tsx`
- Modify: `src/app/coleccion/page.tsx`

**Interfaces:**
- Consumes: `SHOW_DROPPED_PARAM` (Task 1), `getLibraryView` (Task 3), `HiddenDroppedNote` (Task 7), `getUncollectedItems` (Task 4).
- Produces: `LibraryFilters` gana las props `hideDroppedPref?: boolean` y `showDropped?: boolean`.

- [ ] **Step 1: Propagar el parámetro en `LibraryFilters`**

En `src/components/library/library-filters.tsx`:

**1a.** Import nuevo:

```ts
import { SHOW_DROPPED_PARAM } from "@/lib/library/hide-dropped";
```

**1b.** Dos props nuevas en la firma, tras `showTypeFilter = true,`:

```ts
  showTypeFilter = true,
  hideDroppedPref = false,
  showDropped = false,
  extraParams,
```

y en el bloque de tipos, tras `showTypeFilter?: boolean;`:

```ts
  /** Preferencia `profiles.hide_dropped`. Solo con ella activa tiene sentido
   *  ofrecer el chip que la anula. */
  hideDroppedPref?: boolean;
  /** ¿Esta vista lleva ya `?abandonados=1`? */
  showDropped?: boolean;
```

**1c.** En `buildHref`, ampliar el tipo del argumento y conservar el parámetro. La firma pasa a incluir `showDropped?: boolean;` y el cuerpo gana, junto a las demás resoluciones:

```ts
    const nextShowDropped =
      "showDropped" in next ? next.showDropped : showDropped;
```

y, junto a los `params.set` finales:

```ts
    if (nextShowDropped) params.set(SHOW_DROPPED_PARAM, "1");
```

**1d.** En `clearHref`, tras `if (search) params.set("q", search);`:

```ts
    // La anulación NO es un filtro: sobrevive a «Limpiar» por el mismo motivo
    // que la búsqueda — el usuario acaba de pedirla a mano (spec D8).
    if (showDropped) params.set(SHOW_DROPPED_PARAM, "1");
```

**1e.** `activeCount` **no cambia**: `?abandonados=1` enseña más, no menos, y contarlo pondría el globo «1» sobre una vista sin filtrar (D8). Dejar la expresión tal cual y añadir encima el comentario:

```ts
  // Ojo: `showDropped` NO suma aquí a propósito (spec D8).
```

**1f.** En el formulario de búsqueda, junto a los demás `<input type="hidden">`:

```tsx
        {showDropped && (
          <input type="hidden" name={SHOW_DROPPED_PARAM} value="1" />
        )}
```

**1g.** En el bloque de estado, justo después del `.map` de `STATUSES`/`MOVIE_STATUSES` y dentro del mismo `<div className="flex flex-wrap items-center gap-0.5">`:

```tsx
            {/* Anulación de la preferencia «ocultar abandonados». Vive entre los
                estados porque es de lo que habla, pero no es un filtro más: es
                un interruptor de dos posiciones sobre esta vista. */}
            {hideDroppedPref && (
              <Link
                href={buildHref({ showDropped: !showDropped })}
                className={segClass(showDropped)}
              >
                {t("library.filters.showDropped")}
              </Link>
            )}
```

- [ ] **Step 2: Leer la preferencia en `/coleccion`**

En `src/app/coleccion/page.tsx`:

**2a.** Imports nuevos:

```ts
import { getLibraryView } from "@/lib/library/get-library-items";
import { SHOW_DROPPED_PARAM } from "@/lib/library/hide-dropped";
import { HiddenDroppedNote } from "@/components/library/hidden-dropped-note";
```

(`getLibraryItems` sigue importándose: lo usa `TodoOverview` para los destacados.)

**2b.** Declarar el parámetro en `searchParams`, dentro del objeto de tipos:

```ts
    genero?: string;
    abandonados?: string;
```

**2c.** Sustituir la lectura condicional de `profiles`. De:

```ts
  const isExplicitType =
    VALID_TYPES.includes(params.type as ItemType) ||
    params.type === ALL_TYPES_PARAM;
  let interests: ItemType[] = [];
  if (!isExplicitType) {
    const { data: prefs } = await supabase
      .from("profiles")
      .select("interests")
      .eq("user_id", user.id)
      .maybeSingle();
    interests = (prefs?.interests ?? []) as ItemType[];
  }
```

a:

```ts
  const isExplicitType =
    VALID_TYPES.includes(params.type as ItemType) ||
    params.type === ALL_TYPES_PARAM;
  // La lectura del perfil deja de ser condicional: `hide_dropped` hace falta en
  // las tres pestañas (rejilla, tira «Sin colección», destacados), no solo en
  // la rama sin tipo explícito. Es una fila por PK en una página que ya hace
  // varias consultas; `interests` se sigue ignorando cuando la URL manda.
  const { data: prefs } = await supabase
    .from("profiles")
    .select("interests, hide_dropped")
    .eq("user_id", user.id)
    .maybeSingle();
  const interests: ItemType[] = isExplicitType
    ? []
    : ((prefs?.interests ?? []) as ItemType[]);
  const hideDroppedPref = prefs?.hide_dropped ?? false;
  // `?abandonados=1` anula la preferencia solo en esta vista (spec D7).
  const showDropped = params.abandonados === "1";
  const hideDropped = hideDroppedPref && !showDropped;
```

**2d.** Añadir, junto a `clearHref`/`buildHref` conceptuales de la página (justo antes del `return`), el constructor del enlace de la nota:

```ts
  // Enlace «Mostrar» de la nota: la MISMA vista más `?abandonados=1`. Se
  // construye aquí y no en el componente porque el componente es genérico y no
  // conoce los filtros de esta página.
  function showDroppedHref(): string {
    const qs = new URLSearchParams({ tab: "todo" });
    if (params.type) qs.set("type", params.type);
    if (status) qs.set("status", status);
    if (sort !== "recent") qs.set("sort", sort);
    if (genre) qs.set("genero", genre);
    if (search) qs.set("q", search);
    qs.set(SHOW_DROPPED_PARAM, "1");
    return `/coleccion?${qs.toString()}`;
  }
```

**2e.** Pasar las props nuevas a `<LibraryFilters …>`:

```tsx
            hideDroppedPref={hideDroppedPref}
            showDropped={showDropped}
```

**2f.** En el `<Suspense key=…>` de la rejilla, añadir el estado al key para que el skeleton vuelva al cambiar la anulación:

```tsx
            key={`todo:${itemType ?? ""}:${status ?? ""}:${search ?? ""}:${sort}:${genre ?? ""}:${hideDropped}`}
```

**2g.** Pasar las props nuevas a `<LibraryGrid …>`:

```tsx
              hideDropped={hideDropped}
              showDroppedHref={showDroppedHref()}
```

**2h.** Y a `<TodoOverview …>`:

```tsx
              <TodoOverview userId={user.id} hideDropped={hideDropped} />
```

**2i.** Y a `<UncollectedShelf …>` (pestaña `colecciones`):

```tsx
            <UncollectedShelf userId={user.id} hideDropped={hideDropped} />
```

- [ ] **Step 3: Adaptar `LibraryGrid` y `TodoOverview`**

En el mismo fichero, `LibraryGrid` gana dos props y usa `getLibraryView`. La firma pasa a incluir:

```ts
  hideDropped: boolean;
  showDroppedHref: string;
```

y el cuerpo, de:

```ts
  const supabase = await createClient();
  const items = await getLibraryItems(supabase, userId, {
    itemType,
    status,
    search,
    sort,
    genre,
    limit,
  });

  if (items.length === 0) {
    return (
      <EmptyState … />
    );
  }

  return (
    <div className={`grid gap-4 ${COVER_GRID_COLS}`}>
      {items.map((item) => (
        <LibraryItemCard key={item.entryId} item={item} isOwner inCollection />
      ))}
    </div>
  );
```

a:

```ts
  const supabase = await createClient();
  const { items, hiddenDropped } = await getLibraryView(supabase, userId, {
    itemType,
    status,
    search,
    sort,
    genre,
    limit,
    hideDropped,
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          glyph={<InboxIcon className="h-7 w-7" />}
          title={emptyTitle}
          message={emptyLabel}
          action={
            <Link href="/buscar" className={buttonVariants("primary")}>
              {emptyCta}
            </Link>
          }
        />
        {/* La nota TAMBIÉN en el vacío: una biblioteca entera de abandonados
            que parece vacía sin explicación es el peor resultado posible de
            esta feature. */}
        <HiddenDroppedNote count={hiddenDropped} href={showDroppedHref} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-4 ${COVER_GRID_COLS}`}>
        {items.map((item) => (
          <LibraryItemCard key={item.entryId} item={item} isOwner inCollection />
        ))}
      </div>
      <HiddenDroppedNote count={hiddenDropped} href={showDroppedHref} />
    </div>
  );
```

`TodoOverview` gana la prop y la propaga a los destacados:

```ts
async function TodoOverview({
  userId,
  hideDropped,
}: {
  userId: string;
  hideDropped: boolean;
}) {
  const supabase = await createClient();
  const [summary, favorites] = await Promise.all([
    // El Resumen NO se toca: su barra apilada por estado es el único sitio
    // donde se ve que existen abandonados (spec D6).
    getLibrarySummary(supabase, userId),
    getLibraryItems(supabase, userId, { favoritesOnly: true, hideDropped }),
  ]);
```

- [ ] **Step 4: Adaptar `UncollectedShelf`**

En `src/components/library/uncollected-shelf.tsx`:

```tsx
export async function UncollectedShelf({
  userId,
  hideDropped = false,
}: {
  userId: string;
  hideDropped?: boolean;
}) {
  const supabase = await createClient();
  const [{ items, total, hiddenDropped }, t, tLibrary] = await Promise.all([
    getUncollectedItems(supabase, userId, SHELF_LIMIT, hideDropped),
    getTranslations("collection"),
    getTranslations("library"),
  ]);

  if (total === 0) return null;

  // La tira es un recordatorio, no un inventario: el recuento cuenta lo que se
  // ve y el sufijo explica la diferencia. Sin enlace de «Mostrar» a propósito —
  // vive en la pestaña Colecciones, que no tiene barra de filtros donde
  // devolver al usuario.
  const heading = [
    t("uncollected.heading"),
    t("uncollected.count", { count: total }),
    hiddenDropped > 0 ? tLibrary("hiddenDropped", { count: hiddenDropped }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return <FavoritesShelf items={items} variant="compact" heading={heading} />;
}
```

- [ ] **Step 5: Verificar en el navegador**

Con la preferencia **encendida** en Ajustes y al menos una obra abandonada en la biblioteca, abrir `/coleccion?tab=todo`.
Expected:
- la obra abandonada no aparece en la rejilla;
- debajo se lee «1 abandonado oculto · Mostrar»;
- al pulsar «Mostrar» la URL pasa a `…&abandonados=1` y la obra aparece;
- en «Filtros» hay un chip «Mostrar abandonados», activo en esa vista;
- el globo de «Filtros» **no** cuenta un filtro extra por la anulación;
- con «Filtros → Abandonado» la obra aparece aunque no haya `?abandonados=1`.

- [ ] **Step 6: Verificar tipos, lint y unitarios**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/library/library-filters.tsx src/components/library/uncollected-shelf.tsx src/app/coleccion/page.tsx
git commit -m "feat(biblioteca): la rejilla Todo oculta abandonados y ofrece salida"
```

---

### Task 9: El detalle de colección

**Files:**
- Modify: `src/app/coleccion/c/[id]/page.tsx`
- Modify: `src/components/library/collection-detail.tsx`
- Modify: `src/components/library/collection-items.tsx`

**Interfaces:**
- Consumes: `getCollection` con `hideDropped` (Task 4), `HiddenDroppedNote` (Task 7), `SHOW_DROPPED_PARAM` (Task 1).
- Produces: `CollectionDetail` (componente) gana la prop `showDroppedHref: string`; `CollectionItems` gana `hiddenDropped: number` y `showDroppedHref: string`.

- [ ] **Step 1: Leer la preferencia y el parámetro en la página**

En `src/app/coleccion/c/[id]/page.tsx`:

**1a.** Import nuevo:

```ts
import { SHOW_DROPPED_PARAM } from "@/lib/library/hide-dropped";
```

**1b.** La página pasa a recibir `searchParams`:

```ts
export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ abandonados?: string }>;
}) {
  const { id } = await params;
  const { abandonados } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/coleccion/c/${id}`));

  // Misma regla que en /coleccion: la preferencia manda salvo que la URL la
  // anule para esta vista (spec D7).
  const { data: prefs } = await supabase
    .from("profiles")
    .select("hide_dropped")
    .eq("user_id", user.id)
    .maybeSingle();
  const hideDropped = (prefs?.hide_dropped ?? false) && abandonados !== "1";

  const detail = await getCollection(supabase, user.id, id, hideDropped);
  if (!detail) notFound();
```

**1c.** Pasar el enlace al componente:

```tsx
      <CollectionDetail
        detail={detail}
        showDroppedHref={`/coleccion/c/${id}?${SHOW_DROPPED_PARAM}=1`}
      />
```

- [ ] **Step 2: Propagar en `CollectionDetail`**

En `src/components/library/collection-detail.tsx`, la firma pasa a:

```tsx
export async function CollectionDetail({
  detail,
  showDroppedHref,
}: {
  detail: CollectionDetailData;
  showDroppedHref: string;
}) {
```

Y el bloque final, de:

```tsx
      {detail.items.length === 0 ? (
        <EmptyState
          glyph={<InboxIcon className="h-7 w-7" />}
          title={t("emptyDetail")}
        />
      ) : (
        <CollectionItems items={detail.items} />
      )}
```

a:

```tsx
      {detail.items.length === 0 ? (
        <div className="flex flex-col gap-3">
          <EmptyState
            glyph={<InboxIcon className="h-7 w-7" />}
            title={t("emptyDetail")}
          />
          {/* Una colección entera de abandonados no puede parecer una colección
              vacía: sin esto no habría forma de saber que hay algo detrás. */}
          <HiddenDroppedNote
            count={detail.hiddenDropped}
            href={showDroppedHref}
          />
        </div>
      ) : (
        <CollectionItems
          items={detail.items}
          hiddenDropped={detail.hiddenDropped}
          showDroppedHref={showDroppedHref}
        />
      )}
```

con el import:

```tsx
import { HiddenDroppedNote } from "@/components/library/hidden-dropped-note";
```

> `detail.items.length` (el «N títulos» de la cabecera) y `detail.avgRating` ya cuentan lo visible: `getCollection` filtró antes de calcularlos (Task 4). No hay nada que cambiar aquí.

- [ ] **Step 3: La nota y el chip-enlace en `CollectionItems`**

En `src/components/library/collection-items.tsx`:

**3a.** Imports nuevos:

```tsx
import Link from "next/link";
import { HiddenDroppedNote } from "@/components/library/hidden-dropped-note";
```

**3b.** La firma pasa a:

```tsx
export function CollectionItems({
  items,
  hiddenDropped,
  showDroppedHref,
}: {
  items: LibraryItem[];
  hiddenDropped: number;
  /** Enlace que devuelve los abandonados a esta ficha (`?abandonados=1`). */
  showDroppedHref: string;
}) {
```

**3c.** En el bloque «Estado», el chip de cada estado pasa a distinguir el caso `dropped` con ocultos. Sustituir el `.map` de `STATUSES` por:

```tsx
            {STATUSES.map((s) => {
              // Con abandonados ocultos, «Abandonado» NO puede ser un filtro de
              // cliente: filtraría un array del que ya se quitaron, y devolvería
              // «Sin resultados». Pasa a ser el enlace que los trae de vuelta —
              // pedir «Abandonado» siempre enseña abandonados (spec D5, D10).
              if (s === "dropped" && hiddenDropped > 0) {
                return (
                  <Link key={s} href={showDroppedHref} className={segClass(false)}>
                    {t(`library.status.${s}`)}
                  </Link>
                );
              }
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={segClass(status === s)}
                >
                  {t(`library.status.${s}`)}
                </button>
              );
            })}
```

**3d.** La nota, al pie, en las dos ramas del render final. Sustituir:

```tsx
      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("collection.noMatch")}
        </p>
      ) : (
        <div className={`grid gap-3.5 ${COVER_GRID_COLS}`}>
          {filtered.map((item) => (
            <LibraryItemCard
              key={item.entryId}
              item={item}
              isOwner={false}
              inCollection
            />
          ))}
        </div>
      )}
```

por:

```tsx
      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("collection.noMatch")}
        </p>
      ) : (
        <div className={`grid gap-3.5 ${COVER_GRID_COLS}`}>
          {filtered.map((item) => (
            <LibraryItemCard
              key={item.entryId}
              item={item}
              isOwner={false}
              inCollection
            />
          ))}
        </div>
      )}

      <HiddenDroppedNote count={hiddenDropped} href={showDroppedHref} />
```

- [ ] **Step 4: Verificar en el navegador**

Con la preferencia encendida y una colección que contenga una obra abandonada, abrir su ficha.
Expected:
- la obra abandonada no está en la rejilla;
- la cabecera dice «N títulos» contando solo las visibles;
- al pie se lee «1 abandonado oculto · Mostrar»;
- en «Filtros → Estado», pulsar «Abandonado» navega a `?abandonados=1` y la obra aparece (no muestra «Sin resultados»);
- ya en `?abandonados=1`, «Abandonado» vuelve a ser el filtro de cliente de siempre.

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/coleccion/c/[id]/page.tsx src/components/library/collection-detail.tsx src/components/library/collection-items.tsx
git commit -m "feat(colecciones): el detalle oculta abandonados sin romper el filtro de estado"
```

---

### Task 10: El perfil público

**Files:**
- Modify: `src/app/u/[username]/page.tsx` (bloque `tab === "coleccion"`, ~línea 230)
- Modify: `src/app/u/[username]/_tabs/collection-tab.tsx:53-76`

**Interfaces:**
- Consumes: `Profile.hideDropped` (Task 5), `getLibraryItems` con `hideDropped` (Task 3).
- Produces: `CollectionTab` gana la prop `hideDropped: boolean`.

- [ ] **Step 1: Pasar la preferencia del DUEÑO**

En `src/app/u/[username]/page.tsx`, el bloque de la pestaña pasa a:

```tsx
      {tab === "coleccion" && (
        <Suspense
          key={`${itemType ?? ""}:${profile.hideDropped}`}
          fallback={<SkeletonCoverGrid count={10} />}
        >
          <CollectionTab
            userId={profile.userId}
            basePath={basePath}
            itemType={itemType}
            // Preferencia del DUEÑO, no del visitante: si decide que sus
            // abandonados no cuentan como su biblioteca, tampoco los enseña
            // (spec, alcance).
            hideDropped={profile.hideDropped}
          />
        </Suspense>
      )}
```

- [ ] **Step 2: Aplicarla en `CollectionTab`**

En `src/app/u/[username]/_tabs/collection-tab.tsx`, la firma pasa a:

```tsx
export async function CollectionTab({
  userId,
  basePath,
  itemType,
  hideDropped,
}: {
  userId: string;
  basePath: string;
  itemType?: ItemType;
  hideDropped: boolean;
}) {
```

y las dos consultas, de:

```tsx
  const [items, favorites] = await Promise.all([
    getLibraryItems(supabase, userId, { itemType, sort }),
    itemType
      ? Promise.resolve([])
      : getLibraryItems(supabase, userId, { favoritesOnly: true }),
  ]);
```

a:

```tsx
  const [items, favorites] = await Promise.all([
    getLibraryItems(supabase, userId, { itemType, sort, hideDropped }),
    // Destacados de toda la biblioteca, no del tipo filtrado: son la portada
    // del perfil, no parte de la rejilla.
    itemType
      ? Promise.resolve([])
      : getLibraryItems(supabase, userId, { favoritesOnly: true, hideDropped }),
  ]);
```

> Aquí **no** se pinta `HiddenDroppedNote`: al visitante no le importa la preferencia del dueño, y decirle «hay 3 que no te enseño» es peor que no decir nada. Por eso esta pestaña usa `getLibraryItems` y no `getLibraryView`.

- [ ] **Step 3: Verificar en el navegador**

Con la preferencia encendida, abrir `/u/<tu-usuario>?tab=coleccion` (mejor en ventana de incógnito, como visitante, si el perfil es público).
Expected: la obra abandonada no aparece, y **no** hay línea de «N ocultos».

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/u/[username]/page.tsx" "src/app/u/[username]/_tabs/collection-tab.tsx"
git commit -m "feat(perfil): la biblioteca pública respeta la preferencia del dueño"
```

---

### Task 11: E2E del recorrido completo

**Files:**
- Create: `e2e/biblioteca-ocultar-abandonados.spec.ts`

**Interfaces:**
- Consumes: toda la feature.

> Antes de nada: `.env.local` tiene que estar en el worktree, o el spec se auto-salta y sale verde sin probar nada.

- [ ] **Step 1: Escribir el spec**

Crear `e2e/biblioteca-ocultar-abandonados.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

// E2E de la preferencia «ocultar obras abandonadas». Lo que cubre y las
// unitarias no pueden:
//
//  · que el interruptor de /ajustes escribe de verdad en `profiles` y que la
//    rejilla lo respeta en la siguiente navegación;
//  · que `?abandonados=1` devuelve la obra SIN apagar la preferencia — o sea
//    que es una anulación por vista, no un interruptor encubierto;
//  · que filtrar por estado «Abandonado» enseña abandonados aunque la
//    preferencia esté activa. Es el límite duro de la spec (D5) y lo que
//    impide que un futuro «ya que estamos» convierta el filtro en un vacío.
//
// Mismo patrón de sesión y limpieza que `sagas-opcionales-saltables.spec.ts`:
// `fetch` nativo (no el fixture `request`, que muere con el contexto), `res.ok`
// comprobado en cada escritura, y la semilla devuelta a como estaba.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

let userId: string;
let hideBaseline = false;
/** Un pase activo del usuario que este spec pone en `dropped` y devuelve a su
 *  estado original al terminar. Se elige el más recientemente tocado que NO
 *  esté ya abandonado, para no depender de un seed concreto. */
let passId: string;
let passStatusBaseline: string;
let obraTitulo: string;

test.beforeAll(async () => {
  const perfiles = (await (
    await api(`profiles?username=eq.${USERNAME}&select=user_id,hide_dropped`)
  ).json()) as Array<{ user_id: string; hide_dropped: boolean }>;
  if (perfiles.length !== 1) throw new Error(`beforeAll: no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  hideBaseline = perfiles[0].hide_dropped;

  const pases = (await (
    await api(
      `passes?user_id=eq.${userId}&is_active=eq.true&item_type=eq.book&status=neq.dropped` +
        `&select=id,item_id,status&order=updated_at.desc&limit=1`,
    )
  ).json()) as Array<{ id: string; item_id: string; status: string }>;
  if (pases.length !== 1) throw new Error("beforeAll: el usuario de pruebas no tiene ningún libro activo sin abandonar");
  passId = pases[0].id;
  passStatusBaseline = pases[0].status;

  const libros = (await (
    await api(`books?id=eq.${pases[0].item_id}&select=title`)
  ).json()) as Array<{ title: string }>;
  obraTitulo = libros[0].title;

  await api(`passes?id=eq.${passId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "dropped" }),
  });
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: false }),
  });
});

test.afterAll(async () => {
  await api(`passes?id=eq.${passId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: passStatusBaseline }),
  });
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: hideBaseline }),
  });
});

test("el interruptor de Ajustes esconde la obra abandonada y deja salida", async ({ page }) => {
  await loginAsDevtest(page);

  // Punto de partida: con la preferencia apagada, la obra se ve.
  await page.goto("/coleccion?tab=todo&type=todos");
  await expect(page.getByText(obraTitulo).first()).toBeVisible();

  // Encender la preferencia.
  await page.goto("/ajustes");
  const interruptor = page.getByRole("switch", { name: "Ocultar obras abandonadas" });
  await expect(interruptor).toHaveAttribute("aria-checked", "false");
  await interruptor.click();
  await expect(interruptor).toHaveAttribute("aria-checked", "true");

  // Persiste: recargar Ajustes la sigue mostrando encendida.
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Ocultar obras abandonadas" }),
  ).toHaveAttribute("aria-checked", "true");

  // Y la rejilla la respeta, con la nota que explica el hueco.
  await page.goto("/coleccion?tab=todo&type=todos");
  await expect(page.getByText(obraTitulo)).toHaveCount(0);
  const nota = page.getByText(/abandonad[oa]s? ocultos?/);
  await expect(nota).toBeVisible();

  // «Mostrar» la devuelve SIN apagar la preferencia.
  await page.getByRole("link", { name: "Mostrar" }).click();
  await expect(page).toHaveURL(/abandonados=1/);
  await expect(page.getByText(obraTitulo).first()).toBeVisible();

  await page.goto("/ajustes");
  await expect(
    page.getByRole("switch", { name: "Ocultar obras abandonadas" }),
  ).toHaveAttribute("aria-checked", "true");

  // Y volver a la vista sin el parámetro la vuelve a esconder.
  await page.goto("/coleccion?tab=todo&type=todos");
  await expect(page.getByText(obraTitulo)).toHaveCount(0);
});

test("filtrar por estado «Abandonado» enseña abandonados aunque la preferencia esté activa", async ({ page }) => {
  await loginAsDevtest(page);
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: true }),
  });

  await page.goto("/coleccion?tab=todo&type=todos&status=dropped");
  await expect(page.getByText(obraTitulo).first()).toBeVisible();
  // Sin nota: no se ha ocultado nada en esta vista.
  await expect(page.getByText(/abandonad[oa]s? ocultos?/)).toHaveCount(0);
});

test("en el detalle de colección, «N títulos» cuenta lo visible y hay salida", async ({ page }) => {
  await loginAsDevtest(page);
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: false }),
  });

  // Colección propia y desechable, con la obra abandonada dentro. Se crea aquí
  // en vez de depender del seed: así el recuento esperado es 1, no «lo que
  // hubiera».
  const item = (await (
    await api(`passes?id=eq.${passId}&select=item_type,item_id`)
  ).json()) as Array<{ item_type: string; item_id: string }>;
  const col = (await (
    await api("collections", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, name: "[QA] Ocultar abandonados" }),
    })
  ).json()) as Array<{ id: string }>;
  const collectionId = col[0].id;

  try {
    await api("collection_items", {
      method: "POST",
      body: JSON.stringify({
        collection_id: collectionId,
        item_type: item[0].item_type,
        item_id: item[0].item_id,
      }),
    });

    // Con la preferencia apagada: 1 título, y se ve.
    await page.goto(`/coleccion/c/${collectionId}`);
    await expect(page.getByText(obraTitulo).first()).toBeVisible();
    await expect(page.getByText("1 título")).toBeVisible();

    // Encendida: 0 títulos visibles, estado vacío, y la nota con su salida.
    await api(`profiles?user_id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ hide_dropped: true }),
    });
    await page.goto(`/coleccion/c/${collectionId}`);
    await expect(page.getByText(obraTitulo)).toHaveCount(0);
    await expect(page.getByText(/abandonad[oa]s? ocultos?/)).toBeVisible();

    await page.getByRole("link", { name: "Mostrar" }).click();
    await expect(page).toHaveURL(/abandonados=1/);
    await expect(page.getByText(obraTitulo).first()).toBeVisible();
  } finally {
    await api(`collection_items?collection_id=eq.${collectionId}`, { method: "DELETE" });
    await api(`collections?id=eq.${collectionId}`, { method: "DELETE" });
  }
});
```

- [ ] **Step 2: Correr el spec contra build de producción**

Los fallos de `next-request-in-use-cache` pasan `next build` y salen en `next start`, así que no basta `next dev`:

```bash
npm run build && npm run start &
npx playwright test e2e/biblioteca-ocultar-abandonados.spec.ts
```

Expected: 3 passed. **Cero `skipped`** — un `skipped` significa que falta `.env.local` y el resultado no vale.

- [ ] **Step 3: Correr la suite unitaria completa**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/biblioteca-ocultar-abandonados.spec.ts
git commit -m "test(e2e): recorrido de ocultar obras abandonadas"
```

---

### Task 12: Sincronizar la documentación y abrir las issues

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`
- Modify: `docs/DRIFT-CHECK.md`

> Un cambio no está «hecho» hasta que el doc canónico correspondiente vuelve a ser cierto (`AGENTS.md`).

- [ ] **Step 1: `data-model.md`**

Localizar la sección donde se documenta `profiles` (buscar `show_optional_readings`, que sigue el mismo patrón) y añadir `hide_dropped`:

```markdown
| `hide_dropped` | `boolean not null default false` | Preferencia de biblioteca: oculta de las rejillas propias —y del perfil público del dueño— las obras cuyo pase activo está en `dropped`. **No** afecta a `/estadisticas` ni al export CSV. Mismo patrón que `show_optional_readings`. Añadida por `20260876_profiles_hide_dropped.sql` (2026-08-24). |
```

Actualizar la fecha de verificación de la cabecera de ese documento.

- [ ] **Step 2: `backlog.md` — comprobar, y probablemente no tocar**

Run: `grep -n -i "abandonad" docs/requirements/backlog.md`
Expected (verificado el 2026-08-24): sin resultados. Esta feature **no estaba** en el backlog: nació de una petición directa, no de la lista de «features que no existen». Si el grep sigue vacío, **no se toca el fichero** — añadir una línea marcada ya como hecha solo ensucia una lista cuyo propósito es lo que falta.

Si el grep SÍ devuelve algo (alguien la anotó entre medias), marcar esa casilla y añadir el enlace a la spec. Sin narrativa: el *cómo* vive en la spec, nunca en el backlog.

- [ ] **Step 3: `decisiones.md`**

Añadir **al final** (append-only, sin reescribir las anteriores):

```markdown
## Ocultar abandonados: el filtro es opt-in por sitio de llamada (2026-08-24)

`getLibraryItems` la llaman diez sitios y solo cuatro son «vistas propias». El export CSV, el
selector de obras de clubes, los buscadores de añadir a colección y los bloques de «hoy» comparten
esa función; hacer que ocultara por defecto habría vaciado filas del respaldo del usuario sin que
nada lo delate. Por eso `hideDropped` es un filtro que hay que pedir, y las vistas propias usan un
envoltorio aparte (`getLibraryView`) que además devuelve cuántas ocultó.

Corolario que conviene no deshacer en un refactor: **el Resumen de la biblioteca
(`CollectionSummary`) no filtra.** Su barra apilada por estado es el único sitio de la app donde se
ve que existen obras abandonadas; ocultar ahí dejaría al usuario sin saber que las tiene.

Spec: `docs/superpowers/specs/2026-08-24-ocultar-abandonados-biblioteca-design.md`.
```

- [ ] **Step 4: `DRIFT-CHECK.md`**

En la superficie 6, dejar constancia de lo medido para que la próxima columna en `profiles` no repita la investigación:

```markdown
> **Nota del 2026-08-24.** `profiles` tiene grant de **TABLA** (`role_table_grants` devuelve
> `DELETE,INSERT,SELECT,UPDATE` para `anon` y `authenticated`, en dev y en prod), no grants por
> columna, así que `hide_dropped` (`20260876`) no necesitó `grant` propio. Ojo al comprobarlo:
> `column_privileges` lista una fila por columna también con grant de tabla — la vista que
> distingue los dos casos es `role_table_grants`.
```

- [ ] **Step 5: Abrir las dos issues**

```sh
gh issue create --label "area:ui,tipo:acta,P3" \
  --title "Ocultar abandonados: por qué es un booleano y no una lista de estados ocultos" \
  --body "Se decidió a sabiendas que \`profiles.hide_dropped\` fuera un booleano y no una lista de estados que ocultar (\`hide_statuses text[]\`). Motivo: nadie ha pedido «ocultar pendientes» ni «ocultar completados», y construir el motor de filtros por si acaso significa mantener migración, UI y tests de un caso hipotético. Si algún día se pide, la salida es generalizar la columna entonces. Esto es memoria, no trabajo pendiente: no se hace ni se cierra. Origen: spec docs/superpowers/specs/2026-08-24-ocultar-abandonados-biblioteca-design.md, «No entra»."

gh issue create --label "area:ui,tipo:deuda,P2" \
  --title "Con abandonados ocultos, el Resumen de la biblioteca sigue contándolos" \
  --body "Con \`profiles.hide_dropped\` activa, la rejilla de /coleccion?tab=todo omite las obras abandonadas, pero el Resumen (\`CollectionSummary\`) sigue contándolas en su total y en su barra apilada por estado.

Es DELIBERADO (spec D6): la barra por estado es el único sitio de la app donde se ve que tienes abandonados, y borrar el segmento dejaría al usuario sin saberlo. Además el Resumen solo se pinta cuando no hay ningún filtro activo, y la rejilla no muestra recuento propio, así que no hay dos números contradictorios en pantalla; la línea «N abandonados ocultos» bajo la rejilla explica la diferencia.

Qué observar en uso real: si alguien reporta el desajuste entre el total del Resumen y lo que ve, la salida NO es ocultar el segmento — es un matiz en el propio Resumen (p. ej. marcar el segmento como oculto). Se abre para que la decisión quede rastreable y no se \"arregle\" en la dirección contraria.

Origen: spec docs/superpowers/specs/2026-08-24-ocultar-abandonados-biblioteca-design.md."
```

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md docs/DRIFT-CHECK.md
git commit -m "docs: sincronizar data-model, decisiones y drift-check con hide_dropped"
```

(Añadir `docs/requirements/backlog.md` al `git add` solo si el Step 2 lo cambió.)

---

## Verificación final (antes de abrir la PR)

- [ ] `npm run test` — verde
- [ ] `npx tsc --noEmit` — sin errores
- [ ] `npm run lint` — sin errores
- [ ] `npm run build` — compila
- [ ] `npx playwright test e2e/biblioteca-ocultar-abandonados.spec.ts` contra `npm run start` — 2 passed, 0 skipped
- [ ] `npx playwright test e2e/coleccion-v2.spec.ts e2e/coleccion-v2-s2.spec.ts e2e/coleccion-general.spec.ts e2e/biblioteca-filtro-genero.spec.ts e2e/biblioteca-todos-tipos.spec.ts` — sin regresiones en las vistas tocadas
- [ ] La columna existe en dev **y** en prod, verificada contra `information_schema.columns`
- [ ] `profiles` no aparece en la consulta de grants por columna (superficie 6)
- [ ] La preferencia del usuario de pruebas quedó como estaba (`hide_dropped = false` salvo que ya estuviera en `true`)
- [ ] Puerto 3000 libre o con un único `next dev` propio; sin worktrees huérfanos en `.claude/worktrees/`
