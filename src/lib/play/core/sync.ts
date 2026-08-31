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

export type SyncPlan = {
  deleteRemote: string[]; // tombstones con copia remota (tras el delete remoto, se borran local)
  dropLocal: string[]; // tombstones SIN copia remota (borrar local directo)
  push: SavedGameRecord[]; // pending → upsert
  adoptLocal: PlayGameRow[]; // remoto → registro local synced
  deleteLocal: string[]; // synced local ausente en remoto (lo borró otro dispositivo)
};

// Reconciliación PURA (spec §5): sin IDB ni red, para poder probar cada caso.
// Reglas: un pending JAMÁS es pisado por el pull; el servidor manda sobre lo
// synced; un tombstone gana a todo hasta replicarse.
export function planSync(local: SavedGameRecord[], remote: PlayGameRow[]): SyncPlan {
  const remoteIds = new Set(remote.map((r) => r.id));
  const localById = new Map(local.map((r) => [r.gameId, r] as const));
  const plan: SyncPlan = { deleteRemote: [], dropLocal: [], push: [], adoptLocal: [], deleteLocal: [] };

  for (const record of local) {
    if (record.deletedAt !== null) {
      (remoteIds.has(record.gameId) ? plan.deleteRemote : plan.dropLocal).push(record.gameId);
    } else if (record.syncStatus === "pending") {
      plan.push.push(record);
    } else if (!remoteIds.has(record.gameId)) {
      plan.deleteLocal.push(record.gameId);
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

// Adaptador estrecho que el ejecutor necesita del backend remoto (Task 6).
export type PlayGamesApi = {
  selectAll(): Promise<{ rows: PlayGameRow[] } | { error: true }>;
  upsert(rows: PlayGameRow[]): Promise<{ error: boolean }>;
  remove(ids: string[]): Promise<{ error: boolean }>;
};

export const SAVED_CHANNEL_PREFIX = "biblioshare:play:saved:";

function notifySavedChanged(identity: string) {
  try {
    const channel = new BroadcastChannel(SAVED_CHANNEL_PREFIX + identity);
    channel.postMessage({ type: "changed" });
    channel.close();
  } catch {
    // sin BroadcastChannel (entorno de test/navegador raro): la lista se
    // refresca igualmente en el próximo montaje
  }
}

// Una pasada completa (spec §5): TODO sale de un único snapshot remoto (un
// solo selectAll, tomado antes de escribir nada); las escrituras que siguen
// van en orden tombstones → push → pull/reconciliar.
// Cualquier fallo remoto deja el estado local como estaba: la próxima pasada
// reintenta. Nunca lanza.
export async function runSavedSync(identity: string, api: PlayGamesApi): Promise<void> {
  const local = await listSaved(identity);
  const localById = new Map(local.map((r) => [r.gameId, r] as const));
  const result = await api.selectAll();
  if ("error" in result) return;
  const plan = planSync(local, result.rows);

  if (plan.deleteRemote.length > 0) {
    const { error } = await api.remove(plan.deleteRemote);
    if (!error) for (const id of plan.deleteRemote) await deleteSaved(id);
  }
  for (const id of plan.dropLocal) await deleteSaved(id);

  if (plan.push.length > 0) {
    const { error } = await api.upsert(plan.push.map(rowFromRecord));
    if (!error) {
      for (const record of plan.push) {
        // El usuario pudo tombstonear o borrar en duro este registro (desde
        // el historial, en otra pestaña) mientras el upsert estaba en vuelo:
        // releer antes de marcar synced y no resucitar nada (mismo espíritu
        // que el CAS de writeActive sobre `active`).
        const current = await readSaved(record.gameId);
        if (current === null || current.deletedAt !== null) continue;
        await saveFinished({ ...current, syncStatus: "synced" });
      }
    }
  }

  for (const adopted of plan.adoptLocal) {
    // Misma guarda de rancidez para el pull: releer antes de adoptar. Si ya
    // no existe y el snapshot del plan SÍ tenía un local (synced) para este
    // id, es que lo borraron durante la pasada — no resucitar. Si nunca hubo
    // local (fila remota nueva de verdad), sí se escribe.
    const current = await readSaved(adopted.id);
    if (current !== null && (current.deletedAt !== null || current.syncStatus === "pending")) continue;
    if (current === null && localById.has(adopted.id)) continue;
    await saveFinished(recordFromRow(adopted, identity));
  }
  for (const id of plan.deleteLocal) await deleteSaved(id);

  notifySavedChanged(identity);
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
