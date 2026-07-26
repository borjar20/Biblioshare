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
