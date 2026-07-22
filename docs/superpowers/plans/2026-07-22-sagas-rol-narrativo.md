# Rol narrativo de un miembro de saga — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una saga pueda decir *qué es* una obra —precuela, spin-off, relato, paralela— sin obligar a curar un grafo, y que ese dato sustituya al vocabulario inventado que hoy pinta el timeline.

**Architecture:** Una columna `role` en `saga_items` (enum de Postgres, nullable, sin backfill). El dato viaja por el camino que ya recorre `groupSagaId`: `saga_items` → `DetailMember` → `GraphLookup` → `SagaGraphNode` → `deriveTimeline`. La pertenencia a la sección "Fuera del orden principal" la decide `position === null`; el chip de rol lo decide `role !== null`. Son condiciones independientes.

**Tech Stack:** Next.js (App Router, RSC), Supabase (Postgres + RLS), TypeScript, Tailwind, next-intl, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-22-sagas-rol-narrativo-design.md`

## Antes de empezar: dos trampas del entorno

Las dos se manifiestan como "no funciona nada" o, peor, como verde falso. Compruébalas una vez, al principio.

- [ ] **Node 22, no el v20 del shell**

Run: `node --version`

Esperado: `v22.x`. `package.json:6` exige `>=22.11.0` y `.nvmrc` fija `22.23.1`, pero **el shell no interactivo de este entorno resuelve v20.9.0**. Con v20, `npx vitest run` muere al arrancar (`node:util` no exporta `styleText`) y los ~15 `Run:` de este plan fallan todos.

Si sale v20: activa fnm (`fnm use 22.23.1`) o invoca el binario absoluto `C:\Users\borja\AppData\Roaming\fnm\node-versions\v22.23.1\installation\node.exe`.

- [ ] **`.env.local` en el worktree, o los e2e mienten**

`playwright.config.ts:7` lee `.env.local` **relativo al cwd**, y este worktree solo tiene `.env.example`. El `catch` de `:11` se traga el fallo y cada spec con login se auto-salta vía `test.skip(!EMAIL || !PASSWORD, …)`: **la suite sale verde sin haber probado nada.**

Copia `.env.local` del repo padre a este worktree, o exporta `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` / `TEST_USER_USERNAME`, antes del primer `npx playwright test`.

---

## Global Constraints

- **Idioma del producto: español.** Un solo locale, `messages/es.json`. No hay `en.json`.
- **No hay zod.** La validación es a mano. Los server actions devuelven `{ error: "código" }`, **nunca** mensajes; el texto vive en `messages/es.json`.
- **Doble gate obligatorio.** Todo action de curación re-comprueba `hasMinRole(..., "collaborator")` aunque la RLS ya lo haga. Los dos, nunca solo uno.
- **Revalidación manual.** `revalidateItemPage` / `revalidateSagaPage` se llaman a mano al final de cada action que escribe.
- **`database.types.ts` se parchea a mano**, no se regenera en bloque.
- **Migraciones: dev primero** (`supabase-dev`), verificando contra `pg_class`/`pg_attribute`/`pg_type`, **nunca contra `list_migrations`**; prod al final, en la misma pasada que se anexa a `schema-baseline.sql`.
- **El denominador del progreso no se toca.** `main-order.ts` no se modifica en ninguna tarea de este plan.
- **Valores del enum**, exactos y en minúscula: `precuela`, `spin_off`, `relato`, `paralela`.
- **Nombre `role`:** el repo ya usa `role` para el rol de usuario (`profiles.role`) y para autoría (`people.role`). `saga_items.role` no colisiona porque está acotado a la tabla, y el tipo TS es explícito (`SagaItemRole`). Es deliberado, no un descuido.

---

### Task 1: Columna `role` en `saga_items`

Crea el enum y la columna en dev, parchea los tipos generados y declara el tipo de dominio. Sin consumidores todavía: al acabar esta tarea la app compila y se comporta exactamente igual que antes.

**Files:**
- Create: `supabase/migrations/20260723_saga_item_role.sql`
- Modify: `src/lib/supabase/database.types.ts` (bloques `saga_items`, `Enums`, `Constants`)
- Modify: `src/lib/sagas/types.ts`

**Interfaces:**
- Consumes: nada.
- Produces: el tipo `SagaItemRole = "precuela" | "spin_off" | "relato" | "paralela"`, exportado desde `src/lib/sagas/types.ts`. Todas las tareas posteriores lo importan de ahí, **no** de `database.types.ts`.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/20260723_saga_item_role.sql`. Fecha `20260723` para quedar junto a las de itinerarios; el orden entre ellas es indiferente porque este cambio es aditivo y no depende de ninguna.

Un solo fichero es correcto aquí: la restricción de "un `ALTER TYPE ... ADD VALUE` por fichero" aplica a *añadir un valor a un enum existente*, no a crear un tipo nuevo y usarlo en el mismo `alter table`.

```sql
-- Rol narrativo de un miembro de saga (issue #167, spec
-- 2026-07-22-sagas-rol-narrativo-design.md). Qué ES la obra dentro de ESTA
-- saga: precuela, spin-off, relato, paralela.
--
-- Va en saga_items y no en saga_nodes a propósito: el grafo es opcional (una
-- saga sin saga_nodes no tiene pestaña Mapa) mientras que toda saga tiene
-- filas en saga_items, y el unique (saga_id, item_type, item_id) hace que el
-- atributo sea POR SAGA — un libro puede ser precuela en una y obra principal
-- en otra.
--
-- Nullable y SIN backfill: null = "sin clasificar". Los position IS NULL de hoy
-- son en buena parte descuido de curación, no una decisión editorial; darles un
-- valor sería escribir una mentira en la BD (ver spec, "Por qué no hay backfill").
--
-- No lleva política RLS propia: hereda las de saga_items (select público,
-- escrituras collaborator+). Las SECURITY DEFINER de TMDB no mencionan la
-- columna, así que insertan null y siguen funcionando sin tocarse.

create type public.saga_item_role as enum ('precuela', 'spin_off', 'relato', 'paralela');

alter table public.saga_items add column role public.saga_item_role;

comment on column public.saga_items.role is
  'Rol narrativo del ítem en ESTA saga. null = sin clasificar. Ortogonal a position: position dice si tiene hueco fijo, role dice qué es.';
```

- [ ] **Step 2: Aplicar en dev y verificar contra los objetos reales**

Aplica el fichero con la herramienta MCP `supabase-dev` (`apply_migration`, nombre `saga_item_role`).

Verifica con `execute_sql` sobre **dev**:

```sql
select a.attname, t.typname, a.attnotnull
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_type t on t.oid = a.atttypid
where c.relname = 'saga_items' and a.attname = 'role';

select enumlabel from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'saga_item_role' order by e.enumsortorder;
```

Esperado: una fila `role | saga_item_role | f`, y cuatro etiquetas en el orden `precuela, spin_off, relato, paralela`.

**No** uses `list_migrations` para comprobar nada: el ledger y los objetos reales divergen en este proyecto.

- [ ] **Step 3: Parchear `database.types.ts` — bloque `saga_items`**

En `src/lib/supabase/database.types.ts`, el bloque `saga_items` tiene tres sub-bloques (`Row`, `Insert`, `Update`) con las claves **ordenadas alfabéticamente**. `role` entra entre `position` y `saga_id` en los tres.

`Row` — añade tras la línea `position: number | null`:

```ts
          role: Database["public"]["Enums"]["saga_item_role"] | null
```

`Insert` — añade tras `position?: number | null`:

```ts
          role?: Database["public"]["Enums"]["saga_item_role"] | null
```

`Update` — añade tras `position?: number | null`:

```ts
          role?: Database["public"]["Enums"]["saga_item_role"] | null
```

- [ ] **Step 4: Parchear `database.types.ts` — `Enums` y `Constants`**

En el bloque `Enums` (alfabético), añade entre `saga_edge_type` y `saga_node_level`:

```ts
      saga_item_role: "precuela" | "spin_off" | "relato" | "paralela"
```

En el bloque `Constants`, en el mismo sitio relativo:

```ts
      saga_item_role: ["precuela", "spin_off", "relato", "paralela"],
```

- [ ] **Step 5: Declarar el tipo de dominio**

En `src/lib/sagas/types.ts`, añade el tipo y el campo. El tipo se escribe a mano (como el resto del dominio) en vez de derivarlo de `Database[...]`, siguiendo la convención del fichero — pero eso significa que **ampliar el enum en BD no dará error de compilación aquí**, así que el comentario lo deja dicho.

Sustituye el bloque `SagaMember` por:

```ts
/** Rol narrativo de un miembro dentro de una saga concreta (issue #167).
 *  Espejo a mano de public.saga_item_role: si algún día se añade un valor en
 *  BD, TypeScript NO se quejará aquí — hay que actualizarlo a mano. */
export type SagaItemRole = "precuela" | "spin_off" | "relato" | "paralela";

// Miembro de una saga (para la vista de saga).
export type SagaMember = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  href: string;
  position: number | null;
  /** null = sin clasificar. Ortogonal a `position`: `position` dice si la obra
   *  tiene hueco fijo en el orden, `role` dice qué es. */
  role: SagaItemRole | null;
};
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`

Esperado: **fallará**, y es la señal correcta. `SagaMember.role` es obligatorio y nadie lo construye todavía; los errores apuntan a `get-saga-detail.ts` (donde se arma el miembro) y a cualquier test que fabrique un `SagaMember` literal. Anota los ficheros que salen: son exactamente los que toca la Task 2.

No arregles nada aquí. Si `tsc` **no** falla, algo va mal — probablemente no guardaste `types.ts`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260723_saga_item_role.sql src/lib/supabase/database.types.ts src/lib/sagas/types.ts
git commit -m "feat(sagas): columna role en saga_items (#167)"
```

---

### Task 2: Leer el rol y llevarlo hasta el miembro

Thread del dato desde la consulta hasta `DetailMember`. Al acabar, `tsc` vuelve a estar limpio y el rol está disponible en la pestaña Info aunque todavía no se pinte.

**Files:**
- Modify: `src/lib/sagas/get-saga-detail.ts:147-148` (select) y `:244` (construcción del miembro)
- Test: `src/lib/sagas/group-members.test.ts`

**Interfaces:**
- Consumes: `SagaItemRole` y `SagaMember.role` de la Task 1.
- Produces: `DetailMember.role` poblado desde BD. La Task 3 (grafo) y la Task 4 (render) lo consumen.

- [ ] **Step 1: Escribir el test que falla**

`DetailMember` extiende `SagaMember`, así que el test vive donde ya se fabrican miembros. Añade al final de `src/lib/sagas/group-members.test.ts`:

```ts
describe("rol narrativo (#167)", () => {
  it("conserva el role al agrupar y NO lo confunde con position", () => {
    const members: DetailMember[] = [
      { itemType: "book", itemId: "a", title: "Libro 1", coverUrl: null, href: "/a",
        position: 1, role: null, status: null, groupSagaId: null, year: 1990 },
      { itemType: "book", itemId: "b", title: "Nueva Primavera", coverUrl: null, href: "/b",
        position: null, role: "precuela", status: null, groupSagaId: null, year: 2004 },
      { itemType: "book", itemId: "c", title: "Sin clasificar", coverUrl: null, href: "/c",
        position: null, role: null, status: null, groupSagaId: null, year: 2010 },
    ];

    const [group] = groupMembers(members, []);

    // Los cuatro casos del spec: numerada-sin-rol, sin-número-con-rol,
    // sin-número-sin-rol. El orden sigue siendo por position (nulls al final),
    // el role no lo altera.
    expect(group.members.map((m) => m.itemId)).toEqual(["a", "b", "c"]);
    expect(group.members.map((m) => m.role)).toEqual([null, "precuela", null]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/sagas/group-members.test.ts`

Esperado: FAIL de TypeScript — los literales de miembro de los tests **existentes** en ese fichero no tienen `role`, así que el fichero entero no compila.

- [ ] **Step 3: Añadir `role: null` a los miembros de los tests existentes**

En `src/lib/sagas/group-members.test.ts`, añade `role: null` a cada objeto literal `DetailMember` que ya exista. Haz lo mismo en cualquier otro `.test.ts` que `tsc` haya señalado en la Task 1 / Step 6 (típicamente `main-order.test.ts` y `build-library-saga-cards.test.ts` si fabrican miembros completos).

Es mecánico y aburrido a propósito: el campo es obligatorio para que ningún sitio se olvide de propagarlo.

- [ ] **Step 4: Añadir `role` al select**

En `src/lib/sagas/get-saga-detail.ts`, línea 148, cambia:

```ts
    .select("saga_id, item_type, item_id, position")
```

por:

```ts
    .select("saga_id, item_type, item_id, position, role")
```

Y en el tipo inline que declara la forma de la fila (justo debajo, donde hoy pone `position: number | null;`), añade:

```ts
    role: SagaItemRole | null;
```

Importa el tipo en la cabecera del fichero:

```ts
import type { SagaItemRole } from "./types";
```

(Si ya hay un `import type { ... } from "./types"`, añade `SagaItemRole` a la lista en vez de crear un import nuevo.)

- [ ] **Step 5: Poblar el miembro**

En el mismo fichero, línea ~244, donde se construye el miembro con `position: row.position,`, añade justo debajo:

```ts
      role: row.role,
```

- [ ] **Step 6: Ejecutar los tests**

Run: `npx vitest run src/lib/sagas/`

Esperado: PASS, incluido el test nuevo.

Run: `npx tsc --noEmit`

Esperado: sin errores. Aquí es donde se cierra lo que la Task 1 dejó roto a propósito.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/get-saga-detail.ts src/lib/sagas/group-members.test.ts src/lib/sagas/
git commit -m "feat(sagas): el rol viaja de saga_items al miembro de la ficha (#167)"
```

---

### Task 3: El rol llega al nodo del grafo

Mismo camino que ya recorre `groupSagaId`: del `GraphLookup` al `SagaGraphNode`. Necesario para que el timeline pueda dejar de inventarse el vocabulario en la Task 6.

**Files:**
- Modify: `src/lib/sagas/graph-data.ts:31-47` (tipo) y `:79-95` (construcción)
- Test: `src/lib/sagas/graph-data.test.ts`

**Interfaces:**
- Consumes: `DetailMember.role` (Task 2).
- Produces: `SagaGraphNode.role: SagaItemRole | null`. Lo consume `deriveTimeline` en la Task 6.

- [ ] **Step 1: Escribir el test que falla**

Añade al final de `src/lib/sagas/graph-data.test.ts`:

```ts
describe("rol narrativo en el nodo (#167)", () => {
  it("copia el role de la membresía al nodo-ítem", () => {
    const raw: RawSagaNode[] = [
      { id: "n1", item_type: "book", item_id: "b1", child_saga_id: null,
        x: 0, y: 0, level: "principal", order_no: 1, label_override: null },
      { id: "n2", item_type: "book", item_id: "b2", child_saga_id: null,
        x: 0, y: 0, level: "principal", order_no: null, label_override: null },
    ];
    const lookup: GraphLookup = {
      members: new Map([
        ["book:b1", { itemType: "book", itemId: "b1", title: "Uno", coverUrl: null, href: "/1",
          position: 1, role: null, status: null, groupSagaId: null, year: 1990 }],
        ["book:b2", { itemType: "book", itemId: "b2", title: "Nueva Primavera", coverUrl: null, href: "/2",
          position: null, role: "precuela", status: null, groupSagaId: null, year: 2004 }],
      ]),
      groupAccent: new Map([[null, "beige"]]),
      groupName: new Map([[null, null]]),
      childNames: new Map(),
      childCovers: new Map(),
      childCounts: new Map(),
    };

    const { nodes } = buildSagaGraph(raw, [], lookup);

    expect(nodes.find((n) => n.id === "n1")!.role).toBeNull();
    expect(nodes.find((n) => n.id === "n2")!.role).toBe("precuela");
  });

  it("deja role null en un nodo-saga (una subsaga no tiene rol narrativo)", () => {
    const raw: RawSagaNode[] = [
      { id: "s1", item_type: null, item_id: null, child_saga_id: "child",
        x: 0, y: 0, level: "principal", order_no: 1, label_override: null },
    ];
    const lookup: GraphLookup = {
      members: new Map(),
      groupAccent: new Map([["child", "beige"]]),
      groupName: new Map([["child", "Hija"]]),
      childNames: new Map([["child", "Hija"]]),
      childCovers: new Map(),
      childCounts: new Map(),
    };

    const { nodes } = buildSagaGraph(raw, [], lookup);

    expect(nodes[0].role).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/sagas/graph-data.test.ts`

Esperado: FAIL — `Property 'role' does not exist on type 'SagaGraphNode'`.

- [ ] **Step 3: Añadir el campo al tipo**

En `src/lib/sagas/graph-data.ts`, dentro de `export type SagaGraphNode`, añade tras `status: MemberStatus;`:

```ts
  /** Rol narrativo del ítem (issue #167). Siempre null en los nodos-saga: una
   *  subsaga no es una precuela, lo son sus obras. */
  role: SagaItemRole | null;
```

Y amplía el import de tipos de la cabecera:

```ts
import type { DetailMember, MemberStatus, SagaItemRole } from "./types";
```

- [ ] **Step 4: Poblar en las dos ramas**

En la rama de nodo-ítem (dentro de `if (raw.item_type && raw.item_id)`), tras `status: m.status,`:

```ts
        role: m.role,
```

En la rama de nodo-saga (dentro de `else if (raw.child_saga_id)`), tras `status: null,`:

```ts
        role: null,
```

- [ ] **Step 5: Ejecutar los tests**

Run: `npx vitest run src/lib/sagas/`

Esperado: PASS. Si otros tests fabrican `SagaGraphNode` literales, añádeles `role: null`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/graph-data.ts src/lib/sagas/graph-data.test.ts
git commit -m "feat(sagas): el rol llega al nodo del grafo (#167)"
```

---

### Task 4: Chip de rol e i18n

El componente compartido y sus textos, antes de tener consumidores. Aislado a propósito: lo usan las tareas 5 y 6, y así ambas parten del mismo vocabulario visual.

**Files:**
- Create: `src/components/saga/role-chip.tsx`
- Modify: `messages/es.json` (namespace `saga`)

**Interfaces:**
- Consumes: `SagaItemRole` (Task 1).
- Produces: `<RoleChip role={...} />`, componente async de servidor que renderiza `null` si `role` es `null`. Lo consumen `saga-info.tsx` (Task 5) y `reading-timeline.tsx` (Task 6).

- [ ] **Step 1: Añadir las claves i18n**

En `messages/es.json`, dentro del namespace `"saga"`, añade justo **después** de la línea `"orderNo": "Nº {n}",`:

```json
    "outOfMainOrder": "Fuera del orden principal",
    "outOfMainOrderHint": "Sin hueco fijo en el orden. Puedes leerlas cuando quieras.",
    "roleLabel": {
      "precuela": "Precuela",
      "spin_off": "Spin-off",
      "relato": "Relato",
      "paralela": "Paralela"
    },
```

**No borres todavía** `branchOptional` ni `bridgeHint`: siguen en uso hasta la Task 6.

- [ ] **Step 2: Escribir el chip**

Crea `src/components/saga/role-chip.tsx`. El vocabulario visual está calcado del badge de rama que ya existe en `reading-timeline.tsx:100` (`rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold`), para que el rol no introduzca un quinto estilo de etiqueta.

```tsx
import { getTranslations } from "next-intl/server";
import type { SagaItemRole } from "@/lib/sagas/types";

// Chip de rol narrativo (issue #167). Deliberadamente sin caso por defecto: un
// rol nuevo en BD que no tenga traducción debe verse raro en dev, no caer en
// un genérico que lo esconda.
//
// El estilo replica el badge de rama de reading-timeline.tsx:100 — mismo gold
// sobre gold/10 — para no inventar una quinta etiqueta visual en la ficha.
export async function RoleChip({ role }: { role: SagaItemRole | null }) {
  if (role === null) return null;
  const t = await getTranslations("saga");
  return (
    <span className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold">
      {t(`roleLabel.${role}`)}
    </span>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/saga/role-chip.tsx messages/es.json
git commit -m "feat(sagas): chip de rol narrativo y sus textos (#167)"
```

---

### Task 5: Sección "Fuera del orden principal" en la pestaña Info

El sitio que importa para el caso de referencia: es el único que sirve a una saga sin grafo.

**Files:**
- Modify: `src/components/saga/saga-info.tsx:7-9` (comentario), `:126-168` (grid)
- Test: e2e en la Task 8

**Interfaces:**
- Consumes: `DetailMember.role` (Task 2), `<RoleChip>` (Task 4).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Corregir el comentario de cabecera, que hoy miente**

En `src/components/saga/saga-info.tsx`, sustituye las líneas 7-9:

```tsx
// Pestaña Info (frames A/D): sinopsis + títulos agrupados por subsaga. La
// celda replica el icell del mockup: portada, badge de orden, estado ✓/◉,
// contorno punteado si es opcional (= sin position en fase 1, spec §2.3).
```

por:

```tsx
// Pestaña Info (frames A/D): sinopsis + títulos agrupados por subsaga. La
// celda replica el icell del mockup: portada, badge de orden, estado ✓/◉.
//
// Issue #167: dentro de cada grupo, los miembros SIN position se separan en su
// propia sección ("Fuera del orden principal") en vez de quedar sueltos al
// final con un contorno punteado que decía "opcional" sin que nadie lo hubiera
// dicho. El contorno se retiró: la sección ya comunica eso, y así el dorado
// discontinuo deja de significar dos cosas distintas en la app.
//
// Pertenencia a la sección la decide `position === null`; el chip lo decide
// `role !== null`. Son independientes: una obra sin número y sin rol va a la
// sección, sin chip (es curación pendiente y debe verse como tal).
```

- [ ] **Step 2: Extraer la celda a un sub-componente**

Todavía en `saga-info.tsx`, añade este componente **antes** de `export async function SagaInfo`. Es literalmente el `<li>` que hoy vive dentro del `.map`, con el contorno punteado retirado y el chip añadido:

```tsx
async function MemberCell({ m }: { m: DetailMember }) {
  const t = await getTranslations("saga");
  return (
    <li>
      <Link href={m.href} className="block">
        <div className="relative aspect-[2/3] overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover">
          {m.coverUrl ? (
            <Image src={m.coverUrl} alt={m.title} fill sizes="120px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-1.5 text-center text-[10px] text-muted-foreground">
              {m.title}
            </div>
          )}
          {m.position !== null && (
            <span className="absolute left-1 top-1 rounded bg-foreground/70 px-1 font-mono text-[8.5px] text-background">
              {m.position}
            </span>
          )}
          {m.status === "completed" && (
            <span
              aria-label={t("statusDone")}
              className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white"
            >
              ✓
            </span>
          )}
          {m.status === "in_progress" && (
            <span
              aria-label={t("statusReading")}
              className="absolute inset-0 grid place-items-center bg-foreground/40 text-base text-white"
            >
              ◉
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight">{m.title}</p>
        {m.role !== null && (
          <p className="mt-0.5">
            <RoleChip role={m.role} />
          </p>
        )}
      </Link>
    </li>
  );
}
```

Añade los imports que faltan en la cabecera del fichero:

```tsx
import type { DetailMember } from "@/lib/sagas/types";
import { RoleChip } from "./role-chip";
```

- [ ] **Step 3: Partir la grid en dos secciones**

Sustituye el `<ul>` completo (hoy `saga-info.tsx:125-169`, el que empieza por `<ul className="grid grid-cols-3 ...">`) por:

```tsx
                {(() => {
                  const numbered = group.members.filter((m) => m.position !== null);
                  const loose = group.members.filter((m) => m.position === null);
                  return (
                    <>
                      {numbered.length > 0 && (
                        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                          {numbered.map((m) => (
                            <MemberCell key={`${m.itemType}-${m.itemId}`} m={m} />
                          ))}
                        </ul>
                      )}
                      {loose.length > 0 && (
                        <div className={numbered.length > 0 ? "mt-4" : ""}>
                          <div className="mb-2 flex items-baseline gap-2">
                            <h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {t("outOfMainOrder")}
                            </h4>
                            <span className="text-[10px] text-muted-foreground">
                              {t("outOfMainOrderHint")}
                            </span>
                          </div>
                          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                            {loose.map((m) => (
                              <MemberCell key={`${m.itemType}-${m.itemId}`} m={m} />
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  );
                })()}
```

- [ ] **Step 4: Verificar en el navegador**

Run: `npx tsc --noEmit`

Esperado: sin errores.

Levanta el dev server **solo si no hay uno ya en el 3000** (`Get-NetTCPConnection -LocalPort 3000`), abre una saga con miembros sin `position` y comprueba tres cosas: la sección aparece con su cabecera, las portadas ya no llevan el contorno punteado, y una obra sin `role` sale en la sección **sin** chip.

- [ ] **Step 5: Commit**

```bash
git add src/components/saga/saga-info.tsx
git commit -m "feat(sagas): sección Fuera del orden principal en la pestaña Info (#167)"
```

---

### Task 6: Dejar de omitir en el Mapa y derogar el vocabulario inventado

Dos cambios que van juntos porque comparten el e2e que hay que actualizar.

**Files:**
- Modify: `src/components/saga/saga-map-tab.tsx:77-98`
- Modify: `src/components/saga/reading-timeline.tsx:29,100-102`
- Modify: `messages/es.json` (retirar `branchOptional` y `bridgeHint`)
- Modify: `e2e/sagas-v2-mapa.spec.ts:38,40`
- Test: `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Consumes: `SagaGraphNode.role` (Task 3), `<RoleChip>` (Task 4).
- Produces: nada.

- [ ] **Step 1: Escribir el test que fija el criterio**

`deriveTimeline` **no cambia de forma** — sigue emitiendo `edgeType`, que es un dato real y curado (una arista `requisito` significa "léelo antes", y eso no lo sustituye ningún rol). Lo que cambia es el render: `branchOptional` deja de pintarse. El test fija que el rol viaja intacto hasta la rama.

Añade a `src/lib/sagas/derive-timeline.test.ts`:

```ts
describe("rol narrativo en las ramas (#167)", () => {
  it("la rama conserva el role del nodo, y edgeType sigue siendo el de la arista", () => {
    const graph: SagaGraph = {
      nodes: [
        { id: "n1", kind: "item", x: 0, y: 0, level: "principal", orderNo: 1,
          label: "Uno", accent: "beige", status: null, role: null, coverUrl: null,
          covers: [], href: "/1", memberCount: null, groupSagaId: "g1", groupName: "G" },
        { id: "n2", kind: "item", x: 0, y: 0, level: "principal", orderNo: null,
          label: "Spin", accent: "beige", status: null, role: "spin_off", coverUrl: null,
          covers: [], href: "/2", memberCount: null, groupSagaId: "g1", groupName: "G" },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", type: "opcional", accent: "ambar" }],
    };

    const sections = deriveTimeline(graph);
    const entry = sections[0].rows[0];
    if (entry.kind !== "entry") throw new Error("se esperaba una entry");

    expect(entry.branches).toHaveLength(1);
    expect(entry.branches[0].node.role).toBe("spin_off");
    expect(entry.branches[0].edgeType).toBe("opcional");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/sagas/derive-timeline.test.ts`

Esperado: FAIL de TypeScript — a los literales `SagaGraphNode` de los tests existentes de ese fichero les falta `role`.

- [ ] **Step 3: Añadir `role: null` a los nodos de los tests existentes**

En `src/lib/sagas/derive-timeline.test.ts`, añade `role: null` a cada literal `SagaGraphNode` preexistente.

Run: `npx vitest run src/lib/sagas/derive-timeline.test.ts`

Esperado: PASS.

- [ ] **Step 4: El Mapa deja de omitir los no numerados**

En `src/components/saga/saga-map-tab.tsx`, en la lista de orden de lectura, sustituye:

```tsx
              {graph.nodes
                .filter((n) => n.kind === "item" && n.orderNo !== null)
                .map((n, i) => (
```

por:

```tsx
              {/* Issue #167: los nodos sin orderNo ya no se filtran. Antes
                  desaparecían de esta lista por completo — una precuela curada
                  simplemente no existía aquí. El índice impreso sigue saliendo
                  de la posición en la lista (no de orderNo), así que los sueltos
                  van al final numerados de corrido; el chip de rol es lo que
                  distingue "nº 15" de "precuela". */}
              {graph.nodes
                .filter((n) => n.kind === "item")
                .map((n, i) => (
```

Y dentro del `<li>`, tras el `<span>` del `label`, añade el chip:

```tsx
                        {n.role !== null && (
                          <span className="mt-0.5 block">
                            <RoleChip role={n.role} />
                          </span>
                        )}
```

Importa el chip en la cabecera:

```tsx
import { RoleChip } from "./role-chip";
```

- [ ] **Step 5: El timeline deja de inventarse las palabras**

En `src/components/saga/reading-timeline.tsx`, sustituye el badge de rama (líneas 100-102):

```tsx
                            <span className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold">
                              {b.edgeType === "requisito" ? t("branchRequisite") : t("branchOptional")}
                            </span>
```

por:

```tsx
                            {/* Issue #167: "requisito" se mantiene porque es un
                                dato REAL y curado (la arista dice "léelo antes").
                                "Spin-off · opcional" se derogó: se pintaba para
                                cualquier arista no-requisito, incluidas las
                                `principal`, así que llamaba spin-off a lo que no
                                lo era. Ahora, o hay rol curado, o no se dice nada. */}
                            {b.edgeType === "requisito" ? (
                              <span className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold">
                                {t("branchRequisite")}
                              </span>
                            ) : (
                              <RoleChip role={b.node.role} />
                            )}
```

Y sustituye la línea del puente (línea 29):

```tsx
              <span className="block text-[11px] leading-snug text-muted-foreground">{t("bridgeHint")}</span>
```

por:

```tsx
              {/* Issue #167: `bridgeHint` ("Nexo entre tramos · léelo en
                  cualquier punto") se derogó. Se disparaba por groupSagaId ===
                  null, que significa "miembro directo del universo, sin
                  subsaga" — no "léelo donde quieras". Ahora solo habla el rol
                  curado, si lo hay. */}
              <RoleChip role={section.rows[0].node.role} />
```

Importa el chip:

```tsx
import { RoleChip } from "./role-chip";
```

- [ ] **Step 6: Retirar las claves derogadas**

En `messages/es.json`, borra estas dos líneas del namespace `saga`:

```json
    "branchOptional": "Spin-off · opcional",
    "bridgeHint": "Nexo entre tramos · léelo en cualquier punto",
```

Deja `branchRequisite`: sigue en uso.

Run: `rg -n "branchOptional|bridgeHint" src e2e messages`

Esperado: cero resultados en `src/` y `messages/`. Si sale algo, es un consumidor que se te pasó.

- [ ] **Step 7: Actualizar el e2e que fija las cadenas viejas**

En `e2e/sagas-v2-mapa.spec.ts`, las líneas 38 y 40 afirman el vocabulario derogado:

```ts
  // El puente del nexo
  await expect(page.getByText("Nexo entre tramos", { exact: false })).toBeVisible();
  // La rama del spin-off (doble membresía) colgando del nodo Nº1
  await expect(page.getByText("Spin-off · opcional")).toBeVisible();
```

Sustitúyelas por:

```ts
  // Issue #167: "Nexo entre tramos" y "Spin-off · opcional" se derogaron — se
  // derivaban de heurísticas que etiquetaban mal (una arista `principal` salía
  // como spin-off). El puente y la rama siguen pintándose; lo que ya no se
  // afirma es un rol que nadie curó. El seed no asigna roles, así que aquí se
  // comprueba la ausencia: si vuelve a aparecer, alguien reintrodujo la
  // heurística.
  await expect(page.getByText("Nexo entre tramos")).toHaveCount(0);
  await expect(page.getByText("Spin-off · opcional")).toHaveCount(0);
```

- [ ] **Step 8: Ejecutar todo**

Run: `npx vitest run`

Esperado: PASS.

Run: `npx playwright test e2e/sagas-v2-mapa.spec.ts`

Esperado: PASS. Reutiliza el dev server que ya haya — no levantes otro.

- [ ] **Step 9: Commit**

```bash
git add src/components/saga/saga-map-tab.tsx src/components/saga/reading-timeline.tsx messages/es.json e2e/sagas-v2-mapa.spec.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): el Mapa deja de omitir sueltos y el timeline deja de inventar roles (#167)"
```

---

### Task 7: Que el rol no se borre solo

Las dos rutas de escritura que hoy perderían el campo en silencio. Va **antes** de la UI de curación a propósito: de nada sirve poder marcar un rol si el siguiente guardado lo borra.

**Files:**
- Modify: `src/lib/sagas/apply-membership-ops.ts:17-28,49-59,100-109`
- Modify: `src/lib/sagas/manage-saga-actions.ts:85-94`
- Test: `src/lib/sagas/apply-membership-ops.test.ts`

**Interfaces:**
- Consumes: `SagaItemRole` (Task 1).
- Produces: `TreeMembershipRow` y `MembershipPlan.insert` ganan `role: SagaItemRole | null`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/sagas/apply-membership-ops.test.ts`:

```ts
describe("rol narrativo en los movimientos de membresía (#167)", () => {
  it("arrastra el role al mover el ítem de subsaga", () => {
    const rows: TreeMembershipRow[] = [
      { saga_id: "origen", position: 3, role: "precuela", is_primary: true },
    ];

    const plan = planMembershipOps(
      { itemType: "book", itemId: "b1", targetSagaId: "destino" },
      rows,
      "destino",
      true,
    );

    // Mismo criterio que `position`: el delete+insert no puede perder el dato.
    expect(plan.insert).not.toBeNull();
    expect(plan.insert!.role).toBe("precuela");
    expect(plan.insert!.position).toBe(3);
  });

  it("deja role null si ninguna fila del árbol lo tenía", () => {
    const rows: TreeMembershipRow[] = [
      { saga_id: "origen", position: null, role: null, is_primary: false },
    ];

    const plan = planMembershipOps(
      { itemType: "book", itemId: "b1", targetSagaId: "destino" },
      rows,
      "destino",
      true,
    );

    expect(plan.insert!.role).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/sagas/apply-membership-ops.test.ts`

Esperado: FAIL — `role` no existe en `TreeMembershipRow`.

- [ ] **Step 3: Añadir `role` a los tipos y al plan**

En `src/lib/sagas/apply-membership-ops.ts`:

```ts
export type TreeMembershipRow = {
  saga_id: string;
  position: number | null;
  role: SagaItemRole | null;
  is_primary: boolean;
};

export type MembershipPlan = {
  deleteFrom: string[];
  insert: { saga_id: string; position: number | null; role: SagaItemRole | null; is_primary: boolean } | null;
  /** true = la fila YA existente en el destino debe pasar a is_primary=true (UPDATE, no INSERT). */
  promoteTarget: boolean;
};
```

Importa el tipo:

```ts
import type { SagaItemRole } from "./types";
```

En el `return` del final de `planMembershipOps`, sustituye el bloque `insert`:

```ts
  const carried = others.find((r) => r.position !== null);
  // El role se arrastra por separado del position: una fila puede tener rol sin
  // número (justo el caso de una precuela), así que buscarlo en la misma fila
  // que trae el position lo perdería.
  const carriedRole = others.find((r) => r.role !== null);
  return {
    deleteFrom,
    insert: {
      saga_id: targetTableSagaId,
      position: carried?.position ?? null,
      role: carriedRole?.role ?? null,
      is_primary: wasPrimaryInTree || !hasPrimaryAnywhere,
    },
    promoteTarget: false,
  };
```

- [ ] **Step 4: Añadir `role` al select y al insert reales**

En la misma función `applyMembershipOps`, el select del árbol:

```ts
    const { data: rows } = await supabase
      .from("saga_items")
      .select("saga_id, position, role, is_primary")
```

Y el insert:

```ts
      const { error } = await supabase.from("saga_items").insert({
        saga_id: plan.insert.saga_id,
        item_type: op.itemType,
        item_id: op.itemId,
        position: plan.insert.position,
        role: plan.insert.role,
        is_primary: plan.insert.is_primary,
      });
```

- [ ] **Step 5: Que el alta desde la ficha del libro no borre el rol**

`assignItemToSaga` hace `upsert` de la fila entera. Como el formulario de la ficha de obra **no** tiene campo de rol, un re-submit escribiría `role: undefined` y lo borraría.

En `src/lib/sagas/manage-saga-actions.ts`, sustituye el bloque del upsert (líneas 85-94) por:

```ts
  // El upsert reemplaza la fila entera, así que hay que releer el role y
  // reenviarlo: este formulario no lo edita, y sin esto un re-submit para
  // corregir la posición borraría el rol curado. Es el mismo modo de fallo que
  // documenta hydrate-route-draft.ts:11-22 con las notas de itinerario.
  const { data: existingItem } = await supabase
    .from("saga_items")
    .select("role")
    .eq("saga_id", sagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();

  const { error: insertError } = await supabase.from("saga_items").upsert(
    {
      saga_id: sagaId,
      item_type: itemType,
      item_id: itemId,
      position,
      role: existingItem?.role ?? null,
      is_primary: !primaryRow,
    },
    { onConflict: "saga_id,item_type,item_id" }
  );
  if (insertError) return { error: "generic" };
```

- [ ] **Step 6: Ejecutar los tests**

Run: `npx vitest run src/lib/sagas/`

Esperado: PASS. Añade `role: null` a los `TreeMembershipRow` literales de los tests preexistentes si hace falta.

Run: `npx tsc --noEmit`

Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/apply-membership-ops.ts src/lib/sagas/apply-membership-ops.test.ts src/lib/sagas/manage-saga-actions.ts
git commit -m "fix(sagas): el rol sobrevive a mover de subsaga y a re-guardar el alta (#167)"
```

---

### Task 8: Curación — lista de miembros en `/saga/[id]/editar`

La superficie que falta. Hoy la única forma de tocar la `position` de un miembro es reenviar el formulario de alta desde la ficha del libro, y los chips de membresía ni siquiera muestran la posición actual.

**Files:**
- Create: `src/lib/sagas/member-actions.ts`
- Create: `src/components/saga/saga-members-editor.tsx`
- Modify: `src/app/saga/[id]/editar/page.tsx`
- Modify: `messages/es.json` (namespace `saga`)

**Interfaces:**
- Consumes: `SagaItemRole` (Task 1).
- Produces: `updateSagaMember(sagaId, itemType, itemId, prevState, formData) => Promise<UpdateMemberState>`, donde `UpdateMemberState = { error?: "forbidden" | "notMember" | "badPosition" | "badRole" | "generic"; ok?: true }`.

- [ ] **Step 1: Escribir el server action**

Crea `src/lib/sagas/member-actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import { revalidateItemPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";
import type { SagaItemRole } from "./types";

export type UpdateMemberState = {
  error?: "forbidden" | "notMember" | "badPosition" | "badRole" | "generic";
  ok?: true;
};

const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];
const isRole = (v: string): v is SagaItemRole => (ROLES as string[]).includes(v);

// Edita posición y rol de UNA membresía (issue #167). A diferencia de
// assignItemToSaga, esto es solo-edición: no crea sagas ni membresías, así que
// una petición contra un ítem que no es miembro es un error, no un alta
// silenciosa (la higiene que pide #176).
//
// Doble gate a propósito: la RLS de saga_items ya exige collaborator+, y aun
// así se re-comprueba aquí. Los dos, nunca solo uno (route-actions.ts:42-46).
export async function updateSagaMember(
  sagaId: string,
  itemType: ItemType,
  itemId: string,
  _prevState: UpdateMemberState,
  formData: FormData,
): Promise<UpdateMemberState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { error: "forbidden" };
  }

  // Posición: vacío = sin hueco fijo (null explícito, no "no tocar"). A
  // diferencia de assignItemToSaga, una entrada inválida NO cae a null en
  // silencio: devuelve error. Ese silencio es la deuda que arrastra el
  // formulario de alta y no se replica aquí.
  const positionRaw = String(formData.get("position") ?? "").trim();
  let position: number | null = null;
  if (positionRaw) {
    const parsed = Number(positionRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) return { error: "badPosition" };
    position = parsed;
  }

  const roleRaw = String(formData.get("role") ?? "").trim();
  let role: SagaItemRole | null = null;
  if (roleRaw) {
    if (!isRole(roleRaw)) return { error: "badRole" };
    role = roleRaw;
  }

  // La membresía tiene que existir ya: este action no da de alta.
  const { data: existing } = await supabase
    .from("saga_items")
    .select("id")
    .eq("saga_id", sagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();
  if (!existing) return { error: "notMember" };

  const { error } = await supabase
    .from("saga_items")
    .update({ position, role })
    .eq("saga_id", sagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateSagaPage(sagaId);
  return { ok: true };
}
```

- [ ] **Step 2: Añadir los textos**

En `messages/es.json`, namespace `saga`, añade tras el bloque `"editErrors"`:

```json
    "membersTitle": "Miembros de la saga",
    "membersHint": "La posición deja el hueco fijo en el orden. El rol dice qué es la obra: una precuela puede no tener número.",
    "membersEmpty": "Esta saga aún no tiene miembros.",
    "memberPosition": "Posición",
    "memberPositionNone": "Sin hueco fijo",
    "memberRole": "Rol",
    "memberRoleNone": "Sin clasificar",
    "memberSave": "Guardar",
    "memberSaved": "Guardado",
    "memberErrors": {
      "forbidden": "Solo los colaboradores pueden editar miembros.",
      "notMember": "Esa obra ya no pertenece a esta saga.",
      "badPosition": "La posición tiene que ser un número entero mayor que 0, o estar vacía.",
      "badRole": "Ese rol no existe.",
      "generic": "No se pudo guardar. Inténtalo de nuevo."
    },
```

- [ ] **Step 3: Escribir el editor**

Crea `src/components/saga/saga-members-editor.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { updateSagaMember, type UpdateMemberState } from "@/lib/sagas/member-actions";
import type { SagaItemRole } from "@/lib/sagas/types";

export type EditableMember = {
  itemType: ItemType;
  itemId: string;
  title: string;
  position: number | null;
  role: SagaItemRole | null;
};

const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];

function MemberRow({ sagaId, member }: { sagaId: string; member: EditableMember }) {
  const t = useTranslations("saga");
  const [state, formAction, pending] = useActionState<UpdateMemberState, FormData>(
    updateSagaMember.bind(null, sagaId, member.itemType, member.itemId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border py-3">
      <p className="text-[13px] font-semibold">{member.title}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("memberPosition")}
          </span>
          <input
            name="position"
            type="number"
            min={1}
            defaultValue={member.position ?? ""}
            placeholder={t("memberPositionNone")}
            className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("memberRole")}
          </span>
          <select
            name="role"
            defaultValue={member.role ?? ""}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]"
          >
            <option value="">{t("memberRoleNone")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roleLabel.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          {t("memberSave")}
        </button>
        {state.ok && <span className="text-[12px] text-green">{t("memberSaved")}</span>}
      </div>
      {state.error && (
        <p className="text-[12px] text-red-600">{t(`memberErrors.${state.error}`)}</p>
      )}
    </form>
  );
}

// Curación de miembros (issue #167). Vive en la ficha de la saga y no en la del
// libro a propósito: el gesto real es "curo ESTA saga y veo sus obras", y esta
// pantalla no exige haber montado un grafo — que es justo la tesis de la issue.
export function SagaMembersEditor({
  sagaId,
  members,
}: {
  sagaId: string;
  members: EditableMember[];
}) {
  const t = useTranslations("saga");
  return (
    <section id="miembros" className="flex flex-col gap-1">
      <h2 className="font-serif text-lg font-semibold">{t("membersTitle")}</h2>
      <p className="text-[12px] leading-snug text-muted-foreground">{t("membersHint")}</p>
      {members.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("membersEmpty")}</p>
      ) : (
        <div className="mt-1">
          {members.map((m) => (
            <MemberRow key={`${m.itemType}-${m.itemId}`} sagaId={sagaId} member={m} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Montarlo en la página**

En `src/app/saga/[id]/editar/page.tsx`, tras la consulta del `parent`, añade la de miembros. Los títulos se resuelven con `getSagaDetail`, que ya los tiene resueltos y ya aplica el mismo criterio de membresía que el resto de la ficha — así esta pantalla no inventa una tercera forma de listar miembros:

```tsx
  // OJO con la firma: es getSagaDetail(supabase, id) — el cliente va PRIMERO y
  // no recibe userId — y devuelve `SagaDetail | null`. La saga ya se comprobó
  // con el notFound() de arriba, pero el tipo obliga a estrecharlo igual.
  const detail = await getSagaDetail(supabase, id);
  const editableMembers = (detail?.groups ?? [])
    .flatMap((g) => g.members)
    .map((m) => ({
      itemType: m.itemType,
      itemId: m.itemId,
      title: m.title,
      position: m.position,
      role: m.role,
    }));
```

Importa lo necesario:

```tsx
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { SagaMembersEditor } from "@/components/saga/saga-members-editor";
```

Y monta el componente tras `<SagaMetaEditor ... />`:

```tsx
      <SagaMembersEditor sagaId={saga.id} members={editableMembers} />
```

- [ ] **Step 5: Verificar en el navegador**

Run: `npx tsc --noEmit`

Esperado: sin errores.

Abre `/saga/<id>/editar` como colaborador y comprueba: la lista sale, marcar "Precuela" y guardar muestra "Guardado", y al volver a `/saga/<id>` la obra aparece en "Fuera del orden principal" con su chip. Prueba también una posición inválida (`0` o `abc`): debe salir el mensaje de error, **no** un guardado silencioso que borre el dato.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/member-actions.ts src/components/saga/saga-members-editor.tsx src/app/saga/[id]/editar/page.tsx messages/es.json
git commit -m "feat(sagas): curación de posición y rol por miembro (#167)"
```

---

### Task 9: E2E y sincronización documental

Cierra el ciclo: la prueba que fija el comportamiento de punta a punta y los cuatro documentos que AGENTS.md exige antes de dar nada por hecho.

**Files:**
- Create: `e2e/sagas-rol-narrativo.spec.ts`
- Modify: `docs/requirements/data-model.md` (§7 + fecha de cabecera)
- Modify: `docs/requirements/backlog.md` (sección Sagas)
- Modify: `docs/requirements/decisiones.md` (append al final)
- Modify: `supabase/schema-baseline.sql`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

- [ ] **Step 1: Escribir el e2e**

Cada spec de este repo es autónoma, sin helpers compartidos. Crea `e2e/sagas-rol-narrativo.spec.ts` siguiendo el patrón de `e2e/sagas-itinerarios.spec.ts` (cópiale el bloque de login y las constantes de seed).

```ts
import { test, expect } from "@playwright/test";

// Issue #167. Autónoma por convención del repo: sin helpers compartidos.
// Reutiliza el seed de sagas v2 en dev (mismos UUIDs que sagas-v2-mapa.spec.ts).
// Seed QA de dev, el mismo universo que usa e2e/sagas-v2-mapa.spec.ts:7.
const UNIVERSE_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";

test("una obra sin número aparece en «Fuera del orden principal» con su rol", async ({ page }) => {
  await page.goto(`/saga/${UNIVERSE_ID}`);

  const section = page.getByRole("heading", { name: "Fuera del orden principal" });
  await expect(section).toBeVisible();

  // El chip de rol se pinta solo si alguien lo curó.
  await expect(page.getByText("Precuela").first()).toBeVisible();
});

test("una obra sin número Y sin rol sale en la sección, pero sin chip", async ({ page }) => {
  await page.goto(`/saga/${UNIVERSE_ID}`);

  // Separa pertenencia (position === null) de decoración (role !== null): es
  // la distinción que más fácil se rompe al refactorizar la grid.
  const loose = page.locator("[data-testid='out-of-order'] li");
  await expect(loose.first()).toBeVisible();
});

test("el progreso del hero NO se mueve al marcar un rol", async ({ page }) => {
  // Red contra el #91: el rol es puramente semántico y no toca el denominador.
  // Reutiliza el testid que ya puso la spec de itinerarios como red del mismo
  // fallo. OJO: el hero imprime un PORCENTAJE ("33%" con el seed actual), no
  // "N de M" — ese otro número es el de la ruta (route-view.tsx:81) y
  // confundirlos es literalmente el #91.
  await page.goto(`/saga/${UNIVERSE_ID}`);
  const before = await page.getByTestId("saga-hero-progress").textContent();

  await page.goto(`/saga/${UNIVERSE_ID}/editar`);
  await page.locator("select[name='role']").first().selectOption("relato");
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await expect(page.getByText("Guardado").first()).toBeVisible();

  await page.goto(`/saga/${UNIVERSE_ID}`);
  await expect(page.getByTestId("saga-hero-progress")).toHaveText(before ?? "");
});
```

Añade los `data-testid` que el test necesita, porque hoy no existen:

- En `saga-info.tsx`, al `<div>` de la sección "Fuera del orden principal" (Task 5 / Step 3): `data-testid="out-of-order"`.
- En el hero, **no añadas nada**: el contador ya lleva `data-testid="saga-hero-progress"` (`src/components/saga/saga-hero.tsx:99`), puesto por la spec de itinerarios como red del #91 y consumido por `e2e/sagas-itinerarios.spec.ts:71`. Reutilízalo tal cual — renombrarlo rompe ese test, que hoy pasa. Y no cambies su marcado: imprime `{progress.pct}%` (`saga-hero.tsx:102`), el baseline del seed es `"33%"`, y el tercer test compara ese texto antes y después.

**Dos trampas del seed de dev**, ambas ya conocidas en `e2e/sagas-v2-mapa.spec.ts`:

1. `ReadingTimeline` solo se monta dentro de un `lg:hidden`, así que cualquier aserción sobre el timeline necesita `await page.setViewportSize({ width: 390, height: 844 })`. Los tests de arriba miran la pestaña Info y el hero, que no dependen del breakpoint — pero si añades uno de timeline, fija el viewport primero.
2. El seed **no asigna roles a nadie**: nace todo `null`. El primer y el segundo test necesitan que exista al menos una obra sin `position`; márcala desde `/saga/<id>/editar` como paso previo dentro del propio test, no a mano en la BD.

Y no siembres UUIDs nuevos a mano: es exactamente la deuda de #177 (cinco specs dependen de filas irreproducibles que en CI no existen). Si esta spec necesita datos propios, escribe `e2e/fixtures/seed-sagas.sql` idempotente en vez de añadir un sexto caso al problema.

- [ ] **Step 2: Ejecutar el e2e**

Run: `npx playwright test e2e/sagas-rol-narrativo.spec.ts`

Esperado: PASS con **3 tests ejecutados**. Reutiliza el dev server del 3000 (`reuseExistingServer`), no levantes otro.

Si sale "3 skipped" en vez de pasar, no lo interpretes como éxito: es la trampa del `.env.local` de la cabecera de este plan. Sin esas variables, `test.skip(!EMAIL || !PASSWORD, …)` se dispara y la suite sale verde sin haber probado nada.

- [ ] **Step 3: Aplicar a producción y anexar al baseline**

Aplica `20260723_saga_item_role.sql` en **prod** (`supabase-prod`, `apply_migration`).

Verifica contra los objetos reales, igual que en dev:

```sql
select a.attname, t.typname from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_type t on t.oid = a.atttypid
where c.relname = 'saga_items' and a.attname = 'role';
```

Anexa el contenido de la migración al final de `supabase/schema-baseline.sql`, **en el orden real de aplicación en prod**, no alfabético.

- [ ] **Step 4: Sincronizar la documentación**

`docs/requirements/data-model.md` §7: documenta `saga_items.role` (tipo, nullable, qué significa `null`, y que es ortogonal a `position`). Actualiza la fecha de verificación de la cabecera a 2026-07-22.

`docs/requirements/backlog.md`, sección Sagas: marca la casilla de rol narrativo.

`docs/requirements/decisiones.md`, **al final** (append-only, no reescribas entradas viejas):

```markdown
### Rol narrativo de un miembro de saga (#167)

`saga_items` gana `role` (`precuela | spin_off | relato | paralela`, nullable). Un solo eje, no los
dos que pedía la issue: `position` ya expresa la colocación (`null` = sin hueco fijo) y la colocación
fina la expresan los itinerarios, con más precisión de la que daría una columna. Poner ambos ejes
habría creado dos capas capaces de contradecirse, ganando la menos expresiva.

Sin backfill: `null` = "sin clasificar". Dar un valor a los `position IS NULL` existentes habría
escrito en la BD una decisión editorial que nadie tomó.

El rol es **puramente semántico**: no toca el denominador del progreso, que sigue viviendo solo en
`main-order.ts`. Cambiarlo es la familia de fallo del #91.

Se derogan `branchOptional` y `bridgeHint`: se derivaban de heurísticas que etiquetaban mal (una
arista `principal` salía como "Spin-off · opcional"; "Nexo" se disparaba por `groupSagaId === null`,
que significa "miembro directo del universo"). Ahora, o hay rol curado, o no se dice nada.
```

- [ ] **Step 5: Ejecutar la suite entera**

Run: `npx vitest run`

Esperado: PASS.

Run: `npx playwright test e2e/`

Esperado: PASS, y **cuenta los tests ejecutados**: si ves un número alto de "skipped", falta `.env.local` y no has probado nada (ver cabecera). Presta atención especial a `sagas-v2-mapa.spec.ts` (Task 6 cambió sus aserciones) y a `sagas-itinerarios.spec.ts` (consume `saga-hero-progress`, que este plan reutiliza sin tocar).

Run: `npx tsc --noEmit`

Esperado: exit 0, sin errores.

Run: `npx eslint`

Esperado: **ningún problema nuevo en los ficheros que toca este cambio**. La base NO está limpia: hoy salen 1 error y 7 warnings preexistentes, ninguno de sagas — el error es `src/app/(auth)/signup/signup-form.tsx:23` (`react-hooks/set-state-in-effect`). No lo arregles aquí; si no hay issue ya, ábrela (AGENTS.md). Para comparar sin ruido, acota: `npx eslint src/lib/sagas src/components/saga`.

- [ ] **Step 6: Commit**

```bash
git add e2e/sagas-rol-narrativo.spec.ts docs/requirements/ supabase/schema-baseline.sql src/components/saga/saga-info.tsx
git commit -m "test(sagas): e2e del rol narrativo y sincronización documental (#167)"
```

---

## Issues a abrir al cerrar

AGENTS.md: lo pendiente vive como issue o se pierde. Los cuatro puntos de "Deuda que se toca de refilón" de la spec, con su diagnóstico ya escrito:

1. **Asimetría del denominador en `main-order.ts`.** Con grafo, los nodos sin `order_no` se excluyen (`:91`); sin grafo, todos los miembros directos entran, incluidos los de `position === null` (`:100-108`). El comentario de cabecera (`:12-13`) afirma que los opcionales nunca cuentan — cierto solo con grafo. Consecuencia: hoy la única forma de que una obra opcional no penalice el progreso es montar un grafo, justo lo que #167 existía para evitar.
2. **Borrado por omisión en el alta de saga.** `manage-saga-actions.ts:38-43`: `"abc"`, `0` y `2.5` caen a `null` sin código de error. El usuario ve un guardado correcto que borró el dato. La Task 8 hace lo correcto en el action nuevo; el viejo sigue igual.
3. **Contradicción documental sobre itinerarios.** `backlog.md:51` dice que sus migraciones están «solo en dev»; `data-model.md:302`, posterior y canónico, dice que están en prod.
4. **`data-model.md` no lista las columnas de `saga_items`** en ningún punto (solo prosa en §7) y omite `saga_route_entries.note` pese a existir (`schema-baseline.sql:7398`).
