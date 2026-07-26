import type { ItemType } from "@/lib/catalog/types";
import type { SagaItemRole, SagaPlacement } from "./types";

/** Las tres zonas de la pantalla. La zona ES la colocación (spec §«Tres zonas»):
 *  no hay desplegable de `placement`, se deriva de dónde vive la fila. */
export type ZoneId = "sequence" | "free" | "unclassified";

/** Un ancla apunta a una obra o a un bloque del subárbol. Lleva el título
 *  resuelto porque el editor la pinta sin volver a consultar. */
export type DraftAnchor = {
  kind: "item" | "block";
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  title: string;
};

/** Como máximo dos anclas, y al menos una: una ventana sin ninguna no existe
 *  (lo impone también un CHECK). `null` en las dos = no hay ventana. */
export type DraftWindow = { after: DraftAnchor | null; before: DraftAnchor | null };

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
  /** Ventana de una entrada `libre` (fase 2b): entre dónde y dónde se lee.
   *  SIEMPRE null fuera de la zona «Cuando quieras» — la coherencia la
   *  mantiene `sendTo`, que la borra al sacar la fila de esa zona, porque
   *  ningún CHECK puede atar dos tablas. */
  window: DraftWindow | null;
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
  /** Una fila por entrada `libre` con ventana, forma calcada de
   *  `saga_placement_windows` (20260727_saga_placement_windows.sql). El
   *  `saga_id` lo pone el RPC, no el payload. Recorre SOLO `d.free`: fuera de
   *  esa zona `window` siempre es null. */
  windows: Array<{
    item_type: ItemType | null;
    item_id: string | null;
    child_saga_id: string | null;
    after_item_type: ItemType | null;
    after_item_id: string | null;
    after_child_saga_id: string | null;
    before_item_type: ItemType | null;
    before_item_id: string | null;
    before_child_saga_id: string | null;
  }>;
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
  // Si la fila YA está en la zona destino, no-op. La hoja móvil pinta la zona
  // actual como pastilla seleccionada, así que tocarla parece un no-op y tiene
  // que serlo — sin este corte, mandar "sequence" a una fila que ya vive en un
  // hueco (quizá en tándem) la sacaba de ahí y la reinsertaba como hueco nuevo
  // al final, deshaciendo el tándem en silencio. "Ya está en la secuencia"
  // significa estar en CUALQUIER hueco de `slots`, no en uno concreto.
  const alreadyThere = zone === "sequence"
    ? d.slots.some((slot) => slot.some((e) => e.key === key))
    : d[zone].some((e) => e.key === key);
  if (alreadyThere) return d;

  const [without, entry] = extract(d, key);
  if (!entry) return d;
  // Solo `free` admite ventana: sacar la fila de ahí se la lleva por delante,
  // porque ningún CHECK entre `saga_placement_windows` y las tablas de
  // colocación puede imponer esa coherencia.
  const clean = zone === "free" ? entry : { ...entry, window: null };
  if (zone === "sequence") return { ...without, slots: [...without.slots, [clean]] };
  return { ...without, [zone]: [...without[zone], clean] };
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
  // Igual que `sendTo`: emparejar es OTRA vía de salida de `free` hacia
  // `slots`, y se lleva la ventana por delante por la misma razón (ningún
  // CHECK entre tablas puede imponer esa coherencia).
  const clean = entry.window ? { ...entry, window: null } : entry;
  return { ...without, slots: without.slots.map((s, j) => (j === at ? [...s, clean] : s)) };
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

/** Pone un ancla de la ventana. Solo una entrada de la zona `free` («Cuando
 *  quieras») puede tener ventana — fuera de ahí es un no-op, porque
 *  `placement` ni siquiera tiene dónde guardarla. */
export function setAnchor(
  d: SequenceDraft,
  key: string,
  side: "after" | "before",
  anchor: DraftAnchor,
): SequenceDraft {
  if (!d.free.some((e) => e.key === key)) return d;
  return mapEntry(d, key, (e) => {
    const base = e.window ?? { after: null, before: null };
    return { ...e, window: { ...base, [side]: anchor } };
  });
}

/** Quita un ancla. Si era la última, la ventana entera vuelve a `null` — no
 *  se deja un `{ after: null, before: null }` huérfano, que el CHECK de BD
 *  rechazaría igualmente. */
export function clearAnchor(d: SequenceDraft, key: string, side: "after" | "before"): SequenceDraft {
  return mapEntry(d, key, (e) => {
    if (!e.window) return e;
    const next = { ...e.window, [side]: null };
    return { ...e, window: next.after === null && next.before === null ? null : next };
  });
}

/** Alta desde el rail: al final de la secuencia, como promete la maqueta. */
export const addEntry = (d: SequenceDraft, entry: DraftEntry): SequenceDraft => {
  if (
    d.slots.some((s) => s.some((e) => e.key === entry.key)) ||
    d.free.some((e) => e.key === entry.key) ||
    d.unclassified.some((e) => e.key === entry.key)
  ) {
    return d;
  }
  const clean = entry.window ? { ...entry, window: null } : entry;
  return { ...d, slots: [...d.slots, [{ ...clean, isNew: true }]] };
};

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

  // Las columnas de un ancla son XOR obra/bloque, igual que el sujeto.
  const anchorColumns = (a: DraftAnchor | null) => ({
    itemType: a?.kind === "item" ? a.itemType : null,
    itemId: a?.kind === "item" ? a.itemId : null,
    childSagaId: a?.kind === "block" ? a.childSagaId : null,
  });
  // Solo la zona libre puede tener ventana: recorrer `d.free` basta, no hace
  // falta filtrar por `e.window !== null` en las otras zonas.
  const windows: SequencePayload["windows"] = d.free
    .filter((e) => e.window !== null)
    .map((e) => {
      const after = anchorColumns(e.window!.after);
      const before = anchorColumns(e.window!.before);
      return {
        item_type: e.kind === "item" ? e.itemType : null,
        item_id: e.kind === "item" ? e.itemId : null,
        child_saga_id: e.kind === "block" ? e.childSagaId : null,
        after_item_type: after.itemType,
        after_item_id: after.itemId,
        after_child_saga_id: after.childSagaId,
        before_item_type: before.itemType,
        before_item_id: before.itemId,
        before_child_saga_id: before.childSagaId,
      };
    });

  return { entries, blocks, removed: removedItems, removedBlocks: [], windows };
}
