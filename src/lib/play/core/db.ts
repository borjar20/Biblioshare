"use client";

import type { PlayEvent } from "./types";

// Único fichero del motor que habla el idioma de IndexedDB (spec fase 3 §2).
// El store consume promesas; los fallos (modo privado, cuota, BD bloqueada)
// NUNCA lanzan hacia el store: se devuelven como resultado y quien llama
// degrada a memoria, igual que hacía el localStorage de fase 1.

export const DB_NAME = "biblioshare-play";
export const DB_VERSION = 1;

export type ActiveGameRecord = {
  identity: string; // uid real o "anon": mismo aislamiento que la clave de fase 1
  v: 1;
  committed: PlayEvent[];
  pending: PlayEvent | null;
  rev: number; // contador de escritura, monótono por registro: la base del CAS
};

export type SavedGameRecord = {
  gameId: string; // = committed[0].id (el game_started)
  identity: string;
  v: 1;
  committed: PlayEvent[];
  savedAt: number; // epoch ms
};

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
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("active")) {
          db.createObjectStore("active", { keyPath: "identity" });
        }
        if (!db.objectStoreNames.contains("saved")) {
          const saved = db.createObjectStore("saved", { keyPath: "gameId" });
          saved.createIndex("identity", "identity");
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
      // Hoy DB_VERSION es 1 y `onblocked` no puede dispararse; el día que suba,
      // una pestaña vieja con la BD abierta bloquearía el open y esta promesa
      // se quedaría colgada para siempre (y con ella toda la cola de
      // escrituras). Rechazar la deja caer por el camino ya previsto: sin BD,
      // se sigue jugando en memoria.
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

export async function readActive(identity: string): Promise<ActiveGameRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction("active", "readonly").objectStore("active").get(identity);
      request.onsuccess = () =>
        resolve((request.result as ActiveGameRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
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

export async function saveFinished(record: SavedGameRecord): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction("saved", "readwrite");
      tx.objectStore("saved").put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
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
