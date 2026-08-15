import type { ItemType } from "@/lib/catalog/types";
import type { SagaItemRole, SagaPlacement, TandemMode, WindowReason } from "./types";

/** Las tres zonas de la pantalla. La zona ES la colocación (spec §«Tres zonas»):
 *  no hay desplegable de `placement`, se deriva de dónde vive la fila. */
export type ZoneId = "sequence" | "free" | "anchored" | "unclassified";

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
export type DraftWindow = {
  after: DraftAnchor | null;
  before: DraftAnchor | null;
  /** Por qué existe el tramo (fase 3). `null` = el curador no lo declaró.
   *  Muere CON la ventana: `clearAnchor` la devuelve entera a `null` al quitar
   *  la última ancla, así que un motivo sin tramo del que hablar no puede
   *  sobrevivir a la operación que lo dejaría huérfano. */
  reason: WindowReason | null;
};

/** Una ventana recién nacida: sin anclas y sin motivo. Existe para que los
 *  sitios que construían `{ after: null, before: null }` a mano no se olviden
 *  de un campo la próxima vez que la forma crezca. */
const EMPTY_WINDOW: DraftWindow = { after: null, before: null, reason: null };

/** Clave de una ancla en el MISMO formato que `DraftEntry.key`
 *  (`i:<tipo>:<uuid>` / `s:<uuid>`), para poder comparar una ancla contra el
 *  sujeto (auto-referencia, `windowSelfAnchor`) o contra las claves vivas del
 *  borrador. Único sitio donde vive esta conversión para el lado del cliente;
 *  `validate-sequence-draft.ts` y `get-saga-sequence.ts` la reimplementan
 *  sobre `SequencePayload`/`RawWindowRow`, que son formas distintas y no
 *  pueden importar de aquí sin crear un ciclo con sus propios tipos crudos. */
export function anchorKey(a: DraftAnchor): string {
  return a.kind === "item" ? `i:${a.itemType}:${a.itemId}` : `s:${a.childSagaId}`;
}

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
  /** Saga bajo la que vive la fila de ventana de esta entrada (fase 4). Para
   *  una entrada propia es casi siempre la saga que se cura; con doble
   *  membresía puede ser otra, y lo decide `windowOwnerFor`. Viaja en el
   *  borrador porque `toPayload` lo necesita para escribir `saga_id` en cada
   *  fila de ventana y en cada sujeto. */
  ownerSagaId: string;
  /** true = alta del rail que todavía no existe en BD. Da de baja sin apuntar
   *  en `removed` (borrar algo que nunca se guardó no es un DELETE). */
  isNew: boolean;
};

/** Obra de una subsaga cuya VENTANA se cura desde el editor del padre (fase 4).
 *  No es una `DraftEntry`: el padre no puede moverla, ni renumerarla, ni
 *  marcarla opcional — la #187 sigue cerrada. Lo único suyo que esta pantalla
 *  toca es la ventana. */
export type NestedSubject = {
  /** Mismo formato que `DraftEntry.key` (`i:<tipo>:<uuid>`), y único en todo el
   *  borrador: `getSagaSequence` excluye de `nested` cualquier clave que ya sea
   *  entrada propia, para que `setAnchor`/`clearAnchor` no tengan que
   *  desempatar entre las dos colecciones. */
  key: string;
  /** Saga bajo la que vive su fila de ventana (`windowOwnerFor`). */
  ownerSagaId: string;
  /** Bloque bajo el que se despliega en el cajón. No tiene por qué coincidir
   *  con `ownerSagaId` si la obra tuviera doble membresía. */
  childSagaId: string;
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  window: DraftWindow | null;
};

/** UN HUECO de la secuencia: una o más entradas, más los metadatos que solo
 *  tienen sentido cuando son varias. Dos o más entradas en el mismo hueco son
 *  un tándem (#168), que es intención y no colisión; modelar el hueco así es lo
 *  que hace que el empate no necesite ninguna regla especial al numerar.
 *
 *  Es un objeto y no un array (como era hasta la fase 2) para que `mode`/`note`
 *  viajen CON el hueco: `moveSlot`, `pairWith`, `unpair` y `extract` cambian
 *  los índices —y `extract` puede borrar un hueco entero—, así que cualquier
 *  estructura paralela indexada por posición se desincroniza al primer
 *  reordenamiento, en silencio, y el curador ve la nota de un hueco bajo otro. */
export type DraftSlot = {
  entries: DraftEntry[];
  /** Qué clase de tándem es (`saga_tandems.modo`, fase 2). Un hueco de UNA sola
   *  entrada lo tiene siempre a null: no hay tándem del que hablar. */
  mode: TandemMode | null;
  note: string | null;
};

export type SequenceDraft = {
  /** La secuencia, hueco a hueco. */
  slots: DraftSlot[];
  free: DraftEntry[];
  /** Zona "Anclado": placement `anclado`. Como `free`, admite ventana — pero
   *  aquí la ventana ES el sentido de la zona (colocación relativa obligatoria),
   *  no un extra opcional. */
  anchored: DraftEntry[];
  unclassified: DraftEntry[];
  /** Claves dadas de baja que SÍ existían en BD. Viaja al RPC como `p_removed`;
   *  el borrado por omisión está prohibido (spec §«Por qué la baja es explícita»). */
  removed: string[];
  /** Sujetos anidados: obras `libre` de las hijas DIRECTAS, para el cajón bajo
   *  la fila de su bloque (fase 4). No son filas de esta saga y no viajan en
   *  `entries`/`blocks` del payload — solo sus ventanas. */
  nested: NestedSubject[];
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
  /** Una fila por sujeto con ventana, forma calcada de
   *  `saga_placement_windows` (20260727_saga_placement_windows.sql). Desde la
   *  fase 4 el `saga_id` viaja EN CADA FILA —lo pone `ownerSagaId`, no el RPC—
   *  porque una ventana curada desde el padre sobre una obra de su hija vive
   *  bajo la HIJA. Recorre `d.free` y `d.nested`: fuera de ahí `window` siempre
   *  es null. */
  windows: Array<{
    saga_id: string;
    item_type: ItemType | null;
    item_id: string | null;
    child_saga_id: string | null;
    after_item_type: ItemType | null;
    after_item_id: string | null;
    after_child_saga_id: string | null;
    before_item_type: ItemType | null;
    before_item_id: string | null;
    before_child_saga_id: string | null;
    /** Motivo declarado del tramo (fase 3), o null. Viaja como una clave MÁS
     *  dentro de `p_windows`, que ya era jsonb: por eso el RPC no necesitó un
     *  octavo argumento y esta fase se ahorró el baile de la sobrecarga. */
    motivo: WindowReason | null;
  }>;
  /** Sujetos de los que ESTA pantalla se hace responsable. El RPC borra
   *  exactamente estos y reinserta `windows`.
   *
   *  Por qué existe: hasta la fase 3 el RPC hacía reemplazo total por saga, y su
   *  comentario lo justificaba con que «no hay un segundo escritor: ninguna otra
   *  pantalla crea ventanas». Desde que el editor del padre cura la ventana de
   *  una obra de su hija eso deja de ser cierto — dos pantallas escriben la
   *  misma fila, y el reemplazo por saga se llevaría por delante lo que la otra
   *  acaba de guardar. Es exactamente lo que en la fase 2a obligó a que la baja
   *  de `saga_items` fuera explícita. */
  windowSubjects: Array<{
    saga_id: string;
    item_type: ItemType | null;
    item_id: string | null;
    child_saga_id: string | null;
  }>;
  /** Metadatos por HUECO compartido (`saga_tandems`, fase 2). Solo los huecos
   *  con dos o más entradas Y con algo declarado: una fila vacía la rechazaría
   *  el CHECK `saga_tandems_says_something` y abortaría la transacción entera,
   *  así que un control que el curador dejó en blanco no puede llegar al RPC. */
  tandems: Array<{ position: number; modo: TandemMode | null; nota: string | null }>;
};

const ZONES = ["free", "anchored", "unclassified"] as const;

/** Saca una entrada de donde esté y devuelve el draft sin ella + la entrada.
 *  Cerrar el hueco vacío es parte de sacar: un hueco sin entradas no existe. */
function extract(d: SequenceDraft, key: string): [SequenceDraft, DraftEntry | null] {
  for (const zone of ZONES) {
    const found = d[zone].find((e) => e.key === key);
    if (found) return [{ ...d, [zone]: d[zone].filter((e) => e.key !== key) }, found];
  }
  for (let i = 0; i < d.slots.length; i++) {
    const found = d.slots[i].entries.find((e) => e.key === key);
    if (!found) continue;
    const rest = d.slots[i].entries.filter((e) => e.key !== key);
    // Un hueco que baja a una sola entrada ya no es un tándem: sus metadatos
    // hablaban de una relación que acaba de dejar de existir, y conservarlos los
    // resucitaría en cuanto alguien emparejara ahí OTRA obra distinta.
    const slots = rest.length > 0
      ? d.slots.map((s, j) =>
          j === i ? { ...s, entries: rest, ...(rest.length < 2 ? { mode: null, note: null } : {}) } : s,
        )
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
    ? d.slots.some((slot) => slot.entries.some((e) => e.key === key))
    : d[zone].some((e) => e.key === key);
  if (alreadyThere) return d;

  const [without, entry] = extract(d, key);
  if (!entry) return d;
  // `free` y `anchored` admiten ventana: sacar la fila de ahí hacia otra zona se
  // la lleva por delante, porque ningún CHECK entre `saga_placement_windows` y
  // las tablas de colocación puede imponer esa coherencia.
  const clean = zone === "free" || zone === "anchored" ? entry : { ...entry, window: null };
  if (zone === "sequence") {
    return { ...without, slots: [...without.slots, { entries: [clean], mode: null, note: null }] };
  }
  return { ...without, [zone]: [...without[zone], clean] };
}

export function pairWith(d: SequenceDraft, key: string, targetSlot: number): SequenceDraft {
  const target = d.slots[targetSlot];
  if (!target || target.entries.some((e) => e.key === key)) return d;
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
  // Emparejar CON un tándem que ya declaró modo no lo borra: el hueco es el
  // mismo, solo gana una obra más.
  return {
    ...without,
    slots: without.slots.map((s, j) => (j === at ? { ...s, entries: [...s.entries, clean] } : s)),
  };
}

export function unpair(d: SequenceDraft, index: number): SequenceDraft {
  const slot = d.slots[index];
  if (!slot || slot.entries.length < 2) return d;
  // Cada trozo nace sin metadatos: deshacer el tándem es decir que esa relación
  // no existe, así que lo que la describía tampoco.
  const exploded = slot.entries.map((e) => ({ entries: [e], mode: null, note: null }));
  return { ...d, slots: [...d.slots.slice(0, index), ...exploded, ...d.slots.slice(index + 1)] };
}

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

export const setOptional = (d: SequenceDraft, key: string, optional: boolean): SequenceDraft =>
  mapEntry(d, key, (e) => ({ ...e, optional }));

/** Un bloque nunca guarda rol: se ignora en silencio en vez de fallar, porque
 *  la interfaz ni siquiera ofrece el control (spec §«La fila»). */
export const setRole = (d: SequenceDraft, key: string, role: SagaItemRole | null): SequenceDraft =>
  mapEntry(d, key, (e) => (e.kind === "block" ? e : { ...e, role }));

/** Declara qué clase de tándem es un hueco, y por qué. Un hueco de una sola
 *  entrada se ignora en silencio —igual que `setRole` ignora un rol en un
 *  bloque—: ahí no hay tándem del que hablar, y la interfaz ni siquiera ofrece
 *  el control. Los campos son independientes: pasar solo `mode` no pisa la nota. */
export function setTandemMeta(
  d: SequenceDraft,
  index: number,
  meta: { mode?: TandemMode | null; note?: string | null },
): SequenceDraft {
  const slot = d.slots[index];
  if (!slot || slot.entries.length < 2) return d;
  const next: DraftSlot = {
    ...slot,
    mode: meta.mode === undefined ? slot.mode : meta.mode,
    note: meta.note === undefined ? slot.note : meta.note,
  };
  return { ...d, slots: d.slots.map((s, j) => (j === index ? next : s)) };
}

/** Pone un ancla de la ventana. Solo puede tenerla una entrada de la zona
 *  `free` («Cuando quieras») o un SUJETO ANIDADO (fase 4) — fuera de ahí es un
 *  no-op, porque `placement` ni siquiera tiene dónde guardarla. Las claves de
 *  `nested` no chocan con las de las zonas: `getSagaSequence` excluye de
 *  `nested` lo que ya es entrada propia. */
export function setAnchor(
  d: SequenceDraft,
  key: string,
  side: "after" | "before",
  anchor: DraftAnchor,
): SequenceDraft {
  if (d.nested.some((n) => n.key === key)) {
    return {
      ...d,
      nested: d.nested.map((n) =>
        n.key === key
          ? { ...n, window: { ...(n.window ?? EMPTY_WINDOW), [side]: anchor } }
          : n,
      ),
    };
  }
  if (!d.free.some((e) => e.key === key) && !d.anchored.some((e) => e.key === key)) return d;
  return mapEntry(d, key, (e) => {
    const base = e.window ?? EMPTY_WINDOW;
    return { ...e, window: { ...base, [side]: anchor } };
  });
}

/** Quita un ancla. Si era la última, la ventana entera vuelve a `null` — no se
 *  deja un `{ after: null, before: null }` huérfano, que el CHECK de BD
 *  rechazaría igualmente. */
export function clearAnchor(d: SequenceDraft, key: string, side: "after" | "before"): SequenceDraft {
  const drop = (w: DraftWindow | null): DraftWindow | null => {
    if (!w) return null;
    const next = { ...w, [side]: null };
    return next.after === null && next.before === null ? null : next;
  };
  if (d.nested.some((n) => n.key === key)) {
    return { ...d, nested: d.nested.map((n) => (n.key === key ? { ...n, window: drop(n.window) } : n)) };
  }
  return mapEntry(d, key, (e) => ({ ...e, window: drop(e.window) }));
}

/** Declara por qué existe la ventana de un sujeto (fase 3). NO crea ventana:
 *  sin ninguna ancla no hay tramo del que hablar, y la fila ni siquiera pasaría
 *  el CHECK `saga_placement_windows_needs_anchor`. Un sujeto sin ventana es un
 *  no-op silencioso, igual que `setTandemMeta` con un hueco de una sola obra:
 *  la interfaz tampoco ofrece el control ahí.
 *
 *  Alcanza a la zona `free` y a los sujetos anidados, exactamente los mismos
 *  dos sitios que `setAnchor`/`clearAnchor` — que son los únicos donde una
 *  ventana puede existir. */
export function setWindowReason(
  d: SequenceDraft,
  key: string,
  reason: WindowReason | null,
): SequenceDraft {
  const put = (w: DraftWindow | null): DraftWindow | null => (w === null ? null : { ...w, reason });
  if (d.nested.some((n) => n.key === key)) {
    return { ...d, nested: d.nested.map((n) => (n.key === key ? { ...n, window: put(n.window) } : n)) };
  }
  if (!d.free.some((e) => e.key === key) && !d.anchored.some((e) => e.key === key)) return d;
  return mapEntry(d, key, (e) => ({ ...e, window: put(e.window) }));
}

/** Sujetos que ESTE borrador puede tener con ventana, y bajo qué saga vive su
 *  fila. Deriva del borrador VIVO —no del servidor— para no repetir el
 *  `foreignBlock` falso de la fase 2a: una entrada que acaba de entrar en
 *  «Cuando quieras» tiene que poder recibir ventana sin recargar la página. El
 *  servidor lo vuelve a resolver contra BD en `saveSequence`, que es la
 *  garantía real. */
export function draftWindowOwners(d: SequenceDraft): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of d.free) out.set(e.key, e.ownerSagaId);
  for (const e of d.anchored) out.set(e.key, e.ownerSagaId);
  for (const n of d.nested) out.set(n.key, n.ownerSagaId);
  return out;
}

/** Alta desde el rail: al final de la secuencia, como promete la maqueta. */
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

export function removeEntry(d: SequenceDraft, key: string): SequenceDraft {
  const [without, entry] = extract(d, key);
  if (!entry) return d;
  return entry.isNew ? without : { ...without, removed: [...without.removed, key] };
}

export function toPayload(d: SequenceDraft, sagaId: string): SequencePayload {
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
  d.slots.forEach((slot, i) => slot.entries.forEach((e) => push(e, i + 1, "fijo")));
  d.free.forEach((e) => push(e, null, "libre"));
  d.anchored.forEach((e) => push(e, null, "anclado"));
  d.unclassified.forEach((e) => push(e, null, null));

  // El número es el del HUECO, el mismo que acaba de recibir cada entrada: por
  // eso un tándem comparte número con sus obras y no hay que casar nada después.
  const tandems: SequencePayload["tandems"] = [];
  d.slots.forEach((slot, i) => {
    if (slot.entries.length < 2) return;
    const nota = slot.note !== null && slot.note.trim() !== "" ? slot.note.trim() : null;
    if (slot.mode === null && nota === null) return;
    tandems.push({ position: i + 1, modo: slot.mode, nota });
  });

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
  const windowRow = (
    ownerSagaId: string,
    itemType: ItemType | null,
    itemId: string | null,
    childSagaId: string | null,
    w: DraftWindow,
  ) => {
    const after = anchorColumns(w.after);
    const before = anchorColumns(w.before);
    return {
      saga_id: ownerSagaId,
      item_type: itemType,
      item_id: itemId,
      child_saga_id: childSagaId,
      after_item_type: after.itemType,
      after_item_id: after.itemId,
      after_child_saga_id: after.childSagaId,
      before_item_type: before.itemType,
      before_item_id: before.itemId,
      before_child_saga_id: before.childSagaId,
      motivo: w.reason,
    };
  };

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

  // TODAS las zonas, no solo `free`: una entrada que SALE de «Cuando quieras»
  // deja de mandar su ventana pero tiene que seguir siendo sujeto, porque es lo
  // que hace que su fila se borre en la misma transacción en que se mueve.
  //
  // El `saga_id` con el que se reclama NO es siempre `ownerSagaId`: una pantalla
  // solo puede hacerse responsable de una ventana que ENSEÑA, porque el RPC
  // borra los sujetos y reinserta `windows`, y un sujeto que se reclama sin
  // reemitir su ventana la borra sin reponerla.
  //
  //  · Zona `free`: sí la enseña (lleva su `WindowEditor`), así que reclama bajo
  //    la dueña — que con doble membresía puede ser una hija.
  //  · Fuera de `free`: la entrada no puede tener ventana en esta pantalla, así
  //    que reclama bajo la saga PROPIA, que es donde vive su fila. Reclamarla
  //    bajo una hija borraría la ventana que esa hija tiene curada sobre la
  //    misma obra — el caso de una obra con fila en el padre Y `libre` en la
  //    hija, con `is_primary` en la hija: el cajón no la lista (es entrada
  //    propia, `getSagaSequence` la excluye de `nested`), así que nadie la
  //    reemitiría.
  const subjectOf = (e: DraftEntry, zone: "free" | "own") => ({
    saga_id: zone === "free" ? e.ownerSagaId : sagaId,
    item_type: e.kind === "item" ? e.itemType : null,
    item_id: e.kind === "item" ? e.itemId : null,
    child_saga_id: e.kind === "block" ? e.childSagaId : null,
  });
  // Una baja ya no está en ninguna zona, así que su dueña no viaja en el
  // borrador: era fila de ESTA saga, que es lo único que se puede dar de baja
  // desde aquí (#187).
  const subjectFromKey = (key: string) => {
    const parts = key.split(":");
    return key.startsWith("i:")
      ? { saga_id: sagaId, item_type: parts[1] as ItemType, item_id: parts[2], child_saga_id: null }
      : { saga_id: sagaId, item_type: null, item_id: null, child_saga_id: key.slice(2) };
  };

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

  return { entries, blocks, removed: removedItems, removedBlocks: [], windows, windowSubjects, tandems };
}
