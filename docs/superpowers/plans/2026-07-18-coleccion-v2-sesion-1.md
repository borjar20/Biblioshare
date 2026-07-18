# Colección v2 · Sesión 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner los cimientos de «Mi Biblioteca» v2 — migración `collections`/`collection_items`, capa de datos y acciones, y las pantallas de **Colecciones** (grid) y **detalle**, con el nav reorganizado a `Colecciones · Todo`.

**Architecture:** Next.js App Router (server components + server actions) sobre Supabase con RLS. Dos tablas nuevas (M:N ítem↔colección) con RLS solo-dueño. Los derivados (abanico de portadas, recuento, nota media) se calculan por consulta reutilizando la hidratación de `getLibraryItems`. El detalle vive en ruta propia `/coleccion/c/[id]`; el grid y `Todo` son subtabs de `/coleccion`.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Supabase (Postgres + RLS), next-intl, Tailwind, Playwright (e2e).

## Global Constraints

- **NO es el Next.js de tu training:** lee `node_modules/next/dist/docs/` si dudas de una API (AGENTS.md). Server actions con `"use server"`; revalidación con `revalidatePath`.
- **Colecciones PRIVADAS**: RLS solo-dueño (`auth.uid() = user_id`); columna `visibility` existe (`default 'private'`) pero la RLS ignora `'public'` por ahora.
- **Enum de tipo confirmado:** `item_type` = `enum ('book','movie','series')` (`schema-baseline.sql:174`).
- **Migraciones:** vía agente `supabase-schema` / MCP `apply_migration`. **La migración NO se aplica a la BD hasta que el usuario la apruebe.** Se aplica a **dev**; a prod al mergear. Tras aplicar: regenerar `database.types.ts` y anexar a `supabase/schema-baseline.sql`.
- **Verificación del proyecto** (no TDD unitario): `npx tsc --noEmit` + `npx eslint <ficheros>` limpios; Playwright e2e (`npx playwright test`, Node 22 vía `fnm use`) contra `next dev`; verificación en navegador (claro/oscuro, 400 y 1280). Regla de los dos árboles: locators `:visible` si hay duplicado móvil/PC.
- **i18n:** claves nuevas en `messages/es.json` (único locale); usar patrón ICU plural donde aplique.
- **Copy:** la sección se renombra a **«Mi Biblioteca»**.
- **Reutiliza v1** (PR #81): `CollectionSummary`, `LibraryItemCard` (con `inCollection`), el grid. Esta rama sale de `plan-02-coleccion` (que ya trae v1) o de `main` una vez #81 mergeado.

---

### Task 1: Migración `collections` + `collection_items` + RLS

**Files:**
- Create: `supabase/migrations/20260718_collections.sql`
- Modify: `supabase/schema-baseline.sql` (anexar el DDL al final, en orden)
- Regenerate: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tablas `public.collections` y `public.collection_items` con RLS solo-dueño; tipos generados `Database['public']['Tables']['collections']` y `['collection_items']`.

- [ ] **Step 1: Escribir el fichero de migración**

```sql
-- 20260718_collections.sql
-- Colecciones v2: estanterías/sellos del usuario. Privadas (RLS solo-dueño);
-- `visibility` nace para abrir público más adelante sin re-migrar.
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  visibility  text not null default 'private' check (visibility in ('private','public')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id, position, created_at);

create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  item_type     item_type not null,
  item_id       uuid not null,
  position      integer not null default 0,
  added_at      timestamptz not null default now(),
  primary key (collection_id, item_type, item_id)
);
create index collection_items_col_idx on public.collection_items (collection_id, position, added_at);

alter table public.collections enable row level security;
create policy collections_owner on public.collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.collection_items enable row level security;
create policy collection_items_owner on public.collection_items
  for all using (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  );
```

- [ ] **Step 2: Presentar el SQL al usuario y ESPERAR aprobación**

No ejecutar nada aún. Mostrar el fichero y confirmar. Solo tras el OK, continuar.

- [ ] **Step 3: Aplicar a dev**

Vía agente `supabase-schema` (o MCP `apply_migration` con `name: "20260718_collections"`). Aplica al proyecto **dev**.

- [ ] **Step 4: Verificar RLS y ausencia de advisors nuevos**

Ejecutar (MCP `get_advisors` type=security) y comprobar que `collections`/`collection_items` salen con RLS habilitada y sin `SECURITY DEFINER` colgando. Además, un `execute_sql` de humo:
```sql
select count(*) from public.collections;   -- 0, sin error de RLS con service role
```
Expected: 0 filas, sin errores; advisors sin nuevos hallazgos.

- [ ] **Step 5: Regenerar tipos y anexar a baseline**

Regenerar `database.types.ts` (MCP `generate_typescript_types`) y anexar el DDL de Step 1 a `supabase/schema-baseline.sql` (al final, respetando el orden real de prod). `npx tsc --noEmit` debe seguir limpio.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260718_collections.sql supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "feat(coleccion): migración collections + collection_items (RLS solo-dueño)"
```

---

### Task 2: Capa de datos — `collections.ts`

**Files:**
- Create: `src/lib/library/collections.ts`
- Reference: `src/lib/library/get-library-items.ts` (hidratación reutilizable), `src/lib/catalog/media-accent.ts`

**Interfaces:**
- Consumes: `getLibraryItems` no directamente; se replica el patrón de hidratación de portada por tipo (books/movies/series).
- Produces:
  - `type CollectionCard = { id: string; name: string; count: number; fanCovers: (string|null)[]; dominantType: ItemType | null }`
  - `type CollectionDetail = { id: string; name: string; description: string | null; items: LibraryItem[]; avgRating: number | null }`
  - `listCollections(supabase, userId, sort?: "recent"|"name"|"size"): Promise<CollectionCard[]>`
  - `getCollection(supabase, userId, id: string): Promise<CollectionDetail | null>`

- [ ] **Step 1: Implementar `listCollections`**

```ts
// src/lib/library/collections.ts
"use server";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { LibraryItem } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CollectionSort = "recent" | "name" | "size";
export type CollectionCard = {
  id: string;
  name: string;
  count: number;
  fanCovers: (string | null)[]; // hasta 3, más reciente primero
  dominantType: ItemType | null;
};

// Portada por (item_type, item_id) reutilizando el patrón de get-library-items.
async function coversFor(
  supabase: SupabaseServerClient,
  keys: { item_type: ItemType; item_id: string }[],
): Promise<Map<string, string | null>> {
  const byType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const k of keys) byType[k.item_type].push(k.item_id);
  const out = new Map<string, string | null>();
  const [books, movies, series] = await Promise.all([
    byType.book.length ? supabase.from("books").select("id, cover_url").in("id", byType.book) : Promise.resolve({ data: [] }),
    byType.movie.length ? supabase.from("movies").select("id, cover_url").in("id", byType.movie) : Promise.resolve({ data: [] }),
    byType.series.length ? supabase.from("series").select("id, cover_url").in("id", byType.series) : Promise.resolve({ data: [] }),
  ]);
  for (const r of books.data ?? []) out.set(`book:${r.id}`, r.cover_url);
  for (const r of movies.data ?? []) out.set(`movie:${r.id}`, r.cover_url);
  for (const r of series.data ?? []) out.set(`series:${r.id}`, r.cover_url);
  return out;
}

export async function listCollections(
  supabase: SupabaseServerClient,
  userId: string,
  sort: CollectionSort = "recent",
): Promise<CollectionCard[]> {
  const { data: cols, error } = await supabase
    .from("collections")
    .select("id, name, updated_at, position")
    .eq("user_id", userId);
  if (error) throw error;
  if (!cols || cols.length === 0) return [];

  // Ítems de todas las colecciones, para recuento + 3 portadas por colección.
  const { data: items } = await supabase
    .from("collection_items")
    .select("collection_id, item_type, item_id, added_at, position")
    .in("collection_id", cols.map((c) => c.id));

  const covers = await coversFor(
    supabase,
    (items ?? []).map((i) => ({ item_type: i.item_type as ItemType, item_id: i.item_id })),
  );

  const cards: CollectionCard[] = cols.map((c) => {
    const own = (items ?? [])
      .filter((i) => i.collection_id === c.id)
      .sort((a, b) => (a.position - b.position) || b.added_at.localeCompare(a.added_at));
    const typeCounts: Record<string, number> = {};
    for (const i of own) typeCounts[i.item_type] = (typeCounts[i.item_type] ?? 0) + 1;
    const dominantType = (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as ItemType | null;
    return {
      id: c.id,
      name: c.name,
      count: own.length,
      fanCovers: own.slice(0, 3).map((i) => covers.get(`${i.item_type}:${i.item_id}`) ?? null),
      dominantType,
    };
  });

  if (sort === "name") cards.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "size") cards.sort((a, b) => b.count - a.count);
  else cards.sort((a, b) => {
    const ca = cols.find((c) => c.id === a.id)!;
    const cb = cols.find((c) => c.id === b.id)!;
    return (ca.position - cb.position) || cb.updated_at.localeCompare(ca.updated_at);
  });
  return cards;
}
```

- [ ] **Step 2: Implementar `getCollection`** (misma hidratación que `getLibraryItems`, restringida a los ítems de la colección)

```ts
import { keepLatestClosedPass } from "@/lib/community/latest-rating";
import { parsePosition } from "./position";

export type CollectionDetail = {
  id: string;
  name: string;
  description: string | null;
  items: LibraryItem[];
  avgRating: number | null;
};

export async function getCollection(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
): Promise<CollectionDetail | null> {
  const { data: col } = await supabase
    .from("collections")
    .select("id, name, description, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!col || col.user_id !== userId) return null; // RLS ya lo gatea; doble red.

  const { data: rows } = await supabase
    .from("collection_items")
    .select("item_type, item_id, position, added_at")
    .eq("collection_id", id)
    .order("position", { ascending: true })
    .order("added_at", { ascending: false });

  // Hidratar cada (tipo,id) a LibraryItem reutilizando la lógica de biblioteca:
  // catálogo (título/portada/subtítulo/páginas) + estado del pase activo + nota
  // del último pase cerrado. Para no duplicar get-library-items, se extrae un
  // helper `hydrateItems(supabase, userId, keys)` (Step 3) y aquí se llama.
  const items = await hydrateItems(
    supabase,
    userId,
    (rows ?? []).map((r) => ({ item_type: r.item_type as ItemType, item_id: r.item_id })),
  );
  const ratings = items.map((i) => i.rating).filter((r): r is number => r !== null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  return { id: col.id, name: col.name, description: col.description, items, avgRating };
}
```

- [ ] **Step 3: Extraer `hydrateItems` de `get-library-items.ts`** (DRY — la colección y la biblioteca comparten hidratación)

Refactor: mover el cuerpo de hidratación (catálogo + pases + rating/notes) de `getLibraryItems` a `export async function hydrateItems(supabase, userId, keys: {item_type,item_id}[]): Promise<LibraryItem[]>` y que `getLibraryItems` lo llame tras resolver sus `entries`. Mantener firma pública de `getLibraryItems` intacta. `npx tsc --noEmit` limpio.

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/lib/library/collections.ts src/lib/library/get-library-items.ts`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/collections.ts src/lib/library/get-library-items.ts
git commit -m "feat(coleccion): capa de datos de colecciones (list + detalle) reutilizando la hidratación de biblioteca"
```

---

### Task 3: Server actions de colecciones

**Files:**
- Create: `src/lib/library/collection-actions.ts`

**Interfaces:**
- Produces (todas `"use server"`, devuelven `{ error?: string }` salvo donde se indique):
  - `createCollection(name: string): Promise<{ id: string } | { error: string }>`
  - `renameCollection(id: string, name: string): Promise<{ error?: string }>`
  - `deleteCollection(id: string): Promise<{ error?: string }>`
  - `addItemToCollections(itemType: ItemType, itemId: string, collectionIds: string[]): Promise<{ error?: string }>`

- [ ] **Step 1: Implementar las acciones**

```ts
// src/lib/library/collection-actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  return { supabase, userId: user.id };
}

export async function createCollection(name: string): Promise<{ id: string } | { error: string }> {
  const clean = name.trim();
  if (!clean || clean.length > 80) return { error: "invalid_name" };
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: userId, name: clean })
    .select("id")
    .single();
  if (error || !data) return { error: "create_failed" };
  revalidatePath("/coleccion");
  return { id: data.id };
}

export async function renameCollection(id: string, name: string): Promise<{ error?: string }> {
  const clean = name.trim();
  if (!clean || clean.length > 80) return { error: "invalid_name" };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("collections")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", id); // RLS restringe al dueño
  if (error) return { error: "rename_failed" };
  revalidatePath("/coleccion");
  revalidatePath(`/coleccion/c/${id}`);
  return {};
}

export async function deleteCollection(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return { error: "delete_failed" };
  revalidatePath("/coleccion");
  return {};
}

// La hoja D marca/desmarca varias: aquí solo se AÑADEN las marcadas nuevas
// (upsert idempotente por la PK compuesta). El desmarcado se maneja en S2 con
// setItemCollections; en S1 basta con añadir.
export async function addItemToCollections(
  itemType: ItemType,
  itemId: string,
  collectionIds: string[],
): Promise<{ error?: string }> {
  if (collectionIds.length === 0) return {};
  const { supabase } = await requireUser();
  const rows = collectionIds.map((collection_id) => ({ collection_id, item_type: itemType, item_id: itemId }));
  const { error } = await supabase
    .from("collection_items")
    .upsert(rows, { onConflict: "collection_id,item_type,item_id", ignoreDuplicates: true });
  if (error) return { error: "add_failed" };
  // Tocar updated_at de las colecciones afectadas para el orden «Recientes».
  await supabase.from("collections").update({ updated_at: new Date().toISOString() }).in("id", collectionIds);
  revalidatePath("/coleccion");
  return {};
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/lib/library/collection-actions.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/library/collection-actions.ts
git commit -m "feat(coleccion): server actions de colecciones (crear, renombrar, borrar, añadir ítem)"
```

---

### Task 4: Nav reorg — `Colecciones · Todo` + rename «Mi Biblioteca»

**Files:**
- Modify: `src/app/coleccion/collection-tabs.tsx` (tabs visibles → `colecciones`, `todo`)
- Modify: `src/app/coleccion/page.tsx` (resolver de tab, quitar `ContinueStrip`, `Todo` = Resumen + grid)
- Modify: `messages/es.json` (`collection.title` → «Mi Biblioteca»; `collection.tabs`)

**Interfaces:**
- Consumes: `listCollections` (Task 2) para el header «N colecciones · M títulos» y el grid (Task 5).
- Produces: `type CollectionTab = "colecciones" | "todo"`; `COLLECTION_TABS` (visibles) + `KNOWN_TABS` (incluye `colas`, no visible).

- [ ] **Step 1: Actualizar `collection-tabs.tsx`**

Cambiar `COLLECTION_TABS` a `["colecciones", "todo"]` y el render a esas dos etiquetas (serif, patrón existente). Exportar además `KNOWN_TABS = ["colecciones", "todo", "colas"]` para que `page.tsx` acepte `colas` sin pintarlo.

- [ ] **Step 2: Actualizar `page.tsx`**

- `tab` por defecto = `colecciones`; aceptar `colecciones|todo|colas` (usar `KNOWN_TABS`).
- `tab === "colecciones"` → render `<CollectionsGrid userId={user.id} />` (Task 5) tras un header `N colecciones · M títulos` en Suspense.
- `tab === "todo"` → **sin `ContinueStrip`**: Resumen (`CollectionSummary`) + `LibraryFilters` (como hoy) + grid `LibraryGrid variant="type"` con todos los tipos. (Píldoras de tipo y estado nuevo = Sesión 2.)
- `tab === "colas"` → `QueuesPanel` como hoy (ruta viva, no en subtabs).
- Renombrar el `h1` a `t("title")` = «Mi Biblioteca».

- [ ] **Step 3: i18n**

En `messages/es.json`, `collection.title` → `"Mi Biblioteca"`; `collection.tabs` → `{ "colecciones": "Colecciones", "todo": "Todo", "colas": "Colas" }` (mantener `colas` por si se re-muestra). Añadir `collection.collectionsCount": "{count, plural, one {# colección} other {# colecciones}}"`.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx eslint src/app/coleccion/page.tsx src/app/coleccion/collection-tabs.tsx`
Navegador: `/coleccion` abre en `Colecciones`; `?tab=todo` muestra Resumen+grid sin «en curso»; `?tab=colas` sigue funcionando; happy-path e2e (`?tab=colas`) verde.

- [ ] **Step 5: Commit**

```bash
git add src/app/coleccion/collection-tabs.tsx src/app/coleccion/page.tsx messages/es.json
git commit -m "feat(coleccion): nav a Colecciones·Todo, «Mi Biblioteca», Colas oculta con ruta viva"
```

---

### Task 5: Grid de Colecciones (frame A) + `CollectionCard`

**Files:**
- Create: `src/components/library/collections-grid.tsx` (server: llama `listCollections`)
- Create: `src/components/library/collection-card.tsx` (abanico de portadas + nombre + recuento)
- Create: `src/components/library/new-collection-tile.tsx` (cliente: crea y navega)
- Modify: `messages/es.json` (etiquetas del grid)

**Interfaces:**
- Consumes: `listCollections` (Task 2), `createCollection` (Task 3), `MEDIA_ACCENT`.
- Produces: `<CollectionsGrid userId />` usado por `page.tsx` (Task 4).

- [ ] **Step 1: `CollectionCard` (abanico)** — 3 portadas rotadas (-14°/0°/14°), nombre serif 15px, recuento mono con dot del `dominantType`. Enlace a `/coleccion/c/[id]`. (Estilos del `.colc`/`.fan` del mockup: fan h-[98px], portadas 54×81 rounded-[5px].)

- [ ] **Step 2: `NewCollectionTile` (cliente)** — tile dashed con «＋ Nueva colección»; al pulsar, prompt/hoja mínima de nombre → `createCollection` → `router.push('/coleccion/c/' + id)`. (Hoja de nombre bonita = puede quedar simple en S1: un `<dialog>` con un input y «Crear».)

- [ ] **Step 3: `CollectionsGrid` (server)** — `const cards = await listCollections(supabase, userId)`; grid `grid-cols-2 gap-3.5`; render `CollectionCard[]` + `NewCollectionTile` al final. Vacío: solo el tile.

- [ ] **Step 4: Cablear en `page.tsx`** el `<Suspense><CollectionsGrid/></Suspense>` para `tab==="colecciones"` con su header de recuento.

- [ ] **Step 5: Verificar** — tsc/eslint; navegador: crear una colección desde el tile lleva al detalle; el grid muestra abanico + recuento; claro/oscuro; móvil 400 (2 col) y 1280.

- [ ] **Step 6: Commit**

```bash
git add src/components/library/collections-grid.tsx src/components/library/collection-card.tsx src/components/library/new-collection-tile.tsx src/app/coleccion/page.tsx messages/es.json
git commit -m "feat(coleccion): grid de Colecciones con abanico de portadas y tile de creación (frame A)"
```

---

### Task 6: Detalle de colección (frame B) — `/coleccion/c/[id]`

**Files:**
- Create: `src/app/coleccion/c/[id]/page.tsx` (server: `getCollection`, `notFound()` si null)
- Create: `src/components/library/collection-detail.tsx` (cabecera con abanico + nombre + «N títulos · nota media X» + descripción + grid de ítems)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `getCollection` (Task 2), `LibraryItemCard` (v1, con `inCollection`).
- Produces: ruta `/coleccion/c/[id]`.

- [ ] **Step 1: `page.tsx`** — `const detail = await getCollection(supabase, user.id, id); if (!detail) notFound();`. Topbar con `‹` (a `/coleccion`) + nombre + `⋯` (menú → S2; en S1 el `⋯` puede quedar oculto o sin acciones). Render `<CollectionDetail detail={detail} />`.

- [ ] **Step 2: `CollectionDetail`** — `dethead`: abanico (detfan 96×78, portadas 46×69) + nombre serif 22px + `t("collectionMeta", {count, avg})` = «N títulos · nota media X,X» (formatear avg con 1 decimal; si `avgRating===null`, solo «N títulos»). Descripción si existe. Grid `grid-cols-3 gap-3.5` de `LibraryItemCard item inCollection isOwner={false}` (en el detalle no se pinta el «Fijar en el perfil»; pasar `isOwner={false}` o una prop `compact`). Botones «＋ Añadir títulos» / «Ordenar» = **placeholders visuales en S1** (funcionalidad en S2), o enlaces deshabilitados; NO botones muertos que mientan — si no hacen nada aún, no pintarlos (dejar solo el grid) y anotarlo.

- [ ] **Step 3: i18n** — `collection.collectionMeta`, `collection.emptyDetail` («Aún no has añadido nada a esta colección.»), `collection.back`.

- [ ] **Step 4: Verificar** — tsc/eslint; navegador: abrir el detalle de una colección con ítems muestra cabecera + grid; una colección vacía muestra el estado vacío; una id ajena/inexistente da 404 (no error); claro/oscuro; móvil/PC.

- [ ] **Step 5: Commit**

```bash
git add "src/app/coleccion/c/[id]/page.tsx" src/components/library/collection-detail.tsx messages/es.json
git commit -m "feat(coleccion): detalle de colección en ruta propia (frame B)"
```

---

### Task 7: e2e + verificación de cierre de la Sesión 1

**Files:**
- Create: `e2e/coleccion-v2.spec.ts`

**Interfaces:**
- Consumes: las rutas/acciones de las tareas anteriores; siembra por REST con service-role (patrón de los specs de clubes).

- [ ] **Step 1: Escribir el spec** (login devtest; siembra por REST una colección + un ítem del catálogo; verifica grid, detalle, y aislamiento; limpieza en `finally`)

```ts
import { test, expect } from "@playwright/test";
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
// OJO: NO llamar a esta const `URL` — pisa el constructor global y undici/fetch
// revienta con "URL is not a constructor". Usar `BASE`.
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

test("colecciones: grid, detalle y creación", async ({ page }) => {
  test.setTimeout(60_000);
  const uid = (await (await fetch(`${BASE}/rest/v1/profiles?username=eq.${USERNAME}&select=user_id`, { headers: H() })).json())[0].user_id;
  const book = (await (await fetch(`${BASE}/rest/v1/books?select=id,title&limit=1`, { headers: H() })).json())[0];
  const name = `e2e col ${Date.now()}`;
  let colId: string | null = null;
  try {
    const [col] = await (await fetch(`${BASE}/rest/v1/collections`, { method: "POST", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, name }) })).json();
    colId = col.id;
    await fetch(`${BASE}/rest/v1/collection_items`, { method: "POST", headers: H(), body: JSON.stringify({ collection_id: colId, item_type: "book", item_id: book.id }) });

    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto("/coleccion"); // abre en Colecciones
    await expect(page.getByText(name)).toBeVisible();

    await page.getByText(name).click();
    await page.waitForURL(new RegExp(`/coleccion/c/${colId}`));
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(book.title).first()).toBeVisible();

    console.log("COLECCIONES V2 OK");
  } finally {
    if (colId) await fetch(`${BASE}/rest/v1/collections?id=eq.${colId}`, { method: "DELETE", headers: H() });
  }
});
```

- [ ] **Step 2: Correr el spec** — `fnm use && npx playwright test coleccion-v2`. Expected: 1 passed.

- [ ] **Step 3: Regresión** — `npx playwright test coleccion-general happy-path` (v1 + colas viva). Expected: verdes (correr individualmente si la máquina va cargada; ver README §carga).

- [ ] **Step 4: Verificación en navegador** — frames A y B a 400 y 1280, claro y oscuro.

- [ ] **Step 5: Commit + PR**

```bash
git add e2e/coleccion-v2.spec.ts
git commit -m "test(coleccion): e2e de colecciones v2 (grid + detalle + creación)"
git push -u origin <rama>
gh pr create --draft --title "feat(coleccion): Colección v2 sesión 1 — Mi Biblioteca con colecciones" --body "..."
```

---

## Notas de ejecución
- **Gate de migración:** Task 1 Step 2 PARA hasta que el usuario apruebe el SQL.
- **Dependencia de v1:** esta sesión reutiliza componentes de v1 (#81). Si #81 aún no está en `main`, ramificar desde `plan-02-coleccion`; si ya se mergeó, desde `main`.
- **Sesión 2 (fuera de este plan):** píldoras de tipo + estado en `Todo`, hoja «Añadir a colección» (frame D), «Ordenar» + menú ⋯ (renombrar/descripción/borrar), `setItemCollections`.
