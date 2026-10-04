"use client";

import type { PlayEvent, SavedGameSummary } from "./types";
import { replay } from "./replay";
import { buildSavedSummary } from "../tools";

// Único fichero del motor que habla el idioma de IndexedDB (spec fase 3 §2).
// El store consume promesas; los fallos (modo privado, cuota, BD bloqueada)
// NUNCA lanzan hacia el store: se devuelven como resultado y quien llama
// degrada a memoria, igual que hacía el localStorage de fase 1.

export const DB_NAME = "biblioshare-play";
export const DB_VERSION = 5;

export type ActiveGameRecord = {
  identity: string; // uid real o "anon": mismo aislamiento que la clave de fase 1
  v: 1;
  committed: PlayEvent[];
  pending: PlayEvent | null;
  rev: number; // contador de escritura, monótono por registro: la base del CAS
};

// SavedGameRecord pasa a v2 (fase 5): el almacén `saved` es el ESPEJO del
// servidor y la única fuente de la UI del historial.
export type SavedGameRecord = {
  gameId: string; // = committed[0].id (el game_started)
  identity: string;
  v: 2;
  committed: PlayEvent[];
  savedAt: number; // epoch ms
  summary: SavedGameSummary; // el mismo objeto que sube a play_games.summary
  syncStatus: "pending" | "synced";
  deletedAt: number | null; // tombstone: borrado pendiente de replicar
};

// Contexto de cancelación del espejo, nunca una credencial ni autorización.
// La generación se comprueba en la MISMA transacción que cada escritura.
export type SavedSession = { identity: string; generation: number; sessionId: string | null };
type SavedSessionRecord = SavedSession & { closed: boolean; retired: string[] };
export type SavedPurgeResult =
  | { ok: true; deleted: number; retained: number; generation: number }
  | { ok: false; reason: "unavailable" | "stale" };

// PlayerRecord llega en fase 6: el almacén `players` es el ESPEJO local de
// play_players, con el mismo patrón que `saved` (identity + syncStatus +
// tombstone).
export type PlayerRecord = {
  playerId: string; // = play_players.id
  identity: string; // uid real; NUNCA "anon"
  v: 1;
  name: string;
  syncStatus: "pending" | "synced";
  deletedAt: number | null; // tombstone: borrado pendiente de replicar
};

// CompanionRecord llega con el randomizer (spec randomizer §5): el almacén
// `companion` guarda el estado de CUALQUIER acompañante (Aleatorio, Reloj…)
// FUERA del slot `active` — una partida activa y los companions conviven.
// La clave es `identity` (storageKey del hook) — el Aleatorio usa la
// identidad a secas (clave histórica) y el Reloj `${identity}:clock`; el
// campo se sigue llamando `identity` por herencia. `base` es el estado
// re-basado por la compactación; viaja como `unknown` porque db.ts es neutro
// y no importa tipos de `random/` ni `clock/` (quien lee valida por replay).
export type CompanionRecord = {
  identity: string; // uid real o "anon", mismo aislamiento que `active`
  v: 1;
  base: unknown; // RandomState serializado o null
  log: PlayEvent[];
  rev: number; // CAS, como ActiveGameRecord
};

export type CompanionWriteResult =
  | { ok: true }
  | { ok: false; reason: "conflict"; current: CompanionRecord }
  | { ok: false; reason: "unavailable" };

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: "conflict"; current: ActiveGameRecord }
  | { ok: false; reason: "unavailable" };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const idb = globalThis.indexedDB;
      if (!idb) {
        reject(new Error("IndexedDB no disponible"));
        return;
      }
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains("active")) {
          db.createObjectStore("active", { keyPath: "identity" });
        }
        if (!db.objectStoreNames.contains("saved")) {
          const saved = db.createObjectStore("saved", { keyPath: "gameId" });
          saved.createIndex("identity", "identity");
        }
        if (!db.objectStoreNames.contains("players")) {
          const players = db.createObjectStore("players", { keyPath: "playerId" });
          players.createIndex("identity", "identity");
        }
        if (!db.objectStoreNames.contains("companion")) {
          db.createObjectStore("companion", { keyPath: "identity" });
        }
        if (!db.objectStoreNames.contains("saved_sessions")) {
          db.createObjectStore("saved_sessions", { keyPath: "identity" });
        }
        // v1 → v2: los guardados de fase 3/4 ganan summary (derivado por replay,
        // UNA vez, aquí) y quedan pendientes de subir. Un log que no re-juega
        // está roto también para la UI: se descarta, no se arrastra.
        if (event.oldVersion > 0 && event.oldVersion < 2) {
          const saved = request.transaction!.objectStore("saved");
          saved.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!cursor) return;
            const old = cursor.value as {
              gameId: string;
              identity: string;
              committed: PlayEvent[];
              savedAt: number;
            };
            try {
              const summary = buildSavedSummary(replay(old.committed));
              cursor.update({
                gameId: old.gameId,
                identity: old.identity,
                v: 2,
                committed: old.committed,
                savedAt: old.savedAt,
                summary,
                syncStatus: "pending",
                deletedAt: null,
              } satisfies SavedGameRecord);
            } catch {
              cursor.delete();
            }
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // La conexión cacheada puede morir sin que nadie la cierre desde aquí:
        // iOS Safari cierra POR LA FUERZA las conexiones IndexedDB de las
        // pestañas en segundo plano (y el navegador puede pedir cerrar por un
        // cambio de versión desde otra pestaña). Sin esto, `dbPromise` seguiría
        // apuntando a esa conexión muerta para siempre: TODA transacción
        // posterior lanzaría, el store degradaría a memoria en silencio y la
        // partida dejaría de guardarse durante el resto de la vida de la página
        // — pérdida sin tope. Al soltar la caché, la siguiente operación
        // reabre la BD de forma transparente, sin que el store se entere.
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("open falló"));
      // Con DB_VERSION al alza, una pestaña vieja con la BD abierta en una
      // versión anterior puede bloquear este open de verdad: sin este
      // handler la promesa se quedaría colgada para siempre (y con ella toda
      // la cola de escrituras). Rechazar la deja caer por el camino ya
      // previsto: sin BD, se sigue jugando en memoria.
      request.onblocked = () =>
        reject(new Error("open bloqueado por otra conexión con una versión anterior"));
    });
    // Un open fallido no se cachea: el siguiente intento vuelve a probar
    // (p. ej. Safari en privado a veces deja abrir más tarde).
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

export type ActiveReadResult =
  | { ok: true; record: ActiveGameRecord | null }
  | { ok: false; reason: "unavailable" };

export async function readActive(identity: string): Promise<ActiveReadResult> {
  try {
    const db = await openDb();
    const record = await new Promise<ActiveGameRecord | null>((resolve, reject) => {
      const tx = db.transaction("active", "readonly");
      const request = tx.objectStore("active").get(identity);
      tx.oncomplete = () => resolve((request.result as ActiveGameRecord | undefined) ?? null);
      tx.onabort = () => reject(tx.error ?? new Error("active read aborted"));
      tx.onerror = () => reject(tx.error);
      request.onerror = () => reject(request.error);
    });
    return { ok: true, record };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// Compare-and-set sobre `rev` DENTRO de la transacción: si el registro en BD
// ya tiene un rev igual o mayor, otra pestaña escribió antes — no se pisa y
// se devuelve el vigente para que el store lo adopte (spec fase 3 §2 y §4).
export async function writeActive(record: ActiveGameRecord): Promise<WriteResult> {
  try {
    const db = await openDb();
    return await new Promise<WriteResult>((resolve) => {
      const tx = db.transaction("active", "readwrite");
      const store = tx.objectStore("active");
      const get = store.get(record.identity);
      get.onsuccess = () => {
        const current = (get.result as ActiveGameRecord | undefined) ?? null;
        if (current && current.rev >= record.rev) {
          resolve({ ok: false, reason: "conflict", current });
          return; // la promesa ya está resuelta; el oncomplete posterior no hace nada
        }
        store.put(record);
      };
      tx.oncomplete = () => resolve({ ok: true });
      tx.onerror = () => resolve({ ok: false, reason: "unavailable" });
      tx.onabort = () => resolve({ ok: false, reason: "unavailable" });
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function deleteActive(identity: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("active", "readwrite");
      tx.objectStore("active").delete(identity);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // sin BD no hay nada que borrar
  }
}

export async function readCompanion(identity: string): Promise<CompanionRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("companion", "readonly")
        .objectStore("companion")
        .get(identity);
      request.onsuccess = () =>
        resolve((request.result as CompanionRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

// Mismo CAS que writeActive: el rev en BD igual o mayor gana y se
// devuelve para que quien escribe lo adopte.
export async function writeCompanion(record: CompanionRecord): Promise<CompanionWriteResult> {
  try {
    const db = await openDb();
    return await new Promise<CompanionWriteResult>((resolve) => {
      const tx = db.transaction("companion", "readwrite");
      const store = tx.objectStore("companion");
      const get = store.get(record.identity);
      get.onsuccess = () => {
        const current = (get.result as CompanionRecord | undefined) ?? null;
        if (current && current.rev >= record.rev) {
          resolve({ ok: false, reason: "conflict", current });
          return;
        }
        store.put(record);
      };
      tx.oncomplete = () => resolve({ ok: true });
      tx.onerror = () => resolve({ ok: false, reason: "unavailable" });
      tx.onabort = () => resolve({ ok: false, reason: "unavailable" });
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function deleteCompanion(identity: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("companion", "readwrite");
      tx.objectStore("companion").delete(identity);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // sin BD no hay nada que borrar
  }
}

function validSavedSession(record: SavedSessionRecord, identity: string): boolean {
  return record.identity === identity && Number.isSafeInteger(record.generation) && record.generation > 0 &&
    typeof record.closed === "boolean" && typeof record.sessionId === "string" && record.sessionId.length > 0 &&
    Array.isArray(record.retired) && record.retired.every((id) => typeof id === "string");
}

function currentSavedSession(record: SavedSessionRecord | undefined, session: SavedSession): boolean {
  if (!record) return session.generation === 0 && session.sessionId === null;
  return validSavedSession(record, session.identity) && !record.closed &&
    record.generation === session.generation && record.sessionId === session.sessionId;
}

export async function readSavedSession(identity: string): Promise<SavedSession | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction("saved_sessions", "readonly");
      const get = tx.objectStore("saved_sessions").get(identity);
      tx.oncomplete = () => {
        const record = get.result as SavedSessionRecord | undefined;
        if (!record) resolve({ identity, generation: 0, sessionId: null });
        else resolve(validSavedSession(record, identity) && !record.closed
          ? { identity, generation: record.generation, sessionId: record.sessionId } : null);
      };
      tx.onerror = tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function isSavedSessionCurrent(session: SavedSession): Promise<boolean> {
  const current = await readSavedSession(session.identity);
  return current !== null && current.generation === session.generation && current.sessionId === session.sessionId;
}

// Quien llama valida el uid contra Auth ANTES de registrar este contexto. Un
// refresh conserva session_id; un login nuevo puede reabrir con otro id. Los
// ids retirados impiden que una pestaña antigua reabra una sesión después de ABA.
export async function startSavedSession(identity: string, sessionId: string): Promise<SavedSession | null> {
  if (!identity || identity === "anon" || !sessionId) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction("saved_sessions", "readwrite");
      const store = tx.objectStore("saved_sessions");
      const get = store.get(identity);
      let result: SavedSession | null = null;
      get.onsuccess = () => {
        const previous = get.result as SavedSessionRecord | undefined;
        if (previous && (!validSavedSession(previous, identity) || previous.retired.includes(sessionId))) return;
        if (previous && !previous.closed && previous.sessionId === sessionId) {
          result = { identity, generation: previous.generation, sessionId };
          return;
        }
        const generation = (previous?.generation ?? 0) + 1;
        if (!Number.isSafeInteger(generation)) return;
        const retired = [...(previous?.retired ?? [])];
        if (previous?.sessionId && !retired.includes(previous.sessionId)) retired.push(previous.sessionId);
        store.put({ identity, generation, sessionId, closed: false, retired } satisfies SavedSessionRecord);
        result = { identity, generation, sessionId };
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Cierre y purga son atómicos entre documentos. Un tombstone, incluso marcado
// synced, todavía representa una intención de borrado SIN confirmar; synced
// acredita su subida original, no el ACK del delete remoto (#975).
export async function purgeSyncedSavedFor(identity: string, sessionId: string): Promise<SavedPurgeResult> {
  if (!identity || identity === "anon" || !sessionId) return { ok: false, reason: "stale" };
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(["saved", "saved_sessions"], "readwrite");
      const sessions = tx.objectStore("saved_sessions");
      const get = sessions.get(identity);
      let result: SavedPurgeResult = { ok: false, reason: "stale" };
      get.onsuccess = () => {
        const previous = get.result as SavedSessionRecord | undefined;
        if (previous && (!validSavedSession(previous, identity) || previous.sessionId !== sessionId)) return;
        const generation = previous?.closed ? previous.generation : (previous?.generation ?? 0) + 1;
        if (!Number.isSafeInteger(generation)) return;
        const retired = [...(previous?.retired ?? [])];
        if (!retired.includes(sessionId)) retired.push(sessionId);
        sessions.put({ identity, generation, sessionId, closed: true, retired } satisfies SavedSessionRecord);
        const counts = { ok: true as const, deleted: 0, retained: 0, generation };
        result = counts;
        const cursor = tx.objectStore("saved").index("identity").openCursor(identity);
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          const saved = row.value as SavedGameRecord;
          if (saved.syncStatus === "synced" && saved.deletedAt === null) {
            row.delete();
            counts.deleted++;
          } else counts.retained++;
          row.continue();
        };
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => resolve({ ok: false, reason: "unavailable" });
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function saveFinished(record: SavedGameRecord, session?: SavedSession): Promise<boolean> {
  try {
    const context = session ?? await readSavedSession(record.identity);
    if (!context || context.identity !== record.identity) return false;
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(["saved", "saved_sessions"], "readwrite");
      const saved = tx.objectStore("saved");
      const getSession = tx.objectStore("saved_sessions").get(record.identity);
      let accepted = false;
      getSession.onsuccess = () => {
        if (!currentSavedSession(getSession.result as SavedSessionRecord | undefined, context)) return;
        const get = saved.get(record.gameId);
        get.onsuccess = () => {
          // Sólo la adopción local explícita (sin contexto de sync) puede mover
          // una guardada anónima. Una respuesta de A jamás pisa la fila de B.
          if (session && get.result && (get.result as SavedGameRecord).identity !== record.identity) return;
          saved.put(record);
          accepted = true;
        };
      };
      tx.oncomplete = () => resolve(accepted);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// Para la guarda de rancidez del ejecutor de sync (I2): releer el registro
// actual justo antes de escribir, para no pisar un borrado/tombstone que
// ocurrió mientras la pasada estaba en vuelo.
export async function readSaved(gameId: string): Promise<SavedGameRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction("saved", "readonly").objectStore("saved").get(gameId);
      request.onsuccess = () =>
        resolve((request.result as SavedGameRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function listSaved(identity: string): Promise<SavedGameRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("saved", "readonly")
        .objectStore("saved")
        .index("identity")
        .getAll(identity);
      request.onsuccess = () => resolve((request.result as SavedGameRecord[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function deleteSaved(gameId: string, session?: SavedSession): Promise<void> {
  try {
    const record = session ? null : await readSaved(gameId);
    const context = session ?? (record && await readSavedSession(record.identity));
    if (!context) return;
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["saved", "saved_sessions"], "readwrite");
      const saved = tx.objectStore("saved");
      const getSession = tx.objectStore("saved_sessions").get(context.identity);
      getSession.onsuccess = () => {
        if (!currentSavedSession(getSession.result as SavedSessionRecord | undefined, context)) return;
        const get = saved.get(gameId);
        get.onsuccess = () => {
          if ((get.result as SavedGameRecord | undefined)?.identity === context.identity) saved.delete(gameId);
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // sin BD no hay nada que borrar
  }
}

export async function listPlayers(identity: string): Promise<PlayerRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("players", "readonly")
        .objectStore("players")
        .index("identity")
        .getAll(identity);
      request.onsuccess = () => resolve((request.result as PlayerRecord[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function readPlayer(playerId: string): Promise<PlayerRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction("players", "readonly").objectStore("players").get(playerId);
      request.onsuccess = () =>
        resolve((request.result as PlayerRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function putPlayer(record: PlayerRecord): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction("players", "readwrite");
      tx.objectStore("players").put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function deletePlayer(playerId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("players", "readwrite");
      tx.objectStore("players").delete(playerId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // sin BD no hay nada que borrar
  }
}

// Solo para tests: cierra la conexión cacheada y borra la BD entera.
export async function __resetDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      // ya estaba rota
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve) => {
    const request = globalThis.indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
