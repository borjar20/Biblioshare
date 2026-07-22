# Itinerarios de lectura en sagas-universo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una saga pueda tener varios itinerarios de lectura curados con nombre ("La Guardia", "Solo lo esencial"), que el lector elige y puede adoptar, sustituyendo al toggle Lectura|Publicación.

**Architecture:** Tres tablas nuevas (`saga_routes`, `saga_route_entries`, `saga_route_choices`) que no tocan `saga_items`/`saga_nodes`/`saga_edges`. Las dos rutas de hoy siguen **sintetizadas en código** con slugs reservados `lectura` y `publicacion` — nunca se materializan, para no duplicar la fuente de verdad del orden principal. La resolución de una ruta es una función pura que expande bloques-subsaga con la misma recursión que `createMainOrder`.

**Tech Stack:** Next.js App Router (Server Components), Supabase (Postgres + RLS + RPC `SECURITY DEFINER`), next-intl, Vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-22-sagas-itinerarios-design.md`

## Global Constraints

- **Una sola regla de progreso.** El hero, las cards de Mi Biblioteca y `computeProgress` NO se tocan. El contador de ruta reutiliza el predicado compartido de la Task 2; prohibido reimplementar `status === "completed"` en otro sitio. Duplicar esta regla causó el issue #91 y el #170.
- **Slugs reservados:** `lectura` y `publicacion`. Una ruta curada nunca puede usarlos (CHECK en BD + validación en la action).
- **Idioma:** solo existe el locale `es`. Todas las claves nuevas van en `messages/es.json`, bloques `saga` y `sagaEditor`.
- **Gate de curación:** collaborator+ vía `hasMinRole(await getCurrentUserRole(supabase), "collaborator")` en el server action, **y además** RLS `has_min_role('collaborator')` en la tabla. Los dos, como en el resto del dominio de sagas.
- **`MAX_DEPTH = 4`** para cualquier recursión saga→saga, igual que `createMainOrder`.
- **Migraciones:** fichero en `supabase/migrations/YYYYMMDD_nombre.sql`, aplicar **dev primero** (`supabase-dev`), verificar contra `pg_policies`/`pg_proc` (no contra `list_migrations`), y anexar a `supabase/schema-baseline.sql` **en la misma pasada** que se aplica a prod.
- **Estilo de comentarios:** en español, explicando el *porqué* y citando la spec/issue. Es la convención del repo.

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260723_saga_routes.sql` | Tablas, RLS, RPC `save_saga_route` |
| `src/lib/sagas/route-types.ts` | Tipos compartidos de rutas (sin lógica) |
| `src/lib/sagas/resolve-route.ts` | **Puro.** Expande entradas → lista de obras; cuenta completadas |
| `src/lib/sagas/completion.ts` | **Puro.** El predicado único de "completado" extraído de `computeProgress` |
| `src/lib/sagas/get-saga-routes.ts` | Capa de datos: lee rutas curadas + sintetiza `lectura`/`publicacion` |
| `src/lib/sagas/route-actions.ts` | Server actions: CRUD de rutas y adopción |
| `src/lib/sagas/validate-route-draft.ts` | **Puro.** Validación del borrador del editor |
| `src/components/saga/route-selector.tsx` | Selector (2 rutas = toggle actual; 3+ = chips) |
| `src/components/saga/route-view.tsx` | Cabecera + lista de entradas + bloques plegables |
| `src/components/saga/adopt-route-button.tsx` | Botón "Leer por aquí" |
| `src/app/saga/[id]/rutas/page.tsx` | Lista de rutas (curación) |
| `src/app/saga/[id]/rutas/[slug]/editar/page.tsx` | Editor de pasos |
| `src/components/saga/editor/route-editor.tsx` | Lista reordenable (cliente) |

---

## Task 1: Esquema de rutas

**Files:**
- Create: `supabase/migrations/20260723_saga_routes.sql`
- Modify: `src/lib/supabase/database.types.ts` (añadir las 3 tablas y la RPC)

**Interfaces:**
- Consumes: nada.
- Produces: tablas `saga_routes(id, saga_id, slug, name, summary, position, created_at)`, `saga_route_entries(id, route_id, position, item_type, item_id, child_saga_id, note, created_at)`, `saga_route_choices(user_id, saga_id, route_slug, created_at)`; RPC `save_saga_route(p_route_id uuid, p_entries jsonb) returns void`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260723_saga_routes.sql`:

```sql
-- Itinerarios de lectura (spec 2026-07-22-sagas-itinerarios-design.md).
-- Una saga puede tener varias rutas curadas con nombre. Las dos rutas de hoy
-- ("Orden de lectura" y "Publicación") NO se materializan: se sintetizan en
-- código con los slugs reservados `lectura` y `publicacion`. Materializarlas
-- obligaría a resincronizar la ruta `lectura` con el grafo en cada edición —
-- dos fuentes de verdad del mismo orden, que es la familia de fallo del #91.

create table public.saga_routes (
  id uuid primary key default gen_random_uuid(),
  saga_id uuid not null references public.sagas (id) on delete cascade,
  slug text not null,
  name text not null check (char_length(name) between 1 and 80),
  summary text check (summary is null or char_length(summary) <= 280),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (saga_id, slug),
  -- Slugs reservados para las rutas sintéticas.
  constraint saga_routes_slug_not_reserved check (slug not in ('lectura', 'publicacion')),
  constraint saga_routes_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create index saga_routes_saga_idx on public.saga_routes (saga_id, position);

create table public.saga_route_entries (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.saga_routes (id) on delete cascade,
  position integer not null check (position > 0),
  item_type public.item_type,
  item_id uuid,
  child_saga_id uuid references public.sagas (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (route_id, position),
  -- Calcado de saga_nodes_ref_xor: una entrada es una obra O una subsaga.
  constraint saga_route_entries_ref_xor check (
    (item_type is not null and item_id is not null and child_saga_id is null)
    or (item_type is null and item_id is null and child_saga_id is not null)
  )
);
create index saga_route_entries_route_idx on public.saga_route_entries (route_id, position);

-- Adopción: guarda el SLUG, no el route_id, para que valga tanto con rutas
-- curadas como con las sintéticas y para que borrar una ruta degrade solo al
-- orden por defecto en vez de dejar una FK rota.
create table public.saga_route_choices (
  user_id uuid not null references auth.users (id) on delete cascade,
  saga_id uuid not null references public.sagas (id) on delete cascade,
  route_slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, saga_id)
);

alter table public.saga_routes enable row level security;
alter table public.saga_route_entries enable row level security;
alter table public.saga_route_choices enable row level security;

create policy "saga routes readable by all" on public.saga_routes
  for select to anon, authenticated using (true);
create policy "saga routes writable by collaborators" on public.saga_routes
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

create policy "saga route entries readable by all" on public.saga_route_entries
  for select to anon, authenticated using (true);
create policy "saga route entries writable by collaborators" on public.saga_route_entries
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

create policy "saga route choices own" on public.saga_route_choices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Guardado atómico de los pasos: full-replace, mismo patrón que
-- save_saga_graph. SECURITY DEFINER con gate interno explícito.
create or replace function public.save_saga_route(
  p_route_id uuid,
  p_entries jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from saga_routes where id = p_route_id) then
    raise exception 'route % not found', p_route_id;
  end if;

  delete from saga_route_entries where route_id = p_route_id;

  insert into saga_route_entries (route_id, position, item_type, item_id, child_saga_id, note)
  select
    p_route_id,
    (e->>'position')::integer,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'child_saga_id')::uuid,
    nullif(e->>'note', '')
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e;
end;
$$;

revoke execute on function public.save_saga_route(uuid, jsonb) from public, anon;
grant execute on function public.save_saga_route(uuid, jsonb) to authenticated;

comment on function public.save_saga_route(uuid, jsonb) is
  'Full-replace atómico de los pasos de un itinerario. Collaborator+.';
```

- [ ] **Step 2: Aplicar a dev**

Usar la herramienta `mcp__supabase-dev__apply_migration` con `name: "saga_routes"` y el SQL de arriba.
Expected: `{"success": true}`

- [ ] **Step 3: Verificar contra los objetos reales**

Ejecutar con `mcp__supabase-dev__execute_sql`:

```sql
select tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename like 'saga_route%' order by tablename, cmd;
select p.proname, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='save_saga_route';
```

Expected: **5** filas en `pg_policies` — 2 de `saga_routes` (SELECT + ALL), 2 de `saga_route_entries` (SELECT + ALL) y 1 de `saga_route_choices` (ALL) — y `save_saga_route` con `prosecdef = true`.

- [ ] **Step 4: Añadir los tipos a `database.types.ts`**

En `src/lib/supabase/database.types.ts`, dentro de `Tables`, añadir las tres entradas siguiendo el formato de las vecinas (`Row`/`Insert`/`Update`/`Relationships`). Y en `Functions`, en orden alfabético (entre `resolve_pending_import` y `sane_int`):

```ts
      save_saga_route: {
        Args: { p_entries: Json; p_route_id: string }
        Returns: undefined
      }
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260723_saga_routes.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): tablas y RPC de itinerarios de lectura"
```

---

## Task 2: El predicado único de "completado"

Extraerlo **antes** de escribir el contador de ruta: si se escribe primero el contador, se reimplementa. Ese fue el camino del #91.

**Files:**
- Create: `src/lib/sagas/completion.ts`
- Create: `src/lib/sagas/completion.test.ts`
- Modify: `src/lib/sagas/group-members.ts` (que `computeProgress` lo consuma)

**Interfaces:**
- Consumes: `DetailMember` de `./types`.
- Produces: `isMemberCompleted(member: DetailMember | undefined): boolean` y `countCompleted(order: string[], memberByKey: Map<string, DetailMember>): number`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/completion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countCompleted, isMemberCompleted } from "./completion";
import type { DetailMember } from "./types";

const member = (over: Partial<DetailMember>): DetailMember => ({
  itemType: "book",
  itemId: "x",
  title: "Título",
  coverUrl: null,
  href: "/libro/x",
  position: null,
  status: null,
  groupSagaId: null,
  year: null,
  ...over,
});

describe("isMemberCompleted", () => {
  it("solo 'completed' cuenta", () => {
    expect(isMemberCompleted(member({ status: "completed" }))).toBe(true);
    expect(isMemberCompleted(member({ status: "in_progress" }))).toBe(false);
    expect(isMemberCompleted(member({ status: null }))).toBe(false);
  });

  it("un miembro ausente no está completado", () => {
    expect(isMemberCompleted(undefined)).toBe(false);
  });
});

describe("countCompleted", () => {
  it("cuenta solo las claves del orden que estén completadas", () => {
    const byKey = new Map<string, DetailMember>([
      ["book:a", member({ itemId: "a", status: "completed" })],
      ["book:b", member({ itemId: "b", status: "in_progress" })],
    ]);
    expect(countCompleted(["book:a", "book:b"], byKey)).toBe(1);
  });

  it("una clave sin miembro no suma", () => {
    expect(countCompleted(["book:fantasma"], new Map())).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/sagas/completion.test.ts`
Expected: FAIL — `Failed to resolve import "./completion"`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/sagas/completion.ts`:

```ts
import type { DetailMember } from "./types";

// El predicado ÚNICO de «completado» (spec §1.5). Vive aparte porque a partir
// de los itinerarios hay más de un sitio que cuenta avance: el hero
// (computeProgress) y el contador de cada ruta. Tenerlo duplicado es
// exactamente lo que produjo el issue #91, y su primo el #170.
//
// Una relectura es in_progress y completada a la vez; aquí manda el estado del
// pase activo, igual que antes de extraer la función.
export function isMemberCompleted(member: DetailMember | undefined): boolean {
  return member?.status === "completed";
}

/** Cuántas claves `item_type:item_id` de `order` están completadas. */
export function countCompleted(
  order: string[],
  memberByKey: Map<string, DetailMember>,
): number {
  let n = 0;
  for (const key of order) {
    if (isMemberCompleted(memberByKey.get(key))) n++;
  }
  return n;
}
```

- [ ] **Step 4: Que `computeProgress` lo consuma**

En `src/lib/sagas/group-members.ts`, añadir el import al principio:

```ts
import { isMemberCompleted } from "./completion";
```

y sustituir la línea `if (member?.status !== "completed") continue;` por:

```ts
    if (!isMemberCompleted(member)) continue;
```

- [ ] **Step 5: Ejecutar toda la suite de sagas**

Run: `npx vitest run src/lib/sagas/`
Expected: PASS. Los tests existentes de `group-members` deben seguir verdes sin tocarlos — es la prueba de que la extracción no cambió el comportamiento.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/completion.ts src/lib/sagas/completion.test.ts src/lib/sagas/group-members.ts
git commit -m "refactor(sagas): extrae el predicado único de completado antes de que lo use el contador de rutas"
```

---

## Task 3: Resolución pura de una ruta

**Files:**
- Create: `src/lib/sagas/route-types.ts`
- Create: `src/lib/sagas/resolve-route.ts`
- Create: `src/lib/sagas/resolve-route.test.ts`

**Interfaces:**
- Consumes: `countCompleted` (Task 2), `DetailMember`, `MemberGroup`.
- Produces:
  - `RawRouteEntry = { position: number; itemType: ItemType | null; itemId: string | null; childSagaId: string | null; note: string | null }`
  - `ResolvedStep = { kind: "item"; member: DetailMember; note: string | null } | { kind: "block"; sagaId: string; name: string; accent: SagaAccentToken; members: DetailMember[]; note: string | null }`
  - `ResolvedRoute = { steps: ResolvedStep[]; total: number; completed: number }`
  - `resolveRoute(entries, lookup): ResolvedRoute`
  - `RouteLookup = { members: Map<string, DetailMember>; childNames: Map<string, string>; childAccent: Map<string, SagaAccentToken>; mainOrderOf: (sagaId: string) => string[] }`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/resolve-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveRoute } from "./resolve-route";
import type { RawRouteEntry, RouteLookup } from "./route-types";
import type { DetailMember } from "./types";

const member = (id: string, status: DetailMember["status"] = null): DetailMember => ({
  itemType: "book",
  itemId: id,
  title: id,
  coverUrl: null,
  href: `/libro/${id}`,
  position: null,
  status,
  groupSagaId: null,
  year: null,
});

const entry = (over: Partial<RawRouteEntry> & { position: number }): RawRouteEntry => ({
  itemType: null,
  itemId: null,
  childSagaId: null,
  note: null,
  ...over,
});

const lookup = (over: Partial<RouteLookup> = {}): RouteLookup => ({
  members: new Map([
    ["book:a", member("a", "completed")],
    ["book:b", member("b")],
    ["book:g1", member("g1", "completed")],
    ["book:g2", member("g2")],
  ]),
  childNames: new Map([["guardia", "La Guardia"]]),
  childAccent: new Map([["guardia", "verde"]]),
  mainOrderOf: () => ["book:g1", "book:g2"],
  ...over,
});

describe("resolveRoute", () => {
  it("resuelve obras sueltas en orden de position", () => {
    const r = resolveRoute(
      [entry({ position: 2, itemType: "book", itemId: "b" }), entry({ position: 1, itemType: "book", itemId: "a" })],
      lookup(),
    );
    expect(r.steps.map((s) => (s.kind === "item" ? s.member.itemId : "?"))).toEqual(["a", "b"]);
    expect(r.total).toBe(2);
    expect(r.completed).toBe(1);
  });

  it("expande un bloque-subsaga con su orden principal", () => {
    const r = resolveRoute([entry({ position: 1, childSagaId: "guardia" })], lookup());
    expect(r.steps).toHaveLength(1);
    const step = r.steps[0];
    expect(step.kind).toBe("block");
    if (step.kind !== "block") throw new Error("esperaba bloque");
    expect(step.name).toBe("La Guardia");
    expect(step.accent).toBe("verde");
    expect(step.members.map((m) => m.itemId)).toEqual(["g1", "g2"]);
    // El bloque aporta sus DOS obras al denominador, no una.
    expect(r.total).toBe(2);
    expect(r.completed).toBe(1);
  });

  // Issue #170: en el grafo, una referencia colgante se descarta al pintar
  // pero cuenta en el denominador, así que el avance no llega nunca al 100%.
  // Aquí se descarta de LOS DOS sitios, a propósito.
  it("descarta la entrada colgante del render y del denominador", () => {
    const r = resolveRoute(
      [entry({ position: 1, itemType: "book", itemId: "a" }), entry({ position: 2, itemType: "book", itemId: "fantasma" })],
      lookup(),
    );
    expect(r.steps).toHaveLength(1);
    expect(r.total).toBe(1);
    expect(r.completed).toBe(1);
  });

  it("descarta un bloque cuya subsaga no existe", () => {
    const r = resolveRoute([entry({ position: 1, childSagaId: "inventada" })], lookup());
    expect(r.steps).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("no cuenta dos veces una obra que aparezca suelta y dentro de un bloque", () => {
    const r = resolveRoute(
      [entry({ position: 1, itemType: "book", itemId: "g1" }), entry({ position: 2, childSagaId: "guardia" })],
      lookup(),
    );
    // g1 suelta + bloque {g1, g2} => el denominador son 2 obras distintas.
    expect(r.total).toBe(2);
    expect(r.completed).toBe(1);
  });

  it("conserva la nota del paso", () => {
    const r = resolveRoute(
      [entry({ position: 1, itemType: "book", itemId: "a", note: "aquí puedes parar" })],
      lookup(),
    );
    expect(r.steps[0].note).toBe("aquí puedes parar");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/sagas/resolve-route.test.ts`
Expected: FAIL — no se resuelve el import `./resolve-route`.

- [ ] **Step 3: Escribir los tipos**

Crear `src/lib/sagas/route-types.ts`:

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { SagaAccentToken } from "./accents";
import type { DetailMember } from "./types";

// Itinerarios de lectura (spec 2026-07-22). Una ruta es una secuencia curada
// de obras y bloques-subsaga dentro de una saga.

export type RawRouteEntry = {
  position: number;
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  note: string | null;
};

export type ResolvedStep =
  | { kind: "item"; member: DetailMember; note: string | null }
  | {
      kind: "block";
      sagaId: string;
      name: string;
      accent: SagaAccentToken;
      members: DetailMember[];
      note: string | null;
    };

export type ResolvedRoute = { steps: ResolvedStep[]; total: number; completed: number };

export type RouteLookup = {
  /** "tipo:id" → miembro resuelto. Mismo mapa que usa buildSagaGraph. */
  members: Map<string, DetailMember>;
  childNames: Map<string, string>;
  childAccent: Map<string, SagaAccentToken>;
  /** Orden principal de una subsaga: createMainOrder(...)(sagaId). */
  mainOrderOf: (sagaId: string) => string[];
};

/** Una ruta lista para pintar: metadatos + pasos resueltos. */
export type SagaRoute = {
  slug: string;
  name: string;
  summary: string | null;
  /** Las sintéticas (`lectura`, `publicacion`) no se pueden editar ni borrar. */
  synthetic: boolean;
};
```

- [ ] **Step 4: Escribir la implementación**

Crear `src/lib/sagas/resolve-route.ts`:

```ts
import { isMemberCompleted } from "./completion";
import type { DetailMember } from "./types";
import type { RawRouteEntry, ResolvedRoute, ResolvedStep, RouteLookup } from "./route-types";

const keyOf = (m: DetailMember) => `${m.itemType}:${m.itemId}`;

// Resolución PURA de un itinerario: filas de saga_route_entries → pasos con
// obra o bloque resuelto. Un bloque se expande con el ORDEN PRINCIPAL de esa
// subsaga (la misma regla y la misma función que el hero), no con todos sus
// miembros: si la subsaga tiene opcionales, no deben inflar el contador.
//
// Una referencia colgante (item_id que ya no es miembro, subsaga inexistente)
// se descarta del render Y del denominador. El grafo hace solo lo primero y por
// eso su avance no puede llegar al 100% (issue #170): aquí no se replica.
export function resolveRoute(entries: RawRouteEntry[], lookup: RouteLookup): ResolvedRoute {
  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const steps: ResolvedStep[] = [];
  // Deduplicado por clave: una obra suelta que también aparece dentro de un
  // bloque debe contar UNA vez en el denominador.
  const counted = new Map<string, DetailMember>();

  for (const e of ordered) {
    if (e.itemType !== null && e.itemId !== null) {
      const member = lookup.members.get(`${e.itemType}:${e.itemId}`);
      if (!member) continue; // colgante
      steps.push({ kind: "item", member, note: e.note });
      counted.set(keyOf(member), member);
    } else if (e.childSagaId !== null) {
      const name = lookup.childNames.get(e.childSagaId);
      if (!name) continue; // subsaga inexistente o fuera del árbol
      const members = lookup
        .mainOrderOf(e.childSagaId)
        .flatMap((k) => {
          const m = lookup.members.get(k);
          return m ? [m] : [];
        });
      steps.push({
        kind: "block",
        sagaId: e.childSagaId,
        name,
        accent: lookup.childAccent.get(e.childSagaId) ?? "beige",
        members,
        note: e.note,
      });
      for (const m of members) counted.set(keyOf(m), m);
    }
  }

  let completed = 0;
  for (const m of counted.values()) if (isMemberCompleted(m)) completed++;

  return { steps, total: counted.size, completed };
}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `npx vitest run src/lib/sagas/resolve-route.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/route-types.ts src/lib/sagas/resolve-route.ts src/lib/sagas/resolve-route.test.ts
git commit -m "feat(sagas): resolución pura de itinerarios con bloques-subsaga"
```

---

## Task 4: Capa de datos — rutas curadas + sintéticas

**Files:**
- Create: `src/lib/sagas/get-saga-routes.ts`
- Create: `src/lib/sagas/get-saga-routes.test.ts`
- Modify: `src/lib/sagas/get-saga-detail.ts` (exponer `routes` y `routeChoice` en `SagaDetail`)

**Interfaces:**
- Consumes: `SagaRoute` (Task 3), `SupabaseServerClient`.
- Produces:
  - `SYNTHETIC_SLUGS = ["lectura", "publicacion"] as const`
  - `buildRouteList(curated: Array<{slug, name, summary, position}>, labels: {lectura: string; publicacion: string}, hasGraph: boolean): SagaRoute[]` — **pura**, testeable
  - `getSagaRoutes(supabase, sagaId): Promise<Array<{ id, slug, name, summary, position }>>`
  - `getRouteEntries(supabase, routeId): Promise<RawRouteEntry[]>`
  - En `SagaDetail`: `routes: SagaRoute[]`, `routeChoice: string | null`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/get-saga-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRouteList } from "./get-saga-routes";

const labels = { lectura: "Orden de lectura", publicacion: "Publicación" };

describe("buildRouteList", () => {
  it("sin rutas curadas devuelve las dos sintéticas, lectura primero", () => {
    const list = buildRouteList([], labels, true);
    expect(list.map((r) => r.slug)).toEqual(["lectura", "publicacion"]);
    expect(list.every((r) => r.synthetic)).toBe(true);
  });

  it("sin grafo, «lectura» no se ofrece", () => {
    // Sin saga_nodes no hay orden curado que enseñar: la ficha de hoy ni
    // siquiera pinta la pestaña Mapa.
    const list = buildRouteList([], labels, false);
    expect(list.map((r) => r.slug)).toEqual(["publicacion"]);
  });

  it("las curadas van entre lectura y publicación, por position", () => {
    const list = buildRouteList(
      [
        { slug: "muerte", name: "La Muerte", summary: null, position: 2 },
        { slug: "guardia", name: "La Guardia", summary: "Policíaco", position: 1 },
      ],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["lectura", "guardia", "muerte", "publicacion"]);
    expect(list[1].synthetic).toBe(false);
    expect(list[1].summary).toBe("Policíaco");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/sagas/get-saga-routes.test.ts`
Expected: FAIL — no se resuelve el import.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/sagas/get-saga-routes.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { RawRouteEntry, SagaRoute } from "./route-types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Slugs RESERVADOS de las rutas sintéticas. No se materializan en saga_routes:
// «lectura» es el grafo y «publicacion» se calcula por año, así que una fila
// para ellas sería una segunda fuente de verdad que habría que resincronizar
// en cada edición del grafo — la familia de fallo del #91. El CHECK
// saga_routes_slug_not_reserved impide que una ruta curada los use.
export const SYNTHETIC_SLUGS = ["lectura", "publicacion"] as const;

export type CuratedRouteRow = {
  slug: string;
  name: string;
  summary: string | null;
  position: number;
};

/** Orden del selector: lectura → curadas (por position) → publicación. */
export function buildRouteList(
  curated: CuratedRouteRow[],
  labels: { lectura: string; publicacion: string },
  hasGraph: boolean,
): SagaRoute[] {
  const out: SagaRoute[] = [];
  if (hasGraph) {
    out.push({ slug: "lectura", name: labels.lectura, summary: null, synthetic: true });
  }
  for (const c of [...curated].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))) {
    out.push({ slug: c.slug, name: c.name, summary: c.summary, synthetic: false });
  }
  out.push({ slug: "publicacion", name: labels.publicacion, summary: null, synthetic: true });
  return out;
}

export async function getSagaRoutes(supabase: SupabaseServerClient, sagaId: string) {
  const { data } = await supabase
    .from("saga_routes")
    .select("id, slug, name, summary, position")
    .eq("saga_id", sagaId)
    .order("position", { ascending: true });
  return (data ?? []) as Array<CuratedRouteRow & { id: string }>;
}

export async function getRouteEntries(
  supabase: SupabaseServerClient,
  routeId: string,
): Promise<RawRouteEntry[]> {
  const { data } = await supabase
    .from("saga_route_entries")
    .select("position, item_type, item_id, child_saga_id, note")
    .eq("route_id", routeId)
    .order("position", { ascending: true });
  return ((data ?? []) as Array<{
    position: number;
    item_type: ItemType | null;
    item_id: string | null;
    child_saga_id: string | null;
    note: string | null;
  }>).map((r) => ({
    position: r.position,
    itemType: r.item_type,
    itemId: r.item_id,
    childSagaId: r.child_saga_id,
    note: r.note,
  }));
}

/** Slug adoptado por el usuario para esta saga, si lo hay. */
export async function getRouteChoice(
  supabase: SupabaseServerClient,
  userId: string,
  sagaId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("saga_route_choices")
    .select("route_slug")
    .eq("user_id", userId)
    .eq("saga_id", sagaId)
    .maybeSingle();
  return (data as { route_slug: string } | null)?.route_slug ?? null;
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npx vitest run src/lib/sagas/get-saga-routes.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Exponerlo en `SagaDetail`**

En `src/lib/sagas/get-saga-detail.ts`:

1. Añadir los imports:

```ts
import { buildRouteList, getRouteChoice, getSagaRoutes } from "./get-saga-routes";
import type { SagaRoute } from "./route-types";
```

2. Justo antes del `return` final (después de calcular `graph` y `hasGraph`), añadir:

```ts
  // Itinerarios (spec 2026-07-22). Las etiquetas de las rutas sintéticas se
  // resuelven aquí porque buildRouteList es puro y no debe tocar next-intl.
  const tRoutes = await getTranslations("saga");
  const curated = await getSagaRoutes(supabase, id);
  const routes = buildRouteList(
    curated,
    { lectura: tRoutes("orderReading"), publicacion: tRoutes("orderPublication") },
    graph !== null,
  );
  const routeChoice = user ? await getRouteChoice(supabase, user.id, id) : null;
```

3. Añadir `getTranslations` al import de `next-intl/server` en la cabecera del fichero (si no está ya):

```ts
import { getTranslations } from "next-intl/server";
```

4. Añadir al objeto devuelto, junto a `hasGraph`:

```ts
    routes,
    routeChoice,
```

- [ ] **Step 6: Verificar que compila y que nada se rompe**

Run: `npx tsc --noEmit && npx vitest run src/lib/sagas/`
Expected: sin errores de tipos; todos los tests en verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/get-saga-routes.ts src/lib/sagas/get-saga-routes.test.ts src/lib/sagas/get-saga-detail.ts
git commit -m "feat(sagas): capa de datos de itinerarios y rutas sintéticas"
```

---

## Task 5: Selector de ruta y URL `?ruta=`

**Files:**
- Create: `src/components/saga/route-selector.tsx`
- Delete: `src/components/saga/order-toggle.tsx` (lo sustituye)
- Modify: `src/app/saga/[id]/page.tsx`
- Modify: `src/components/saga/saga-map-tab.tsx:32` (cambiar `OrderToggle` por `RouteSelector`)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `SagaRoute[]` de `detail.routes`.
- Produces: `<RouteSelector base={string} routes={SagaRoute[]} active={string} />`; searchParam `?ruta=<slug>` con redirect desde `?orden=publicacion`.

- [ ] **Step 1: Añadir las claves i18n**

En `messages/es.json`, dentro del bloque `"saga"`, añadir:

```json
    "routeAdopt": "Leer por aquí",
    "routeAdopted": "Leyendo por aquí",
    "routeProgress": "Llevas {completed} de {total} de esta ruta",
    "routeBlockCount": "{count, plural, =1 {1 obra} other {# obras}}",
    "routeEmpty": "Esta ruta aún no tiene pasos.",
    "routesManage": "Itinerarios",
```

- [ ] **Step 2: Escribir el selector**

Crear `src/components/saga/route-selector.tsx`:

```tsx
import Link from "next/link";
import type { SagaRoute } from "@/lib/sagas/route-types";

// Selector de itinerario (spec 2026-07-22 §UI). Sustituye a OrderToggle.
// Con DOS rutas es exactamente el toggle de antes — el caso de todas las sagas
// que existen hoy, así que no hay regresión visual. Con tres o más pasa a tira
// de chips con scroll horizontal.
export function RouteSelector({
  base,
  routes,
  active,
}: {
  base: string;
  routes: SagaRoute[];
  active: string;
}) {
  const href = (slug: string) => `${base}?tab=mapa&ruta=${slug}`;

  if (routes.length <= 2) {
    const cls = (on: boolean) =>
      `flex-1 rounded-lg px-1 py-2 text-center text-xs font-semibold ${
        on ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
      }`;
    return (
      <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {routes.map((r) => (
          <Link key={r.slug} href={href(r.slug)} className={cls(r.slug === active)} replace scroll={false}>
            {r.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {routes.map((r) => (
        <Link
          key={r.slug}
          href={href(r.slug)}
          replace
          scroll={false}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            r.slug === active
              ? "border-transparent bg-foreground text-background"
              : "border-border text-muted-foreground"
          }`}
        >
          {r.name}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Resolver la ruta activa en la página**

En `src/app/saga/[id]/page.tsx`:

1. Cambiar la firma de `searchParams`:

```ts
  searchParams: Promise<{ tab?: string; orden?: string; ruta?: string }>;
```

2. Cambiar la desestructuración:

```ts
  const { orden, ruta } = await searchParams;
```

3. Después de `const detail = await getSagaDetail(...)` y el `notFound()`, añadir:

```ts
  // Ruta activa. Precedencia: ?ruta= explícito → compatibilidad con el viejo
  // ?orden=publicacion (enlaces ya compartidos) → la adoptada → la primera.
  // Un slug desconocido (ruta borrada, enlace viejo) degrada a la primera en
  // vez de dar 404: por eso la adopción guarda el slug y no un route_id.
  const known = new Set(detail.routes.map((r) => r.slug));
  const activeRoute =
    (ruta && known.has(ruta) && ruta) ||
    (orden === "publicacion" && known.has("publicacion") && "publicacion") ||
    (detail.routeChoice && known.has(detail.routeChoice) && detail.routeChoice) ||
    detail.routes[0]?.slug ||
    "publicacion";
```

4. Sustituir el prop `orden` de `<SagaMapTab>` por:

```tsx
            <SagaMapTab detail={detail} activeRoute={activeRoute} canEdit={canEditGraph} />
```

5. Cambiar la condición de la pestaña: hoy es `detail.hasGraph ? ... : null`. Ahora la pestaña Mapa debe existir también cuando hay rutas curadas sin grafo:

```tsx
        map={
          detail.hasGraph || detail.routes.some((r) => !r.synthetic) ? (
            <SagaMapTab detail={detail} activeRoute={activeRoute} canEdit={canEditGraph} />
          ) : null
        }
```

- [ ] **Step 4: Enganchar el selector en la pestaña**

En `src/components/saga/saga-map-tab.tsx`:

1. Sustituir el import `import { OrderToggle } from "./order-toggle";` por:

```ts
import { RouteSelector } from "./route-selector";
```

2. Cambiar la firma del componente: sustituir `orden: "lectura" | "publicacion";` por `activeRoute: string;` y el destructuring correspondiente.

3. **Borrar** la línea `if (!graph) return null;` — el guard desaparece porque la pestaña puede existir ya sin grafo (una saga con rutas curadas y sin `saga_nodes`). No lo sustituyas por nada: las ramas que usan `graph` se protegen con `&& graph` en el paso 5, y la variable `orden` deja de existir.

4. Sustituir la línea 32 por:

```tsx
      <RouteSelector base={base} routes={detail.routes} active={activeRoute} />
```

5. Cambiar la condición del cuerpo: `orden === "publicacion" ? (…lista por año…) : (…grafo…)` pasa a ser una cadena de tres casos. Sustituir la expresión ternaria completa (líneas 34-117) por:

```tsx
      {activeRoute === "publicacion" ? (
        <ol className="divide-y divide-border border-t border-border">
          {/* …el mismo <li> de la lista por año, sin cambios… */}
        </ol>
      ) : activeRoute === "lectura" && graph ? (
        <>{/* …las dos ramas móvil/PC del grafo, sin cambios… */}</>
      ) : (
        <RouteView detail={detail} slug={activeRoute} canEdit={canEdit} />
      )}
```

`RouteView` llega en la Task 6; por ahora, para que compile, crear un stub en `src/components/saga/route-view.tsx`:

```tsx
export function RouteView(_: { detail: unknown; slug: string; canEdit?: boolean }) {
  return null;
}
```

- [ ] **Step 5: Borrar el toggle viejo**

```bash
git rm src/components/saga/order-toggle.tsx
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npx eslint src/components/saga/ src/app/saga/`
Expected: sin errores ni avisos.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sagas): el toggle de orden pasa a ser selector de itinerario"
```

---

## Task 6: Render de una ruta curada

> **Correcciones aplicadas durante la ejecución (2026-07-22).** El código de
> abajo se implementó y luego se corrigió por tres hallazgos de revisión. Si
> lees este plan como referencia, ten en cuenta que el estado final difiere:
>
> 1. **`key={i}` es incorrecto** en la lista de pasos. `RouteBlock` es cliente
>    y guarda el plegado en `useState`: al reordenar, React reutiliza la
>    instancia de la posición y deja abierto el bloque equivocado. La key final
>    se deriva del contenido (`block:${sagaId}` / `item:${tipo}:${id}`).
> 2. **`childNames`/`childAccent` no pueden salir de `detail.groups`**: un grupo
>    solo existe si tiene miembros, así que una subsaga vacía era
>    indistinguible de una borrada y su paso desaparecía en silencio.
>    `getSagaDetail` expone ahora `childRefs` (todos los descendientes) y de ahí
>    salen ambos mapas. Acento: el del grupo si existe, si no el `accent_color`
>    persistido, si no `beige`.
> 3. **`RouteView` no debe re-consultar `saga_routes`**: `getSagaDetail` ya lo
>    hizo. `SagaRoute` lleva ahora `id?: string` (opcional: las sintéticas no
>    tienen fila) y la ruta activa se localiza en `detail.routes`.

**Files:**
- Modify: `src/components/saga/route-view.tsx` (sustituye el stub)
- Create: `src/components/saga/route-block.tsx`

**Interfaces:**
- Consumes: `resolveRoute` (Task 3), `getSagaRoutes`/`getRouteEntries` (Task 4), `SagaDetail`.
- Produces: `<RouteView detail={SagaDetail} slug={string} canEdit?={boolean} />`.

- [ ] **Step 1: Escribir el bloque plegable**

Crear `src/components/saga/route-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { ResolvedStep } from "@/lib/sagas/route-types";

// Un bloque-subsaga dentro de una ruta. PLEGADO por defecto a propósito: si
// abres «La Guardia» no quieres que ocho portadas de Rincewind te sepulten el
// paso siguiente. Usa el mismo acento que esa subsaga tiene en el resto de la
// ficha, para que se reconozca de un vistazo.
export function RouteBlock({
  step,
  countLabel,
}: {
  step: Extract<ResolvedStep, { kind: "block" }>;
  countLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const accent = SAGA_ACCENT[step.accent];

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className={`h-8 w-1 shrink-0 rounded-full ${accent.tick}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{step.name}</span>
          <span className="block font-mono text-[9px] text-muted-foreground">{countLabel}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <ol className="divide-y divide-border border-t border-border">
          {step.members.map((m) => (
            <li key={`${m.itemType}-${m.itemId}`}>
              <Link href={m.href} className="flex items-center gap-3 px-3 py-2">
                <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                  {m.coverUrl && <Image src={m.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{m.title}</span>
                {m.status === "completed" && <span className="shrink-0 text-xs text-success">✓</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escribir la vista de ruta**

Sustituir el contenido de `src/components/saga/route-view.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { sagaHref } from "@/lib/catalog/item-href";
import { createMainOrder } from "@/lib/sagas/main-order";
import { getRouteEntries, getSagaRoutes } from "@/lib/sagas/get-saga-routes";
import { resolveRoute } from "@/lib/sagas/resolve-route";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { AdoptRouteButton } from "./adopt-route-button";
import { RouteBlock } from "./route-block";

// Una ruta curada: cabecera (nombre, resumen, contador PROPIO) + pasos.
// El contador del hero no se toca: sigue diciendo lo del universo entero,
// mires la ruta que mires (spec §Progreso).
export async function RouteView({
  detail,
  slug,
  canEdit,
}: {
  detail: SagaDetail;
  slug: string;
  canEdit?: boolean;
}) {
  const t = await getTranslations("saga");
  const supabase = await createClient();

  const routes = await getSagaRoutes(supabase, detail.saga.id);
  const row = routes.find((r) => r.slug === slug);
  if (!row) return null;

  const entries = await getRouteEntries(supabase, row.id);

  const members = new Map(detail.groups.flatMap((g) => g.members).map((m) => [`${m.itemType}:${m.itemId}`, m]));
  const childNames = new Map(detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.name ?? ""] as const] : [])));
  const childAccent = new Map(detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.accent] as const] : [])));

  // El orden principal de una subsaga se calcula con la MISMA función que el
  // hero (spec §1.5): un bloque no expande «todos sus miembros», expande su
  // orden principal, así que los opcionales de la subsaga no inflan el contador.
  const mainOrder = createMainOrder(detail.orderSagas, detail.orderMemberships, detail.orderNodes, (k) =>
    members.get(k)?.title ?? "",
  );

  const resolved = resolveRoute(entries, {
    members,
    childNames,
    childAccent,
    mainOrderOf: (sagaId) => mainOrder(sagaId),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{row.name}</h3>
            {row.summary && <p className="mt-0.5 text-xs text-muted-foreground">{row.summary}</p>}
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {t("routeProgress", { completed: resolved.completed, total: resolved.total })}
            </p>
          </div>
          {detail.isAuthenticated && (
            <AdoptRouteButton
              sagaId={detail.saga.id}
              slug={slug}
              adopted={detail.routeChoice === slug}
              labels={{ adopt: t("routeAdopt"), adopted: t("routeAdopted") }}
            />
          )}
        </div>
        {canEdit && (
          <Link
            href={`${sagaHref(detail.saga.id)}/rutas`}
            className="mt-2 inline-block rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            ✎ {t("routesManage")}
          </Link>
        )}
      </div>

      {resolved.steps.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{t("routeEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {resolved.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-6 shrink-0 pt-2.5 text-right font-mono text-[11px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                {step.kind === "block" ? (
                  <RouteBlock step={step} countLabel={t("routeBlockCount", { count: step.members.length })} />
                ) : (
                  <Link
                    href={step.member.href}
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                      {step.member.coverUrl && (
                        <Image src={step.member.coverUrl} alt="" fill sizes="30px" className="object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{step.member.title}</span>
                    {step.member.status === "completed" && <span className="shrink-0 text-xs text-success">✓</span>}
                  </Link>
                )}
                {step.note && <p className="mt-1 pl-1 text-[11px] italic text-muted-foreground">{step.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Exponer los insumos del orden principal en `SagaDetail`**

`RouteView` necesita reconstruir `createMainOrder`. En `src/lib/sagas/get-saga-detail.ts`, los tres arrays ya se construyen para la llamada existente: extraerlos a variables y devolverlos en lugar de recalcularlos.

Sustituir la llamada `const mainOrder = createMainOrder([...], rows.map(...), treeNodes.map(...), ...)` por:

```ts
  const orderSagas = [
    { id, name: saga.name, parentSagaId: null },
    ...[...descendants.values()].map((d) => ({
      id: d.id,
      name: d.name,
      parentSagaId: d.parent_saga_id,
    })),
  ];
  const orderMemberships = rows.map((r) => ({
    sagaId: r.saga_id,
    itemType: r.item_type,
    itemId: r.item_id,
    position: r.position,
  }));
  const orderNodes = treeNodes.map((n) => ({
    sagaId: n.saga_id,
    itemType: n.item_type,
    itemId: n.item_id,
    childSagaId: n.child_saga_id,
    orderNo: n.order_no,
  }));
  const mainOrder = createMainOrder(orderSagas, orderMemberships, orderNodes, (k) => meta.get(k)?.title ?? "");
```

y añadir al objeto devuelto:

```ts
    orderSagas,
    orderMemberships,
    orderNodes,
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx vitest run src/lib/sagas/`
Expected: sin errores; tests en verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sagas): render de un itinerario con bloques-subsaga plegables"
```

---

## Task 7: Adopción de una ruta

**Files:**
- Create: `src/lib/sagas/route-actions.ts`
- Create: `src/components/saga/adopt-route-button.tsx`

**Interfaces:**
- Consumes: `revalidateSagaPage`.
- Produces: `adoptRoute(sagaId: string, slug: string): Promise<void>`, `dropRoute(sagaId: string): Promise<void>`, `<AdoptRouteButton sagaId slug adopted labels />`.

- [ ] **Step 1: Escribir las actions**

Crear `src/lib/sagas/route-actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";

// Adopción de un itinerario (spec 2026-07-22). Clona el patrón de
// follow-actions: RLS solo-dueño y sin gate de rol, porque es preferencia
// personal, no curación.
//
// Guarda el SLUG, no el route_id: así vale también para las rutas sintéticas
// («lectura», «publicacion») y si un curador borra la ruta, la preferencia
// degrada sola al orden por defecto en vez de dejar una referencia rota.
export async function adoptRoute(sagaId: string, slug: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("saga_route_choices")
    .upsert({ user_id: user.id, saga_id: sagaId, route_slug: slug }, { onConflict: "user_id,saga_id" });
  revalidateSagaPage(sagaId);
}

export async function dropRoute(sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("saga_route_choices").delete().eq("user_id", user.id).eq("saga_id", sagaId);
  revalidateSagaPage(sagaId);
}
```

- [ ] **Step 2: Escribir el botón**

Crear `src/components/saga/adopt-route-button.tsx`:

```tsx
import { adoptRoute, dropRoute } from "@/lib/sagas/route-actions";

// Server Component con dos <form>: sin JS de cliente, como el resto de
// acciones simples de la ficha.
export function AdoptRouteButton({
  sagaId,
  slug,
  adopted,
  labels,
}: {
  sagaId: string;
  slug: string;
  adopted: boolean;
  labels: { adopt: string; adopted: string };
}) {
  const action = adopted ? dropRoute.bind(null, sagaId) : adoptRoute.bind(null, sagaId, slug);
  return (
    <form action={action}>
      <button
        type="submit"
        className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
          adopted ? "bg-surface-muted text-muted-foreground" : "bg-foreground text-background"
        }`}
      >
        {adopted ? labels.adopted : labels.adopt}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Mostrar la ruta adoptada en Mi Biblioteca**

La spec pide que la tarjeta de saga indique por cuál vas. En
`src/lib/sagas/get-followed-sagas.ts`, añadir a la consulta las elecciones del
usuario:

```ts
  const { data: choices } = await supabase
    .from("saga_route_choices")
    .select("saga_id, route_slug")
    .eq("user_id", userId);
  const choiceBySaga = new Map(
    ((choices ?? []) as Array<{ saga_id: string; route_slug: string }>).map((c) => [c.saga_id, c.route_slug]),
  );
```

y pasar `routeName` (resuelto con `buildRouteList` sobre las rutas de esa saga,
o `null` si la elección es sintética — no tiene sentido anunciar «vas por
Publicación») a `buildLibrarySagaCards`. En
`src/lib/sagas/build-library-saga-cards.ts`, añadir el campo opcional
`routeName: string | null` a la card y pintarlo en el componente de la tarjeta
como una línea mono de 9px bajo el título, igual que `groupName` en el resto de
listas.

Escribir el test correspondiente en `build-library-saga-cards.test.ts`:

```ts
it("la card anuncia la ruta adoptada, pero no si es una sintética", () => {
  // ...construir dos cards con routeName "La Guardia" y null respectivamente
  // y comprobar que solo la primera lo expone.
});
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx eslint src/lib/sagas/ src/components/saga/ && npx vitest run src/lib/sagas/`
Expected: sin errores ni avisos; tests en verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sagas): adoptar un itinerario y anunciarlo en Mi Biblioteca"
```

---

## Task 8: Curación — lista de rutas

**Files:**
- Create: `src/app/saga/[id]/rutas/page.tsx`
- Modify: `src/lib/sagas/route-actions.ts` (añadir CRUD)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `getSagaRoutes`.
- Produces: `createRoute(sagaId, formData)`, `renameRoute(routeId, sagaId, formData)`, `deleteRoute(routeId, sagaId)`; ruta `/saga/[id]/rutas` con gate collaborator+.

- [ ] **Step 1: Añadir las claves i18n**

En `messages/es.json`, bloque `"sagaEditor"`:

```json
    "routesTitle": "Itinerarios de lectura",
    "routesEmpty": "Esta saga no tiene itinerarios curados.",
    "routeNameLabel": "Nombre",
    "routeSummaryLabel": "Para quién es",
    "routeCreate": "Crear itinerario",
    "routeEditSteps": "Editar pasos",
    "routeDelete": "Borrar",
    "routeSlugTaken": "Ya hay un itinerario con ese nombre en esta saga.",
    "routeNameRequired": "El nombre no puede estar vacío.",
```

- [ ] **Step 2: Añadir el CRUD a las actions**

Añadir al final de `src/lib/sagas/route-actions.ts`:

```ts
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";

export type RouteFormState = { error?: "nameRequired" | "slugTaken" | "forbidden" | "generic" };

/** Slug a partir del nombre: minúsculas, sin acentos, separadores simples. */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createRoute(
  sagaId: string,
  _prev: RouteFormState,
  formData: FormData,
): Promise<RouteFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Gate en el server action ADEMÁS del de RLS: los dos, como en el resto del
  // dominio de sagas.
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "nameRequired" };
  const summary = String(formData.get("summary") ?? "").trim() || null;

  let slug = slugify(name);
  // Los slugs reservados los rechaza el CHECK de BD; aquí se desvían antes de
  // llegar, para dar un error legible en vez de un 500.
  if (!slug || slug === "lectura" || slug === "publicacion") slug = `${slug || "ruta"}-1`;

  const { data: last } = await supabase
    .from("saga_routes")
    .select("position")
    .eq("saga_id", sagaId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("saga_routes").insert({
    saga_id: sagaId,
    slug,
    name,
    summary,
    position: ((last as { position: number } | null)?.position ?? 0) + 1,
  });
  if (error) return { error: error.code === "23505" ? "slugTaken" : "generic" };

  revalidateSagaPage(sagaId);
  return {};
}

export async function deleteRoute(routeId: string, sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${sagaId}`);

  await supabase.from("saga_routes").delete().eq("id", routeId);
  revalidateSagaPage(sagaId);
}
```

- [ ] **Step 3: Escribir la página**

Crear `src/app/saga/[id]/rutas/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaRoutes } from "@/lib/sagas/get-saga-routes";
import { deleteRoute } from "@/lib/sagas/route-actions";

// Curación de itinerarios (spec 2026-07-22). Gate DURO collaborator+, igual
// que /saga/[id]/mapa/editar.
export default async function SagaRoutesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("sagaEditor");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${id}`);

  const { data: saga } = await supabase.from("sagas").select("id, name").eq("id", id).maybeSingle();
  if (!saga) notFound();

  const routes = await getSagaRoutes(supabase, id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-lg font-semibold">{t("routesTitle")}</h1>

      {routes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("routesEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routes.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                {r.summary && <span className="block truncate text-[11px] text-muted-foreground">{r.summary}</span>}
              </span>
              <Link
                href={`/saga/${id}/rutas/${r.slug}/editar`}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold"
              >
                {t("routeEditSteps")}
              </Link>
              <form action={deleteRoute.bind(null, r.id, id)}>
                <button type="submit" className="shrink-0 px-2 py-1 text-[11px] text-danger">
                  {t("routeDelete")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <CreateRouteForm sagaId={id} />
    </div>
  );
}

async function CreateRouteForm({ sagaId }: { sagaId: string }) {
  const t = await getTranslations("sagaEditor");
  const { createRoute } = await import("@/lib/sagas/route-actions");
  return (
    <form action={createRoute.bind(null, sagaId, {})} className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="name">
        {t("routeNameLabel")}
      </label>
      <input id="name" name="name" required className="rounded-lg border border-border px-2 py-1.5 text-sm" />
      <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="summary">
        {t("routeSummaryLabel")}
      </label>
      <input id="summary" name="summary" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
      <button type="submit" className="self-end rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background">
        {t("routeCreate")}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx eslint src/app/saga/ src/lib/sagas/`
Expected: sin errores ni avisos.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sagas): pantalla de curación de itinerarios"
```

---

## Task 9: Curación — editor de pasos

**Files:**
- Create: `src/lib/sagas/validate-route-draft.ts`
- Create: `src/lib/sagas/validate-route-draft.test.ts`
- Create: `src/app/saga/[id]/rutas/[slug]/editar/page.tsx`
- Create: `src/components/saga/editor/route-editor.tsx`
- Modify: `src/lib/sagas/route-actions.ts` (añadir `saveRoute`)

**Interfaces:**
- Consumes: `RawRouteEntry`, RPC `save_saga_route`.
- Produces: `validateRouteDraft(entries, ctx): string[]`, `saveRoute(routeId, sagaId, entries): Promise<{error?: string}>`.

- [ ] **Step 1: Escribir el test de validación**

Crear `src/lib/sagas/validate-route-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateRouteDraft } from "./validate-route-draft";
import type { RawRouteEntry } from "./route-types";

const e = (over: Partial<RawRouteEntry> & { position: number }): RawRouteEntry => ({
  itemType: null,
  itemId: null,
  childSagaId: null,
  note: null,
  ...over,
});

const ctx = { descendantIds: new Set(["guardia"]) };

describe("validateRouteDraft", () => {
  it("acepta un borrador correcto", () => {
    expect(
      validateRouteDraft([e({ position: 1, itemType: "book", itemId: "a" }), e({ position: 2, childSagaId: "guardia" })], ctx),
    ).toEqual([]);
  });

  it("rechaza posiciones no consecutivas desde 1", () => {
    expect(validateRouteDraft([e({ position: 2, itemType: "book", itemId: "a" })], ctx)).toContain("positions");
  });

  it("rechaza una entrada que no cumple el XOR", () => {
    expect(
      validateRouteDraft([e({ position: 1, itemType: "book", itemId: "a", childSagaId: "guardia" })], ctx),
    ).toContain("xor");
  });

  it("rechaza entradas duplicadas", () => {
    expect(
      validateRouteDraft(
        [e({ position: 1, itemType: "book", itemId: "a" }), e({ position: 2, itemType: "book", itemId: "a" })],
        ctx,
      ),
    ).toContain("duplicate");
  });

  it("rechaza un bloque que no es descendiente de esta saga", () => {
    expect(validateRouteDraft([e({ position: 1, childSagaId: "ajena" })], ctx)).toContain("foreignBlock");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/sagas/validate-route-draft.test.ts`
Expected: FAIL — no se resuelve el import.

- [ ] **Step 3: Escribir la validación**

Crear `src/lib/sagas/validate-route-draft.ts`:

```ts
import type { RawRouteEntry } from "./route-types";

// Validación previa al guardado, en la línea de validate-graph-draft.
// Devuelve códigos de error (el consumidor los traduce), lista vacía = válido.
//
// NO valida que la ruta cubra todo el orden principal: una ruta PARCIAL
// («solo lo esencial») es justo el caso de uso. Eso es un aviso de UI, no un
// error de guardado.
export function validateRouteDraft(
  entries: RawRouteEntry[],
  ctx: { descendantIds: Set<string> },
): string[] {
  const errors = new Set<string>();

  const positions = entries.map((e) => e.position).sort((a, b) => a - b);
  if (positions.some((p, i) => p !== i + 1)) errors.add("positions");

  const seen = new Set<string>();
  for (const e of entries) {
    const isItem = e.itemType !== null && e.itemId !== null;
    const isBlock = e.childSagaId !== null;
    if (isItem === isBlock) {
      errors.add("xor");
      continue;
    }
    const key = isItem ? `i:${e.itemType}:${e.itemId}` : `s:${e.childSagaId}`;
    if (seen.has(key)) errors.add("duplicate");
    seen.add(key);

    if (isBlock && !ctx.descendantIds.has(e.childSagaId!)) errors.add("foreignBlock");
  }

  return [...errors];
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npx vitest run src/lib/sagas/validate-route-draft.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Añadir `saveRoute`**

Añadir al final de `src/lib/sagas/route-actions.ts`:

```ts
import { validateRouteDraft } from "./validate-route-draft";
import type { RawRouteEntry } from "./route-types";

export async function saveRoute(
  routeId: string,
  sagaId: string,
  entries: RawRouteEntry[],
  descendantIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  const problems = validateRouteDraft(entries, { descendantIds: new Set(descendantIds) });
  if (problems.length > 0) return { error: problems[0] };

  const { error } = await supabase.rpc("save_saga_route", {
    p_route_id: routeId,
    p_entries: entries.map((e) => ({
      position: e.position,
      item_type: e.itemType,
      item_id: e.itemId,
      child_saga_id: e.childSagaId,
      note: e.note,
    })),
  });
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  return {};
}
```

- [ ] **Step 6: Escribir el editor cliente**

Crear `src/components/saga/editor/route-editor.tsx`. Se usan botones ↑/↓ en vez
de drag & drop: la lista es corta, el teclado y el lector de pantalla salen
gratis, y evita arrastrar `@dnd-kit` a un bundle nuevo. Si más adelante se
quiere DnD, el estado ya está en la forma correcta.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveRoute } from "@/lib/sagas/route-actions";
import type { RawRouteEntry } from "@/lib/sagas/route-types";

export type RouteEditorItem = { key: string; label: string; entry: Omit<RawRouteEntry, "position"> };

export function RouteEditor({
  routeId,
  sagaId,
  descendantIds,
  initialEntries,
  palette,
}: {
  routeId: string;
  sagaId: string;
  descendantIds: string[];
  initialEntries: RawRouteEntry[];
  /** Obras del subárbol + subsagas, para añadir pasos. */
  palette: RouteEditorItem[];
}) {
  const t = useTranslations("sagaEditor");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const keyOf = (e: Omit<RawRouteEntry, "position">) =>
    e.childSagaId ? `s:${e.childSagaId}` : `i:${e.itemType}:${e.itemId}`;

  const [draft, setDraft] = useState<RouteEditorItem[]>(() =>
    initialEntries
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((e) => {
        const k = keyOf(e);
        return palette.find((p) => p.key === k) ?? { key: k, label: k, entry: e };
      }),
  );

  const inDraft = new Set(draft.map((d) => d.key));

  const move = (i: number, delta: number) =>
    setDraft((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      // Renumerar 1..n SIEMPRE antes de enviar: así el reordenado no puede
      // dejar huecos y la validación de posiciones consecutivas nunca falla
      // por un motivo que el curador no puede ver ni corregir.
      const entries: RawRouteEntry[] = draft.map((d, i) => ({ ...d.entry, position: i + 1 }));
      const res = await saveRoute(routeId, sagaId, entries, descendantIds);
      setError(res.error ?? null);
    });

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1">
        {draft.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
            <span className="w-6 text-right font-mono text-[11px] text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]">{d.label}</span>
            <button type="button" onClick={() => move(i, -1)} aria-label="Subir" className="px-1.5 text-xs">
              ↑
            </button>
            <button type="button" onClick={() => move(i, 1)} aria-label="Bajar" className="px-1.5 text-xs">
              ↓
            </button>
            <button
              type="button"
              onClick={() => setDraft((v) => v.filter((x) => x.key !== d.key))}
              aria-label="Quitar"
              className="px-1.5 text-xs text-danger"
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-1.5">
        {palette
          .filter((p) => !inDraft.has(p.key))
          .map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setDraft((d) => [...d, p])}
              className="rounded-full border border-border px-2.5 py-1 text-[11px]"
            >
              + {p.label}
            </button>
          ))}
      </div>

      {error && <p className="text-xs text-danger">{t(`routeError_${error}`)}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="self-end rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background disabled:opacity-50"
      >
        {t("routeSave")}
      </button>
    </div>
  );
}
```

Añadir a `messages/es.json`, bloque `"sagaEditor"`:

```json
    "routeSave": "Guardar itinerario",
    "routeError_positions": "Las posiciones deben ir de 1 en adelante sin huecos.",
    "routeError_xor": "Cada paso es una obra o una subsaga, no las dos cosas.",
    "routeError_duplicate": "Hay un paso repetido en el itinerario.",
    "routeError_foreignBlock": "Solo puedes usar subsagas de esta saga.",
    "routeError_forbidden": "No tienes permiso para editar itinerarios.",
    "routeError_generic": "No se pudo guardar el itinerario.",
```

- [ ] **Step 7: Escribir la página del editor**

Crear `src/app/saga/[id]/rutas/[slug]/editar/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { RouteEditor, type RouteEditorItem } from "@/components/saga/editor/route-editor";

// Editor de pasos de un itinerario. Gate DURO collaborator+, igual que
// /saga/[id]/mapa/editar.
export default async function RouteEditorPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${id}`);

  const { data: route } = await supabase
    .from("saga_routes")
    .select("id, name")
    .eq("saga_id", id)
    .eq("slug", slug)
    .maybeSingle();
  if (!route) notFound();

  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  const entries = await getRouteEntries(supabase, (route as { id: string }).id);

  // Paleta: subsagas primero (bloques), luego las obras del subárbol.
  const descendantIds = detail.groups.flatMap((g) => (g.sagaId ? [g.sagaId] : []));
  const palette: RouteEditorItem[] = [
    ...detail.groups.flatMap((g) =>
      g.sagaId
        ? [{ key: `s:${g.sagaId}`, label: g.name ?? "", entry: { itemType: null, itemId: null, childSagaId: g.sagaId, note: null } }]
        : [],
    ),
    ...detail.groups.flatMap((g) =>
      g.members.map((m) => ({
        key: `i:${m.itemType}:${m.itemId}`,
        label: m.title,
        entry: { itemType: m.itemType, itemId: m.itemId, childSagaId: null, note: null },
      })),
    ),
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-lg font-semibold">{(route as { name: string }).name}</h1>
      <RouteEditor
        routeId={(route as { id: string }).id}
        sagaId={id}
        descendantIds={descendantIds}
        initialEntries={entries}
        palette={palette}
      />
    </div>
  );
}
```

- [ ] **Step 8: Verificar**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: sin errores ni avisos; toda la suite en verde.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(sagas): editor de pasos de un itinerario"
```

---

## Task 10: E2E, doc y despliegue

**Files:**
- Create: `e2e/sagas-itinerarios.spec.ts`
- Modify: `docs/requirements/data-model.md`, `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`
- Modify: `supabase/schema-baseline.sql`

- [ ] **Step 1: Escribir los e2e**

Crear `e2e/sagas-itinerarios.spec.ts`. **Antes de escribirlo**, abrir
`e2e/sagas-v2-mapa.spec.ts` y copiar de ahí el import del helper de sesión, la
siembra de datos y los `data-testid` que ya existan — este fichero asume esos
mismos nombres.

```ts
import { expect, test } from "@playwright/test";
import { loginAsCollaborator, seedSagaWithRoute } from "./helpers";

test.describe("itinerarios de lectura", () => {
  test("el selector lista las rutas y la elegida muestra su cabecera", async ({ page }) => {
    const { sagaId } = await seedSagaWithRoute();
    await page.goto(`/saga/${sagaId}?tab=mapa`);

    await page.getByRole("link", { name: "La Guardia" }).click();

    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
    await expect(page.getByText("Policíaco")).toBeVisible();
    await expect(page.getByText(/Llevas \d+ de \d+ de esta ruta/)).toBeVisible();
  });

  // Red contra el #91: si alguien reimplementa el contador y lo engancha al
  // hero, el número del universo empezaría a bailar según la pestaña. Este
  // test cae en cuanto eso pase.
  test("el progreso del hero NO cambia al cambiar de ruta", async ({ page }) => {
    const { sagaId } = await seedSagaWithRoute();
    await page.goto(`/saga/${sagaId}?tab=mapa`);

    const hero = page.getByTestId("saga-hero-progress");
    const before = await hero.innerText();

    await page.getByRole("link", { name: "La Guardia" }).click();
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();

    expect(await hero.innerText()).toBe(before);
  });

  test("adoptar una ruta hace que la ficha abra por ella", async ({ page }) => {
    const { sagaId } = await seedSagaWithRoute();
    await loginAsCollaborator(page);
    await page.goto(`/saga/${sagaId}?tab=mapa&ruta=la-guardia`);

    await page.getByRole("button", { name: "Leer por aquí" }).click();
    await expect(page.getByRole("button", { name: "Leyendo por aquí" })).toBeVisible();

    // Sin searchParams: debe abrir por la adoptada.
    await page.goto(`/saga/${sagaId}?tab=mapa`);
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
  });

  test("los enlaces viejos con ?orden=publicacion siguen funcionando", async ({ page }) => {
    const { sagaId } = await seedSagaWithRoute();
    await page.goto(`/saga/${sagaId}?tab=mapa&orden=publicacion`);

    // La lista por año se reconoce por su numeración 01, 02…
    await expect(page.getByText("01", { exact: true })).toBeVisible();
  });
});
```

Si `saga-hero-progress` no existe como `data-testid`, añadirlo al elemento que
pinta el progreso en `src/components/saga/saga-hero.tsx` — el test lo necesita
para poder comparar el valor exacto y no un texto ambiguo.

El helper `seedSagaWithRoute` hay que escribirlo en `e2e/helpers` siguiendo el
patrón de los seeds que ya existan: crea una saga con una subsaga «La Guardia»
de dos obras, una ruta curada `la-guardia` con nombre «La Guardia» y resumen
«Policíaco», y devuelve `{ sagaId }`.

- [ ] **Step 2: Ejecutar los e2e**

Run: `npm run test:e2e -- sagas-itinerarios`
Expected: 4 passed. **No arrancar un `next dev` nuevo**: Playwright reutiliza el que haya (AGENTS.md).

- [ ] **Step 3: Aplicar a prod y anexar el baseline**

Ojo al orden (lo aprendido en el #169): esta migración es **puramente aditiva** — tablas nuevas y una función nueva, sin cerrar ninguna política existente — así que **no** hay riesgo de romper el código viejo y puede aplicarse antes o después del despliegue.

1. `mcp__supabase-prod__apply_migration` con el SQL de la Task 1.
2. Verificar con `pg_policies` y `pg_proc` en prod, y comparar `md5(regexp_replace(prosrc, '\s+', ' ', 'g'))` de `save_saga_route` entre dev y prod: deben coincidir.
3. Anexar el SQL a `supabase/schema-baseline.sql` **en la misma pasada** — es un replay de producción y ya se desincronizó dos veces por tratar aplicar y anexar como pasos separados.

- [ ] **Step 4: Sincronizar la doc**

- `docs/requirements/data-model.md` §7: añadir §7.2 con las tres tablas, la RPC y la nota de que `lectura`/`publicacion` **no** se materializan y por qué. Actualizar la fecha de verificación de la cabecera.
- `docs/requirements/backlog.md`: marcar los itinerarios como hechos en la sección «Sagas», enlazando a la spec.
- `docs/requirements/decisiones.md`: **añadir al final** (append-only) una fila con la decisión de sintetizar las dos rutas en vez de materializarlas, y el porqué (evitar la segunda fuente de verdad del #91).

- [ ] **Step 5: Cerrar el ciclo de issues**

Abrir issue por lo que quede pendiente o dudoso. Como mínimo, comprobar si sigue vivo lo ya conocido: #167 (rol y colocación / precuelas), #168 (tándem), #171 (rutas de usuario).

- [ ] **Step 6: Commit final y PR**

```bash
git add -A
git commit -m "test(sagas): e2e de itinerarios y sincronización documental"
git push -u origin <rama>
gh pr create --draft --title "Sagas: itinerarios de lectura" --body "..."
```

---

## Notas de riesgo para quien ejecute

**El error que este plan intenta evitar por encima de todo** es reimplementar el conteo de "completado" dentro del contador de ruta. Por eso la Task 2 va antes que la Task 3 y extrae el predicado *antes* de que exista el primer consumidor nuevo. Si al llegar a la Task 6 te encuentras escribiendo `status === "completed"`, párate: esa comparación solo debe existir en `src/lib/sagas/completion.ts`.

**Segundo riesgo:** `saga_route_entries.item_id` no tiene FK, igual que `saga_nodes.item_id`. Las entradas colgantes se descartan del render **y** del denominador (Task 3). No repliques el comportamiento del grafo, donde se descartan solo del render y por eso el avance no llega al 100% (issue #170, ya arreglado en `main-order.ts` pero no en el resto).

**Tercero:** el selector con dos rutas debe seguir siendo *visualmente idéntico* al toggle de hoy. Todas las sagas existentes tienen exactamente dos, así que cualquier regresión ahí la ve el usuario en toda la app, no solo en Mundodisco.
