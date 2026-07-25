# Sagas: orden unificado — Fase 1 (modelo y progreso) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el progreso de una saga deje de depender del orden — cuenta las obras del subárbol que no estén marcadas `optional` — y que un curador pueda marcar colocación y opcionalidad desde el editor de miembros que ya existe.

**Architecture:** dos columnas nuevas en `saga_items` (`placement`, `optional`) y tres en `sagas` (`position_in_parent`, `placement_in_parent`, `optional_in_parent`), con un CHECK que ata colocación y hueco. Una función pura nueva, `countedKeys`, produce el denominador a partir de la **pertenencia** (no del orden) y la consumen los dos sitios que hoy llaman a `createMainOrder` para contar. `main-order.ts` se queda solo con la ordenación para pintar.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Supabase (Postgres remoto, también en dev) · Vitest · Playwright · next-intl.

**Spec:** `docs/superpowers/specs/2026-07-25-sagas-orden-unificado-design.md`

## Global Constraints

- **Node 22.23.1** (`.nvmrc`). El shell suele arrancar en Node 20 y **vitest se rompe**: correr `fnm use` antes de cualquier `npm test` / `npx vitest`.
- **Supabase es remoto también en dev.** No hay stack local. Latencia media ~240 ms por consulta.
- **Migraciones: dev primero (`supabase-dev`), prod después.** Se verifican contra los objetos reales (`pg_proc`, `pg_class`, `pg_constraint`, `pg_policies`), **nunca** contra `list_migrations` — "no aparece en el ledger" ≠ "no está en prod".
- **Un cambio no está hecho hasta que el doc canónico vuelve a ser cierto**: si se toca el esquema → `docs/requirements/data-model.md` y su fecha; si se cierra una feature → casilla en `docs/requirements/backlog.md`; si se decide algo de forma → entrada **al final** de `docs/requirements/decisiones.md` (append-only).
- **Todo lo que quede pendiente se abre como issue.** No vale dejarlo en el cuerpo de la PR ni en un `TODO`.
- Nombres de dominio en **español** (`placement`, `optional` son columnas SQL; los textos de UI van por `messages/es.json`).
- El predicado de completado es **uno solo** y vive en `src/lib/sagas/completion.ts` (`isMemberCompleted`). Nunca escribir `status === "completed"` a mano en un sitio nuevo: es lo que produjo el issue #91.

---

## File Structure

**Se crea:**
- `supabase/migrations/20260725_saga_placement.sql` — enum, columnas de `saga_items`, backfill, CHECK.
- `supabase/migrations/20260725_saga_placement_blocks.sql` — las tres columnas de `sagas`, backfill posicional, CHECKs.
- `src/lib/sagas/progress.ts` — `countedKeys`: el denominador, a partir de la pertenencia.
- `src/lib/sagas/progress.test.ts` — sus pruebas.

**Se modifica:**
- `src/lib/sagas/types.ts` — `SagaMember` gana `placement` y `optional`; `SagaChildRef` gana `optionalInParent`.
- `src/lib/sagas/get-saga-detail.ts:412-413` — el hero cuenta con `countedKeys`, no con `mainOrder`.
- `src/lib/sagas/build-library-saga-cards.ts:118,137` — la card cuenta con `countedKeys`; **sigue** usando el orden para el bloque «siguiente» y las portadas.
- `src/lib/sagas/get-followed-sagas.ts` — el `select` trae las columnas nuevas.
- `src/lib/sagas/main-order.ts` — comentario de cabecera: deja de ser el denominador.
- `src/lib/sagas/member-actions.ts` — el action guarda `placement` y `optional`.
- `src/components/saga/saga-members-editor.tsx` — la fila gana selector de colocación y casilla de opcional.
- `src/components/saga/saga-info.tsx` — sección «Cuando quieras», chip «opcional», aviso de sin clasificar.
- `messages/es.json` — las claves nuevas.
- `src/lib/supabase/database.types.ts` — regenerado.
- `docs/requirements/data-model.md`, `backlog.md`, `decisiones.md`.

**Prod queda sin tocar en toda la fase 1** (decisión del 2026-07-25): las migraciones se aplican solo a dev, y a prod al principio de la fase 2 junto con el arreglo de `assignItemToSaga` (#188). Ver Task 8, Step 4.

**Fuera de esta fase** (fases 2 y 3): `saga_placement_windows`, la pantalla de tres zonas, el RPC `save_saga_sequence`, la retirada del editor de grafo, `assignItemToSaga`, las vistas derivadas y la migración de los 4 grafos.

---

### Task 1: Columnas de colocación y opcionalidad en `saga_items`

**Files:**
- Create: `supabase/migrations/20260725_saga_placement.sql`
- Aplicar con: MCP `supabase-dev` → `apply_migration`

**Interfaces:**
- Produces: enum `public.saga_placement ('fijo','libre')`; `saga_items.placement` (nullable), `saga_items.optional` (`boolean not null default false`); constraint `saga_items_placement_position`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260725_saga_placement.sql`:

```sql
-- Colocación y opcionalidad de un miembro de saga (spec 2026-07-25).
--
-- DOS EJES ORTOGONALES, y ésta es la confusión que la feature deshace:
--   placement = DÓNDE se lee (fijo | libre | null = sin clasificar)
--   optional  = si NO cuenta en el progreso
-- Una obra puede ser libre y contar (Nueva Primavera), o fija y no contar
-- (un spin-off con hueco propio que no quieres exigir).
--
-- `role` (issue #167) es un TERCER eje ya existente: qué ES la obra.
create type public.saga_placement as enum ('fijo', 'libre');

alter table public.saga_items
  add column placement public.saga_placement,
  add column optional boolean not null default false;

-- Backfill honesto: tener número ES estar colocado. A diferencia de `role`
-- (issue #167, sin backfill porque el rol es genuinamente desconocido), la
-- colocación de una obra numerada no lo es.
--
-- Las filas SIN position quedan en null = "sin clasificar", que es deuda de
-- curación visible, no una tercera semántica: entre ellas está «Antes de que
-- los Cuelguen», que es el libro 2 de La Primera Ley y está sin numerar por
-- descuido, hoy indistinguible de «Esquirla del Amanecer», que es un relato
-- sin hueco a propósito.
update public.saga_items set placement = 'fijo' where position is not null;

-- El CHECK va DESPUÉS del backfill: antes, las 342 filas con position y
-- placement null lo violarían.
alter table public.saga_items
  add constraint saga_items_placement_position check (
    (placement = 'fijo'  and position is not null) or
    (placement = 'libre' and position is null)     or
    (placement is null   and position is null)
  );

comment on column public.saga_items.placement is
  'Dónde se lee: fijo (tiene hueco) | libre (en varios momentos) | null (sin clasificar). Ortogonal a optional.';
comment on column public.saga_items.optional is
  'true = NO cuenta en el denominador del progreso. Ortogonal a placement y a role.';
```

- [ ] **Step 2: Aplicar en dev**

Con el MCP `supabase-dev`, `apply_migration` con nombre `20260725_saga_placement` y el cuerpo de arriba.

- [ ] **Step 3: Verificar contra los objetos reales, no contra el ledger**

Con `supabase-dev` → `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_name='saga_items' and column_name in ('placement','optional')) as columnas,
  (select count(*) from pg_constraint where conname='saga_items_placement_position') as check_,
  (select count(*) from pg_type where typname='saga_placement') as enum_,
  (select count(*) from public.saga_items where placement='fijo') as fijos,
  (select count(*) from public.saga_items where placement is null) as sin_clasificar,
  (select count(*) from public.saga_items where optional) as opcionales;
```

Esperado: `columnas=2`, `check_=1`, `enum_=1`, `opcionales=0`, y `fijos + sin_clasificar` = el total de `saga_items` en dev.

- [ ] **Step 4: Comprobar que el CHECK muerde**

```sql
-- Debe FALLAR con violación de saga_items_placement_position.
-- OJO: Postgres NO admite LIMIT en un UPDATE (da error de sintaxis, que
-- pareceria un CHECK que no muerde). Y va envuelto en una transacción con
-- rollback: si algún dia el CHECK no estuviera, esto NO debe dejar datos
-- corruptos detras.
begin;
update public.saga_items set position = null
 where id = (select id from public.saga_items where placement = 'fijo' limit 1);
rollback;
```

Esperado: `ERROR: new row for relation "saga_items" violates check constraint "saga_items_placement_position"`. **Esto es la prueba de que #188 pasa de pérdida silenciosa a error duro** — el efecto está buscado, no es un accidente.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260725_saga_placement.sql
git commit -m "feat(db): colocación y opcionalidad de un miembro de saga"
```

---

### Task 2: Colocación del bloque-subsaga en `sagas`

**Files:**
- Create: `supabase/migrations/20260725_saga_placement_blocks.sql`

**Interfaces:**
- Consumes: enum `public.saga_placement` (Task 1).
- Produces: `sagas.position_in_parent` (int, nullable), `sagas.placement_in_parent` (`saga_placement`, nullable), `sagas.optional_in_parent` (`boolean not null default false`); constraints `sagas_placement_position` y `sagas_placement_needs_parent`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260725_saga_placement_blocks.sql`:

```sql
-- La colocación de una subsaga dentro de su padre, como dato explícito
-- (spec 2026-07-25).
--
-- Hasta hoy vivía en dos sitios y ninguno era propio: o en
-- saga_nodes.child_saga_id + order_no (SOLO si la saga tiene grafo: 4 de 75 en
-- prod), o DEDUCIDA del menor position de sus miembros (main-order.ts, rama sin
-- grafo). Al retirarse el editor de grafo (fase 2) esa colocación se quedaba
-- sin ningún sitio donde escribirse.
alter table public.sagas
  add column position_in_parent integer,
  add column placement_in_parent public.saga_placement,
  add column optional_in_parent boolean not null default false;

-- Backfill = escribir lo que la app YA deduce hoy, para que nadie vea cambiar
-- nada. La regla vigente (main-order.ts, rama sin grafo) es: primero TODOS los
-- miembros directos del padre por position, y DESPUÉS las hijas ordenadas por
-- el menor position de sus miembros, con el nombre como desempate.
--
-- De ahí el offset: si las hijas empezaran en 1 chocarían con los huecos de los
-- miembros directos del padre, y un empate de position significa TÁNDEM en el
-- modelo nuevo — escribiríamos una mentira.
--
-- Ese "lo que la app YA deduce" solo vale para un padre SIN grafo. Si el padre
-- tiene filas en saga_nodes, la app no mira min(position) para nada: el orden
-- sale de saga_nodes.order_no, y una hija sin nodo (o con order_no null) hoy no
-- está colocada en ningún sitio. Colocarla aquí con 'fijo' sería inventar una
-- curación que nadie deriva. Esas hijas se quedan sin clasificar (null/null) a
-- propósito: los 4 grafos de prod se migran uno a uno y a mano en la fase 3
-- (spec «Migración», §2).
with base as (
  select p.id as parent_id,
         coalesce((select max(i.position) from public.saga_items i where i.saga_id = p.id), 0) as offset_pos
  from public.sagas p
), ranked as (
  select s.id,
         b.offset_pos + row_number() over (
           partition by s.parent_saga_id
           order by coalesce(
                      (select min(i.position) from public.saga_items i where i.saga_id = s.id),
                      2147483647),
                    s.name
         ) as pos
  from public.sagas s
  join base b on b.parent_id = s.parent_saga_id
  where s.parent_saga_id is not null
    and not exists (
      select 1 from public.saga_nodes n where n.saga_id = s.parent_saga_id
    )
)
update public.sagas s
   set position_in_parent = r.pos,
       placement_in_parent = 'fijo'
  from ranked r
 where s.id = r.id;

alter table public.sagas
  add constraint sagas_placement_position check (
    (placement_in_parent = 'fijo'  and position_in_parent is not null) or
    (placement_in_parent = 'libre' and position_in_parent is null)     or
    (placement_in_parent is null   and position_in_parent is null)
  ),
  -- Una saga raíz no está colocada en ningún sitio: las tres columnas no
  -- pueden llevar valor. Sin esto, «sacar del universo» dejaría restos.
  add constraint sagas_placement_needs_parent check (
    parent_saga_id is not null or
    (position_in_parent is null and placement_in_parent is null and optional_in_parent = false)
  );

comment on column public.sagas.position_in_parent is
  'Hueco del bloque-subsaga en la secuencia de su padre. null si es raíz o no está colocada.';
comment on column public.sagas.optional_in_parent is
  'true = el bloque entero sale del denominador del progreso de su PADRE (no del suyo propio).';
```

- [ ] **Step 2: Aplicar en dev y verificar**

`apply_migration` con `supabase-dev`, y después:

```sql
select s.name, s.position_in_parent, s.placement_in_parent, p.name as padre
from public.sagas s join public.sagas p on p.id = s.parent_saga_id
order by p.name, s.position_in_parent;
```

Esperado: **toda** saga con padre **cuyo padre no tiene grafo** tiene `position_in_parent` no nulo y `placement_in_parent='fijo'`; dentro de un mismo padre los números son consecutivos y **no repiten**; y ninguno colisiona con el `position` de un miembro directo de ese padre. Toda saga con padre **con grafo** (filas en `saga_nodes`) tiene las dos columnas a `null`: ese padre se migra a mano en la fase 3.

- [ ] **Step 3: Comprobar que el CHECK de raíz muerde**

```sql
-- Debe FALLAR: una raíz no puede estar colocada. Mismas dos cautelas que en
-- la Task 1: sin LIMIT en el UPDATE (Postgres no lo admite) y con rollback.
begin;
update public.sagas set position_in_parent = 1, placement_in_parent = 'fijo'
 where id = (select id from public.sagas where parent_saga_id is null limit 1);
rollback;
```

Esperado: violación de `sagas_placement_needs_parent`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260725_saga_placement_blocks.sql
git commit -m "feat(db): colocación de un bloque-subsaga dentro de su padre"
```

---

### Task 3: Los tipos y las lecturas traen los campos nuevos

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (regenerado)
- Modify: `src/lib/sagas/types.ts`
- Modify: `src/lib/sagas/get-saga-detail.ts`
- Modify: `src/lib/sagas/get-followed-sagas.ts`
- Modify: `src/lib/sagas/build-library-saga-cards.ts` (solo los tipos `LibMembership` / `LibSaga`)

**Interfaces:**
- Consumes: las columnas de Tasks 1 y 2.
- Produces:
  - `SagaPlacement = "fijo" | "libre"` (en `types.ts`)
  - `SagaMember` gana `placement: SagaPlacement | null` y `optional: boolean`
  - `SagaChildRef` gana `optionalInParent: boolean` y `positionInParent: number | null`
  - `LibMembership` gana `optional: boolean`; `LibSaga` gana `optionalInParent: boolean`

- [ ] **Step 1: Regenerar los tipos de Supabase**

Usar el MCP `supabase-dev` → `generate_typescript_types` (no hace falta saber el project-id: el servidor MCP ya apunta al proyecto de dev) y volcar la salida **completa** a `src/lib/supabase/database.types.ts`, reemplazando el fichero.

Comprobar que el resultado contiene las columnas nuevas antes de seguir:

```bash
grep -n "placement\|optional" src/lib/supabase/database.types.ts | head
```

Esperado: aparecen `placement`, `optional` (en `saga_items`) y `position_in_parent`, `placement_in_parent`, `optional_in_parent` (en `sagas`).

- [ ] **Step 2: Extender los tipos de dominio**

En `src/lib/sagas/types.ts`, junto a `SagaItemRole`:

```ts
/** Dónde se lee un miembro. null = sin clasificar (deuda de curación).
 *  Espejo a mano de public.saga_placement, igual que SagaItemRole: si se añade
 *  un valor en BD, TypeScript NO se queja aquí. */
export type SagaPlacement = "fijo" | "libre";
```

En `SagaMember`, después de `role`:

```ts
  /** Dónde se lee. `fijo` ⇔ position !== null (lo garantiza el CHECK
   *  saga_items_placement_position). null = sin clasificar. */
  placement: SagaPlacement | null;
  /** true = NO cuenta en el denominador del progreso. Ortogonal a placement:
   *  una obra puede ser libre y contar, o fija y no contar. */
  optional: boolean;
```

En `SagaChildRef`:

```ts
  /** Colocación del bloque en su padre (sagas.position_in_parent). */
  positionInParent: number | null;
  /** true = el bloque entero sale del denominador del PADRE, no del suyo. */
  optionalInParent: boolean;
```

- [ ] **Step 3: Traer las columnas en las consultas**

En `src/lib/sagas/get-saga-detail.ts`, en el `select` de `saga_items` añadir `placement, optional`, y en el de `sagas` (descendientes) añadir `position_in_parent, optional_in_parent`. Mapear al construir cada `DetailMember` y cada `SagaChildRef`.

En `src/lib/sagas/get-followed-sagas.ts`, el `select` de `saga_items` añade `optional`, y el de `sagas` añade `optional_in_parent`; se propagan a `LibMembership.optional` y `LibSaga.optionalInParent`.

- [ ] **Step 4: Comprobar que compila y que no hay regresión**

```bash
fnm use && npx tsc --noEmit && npx vitest run src/lib/sagas
```

Esperado: 0 errores de tipos; **todas** las pruebas de `src/lib/sagas` en verde (aún no cambia ningún comportamiento).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/sagas/types.ts src/lib/sagas/get-saga-detail.ts src/lib/sagas/get-followed-sagas.ts src/lib/sagas/build-library-saga-cards.ts
git commit -m "feat(sagas): placement y optional viajan de la BD al miembro"
```

---

### Task 4: `countedKeys` — el denominador deja de mirar el orden

**Files:**
- Create: `src/lib/sagas/progress.ts`
- Test: `src/lib/sagas/progress.test.ts`

**Interfaces:**
- Produces:
  - `type ProgressSaga = { id: string; parentSagaId: string | null; optionalInParent: boolean }`
  - `type ProgressMembership = { sagaId: string; itemType: ItemType; itemId: string; optional: boolean }`
  - `function countedKeys(rootId: string, sagas: ProgressSaga[], memberships: ProgressMembership[]): string[]` — claves `item_type:item_id` deduplicadas que **cuentan**.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/sagas/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countedKeys, type ProgressMembership, type ProgressSaga } from "./progress";

const saga = (id: string, parentSagaId: string | null = null, optionalInParent = false): ProgressSaga => ({
  id,
  parentSagaId,
  optionalInParent,
});
const member = (sagaId: string, itemId: string, optional = false): ProgressMembership => ({
  sagaId,
  itemType: "book",
  itemId,
  optional,
});

describe("countedKeys", () => {
  it("cuenta los miembros del subárbol y deja fuera los marcados optional", () => {
    const sagas = [saga("root")];
    const members = [member("root", "a"), member("root", "b", true), member("root", "c")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a", "book:c"]);
  });

  it("un bloque optional saca a su subárbol del denominador del padre", () => {
    const sagas = [saga("root"), saga("hija", "root", true)];
    const members = [member("root", "a"), member("hija", "x"), member("hija", "y")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a"]);
  });

  it("pero ese mismo bloque, como raíz, sí cuenta los suyos", () => {
    const sagas = [saga("root"), saga("hija", "root", true)];
    const members = [member("root", "a"), member("hija", "x"), member("hija", "y")];
    expect(countedKeys("hija", sagas, members)).toEqual(["book:x", "book:y"]);
  });

  it("no depende del orden: sin position, con position repetida (tándem), da igual", () => {
    // El denominador cuenta OBRAS, no huecos: un tándem son dos obras que leer.
    const sagas = [saga("root")];
    const members = [member("root", "a"), member("root", "b")];
    expect(countedKeys("root", sagas, members)).toHaveLength(2);
  });

  it("deduplica la multi-membresía: la misma obra en dos sagas del árbol cuenta una vez", () => {
    const sagas = [saga("root"), saga("hija", "root")];
    const members = [member("root", "a"), member("hija", "a"), member("hija", "b")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a", "book:b"]);
  });

  it("lo sin clasificar cuenta: optional=false es el default", () => {
    const sagas = [saga("root")];
    const members = [member("root", "a")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a"]);
  });

  it("un ciclo saga→saga no cuelga ni duplica", () => {
    const a = { ...saga("a"), parentSagaId: "b" };
    const b = { ...saga("b"), parentSagaId: "a" };
    const members = [member("a", "x"), member("b", "y")];
    expect(countedKeys("a", [a, b], members).sort()).toEqual(["book:x", "book:y"]);
  });

  it("el caso Mundodisco: sin grafo y sin ningún position, cuenta las 26", () => {
    // La regresión que motiva la fase: hoy esta saga da 0/0 porque el
    // denominador salía del grafo y ningún nodo tenía order_no.
    const sagas = [
      saga("mundodisco"),
      saga("guardias", "mundodisco"),
      saga("muerte", "mundodisco"),
    ];
    const members = [
      ...Array.from({ length: 8 }, (_, i) => member("guardias", `g${i}`)),
      ...Array.from({ length: 18 }, (_, i) => member("muerte", `m${i}`)),
    ];
    expect(countedKeys("mundodisco", sagas, members)).toHaveLength(26);
  });
});
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

```bash
fnm use && npx vitest run src/lib/sagas/progress.test.ts
```

Esperado: FAIL — `Failed to resolve import "./progress"`.

- [ ] **Step 3: Implementar `countedKeys`**

Crear `src/lib/sagas/progress.ts`:

```ts
import type { ItemType } from "@/lib/catalog/types";

// El DENOMINADOR del progreso de una saga (spec 2026-07-25).
//
// Regla, entera: «las obras del subárbol que no estén marcadas optional,
// deduplicadas». Nada de esto mira el ORDEN — ni position, ni saga_nodes, ni
// itinerarios — y ahí está el cambio: hasta hoy el denominador ERA el orden
// (createMainOrder producía la lista y computeProgress contaba sobre ella), y
// por eso el número se rompía cada vez que se tocaba la curación: #91 (regla
// duplicada), #170 (nodos huérfanos), #185 (dos ramas que se contradicen) y el
// 0/0 de Mundodisco.
//
// Un bloque `optionalInParent` sale del denominador de su PADRE pero no del
// suyo: abrir la ficha de «Novelas secretas» y ver 0/4 es lo que un lector
// espera; que sus 4 obras penalicen el Cosmere, no.

export type ProgressSaga = { id: string; parentSagaId: string | null; optionalInParent: boolean };
export type ProgressMembership = { sagaId: string; itemType: ItemType; itemId: string; optional: boolean };

export const itemKey = (t: ItemType, i: string) => `${t}:${i}`;

// Mismo cinturón anti-ciclos que createMainOrder (el trigger de BD ya los
// impide; esto protege de datos heredados).
const MAX_DEPTH = 4;

export function countedKeys(
  rootId: string,
  sagas: ProgressSaga[],
  memberships: ProgressMembership[],
): string[] {
  const childrenByParent = new Map<string, ProgressSaga[]>();
  for (const s of sagas) {
    if (s.parentSagaId === null) continue;
    const list = childrenByParent.get(s.parentSagaId) ?? [];
    list.push(s);
    childrenByParent.set(s.parentSagaId, list);
  }
  const membersBySaga = new Map<string, ProgressMembership[]>();
  for (const m of memberships) {
    const list = membersBySaga.get(m.sagaId) ?? [];
    list.push(m);
    membersBySaga.set(m.sagaId, list);
  }

  const out: string[] = [];
  const visited = new Set<string>();

  function walk(sagaId: string, depth: number) {
    if (depth > MAX_DEPTH || visited.has(sagaId)) return;
    visited.add(sagaId);
    for (const m of membersBySaga.get(sagaId) ?? []) {
      if (!m.optional) out.push(itemKey(m.itemType, m.itemId));
    }
    for (const c of childrenByParent.get(sagaId) ?? []) {
      // La opcionalidad del bloque se evalúa AL DESCENDER desde el padre, así
      // que la raíz nunca se excluye a sí misma.
      if (!c.optionalInParent) walk(c.id, depth + 1);
    }
  }

  walk(rootId, 0);
  return [...new Set(out)];
}
```

- [ ] **Step 4: Correr las pruebas y verlas pasar**

```bash
fnm use && npx vitest run src/lib/sagas/progress.test.ts
```

Esperado: PASS, 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/progress.ts src/lib/sagas/progress.test.ts
git commit -m "feat(sagas): el denominador del progreso sale de la pertenencia, no del orden"
```

---

### Task 5: Enganchar el hero y las cards de Mi Biblioteca

**Files:**
- Modify: `src/lib/sagas/get-saga-detail.ts:412-413`
- Modify: `src/lib/sagas/build-library-saga-cards.ts:118,137`
- Modify: `src/lib/sagas/build-library-saga-cards.test.ts`
- Modify: `src/lib/sagas/main-order.ts` (solo comentarios)

**Interfaces:**
- Consumes: `countedKeys` (Task 4); `SagaChildRef.optionalInParent` y `SagaMember.optional` (Task 3).
- Produces: sin API nueva. `computeProgress(groups, order)` **no cambia de firma**: recibe las claves de `countedKeys` donde antes recibía las de `mainOrder`.

- [ ] **Step 1: Escribir la prueba que falla, en las cards**

`buildLibrarySagaCards` recibe **argumentos posicionales**, no un objeto:
`(followedIds, sagas, memberships, nodes, items, entries, ratings, creators, routeChoices = [])`.

Primero, ampliar los dos helpers que el fichero de test ya tiene en cabecera, con los campos nuevos por defecto para no tocar ninguna prueba existente:

```ts
const saga = (
  id: string,
  name: string,
  parent: string | null = null,
  accent: string | null = null,
  optionalInParent = false,
): LibSaga => ({ id, parentSagaId: parent, name, accentColor: accent, optionalInParent });

const mem = (
  sagaId: string,
  itemId: string,
  position: number | null,
  optional = false,
): LibMembership => ({ sagaId, itemType: "book", itemId, position, optional });
```

Y añadir las dos pruebas:

```ts
it("una saga sin grafo y sin ningún position cuenta todos sus miembros (caso Mundodisco)", () => {
  // Regresión de la fase: con el denominador viejo, una saga cuyos nodos no
  // tenían order_no daba 0/0 y el usuario no veía avance ninguno.
  const cards = buildLibrarySagaCards(
    ["root"],
    [saga("root", "Mundodisco"), saga("hija", "Guardias", "root")],
    [mem("hija", "a", null), mem("hija", "b", null)],
    [],
    [item("a", "A"), item("b", "B")],
    [entry("a", "completed")],
    [],
    [],
  );
  expect(cards[0].progress).toMatchObject({ completed: 1, total: 2 });
});

it("un bloque optional no penaliza el avance del padre", () => {
  const cards = buildLibrarySagaCards(
    ["root"],
    [saga("root", "Cosmere"), saga("secretas", "Novelas secretas", "root", null, true)],
    [mem("root", "a", 1), mem("secretas", "s1", 1)],
    [],
    [item("a", "A"), item("s1", "S1")],
    [],
    [],
    [],
  );
  expect(cards[0].progress.total).toBe(1);
});
```

- [ ] **Step 2: Correr y ver fallar**

```bash
fnm use && npx vitest run src/lib/sagas/build-library-saga-cards.test.ts
```

Esperado: FAIL — el segundo caso da `total: 2` (el bloque optional aún cuenta) y el primero puede fallar por tipos (`optional`/`optionalInParent` no existen aún en las entradas del test).

- [ ] **Step 3: Cambiar el denominador en las cards**

En `src/lib/sagas/build-library-saga-cards.ts`:

```ts
import { countedKeys } from "./progress";
```

`mainOrder` **se queda** (lo necesitan las portadas del abanico y el bloque «siguiente»: son cosas de orden, no de cuenta). Lo que cambia es de dónde sale el denominador, en el punto donde hoy se hace `const order = mainOrder(followedId)`:

```ts
    const order = mainOrder(followedId);              // orden: portadas y «siguiente»
    const counted = countedKeys(followedId, sagas, memberships); // denominador
```

…y el cálculo de `progress` pasa a consumir `counted` en vez de `order`. El bloque «siguiente» y las portadas siguen leyendo `order`.

- [ ] **Step 4: Cambiar el denominador en el hero**

En `src/lib/sagas/get-saga-detail.ts`, sustituir la línea 413:

```ts
  const mainOrder = createMainOrder(orderSagas, orderMemberships, orderNodes, (k) => meta.get(k)?.title ?? "");
  // El denominador ya no es el orden (spec 2026-07-25): countedKeys cuenta la
  // PERTENENCIA. computeProgress no cambia de firma — recibe las claves que
  // cuentan donde antes recibía las del orden principal.
  const progress = computeProgress(groups, countedKeys(id, progressSagas, progressMemberships));
```

Donde `progressSagas` / `progressMemberships` se construyen junto a `orderSagas` / `orderMemberships` (mismos datos ya en memoria, sin viaje extra): `progressSagas` mapea cada descendiente a `{ id, parentSagaId, optionalInParent }` e incluye la raíz; `progressMemberships` mapea cada membresía a `{ sagaId, itemType, itemId, optional }`.

- [ ] **Step 5: Correr todas las pruebas**

```bash
fnm use && npx vitest run src/lib/sagas && npx tsc --noEmit
```

Esperado: todo en verde, incluidas las dos nuevas.

- [ ] **Step 6: Quitar la mentira del comentario de `main-order.ts`**

La cabecera de `src/lib/sagas/main-order.ts` afirma que de ahí sale el denominador y que «los opcionales no penalizan». Lo primero deja de ser cierto en este commit; lo segundo era **falso en la rama sin grafo** desde siempre (issue #185). Sustituir el primer párrafo por:

```ts
// Orden principal de una saga: la SECUENCIA con la que se pinta (columna del
// timeline, expansión de bloques en un itinerario, portadas y «siguiente» de
// las cards). NO es el denominador del progreso desde el 2026-07-25: eso vive
// en ./progress.ts (countedKeys) y sale de la pertenencia, no del orden.
//
// OJO con la asimetría del issue #185, que sigue viva AQUÍ aunque ya no afecte
// a ningún número: con grafo, un nodo sin order_no no entra en la secuencia;
// sin grafo, entran todos los miembros. Muere en la fase 3, cuando se retire
// saga_nodes.
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/get-saga-detail.ts src/lib/sagas/build-library-saga-cards.ts src/lib/sagas/build-library-saga-cards.test.ts src/lib/sagas/main-order.ts
git commit -m "feat(sagas): hero y cards cuentan la pertenencia; Mundodisco deja de dar 0/0"
```

---

### Task 6: Curar colocación y opcionalidad desde el editor de miembros

**Files:**
- Modify: `src/lib/sagas/member-actions.ts`
- Modify: `src/components/saga/saga-members-editor.tsx`
- Modify: `src/app/saga/[id]/editar/page.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `SagaPlacement` (Task 3).
- Produces: `UpdateMemberState.saved` pasa a ser `{ position: number | null; role: SagaItemRole | null; placement: SagaPlacement | null; optional: boolean }`; `EditableMember` gana `placement` y `optional`; nuevo error `"badPlacement"`.

- [ ] **Step 1: Ampliar el contrato del server action**

En `src/lib/sagas/member-actions.ts`:

```ts
export type UpdateMemberState = {
  error?: "forbidden" | "notMember" | "badPosition" | "badRole" | "badPlacement" | "generic";
  ok?: true;
  saved?: {
    position: number | null;
    role: SagaItemRole | null;
    placement: SagaPlacement | null;
    optional: boolean;
  };
};
```

Y en el cuerpo, tras leer `position` y `role`, leer y **validar la combinación** antes de escribir:

```ts
  const placementRaw = String(formData.get("placement") ?? "").trim();
  const placement: SagaPlacement | null =
    placementRaw === "fijo" ? "fijo" : placementRaw === "libre" ? "libre" : null;
  const optional = formData.get("optional") === "on";

  // El mismo invariante que el CHECK saga_items_placement_position, replicado
  // aquí para dar un error de dominio en vez de un 23514 crudo del driver.
  const consistent =
    (placement === "fijo" && position !== null) ||
    (placement !== "fijo" && position === null);
  if (!consistent) return { error: "badPlacement" };
```

El `update` pasa a escribir `{ position, role, placement, optional }`, y el `saved` que devuelve incluye los cuatro.

- [ ] **Step 2: Ampliar la fila del editor**

En `src/components/saga/saga-members-editor.tsx`, `EditableMember` gana:

```ts
  placement: SagaPlacement | null;
  optional: boolean;
```

`current` pasa a derivar los cuatro campos —**imprescindible**: el remount por `key` que arregló el reset de React 19 tiene que cubrir también los campos nuevos, o el segundo «Guardar» reenvía un valor obsoleto:

```ts
  const current = state.saved ?? {
    position: member.position,
    role: member.role,
    placement: member.placement,
    optional: member.optional,
  };
```

Y dos controles nuevos en el formulario, con la misma forma que los existentes:

```tsx
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("memberPlacement")}
          </span>
          <select
            key={`placement-${current.placement ?? ""}`}
            name="placement"
            defaultValue={current.placement ?? ""}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]"
          >
            <option value="">{t("memberPlacementNone")}</option>
            <option value="fijo">{t("memberPlacementFixed")}</option>
            <option value="libre">{t("memberPlacementFree")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            key={`optional-${current.optional}`}
            type="checkbox"
            name="optional"
            defaultChecked={current.optional}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-[12px] text-muted-foreground">{t("memberOptional")}</span>
        </label>
```

En `src/app/saga/[id]/editar/page.tsx`, el mapeo a `editableMembers` añade `placement: m.placement` y `optional: m.optional`.

- [ ] **Step 3: Añadir las claves de i18n**

En `messages/es.json`, dentro de `saga`:

```json
"memberPlacement": "Colocación",
"memberPlacementNone": "Sin clasificar",
"memberPlacementFixed": "Hueco fijo",
"memberPlacementFree": "Se lee cuando quieras",
"memberOptional": "No cuenta en el progreso",
"errorBadPlacement": "«Hueco fijo» necesita un número, y «se lee cuando quieras» no lo admite."
```

Y mapear `badPlacement` al texto en el mismo sitio donde el componente ya mapea `badPosition` / `badRole`.

- [ ] **Step 4: Verificar en el navegador (automatizado)**

Según `docs/TESTING.md` (canónico desde 2026-07-15) la verificación de UI por defecto es **automatizada**: la conduce un agente con el navegador (`qa-verifier` o equivalente), no una persona a mano. Cuenta de desarrollo persistente con onboarding hecho: `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` en `.env.local`.

Un solo `npm run dev` en el puerto 3000 — si está ocupado, **matar el proceso viejo**, no arrancar un segundo. Sobre una saga de dev, con rol collaborator, comprobar:

1. Marcar un miembro como «Se lee cuando quieras» con el número vacío → guarda, y el aviso de error no aparece.
2. Marcar «Hueco fijo» con el número vacío → aparece el texto de `errorBadPlacement` y **no** se escribe.
3. Marcar «No cuenta en el progreso» en un miembro → el número del hero baja en 1 el denominador al recargar.
4. Guardar dos veces seguidas sin tocar nada → el valor no se revierte (la trampa del reset de React 19 que arregló #189).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/member-actions.ts src/components/saga/saga-members-editor.tsx "src/app/saga/[id]/editar/page.tsx" messages/es.json
git commit -m "feat(sagas): curar colocación y opcionalidad por miembro"
```

---

### Task 7: La ficha dice lo que el modelo ya sabe

**Files:**
- Modify: `src/components/saga/saga-info.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `DetailMember.placement` / `.optional` (Task 3), `MemberGroup` (existente), `canConfigure` (prop ya existente).

- [ ] **Step 1: Extraer la celda de portada, que ahora se usa en dos sitios**

La celda de la grid (portada + badge de posición + estado ✓/◉) está hoy escrita en línea dentro del `groups.map`. La sección nueva necesita exactamente la misma celda, así que **primero se extrae** — copiar y pegar el bloque sería la segunda fuente de verdad de siempre.

En `src/components/saga/saga-info.tsx`, arriba del componente:

```tsx
// La celda de portada de la grid. Extraída porque desde el 2026-07-25 se pinta
// en dos sitios: la grid de cada grupo y la sección «Cuando quieras».
function MemberCell({
  m,
  labels,
}: {
  m: DetailMember;
  labels: { done: string; reading: string; optional: string };
}) {
  return (
    <Link href={m.href} className="block">
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover ${
          m.placement === null ? "outline-dashed outline-1 -outline-offset-1 outline-gold" : ""
        }`}
      >
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
        {m.optional && (
          <span className="absolute bottom-1 left-1 rounded bg-foreground/70 px-1 font-mono text-[8px] uppercase text-background">
            {labels.optional}
          </span>
        )}
        {m.status === "completed" && (
          <span
            aria-label={labels.done}
            className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white"
          >
            ✓
          </span>
        )}
        {m.status === "in_progress" && (
          <span
            aria-label={labels.reading}
            className="absolute inset-0 grid place-items-center bg-foreground/40 text-base text-white"
          >
            ◉
          </span>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight">{m.title}</p>
    </Link>
  );
}
```

Ojo al cambio de criterio del contorno punteado: antes era `m.position === null`, ahora es `m.placement === null`. Es el arreglo de fondo — el punteado dorado significaba «sin clasificar» pero se pintaba también sobre lo que a partir de ahora es un `libre` declarado, que no es deuda de nada.

La grid de cada grupo pasa a usarlo, filtrando los `libre` para no pintarlos dos veces:

```tsx
                  {group.members
                    .filter((m) => m.placement !== "libre")
                    .map((m) => (
                      <li key={`${m.itemType}-${m.itemId}`}>
                        <MemberCell m={m} labels={cellLabels} />
                      </li>
                    ))}
```

- [ ] **Step 1b: La sección «Cuando quieras»**

Antes del `return`:

```tsx
  const cellLabels = { done: t("statusDone"), reading: t("statusReading"), optional: t("optionalChip") };
  const freeMembers = groups.flatMap((g) => g.members.filter((m) => m.placement === "libre"));
```

Y tras la sección de títulos:

```tsx
      {/* Los `libre` salen de la columna del orden y viven aquí: su «dónde» no
          es un hueco. Ojo, esto NO es lo mismo que `optional` — un libre puede
          contar perfectamente en el progreso (spec 2026-07-25, «Dos ejes
          ortogonales»). */}
      {freeMembers.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("freeSection")}
          </h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
            {freeMembers.map((m) => (
              <li key={`${m.itemType}-${m.itemId}`}>
                <MemberCell m={m} labels={cellLabels} />
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 2: Aviso de deuda de curación, solo para collaborator+**

*(El chip «opcional» ya va dentro de `MemberCell`, en el Step 1: se pinta en los dos sitios sin escribirlo dos veces.)*

Junto al infonote de grafo que ya existe:

```tsx
      {canConfigure && unclassified > 0 && (
        <aside className="flex items-start gap-2.5 rounded-xl border border-border px-3.5 py-3">
          <span className="text-[15px] text-muted-foreground">◇</span>
          <p className="text-xs leading-relaxed text-foreground">
            {t("unclassifiedNotice", { count: unclassified })}{" "}
            <Link href={`/saga/${sagaId}/editar`} className="font-semibold underline">
              {t("unclassifiedCta")}
            </Link>
          </p>
        </aside>
      )}
```

Con `const unclassified = groups.flatMap((g) => g.members).filter((m) => m.placement === null).length;`

- [ ] **Step 3: Claves de i18n**

```json
"freeSection": "Cuando quieras",
"optionalChip": "opcional",
"unclassifiedNotice": "{count, plural, one {# obra sin clasificar} other {# obras sin clasificar}}: no tienen hueco ni están marcadas como libres.",
"unclassifiedCta": "Clasificarlas"
```

- [ ] **Step 4: Verificar en el navegador (automatizado)**

Mismo criterio que la Task 6: lo conduce un agente con el navegador, no una persona (`docs/TESTING.md`). Reutilizando el `npm run dev` que ya haya, sobre la saga de dev donde se marcó un `libre` en la Task 6:

1. La obra `libre` aparece **una sola vez**, en «Cuando quieras», y no en su grupo.
2. Una obra `optional` lleva el chip.
3. El aviso de sin clasificar aparece con sesión collaborator y **no** aparece sin ella.

- [ ] **Step 5: Commit**

```bash
git add src/components/saga/saga-info.tsx messages/es.json
git commit -m "feat(sagas): la ficha separa lo libre, marca lo opcional y avisa de lo sin clasificar"
```

---

### Task 8: Sincronizar la doc canónica y aplicar a prod

**Files:**
- Modify: `docs/requirements/data-model.md` (§7)
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md` (append al final)

- [ ] **Step 1: `data-model.md` §7**

Añadir §7.3 con las columnas nuevas, el CHECK, los dos ejes ortogonales y el backfill; y **corregir la regla de cómputo del progreso** de §7 (hoy dice que el denominador es el orden principal — deja de ser cierto). La cabecera de frescura **no** pasa a «verificado contra prod»: prod no se toca en esta fase. Dejar constancia explícita de que las dos migraciones están **solo en dev** y de por qué (Step 4).

- [ ] **Step 2: `decisiones.md`**

Append al final, sin reescribir nada anterior:

```markdown
| 2026-07-25 | **El progreso de una saga deja de depender del orden**: el denominador son las obras del subárbol no marcadas `optional` (`src/lib/sagas/progress.ts`), y `main-order.ts` se queda solo con la ordenación para pintar. Colocación (`placement`) y opcionalidad (`optional`) son **dos ejes ortogonales**, no uno | Acoplar el denominador a la curación produjo cuatro fallos con una sola causa: #91 (regla duplicada), #170 (nodos huérfanos en el denominador), #185 (dos ramas que se contradicen; la documentada aplicaba a 1 saga de 70) y el 0/0 de Mundodisco (26 nodos sin `order_no` → orden vacío → hero sin progreso y timeline vacío). Con el denominador en la pertenencia, esa familia entera deja de ser expresable. Los dos ejes se separan porque «se lee en cualquier momento» y «no cuenta» son hechos distintos: *Nueva Primavera* es libre y cuenta; un spin-off con hueco puede no contar. Spec: `docs/superpowers/specs/2026-07-25-sagas-orden-unificado-design.md` |
```

- [ ] **Step 2b: `decisiones.md` — la segunda decisión, tomada durante la ejecución**

Append también esta, que se decidió en la review de la Task 5 y hoy solo vive en un comentario de código:

```markdown
| 2026-07-26 | **El bloque «siguiente» de la card de Mi Biblioteca propone solo obras que CUENTAN**: recorre el orden curado pero se salta las marcadas `optional` | Proponer una obra que no mueve la barra es el descuadre «el número miente» (#91, #185) reentrando por el lado de la secuencia: el lector lee exactamente lo que la card le dijo y su avance no cambia. Lo opcional no se exige, así que tampoco se empuja — se descubre en la ficha de la saga. El bloque «leyendo ahora» SÍ puede mostrar una obra opcional: eso reporta un hecho (lo que tienes abierto), no propone un siguiente paso |
```

- [ ] **Step 2c: `decisiones.md` — la tercera decisión, también tomada durante la ejecución**

```markdown
| 2026-07-26 | **Una saga cuyo contenido es todo `optional` tiene estado propio en la card de Mi Biblioteca** (`{kind:"allOptional"}`), en vez de reutilizar `empty` | Al pasar el denominador de `order.length` a `counted.length`, el guard `total === 0` dejó de significar «esta saga no tiene obras» y pasó a capturar también «tiene obras, pero ninguna cuenta». Con `empty` la card quedaba con portadas visibles, 0/0 y ningún bloque accionable; con `completed` habría dicho «completada» sin nada completado; y proponer un «siguiente» opcional reintroduce el descuadre que se acababa de quitar. Las tres alternativas mienten, cada una en una dirección distinta. El spec ya prevé el caso en «Riesgos conocidos» (un curador puede marcar media saga como opcional y vaciar el denominador; se asume sin límite técnico). La discriminación vive en el constructor puro, no en la vista, porque re-derivarla en la vista es justo el patrón que produjo tres defectos seguidos en ese mismo `if/else` |
```

- [ ] **Step 3: `backlog.md`**

Marcar la fase 1 en la sección Sagas, enlazando al spec, y anotar que las fases 2 y 3 siguen abiertas.

- [ ] **Step 4: NO aplicar a prod — dejarlo escrito**

**Decisión del 2026-07-25: las dos migraciones se quedan solo en dev durante toda la fase 1.**

El motivo no es prudencia genérica: el CHECK `saga_items_placement_position` **rompe `assignItemToSaga`** (el formulario «Saga» de la ficha) en cuanto alguien reenvía una posición vacía sobre una fila `fijo` — y el arreglo de ese formulario vive en la fase 2. Aplicarlo a prod antes dejaría una regresión real en producción a cambio de nada, porque en prod aún no hay ninguna UI que escriba `placement` ni `optional`.

Se aplican a prod **al principio de la fase 2**, junto con el arreglo de `assignItemToSaga` y en el orden que la fase 2 fije. Anotarlo en `data-model.md` con esas palabras: *«aplicadas en dev el 2026-07-XX; prod pendiente, deliberadamente, hasta la fase 2 (#188)»* — el mismo formato que ya usa §7.1 para el caso de #169, donde el orden de despliegue también importaba.

- [ ] **Step 5: Abrir las issues de lo que queda**

Una issue por cada cosa que esta fase deja viva y no cubre — sin excepciones, que son el backlog operativo:

1. **`assignItemToSaga` viola el CHECK nuevo** al reenviar posición vacía (es #188; añadir un comentario con el diagnóstico nuevo y que ahora falla duro en vez de perder el dato en silencio).
2. **La asimetría de #185 sigue viva en la ORDENACIÓN** aunque ya no afecte a ningún número (comentar en #185 y reetiquetarla, no cerrarla).

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs(sagas): el progreso desacoplado en data-model, decisiones y backlog"
```

---

## Verificación de la fase

Antes de dar la fase por hecha, con evidencia y no de palabra:

```bash
fnm use && npx vitest run && npx tsc --noEmit && npm run lint
```

> `npm run lint` falla hoy por un error **preexistente** en `signup-form.tsx` (issue #163). Comprobar que la salida no trae ningún error nuevo de los ficheros de esta fase; no intentar arreglar el #163 aquí.

Y en el navegador, sobre dev:

| Comprobación | Esperado |
|---|---|
| Saga sin grafo, miembros sin numerar | el hero pinta progreso, no 0/0 |
| Marcar un miembro `optional` | el denominador del hero baja en 1 |
| Marcar un bloque-subsaga `optional_in_parent` (por SQL, la UI llega en fase 2) | el denominador del padre baja; el de la ficha de la hija, no |
| Card de Mi Biblioteca y hero de la misma saga | **el mismo número** |
| Cambiar de itinerario | el número del hero **no se mueve** |
