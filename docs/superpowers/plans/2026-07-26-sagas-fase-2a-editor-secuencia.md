# Sagas fase 2a: un solo editor de secuencia — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** convertir `/saga/[id]/editar` en la única pantalla del orden de lectura: tres zonas, tándem, colocación de bloques-subsaga, un guardado atómico, y retirada del editor de grafo.

**Architecture:** un borrador en cliente (estructura de datos pura + reducer, sin React) que dos cáscaras de presentación —A en escritorio, B en móvil— leen y modifican; un único `save_saga_sequence` (RPC `SECURITY DEFINER`) que lo persiste en una transacción.

**Tech Stack:** Next.js 16 (App Router, React 19), Supabase/PostgREST, Tailwind v4 con tokens Paper, next-intl (solo `es`), Vitest, Playwright, `@dnd-kit` (ya es dependencia).

**Spec:** `docs/superpowers/specs/2026-07-26-sagas-fase-2a-editor-secuencia-design.md`
**Maqueta:** `Paper - Editor de secuencia (propuestas).html` en `D:\Proyectos\Personal\Mockups\` (A escritorio, B móvil).

## Global Constraints

- **Una capa de estado, dos cáscaras.** Todo el estado del borrador vive en `sequence-draft.ts` (puro) y en un único hook. `A` y `B` son presentación: reciben estado y disparan operaciones. **Estado propio dentro de `A` o `B` es un defecto**, no un detalle de implementación.
- **El número no se teclea.** `position` se deriva del índice del hueco al serializar. No hay `<input type="number">` en ninguna parte de esta pantalla.
- **Posiciones consecutivas desde 1 admitiendo empates:** un tándem en el hueco 3 da `1, 2, 3, 3, 4` — nunca `3, 3, 5`.
- **Invariante de BD, replicado en cliente:** `placement = 'fijo'` ⇔ `position is not null`. Nada en «Cuando quieras» ni en «Sin clasificar» lleva número.
- **La baja es explícita.** El RPC borra solo lo que llega en `p_removed`, nunca por omisión de `p_entries`.
- **Los bloques-subsaga no tienen rol.** `sagas` tiene `position_in_parent` / `placement_in_parent` / `optional_in_parent` y ninguna columna de rol. La fila de bloque no lleva ese control.
- **Copia:** «La secuencia», «Cuando quieras», «Sin clasificar» (zona), **«Sin rol»** (valor vacío del rol — nunca «Sin clasificar»), «opcional», «bloque», «itinerario». Todo por `next-intl`, namespace `sagaEditor`, fichero `messages/es.json`.
- **Accesibilidad:** cada gesto de arrastre tiene su gemelo pulsable y tecleable. El arrastre es el extra.
- **Los miembros de una subsaga no se editan aquí** (#187): esta pantalla solo toca las filas de `saga_items` cuyo `saga_id` es el de la saga editada, más las columnas `*_in_parent` de sus hijas **directas**.
- **Migraciones: dev primero, prod después**, verificando contra `pg_proc` / `pg_class` / `pg_constraint`, **nunca** contra `list_migrations` (`AGENTS.md`).
- **Node 22** (`fnm use 22`) antes de `npx vitest` o `npx playwright test`; el shell arranca en v20 y rompe Vitest.

---

## Estructura de ficheros

**Se crea:**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/sagas/sequence-draft.ts` | tipos del borrador + operaciones puras + serializador |
| `src/lib/sagas/sequence-draft.test.ts` | sus pruebas |
| `src/lib/sagas/validate-sequence-draft.ts` | validación previa al envío |
| `src/lib/sagas/validate-sequence-draft.test.ts` | sus pruebas |
| `src/lib/sagas/get-saga-sequence.ts` | carga de datos de ESTA saga (no del subárbol) |
| `src/lib/sagas/sequence-actions.ts` | server action `saveSequence` |
| `src/components/saga/sequence/use-sequence-draft.ts` | el único hook con estado |
| `src/components/saga/sequence/sequence-row.tsx` | fila de obra y de bloque (compartida) |
| `src/components/saga/sequence/tandem-picker.tsx` | gesto «mismo hueco que…» |
| `src/components/saga/sequence/sequence-save-bar.tsx` | barra: cambios, guardando, guardado, avisos |
| `src/components/saga/sequence/sequence-editor.tsx` | raíz: elige cáscara, sostiene el hook |
| `src/components/saga/sequence/shell-desktop.tsx` | propuesta A |
| `src/components/saga/sequence/shell-mobile.tsx` | propuesta B |
| `src/components/saga/sequence/row-sheet.tsx` | hoja por fila (móvil) |
| `supabase/migrations/20260726_save_saga_sequence.sql` | la RPC |
| `supabase/migrations/20260727_rescate_colocacion_hijas.sql` | `order_no` → `position_in_parent` |
| `e2e/sagas-editor-secuencia.spec.ts` | e2e en dos viewports |

**Se modifica:** `src/lib/sagas/types.ts` (añadir `placementInParent`), `src/app/saga/[id]/editar/page.tsx`, `src/components/saga/editor/editor-left-panel.tsx` (quitar «Herramientas»), `messages/es.json`.

**Se borra:** `src/app/saga/[id]/mapa/editar/page.tsx` (pasa a redirect), `src/components/saga/editor/saga-graph-editor.tsx`, `editor-inspector.tsx`, `editor-node.tsx`, `src/lib/sagas/validate-graph-draft.ts` (+ test), `src/components/saga/saga-members-editor.tsx`, `src/lib/sagas/member-actions.ts` (+ sus claves i18n).

---

### Task 1: El borrador — tipos, operaciones y serializador

**Files:**
- Create: `src/lib/sagas/sequence-draft.ts`
- Test: `src/lib/sagas/sequence-draft.test.ts`

**Interfaces:**
- Consumes: `ItemType` de `@/lib/catalog/types`, `SagaItemRole`/`SagaPlacement` de `./types`.
- Produces: `type DraftEntry`, `type SequenceDraft`, `type ZoneId`, `type SequencePayload`; funciones `moveSlot`, `sendTo`, `pairWith`, `unpair`, `setOptional`, `setRole`, `addEntry`, `removeEntry`, `toPayload`. **Todas puras: reciben un draft y devuelven uno nuevo.**

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// src/lib/sagas/sequence-draft.test.ts
import { describe, expect, it } from "vitest";
import {
  addEntry, moveSlot, pairWith, removeEntry, sendTo, setOptional, setRole, toPayload, unpair,
  type DraftEntry, type SequenceDraft,
} from "./sequence-draft";

const work = (id: string, title = id): DraftEntry => ({
  key: `i:book:${id}`, kind: "item", itemType: "book", itemId: id, childSagaId: null,
  title, coverUrl: null, accentColor: null, count: null, optional: false, role: null, isNew: false,
});
const block = (id: string): DraftEntry => ({
  key: `s:${id}`, kind: "block", itemType: null, itemId: null, childSagaId: id,
  title: id, coverUrl: null, accentColor: "verde", count: 8, optional: false, role: null, isNew: false,
});
const draft = (slots: DraftEntry[][], free: DraftEntry[] = [], unclassified: DraftEntry[] = []): SequenceDraft =>
  ({ slots, free, unclassified, removed: [] });

describe("moveSlot", () => {
  it("intercambia el hueco con su vecino y no toca los demás", () => {
    const d = moveSlot(draft([[work("a")], [work("b")], [work("c")]]), 0, 1);
    expect(d.slots.map((s) => s[0].itemId)).toEqual(["b", "a", "c"]);
  });

  it("es un no-op en los extremos, sin lanzar", () => {
    const d = draft([[work("a")], [work("b")]]);
    expect(moveSlot(d, 0, -1).slots).toEqual(d.slots);
    expect(moveSlot(d, 1, 1).slots).toEqual(d.slots);
  });
});

describe("pairWith / unpair", () => {
  it("emparejar mete la obra en el hueco destino y elimina su hueco", () => {
    const d = pairWith(draft([[work("a")], [work("b")], [work("c")]]), "i:book:c", 0);
    expect(d.slots).toHaveLength(2);
    expect(d.slots[0].map((e) => e.itemId)).toEqual(["a", "c"]);
    expect(d.slots[1][0].itemId).toBe("b");
  });

  it("deshacer un tándem devuelve huecos consecutivos en el sitio del empate", () => {
    const d = unpair(draft([[work("a"), work("c")], [work("b")]]), 0);
    expect(d.slots.map((s) => s.map((e) => e.itemId))).toEqual([["a"], ["c"], ["b"]]);
  });
});

describe("sendTo", () => {
  it("mover a «Cuando quieras» saca la fila de la secuencia y cierra el hueco", () => {
    const d = sendTo(draft([[work("a")], [work("b")]]), "i:book:a", "free");
    expect(d.slots.map((s) => s[0].itemId)).toEqual(["b"]);
    expect(d.free.map((e) => e.itemId)).toEqual(["a"]);
  });

  it("mover a la secuencia añade un hueco AL FINAL", () => {
    const d = sendTo(draft([[work("a")]], [], [work("z")]), "i:book:z", "sequence");
    expect(d.slots.map((s) => s[0].itemId)).toEqual(["a", "z"]);
    expect(d.unclassified).toHaveLength(0);
  });

  it("sacar de un tándem al resto del hueco NO lo destruye", () => {
    const d = sendTo(draft([[work("a"), work("c")]]), "i:book:c", "free");
    expect(d.slots.map((s) => s.map((e) => e.itemId))).toEqual([["a"]]);
    expect(d.free.map((e) => e.itemId)).toEqual(["c"]);
  });
});

describe("removeEntry", () => {
  it("una fila existente se apunta en `removed`", () => {
    const d = removeEntry(draft([[work("a")], [work("b")]]), "i:book:a");
    expect(d.slots).toHaveLength(1);
    expect(d.removed).toEqual(["i:book:a"]);
  });

  it("una fila recién añadida y no guardada NO se apunta en `removed`", () => {
    const fresh = { ...work("n"), isNew: true };
    const d = removeEntry(addEntry(draft([[work("a")]]), fresh), "i:book:n");
    expect(d.removed).toEqual([]);
    expect(d.slots).toHaveLength(1);
  });
});

describe("toPayload", () => {
  it("numera desde 1 admitiendo empates: un tándem NO salta el número siguiente", () => {
    const d = draft([[work("a")], [work("b")], [work("c"), work("d")], [work("e")]]);
    const positions = toPayload(d).entries.map((e) => [e.item_id, e.position]);
    expect(positions).toEqual([["a", 1], ["b", 2], ["c", 3], ["d", 3], ["e", 4]]);
  });

  it("la zona determina el placement, y fuera de la secuencia no hay número", () => {
    const p = toPayload(draft([[work("a")]], [work("f")], [work("u")]));
    expect(p.entries).toEqual([
      { item_type: "book", item_id: "a", position: 1, placement: "fijo", optional: false, role: null },
      { item_type: "book", item_id: "f", position: null, placement: "libre", optional: false, role: null },
      { item_type: "book", item_id: "u", position: null, placement: null, optional: false, role: null },
    ]);
  });

  it("los bloques van en `blocks`, nunca en `entries`, y sin rol", () => {
    const p = toPayload(draft([[block("g")], [work("a")]]));
    expect(p.entries.map((e) => e.item_id)).toEqual(["a"]);
    expect(p.blocks).toEqual([
      { child_saga_id: "g", position_in_parent: 1, placement_in_parent: "fijo", optional_in_parent: false },
    ]);
  });

  it("`removed` viaja tal cual, separado por tipo", () => {
    const d = removeEntry(removeEntry(draft([[work("a")], [block("g")]]), "i:book:a"), "s:g");
    expect(toPayload(d).removed).toEqual([{ item_type: "book", item_id: "a" }]);
    expect(toPayload(d).removedBlocks).toEqual([]);
  });
});

describe("setOptional / setRole", () => {
  it("cambian solo la fila apuntada, en cualquier zona", () => {
    const d = setRole(setOptional(draft([[work("a")]], [work("f")]), "i:book:f", true), "i:book:a", "spin_off");
    expect(d.free[0].optional).toBe(true);
    expect(d.slots[0][0].role).toBe("spin_off");
    expect(d.free[0].role).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y ver que falla**

```bash
fnm use 22; npx vitest run src/lib/sagas/sequence-draft.test.ts
```

Esperado: FAIL — `Failed to resolve import "./sequence-draft"`.

- [ ] **Step 3: Escribir la implementación**

```ts
// src/lib/sagas/sequence-draft.ts
import type { ItemType } from "@/lib/catalog/types";
import type { SagaItemRole, SagaPlacement } from "./types";

/** Las tres zonas de la pantalla. La zona ES la colocación (spec §«Tres zonas»):
 *  no hay desplegable de `placement`, se deriva de dónde vive la fila. */
export type ZoneId = "sequence" | "free" | "unclassified";

export type DraftEntry = {
  /** Clave estable y única en el borrador: `i:<tipo>:<uuid>` para una obra,
   *  `s:<uuid>` para un bloque-subsaga. Es la key de React y el identificador
   *  de todas las operaciones — nunca el índice, que cambia al reordenar. */
  key: string;
  kind: "item" | "block";
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  title: string;
  coverUrl: string | null;
  /** Solo bloques: su acento y cuántas obras tiene, para la fila. */
  accentColor: string | null;
  count: number | null;
  optional: boolean;
  /** Rol narrativo. SIEMPRE null en un bloque: `sagas` no tiene columna de rol
   *  (verificado en 20260725_saga_placement_blocks.sql), así que un rol puesto
   *  en un bloque no tendría dónde guardarse. */
  role: SagaItemRole | null;
  /** true = alta del rail que todavía no existe en BD. Da de baja sin apuntar
   *  en `removed` (borrar algo que nunca se guardó no es un DELETE). */
  isNew: boolean;
};

export type SequenceDraft = {
  /** La secuencia. Cada elemento es UN HUECO con una o más entradas: dos o más
   *  entradas en el mismo hueco son un tándem (#168), que es intención y no
   *  colisión. Modelar el hueco como array es lo que hace que el empate no
   *  necesite ninguna regla especial al numerar. */
  slots: DraftEntry[][];
  free: DraftEntry[];
  unclassified: DraftEntry[];
  /** Claves dadas de baja que SÍ existían en BD. Viaja al RPC como `p_removed`;
   *  el borrado por omisión está prohibido (spec §«Por qué la baja es explícita»). */
  removed: string[];
};

export type SequencePayload = {
  entries: Array<{
    item_type: ItemType;
    item_id: string;
    position: number | null;
    placement: SagaPlacement | null;
    optional: boolean;
    role: SagaItemRole | null;
  }>;
  blocks: Array<{
    child_saga_id: string;
    position_in_parent: number | null;
    placement_in_parent: SagaPlacement | null;
    optional_in_parent: boolean;
  }>;
  removed: Array<{ item_type: ItemType; item_id: string }>;
  /** Bajas de bloques: hoy siempre vacío. Desanidar una subsaga es competencia
   *  de `editor-actions.ts` (cambia `parent_saga_id`), no de la secuencia; se
   *  devuelve el array para que el RPC tenga una forma estable y para que quede
   *  escrito que la omisión es deliberada. */
  removedBlocks: Array<{ child_saga_id: string }>;
};

const ZONES = ["free", "unclassified"] as const;

/** Saca una entrada de donde esté y devuelve el draft sin ella + la entrada.
 *  Cerrar el hueco vacío es parte de sacar: un hueco sin entradas no existe. */
function extract(d: SequenceDraft, key: string): [SequenceDraft, DraftEntry | null] {
  for (const zone of ZONES) {
    const found = d[zone].find((e) => e.key === key);
    if (found) return [{ ...d, [zone]: d[zone].filter((e) => e.key !== key) }, found];
  }
  for (let i = 0; i < d.slots.length; i++) {
    const found = d.slots[i].find((e) => e.key === key);
    if (!found) continue;
    const rest = d.slots[i].filter((e) => e.key !== key);
    const slots = rest.length > 0
      ? d.slots.map((s, j) => (j === i ? rest : s))
      : d.slots.filter((_, j) => j !== i);
    return [{ ...d, slots }, found];
  }
  return [d, null];
}

export function moveSlot(d: SequenceDraft, index: number, delta: number): SequenceDraft {
  const j = index + delta;
  if (index < 0 || index >= d.slots.length || j < 0 || j >= d.slots.length) return d;
  const slots = [...d.slots];
  [slots[index], slots[j]] = [slots[j], slots[index]];
  return { ...d, slots };
}

export function sendTo(d: SequenceDraft, key: string, zone: ZoneId): SequenceDraft {
  const [without, entry] = extract(d, key);
  if (!entry) return d;
  if (zone === "sequence") return { ...without, slots: [...without.slots, [entry]] };
  return { ...without, [zone]: [...without[zone], entry] };
}

export function pairWith(d: SequenceDraft, key: string, targetSlot: number): SequenceDraft {
  const target = d.slots[targetSlot];
  if (!target || target.some((e) => e.key === key)) return d;
  // Se resuelve el hueco destino por IDENTIDAD y no por índice: `extract` puede
  // eliminar un hueco anterior y correr los índices una posición.
  const [without, entry] = extract(d, key);
  if (!entry) return d;
  const at = without.slots.findIndex((s) => s === target);
  if (at === -1) return d;
  return { ...without, slots: without.slots.map((s, j) => (j === at ? [...s, entry] : s)) };
}

export function unpair(d: SequenceDraft, index: number): SequenceDraft {
  const slot = d.slots[index];
  if (!slot || slot.length < 2) return d;
  const exploded = slot.map((e) => [e]);
  return { ...d, slots: [...d.slots.slice(0, index), ...exploded, ...d.slots.slice(index + 1)] };
}

function mapEntry(d: SequenceDraft, key: string, fn: (e: DraftEntry) => DraftEntry): SequenceDraft {
  const one = (e: DraftEntry) => (e.key === key ? fn(e) : e);
  return {
    ...d,
    slots: d.slots.map((s) => s.map(one)),
    free: d.free.map(one),
    unclassified: d.unclassified.map(one),
  };
}

export const setOptional = (d: SequenceDraft, key: string, optional: boolean): SequenceDraft =>
  mapEntry(d, key, (e) => ({ ...e, optional }));

/** Un bloque nunca guarda rol: se ignora en silencio en vez de fallar, porque
 *  la interfaz ni siquiera ofrece el control (spec §«La fila»). */
export const setRole = (d: SequenceDraft, key: string, role: SagaItemRole | null): SequenceDraft =>
  mapEntry(d, key, (e) => (e.kind === "block" ? e : { ...e, role }));

/** Alta desde el rail: al final de la secuencia, como promete la maqueta. */
export const addEntry = (d: SequenceDraft, entry: DraftEntry): SequenceDraft =>
  d.slots.some((s) => s.some((e) => e.key === entry.key)) ||
  d.free.some((e) => e.key === entry.key) ||
  d.unclassified.some((e) => e.key === entry.key)
    ? d
    : { ...d, slots: [...d.slots, [{ ...entry, isNew: true }]] };

export function removeEntry(d: SequenceDraft, key: string): SequenceDraft {
  const [without, entry] = extract(d, key);
  if (!entry) return d;
  return entry.isNew ? without : { ...without, removed: [...without.removed, key] };
}

export function toPayload(d: SequenceDraft): SequencePayload {
  const entries: SequencePayload["entries"] = [];
  const blocks: SequencePayload["blocks"] = [];

  const push = (e: DraftEntry, position: number | null, placement: SagaPlacement | null) => {
    if (e.kind === "block") {
      blocks.push({
        child_saga_id: e.childSagaId!,
        position_in_parent: position,
        placement_in_parent: placement,
        optional_in_parent: e.optional,
      });
      return;
    }
    entries.push({
      item_type: e.itemType!,
      item_id: e.itemId!,
      position,
      placement,
      optional: e.optional,
      role: e.role,
    });
  };

  // El número es el índice del HUECO, no el de la entrada: por eso un tándem
  // comparte número y el hueco siguiente vale n+1, nunca n+2.
  d.slots.forEach((slot, i) => slot.forEach((e) => push(e, i + 1, "fijo")));
  d.free.forEach((e) => push(e, null, "libre"));
  d.unclassified.forEach((e) => push(e, null, null));

  const removedItems: SequencePayload["removed"] = [];
  for (const key of d.removed) {
    const [, type, id] = key.split(":");
    if (key.startsWith("i:")) removedItems.push({ item_type: type as ItemType, item_id: id });
  }
  return { entries, blocks, removed: removedItems, removedBlocks: [] };
}
```

- [ ] **Step 4: Ejecutar las pruebas y verlas pasar**

```bash
fnm use 22; npx vitest run src/lib/sagas/sequence-draft.test.ts
```

Esperado: PASS, 12 pruebas.

- [ ] **Step 5: Inyección de fallo — comprobar que las pruebas muerden**

Cambiar en `toPayload` la línea `d.slots.forEach((slot, i) => slot.forEach((e) => push(e, i + 1, "fijo")))` por una que numere por entrada en vez de por hueco (`let n = 1; d.slots.forEach((s) => s.forEach((e) => push(e, n++, "fijo")))`). Volver a correr: **debe caer** la prueba «un tándem NO salta el número siguiente». Deshacer el cambio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/sequence-draft.ts src/lib/sagas/sequence-draft.test.ts
git commit -m "feat(sagas): borrador de secuencia — operaciones puras y serializador"
```

---

### Task 2: Validación previa al envío

**Files:**
- Create: `src/lib/sagas/validate-sequence-draft.ts`
- Test: `src/lib/sagas/validate-sequence-draft.test.ts`

**Interfaces:**
- Consumes: `SequencePayload` de `./sequence-draft`.
- Produces: `validateSequenceDraft(payload, ctx: { childIds: Set<string> }): { errors: string[]; unclassified: number }`. **`errors` bloquea el guardado; `unclassified` es un aviso que NO lo bloquea.**

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// src/lib/sagas/validate-sequence-draft.test.ts
import { describe, expect, it } from "vitest";
import { validateSequenceDraft } from "./validate-sequence-draft";
import type { SequencePayload } from "./sequence-draft";

const base: SequencePayload = { entries: [], blocks: [], removed: [], removedBlocks: [] };
const ctx = { childIds: new Set(["hija-1"]) };
const item = (id: string, position: number | null, placement: SequencePayload["entries"][number]["placement"]) =>
  ({ item_type: "book" as const, item_id: id, position, placement, optional: false, role: null });

it("un payload correcto no da errores", () => {
  const r = validateSequenceDraft({ ...base, entries: [item("a", 1, "fijo"), item("b", 2, "fijo")] }, ctx);
  expect(r.errors).toEqual([]);
  expect(r.unclassified).toBe(0);
});

it("acepta un empate: dos obras en el hueco 3 y la siguiente en el 4", () => {
  const entries = [item("a", 1, "fijo"), item("b", 2, "fijo"), item("c", 3, "fijo"), item("d", 3, "fijo"), item("e", 4, "fijo")];
  expect(validateSequenceDraft({ ...base, entries }, ctx).errors).toEqual([]);
});

it("rechaza un hueco saltado", () => {
  const entries = [item("a", 1, "fijo"), item("c", 3, "fijo")];
  expect(validateSequenceDraft({ ...base, entries }, ctx).errors).toContain("positions");
});

it("rechaza `fijo` sin número y `libre` con número — el invariante del CHECK", () => {
  expect(validateSequenceDraft({ ...base, entries: [item("a", null, "fijo")] }, ctx).errors).toContain("placement");
  expect(validateSequenceDraft({ ...base, entries: [item("a", 1, "libre")] }, ctx).errors).toContain("placement");
});

it("rechaza un bloque que no es hija DIRECTA de esta saga", () => {
  const blocks = [{ child_saga_id: "ajena", position_in_parent: 1, placement_in_parent: "fijo" as const, optional_in_parent: false }];
  expect(validateSequenceDraft({ ...base, blocks }, ctx).errors).toContain("foreignBlock");
});

it("rechaza la misma obra dos veces", () => {
  const entries = [item("a", 1, "fijo"), item("a", 2, "fijo")];
  expect(validateSequenceDraft({ ...base, entries }, ctx).errors).toContain("duplicate");
});

it("cuenta las sin clasificar como AVISO, sin bloquear", () => {
  const entries = [item("a", 1, "fijo"), item("u", null, null), item("v", null, null)];
  const r = validateSequenceDraft({ ...base, entries }, ctx);
  expect(r.errors).toEqual([]);
  expect(r.unclassified).toBe(2);
});

it("los huecos de obras y bloques comparten numeración", () => {
  const entries = [item("a", 1, "fijo")];
  const blocks = [{ child_saga_id: "hija-1", position_in_parent: 2, placement_in_parent: "fijo" as const, optional_in_parent: false }];
  expect(validateSequenceDraft({ ...base, entries, blocks }, ctx).errors).toEqual([]);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22; npx vitest run src/lib/sagas/validate-sequence-draft.test.ts
```

Esperado: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir la implementación**

```ts
// src/lib/sagas/validate-sequence-draft.ts
import type { SequencePayload } from "./sequence-draft";

/** Validación previa al envío, en la línea de `validate-route-draft.ts`.
 *  Devuelve códigos (el consumidor los traduce).
 *
 *  Con la interfaz de la fase 2a estos errores NO deberían poder producirse: el
 *  número lo deriva la posición y la zona determina el placement. Se validan
 *  igual porque son la última red antes del 23514 crudo de la BD, y porque un
 *  bug del cliente no debe llegar a Postgres — es exactamente el papel que
 *  cumple el mismo espejo en `member-actions.ts`. */
export function validateSequenceDraft(
  payload: SequencePayload,
  ctx: { childIds: Set<string> },
): { errors: string[]; unclassified: number } {
  const errors = new Set<string>();
  let unclassified = 0;

  const positions: number[] = [];
  const seen = new Set<string>();

  for (const e of payload.entries) {
    const key = `${e.item_type}:${e.item_id}`;
    if (seen.has(key)) errors.add("duplicate");
    seen.add(key);
    if ((e.placement === "fijo") !== (e.position !== null)) errors.add("placement");
    if (e.placement === null) unclassified++;
    if (e.position !== null) positions.push(e.position);
  }

  for (const b of payload.blocks) {
    if (seen.has(`saga:${b.child_saga_id}`)) errors.add("duplicate");
    seen.add(`saga:${b.child_saga_id}`);
    if (!ctx.childIds.has(b.child_saga_id)) errors.add("foreignBlock");
    if ((b.placement_in_parent === "fijo") !== (b.position_in_parent !== null)) errors.add("placement");
    if (b.placement_in_parent === null) unclassified++;
    if (b.position_in_parent !== null) positions.push(b.position_in_parent);
  }

  // Consecutivas desde 1 ADMITIENDO EMPATES: se comparan los huecos DISTINTOS,
  // así que 1,2,3,3,4 es válido y 1,3 no. Comprobar la lista con duplicados
  // contra su índice rechazaría el tándem, que es justo el dato que la fase
  // viene a permitir.
  const distinct = [...new Set(positions)].sort((a, b) => a - b);
  if (distinct.some((p, i) => p !== i + 1)) errors.add("positions");

  return { errors: [...errors], unclassified };
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

```bash
fnm use 22; npx vitest run src/lib/sagas/validate-sequence-draft.test.ts
```

Esperado: PASS, 8 pruebas.

- [ ] **Step 5: Inyección de fallo**

Sustituir `const distinct = [...new Set(positions)]...` por `const distinct = positions.slice().sort(...)`. **Debe caer** «acepta un empate». Deshacer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/validate-sequence-draft.ts src/lib/sagas/validate-sequence-draft.test.ts
git commit -m "feat(sagas): validación previa al guardado de la secuencia"
```

---

### Task 3: La RPC `save_saga_sequence` (dev) y el server action

**Files:**
- Create: `supabase/migrations/20260726_save_saga_sequence.sql`
- Create: `src/lib/sagas/sequence-actions.ts`

**Interfaces:**
- Consumes: `SequencePayload` (Task 1), `validateSequenceDraft` (Task 2).
- Produces: `saveSequence(sagaId: string, payload: SequencePayload, childIds: string[]): Promise<{ error?: string }>`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260726_save_saga_sequence.sql
--
-- Guardado atómico del editor de secuencia (spec 2026-07-26, fase 2a). Mismo
-- patrón y mismas garantías que `save_saga_route` (20260723_saga_routes.sql):
-- SECURITY DEFINER, gate de rol DENTRO de la función, revoke a public/anon.
--
-- DIFERENCIA DELIBERADA con save_saga_route y save_saga_graph: aquí NO hay
-- borrado por omisión. Las dos hermanas hacen `delete ... where <padre> = ...`
-- y reinsertan, porque sus filas solo las escribe su propio editor. `saga_items`
-- no: el formulario «Saga» de la ficha (`assignItemToSaga`) crea membresías
-- desde otra pantalla y otra persona. Con borrado por omisión, un curador que
-- abriera el editor, se fuera a comer y guardara borraría la obra que otro
-- añadió mientras tanto, sin error visible. Con `p_removed`, lo peor que pasa
-- es que un borrador rancio no la incluya.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks  jsonb,
  p_removed jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from sagas where id = p_saga_id) then
    raise exception 'saga % not found', p_saga_id;
  end if;

  -- Obras de ESTA saga. El insert es lo que permite dar de alta desde el rail
  -- sin escribir en BD hasta que se guarda.
  insert into saga_items (saga_id, item_type, item_id, position, placement, optional, role, is_primary)
  select
    p_saga_id,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'position')::integer,
    (e->>'placement')::public.saga_placement,
    coalesce((e->>'optional')::boolean, false),
    (e->>'role')::public.saga_item_role,
    false
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e
  on conflict (saga_id, item_type, item_id) do update
    set position  = excluded.position,
        placement = excluded.placement,
        optional  = excluded.optional,
        role      = excluded.role;

  -- Hijas DIRECTAS. Sin insert ni delete: anidar y desanidar cambian
  -- `parent_saga_id` y son competencia de editor-actions.ts, no de la
  -- secuencia. El `where parent_saga_id = p_saga_id` impide que una petición
  -- manipulada recoloque la hija de otra saga.
  update sagas s
     set position_in_parent  = (b->>'position_in_parent')::integer,
         placement_in_parent = (b->>'placement_in_parent')::public.saga_placement,
         optional_in_parent  = coalesce((b->>'optional_in_parent')::boolean, false)
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b
   where s.id = (b->>'child_saga_id')::uuid
     and s.parent_saga_id = p_saga_id;

  -- Bajas explícitas, y SOLO estas.
  delete from saga_items si
   using jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) as r
   where si.saga_id = p_saga_id
     and si.item_type = (r->>'item_type')::public.item_type
     and si.item_id = (r->>'item_id')::uuid;
end;
$$;

revoke execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) is
  'Guardado atómico de la secuencia de una saga: obras propias, colocación de hijas directas y bajas explícitas. Collaborator+. La baja NUNCA es por omisión.';
```

- [ ] **Step 2: Aplicarla a dev y verificarla contra los objetos reales**

Con `mcp__supabase-dev__apply_migration`. Después, verificar **contra `pg_proc`, no contra `list_migrations`** (`AGENTS.md`):

```sql
select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'save_saga_sequence';
```

Esperado: una fila, `prosecdef = true`, `args = 'p_saga_id uuid, p_entries jsonb, p_blocks jsonb, p_removed jsonb'`.

- [ ] **Step 3: Comprobar en dev que la baja NO es por omisión**

Es la garantía que justifica apartarse del patrón de las hermanas, así que se comprueba a mano contra la BD real antes de escribir el cliente. Sobre una saga de la semilla QA, dentro de una transacción que se deshace:

```sql
begin;
-- estado previo: cuántas obras tiene
select count(*) from saga_items where saga_id = '<saga qa>';
-- se guarda una secuencia con UNA SOLA obra y sin bajas
select public.save_saga_sequence(
  '<saga qa>'::uuid,
  '[{"item_id":"<obra 1>","item_type":"book","position":1,"placement":"fijo","optional":false,"role":null}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb);
-- las demás DEBEN seguir ahí
select count(*) from saga_items where saga_id = '<saga qa>';
rollback;
```

Esperado: los dos `count` iguales. Si el segundo baja, el `delete` está mal escrito y hay que parar.

- [ ] **Step 4: Escribir el server action**

```ts
// src/lib/sagas/sequence-actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { revalidateSagaEditPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { validateSequenceDraft } from "./validate-sequence-draft";
import type { SequencePayload } from "./sequence-draft";

// Doble gate a propósito: la RLS de saga_items ya exige collaborator+ y la RPC
// lo vuelve a comprobar por dentro; aun así se comprueba aquí. Los tres, nunca
// solo uno (mismo criterio que route-actions.ts).
export async function saveSequence(
  sagaId: string,
  payload: SequencePayload,
  childIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  const { errors } = validateSequenceDraft(payload, { childIds: new Set(childIds) });
  if (errors.length > 0) return { error: errors[0] };

  const { error } = await supabase.rpc("save_saga_sequence", {
    p_saga_id: sagaId,
    p_entries: payload.entries,
    p_blocks: payload.blocks,
    p_removed: payload.removed,
  });
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  revalidateSagaEditPage(sagaId);
  return {};
}
```

- [ ] **Step 5: Comprobar que compila**

```bash
fnm use 22; npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260726_save_saga_sequence.sql src/lib/sagas/sequence-actions.ts
git commit -m "feat(sagas): RPC save_saga_sequence con baja explícita, y su server action"
```

---

### Task 4: La carga de datos de la pantalla

**Files:**
- Create: `src/lib/sagas/get-saga-sequence.ts`
- Modify: `src/lib/sagas/types.ts` (añadir `placementInParent` a `SagaChildRef`)
- Modify: `src/lib/sagas/get-saga-detail.ts:97` y `:143-151` y `:482-488` (traer y propagar la columna nueva)

**Interfaces:**
- Produces: `getSagaSequence(supabase, sagaId): Promise<{ draft: SequenceDraft; childIds: string[]; childSagas: Array<{ id; name; accentColor; count }> } | null>` — ya repartido en las tres zonas por `hydrateSequenceDraft`, que se exporta aparte para poder probarla sin Supabase.

- [ ] **Step 1: Añadir `placementInParent` al tipo**

En `src/lib/sagas/types.ts`, dentro de `SagaChildRef`, tras `positionInParent`:

```ts
  /** Colocación del bloque en su padre (sagas.placement_in_parent). null = sin
   *  clasificar, y entonces el bloque cae en la zona 3 del editor del padre. */
  placementInParent: SagaPlacement | null;
```

En `get-saga-detail.ts`: añadir `placement_in_parent` al `select` de `fetchDescendants` (línea 97) y al tipo `DescendantRow`, y `placementInParent: d.placement_in_parent` a los dos sitios que construyen `SagaChildRef` (`children`, líneas 143-151, y `childRefs`, 482-488).

- [ ] **Step 2: Escribir el cargador**

```ts
// src/lib/sagas/get-saga-sequence.ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { DraftEntry, SequenceDraft } from "./sequence-draft";
import type { SagaItemRole, SagaPlacement } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books", movie: "movies", series: "series",
};

// Carga los insumos del EDITOR, que no son los de la ficha. getSagaDetail baja
// todo el subárbol y lo deduplica para pintarlo; aquí hace falta lo contrario:
// SOLO las filas cuyo saga_id es esta saga, porque son las únicas que esta
// pantalla puede escribir. Los miembros de una subsaga se editan en la pantalla
// de esa subsaga (#187), y usar getSagaDetail aquí reintroduciría justo la
// lista plana que aquella issue cerró.
export async function getSagaSequence(
  supabase: SupabaseServerClient,
  sagaId: string,
): Promise<{
  draft: SequenceDraft;
  childIds: string[];
  /** Datos planos y serializables de las hijas para el rail. Nunca un `Map`:
   *  esto cruza la frontera servidor→cliente. */
  childSagas: Array<{ id: string; name: string; accentColor: string | null; count: number }>;
} | null> {
  const [{ data: itemRows }, { data: childRows }] = await Promise.all([
    supabase
      .from("saga_items")
      .select("item_type, item_id, position, placement, optional, role")
      .eq("saga_id", sagaId)
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("sagas")
      .select("id, name, accent_color, position_in_parent, placement_in_parent, optional_in_parent")
      .eq("parent_saga_id", sagaId),
  ]);
  if (!itemRows && !childRows) return null;

  const rows = (itemRows ?? []) as Array<{
    item_type: ItemType; item_id: string; position: number | null;
    placement: SagaPlacement | null; optional: boolean; role: SagaItemRole | null;
  }>;

  // Metadatos de catálogo por tipo, una consulta por tabla (mismo patrón que
  // get-saga-detail.ts:200-216).
  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const r of rows) idsByType[r.item_type].push(r.item_id);
  const meta = new Map<string, { title: string; coverUrl: string | null }>();
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type]).select("id, title, cover_url").in("id", idsByType[type]);
      for (const r of data ?? []) meta.set(`${type}:${r.id}`, { title: r.title as string, coverUrl: (r.cover_url as string | null) ?? null });
    }),
  );

  // Recuento de obras por subsaga, para el «BLOQUE · 8 OBRAS» de su fila.
  const children = (childRows ?? []) as Array<{
    id: string; name: string; accent_color: string | null;
    position_in_parent: number | null; placement_in_parent: SagaPlacement | null; optional_in_parent: boolean;
  }>;
  const counts = new Map<string, number>();
  if (children.length > 0) {
    const { data } = await supabase.from("saga_items").select("saga_id").in("saga_id", children.map((c) => c.id));
    for (const r of data ?? []) counts.set(r.saga_id as string, (counts.get(r.saga_id as string) ?? 0) + 1);
  }

  const entries: Array<{ entry: DraftEntry; position: number | null; placement: SagaPlacement | null }> = [];
  for (const r of rows) {
    const m = meta.get(`${r.item_type}:${r.item_id}`);
    if (!m) continue; // huérfana de catálogo: no se pinta ni se toca
    entries.push({
      position: r.position, placement: r.placement,
      entry: {
        key: `i:${r.item_type}:${r.item_id}`, kind: "item", itemType: r.item_type, itemId: r.item_id,
        childSagaId: null, title: m.title, coverUrl: m.coverUrl, accentColor: null, count: null,
        optional: r.optional, role: r.role, isNew: false,
      },
    });
  }
  for (const c of children) {
    entries.push({
      position: c.position_in_parent, placement: c.placement_in_parent,
      entry: {
        key: `s:${c.id}`, kind: "block", itemType: null, itemId: null, childSagaId: c.id,
        title: c.name, coverUrl: null, accentColor: c.accent_color, count: counts.get(c.id) ?? 0,
        optional: c.optional_in_parent, role: null, isNew: false,
      },
    });
  }

  return {
    draft: hydrateSequenceDraft(entries),
    childIds: children.map((c) => c.id),
    childSagas: children.map((c) => ({
      id: c.id, name: c.name, accentColor: c.accent_color, count: counts.get(c.id) ?? 0,
    })),
  };
}

/** Reparte las filas en las tres zonas y agrupa por hueco. Exportada aparte —y
 *  pura— para poder probarla sin Supabase: es donde vive la única lógica de
 *  este fichero (el empate de `position` ES el tándem, así que dos filas con el
 *  mismo número tienen que caer en el MISMO hueco, no en dos). */
export function hydrateSequenceDraft(
  rows: Array<{ entry: DraftEntry; position: number | null; placement: SagaPlacement | null }>,
): SequenceDraft {
  const byPosition = new Map<number, DraftEntry[]>();
  const free: DraftEntry[] = [];
  const unclassified: DraftEntry[] = [];
  for (const r of rows) {
    if (r.placement === "fijo" && r.position !== null) {
      byPosition.set(r.position, [...(byPosition.get(r.position) ?? []), r.entry]);
    } else if (r.placement === "libre") {
      free.push(r.entry);
    } else {
      unclassified.push(r.entry);
    }
  }
  const slots = [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  return { slots, free, unclassified, removed: [] };
}
```

- [ ] **Step 3: Escribir la prueba de la hidratación**

```ts
// src/lib/sagas/get-saga-sequence.test.ts
import { describe, expect, it } from "vitest";
import { hydrateSequenceDraft } from "./get-saga-sequence";
import type { DraftEntry } from "./sequence-draft";

const e = (id: string): DraftEntry => ({
  key: `i:book:${id}`, kind: "item", itemType: "book", itemId: id, childSagaId: null,
  title: id, coverUrl: null, accentColor: null, count: null, optional: false, role: null, isNew: false,
});

it("dos filas con el MISMO número caen en el mismo hueco: eso es el tándem", () => {
  const d = hydrateSequenceDraft([
    { entry: e("a"), position: 1, placement: "fijo" },
    { entry: e("b"), position: 2, placement: "fijo" },
    { entry: e("c"), position: 2, placement: "fijo" },
  ]);
  expect(d.slots.map((s) => s.map((x) => x.itemId))).toEqual([["a"], ["b", "c"]]);
});

it("reparte por zona y ordena los huecos aunque lleguen desordenados", () => {
  const d = hydrateSequenceDraft([
    { entry: e("z"), position: 3, placement: "fijo" },
    { entry: e("a"), position: 1, placement: "fijo" },
    { entry: e("f"), position: null, placement: "libre" },
    { entry: e("u"), position: null, placement: null },
  ]);
  expect(d.slots.map((s) => s[0].itemId)).toEqual(["a", "z"]);
  expect(d.free.map((x) => x.itemId)).toEqual(["f"]);
  expect(d.unclassified.map((x) => x.itemId)).toEqual(["u"]);
});

it("un hueco con número pero placement nulo cae en «sin clasificar», no en la secuencia", () => {
  // El CHECK de BD lo impide, pero si una fila así existiera NO puede colarse
  // en la secuencia con un número que la interfaz no puede corregir.
  const d = hydrateSequenceDraft([{ entry: e("raro"), position: 7, placement: null }]);
  expect(d.slots).toEqual([]);
  expect(d.unclassified.map((x) => x.itemId)).toEqual(["raro"]);
});
```

- [ ] **Step 4: Ejecutar pruebas y tipos**

```bash
fnm use 22; npx vitest run src/lib/sagas/get-saga-sequence.test.ts; npx tsc --noEmit
```

Esperado: 3 pruebas en verde y `tsc` limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/get-saga-sequence.ts src/lib/sagas/get-saga-sequence.test.ts src/lib/sagas/types.ts src/lib/sagas/get-saga-detail.ts
git commit -m "feat(sagas): carga del editor de secuencia (solo las filas de esta saga)"
```

---

### Task 5: El hook único de estado y la fila compartida

**Files:**
- Create: `src/components/saga/sequence/use-sequence-draft.ts`
- Create: `src/components/saga/sequence/sequence-row.tsx`
- Modify: `messages/es.json` (namespace `sagaEditor`)

**Interfaces:**
- Consumes: todo `sequence-draft.ts` (Task 1), `saveSequence` (Task 3).
- Produces: `useSequenceDraft(initial, sagaId, childIds)` → `{ draft, ops, save, error, unclassified, status }`, donde `ops` expone las ocho operaciones (`moveSlot`, `sendTo`, `pairWith`, `unpair`, `setOptional`, `setRole`, `add`, `remove`) ya ligadas al `setState`, y `status` es `"idle" | "dirty" | "saving" | "saved" | "error"`. `SequenceRow` (presentación pura, sin estado).

**Es la pieza que sostiene la restricción global**: el estado vive aquí y solo aquí; `A` y `B` lo reciben.

- [ ] **Step 1: Escribir el hook**

```tsx
// src/components/saga/sequence/use-sequence-draft.ts
"use client";

import { useMemo, useState, useTransition } from "react";
import { saveSequence } from "@/lib/sagas/sequence-actions";
import { validateSequenceDraft } from "@/lib/sagas/validate-sequence-draft";
import {
  addEntry, moveSlot, pairWith, removeEntry, sendTo, setOptional, setRole, toPayload, unpair,
  type DraftEntry, type SequenceDraft, type ZoneId,
} from "@/lib/sagas/sequence-draft";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** ÚNICA fuente de estado del editor (restricción global del plan). Las dos
 *  cáscaras —A escritorio, B móvil— consumen esto; ninguna guarda estado del
 *  borrador por su cuenta. Duplicarlo por breakpoint serían dos borradores
 *  vivos sobre los mismos datos (regla de los dos árboles, docs/redesign). */
export function useSequenceDraft(initial: SequenceDraft, sagaId: string, childIds: string[]) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const touch = (fn: (d: SequenceDraft) => SequenceDraft) => {
    setDraft((d) => fn(d));
    setStatus("dirty");
  };

  const ops = useMemo(
    () => ({
      moveSlot: (i: number, delta: number) => touch((d) => moveSlot(d, i, delta)),
      sendTo: (key: string, zone: ZoneId) => touch((d) => sendTo(d, key, zone)),
      pairWith: (key: string, slot: number) => touch((d) => pairWith(d, key, slot)),
      unpair: (i: number) => touch((d) => unpair(d, i)),
      setOptional: (key: string, v: boolean) => touch((d) => setOptional(d, key, v)),
      setRole: (key: string, r: DraftEntry["role"]) => touch((d) => setRole(d, key, r)),
      add: (e: DraftEntry) => touch((d) => addEntry(d, e)),
      remove: (key: string) => touch((d) => removeEntry(d, key)),
    }),
    [],
  );

  // El aviso se recalcula con el borrador, no al guardar: la barra tiene que
  // decir cuántas sin clasificar quedan MIENTRAS se cura, no después.
  const check = useMemo(
    () => validateSequenceDraft(toPayload(draft), { childIds: new Set(childIds) }),
    [draft, childIds],
  );

  const save = () =>
    startTransition(async () => {
      setStatus("saving");
      const res = await saveSequence(sagaId, toPayload(draft), childIds);
      if (res.error) {
        setError(res.error);
        setStatus("error");
        return;
      }
      // El borrador guardado deja de tener bajas pendientes y de tener altas
      // "nuevas": si no se limpian, un segundo Guardar reenviaría un DELETE de
      // algo ya borrado y `removeEntry` trataría como nueva una fila que ya
      // existe en BD.
      setDraft((d) => ({
        ...d,
        removed: [],
        slots: d.slots.map((s) => s.map((e) => ({ ...e, isNew: false }))),
        free: d.free.map((e) => ({ ...e, isNew: false })),
        unclassified: d.unclassified.map((e) => ({ ...e, isNew: false })),
      }));
      setError(null);
      setStatus("saved");
    });

  // No se devuelve `check.errors`: con esta interfaz esos errores son
  // inalcanzables (el número lo deriva la posición, la zona el placement) y
  // `saveSequence` los vuelve a validar en servidor antes del RPC. Exponerlos
  // aquí sería API muerta.
  return {
    draft,
    ops,
    save,
    error,
    unclassified: check.unclassified,
    status: pending ? ("saving" as const) : status,
  };
}
```

- [ ] **Step 2: Escribir la fila compartida**

```tsx
// src/components/saga/sequence/sequence-row.tsx
"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { SAGA_ACCENT, isSagaAccentToken } from "@/lib/sagas/accents";
import type { DraftEntry } from "@/lib/sagas/sequence-draft";
import type { SagaItemRole } from "@/lib/sagas/types";

const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];

/** Fila de obra y de bloque-subsaga. Presentación pura: recibe la entrada y
 *  callbacks, no toca el borrador. `density` es lo único que cambia entre las
 *  dos cáscaras — en escritorio los controles van en línea, en móvil el número
 *  y la portada son mayores y el resto vive en la hoja. */
export function SequenceRow({
  entry, slotNumber, density, onOptional, onRole, onMenu, controls,
}: {
  entry: DraftEntry;
  /** Número del hueco, o null fuera de la secuencia. Lo calcula quien pinta la
   *  zona: la fila NO lo deriva ni lo deja teclear. */
  slotNumber: number | null;
  density: "compact" | "roomy";
  onOptional: (v: boolean) => void;
  onRole: (r: SagaItemRole | null) => void;
  onMenu: () => void;
  /** ↑ ↓ y el asa, que solo existen dentro de la secuencia. */
  controls?: React.ReactNode;
}) {
  const t = useTranslations("sagaEditor");
  const isBlock = entry.kind === "block";
  const accent = isSagaAccentToken(entry.accentColor) ? SAGA_ACCENT[entry.accentColor] : null;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border border-border bg-surface py-2 pl-1.5 pr-2.5 ${
        isBlock && accent ? `border-l-[3px] ${accent.border}` : ""
      }`}
      data-testid="sequence-row"
      data-key={entry.key}
    >
      <span
        className={`w-6 shrink-0 text-center font-mono text-[15px] font-medium ${
          slotNumber === null ? "text-[13px] text-foreground-faint" : "text-accent"
        }`}
      >
        {slotNumber ?? "·"}
      </span>

      {isBlock ? (
        <span className={`grid h-12 w-8 shrink-0 place-items-center rounded ${accent?.bg ?? "bg-surface-muted"} text-[13px]`} aria-hidden />
      ) : entry.coverUrl ? (
        <Image src={entry.coverUrl} alt="" width={32} height={47} className="h-[47px] w-8 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-[47px] w-8 shrink-0 rounded bg-surface-muted" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[13.5px] font-semibold leading-tight">{entry.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {isBlock ? (
            <span className="font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
              {t("blockMeta", { count: entry.count ?? 0 })}
            </span>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {t(`itemType.${entry.itemType}`)}
            </span>
          )}
          {entry.optional && (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-muted-foreground">
              {t("optionalChip")}
            </span>
          )}
        </div>
      </div>

      {density === "compact" && (
        <>
          <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <input
              type="checkbox"
              checked={entry.optional}
              onChange={(e) => onOptional(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t("optionalChip")}
          </label>
          {!isBlock && (
            <select
              value={entry.role ?? ""}
              onChange={(e) => onRole((e.target.value || null) as SagaItemRole | null)}
              aria-label={t("roleLabelFor", { title: entry.title })}
              className="w-[150px] shrink-0 rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-[11.5px]"
            >
              <option value="">{t("roleNone")}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{t(`role.${r}`)}</option>
              ))}
            </select>
          )}
        </>
      )}

      {controls}

      <button
        type="button"
        onClick={onMenu}
        aria-label={t("rowMenuFor", { title: entry.title })}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-foreground-faint hover:bg-surface-muted"
      >
        ⋯
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Añadir las claves de i18n**

En `messages/es.json`, namespace `sagaEditor` (junto a las que ya existen):

```json
"zoneSequence": "La secuencia",
"zoneSequenceHint": "El orden de lectura. Reordenar renumera.",
"zoneFree": "Cuando quieras",
"zoneFreeHint": "Obras que no ocupan un hueco del orden: se leen en varios puntos. Siguen contando para el progreso salvo que las marques opcional — son dos cosas distintas.",
"zoneFreeEmpty": "Todavía no hay nada aquí",
"zoneUnclassified": "Sin clasificar",
"zoneUnclassifiedHint": "Ni colocadas en el orden ni marcadas como libres. Mándalas a una de las dos zonas de arriba.",
"blockMeta": "Bloque · {count} obras",
"blockOpenEditor": "Abrir su editor",
"optionalChip": "opcional",
"roleNone": "Sin rol",
"roleLabelFor": "Rol narrativo de {title}",
"rowMenuFor": "Acciones de {title}",
"itemType": { "book": "Libro", "movie": "Película", "series": "Serie" },
"role": { "precuela": "Precuela", "spin_off": "Spin-off", "relato": "Relato", "paralela": "Paralela" },
"moveUp": "Subir un hueco",
"moveDown": "Bajar un hueco",
"sendToSequence": "Enviar a la secuencia",
"sendToFree": "Enviar a «Cuando quieras»",
"sendToUnclassified": "Dejar sin clasificar",
"pairPrompt": "Mismo hueco que otra obra…",
"pairConfirm": "Emparejar en el hueco {n}",
"pairFilter": "Filtrar obras de la secuencia…",
"tandemCaption": "Tándem · se leen a la vez",
"unpair": "Deshacer tándem",
"removeFromSaga": "Quitar de la saga",
"addEntry": "Añadir obra o bloque",
"addedAtEnd": "Se añade al final de la secuencia",
"saveSequence": "Guardar secuencia",
"saveNoChanges": "Sin cambios",
"saveDirtyShort": "Cambios sin guardar",
"saveAtomic": "Reemplazo total atómico",
"saving": "Guardando la secuencia…",
"savingHint": "No cierres la pantalla",
"saved": "Guardado",
"unclassifiedWarning": "Quedan {count} filas sin clasificar. Puedes guardar igualmente: es deuda de curación, no un error.",
"sequenceErrors": {
  "forbidden": "No tienes permiso para curar esta saga.",
  "positions": "Los huecos no son consecutivos.",
  "placement": "Una fila tiene número fuera de la secuencia, o le falta dentro.",
  "foreignBlock": "Hay un bloque que no es subsaga directa de esta saga.",
  "duplicate": "Hay una obra repetida.",
  "generic": "No se ha podido guardar."
}
```

- [ ] **Step 4: Comprobar tipos y traducciones**

```bash
fnm use 22; npx tsc --noEmit
```

Esperado: limpio. `SequenceRow` todavía no la usa nadie: es correcto, la consumen las Tasks 6 y 7.

- [ ] **Step 5: Commit**

```bash
git add src/components/saga/sequence/ messages/es.json
git commit -m "feat(sagas): hook único del borrador y fila compartida del editor"
```

---

### Task 6: Cáscara A — escritorio

**Files:**
- Create: `src/components/saga/sequence/shell-desktop.tsx`
- Modify: `src/components/saga/editor/editor-left-panel.tsx` (quitar la sección «Herramientas»)

**Interfaces:**
- Consumes: `useSequenceDraft` y `SequenceRow` (Task 5), `EditorLeftPanel`.
- Produces: `<ShellDesktop draft ops … />`, sin estado propio salvo el de apertura de menús.

Frame de referencia: **A3** de la maqueta. Cabecera con metadatos en una línea, `dgrid` de dos columnas (contenido + rail de 372px), las tres zonas apiladas en la columna de trabajo, barra de guardado pegada abajo.

- [ ] **Step 1: Quitar «Herramientas» del panel izquierdo**

En `editor-left-panel.tsx`: borrar la `<section>` de las líneas 204-220 (los radios `principal`/`opcional`/`requisito` y el `toolConnectHint`), y con ella las props `edgeTool` y `onEdgeTool` y el `import type { EdgeTool }` de la línea 9 — **es lo que desacopla el panel del grafo que muere en la Task 11**. Renombrar `onAddSagaNode` a `onAddBlock` en la firma y en sus dos usos internos.

- [ ] **Step 2: Escribir la cáscara**

```tsx
// src/components/saga/sequence/shell-desktop.tsx
"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { SequenceRow } from "./sequence-row";
import type { DraftEntry, SequenceDraft, ZoneId } from "@/lib/sagas/sequence-draft";

type Ops = {
  moveSlot: (i: number, delta: number) => void;
  sendTo: (key: string, zone: ZoneId) => void;
  unpair: (i: number) => void;
  setOptional: (key: string, v: boolean) => void;
  setRole: (key: string, r: DraftEntry["role"]) => void;
};

// Propuesta A (frame A3): las tres zonas a la vez. Verlas juntas es lo que
// enseña que «Cuando quieras» y «opcional» son ejes distintos, y en 1280 hay
// sitio de sobra. Sin estado del borrador: todo llega por props (restricción
// global del plan).
export function ShellDesktop({
  draft, ops, onMenu, rail, itineraries,
}: {
  draft: SequenceDraft;
  ops: Ops;
  onMenu: (key: string) => void;
  /** Rail ya construido por `SequenceEditor` (necesita callbacks del borrador). */
  rail: React.ReactNode;
  itineraries: React.ReactNode;
}) {
  const t = useTranslations("sagaEditor");

  const nudges = (i: number) => (
    <div className="flex shrink-0 gap-0.5">
      <button
        type="button" onClick={() => ops.moveSlot(i, -1)} disabled={i === 0} aria-label={t("moveUp")}
        className="grid h-6 w-6 place-items-center rounded-lg border border-border text-[10px] text-muted-foreground disabled:opacity-40"
      >↑</button>
      <button
        type="button" onClick={() => ops.moveSlot(i, 1)} disabled={i === draft.slots.length - 1} aria-label={t("moveDown")}
        className="grid h-6 w-6 place-items-center rounded-lg border border-border text-[10px] text-muted-foreground disabled:opacity-40"
      >↓</button>
    </div>
  );

  const row = (e: DraftEntry, slotNumber: number | null, controls?: React.ReactNode) => (
    <SequenceRow
      key={e.key} entry={e} slotNumber={slotNumber} density="compact" controls={controls}
      onOptional={(v) => ops.setOptional(e.key, v)}
      onRole={(r) => ops.setRole(e.key, r)}
      onMenu={() => onMenu(e.key)}
    />
  );

  return (
    <div className="grid grid-cols-[1fr_372px] gap-6 px-6 pb-24 pt-5">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <h2 className="font-serif text-[19px] font-semibold">{t("zoneSequence")}</h2>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("slotCount", { count: draft.slots.length })}
          </span>
        </div>
        <p className="mb-3 text-[12px] text-muted-foreground">{t("zoneSequenceHint")}</p>

        <div className="grid gap-2">
          {draft.slots.map((slot, i) =>
            slot.length === 1 ? (
              row(slot[0], i + 1, nudges(i))
            ) : (
              <div key={`slot-${i}`} className="flex items-stretch gap-2">
                <div className="flex w-14 shrink-0 flex-col items-center gap-1 pt-2">
                  <span className="font-mono text-[15px] text-accent">{i + 1}</span>
                  <span className="w-0.5 flex-1 rounded bg-accent/40" aria-hidden />
                </div>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <p className="pl-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-accent">{t("tandemCaption")}</p>
                  {slot.map((e) => row(e, null, nudges(i)))}
                  <button
                    type="button" onClick={() => ops.unpair(i)}
                    className="w-full rounded-lg border border-dashed border-border py-1.5 text-[11.5px] font-semibold text-muted-foreground"
                  >{t("unpair")}</button>
                </div>
              </div>
            ),
          )}
        </div>

        <Zone title={t("zoneFree")} hint={t("zoneFreeHint")} empty={draft.free.length === 0} emptyTitle={t("zoneFreeEmpty")}>
          {draft.free.map((e) => row(e, null))}
        </Zone>

        {draft.unclassified.length > 0 && (
          <section className="mt-5 rounded-xl border border-gold/45 bg-gold/[0.07] p-3.5">
            <div className="mb-1 flex items-center gap-2">
              <b className="font-serif text-[15px]">{t("zoneUnclassified")}</b>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-gold-ink">
                {t("debtCount", { count: draft.unclassified.length })}
              </span>
            </div>
            <p className="mb-2.5 text-[12px] text-gold-ink">{t("zoneUnclassifiedHint")}</p>
            <div className="grid gap-2">
              {draft.unclassified.map((e) => (
                <div key={e.key} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">{row(e, null)}</div>
                  <button type="button" onClick={() => ops.sendTo(e.key, "sequence")} className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold">
                    {t("sendToSequence")}
                  </button>
                  <button type="button" onClick={() => ops.sendTo(e.key, "free")} className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold">
                    {t("sendToFree")}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-3.5">
        {rail}
        {itineraries}
      </aside>
    </div>
  );
}

function Zone({ title, hint, empty, emptyTitle, children }: {
  title: string; hint: string; empty: boolean; emptyTitle: string; children: React.ReactNode;
}) {
  return (
    <section className={`mt-5 rounded-xl border border-dashed border-foreground/25 p-3.5 ${empty ? "bg-surface/55" : ""}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <b className="font-serif text-[15px]">{empty ? emptyTitle : title}</b>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{hint}</p>
      {!empty && <div className="mt-2.5 grid gap-2">{children}</div>}
    </section>
  );
}
```

Añadir a `messages/es.json` las dos claves nuevas: `"slotCount": "{count} huecos"` y `"debtCount": "{count} filas"`.

- [ ] **Step 3: Comprobar tipos**

```bash
fnm use 22; npx tsc --noEmit
```

Esperado: limpio.

- [ ] **Step 4: Commit**

```bash
git add src/components/saga/sequence/shell-desktop.tsx src/components/saga/editor/editor-left-panel.tsx messages/es.json
git commit -m "feat(sagas): cáscara de escritorio del editor de secuencia (propuesta A)"
```

---

### Task 7: Cáscara B — móvil, con pestañas y hoja por fila

**Files:**
- Create: `src/components/saga/sequence/shell-mobile.tsx`
- Create: `src/components/saga/sequence/row-sheet.tsx`

**Interfaces:**
- Consumes: `SequenceRow`, las mismas `Ops` que la Task 6 más `remove`.
- Produces: `<ShellMobile … />` y `<RowSheet … />`. La pestaña activa **sí** es estado local (es preferencia de vista, no borrador); el borrador sigue viniendo por props.

Frames **B1** y **B2**. La hoja es el **gemelo pulsable de todos los gestos de arrastre**: sin ella la cáscara móvil no cumple la restricción de accesibilidad del plan.

- [ ] **Step 1: Escribir la hoja**

```tsx
// src/components/saga/sequence/row-sheet.tsx
"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { DraftEntry, ZoneId } from "@/lib/sagas/sequence-draft";
import type { SagaItemRole } from "@/lib/sagas/types";

const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];
const ZONES: ZoneId[] = ["sequence", "free", "unclassified"];

/** Hoja de una fila (frame B2). Es el gemelo pulsable y tecleable de cada
 *  gesto de arrastre: cambiar de zona, subir, bajar, emparejar y quitar. Sin
 *  ella, la cáscara móvil dependería de arrastrar — prohibido por el plan. */
export function RowSheet({
  entry, zone, slotNumber, canMoveUp, canMoveDown,
  onZone, onRole, onOptional, onMove, onPair, onRemove, onClose,
}: {
  entry: DraftEntry;
  zone: ZoneId;
  slotNumber: number | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onZone: (z: ZoneId) => void;
  onRole: (r: SagaItemRole | null) => void;
  onOptional: (v: boolean) => void;
  onMove: (delta: number) => void;
  onPair: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const ref = useRef<HTMLDialogElement>(null);
  // `<dialog>` nativo con showModal(), como el resto de hojas del repo
  // (item-connect-sheet.tsx, profile-settings-sheet.tsx): trae gratis el cierre
  // con Esc, la trampa de foco y el `inert` del fondo. Reimplementarlo con un
  // div superpuesto sería perder las tres cosas justo en la pieza que existe
  // para cumplir la restricción de accesibilidad del plan.
  useEffect(() => { ref.current?.showModal(); }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={entry.title}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto mb-0 mt-auto w-full max-w-lg rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim"
    >
      <div className="px-4 pb-5 pt-3.5">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-surface-3" aria-hidden />
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <b className="block truncate font-serif text-[15px] font-semibold">{entry.title}</b>
            <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
              {slotNumber === null ? t(`zone.${zone}`) : t("slotN", { n: slotNumber })}
            </span>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("close")} className="grid h-8 w-8 place-items-center rounded-lg border border-border">✕</button>
        </div>

        <fieldset className="mb-3 grid gap-1.5">
          <legend className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{t("whereRead")}</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {ZONES.map((z) => (
              <button
                key={z} type="button" onClick={() => onZone(z)} aria-pressed={zone === z}
                className={`rounded-lg border px-1.5 py-2 text-[11.5px] font-semibold ${
                  zone === z ? "border-transparent bg-accent text-accent-foreground" : "border-border bg-surface-muted text-muted-foreground"
                }`}
              >
                {z === "sequence" && slotNumber !== null ? t("slotN", { n: slotNumber }) : t(`zone.${z}`)}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("zoneChangeHint")}</p>
        </fieldset>

        {entry.kind === "item" && (
          <label className="mb-3 grid gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{t("whatIs")}</span>
            <select
              value={entry.role ?? ""}
              onChange={(e) => onRole((e.target.value || null) as SagaItemRole | null)}
              className="rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[12.5px]"
            >
              <option value="">{t("roleNone")}</option>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </select>
          </label>
        )}

        <label className="mb-3 flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2.5">
          <input type="checkbox" checked={entry.optional} onChange={(e) => onOptional(e.target.checked)} className="h-4 w-4 rounded border-border" />
          <span className="flex-1 text-[12.5px]">
            {t("optionalTitle")}
            <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{t("optionalHint")}</span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} className="rounded-lg border border-border p-2.5 text-[12px] font-semibold disabled:opacity-40">↑ {t("moveUp")}</button>
          <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} className="rounded-lg border border-border p-2.5 text-[12px] font-semibold disabled:opacity-40">↓ {t("moveDown")}</button>
          <button type="button" onClick={onPair} className="col-span-2 rounded-lg border border-border p-2.5 text-left text-[12px] font-semibold">⇥ {t("pairPrompt")}</button>
          <button type="button" onClick={onRemove} className="col-span-2 rounded-lg border border-border p-2.5 text-left text-[12px] font-semibold text-status-dropped">✕ {t("removeFromSaga")}</button>
        </div>
      </div>
    </dialog>
  );
}
```

Claves nuevas en `messages/es.json`: `"zone": { "sequence": "La secuencia", "free": "Cuando quieras", "unclassified": "Sin clasificar" }`, `"slotN": "Hueco {n}"`, `"whereRead": "Dónde se lee"`, `"whatIs": "Qué es"`, `"zoneChangeHint": "Fuera de la secuencia no hay número: al mover, se libera el hueco y se renumera el resto."`, `"optionalTitle": "Opcional"`, `"optionalHint": "No cuenta para el progreso de la saga."`, `"close": "Cerrar"`.

- [ ] **Step 2: Escribir la cáscara móvil**

```tsx
// src/components/saga/sequence/shell-mobile.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SequenceRow } from "./sequence-row";
import type { DraftEntry, SequenceDraft, ZoneId } from "@/lib/sagas/sequence-draft";

const TABS: ZoneId[] = ["sequence", "free", "unclassified"];

// Propuesta B (frames B1/B2): una zona a la vez. A 400px apilar tres zonas de
// las que dos estarán vacías el día 1 empujaría la lista de 5 obras —el caso
// real— fuera de la pantalla.
//
// La pestaña activa SÍ es estado local: es preferencia de vista, no borrador.
// El borrador sigue llegando por props (restricción global del plan).
export function ShellMobile({
  draft, ops, onMenu, rail, itineraries,
}: {
  draft: SequenceDraft;
  ops: {
    moveSlot: (i: number, delta: number) => void;
    sendTo: (key: string, zone: ZoneId) => void;
    unpair: (i: number) => void;
    setOptional: (key: string, v: boolean) => void;
    setRole: (key: string, r: DraftEntry["role"]) => void;
  };
  onMenu: (key: string) => void;
  /** El mismo nodo que en escritorio, aquí plegado: en 400px el buscador de
   *  catálogo y los itinerarios no pueden ocupar sitio permanente. */
  rail: React.ReactNode;
  itineraries: React.ReactNode;
}) {
  const t = useTranslations("sagaEditor");
  const [tab, setTab] = useState<ZoneId>("sequence");
  const counts: Record<ZoneId, number> = {
    sequence: draft.slots.reduce((n, s) => n + s.length, 0),
    free: draft.free.length,
    unclassified: draft.unclassified.length,
  };

  const row = (e: DraftEntry, slotNumber: number | null) => (
    <SequenceRow
      key={e.key} entry={e} slotNumber={slotNumber} density="roomy"
      onOptional={(v) => ops.setOptional(e.key, v)}
      onRole={(r) => ops.setRole(e.key, r)}
      onMenu={() => onMenu(e.key)}
    />
  );

  return (
    <div className="px-3.5">
      <div role="tablist" className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {TABS.map((z) => (
          <button
            key={z} role="tab" type="button" aria-selected={tab === z} onClick={() => setTab(z)}
            className={`flex-1 rounded-lg px-1 py-2 text-center text-[11.5px] font-semibold leading-tight ${
              tab === z ? "bg-surface text-foreground shadow-sm" : z === "unclassified" && counts.unclassified > 0 ? "text-gold-ink" : "text-muted-foreground"
            }`}
          >
            {t(`zone.${z}`)}
            <span className="mt-0.5 block font-mono text-[9px] text-foreground-faint">{counts[z]}</span>
          </button>
        ))}
      </div>

      {tab === "sequence" && (
        <div className="mt-3">
          <p className="mb-2.5 text-[12px] text-muted-foreground">{t("zoneSequenceHintMobile")}</p>
          <div className="grid gap-2">
            {draft.slots.map((slot, i) =>
              slot.length === 1 ? row(slot[0], i + 1) : (
                <div key={`slot-${i}`} className="flex items-stretch gap-2">
                  <div className="flex w-6 shrink-0 flex-col items-center gap-1 pt-2">
                    <span className="font-mono text-[15px] text-accent">{i + 1}</span>
                    <span className="w-0.5 flex-1 rounded bg-accent/40" aria-hidden />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <p className="pl-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-accent">{t("tandemCaption")}</p>
                    {slot.map((e) => row(e, null))}
                    <button type="button" onClick={() => ops.unpair(i)} className="rounded-lg border border-dashed border-border py-1.5 text-[11px] font-semibold text-muted-foreground">
                      {t("unpair")}
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {tab === "free" && (
        <div className="mt-3">
          {draft.free.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/55 px-4 py-4.5">
              <b className="font-serif text-[15px]">{t("zoneFreeEmpty")}</b>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t("zoneFreeHint")}</p>
            </div>
          ) : (
            <div className="grid gap-2">{draft.free.map((e) => row(e, null))}</div>
          )}
        </div>
      )}

      {tab === "unclassified" && (
        <div className="mt-3">
          <p className="mb-2.5 text-[12px] text-gold-ink">{t("zoneUnclassifiedHint")}</p>
          <div className="grid gap-2">
            {draft.unclassified.map((e) => (
              <div key={e.key} className="grid gap-1.5">
                {row(e, null)}
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => ops.sendTo(e.key, "sequence")} className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-semibold">{t("sendToSequence")}</button>
                  <button type="button" onClick={() => ops.sendTo(e.key, "free")} className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-semibold">{t("sendToFree")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="mt-4 rounded-xl border border-border bg-surface px-3 py-2.5">
        <summary className="text-[13px] font-semibold">{t("addEntry")}</summary>
        <div className="mt-2">{rail}</div>
      </details>
      <div className="mb-28 mt-2.5">{itineraries}</div>
    </div>
  );
}
```

Clave nueva: `"zoneSequenceHintMobile": "El orden de lectura. Mover una fila entre pestañas es lo que cambia su colocación."`

- [ ] **Step 3: Comprobar tipos**

```bash
fnm use 22; npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/saga/sequence/shell-mobile.tsx src/components/saga/sequence/row-sheet.tsx messages/es.json
git commit -m "feat(sagas): cáscara móvil del editor con pestañas y hoja por fila (propuesta B)"
```

---

### Task 8: El gesto del tándem

**Files:**
- Create: `src/components/saga/sequence/tandem-picker.tsx`

**Interfaces:**
- Consumes: `draft.slots`, `ops.pairWith`.
- Produces: `<TandemPicker entryKey slots onPair onCancel />`, usado por las dos cáscaras.

Frame **C1**: dos pasos. Se pide desde la fila, se elige el hueco en una lista filtrable, y al confirmar las dos filas quedan apiladas.

- [ ] **Step 1: Escribirlo**

```tsx
// src/components/saga/sequence/tandem-picker.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DraftEntry } from "@/lib/sagas/sequence-draft";

/** Paso 2 del tándem (frame C1): elegir a QUÉ hueco se empareja. Se ofrecen los
 *  huecos de la secuencia, nunca el de la propia fila — emparejar algo consigo
 *  mismo no significa nada y `pairWith` lo rechaza igual. */
export function TandemPicker({
  entryKey, slots, onPair, onCancel,
}: {
  entryKey: string;
  slots: DraftEntry[][];
  onPair: (slotIndex: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const options = slots
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => !slot.some((e) => e.key === entryKey))
    .filter(({ slot }) => slot.some((e) => e.title.toLowerCase().includes(filter.toLowerCase())));

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-label={t("pairPrompt")}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto mb-0 mt-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim sm:mb-auto sm:rounded-2xl"
    >
      <div className="p-4">
        <input
          value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder={t("pairFilter")} aria-label={t("pairFilter")}
          className="mb-2.5 w-full rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[12.5px]"
        />
        <ul className="grid gap-1.5">
          {options.map(({ slot, i }) => (
            <li key={i}>
              <button
                type="button" onClick={() => setChosen(i)} aria-pressed={chosen === i}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-2 py-2 text-left ${chosen === i ? "border-accent/50" : "border-border"}`}
              >
                <span className="w-6 shrink-0 text-center font-mono text-[15px] text-accent">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{slot.map((e) => e.title).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button" disabled={chosen === null} onClick={() => chosen !== null && onPair(chosen)}
          className="mt-3 w-full rounded-lg bg-accent py-2.5 text-[12.5px] font-semibold text-accent-foreground disabled:opacity-50"
        >
          {chosen === null ? t("pairPrompt") : t("pairConfirm", { n: chosen + 1 })}
        </button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Prueba de que el gesto produce el dato correcto**

La lógica ya está probada en la Task 1 (`pairWith`). Lo que falta cubrir es que el **selector no se ofrezca a sí mismo**, que es donde un despiste crea un hueco imposible. Añadir a `sequence-draft.test.ts`:

```ts
it("emparejar una fila con su propio hueco es un no-op", () => {
  const d = draft([[work("a"), work("b")], [work("c")]]);
  expect(pairWith(d, "i:book:b", 0)).toEqual(d);
});
```

```bash
fnm use 22; npx vitest run src/lib/sagas/sequence-draft.test.ts
```

Esperado: PASS, 13 pruebas.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/sequence/tandem-picker.tsx src/lib/sagas/sequence-draft.test.ts
git commit -m "feat(sagas): gesto del tándem — elegir hueco en dos pasos"
```

---

### Task 9: Raíz del editor, barra de guardado y página

**Files:**
- Create: `src/components/saga/sequence/sequence-save-bar.tsx`
- Create: `src/components/saga/sequence/sequence-itineraries.tsx`
- Create: `src/components/saga/sequence/sequence-editor.tsx`
- Modify: `src/app/saga/[id]/editar/page.tsx`
- Modify: `src/components/saga/sequence/shell-desktop.tsx` y `shell-mobile.tsx` (aceptar el nodo `itineraries`)
- Delete: `src/components/saga/saga-members-editor.tsx`, `src/lib/sagas/member-actions.ts`

**Interfaces:**
- Consumes: todo lo anterior, más `getSagaRoutes` de `./get-saga-routes`.
- Produces: `<SequenceEditor sagaId initial childIds rail itineraries />`, montado por la página.

- [ ] **Step 1: La barra**

```tsx
// src/components/saga/sequence/sequence-save-bar.tsx
"use client";

import { useTranslations } from "next-intl";
import type { SaveStatus } from "./use-sequence-draft";

/** Frame C3, menos su cuarto estado. La maqueta dibuja un error bloqueante
 *  («en la secuencia sin número») que con el número derivado de la posición es
 *  INALCANZABLE desde la interfaz (spec §«El número no se teclea»), así que no
 *  se construye esa cara: la validación sigue viva en el servidor y en el CHECK,
 *  que es donde protege. Sí se pinta el fallo de guardado, que sí puede pasar. */
export function SequenceSaveBar({
  status, unclassified, error, onSave,
}: {
  status: SaveStatus;
  unclassified: number;
  error: string | null;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-border bg-surface/95 px-3.5 py-2.5 backdrop-blur lg:px-6">
      {unclassified > 0 && (
        <p className="flex gap-2 rounded-lg border border-gold/40 bg-gold/[0.12] px-2.5 py-2 text-[11.5px] leading-snug text-gold-ink">
          <span aria-hidden>◭</span>
          {t("unclassifiedWarning", { count: unclassified })}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-status-dropped/50 px-2.5 py-2 text-[11.5px] text-status-dropped">
          {t(`sequenceErrors.${error}`)}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <b className="block text-[12px]">
            {status === "saving" ? t("saving") : status === "saved" ? t("saved") : status === "dirty" ? t("saveDirtyShort") : t("saveNoChanges")}
          </b>
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            {status === "saving" ? t("savingHint") : t("saveAtomic")}
          </span>
        </div>
        <button
          type="button" onClick={onSave} disabled={status === "saving" || status === "idle"}
          className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-accent-foreground disabled:opacity-50"
        >
          {t("saveSequence")}
        </button>
      </div>
    </div>
  );
}
```

Clave nueva: `"saveDirtyShort": "Cambios sin guardar"`.

- [ ] **Step 2: La sección de itinerarios**

Los itinerarios dejan de ser un enlace suelto y cuelgan de esta pantalla (lección de la #181: lo que solo se alcanza desde una vista condicional acaba siendo inalcanzable). Es contenido de servidor, sin estado, así que viaja como nodo y se pinta en el rail en escritorio (frame A3) y plegado al pie en móvil (frame B1).

```tsx
// src/components/saga/sequence/sequence-itineraries.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SagaRoute } from "@/lib/sagas/route-types";

/** Itinerarios de la saga: los CURADOS, no las rutas sintéticas
 *  (`lectura`/`publicacion`), que no se editan porque se calculan. */
export async function SequenceItineraries({ sagaId, routes }: { sagaId: string; routes: SagaRoute[] }) {
  const t = await getTranslations("sagaEditor");
  const curated = routes.filter((r) => !r.synthetic);
  return (
    <section className="rounded-xl border border-border bg-surface p-3.5">
      <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
        {t("itinerariesTitle")}
      </h3>
      {curated.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{t("itinerariesEmpty")}</p>
      ) : (
        <ul>
          {curated.map((r) => (
            <li key={r.slug} className="border-t border-border first:border-t-0">
              <Link href={`/saga/${sagaId}/rutas/${r.slug}/editar`} className="flex items-center gap-2.5 py-2 text-[12.5px]">
                <b className="min-w-0 flex-1 truncate font-semibold">{r.name}</b>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
                  {t("itinerarySteps", { count: r.stepCount })}
                </span>
                <span aria-hidden className="text-foreground-faint">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/saga/${sagaId}/rutas`}
        className="mt-2.5 block rounded-lg border border-border py-1.5 text-center text-[11.5px] font-semibold"
      >
        {t("itineraryCreate")}
      </Link>
    </section>
  );
}
```

Claves nuevas: `"itinerariesTitle": "Itinerarios de lectura"`, `"itinerariesEmpty": "Todavía no hay ninguno."`, `"itinerarySteps": "{count} pasos"`, `"itineraryCreate": "+ Crear itinerario"`.

**Comprobar antes de escribirlo** que `SagaRoute` expone `synthetic`, `slug`, `name` y un recuento de pasos (`grep -n "export type SagaRoute" -A 15 src/lib/sagas/route-types.ts`); si el recuento se llama distinto o no existe, usar el nombre real en vez de inventarlo — el componente no debe introducir un campo que la fuente no tiene.

Añadir el prop a las dos cáscaras: en `ShellDesktop`, `itineraries: React.ReactNode` que se pinta dentro del `<aside>` bajo `{rail}`; en `ShellMobile`, el mismo nodo tras el bloque de pestañas, envuelto en un `<details>` plegado.

- [ ] **Step 3: La raíz que elige cáscara**

```tsx
// src/components/saga/sequence/sequence-editor.tsx
"use client";

import { useState } from "react";
import { useSequenceDraft } from "./use-sequence-draft";
import { ShellDesktop } from "./shell-desktop";
import { ShellMobile } from "./shell-mobile";
import { RowSheet } from "./row-sheet";
import { TandemPicker } from "./tandem-picker";
import { SequenceSaveBar } from "./sequence-save-bar";
import { EditorLeftPanel } from "@/components/saga/editor/editor-left-panel";
import type { PickedItem } from "@/components/clubs/item-picker";
import { setParentSaga } from "@/lib/sagas/curation-actions";
import { isSagaAccentToken, type SagaAccentToken } from "@/lib/sagas/accents";
import type { DraftEntry, SequenceDraft, ZoneId } from "@/lib/sagas/sequence-draft";

type ChildSagaData = { id: string; name: string; accentColor: string | null; count: number };

const resolveAccent = (accentColor: string | null): SagaAccentToken =>
  isSagaAccentToken(accentColor) ? accentColor : "terracota";

/** Alta desde el buscador de catálogo del rail. `isNew` lo pone `addEntry`. */
const entryFromPickedItem = (item: PickedItem): DraftEntry => ({
  key: `i:${item.itemType}:${item.itemId}`,
  kind: "item", itemType: item.itemType, itemId: item.itemId, childSagaId: null,
  title: item.title, coverUrl: item.coverUrl, accentColor: null, count: null,
  optional: false, role: null, isNew: false,
});

const entryFromChildSaga = (child: ChildSagaData): DraftEntry => ({
  key: `s:${child.id}`,
  kind: "block", itemType: null, itemId: null, childSagaId: child.id,
  title: child.name, coverUrl: null, accentColor: child.accentColor, count: child.count,
  optional: false, role: null, isNew: false,
});

// Las dos cáscaras se montan A LA VEZ y se ocultan por breakpoint (regla de los
// dos árboles, docs/redesign/README.md), pero comparten `useSequenceDraft`: hay
// dos árboles de PRESENTACIÓN y un solo borrador. Duplicar el estado sería el
// fallo que esa regla avisa que el patrón no cubre.
export function SequenceEditor({
  sagaId, initial, childIds, childSagas, itineraries,
}: {
  sagaId: string;
  initial: SequenceDraft;
  childIds: string[];
  childSagas: Array<{ id: string; name: string; accentColor: string | null; count: number }>;
  /** Contenido de servidor sin callbacks, así que sí puede viajar como nodo
   *  (al contrario que el rail, que necesita ligar `onAddItem` al borrador). */
  itineraries: React.ReactNode;
}) {
  const { draft, ops, save, status, error, unclassified } = useSequenceDraft(initial, sagaId, childIds);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [pairKey, setPairKey] = useState<string | null>(null);

  // El rail se monta AQUÍ, no en la página: `EditorLeftPanel` es cliente y sus
  // callbacks tienen que ligarse al borrador, y una función no cruza la
  // frontera servidor→cliente.
  const [children, setChildren] = useState(childSagas);
  const rail = (
    <EditorLeftPanel
      sagaId={sagaId}
      childSagas={children.map((c) => ({ id: c.id, name: c.name, accentColor: c.accentColor }))}
      accentBySaga={new Map(children.map((c) => [c.id, resolveAccent(c.accentColor)]))}
      countBySaga={new Map(children.map((c) => [c.id, c.count]))}
      onAddItem={(item: PickedItem) => ops.add(entryFromPickedItem(item))}
      onAddBlock={(child: { id: string; name: string }) =>
        ops.add(entryFromChildSaga(children.find((c) => c.id === child.id) ?? { ...child, accentColor: null, count: 0 }))
      }
      onChildrenChange={(next) =>
        setChildren(next.map((c) => ({ ...c, count: children.find((p) => p.id === c.id)?.count ?? 0 })))
      }
      // Desanidar es acción inmediata (cambia `parent_saga_id`), no una
      // operación del borrador. Al quitarlo del borrador NO se genera un
      // DELETE: `toPayload` solo lleva a `removed` las claves `i:`, así que un
      // bloque desaparece de la secuencia sin que el RPC toque `saga_items`.
      onUnnestChild={async (childId: string) => {
        const result = await setParentSaga(childId, null);
        if (result.error) return result;
        ops.remove(`s:${childId}`);
        setChildren((cur) => cur.filter((c) => c.id !== childId));
        return {};
      }}
    />
  );

  const locate = (key: string): { zone: ZoneId; slotNumber: number | null; slotIndex: number | null } => {
    const i = draft.slots.findIndex((s) => s.some((e) => e.key === key));
    if (i !== -1) return { zone: "sequence", slotNumber: i + 1, slotIndex: i };
    if (draft.free.some((e) => e.key === key)) return { zone: "free", slotNumber: null, slotIndex: null };
    return { zone: "unclassified", slotNumber: null, slotIndex: null };
  };

  const all = [...draft.slots.flat(), ...draft.free, ...draft.unclassified];
  const active = menuKey ? all.find((e) => e.key === menuKey) ?? null : null;
  const here = menuKey ? locate(menuKey) : null;

  return (
    <>
      <div className="hidden lg:block">
        <ShellDesktop draft={draft} ops={ops} onMenu={setMenuKey} rail={rail} itineraries={itineraries} />
      </div>
      <div className="lg:hidden">
        <ShellMobile draft={draft} ops={ops} onMenu={setMenuKey} rail={rail} itineraries={itineraries} />
      </div>

      {active && here && (
        <RowSheet
          entry={active}
          zone={here.zone}
          slotNumber={here.slotNumber}
          canMoveUp={here.slotIndex !== null && here.slotIndex > 0}
          canMoveDown={here.slotIndex !== null && here.slotIndex < draft.slots.length - 1}
          onZone={(z) => { ops.sendTo(active.key, z); setMenuKey(null); }}
          onRole={(r) => ops.setRole(active.key, r)}
          onOptional={(v) => ops.setOptional(active.key, v)}
          onMove={(delta) => here.slotIndex !== null && ops.moveSlot(here.slotIndex, delta)}
          onPair={() => { setPairKey(active.key); setMenuKey(null); }}
          onRemove={() => { ops.remove(active.key); setMenuKey(null); }}
          onClose={() => setMenuKey(null)}
        />
      )}

      {pairKey && (
        <TandemPicker
          entryKey={pairKey}
          slots={draft.slots}
          onPair={(i) => { ops.pairWith(pairKey, i); setPairKey(null); }}
          onCancel={() => setPairKey(null)}
        />
      )}

      <SequenceSaveBar status={status} unclassified={unclassified} error={error} onSave={save} />
    </>
  );
}
```

- [ ] **Step 4: Reescribir la página y borrar el editor por fila**

`src/app/saga/[id]/editar/page.tsx`: sustituir el bloque `getSagaDetail` + `editableMembers` + `<SagaMembersEditor>` (líneas 55-67 y 83) por `getSagaSequence` y `<SequenceEditor>`. **`<SagaMetaEditor>` se conserva exactamente con las props que ya recibe hoy** (`sagaId` y el objeto `initial` con `name`, `overview`, `coverUrl`, `accent` y `parent`): esta tarea no lo toca. Ampliar el contenedor: `max-w-lg` solo hasta `lg`, y a partir de ahí ancho completo, porque la cáscara A necesita las dos columnas.

Queda así (las líneas de `saga`, `parent` y `SagaMetaEditor` son las de hoy, sin cambios):

```tsx
  const sequence = await getSagaSequence(supabase, saga.id);
  if (!sequence) notFound();
  const routes = await getSagaRoutes(supabase, saga.id);

  const t = await getTranslations("saga");
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6 lg:max-w-none lg:px-0">
      <div className="lg:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
        <SagaMetaEditor
          sagaId={saga.id}
          initial={{
            name: saga.name,
            overview: saga.overview,
            coverUrl: saga.cover_url,
            accent: isSagaAccentToken(saga.accent_color) ? saga.accent_color : null,
            parent,
          }}
        />
      </div>
      <SequenceEditor
        sagaId={saga.id}
        initial={sequence.draft}
        childIds={sequence.childIds}
        childSagas={sequence.childSagas}
        itineraries={<SequenceItineraries sagaId={saga.id} routes={routes} />}
      />
    </div>
  );
```

> **Por qué el rail NO viaja como nodo y los itinerarios sí.** `EditorLeftPanel` es un componente cliente que necesita callbacks (`onAddItem` tiene que llamar a `ops.add`), y una función no cruza la frontera servidor→cliente. Así que la página le pasa a `SequenceEditor` **solo datos serializables** (`childSagas`: array plano de `{ id, name, accentColor, count }`, nunca un `Map`), y es `SequenceEditor` —que ya es cliente— quien monta el rail y liga los callbacks al borrador. `SequenceItineraries` sí puede ser un nodo: es contenido de servidor, sin un solo handler.
>
> En consecuencia, `ShellDesktop` recibe `rail` como nodo ya construido por `SequenceEditor`, no por la página; su firma no cambia respecto a la Task 6.

Después: `git rm src/components/saga/saga-members-editor.tsx src/lib/sagas/member-actions.ts` y quitar de `messages/es.json` las claves que solo usaba ese formulario (`memberPosition`, `memberPositionNone`, `memberRole`, `memberRoleNone`, `memberPlacement*`, `memberOptional`, `memberSave`, `memberSaved`, `memberErrors.*`), **comprobando antes con `grep -rn "memberPosition\|memberErrors" src/ e2e/` que no queda ningún uso**.

- [ ] **Step 5: Comprobar**

```bash
fnm use 22; npx tsc --noEmit; npx vitest run
```

Esperado: `tsc` limpio y toda la suite unitaria en verde. **Los dos e2e de sagas van a fallar** (`sagas-rol-narrativo.spec.ts` y `sagas-colocacion-opcionalidad.spec.ts` conducen el formulario por fila que acaba de desaparecer): se reescriben en la Task 12, no aquí.

- [ ] **Step 6: Commit**

```bash
git add -A src/app/saga src/components/saga src/lib/sagas messages/es.json
git commit -m "feat(sagas): /editar pasa a ser el editor de secuencia; muere el formulario por fila"
```

---

### Task 10: Rescate de la colocación de las 12 hijas

**Files:**
- Create: `supabase/migrations/20260727_rescate_colocacion_hijas.sql`
- Create: `backups/prod-2026-07-27-saga-nodes-edges.json` (volcado previo)

**Es el paso irreversible de la fase.** Hasta ahora la app ordena los bloques leyendo `saga_nodes.order_no`; al retirar el editor de grafo esa información se queda sin quien la escriba.

- [ ] **Step 1: Volcar `saga_nodes` y `saga_edges` a `backups/`**

Con `mcp__supabase-prod__execute_sql`, `select json_agg(t) from saga_nodes t` y lo mismo para `saga_edges` (55 + 54 filas), guardando la salida en `backups/prod-2026-07-27-saga-nodes-edges.json`. **Sin este fichero no se sigue.**

- [ ] **Step 2: Medir el antes**

```sql
select s.id, s.name, s.position_in_parent, s.placement_in_parent, n.order_no
from sagas s
left join saga_nodes n on n.child_saga_id = s.id and n.saga_id = s.parent_saga_id
where s.parent_saga_id is not null
order by s.parent_saga_id, n.order_no nulls last;
```

Guardar la tabla resultante: es el «antes» con el que se compara al final. Esperado hoy: **12 filas, todas con `position_in_parent` nulo**.

- [ ] **Step 3: Escribir la migración**

```sql
-- supabase/migrations/20260727_rescate_colocacion_hijas.sql
--
-- La fase 1 dejó a propósito sin `position_in_parent` a las sagas hijas cuyo
-- padre tiene grafo: allí la colocación no se deduce de min(position) sino de
-- `saga_nodes.order_no`, y escribir un número deducido habría sido inventar
-- curación. Al retirar el editor de grafo (fase 2a) esa columna se queda sin
-- escritor, así que aquí se rescata el dato al sitio donde ahora vive.
--
-- Las hijas cuyo nodo NO tiene `order_no` se quedan SIN CLASIFICAR a propósito:
-- ningún nodo de Mundodisco tiene order_no (su orden vive solo en 28 aristas),
-- que es el origen del 0/0 que arregló la fase 1. Derivarles un número de las
-- aristas y presentarlo como curado sería exactamente el error que este diseño
-- viene a deshacer; caen en la zona 3 del editor de su padre y las coloca una
-- persona.
update sagas s
   set position_in_parent = n.order_no,
       placement_in_parent = 'fijo'
  from saga_nodes n
 where n.child_saga_id = s.id
   and n.saga_id = s.parent_saga_id
   and n.order_no is not null
   and s.position_in_parent is null;
```

- [ ] **Step 4: Aplicar a dev y verificar los invariantes**

```sql
-- ninguna fila puede violar el CHECK sagas_placement_position
select count(*) from sagas
where (placement_in_parent = 'fijo') <> (position_in_parent is not null);
-- y el reparto resultante
select placement_in_parent, count(*) from sagas where parent_saga_id is not null group by 1;
```

Esperado: primer `count` = **0**. Segundo: las hijas de padres con `order_no` en `fijo`, las de Mundodisco en `null`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260727_rescate_colocacion_hijas.sql backups/prod-2026-07-27-saga-nodes-edges.json
git commit -m "feat(db): rescata la colocación de las hijas de padres con grafo"
```

---

### Task 11: Retirada del editor de grafo

**Files:**
- Modify: `src/app/saga/[id]/mapa/editar/page.tsx` (pasa a redirect)
- Delete: `src/components/saga/editor/saga-graph-editor.tsx`, `editor-inspector.tsx`, `editor-node.tsx`, `src/lib/sagas/validate-graph-draft.ts` + `validate-graph-draft.test.ts`
- Modify: `src/components/saga/saga-map-tab.tsx` y cualquier otro punto con enlace a `/mapa/editar`

- [ ] **Step 1: Encontrar todos los puntos de entrada**

```bash
grep -rn "mapa/editar" src/ e2e/ messages/
```

Cada resultado o se borra (botón de editar grafo) o pasa a apuntar a `/saga/[id]/editar`.

- [ ] **Step 2: Convertir la ruta en redirect**

```tsx
// src/app/saga/[id]/mapa/editar/page.tsx
import { redirect } from "next/navigation";

// El editor de grafo se retiró en la fase 2a: la curación del orden vive en
// /saga/[id]/editar. Redirect y no 404 a propósito — hay enlaces vivos y gente
// con la URL guardada, y un 404 les diría que la saga no existe.
export default async function EditSagaMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/saga/${id}/editar`);
}
```

- [ ] **Step 3: Borrar el editor y su validación**

```bash
git rm src/components/saga/editor/saga-graph-editor.tsx src/components/saga/editor/editor-inspector.tsx src/components/saga/editor/editor-node.tsx src/lib/sagas/validate-graph-draft.ts src/lib/sagas/validate-graph-draft.test.ts
```

`editor-save-bar.tsx` **se conserva si lo usa el editor de itinerarios**; comprobar con `grep -rn "editor-save-bar" src/` y borrarlo solo si queda sin usos.

- [ ] **Step 4: Verificar que el mapa de solo lectura sigue en pie**

```bash
fnm use 22; npx tsc --noEmit; npx vitest run
```

Esperado: limpio. `src/components/saga/graph/` y `graph-data.ts` **no se tocan**: el mapa sigue leyendo `saga_nodes`, que sigue existiendo hasta la fase 3.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sagas): retira el editor de grafo; /mapa/editar redirige a /editar"
```

---

### Task 12: E2E en dos viewports

**Files:**
- Create: `e2e/sagas-editor-secuencia.spec.ts`
- Modify: `e2e/sagas-rol-narrativo.spec.ts`, `e2e/sagas-colocacion-opcionalidad.spec.ts`

**La suite corre a 1280**, así que sin fijar viewport **solo se prueba la cáscara A** y la B se queda sin cobertura sin que nadie lo note. Todo locator lleva `:visible` (regla de los dos árboles).

- [ ] **Step 1: Adaptar los dos specs existentes**

Los dos conducen el formulario por fila que la Task 9 borró. Reescribir sus pasos de curación contra la pantalla nueva **conservando sus aserciones de resultado** (que es lo que de verdad protegen): el chip de rol en la ficha, el chip «opcional», la sección «Cuando quieras», y el rechazo de la BD ante una colocación imposible.

- [ ] **Step 2: Escribir el spec nuevo**

```ts
// e2e/sagas-editor-secuencia.spec.ts
import { expect, test, type Page } from "@playwright/test";

// Mismo universo QA y mismo patrón de sesión que
// e2e/sagas-colocacion-opcionalidad.spec.ts: la cuenta `devtest` tiene
// role='admin' en dev, que cumple collaborator+, así que /editar no redirige.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

/** Estado real en BD, para no fiarse de lo que pinta la pantalla. */
async function fetchRows(): Promise<Array<{ item_id: string; position: number | null; placement: string | null }>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  return res.json();
}

const rows = (page: Page) => page.locator('[data-testid="sequence-row"]:visible');
const save = async (page: Page) => {
  await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
  await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();
};

test.describe("editor de secuencia — escritorio (cáscara A)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  });

  test("las tres zonas se ven a la vez", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "La secuencia" }).locator("visible=true")).toBeVisible();
    await expect(page.getByText("Cuando quieras", { exact: true }).locator("visible=true")).toBeVisible();
  });

  test("bajar un hueco renumera, y el cambio sobrevive a recargar", async ({ page }) => {
    const before = await rows(page).first().innerText();
    await page.getByRole("button", { name: "Bajar un hueco" }).locator("visible=true").first().click();
    await save(page);
    await page.reload();
    await expect(rows(page).nth(1)).toContainText(before.split("\n")[1] ?? before);
  });

  test("enviar una fila a «Cuando quieras» le quita el número en BD", async ({ page }) => {
    const first = rows(page).first();
    const key = await first.getAttribute("data-key");
    const itemId = key!.split(":")[2];
    try {
      await first.getByRole("button", { name: /^Acciones de / }).click();
      await page.getByRole("button", { name: "Cuando quieras" }).click();
      await save(page);
      const row = (await fetchRows()).find((r) => r.item_id === itemId)!;
      expect(row.placement).toBe("libre");
      expect(row.position).toBeNull();
    } finally {
      // Devolver la fila a la secuencia: los specs de sagas comparten universo.
      await page.reload();
      await page.getByRole("button", { name: "Enviar a la secuencia" }).first().click();
      await save(page);
    }
  });
});

test.describe("editor de secuencia — móvil (cáscara B)", () => {
  // Sin esto la suite corre a 1280 y esta cáscara NO se probaría nunca.
  test.use({ viewport: { width: 400, height: 880 } });

  test("las zonas son pestañas y solo se ve una a la vez", async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Se leen en varios puntos")).toHaveCount(0);
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  });

  test("la hoja mueve una fila de zona sin arrastrar", async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    await rows(page).first().getByRole("button", { name: /^Acciones de / }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Sin clasificar" }).click();
    await expect(page.getByRole("tab", { name: /Sin clasificar/ })).toContainText("1");
  });
});

test("un tándem deja las dos obras en el mismo número y la siguiente en el siguiente", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  await rows(page).nth(2).getByRole("button", { name: /^Acciones de / }).click();
  await page.getByRole("button", { name: /Mismo hueco que otra obra/ }).click();
  await page.getByRole("dialog").getByRole("button").filter({ hasText: /^1/ }).click();
  await page.getByRole("button", { name: /^Emparejar en el hueco/ }).click();
  await save(page);

  const positions = (await fetchRows())
    .filter((r) => r.position !== null)
    .map((r) => r.position!)
    .sort((a, b) => a - b);
  // Dos obras comparten el 1 y NO se salta el 2: es la regla de renumerado.
  expect(positions.filter((p) => p === 1)).toHaveLength(2);
  expect([...new Set(positions)]).toEqual([1, 2, 3]);
});

test("guardar un borrador abierto antes NO borra una obra añadida por otro", async ({ page }) => {
  // La garantía de `p_removed`, y el motivo de apartarse del patrón de
  // save_saga_route. Sin ella, este flujo perdería datos en silencio.
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  const countBefore = (await fetchRows()).length;

  const intruder = "00000000-0000-4000-8000-0000000000ff";
  await fetch(`${SUPABASE_URL}/rest/v1/saga_items`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({
      saga_id: ERA_UNO_ID, item_type: "book", item_id: intruder,
      position: null, placement: null, optional: false, is_primary: false,
    }),
  });

  try {
    // La pantalla NO se recarga: guarda el borrador que abrió antes del alta.
    await page.getByRole("button", { name: "Bajar un hueco" }).locator("visible=true").first().click();
    await save(page);
    const after = await fetchRows();
    expect(after).toHaveLength(countBefore + 1);
    expect(after.some((r) => r.item_id === intruder)).toBe(true);
  } finally {
    await fetch(`${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${intruder}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
  }
});
```

> **Antes de escribirlo**, comprobar contra la BD de dev cuántos miembros directos tiene Era Uno y en qué orden (`select item_id, position, placement from saga_items where saga_id = '<era uno>' order by position`). Los índices `nth(2)` y los números esperados del tándem salen de ese estado real: si la semilla cambió, se ajustan los números — **no** se relaja la aserción. El `item_id` intruso es un uuid inventado a propósito, y por eso el test lo borra en su `finally`; si el `POST` fallara por FK contra `books`, usar un libro real de la semilla que NO sea miembro de Era Uno.

- [ ] **Step 3: Ejecutarlos dos veces seguidas**

```bash
fnm use 22; npx playwright test e2e/sagas-editor-secuencia.spec.ts e2e/sagas-rol-narrativo.spec.ts e2e/sagas-colocacion-opcionalidad.spec.ts
```

Esperado: verde **dos pasadas seguidas** — la suite de sagas tiene historial de pasar solo la primera vez (#180, #182). Reutiliza el dev server que ya haya; no arranques otro.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test(sagas): e2e del editor de secuencia en escritorio y móvil"
```

---

### Task 13: Producción y sincronización de la documentación

**Files:**
- Modify: `supabase/schema-baseline.sql`, `docs/requirements/data-model.md`, `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`

- [ ] **Step 1: Aplicar las dos migraciones a prod, en orden**

`20260726_save_saga_sequence.sql` y después `20260727_rescate_colocacion_hijas.sql`. Verificar contra los objetos reales:

```sql
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = 'save_saga_sequence';

select count(*) from sagas
where (placement_in_parent = 'fijo') <> (position_in_parent is not null);
```

Esperado: la función existe con `prosecdef = true`; el `count` de violaciones es **0**.

- [ ] **Step 2: Comparar el antes y el después de las 12 hijas**

Repetir la consulta del paso 2 de la Task 10 y poner las dos tablas una al lado de otra en el cuerpo de la PR. Las hijas de Mundodisco deben seguir sin colocar; el resto, con su `order_no`.

⚠️ **El código lee columnas y funciones nuevas: las migraciones van SIEMPRE antes que el despliegue.** Es la misma trampa que documentó la fase 1 — PostgREST no devuelve datos parciales, así que sin ellas la consulta entera falla y la pantalla se ve vacía en vez de dar error.

- [ ] **Step 3: Anexar al baseline y sincronizar la doc**

- `supabase/schema-baseline.sql`: anexar las dos migraciones al final, con la cabecera de siempre.
- `data-model.md`: `save_saga_sequence` en el inventario de funciones, y la nota de que `placement_in_parent` ya tiene UI y escritor.
- `backlog.md`: marcar 2a como hecha y dejar 2b y 3 abiertas.
- `decisiones.md`: **al final**, sin reescribir nada anterior, una entrada por cada decisión con su porqué y su evidencia: la baja explícita frente al borrado por omisión, la capa de estado única con dos cáscaras, «Sin rol» frente a «Sin clasificar», la fila de bloque sin rol y la retirada del error inalcanzable de la maqueta.

- [ ] **Step 4: Abrir issue de lo que queda**

Una issue por lo que quede vivo, con reproducción y contexto para quien la lea dentro de seis meses (`AGENTS.md`): **la curación humana de Mundodisco** (sus bloques quedan sin clasificar a propósito) y cualquier hallazgo menor de la revisión final.

- [ ] **Step 5: Comprobación final y commit**

```bash
fnm use 22; npx tsc --noEmit; npx vitest run; npm run lint
```

Esperado: `tsc` limpio, toda la suite en verde, y en `lint` **solo** el error preexistente de `signup-form.tsx` (#163).

```bash
git add -A
git commit -m "docs(sagas): sincroniza la doc canónica tras la fase 2a"
```
