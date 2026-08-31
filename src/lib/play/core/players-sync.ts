import type { MirrorApi, MirrorStore } from "./sync";
import { runMirrorSync } from "./sync";
import { deletePlayer, listPlayers, putPlayer, readPlayer, type PlayerRecord } from "./db";

// Fila de `play_players` tal y como la ve el motor: SIN owner_id -- lo
// inyecta el adaptador Supabase, igual que PlayGameRow (Task 6/fase 5).
export type PlayPlayerRow = { id: string; name: string };

export const PLAYERS_CHANNEL_PREFIX = "biblioshare:play:players:";

const playersStore: MirrorStore<PlayerRecord, PlayPlayerRow> = {
  list: listPlayers,
  read: readPlayer,
  put: putPlayer,
  remove: deletePlayer,
  localId: (record) => record.playerId,
  toRow: (record) => ({ id: record.playerId, name: record.name }),
  fromRow: (row, identity) => ({
    playerId: row.id,
    identity,
    v: 1,
    name: row.name,
    syncStatus: "synced",
    deletedAt: null,
  }),
  channelPrefix: PLAYERS_CHANNEL_PREFIX,
};

export function runPlayersSync(identity: string, api: MirrorApi<PlayPlayerRow>): Promise<void> {
  return runMirrorSync(identity, api, playersStore);
}

// Candado gemelo de requestSavedSync (no se comparte el Map: una pasada de
// jugadores no debe bloquear ni re-lanzar una de guardadas).
const inFlight = new Map<string, { rerun: boolean }>();

export function requestPlayersSync(identity: string): void {
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
        const { createPlayPlayersApi } = await import("./play-players-api");
        await runPlayersSync(identity, createPlayPlayersApi(identity));
      } while (entry.rerun);
    } finally {
      inFlight.delete(identity);
    }
  })();
}
