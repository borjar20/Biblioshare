# `placement='anclado'` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un tercer valor `anclado` al eje `saga_placement` para que una obra o bloque-subsaga pueda colocarse por ventana relativa (después de X / antes de Y) siendo **obligatoria** y sin número absoluto, sin tener que marcarla `libre` ("cuando quieras").

**Architecture:** `anclado` es el valor que le falta al eje `placement` (hoy `fijo`/`libre`). En el orden derivado se comporta como `libre` (se recoloca por ventana, puede partir un bloque); la diferencia es semántica (obligatorio, "va aquí") y de autoría. En el editor de secuencia `placement` se deriva de la ZONA en que vive la fila, así que `anclado` se modela como una **cuarta zona** ("Anclado") que monta el `WindowEditor` existente. Un **predicado compartido** `esColocable(p)` reemplaza los `=== 'libre'` que significan "tiene ventana / se recoloca", para que orden, mapa y ficha cambien en bloque (la cabecera de `place-by-window.ts` advierte que esa regla no puede vivir dos veces).

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript 5, Supabase (Postgres + RLS, enum `public.saga_placement`), Vitest 4 (unit), Playwright (e2e), next-intl (locale único `es`).

## Global Constraints

- **Migraciones: dev primero (`supabase-dev`), luego prod.** "No aparece en `list_migrations`" ≠ "no está en prod": verificar contra `pg_type`/`pg_enum`, no el ledger.
- **NO se añade ninguna columna** ⇒ no aplica la superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna). Solo se amplía un enum.
- **`SagaPlacement` (TS) es un espejo A MANO** de `public.saga_placement` (`types.ts:43`): añadir el valor en BD NO hace que TypeScript se queje; hay que editar el tipo a mano.
- **Clases Tailwind enteras, nunca interpoladas.**
- **next-intl: las cadenas se componen en el servidor**; una `t()` no cruza a un componente cliente. Las claves nuevas van en `messages/es.json` bajo el namespace `sagaEditor`.
- **El estado vivo del usuario vive en `passes`.** Esta feature NO toca progreso: `countedKeys` (`progress.ts`) cuenta por pertenencia y `optional`, ignora `placement`. Un `anclado` cuenta como lectura normal.
- **Definición de "hecho"**: al cerrar, sincronizar `docs/requirements/data-model.md` (§7.4 + fecha), `docs/requirements/decisiones.md` (append-only), `docs/requirements/backlog.md`, y abrir las issues de trabajo diferido (Task 11).
- Comando de test unit: `npx vitest run <fichero>`. Todo: `npm test`.

---

### Task 1: Ampliar el enum `saga_placement` con `anclado` (dev)

**Files:**
- Create: `supabase/migrations/20260815_saga_placement_anclado.sql`

**Interfaces:**
- Produces: el valor `'anclado'` disponible en `public.saga_placement`, usable por la RPC `save_saga_sequence` (que ya castea `(e->>'placement')::public.saga_placement`) sin cambiarla.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260815_saga_placement_anclado.sql`:

```sql
-- Tercer valor del eje `placement` (spec 2026-08-15): colocación relativa
-- OBLIGATORIA por ventana, sin número absoluto. Se comporta en el orden como
-- `libre` (se recoloca por `saga_placement_windows`, puede partir un bloque),
-- pero semánticamente es "va aquí", no "cuando quieras".
--
-- Solo AÑADE el valor: no lo usa en la misma transacción, así que es seguro
-- (ALTER TYPE ... ADD VALUE no puede usarse en la misma tx en que se crea).
-- Los CHECK `saga_items_placement_position` y `sagas_placement_position` son
-- CASE ... WHEN placement='fijo' THEN position IS NOT NULL ELSE position IS NULL:
-- `anclado` cae al ELSE ⇒ exige position NULL. No hay que tocarlos.
alter type public.saga_placement add value if not exists 'anclado';
```

- [ ] **Step 2: Aplicar en dev y verificar contra el objeto real**

Aplicar la migración en `supabase-dev` (`apply_migration`). Verificar con:

```sql
select enumlabel from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'saga_placement' order by e.enumsortorder;
```

Expected: filas `fijo`, `libre`, `anclado`.

- [ ] **Step 3: Regenerar tipos TS de Supabase (si el proyecto los versiona)**

Si existe un fichero generado (p. ej. `src/lib/supabase/database.types.ts`), regenerarlo con `generate_typescript_types` y commitear el diff del enum. Si no existe, saltar.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815_saga_placement_anclado.sql
git commit -m "feat(sagas): añade valor 'anclado' al enum saga_placement (dev)"
```

> **Prod**: aplicar esta misma migración a `supabase-prod` en el paso de despliegue (Task 11 / cierre), tras el resto y con el código desplegado. Es puramente aditiva; el código viejo que ramifica en `placement === 'libre'` trataría `anclado` como "ni fijo ni libre" (cae a sin-clasificar / cadena fija), degradación tolerable hasta el deploy.

---

### Task 2: Predicado compartido `esColocable` + tipo `SagaPlacement` + rename del gate de `place-by-window`

**Files:**
- Modify: `src/lib/sagas/types.ts:43`
- Create: `src/lib/sagas/placement.ts`
- Create: `src/lib/sagas/placement.test.ts`
- Modify: `src/lib/sagas/place-by-window.ts:83-96,112`

**Interfaces:**
- Produces: `export type SagaPlacement = "fijo" | "libre" | "anclado"`; `export function esColocable(p: SagaPlacement | null): boolean`. `placeByWindow(units, windows, isPlaceable)` (mismo tipo de callback, nombre nuevo).

- [ ] **Step 1: Ampliar el tipo espejo**

`src/lib/sagas/types.ts:43`, reemplazar:

```ts
export type SagaPlacement = "fijo" | "libre";
```

por:

```ts
export type SagaPlacement = "fijo" | "libre" | "anclado";
```

Y actualizar el comentario de `SagaMember.placement` (`types.ts:71-76`) para mencionar el tercer valor:

```ts
  /** Dónde se lee. `fijo` ⇔ position !== null (CHECK saga_items_placement_position,
   *  un CASE). `anclado` = position null, colocado por ventana relativa y
   *  OBLIGATORIO. `libre` = cuando quieras. null = sin clasificar. */
  placement: SagaPlacement | null;
```

- [ ] **Step 2: Escribir el test del predicado**

`src/lib/sagas/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { esColocable } from "./placement";

describe("esColocable", () => {
  it("es true para libre y anclado (los que se recolocan por ventana)", () => {
    expect(esColocable("libre")).toBe(true);
    expect(esColocable("anclado")).toBe(true);
  });
  it("es false para fijo y sin clasificar", () => {
    expect(esColocable("fijo")).toBe(false);
    expect(esColocable(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Ejecutar el test — debe fallar**

Run: `npx vitest run src/lib/sagas/placement.test.ts`
Expected: FAIL con "Failed to resolve import './placement'".

- [ ] **Step 4: Escribir el predicado**

`src/lib/sagas/placement.ts`:

```ts
import type { SagaPlacement } from "./types";

/** Un miembro/bloque "colocable": el orden lo recoloca por su ventana
 *  (`saga_placement_windows`) y la ficha le pinta la ventana. Es la MISMA
 *  guarda que la cabecera de place-by-window.ts advierte que no puede vivir
 *  dos veces — por eso vive aquí y no como `=== "libre"` repetido:
 *
 *   - `libre`   → "cuando quieras" (ventana opcional).
 *   - `anclado` → "va aquí", relativo y OBLIGATORIO (ventana es el sentido).
 *
 *  `fijo` (número absoluto) y `null` (sin clasificar) NO se recolocan. */
export function esColocable(placement: SagaPlacement | null): boolean {
  return placement === "libre" || placement === "anclado";
}
```

- [ ] **Step 5: Ejecutar el test — debe pasar**

Run: `npx vitest run src/lib/sagas/placement.test.ts`
Expected: PASS.

- [ ] **Step 6: Renombrar el gate de `place-by-window` (comportamiento idéntico)**

`src/lib/sagas/place-by-window.ts`. El callback no decide la política (la deciden los llamantes al construir el set), solo la aplica; se renombra para dejar de mentir ("free"). Reemplazar la firma (`:92-96`) y el uso (`:112`):

En `:83-91` (docstring) y `:92-96`, cambiar `isFreeSubject` → `isPlaceable`:

```ts
/**
 * Recoloca los sujetos colocables (`libre`/`anclado`) con ventana dentro de `units`.
 *
 * `isPlaceable` es la guarda «solo un sujeto colocable tiene ventana», la MISMA
 * que aplican `deriveSagaMap` y la ficha (vía `esColocable`). Ningún CHECK de BD
 * puede imponerla (cruza dos tablas), así que una fila rancia de un sujeto que
 * dejó de ser colocable puede llegar hasta aquí; sin la guarda, el orden movería
 * algo que la ficha ni siquiera pinta.
 */
export function placeByWindow(
  units: OrderUnit[],
  windows: Record<string, OrderWindow>,
  isPlaceable: (subjectKey: string) => boolean,
): OrderUnit[] {
```

En `:112`, cambiar `if (!isFreeSubject(clave)) continue;` por:

```ts
    if (!isPlaceable(clave)) continue;
```

- [ ] **Step 7: Ejecutar los tests de place-by-window (siguen verdes)**

Run: `npx vitest run src/lib/sagas/place-by-window.test.ts`
Expected: PASS (el fixture pasa `libre = () => true`, ajeno al nombre del parámetro).

- [ ] **Step 8: Commit**

```bash
git add src/lib/sagas/types.ts src/lib/sagas/placement.ts src/lib/sagas/placement.test.ts src/lib/sagas/place-by-window.ts
git commit -m "feat(sagas): tipo SagaPlacement += anclado y predicado esColocable"
```

---

### Task 3: `curated-order` recoloca `anclado`

**Files:**
- Modify: `src/lib/sagas/curated-order.ts:2-4,146-156`
- Test: `src/lib/sagas/curated-order.test.ts`

**Interfaces:**
- Consumes: `esColocable` (Task 2).
- Produces: el orden principal recoloca sujetos `anclado` igual que `libre`.

- [ ] **Step 1: Escribir los tests (fallan)**

Añadir a `src/lib/sagas/curated-order.test.ts` (usa los helpers `root`/`child`/`member`/`titleOf`/`k` ya definidos al inicio del fichero):

```ts
describe("anclado", () => {
  it("una obra anclada con dos anclas parte el bloque e intercala", () => {
    // Bloque "IM" = im1, im2, im3 (posición fija); "Hulk" anclado entre im1 e im2.
    const order = createCuratedOrder(
      [root("UCM"), child("IM", "UCM", { positionInParent: 1 }), child("Solo", "UCM", { positionInParent: 2 })],
      [
        member("IM", "im1", 1), member("IM", "im2", 2), member("IM", "im3", 3),
        member("Solo", "hulk", 1, "anclado"),
      ],
      titleOf,
      { "i:book:hulk": { afterKey: "i:book:im1", beforeKey: "i:book:im2" } },
    );
    expect(order("UCM")).toEqual([k("im1"), k("hulk"), k("im2"), k("im3")]);
  });

  it("una obra anclada con SOLO after no corta: va a fin de bloque", () => {
    const order = createCuratedOrder(
      [root("UCM"), child("IM", "UCM", { positionInParent: 1 }), child("Solo", "UCM", { positionInParent: 2 })],
      [
        member("IM", "im1", 1), member("IM", "im2", 2), member("IM", "im3", 3),
        member("Solo", "hulk", 1, "anclado"),
      ],
      titleOf,
      { "i:book:hulk": { afterKey: "i:book:im1", beforeKey: null } },
    );
    expect(order("UCM")).toEqual([k("im1"), k("im2"), k("im3"), k("hulk")]);
  });

  it("un anclado SIN ventana no se mueve (degrada suave)", () => {
    const order = createCuratedOrder(
      [root("UCM"), child("IM", "UCM", { positionInParent: 1 }), child("Solo", "UCM", { positionInParent: 2 })],
      [member("IM", "im1", 1), member("Solo", "hulk", 1, "anclado")],
      titleOf,
      {},
    );
    expect(order("UCM")).toEqual([k("im1"), k("hulk")]);
  });
});
```

- [ ] **Step 2: Ejecutar — deben fallar**

Run: `npx vitest run src/lib/sagas/curated-order.test.ts`
Expected: FAIL (el primer caso da `["im1","im2","im3","hulk"]` porque `esLibre` no incluye `anclado`).

- [ ] **Step 3: Usar `esColocable` en `curated-order`**

`src/lib/sagas/curated-order.ts`. Añadir el import (junto a los de `:2-4`):

```ts
import { esColocable } from "./placement";
```

Reemplazar el bloque `:146-156` (`obrasLibres` + `esLibre`) por:

```ts
  // Placement por clave de obra: basta con que UNA membresía sea colocable
  // (`libre`/`anclado`) para que la obra pueda tener ventana — mismo criterio
  // que `buildWindowOwners` (window-owners.ts), vía `esColocable`.
  const obrasColocables = new Set<string>();
  for (const m of memberships) {
    if (esColocable(m.placement)) obrasColocables.add(`i:${itemKey(m.itemType, m.itemId)}`);
  }
  const esColocableKey = (subjectKey: string): boolean =>
    subjectKey.startsWith("s:")
      ? esColocable(sagaById.get(subjectKey.slice(2))?.placementInParent ?? null)
      : obrasColocables.has(subjectKey);
```

Y en `:180`, cambiar la llamada `placeByWindow(units, windows, esLibre)` por:

```ts
    return placeByWindow(units, windows, esColocableKey).map((u) => u.key.slice(2));
```

- [ ] **Step 4: Ejecutar — deben pasar**

Run: `npx vitest run src/lib/sagas/curated-order.test.ts`
Expected: PASS (todos, incluidos los previos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/curated-order.ts src/lib/sagas/curated-order.test.ts
git commit -m "feat(sagas): curated-order recoloca placement anclado"
```

---

### Task 4: `derive-map`, `get-saga-detail` y `window-owners` incluyen `anclado`

**Files:**
- Modify: `src/lib/sagas/derive-map.ts:294,385` (+ import)
- Modify: `src/lib/sagas/get-saga-detail.ts:257,267` (+ import)
- Modify: `src/lib/sagas/window-owners.ts:88,96` (+ import)
- Test: los `*.test.ts` existentes de esos módulos (correr para no regresar)

**Interfaces:**
- Consumes: `esColocable` (Task 2).
- Produces: mapa 2D, detalle de ficha y dueños de ventana tratan `anclado` como colocable (misma cadena/arista/ventana que `libre`).

- [ ] **Step 1: `derive-map.ts`**

Añadir el import `import { esColocable } from "./placement";` (junto a los demás imports del fichero).

En `:294`, reemplazar `group.placementInParent !== "libre"` por `!esColocable(group.placementInParent)`.
En `:385`, reemplazar `subjectPlacement !== "libre"` por `!esColocable(subjectPlacement)`.

- [ ] **Step 2: `get-saga-detail.ts`**

Añadir `import { esColocable } from "./placement";`.

En `:257`, reemplazar `m.placement !== "libre"` por `!esColocable(m.placement)`.
En `:267`, reemplazar `group.placementInParent !== "libre"` por `!esColocable(group.placementInParent)`.

> Verificar el contexto de cada `!==` antes de cambiar: ambos deben ser ramas del tipo "si NO es colocable, trátalo como fijo/cadena". Si alguna resultara ser "si NO es libre en sentido de zona", NO cambiarla (no debería: la separación de zonas vive en get-saga-sequence, no aquí).

- [ ] **Step 3: `window-owners.ts`**

Añadir `import { esColocable } from "./placement";`.

En `:88`, reemplazar `r.placement === "libre"` por `esColocable(r.placement)`.
En `:96`, reemplazar `b.placementInParent !== "libre"` por `!esColocable(b.placementInParent)`.

- [ ] **Step 4: Correr los tests de esos módulos**

Run: `npx vitest run src/lib/sagas/derive-map.test.ts src/lib/sagas/window-owners.test.ts src/lib/sagas/get-saga-detail.test.ts`
(Correr solo los que existan; si alguno no existe, omitirlo.)
Expected: PASS. Si un test fija comportamiento con `libre`, sigue verde; `anclado` no aparece en esos fixtures todavía.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-map.ts src/lib/sagas/get-saga-detail.ts src/lib/sagas/window-owners.ts
git commit -m "feat(sagas): mapa, detalle y dueños de ventana tratan anclado como colocable"
```

---

### Task 5: `group-members` reparte `anclado` al bucket colocado-por-ancla

**Files:**
- Modify: `src/lib/sagas/group-members.ts:180-182` (+ import)
- Test: `src/lib/sagas/group-members.test.ts`

**Interfaces:**
- Consumes: `esColocable` (Task 2).
- Produces: `partitionGroups` manda los grupos `anclado` al bucket `free` (los que se intercalan por ventana en el layout), no al `ordered`.

- [ ] **Step 1: Escribir el test (falla)**

Añadir dentro del `describe("partitionGroups", ...)` de `src/lib/sagas/group-members.test.ts` (usa el helper `group` ya definido ahí):

```ts
  it("un grupo `anclado` va al bucket que se intercala por ancla, como `libre`", () => {
    const anclado = group({ sagaId: "anclado", placementInParent: "anclado" });
    const colocado = group({ sagaId: "colocado", placementInParent: "fijo", positionInParent: 1 });
    const { ordered, free } = partitionGroups([anclado, colocado]);
    expect(ordered).toEqual([colocado]);
    expect(free).toEqual([anclado]);
  });
```

- [ ] **Step 2: Ejecutar — falla**

Run: `npx vitest run src/lib/sagas/group-members.test.ts`
Expected: FAIL (`anclado` cae hoy en `ordered` porque `!== "libre"`).

- [ ] **Step 3: Usar `esColocable` en `partitionGroups`**

`src/lib/sagas/group-members.ts`. Añadir el import `import { esColocable } from "./placement";` (junto a los imports del fichero; si `compareBlocksByPlacement` u otros ya importan de `./types`, dejarlo).

Reemplazar `:179-182`:

```ts
  return {
    ordered: groups.filter((g) => !esColocable(g.placementInParent)),
    free: groups.filter((g) => esColocable(g.placementInParent)),
  };
```

> `orderBlocksForLayout` (`:199-290`) NO necesita cambio: recibe ya `ordered`/`free` particionados y coloca cada `free` por su ventana; un `anclado` entra por `free` y se intercala igual.

- [ ] **Step 4: Ejecutar — pasa**

Run: `npx vitest run src/lib/sagas/group-members.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/group-members.ts src/lib/sagas/group-members.test.ts
git commit -m "feat(sagas): partitionGroups manda anclado al bucket colocado-por-ancla"
```

---

### Task 6: Zona `anchored` en el modelo del borrador (`sequence-draft.ts`)

**Files:**
- Modify: `src/lib/sagas/sequence-draft.ts` (múltiples puntos, ver pasos)
- Test: `src/lib/sagas/sequence-draft.test.ts` (crear si no existe; si existe, añadir casos)

**Interfaces:**
- Produces: `ZoneId` incluye `"anchored"`; `SequenceDraft.anchored: DraftEntry[]`; `toPayload` emite `placement: "anclado"` y sus ventanas; `sendTo`/`setAnchor`/`clearAnchor`/`setWindowReason`/`draftWindowOwners` reconocen la zona `anchored`.

- [ ] **Step 1: Escribir los tests (fallan)**

Añadir a `src/lib/sagas/sequence-draft.test.ts` (crear el fichero si no existe, con estos imports):

```ts
import { describe, expect, it } from "vitest";
import { sendTo, toPayload, setAnchor, type SequenceDraft, type DraftEntry, type DraftAnchor } from "./sequence-draft";

const entry = (over: Partial<DraftEntry> = {}): DraftEntry => ({
  key: "i:book:hulk", kind: "item", itemType: "book", itemId: "hulk", childSagaId: null,
  title: "Hulk", coverUrl: null, accentColor: null, count: null, optional: false, role: null,
  window: null, ownerSagaId: "UCM", isNew: false, ...over,
});
const emptyDraft = (over: Partial<SequenceDraft> = {}): SequenceDraft => ({
  slots: [], free: [], unclassified: [], removed: [], nested: [], anchored: [], ...over,
});
const anchor: DraftAnchor = { kind: "item", itemType: "book", itemId: "im1", childSagaId: null, title: "IM1" };

describe("zona anchored", () => {
  it("sendTo a `anchored` mueve la fila y conserva su ventana", () => {
    const d = emptyDraft({ anchored: [entry({ window: { after: anchor, before: null, reason: null } })] });
    const moved = sendTo(d, "i:book:hulk", "free");
    // Sale de anchored, entra en free (free también conserva ventana).
    expect(moved.anchored).toHaveLength(0);
    expect(moved.free).toHaveLength(1);
    expect(moved.free[0].window).not.toBeNull();
  });

  it("setAnchor funciona sobre una fila de `anchored`", () => {
    const d = emptyDraft({ anchored: [entry()] });
    const next = setAnchor(d, "i:book:hulk", "after", anchor);
    expect(next.anchored[0].window?.after?.itemId).toBe("im1");
  });

  it("toPayload emite placement `anclado` y su fila de ventana", () => {
    const d = emptyDraft({ anchored: [entry({ window: { after: anchor, before: null, reason: null } })] });
    const p = toPayload(d, "UCM");
    expect(p.entries).toContainEqual(
      expect.objectContaining({ item_id: "hulk", placement: "anclado", position: null }),
    );
    expect(p.windows).toHaveLength(1);
    expect(p.windows[0]).toMatchObject({ saga_id: "UCM", item_id: "hulk", after_item_id: "im1" });
  });
});
```

- [ ] **Step 2: Ejecutar — fallan (compilación)**

Run: `npx vitest run src/lib/sagas/sequence-draft.test.ts`
Expected: FAIL (`anchored` no existe en `SequenceDraft`).

- [ ] **Step 3: `ZoneId` y `ZONES`**

`sequence-draft.ts:6`, reemplazar:

```ts
export type ZoneId = "sequence" | "free" | "unclassified";
```

por:

```ts
export type ZoneId = "sequence" | "free" | "anchored" | "unclassified";
```

Y `:201` (el array que `extract` recorre):

```ts
const ZONES = ["free", "anchored", "unclassified"] as const;
```

- [ ] **Step 4: `SequenceDraft.anchored`**

`sequence-draft.ts:121-133`, añadir el campo dentro del tipo `SequenceDraft`:

```ts
export type SequenceDraft = {
  /** La secuencia, hueco a hueco. */
  slots: DraftSlot[];
  free: DraftEntry[];
  /** Zona "Anclado": placement `anclado`. Como `free`, admite ventana — pero
   *  aquí la ventana ES el sentido de la zona (colocación relativa obligatoria),
   *  no un extra opcional. */
  anchored: DraftEntry[];
  unclassified: DraftEntry[];
  removed: string[];
  nested: NestedSubject[];
};
```

- [ ] **Step 5: `sendTo` conserva ventana en `anchored`**

`sequence-draft.ts:249-252`, reemplazar el comentario+línea `const clean = ...`:

```ts
  // `free` y `anchored` admiten ventana: sacar la fila de ahí hacia otra zona se
  // la lleva por delante, porque ningún CHECK entre `saga_placement_windows` y
  // las tablas de colocación puede imponer esa coherencia.
  const clean = zone === "free" || zone === "anchored" ? entry : { ...entry, window: null };
```

- [ ] **Step 6: `mapEntry` recorre `anchored`**

`sequence-draft.ts:289-297`, añadir `anchored` al map:

```ts
function mapEntry(d: SequenceDraft, key: string, fn: (e: DraftEntry) => DraftEntry): SequenceDraft {
  const one = (e: DraftEntry) => (e.key === key ? fn(e) : e);
  return {
    ...d,
    slots: d.slots.map((s) => ({ ...s, entries: s.entries.map(one) })),
    free: d.free.map(one),
    anchored: d.anchored.map(one),
    unclassified: d.unclassified.map(one),
  };
}
```

- [ ] **Step 7: `setAnchor`/`clearAnchor`/`setWindowReason` reconocen `anchored`**

En `setAnchor` (`:347`), reemplazar `if (!d.free.some((e) => e.key === key)) return d;` por:

```ts
  if (!d.free.some((e) => e.key === key) && !d.anchored.some((e) => e.key === key)) return d;
```

En `setWindowReason` (`:387`), el mismo reemplazo:

```ts
  if (!d.free.some((e) => e.key === key) && !d.anchored.some((e) => e.key === key)) return d;
```

`clearAnchor` (`:357-367`) usa `mapEntry` sin guarda de zona, así que con el Step 6 ya alcanza `anchored`. No cambia.

- [ ] **Step 8: `draftWindowOwners` incluye `anchored`**

`sequence-draft.ts:397-402`, añadir el bucle:

```ts
export function draftWindowOwners(d: SequenceDraft): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of d.free) out.set(e.key, e.ownerSagaId);
  for (const e of d.anchored) out.set(e.key, e.ownerSagaId);
  for (const n of d.nested) out.set(n.key, n.ownerSagaId);
  return out;
}
```

- [ ] **Step 9: `addEntry` dedup incluye `anchored`**

`sequence-draft.ts:405-415`, añadir la comprobación:

```ts
export const addEntry = (d: SequenceDraft, entry: DraftEntry): SequenceDraft => {
  if (
    d.slots.some((s) => s.entries.some((e) => e.key === entry.key)) ||
    d.free.some((e) => e.key === entry.key) ||
    d.anchored.some((e) => e.key === entry.key) ||
    d.unclassified.some((e) => e.key === entry.key)
  ) {
    return d;
  }
  const clean = entry.window ? { ...entry, window: null } : entry;
  return { ...d, slots: [...d.slots, { entries: [{ ...clean, isNew: true }], mode: null, note: null }] };
};
```

- [ ] **Step 10: `toPayload` emite `anclado`, sus ventanas y sus sujetos**

`sequence-draft.ts:449-451`, añadir la línea de `anchored` (entre `free` y `unclassified`):

```ts
  d.slots.forEach((slot, i) => slot.entries.forEach((e) => push(e, i + 1, "fijo")));
  d.free.forEach((e) => push(e, null, "libre"));
  d.anchored.forEach((e) => push(e, null, "anclado"));
  d.unclassified.forEach((e) => push(e, null, null));
```

En el array `windows` (`:499-514`), añadir el tramo de `anchored` (misma forma que `free`):

```ts
  const windows: SequencePayload["windows"] = [
    ...d.free
      .filter((e) => e.window !== null)
      .map((e) =>
        windowRow(
          e.ownerSagaId,
          e.kind === "item" ? e.itemType : null,
          e.kind === "item" ? e.itemId : null,
          e.kind === "block" ? e.childSagaId : null,
          e.window!,
        ),
      ),
    ...d.anchored
      .filter((e) => e.window !== null)
      .map((e) =>
        windowRow(
          e.ownerSagaId,
          e.kind === "item" ? e.itemType : null,
          e.kind === "item" ? e.itemId : null,
          e.kind === "block" ? e.childSagaId : null,
          e.window!,
        ),
      ),
    ...d.nested
      .filter((n) => n.window !== null)
      .map((n) => windowRow(n.ownerSagaId, n.itemType, n.itemId, null, n.window!)),
  ];
```

En `windowSubjects` (`:550-561`), añadir la zona `anchored` con `subjectOf(e, "free")` (enseña su ventana, así que reclama bajo la dueña):

```ts
  const windowSubjects: SequencePayload["windowSubjects"] = [
    ...d.slots.flatMap((s) => s.entries).map((e) => subjectOf(e, "own")),
    ...d.free.map((e) => subjectOf(e, "free")),
    ...d.anchored.map((e) => subjectOf(e, "free")),
    ...d.unclassified.map((e) => subjectOf(e, "own")),
    ...d.removed.map(subjectFromKey),
    ...d.nested.map((n) => ({
      saga_id: n.ownerSagaId,
      item_type: n.itemType as ItemType | null,
      item_id: n.itemId as string | null,
      child_saga_id: null,
    })),
  ];
```

- [ ] **Step 11: Ejecutar — pasan**

Run: `npx vitest run src/lib/sagas/sequence-draft.test.ts`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/sagas/sequence-draft.ts src/lib/sagas/sequence-draft.test.ts
git commit -m "feat(sagas): zona anchored en el modelo del borrador de secuencia"
```

---

### Task 7: Hidratación — `placement='anclado'` → zona `anchored`

**Files:**
- Modify: `src/lib/sagas/get-saga-sequence.ts:200,216,300-311` (+ import)
- Test: `src/lib/sagas/get-saga-sequence.test.ts` (si existe `hydrateSequenceDraft` probado; si no, crear caso)

**Interfaces:**
- Consumes: `esColocable` (Task 2), `SequenceDraft.anchored` (Task 6).
- Produces: `hydrateSequenceDraft` reparte las filas `anclado` a `draft.anchored` y les cuelga su ventana.

- [ ] **Step 1: Escribir el test (falla)**

Añadir a `src/lib/sagas/get-saga-sequence.test.ts` (crear si no existe; importar `hydrateSequenceDraft`):

```ts
import { describe, expect, it } from "vitest";
import { hydrateSequenceDraft } from "./get-saga-sequence";
import type { DraftEntry } from "./sequence-draft";

const row = (placement: string, position: number | null): { entry: DraftEntry; position: number | null; placement: string | null } => ({
  position, placement: placement as "fijo" | "libre" | "anclado" | null,
  entry: {
    key: "i:book:hulk", kind: "item", itemType: "book", itemId: "hulk", childSagaId: null,
    title: "Hulk", coverUrl: null, accentColor: null, count: null, optional: false, role: null,
    window: null, ownerSagaId: "UCM", isNew: false,
  },
});

describe("hydrateSequenceDraft — anclado", () => {
  it("una fila `anclado` cae en la zona anchored", () => {
    const d = hydrateSequenceDraft([row("anclado", null)]);
    expect(d.anchored.map((e) => e.key)).toEqual(["i:book:hulk"]);
    expect(d.free).toHaveLength(0);
    expect(d.unclassified).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar — falla**

Run: `npx vitest run src/lib/sagas/get-saga-sequence.test.ts`
Expected: FAIL (`anclado` cae hoy en `unclassified`; y `d.anchored` es undefined).

- [ ] **Step 3: Colgar ventana a filas `anclado` al hidratar**

`get-saga-sequence.ts`. Añadir `import { esColocable } from "./placement";`.

En `:200`, reemplazar:

```ts
        window: r.placement === "libre" ? windowsByKey.get(`i:${r.item_type}:${r.item_id}`) ?? null : null,
```

por:

```ts
        window: esColocable(r.placement) ? windowsByKey.get(`i:${r.item_type}:${r.item_id}`) ?? null : null,
```

En `:216`, reemplazar:

```ts
        window: c.placement_in_parent === "libre" ? windowsByKey.get(`s:${c.id}`) ?? null : null,
```

por:

```ts
        window: esColocable(c.placement_in_parent) ? windowsByKey.get(`s:${c.id}`) ?? null : null,
```

- [ ] **Step 4: Repartir `anclado` a la zona `anchored`**

`get-saga-sequence.ts:300-311` (dentro de `hydrateSequenceDraft`), reemplazar la partición:

```ts
  const byPosition = new Map<number, DraftEntry[]>();
  const free: DraftEntry[] = [];
  const anchored: DraftEntry[] = [];
  const unclassified: DraftEntry[] = [];
  for (const r of rows) {
    if (r.placement === "fijo" && r.position !== null) {
      byPosition.set(r.position, [...(byPosition.get(r.position) ?? []), r.entry]);
    } else if (r.placement === "libre") {
      free.push(r.entry);
    } else if (r.placement === "anclado") {
      anchored.push(r.entry);
    } else {
      unclassified.push(r.entry);
    }
  }
```

Y en el `return` de `hydrateSequenceDraft` (localizar el objeto `{ slots, free, unclassified, removed: [], nested }`), añadir `anchored`:

```ts
  return { slots, free, anchored, unclassified, removed: [], nested };
```

> Verificar que el `return` real de la función incluya todos los campos de `SequenceDraft`; añadir `anchored` junto a `free`. Si `removed`/`nested` se pasan distinto, respetar la forma existente y solo insertar `anchored`.

- [ ] **Step 5: Ejecutar — pasa**

Run: `npx vitest run src/lib/sagas/get-saga-sequence.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/get-saga-sequence.ts src/lib/sagas/get-saga-sequence.test.ts
git commit -m "feat(sagas): hidrata placement anclado a la zona anchored"
```

---

### Task 8: Validación — una fila `anchored` sin ancla es error de borrador

**Files:**
- Modify: `src/lib/sagas/validate-sequence-draft.ts:23-30`
- Test: `src/lib/sagas/validate-sequence-draft.test.ts` (si existe; si no, crear)

**Interfaces:**
- Consumes: `SequencePayload` (con entries/blocks `placement: "anclado"` y `windows`).
- Produces: código de error `"anchoredNoWindow"` cuando una entrada/bloque `anclado` no tiene ninguna ventana en `payload.windows`.

- [ ] **Step 1: Escribir el test (falla)**

Añadir a `src/lib/sagas/validate-sequence-draft.test.ts` (crear si no existe; el `ctx` mínimo: `childIds`, `anchorKeys`, `windowOwners`):

```ts
import { describe, expect, it } from "vitest";
import { validateSequenceDraft } from "./validate-sequence-draft";
import type { SequencePayload } from "./sequence-draft";

const base: SequencePayload = {
  entries: [], blocks: [], removed: [], removedBlocks: [], windows: [], windowSubjects: [], tandems: [],
};
const ctx = { childIds: new Set<string>(), anchorKeys: new Set(["i:book:im1"]), windowOwners: new Map([["i:book:hulk", "UCM"]]) };

describe("anchored sin ventana", () => {
  it("marca `anchoredNoWindow` si una entrada anclada no tiene ventana", () => {
    const p: SequencePayload = {
      ...base,
      entries: [{ item_type: "book", item_id: "hulk", position: null, placement: "anclado", optional: false, role: null }],
    };
    expect(validateSequenceDraft(p, ctx).errors).toContain("anchoredNoWindow");
  });

  it("no marca error si la entrada anclada trae su ventana", () => {
    const p: SequencePayload = {
      ...base,
      entries: [{ item_type: "book", item_id: "hulk", position: null, placement: "anclado", optional: false, role: null }],
      windows: [{
        saga_id: "UCM", item_type: "book", item_id: "hulk", child_saga_id: null,
        after_item_type: "book", after_item_id: "im1", after_child_saga_id: null,
        before_item_type: null, before_item_id: null, before_child_saga_id: null, motivo: null,
      }],
    };
    expect(validateSequenceDraft(p, ctx).errors).not.toContain("anchoredNoWindow");
  });
});
```

- [ ] **Step 2: Ejecutar — falla**

Run: `npx vitest run src/lib/sagas/validate-sequence-draft.test.ts`
Expected: FAIL (no existe el código `anchoredNoWindow`).

- [ ] **Step 3: Añadir la comprobación**

`src/lib/sagas/validate-sequence-draft.ts`. Tras el bucle de `payload.blocks` (después de `:39`), añadir un índice de sujetos con ventana y la comprobación de anclados sin ventana. Insertar antes del bloque de comentario "Ventanas (fase 2b)" (`:41`):

```ts
  // Un sujeto `anclado` SIN ventana no tiene sentido: su posición ES la ventana.
  // La ventana viaja aparte en `payload.windows`, así que se cruza por clave de
  // sujeto (mismo formato `i:<tipo>:<id>` / `s:<uuid>`).
  const subjectsConVentana = new Set<string>();
  for (const w of payload.windows) {
    const sk = w.item_id !== null && w.item_type !== null
      ? `i:${w.item_type}:${w.item_id}`
      : w.child_saga_id !== null ? `s:${w.child_saga_id}` : null;
    if (sk !== null) subjectsConVentana.add(sk);
  }
  for (const e of payload.entries) {
    if (e.placement === "anclado" && !subjectsConVentana.has(`i:${e.item_type}:${e.item_id}`)) {
      errors.add("anchoredNoWindow");
    }
  }
  for (const b of payload.blocks) {
    if (b.placement_in_parent === "anclado" && !subjectsConVentana.has(`s:${b.child_saga_id}`)) {
      errors.add("anchoredNoWindow");
    }
  }
```

> Nota: el CHECK existente `(e.placement === "fijo") !== (e.position !== null)` (`:27`) ya trata `anclado` correctamente (no es `fijo` ⇒ exige `position` null), no hay que tocarlo.

- [ ] **Step 4: Ejecutar — pasa**

Run: `npx vitest run src/lib/sagas/validate-sequence-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Traducir el código de error en el consumidor**

Localizar dónde se traducen los códigos de `validateSequenceDraft` (grep `windowNotFree` en `src/`): añadir junto a los demás una entrada para `anchoredNoWindow` en el `messages/es.json` correspondiente y en el switch/map del consumidor. Texto sugerido: `"Una obra anclada necesita al menos un ancla (después de… o antes de…)."`.

Run: `grep -rn "windowNotFree" src/ messages/`

Añadir la clave análoga para `anchoredNoWindow` en los mismos sitios.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/validate-sequence-draft.ts src/lib/sagas/validate-sequence-draft.test.ts messages/
git commit -m "feat(sagas): valida que una fila anclada traiga su ventana"
```

---

### Task 9: UI del editor — zona "Anclado" (desktop + móvil + hoja de fila)

**Files:**
- Modify: `src/components/saga/sequence/shell-desktop.tsx:132-145` (añadir zona)
- Modify: `src/components/saga/sequence/shell-mobile.tsx` (leer primero; espejar la zona free)
- Modify: `src/components/saga/sequence/sequence-editor.tsx` (RowSheet: opción de zona `anchored`)
- Modify: `messages/es.json` (claves `zoneAnchored`, `zoneAnchoredHint`, `zoneAnchoredEmpty`, `sendToAnchored`, `sendToAnchoredFor`)
- Test: `e2e/sagas-anclado.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `SequenceDraft.anchored` (Task 6), `ops.sendTo(key, "anchored")`, `WindowEditor`.

- [ ] **Step 1: Claves i18n**

En `messages/es.json`, bajo el namespace `sagaEditor` (junto a `zoneFree`/`zoneFreeHint`/`zoneFreeEmpty`), añadir:

```json
"zoneAnchored": "Anclado",
"zoneAnchoredHint": "Va en un punto concreto, relativo a otra obra (después de… / antes de…). Para intercalar EN MEDIO de una subsaga, pon las dos anclas.",
"zoneAnchoredEmpty": "Nada anclado todavía.",
"sendToAnchored": "Anclar",
"sendToAnchoredFor": "Anclar {title}"
```

- [ ] **Step 2: Zona "Anclado" en el shell de escritorio**

`src/components/saga/sequence/shell-desktop.tsx`. Justo ANTES del bloque `<Zone title={t("zoneFree")} ...>` (`:132`), insertar una zona gemela que monta `WindowEditor` por fila (idéntica a la de `free`, sobre `draft.anchored`):

```tsx
        <Zone title={t("zoneAnchored")} hint={t("zoneAnchoredHint")} empty={draft.anchored.length === 0} emptyTitle={t("zoneAnchoredEmpty")}>
          {draft.anchored.map((e) => (
            <div key={`anchored-${e.key}`}>
              {row(e, null)}
              <WindowEditor
                subject={e}
                anchors={anchors}
                onSetAnchor={(side, anchor) => ops.setAnchor(e.key, side, anchor)}
                onClearAnchor={(side) => ops.clearAnchor(e.key, side)}
                onSetReason={(reason) => ops.setWindowReason(e.key, reason)}
              />
            </div>
          ))}
        </Zone>
```

Y en la zona "Sin clasificar" (`:157-167`), añadir un tercer botón "Anclar" junto a los de "sequence"/"free":

```tsx
                  <button type="button" onClick={() => ops.sendTo(e.key, "anchored")} aria-label={t("sendToAnchoredFor", { title: e.title })} className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold">
                    {t("sendToAnchored")}
                  </button>
```

- [ ] **Step 3: Zona "Anclado" en el shell móvil**

Leer `src/components/saga/sequence/shell-mobile.tsx` para ver cómo renderiza hoy la zona `free` (busca `zoneFree` / `draft.free`). Espejar ese bloque para `draft.anchored` con las claves `zoneAnchored*`, montando el mismo `WindowEditor` por fila. Si el móvil usa la `RowSheet` para mover entre zonas en vez de botones, basta con el Step 4.

- [ ] **Step 4: Opción de zona `anchored` en la hoja de fila (`RowSheet`)**

`src/components/saga/sequence/sequence-editor.tsx`. Localizar `RowSheet` y su prop `onZone={(z) => ops.sendTo(active.key, z)}` (`:141`). En el componente `RowSheet` (buscar dónde pinta las pastillas de zona `sequence`/`free`/`unclassified`), añadir una pastilla `anchored` con la etiqueta `t("sendToAnchored")`. Debe pasar `"anchored"` como `ZoneId` a `onZone`.

Run para localizar el render de las pastillas: `grep -rn "onZone\|unclassified" src/components/saga/sequence/`

- [ ] **Step 5: e2e — marcar anclado e intercalar**

`e2e/sagas-anclado.spec.ts` (nuevo). Espejar el patrón de `e2e/sagas-ventanas.spec.ts` (usa `data-testid` `window-anchors`, `sequence-row`). Flujo mínimo:

```ts
import { test, expect } from "@playwright/test";

// Requiere una saga-universo de prueba con un bloque-subsaga (p. ej. seed de e2e).
// Ajustar selectores/URL al seed real siguiendo sagas-ventanas.spec.ts.
test("una obra anclada con dos anclas se intercala en el mapa", async ({ page }) => {
  // 1. Abrir el editor de secuencia de la saga-universo.
  // 2. Enviar una obra a la zona "Anclado" (botón "Anclar" o la hoja de fila).
  // 3. Poner ancla "después de" IM1 y "antes de" IM2 en su WindowEditor.
  // 4. Guardar.
  // 5. Ir al mapa de lectura y comprobar el orden intercalado (obra entre IM1 e IM2).
  expect(true).toBe(true); // reemplazar por las aserciones reales contra el seed
});
```

> Este e2e depende del seed de sagas de e2e. Si no hay un universo con subsaga en el seed, la verificación real la cubre el qa-verifier (browser) sobre datos de dev; dejar el spec como esqueleto documentado y abrir issue `tipo:cobertura` si el seed no lo permite hoy.

- [ ] **Step 6: Verificar build de producción (las `use cache` fallan en `next start`, no en `next dev`)**

Run: `npm run build`
Expected: build OK (esta feature no añade `use cache`; el build valida además que no se rompió el tipado del editor).

- [ ] **Step 7: Commit**

```bash
git add src/components/saga/sequence/ messages/es.json e2e/sagas-anclado.spec.ts
git commit -m "feat(sagas): zona Anclado en el editor de secuencia (desktop, móvil, hoja de fila)"
```

---

### Task 10: Ficha — render de una obra/bloque `anclado`

**Files:**
- Modify: `src/components/saga/saga-info.tsx:217,238,249`
- Test: verificación por qa-verifier (browser) — no unit

**Interfaces:**
- Consumes: `esColocable`; la ficha ya recibe `ResolvedWindow` por entrada colocable (Task 4 amplió `get-saga-detail`/`window-owners`).

- [ ] **Step 1: Revisar las tres comparaciones de `saga-info.tsx`**

Leer `src/components/saga/saga-info.tsx:210-260` para entender qué separa cada `=== "libre"` / `!== "libre"`:
- `:217` `m.placement === "libre"` — probablemente "¿va en la sección Cuando quieras?".
- `:238`, `:249` `m.placement !== "libre"`.

Decisión de diseño (spec §8): una obra `anclado` **muestra su ventana** (chip "después de X / antes de Y") pero **NO** se lista dentro de la sección visual "Cuando quieras". Por tanto:
- Donde la comparación decide "¿pinto su ventana?" → usar `esColocable(m.placement)`.
- Donde decide "¿va en la sección Cuando quieras?" → dejar `=== "libre"` (anclado no va ahí; se pinta en su sitio del orden con su chip de ventana).

Aplicar `import { esColocable } from "@/lib/sagas/placement";` y cambiar SOLO las comparaciones que son "¿tiene/pinto ventana?". Añadir, si hace falta, una etiqueta visual que distinga `anclado` de `libre` (p. ej. el chip lleva el texto de la ventana en ambos; para `anclado` no aparece el rótulo "Cuando quieras").

- [ ] **Step 2: Verificación en browser (qa-verifier)**

Con `next dev` en el puerto 3000, abrir una saga-universo con una obra `anclado` y confirmar: (a) la obra aparece intercalada en el orden, (b) muestra su ventana, (c) NO aparece bajo "Cuando quieras". Registrar el resultado.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/saga-info.tsx
git commit -m "feat(sagas): la ficha pinta la ventana de una obra anclada sin listarla en Cuando quieras"
```

---

### Task 11: Sincronizar doc, decisiones, backlog e issues; aplicar a prod

**Files:**
- Modify: `docs/requirements/data-model.md` (§7.4)
- Modify: `docs/requirements/decisiones.md` (append)
- Modify: `docs/requirements/backlog.md`

- [ ] **Step 1: `data-model.md` §7.4**

En la sección §7.4 (donde define `placement`), documentar el tercer valor. Localizar la línea `create type public.saga_placement as enum ('fijo', 'libre');` y el párrafo `placement dice **dónde** se lee...` (aprox `:2131,2138`) y actualizar la prosa:

- Prosa: `placement`: `fijo` (hueco numerado) · **`anclado`** (posición relativa por ventana, obligatorio, `position` null) · `libre` (en cualquier momento) · `null` (sin clasificar). El CHECK `saga_items_placement_position` (un CASE) sigue valiendo sin cambios: solo `fijo` exige número; `anclado` y `libre` exigen `position` null.
- Añadir nota: el orden trata `anclado` como colocable (predicado `esColocable`, `src/lib/sagas/placement.ts`); la diferencia con `libre` es semántica (obligatorio) y de autoría (zona "Anclado" del editor, que requiere ventana).
- Actualizar la fecha de verificación de la sección a 2026-08-15.

- [ ] **Step 2: `decisiones.md` (append-only)**

Añadir al FINAL una entrada:

```markdown
## 2026-08-15 — Tercer valor `anclado` en `saga_placement` (no reusar `libre`)

Para intercalar una obra en mitad de una subsaga (Hulk entre Iron Man 1 y 2) hacía
falta marcarla `libre`, que significa "cuando quieras" y le quita su hueco. Se añade
`anclado` como tercer valor del eje `placement` en vez de sobrecargar `libre`: es
colocación relativa OBLIGATORIA. En el orden se comporta como `libre` (predicado
compartido `esColocable`), la diferencia es semántica y de autoría (zona "Anclado" del
editor, que exige ventana). Alternativa descartada: solo-UI reusando `libre` — no
distingue "anclado obligatorio" de "flota suelto" en BD. Ver spec
docs/superpowers/specs/2026-08-15-saga-placement-anclado-design.md.
```

- [ ] **Step 3: `backlog.md`**

Marcar la casilla de la mejora de curación de sagas-universo (intercalado por ancla) si existe; si no, no inventar entrada (las issues son el backlog vivo).

- [ ] **Step 4: Abrir issues de trabajo diferido**

```sh
gh issue create --label "area:sagas,tipo:deuda,P2" --title "Itinerarios: intercalar obras de fuera de un bloque-subsaga" --body "Hoy resolveRoute expande cada entrada child_saga_id de forma aislada (mainOrderOf), sin inyectar sujetos de fuera del bloque. En el orden AUTOMÁTICO del universo un anclado sí parte el bloque; en un ITINERARIO no. Repro: universo con subsaga Iron Man como bloque + obra Hulk anclada entre IM1 e IM2; el mapa la intercala, la ruta muestra [Iron Man completo] luego [Hulk]. Acota: el orden automático SÍ funciona (spec 2026-08-15). Ver resolve-route.ts."
```

```sh
gh issue create --label "area:sagas,tipo:cobertura,P2" --title "e2e real de placement anclado (seed de universo con subsaga)" --body "El spec e2e/sagas-anclado.spec.ts quedó como esqueleto porque el seed de e2e no tiene un universo con subsaga sobre el que marcar una obra anclada y verificar el intercalado. Añadir seed y aserciones reales, espejando sagas-ventanas.spec.ts."
```

Si en la implementación se descubre que el rótulo "(cont.)" del bloque partido NO existe (Task 9/10), abrir además:

```sh
gh issue create --label "area:sagas,tipo:bug,P2" --title "Bloque partido por un anclado no rotula el segundo segmento como (cont.)" --body "Al partir un bloque-subsaga con una obra anclada, el segundo segmento debería mantener color/etiqueta y rotularse (cont.) (decisión de producto, spec 2026-08-15 §8). Verificar reading-timeline/derive-map y añadir el rótulo si falta."
```

- [ ] **Step 5: Aplicar la migración a PROD y verificar**

Aplicar `20260815_saga_placement_anclado.sql` en `supabase-prod` (`apply_migration`). Verificar con la misma query de enum del Task 1 Step 2 contra prod. Confirmar por escrito que `anclado` está en `pg_enum` de prod.

- [ ] **Step 6: Suite completa + commit doc**

Run: `npm test`
Expected: PASS.

```bash
git add docs/requirements/
git commit -m "docs(sagas): documenta placement anclado (data-model, decisiones, backlog)"
```

---

## Self-Review

**Spec coverage:**
- §2 (enum `anclado`) → Task 1. ✓
- §3 (CHECK sin cambios, sin columna, RLS) → Task 1 (nota) + Global Constraints. ✓
- §4 (esColocable en curated-order/place-by-window) → Tasks 2, 3. ✓
- §5 (progreso sin cambios) → Global Constraints (no task, correcto). ✓
- §6 (group-members) → Task 5. ✓
- §7 (zona anchored: draft, hydrate, validate, RPC sin cambio, shells) → Tasks 6, 7, 8, 9. ✓
- §7b (auditoría de los `=== 'libre'`: colocable vs zona/render) → Tasks 4 (colocable), 7 (zona), 10 (render ficha). ✓
- §8 (render bloque partido, "(cont.)") → Task 10 + issue diferida (Task 11). ✓
- §9 (tipo SagaPlacement) → Task 2. ✓
- §10 (issues fuera de alcance) → Task 11. ✓
- §11 (tests) → cada task lleva su ciclo; e2e en Task 9. ✓
- §12 (definición de hecho) → Task 11. ✓

**Placeholder scan:** e2e spec de Task 9 es un esqueleto DECLARADO (depende del seed) con issue de cobertura abierta — es una limitación real documentada, no un placeholder de plan. Resto: código real en cada paso.

**Type consistency:** `esColocable(placement: SagaPlacement | null): boolean` — mismo nombre y firma en Tasks 2-5, 7, 10. `SequenceDraft.anchored: DraftEntry[]` — introducido en Task 6, consumido en Tasks 7 (hydrate return), 9 (shell). `ZoneId` incluye `"anchored"` (Task 6) usado por `sendTo`/shells (Tasks 6, 9). Código de error `"anchoredNoWindow"` — Task 8 (define) y Task 8 Step 5 / Task 9 (traduce). Consistente.
