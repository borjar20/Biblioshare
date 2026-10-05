import { buildSavedSummary } from "../tools";
import { replay } from "./replay";
import type { SavedGameRecord } from "./db";
import type { PlayEvent } from "./types";

export function savedRecord(gameId: string, identity = "uid-A", syncStatus: "pending" | "synced" = "synced", deletedAt: number | null = null): SavedGameRecord {
  const committed: PlayEvent[] = [
    { id: gameId, type: "game_started", at: 1000, payload: { toolId: "score", setup: { participants: [{ id: "a", kind: "guest", name: "Ana" }, { id: "b", kind: "guest", name: "Beto" }], direction: "highest" } } },
    { id: `${gameId}-finish`, type: "game_finished", at: 2000, payload: { reason: "manual" } },
  ];
  return { gameId, identity, v: 2, committed, savedAt: 3000, summary: buildSavedSummary(replay(committed)), syncStatus, deletedAt };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

export function authSession(identity = "uid-A", sessionId = "session-A", refresh = 0) {
  return { data: { session: { user: { id: identity }, access_token: `test.${btoa(JSON.stringify({ session_id: sessionId, refresh }))}.fixture` } }, error: null };
}
