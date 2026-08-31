import type { PlayEvent, SavedGameSummary } from "./types";
import type { SavedGameRecord } from "./db";
import { deleteSaved, listSaved, readSaved, saveFinished } from "./db";

// Fila de `play_games` tal y como la ve el motor: SIN owner_id -- lo inyecta
// el adaptador Supabase (Task 6), RLS ya filtra por auth.uid().
export type PlayGameRow = {
  id: string;
  tool_id: string;
  started_at: string; // ISO 8601
  finished_at: string;
  saved_at: string;
  summary: SavedGameSummary;
  events: PlayEvent[];
};

// Forma mínima que el reconciliador y el ejecutor genéricos necesitan de
// cualquier registro local espejado (fase 6): guardadas de hoy, otros
// dominios mañana (Task 4).
export type MirrorRecord = { syncStatus: "pending" | "synced"; deletedAt: number | null };

export type SyncPlan<L, R> = {
  deleteRemote: string[]; // tombstones con copia remota (tras el delete remoto, se borran local)
  dropLocal: string[]; // tombstones SIN copia remota (borrar local directo)
  push: L[]; // pending → upsert
  adoptLocal: R[]; // remoto → registro local synced
  deleteLocal: string[]; // synced local ausente en remoto (lo borró otro dispositivo)
};

// Reconciliación PURA (spec §5): sin IDB ni red, para poder probar cada caso.
// Reglas: un pending JAMÁS es pisado por el pull; el servidor manda sobre lo
// synced; un tombstone gana a todo hasta replicarse.
export function planSync<L extends MirrorRecord, R extends { id: string }>(
  local: L[],
  remote: R[],
  localId: (record: L) => string,
): SyncPlan<L, R> {
  const remoteIds = new Set(remote.map((r) => r.id));
  const localById = new Map(local.map((r) => [localId(r), r] as const));
  const plan: SyncPlan<L, R> = { deleteRemote: [], dropLocal: [], push: [], adoptLocal: [], deleteLocal: [] };

  for (const record of local) {
    const id = localId(record);
    if (record.deletedAt !== null) {
      (remoteIds.has(id) ? plan.deleteRemote : plan.dropLocal).push(id);
    } else if (record.syncStatus === "pending") {
      plan.push.push(record);
    } else if (!remoteIds.has(id)) {
      plan.deleteLocal.push(id);
    }
  }

  for (const row of remote) {
    const existing = localById.get(row.id);
    if (existing && (existing.deletedAt !== null || existing.syncStatus === "pending")) continue;
    plan.adoptLocal.push(row);
  }

  return plan;
}

export function rowFromRecord(record: SavedGameRecord): PlayGameRow {
  const first = record.committed[0];
  const last = record.committed[record.committed.length - 1];
  return {
    id: record.gameId,
    tool_id: record.summary.toolId,
    started_at: new Date(first.at).toISOString(),
    finished_at: new Date(last.at).toISOString(),
    saved_at: new Date(record.savedAt).toISOString(),
    summary: record.summary,
    events: record.committed,
  };
}

export function recordFromRow(row: PlayGameRow, identity: string): SavedGameRecord {
  return {
    gameId: row.id,
    identity,
    v: 2,
    committed: row.events,
    savedAt: Date.parse(row.saved_at),
    summary: row.summary,
    syncStatus: "synced",
    deletedAt: null,
  };
}

// Adaptador estrecho que el ejecutor necesita del backend remoto (Task 6),
// genérico sobre la fila que espeja cada dominio.
export type MirrorApi<R> = {
  selectAll(): Promise<{ rows: R[] } | { error: true }>;
  upsert(rows: R[]): Promise<{ error: boolean }>;
  remove(ids: string[]): Promise<{ error: boolean }>;
};

// La API pública de fase 5 NO cambia: PlayGamesApi sigue siendo el nombre que
// usa el resto del código (Task 6, play-games-api.ts).
export type PlayGamesApi = MirrorApi<PlayGameRow>;

export const SAVED_CHANNEL_PREFIX = "biblioshare:play:saved:";

function notifyChanged(channelPrefix: string, identity: string) {
  try {
    const channel = new BroadcastChannel(channelPrefix + identity);
    channel.postMessage({ type: "changed" });
    channel.close();
  } catch {
    // sin BroadcastChannel (entorno de test/navegador raro): la lista se
    // refresca igualmente en el próximo montaje
  }
}

// Operaciones de espejo que el ejecutor genérico necesita de cada dominio:
// el IDB local (list/read/put/remove), cómo identificar un registro y
// convertirlo hacia/desde la fila remota, y el prefijo de su BroadcastChannel.
export type MirrorStore<L extends MirrorRecord, R extends { id: string }> = {
  list(identity: string): Promise<L[]>;
  read(id: string): Promise<L | null>;
  put(record: L): Promise<boolean>;
  remove(id: string): Promise<void>;
  localId(record: L): string;
  toRow(record: L): R;
  fromRow(row: R, identity: string): L;
  channelPrefix: string;
};

// Una pasada completa (spec §5): TODO sale de un único snapshot remoto (un
// solo selectAll, tomado antes de escribir nada); las escrituras que siguen
// van en orden tombstones → push → pull/reconciliar.
// Cualquier fallo remoto deja el estado local como estaba: la próxima pasada
// reintenta. Nunca lanza.
export async function runMirrorSync<L extends MirrorRecord, R extends { id: string }>(
  identity: string,
  api: MirrorApi<R>,
  store: MirrorStore<L, R>,
): Promise<void> {
  const local = await store.list(identity);
  const localById = new Map(local.map((r) => [store.localId(r), r] as const));
  const result = await api.selectAll();
  if ("error" in result) return;
  const plan = planSync(local, result.rows, store.localId);

  if (plan.deleteRemote.length > 0) {
    const { error } = await api.remove(plan.deleteRemote);
    if (!error) for (const id of plan.deleteRemote) await store.remove(id);
  }
  for (const id of plan.dropLocal) await store.remove(id);

  if (plan.push.length > 0) {
    const { error } = await api.upsert(plan.push.map(store.toRow));
    if (!error) {
      for (const record of plan.push) {
        // El usuario pudo tombstonear o borrar en duro este registro (desde
        // el historial, en otra pestaña) mientras el upsert estaba en vuelo:
        // releer antes de marcar synced y no resucitar nada (mismo espíritu
        // que el CAS de writeActive sobre `active`).
        const current = await store.read(store.localId(record));
        if (current === null || current.deletedAt !== null) continue;
        // Guarda de edición en vuelo (fase 6, ver Task 4 Step 3): si el
        // releído ya no coincide con lo que se acaba de empujar, alguien lo
        // modificó mientras el upsert estaba en red -- no lo marques synced
        // (se queda pending y una pasada futura lo vuelve a subir). Para
        // guardadas de partida es inerte: un registro ya finalizado no se
        // vuelve a editar tras guardarse, así que el releído siempre
        // coincide con lo empujado; la guarda existe para dominios futuros
        // (fase 6) cuyo registro local sí puede cambiar en vuelo.
        if (JSON.stringify(store.toRow(current)) !== JSON.stringify(store.toRow(record))) continue;
        await store.put({ ...current, syncStatus: "synced" } as L);
      }
    }
  }

  for (const adopted of plan.adoptLocal) {
    // Misma guarda de rancidez para el pull: releer antes de adoptar. Si ya
    // no existe y el snapshot del plan SÍ tenía un local (synced) para este
    // id, es que lo borraron durante la pasada — no resucitar. Si nunca hubo
    // local (fila remota nueva de verdad), sí se escribe.
    const current = await store.read(adopted.id);
    if (current !== null && (current.deletedAt !== null || current.syncStatus === "pending")) continue;
    if (current === null && localById.has(adopted.id)) continue;
    await store.put(store.fromRow(adopted, identity));
  }
  for (const id of plan.deleteLocal) await store.remove(id);

  notifyChanged(store.channelPrefix, identity);
}

const savedStore: MirrorStore<SavedGameRecord, PlayGameRow> = {
  list: listSaved,
  read: readSaved,
  put: saveFinished,
  remove: deleteSaved,
  localId: (record) => record.gameId,
  toRow: rowFromRecord,
  fromRow: recordFromRow,
  channelPrefix: SAVED_CHANNEL_PREFIX,
};

export function runSavedSync(identity: string, api: PlayGamesApi): Promise<void> {
  return runMirrorSync(identity, api, savedStore);
}

// Candado por identidad: una pasada en vuelo; si llega otra petición, se anota
// y corre UNA vez más al terminar (sin colas largas — spec §5).
const inFlight = new Map<string, { rerun: boolean }>();

export function requestSavedSync(identity: string): void {
  if (identity === "anon") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const current = inFlight.get(identity);
  if (current) {
    current.rerun = true;
    return;
  }
  const entry = { rerun: false };
  inFlight.set(identity, entry);
  void (async () => {
    try {
      do {
        entry.rerun = false;
        const { createPlayGamesApi } = await import("./play-games-api");
        await runSavedSync(identity, createPlayGamesApi(identity));
      } while (entry.rerun);
    } finally {
      inFlight.delete(identity);
    }
  })();
}
