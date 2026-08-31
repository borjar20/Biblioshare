import type { PlayEvent, SavedGameSummary } from "./types";
import type { SavedGameRecord } from "./db";

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
