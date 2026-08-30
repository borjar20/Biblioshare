# BiblioPlay Fase 3 — Persistencia IndexedDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el puente localStorage del store de Play por IndexedDB con hidratación asíncrona, migración automática, espejo entre pestañas y «Guardar partida», cerrando #932/#933/#935/#936.

**Architecture:** Un wrapper de promesas sin dependencias (`db.ts`) es el único fichero que habla IndexedDB (almacenes `active` por identidad y `saved` por gameId, CAS sobre `rev`). El store pasa a snapshot `loading | ready` con cola de escrituras en orden y BroadcastChannel por identidad. El motor puro (log/replay/reducer) no cambia.

**Tech Stack:** Next.js 16 (Cache Components), React 19 `useSyncExternalStore`, IndexedDB nativo, BroadcastChannel, vitest + fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-30-play-fase-3-persistencia-design.md` — manda sobre este plan si contradicen.

## Global Constraints

- Node 22 obligatorio para vitest: `fnm use 22` antes de cualquier `npm test` (el shell por defecto trae v20 y vitest revienta).
- `npm run build` DEBE pasar antes de cada push (regla del proyecto: dev compila cosas que build rechaza).
- `git add` siempre con rutas explícitas, nunca `-A` (hay `.impeccable/` y `.github/hooks/` sin trackear que no son nuestros).
- `docs/requirements/decisiones.md` es append-only; los appends por Bash heredoc (PowerShell here-strings los bloquea un hook).
- BD IndexedDB: nombre `biblioshare-play`, versión `1`, almacenes `active` (keyPath `identity`) y `saved` (keyPath `gameId`, índice `identity`).
- BroadcastChannel: nombre `biblioshare:play:<identity>`.
- Clave localStorage legada (solo migración): `biblioshare:play:<identity>:active`.
- Sin dependencias nuevas de runtime; `fake-indexeddb` solo devDependency.
- Rama de trabajo: `feat/play-persistencia-idb` desde `main`. Dos PRs: PR-A (Tasks 1–5), PR-B (Tasks 6–8) sobre la rama de PR-A.
- Comentarios y copy en español, estilo de los ficheros vecinos.

---

### Task 0: Rama y dependencia de test

**Files:**
- Modify: `package.json` (devDependency)

- [ ] **Step 0.1: Crear rama**

```bash
git checkout -b feat/play-persistencia-idb main
```

- [ ] **Step 0.2: Instalar fake-indexeddb**

```bash
npm install --save-dev fake-indexeddb
```

- [ ] **Step 0.3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(play): fake-indexeddb para testear la persistencia (#931)"
```

---

### Task 1: `db.ts` — wrapper de IndexedDB con CAS

**Files:**
- Create: `src/lib/play/core/db.ts`
- Test: `src/lib/play/core/db.test.ts`

**Interfaces:**
- Consumes: `PlayEvent` de `./types`.
- Produces (Task 3 depende de esto, firmas exactas):
  - `type ActiveGameRecord = { identity: string; v: 1; committed: PlayEvent[]; pending: PlayEvent | null; rev: number }`
  - `type SavedGameRecord = { gameId: string; identity: string; v: 1; committed: PlayEvent[]; savedAt: number }`
  - `type WriteResult = { ok: true } | { ok: false; reason: "conflict"; current: ActiveGameRecord } | { ok: false; reason: "unavailable" }`
  - `readActive(identity: string): Promise<ActiveGameRecord | null>`
  - `writeActive(record: ActiveGameRecord): Promise<WriteResult>`
  - `deleteActive(identity: string): Promise<void>`
  - `saveFinished(record: SavedGameRecord): Promise<boolean>`
  - `__resetDbForTests(): Promise<void>`

- [ ] **Step 1.1: Escribir los tests (fallan: el módulo no existe)**

```ts
// src/lib/play/core/db.test.ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  deleteActive,
  readActive,
  saveFinished,
  writeActive,
  type ActiveGameRecord,
} from "./db";

function record(rev: number): ActiveGameRecord {
  return {
    identity: "anon",
    v: 1,
    committed: [{ id: "e1", type: "game_started", at: 1000, payload: {} }],
    pending: null,
    rev,
  };
}

beforeEach(async () => {
  await __resetDbForTests();
});

describe("active", () => {
  it("escribe y lee el registro por identidad", async () => {
    expect(await writeActive(record(1))).toEqual({ ok: true });
    const read = await readActive("anon");
    expect(read?.rev).toBe(1);
    expect(read?.committed).toHaveLength(1);
  });

  it("sin registro devuelve null, y otra identidad no ve el ajeno", async () => {
    await writeActive(record(1));
    expect(await readActive("uid-x")).toBeNull();
  });

  it("CAS: un rev igual o menor NO pisa y devuelve el registro vigente", async () => {
    await writeActive(record(2));
    const result = await writeActive(record(2));
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "conflict") {
      expect(result.current.rev).toBe(2);
    } else {
      throw new Error("esperaba conflict");
    }
    // rev mayor sí pisa
    expect(await writeActive(record(3))).toEqual({ ok: true });
  });

  it("deleteActive borra y es idempotente", async () => {
    await writeActive(record(1));
    await deleteActive("anon");
    await deleteActive("anon");
    expect(await readActive("anon")).toBeNull();
  });
});

describe("saved", () => {
  it("guarda una partida terminada", async () => {
    const ok = await saveFinished({
      gameId: "e1",
      identity: "anon",
      v: 1,
      committed: [{ id: "e1", type: "game_started", at: 1000, payload: {} }],
      savedAt: 2000,
    });
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 1.2: Verificar que fallan**

```bash
fnm use 22 && npx vitest run src/lib/play/core/db.test.ts
```
Expected: FAIL — `Cannot find module './db'`.

- [ ] **Step 1.3: Implementar `db.ts`**

```ts
// src/lib/play/core/db.ts
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
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("open falló"));
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
```

- [ ] **Step 1.4: Verificar que pasan**

```bash
npx vitest run src/lib/play/core/db.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/play/core/db.ts src/lib/play/core/db.test.ts
git commit -m "feat(play): db.ts -- IndexedDB con CAS por rev para la partida activa (#931)"
```

---

### Task 2: Store asíncrono — el corazón de la fase

Reescritura de `store.ts`: snapshot `loading | ready`, cola de escrituras, migración desde localStorage, `destroy()` (#935) y parseo de una pasada (#936). El espejo BroadcastChannel entra aquí porque la infraestructura (rev + adopt) es la misma; su test dedicado va en Task 6.

**Files:**
- Modify: `src/lib/play/core/store.ts` (reescritura completa, abajo)
- Modify: `src/lib/play/core/store.test.ts` (adaptación, Step 2.4)

**Interfaces:**
- Consumes: Task 1 (`readActive`, `writeActive`, `deleteActive`, `saveFinished`, `ActiveGameRecord`); `log.ts` y `replay.ts` sin cambios.
- Produces (Tasks 3, 4 y 7 dependen de esto):
  - `type PlayStoreSnapshot = { status: "loading"; game: null } | { status: "ready"; game: ActiveGame | null }`
  - `PlayStore.getSnapshot(): PlayStoreSnapshot` (antes devolvía `ActiveGame | null`)
  - `PlayStore.save(): Promise<boolean>` (nuevo)
  - `PlayStore.destroy(): void` (nuevo)
  - `parseSnapshot(raw: string | null): ActiveGame | null` (antes devolvía `EventLog | null`)
  - `__createPlayStoreForTests(identity: string): PlayStore` (nuevo, salta la caché)
  - `start/tap/dispatch/undo` con snapshot `loading` devuelven `false`/`null`.

- [ ] **Step 2.1: Test nuevo de contrato async (falla)**

Añadir a `src/lib/play/core/store.test.ts` (imports arriba: `import "fake-indexeddb/auto";` como PRIMERA línea del fichero, y `vi` desde vitest; añadir el helper y este describe al final):

```ts
// Helper compartido: espera a que el store hidrate.
async function ready(store: PlayStore): Promise<void> {
  await vi.waitFor(() => {
    if (store.getSnapshot().status !== "ready") throw new Error("hidratando");
  });
}

describe("hidratación asíncrona (fase 3)", () => {
  it("nace en loading y pasa a ready sin partida", async () => {
    const store = getPlayStore("anon");
    expect(store.getSnapshot().status).toBe("loading");
    await ready(store);
    expect(store.getSnapshot()).toEqual({ status: "ready", game: null });
  });

  it("en loading, start/tap/dispatch devuelven false y undo null", () => {
    const store = getPlayStore("anon");
    expect(store.getSnapshot().status).toBe("loading");
    expect(store.start(started(1000))).toBe(false);
    expect(store.tap(life(2000, "p1", -1))).toBe(false);
    expect(store.dispatch(life(2000, "p1", -1))).toBe(false);
    expect(store.undo()).toBeNull();
  });

  it("una partida sobrevive a recrear el store (IndexedDB, no localStorage)", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    expect(store.start(started(1000))).toBe(true);
    __resetPlayStoresForTests();
    const reborn = getPlayStore("anon");
    await vi.waitFor(() => {
      const snapshot = reborn.getSnapshot();
      if (snapshot.status !== "ready" || snapshot.game === null) throw new Error("aún no");
    });
  });

  it("migra el snapshot localStorage de fase 1 y borra la clave", async () => {
    const legacy = { v: 1, committed: [started(1000)], pending: null };
    globalThis.localStorage.setItem(playStorageKey("anon"), JSON.stringify(legacy));
    const store = getPlayStore("anon");
    await ready(store);
    const snapshot = store.getSnapshot();
    expect(snapshot.status === "ready" && snapshot.game !== null).toBe(true);
    expect(globalThis.localStorage.getItem(playStorageKey("anon"))).toBeNull();
  });

  it("destroy() cierra sin fugas y el reset destruye stores (#935)", async () => {
    const store = __createPlayStoreForTests("anon");
    await ready(store);
    store.destroy(); // no debe lanzar; listeners y canal quedan retirados
  });
});
```

Notas para el implementador:
- `started(at)` y `life(at, target, delta)` son las fábricas de eventos que este fichero de test ya define arriba — reutilízalas, no las redefinas.
- El `beforeEach` existente llama a `__resetPlayStoresForTests()`; añádele `await __resetDbForTests();` (import desde `./db`) y `globalThis.localStorage?.clear?.()`. El entorno es `node`: el fichero ya monta un localStorage falso o usa memoria — mira cómo lo hace hoy y consérvalo.

- [ ] **Step 2.2: Verificar que fallan**

```bash
npx vitest run src/lib/play/core/store.test.ts
```
Expected: FAIL — `getSnapshot().status` es undefined con el store viejo (y `__createPlayStoreForTests` no existe).

- [ ] **Step 2.3: Reescribir `store.ts`**

Conservar del fichero actual: el comentario de cabecera sobre `"use client"` y regla #437, `SNAPSHOT_VERSION`, `playStorageKey` con su guarda de identidad vacía, `isPlayEventShape`, y los comentarios de contrato de start/tap/dispatch (finding 1). Cuerpo nuevo:

```ts
"use client";

import { append, appendTap, BURST_WINDOW_MS, emptyLog, flushPending, undoLast } from "./log";
import { replay } from "./replay";
import { PlayEventError } from "./errors";
import {
  deleteActive,
  readActive,
  saveFinished,
  writeActive,
  type ActiveGameRecord,
} from "./db";
import type { ActiveGameSnapshot, EventLog, PlayEvent } from "./types";
import type { PlayGameState } from "@/lib/play/tools";

// [conservar aquí el comentario de cabecera actual: "use client", Map por
// identidad, regla #437]

export const SNAPSHOT_VERSION = 1 as const;

export function playStorageKey(identity: string): string {
  // [conservar comentario actual de la guarda]
  if (identity.trim() === "") {
    throw new Error("playStorageKey: identity no puede estar vacía");
  }
  return `biblioshare:play:${identity}:active`;
}

export type ActiveGame = { log: EventLog; state: PlayGameState };

// Fase 3: IndexedDB no se lee síncrono, así que el snapshot distingue
// «hidratando» de «no hay partida». La UI NUNCA trata loading como vacío:
// redirigiría al hub un frame antes de saber si hay partida (spec fase 3 §3).
export type PlayStoreSnapshot =
  | { status: "loading"; game: null }
  | { status: "ready"; game: ActiveGame | null };

function isPlayEventShape(value: unknown): value is PlayEvent {
  // [idéntico al actual]
}

// #936: forma + semántica en UNA pasada — valida, sella la ráfaga pendiente y
// replaya una sola vez, devolviendo log y estado juntos.
export function parseLog(committed: unknown, pending: unknown): ActiveGame | null {
  if (!Array.isArray(committed) || !committed.every(isPlayEventShape)) return null;
  if (pending !== null && !isPlayEventShape(pending)) return null;
  const log = flushPending({ committed, pending: pending as PlayEvent | null });
  try {
    return { log, state: replay(log.committed) };
  } catch {
    return null;
  }
}

export function parseSnapshot(raw: string | null): ActiveGame | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as ActiveGameSnapshot;
    if (snapshot?.v !== SNAPSHOT_VERSION) return null;
    return parseLog(snapshot.committed, snapshot.pending);
  } catch {
    return null;
  }
}

export type PlayStore = {
  subscribe(callback: () => void): () => void;
  getSnapshot(): PlayStoreSnapshot;
  start(event: PlayEvent): boolean;
  tap(event: PlayEvent): boolean;
  dispatch(event: PlayEvent): boolean;
  undo(): PlayEvent | null;
  flush(): void;
  discard(): void;
  // Guarda la partida TERMINADA en el almacén local `saved` y limpia la
  // activa. false si no hay partida, no está terminada o la BD falla — en ese
  // caso la activa NO se toca (no se pierde nada por un fallo de guardado).
  save(): Promise<boolean>;
  // #935: retira listeners, cierra el canal y para el timer. El Map de stores
  // llama a esto al resetear; en producción un store vive lo que la página.
  destroy(): void;
};

function createPlayStore(identity: string): PlayStore {
  const legacyKey = playStorageKey(identity);
  let snapshot: PlayStoreSnapshot = { status: "loading", game: null };
  let rev = 0;
  const listeners = new Set<() => void>();
  let sealTimer: ReturnType<typeof setTimeout> | null = null;
  // Cola de escrituras: UNA en vuelo, orden garantizado, errores tragados
  // (sin BD se sigue jugando en memoria, spec fases 0-2 §4).
  let writeChain: Promise<void> = Promise.resolve();
  const controller = new AbortController();
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(`biblioshare:play:${identity}`)
      : null;

  function emit() {
    for (const callback of listeners) callback();
  }

  function enqueue(work: () => Promise<void>) {
    writeChain = writeChain.then(work).catch(() => {});
  }

  function recordFromGame(game: ActiveGame, recordRev: number): ActiveGameRecord {
    return {
      identity,
      v: SNAPSHOT_VERSION,
      committed: game.log.committed,
      pending: game.log.pending,
      rev: recordRev,
    };
  }

  // Otra pestaña ganó el CAS o publicó por el canal: su registro es la verdad.
  function adoptRecord(record: ActiveGameRecord) {
    const game = parseLog(record.committed, record.pending);
    rev = record.rev;
    snapshot = { status: "ready", game };
    emit();
  }

  // Persiste el snapshot actual (o borra si game === null) y avisa al canal.
  function persistCurrent() {
    const current = snapshot;
    if (current.status !== "ready") return;
    const currentRev = rev;
    if (current.game === null) {
      enqueue(async () => {
        await deleteActive(identity);
        channel?.postMessage({ rev: currentRev });
      });
      return;
    }
    const record = recordFromGame(current.game, currentRev);
    enqueue(async () => {
      const result = await writeActive(record);
      if (result.ok) {
        channel?.postMessage({ rev: record.rev });
      } else if (result.reason === "conflict") {
        adoptRecord(result.current);
      }
      // "unavailable": memoria y a seguir jugando
    });
  }

  function clearSealTimer() {
    if (sealTimer !== null) {
      clearTimeout(sealTimer);
      sealTimer = null;
    }
  }

  function scheduleSeal() {
    clearSealTimer();
    sealTimer = setTimeout(sealNow, BURST_WINDOW_MS);
  }

  function sealNow() {
    clearSealTimer();
    if (snapshot.status === "ready" && snapshot.game?.log.pending) {
      rev += 1;
      snapshot = {
        status: "ready",
        game: { log: flushPending(snapshot.game.log), state: snapshot.game.state },
      };
      persistCurrent();
      emit();
    }
  }

  // [conservar el comentario actual de tryCommit (finding 1)]
  function tryCommit(candidateLog: EventLog): boolean {
    let state: PlayGameState;
    try {
      state = replay(candidateLog.committed, candidateLog.pending);
    } catch (error) {
      if (!(error instanceof PlayEventError)) throw error;
      return false;
    }
    rev += 1;
    snapshot = { status: "ready", game: { log: candidateLog, state } };
    persistCurrent();
    emit();
    return true;
  }

  async function hydrate() {
    const record = await readActive(identity);
    if (controller.signal.aborted) return;
    if (record) {
      adoptRecord(record);
      return;
    }
    // Migración fase 1 → fase 3: el snapshot localStorage se importa una vez
    // y la clave se borra (válido o no: era el criterio destructivo-con-aviso
    // que fase 1 documentó). Spec fase 3 §5.
    let migrated: ActiveGame | null = null;
    try {
      migrated = parseSnapshot(globalThis.localStorage?.getItem(legacyKey) ?? null);
      globalThis.localStorage?.removeItem(legacyKey);
    } catch {
      // sin storage no hay nada que migrar
    }
    if (migrated) {
      rev = 1;
      snapshot = { status: "ready", game: migrated };
      persistCurrent();
      emit();
      return;
    }
    snapshot = { status: "ready", game: null };
    emit();
  }

  if (typeof document !== "undefined") {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") sealNow();
      },
      { signal: controller.signal },
    );
    window.addEventListener("pagehide", sealNow, { signal: controller.signal });
  }

  if (channel) {
    // Espejo entre pestañas (#932): un rev mayor que el nuestro = alguien
    // escribió después; se relee de BD y se adopta. Mientras se hidrata se
    // ignora: la hidratación en vuelo ya leerá lo último.
    channel.onmessage = (event: MessageEvent) => {
      const msgRev = (event.data as { rev?: number } | null)?.rev;
      if (typeof msgRev !== "number") return;
      if (snapshot.status !== "ready" || msgRev <= rev) return;
      void readActive(identity).then((record) => {
        if (controller.signal.aborted) return;
        if (record && record.rev > rev) {
          adoptRecord(record);
        } else if (!record) {
          rev = Math.max(rev, msgRev);
          snapshot = { status: "ready", game: null };
          emit();
        }
      });
    };
  }

  void hydrate();

  return {
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getSnapshot() {
      return snapshot;
    },
    start(event) {
      if (snapshot.status === "loading") return false;
      if (snapshot.game) {
        throw new Error("ya hay una partida activa; la UI debe interceptar antes (spec §4)");
      }
      return tryCommit(emptyLog(event));
    },
    tap(event) {
      if (snapshot.status !== "ready" || !snapshot.game) return false;
      const applied = tryCommit(appendTap(snapshot.game.log, event));
      if (applied) scheduleSeal();
      return applied;
    },
    dispatch(event) {
      if (snapshot.status !== "ready" || !snapshot.game) return false;
      const applied = tryCommit(append(snapshot.game.log, event));
      if (applied) clearSealTimer();
      return applied;
    },
    undo() {
      if (snapshot.status !== "ready" || !snapshot.game) return null;
      clearSealTimer();
      const result = undoLast(snapshot.game.log);
      if (result.undone === null) return null;
      rev += 1;
      snapshot = {
        status: "ready",
        game: { log: result.log, state: replay(result.log.committed, result.log.pending) },
      };
      persistCurrent();
      emit();
      return result.undone;
    },
    flush: sealNow,
    discard() {
      if (snapshot.status !== "ready") return;
      clearSealTimer();
      rev += 1;
      snapshot = { status: "ready", game: null };
      persistCurrent();
      emit();
    },
    async save() {
      sealNow(); // lo guardado es solo committed: la ráfaga se sella antes
      const current = snapshot;
      if (current.status !== "ready" || current.game === null) return false;
      if (current.game.state.status !== "finished") return false;
      const game = current.game;
      const ok = await saveFinished({
        gameId: game.log.committed[0].id,
        identity,
        v: SNAPSHOT_VERSION,
        committed: game.log.committed,
        savedAt: Date.now(),
      });
      if (!ok) return false;
      rev += 1;
      snapshot = { status: "ready", game: null };
      persistCurrent();
      emit();
      return true;
    },
    destroy() {
      clearSealTimer();
      controller.abort();
      channel?.close();
    },
  };
}

const stores = new Map<string, PlayStore>();

export function getPlayStore(identity: string): PlayStore {
  let store = stores.get(identity);
  if (!store) {
    store = createPlayStore(identity);
    stores.set(identity, store);
  }
  return store;
}

// Solo para tests: stores vírgenes, destruyendo los viejos (#935).
export function __resetPlayStoresForTests(): void {
  for (const store of stores.values()) store.destroy();
  stores.clear();
}

// Solo para tests que necesitan DOS stores de la misma identidad (espejo).
export function __createPlayStoreForTests(identity: string): PlayStore {
  return createPlayStore(identity);
}
```

Notas:
- `serializeSnapshot` desaparece (nadie más lo usa; verifica con grep antes de borrar).
- Los bloques `[conservar...]` son los comentarios del fichero actual, copiados tal cual.

- [ ] **Step 2.4: Adaptar los tests existentes de `store.test.ts`**

Cambio mecánico en todo el fichero: donde había `store.getSnapshot()` como `ActiveGame | null`, ahora es `store.getSnapshot().game` — y toda interacción tras `getPlayStore` necesita `await ready(store)` antes (los tests pasan a `async`). Los tests de persistencia («sobrevive a resetear stores») cambian localStorage por el ciclo IndexedDB del Step 2.1 — el test viejo equivalente se sustituye, no se duplica. Los tests de `parseSnapshot` ajustan el tipo de retorno (`ActiveGame | null`: asertar sobre `result?.log` / `result?.state`). El test que documentaba el replay doble (#936), si existe, se borra citando la issue.

- [ ] **Step 2.5: Verificar la suite del core**

```bash
npx vitest run src/lib/play/core
```
Expected: PASS completo (los nuevos + todos los adaptados).

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/play/core/store.ts src/lib/play/core/store.test.ts
git commit -m "feat(play): store asincrono sobre IndexedDB con migracion y destroy (#931, cierra #933 #935 #936)"
```

---

### Task 3: Hook `useActiveGame` con snapshot

**Files:**
- Modify: `src/lib/play/core/use-active-game.ts`
- Test: `src/lib/play/core/use-active-game.test.tsx` (adaptar)

**Interfaces:**
- Produces (Task 4 depende): `useActiveGame(identity): { snapshot: PlayStoreSnapshot; game: ActiveGame | null; store: PlayStore }`.

- [ ] **Step 3.1: Reescribir el hook**

```ts
"use client";

import { useSyncExternalStore } from "react";
import {
  getPlayStore,
  type ActiveGame,
  type PlayStore,
  type PlayStoreSnapshot,
} from "./store";

// Constantes fuera del hook: un getServerSnapshot nuevo por render provoca
// bucle de re-suscripción (misma trampa resuelta en use-timer-state.ts). En
// servidor SIEMPRE es loading: el cliente hidrata igual y no hay mismatch.
const SERVER_SNAPSHOT: PlayStoreSnapshot = { status: "loading", game: null };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useActiveGame(identity: string): {
  snapshot: PlayStoreSnapshot;
  game: ActiveGame | null;
  store: PlayStore;
} {
  const store = getPlayStore(identity);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  return { snapshot, game: snapshot.game, store };
}
```

- [ ] **Step 3.2: Adaptar `use-active-game.test.tsx`**

Los tests renderizan y esperan `game`; ahora la hidratación es async: envolver las aserciones post-`start` en `await vi.waitFor(...)` y esperar `ready` (mismo helper del Task 2, copiado aquí o importado si se extrae — extraerlo a `src/lib/play/core/test-helpers.ts` si se usa en 2+ ficheros). El test añade `import "fake-indexeddb/auto";` como primera línea y `await __resetDbForTests()` en su `beforeEach`.

- [ ] **Step 3.3: Verificar**

```bash
npx vitest run src/lib/play/core/use-active-game.test.tsx
```
Expected: PASS.

- [ ] **Step 3.4: Commit**

```bash
git add src/lib/play/core/use-active-game.ts src/lib/play/core/use-active-game.test.tsx
git commit -m "feat(play): useActiveGame expone el snapshot loading/ready (#931)"
```

---

### Task 4: UI — `loading` no es «no hay partida»

**Files:**
- Modify: `src/components/play/game-screen.tsx`
- Modify: `src/components/play/setup-form.tsx` (función `start()`, ~línea 86, y el botón «Empezar»)
- Modify: `src/components/play/mtg-mode-chooser.tsx` (función `playNow()`, ~línea 54, y el botón «Jugar ya»)
- Modify: `src/components/play/remembered-table-card.tsx` (función `play()`, ~línea 35, y el botón «Jugar»)
- `active-game-banner.tsx` NO cambia: destructura `{ game }` y con `loading` recibe `null` — no pinta banner, que es exactamente lo que la spec pide (§7).

- [ ] **Step 4.1: `game-screen.tsx` — pantalla vacía solo cuando es VERDAD que no hay partida**

```tsx
export function GameScreen({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const { snapshot, game, store } = useActiveGame(identity);

  // Hidratando: fieltro vacío, sin mensaje. Pintar «no hay partida» aquí un
  // frame antes de saberlo es el parpadeo que la spec fase 3 §3 prohíbe.
  if (snapshot.status === "loading") {
    return <div className="h-dvh w-full bg-play-felt" />;
  }

  if (!game) {
    // [bloque actual sin cambios]
  }
  // [resto sin cambios]
}
```

- [ ] **Step 4.2: Los tres arranques — guarda de loading + botón deshabilitado**

Patrón idéntico en `setup-form.tsx`, `mtg-mode-chooser.tsx` y `remembered-table-card.tsx`. Añadir el hook arriba del componente:

```tsx
const { snapshot } = useActiveGame(identity);
```

(import: `import { useActiveGame } from "@/lib/play/core/use-active-game";` — en setup-form y mtg-mode-chooser puede convivir con el `getPlayStore` ya importado, o sustituirlo usando `store` del hook: preferible sustituirlo). En el handler de arranque:

```tsx
function start() {
  // Con el store hidratando no se arranca: podría pisar una activa aún no
  // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
  if (snapshot.status === "loading") return;
  const setup = toSetup(draft, (i) => t("setup.playerN", { n: i + 1 }));
  if (snapshot.game) store.discard();
  if (!store.start(makeEvent("game_started", { toolId: "mtg" as const, setup }, Date.now()))) {
    return;
  }
  rememberTable(identity, setup);
  router.push("/partida/activa");
}
```

Y en el botón que llama al handler: `disabled={snapshot.status === "loading"}`. En `remembered-table-card.tsx` y `mtg-mode-chooser.tsx`, mismo patrón adaptado a sus nombres (`play()` / `playNow()`).

- [ ] **Step 4.3: Typecheck + lint + suite entera**

```bash
npx tsc --noEmit && npx vitest run src/lib/play src/components 2>/dev/null; npx vitest run src/lib/play
```
Expected: tsc limpio; vitest de `src/lib/play` PASS. Si `npx tsc` marca usos olvidados de `getSnapshot()` como `ActiveGame | null` en componentes no listados, arreglarlos con el mismo patrón.

- [ ] **Step 4.4: Commit**

```bash
git add src/components/play/game-screen.tsx src/components/play/setup-form.tsx src/components/play/mtg-mode-chooser.tsx src/components/play/remembered-table-card.tsx
git commit -m "feat(play): la UI distingue hidratando de sin-partida (#931)"
```

---

### Task 5: e2e de recuperación + cierre de PR-A

**Files:**
- Create: `e2e/partidas-persistencia.spec.ts`
- Modify: `docs/requirements/decisiones.md` (append)

- [ ] **Step 5.1: e2e — la partida sobrevive al reload**

Reutilizar el arrange de `e2e/partidas-mtg.spec.ts` (léelo primero: ahí está cómo se arranca una partida rápida y los selectores reales). Esqueleto del assert nuevo:

```ts
import { expect, test } from "@playwright/test";

test.describe("persistencia de la partida", () => {
  test("una partida sobrevive a recargar la página", async ({ page }) => {
    // [arrange copiado del spec existente: ir al hub, «Jugar ya», tablero visible]
    // Un gesto que deje huella distinta del estado inicial (p. ej. -1 vida al asiento 1
    // con el helper que use el spec existente).
    await page.reload();
    // El tablero vuelve con el MISMO estado: la vida tocada sigue tocada.
    // [assert con los selectores del spec existente]
  });

  test("tras recargar no aparece el vacio de «no hay partida» ni un frame", async ({ page }) => {
    // [arrange igual] → reload → asertar que el texto de empty.noActiveGame
    // NUNCA aparece: page.getByText(...) con expect(...).toHaveCount(0) tras
    // esperar el tablero.
  });
});
```

- [ ] **Step 5.2: Correr e2e**

```bash
npm run test:e2e -- partidas-persistencia.spec.ts
```
Expected: PASS. (Reutiliza el dev server que haya en el 3000; no arranques otro.)

- [ ] **Step 5.3: Build de producción**

```bash
npm run build
```
Expected: compila. (Regla del proyecto: sin build verde no hay push.)

- [ ] **Step 5.4: decisiones.md — contrato del snapshot async (append por Bash heredoc)**

Entrada nueva al FINAL del fichero: título `## 2026-08-30 (10) — El store de Play hidrata asíncrono: loading no es «no hay partida»`, cuerpo con: el contrato `PlayStoreSnapshot`, por qué la UI debe distinguir los dos estados (redirección/parpadeo), que el CAS por `rev` es la única defensa contra pestañas concurrentes, y que `parseSnapshot` ahora devuelve `{log, state}` (cierra #936).

- [ ] **Step 5.5: Commit + push + PR-A**

```bash
git add e2e/partidas-persistencia.spec.ts docs/requirements/decisiones.md
git commit -m "test(play): e2e de recuperacion tras reload y acta del store asincrono (#931)"
git push -u origin feat/play-persistencia-idb
gh pr create --title "feat(play): persistencia IndexedDB -- store asincrono, migracion y recuperacion (#931)" --body-file - <<'EOF'
[resumen: db.ts con CAS, store loading/ready, migracion localStorage, deuda #933 #935 #936, UI sin parpadeo. Checklist use-cache: no aplica, todo es cliente.]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

---

### Task 6: Espejo entre pestañas — test dedicado

La implementación ya vive en el store (Task 2); esta task la CUBRE con dos stores reales sobre la misma BD y canal.

**Files:**
- Modify: `src/lib/play/core/store.test.ts` (describe nuevo)

- [ ] **Step 6.1: Tests del espejo**

```ts
describe("espejo entre pestañas (#932)", () => {
  it("un commit en una pestaña aparece en la otra", async () => {
    const a = __createPlayStoreForTests("anon");
    const b = __createPlayStoreForTests("anon");
    try {
      await ready(a);
      await ready(b);
      expect(a.start(started(1000))).toBe(true);
      await vi.waitFor(() => {
        const snapshot = b.getSnapshot();
        if (snapshot.status !== "ready" || snapshot.game === null) throw new Error("sin espejo");
      });
    } finally {
      a.destroy();
      b.destroy();
    }
  });

  it("descartar en una pestaña limpia la otra", async () => {
    const a = __createPlayStoreForTests("anon");
    const b = __createPlayStoreForTests("anon");
    try {
      await ready(a);
      await ready(b);
      a.start(started(1000));
      await vi.waitFor(() => {
        if (b.getSnapshot().game === null) throw new Error("sin espejo");
      });
      a.discard();
      await vi.waitFor(() => {
        if (b.getSnapshot().game !== null) throw new Error("sigue viva");
      });
    } finally {
      a.destroy();
      b.destroy();
    }
  });

  it("el CAS impide que una escritura vieja pise una nueva", async () => {
    // Directo contra db.ts con dos revs, ya cubierto en db.test.ts — aquí el
    // caso integrado: dos stores commitean; el que pierde adopta al ganador.
    const a = __createPlayStoreForTests("anon");
    const b = __createPlayStoreForTests("anon");
    try {
      await ready(a);
      await ready(b);
      a.start(started(1000));
      await vi.waitFor(() => {
        if (b.getSnapshot().game === null) throw new Error("sin espejo");
      });
      // Ambos despachan «a la vez»: gana uno, el otro converge sin corromper.
      a.dispatch(life(2000, "p1", -1));
      b.dispatch(life(2001, "p1", -2));
      await vi.waitFor(() => {
        const ga = a.getSnapshot().game;
        const gb = b.getSnapshot().game;
        if (!ga || !gb) throw new Error("perdida");
        if (ga.log.committed.length !== gb.log.committed.length) throw new Error("divergen");
      });
    } finally {
      a.destroy();
      b.destroy();
    }
  });
});
```

Nota: en Node 22 `BroadcastChannel` es global y dos instancias del mismo nombre en el mismo hilo se entregan mensajes. Si la entrega no dispara en `node`, marca el describe con `// @vitest-environment jsdom` NO — en su lugar comprueba primero con un mini-test que `new BroadcastChannel("x")` entrega en este entorno; si no entrega, el espejo se cubre solo vía e2e (Task 8) y estos tests se reducen al caso CAS sin canal. Documenta lo que encuentres en el commit.

- [ ] **Step 6.2: Verificar**

```bash
npx vitest run src/lib/play/core/store.test.ts
```
Expected: PASS.

- [ ] **Step 6.3: Commit**

```bash
git add src/lib/play/core/store.test.ts
git commit -m "test(play): espejo entre pestañas y convergencia CAS (#931, cierra #932)"
```

---

### Task 7: «Guardar partida» en el resumen

**Files:**
- Modify: `src/components/play/game-summary.tsx`
- Modify: `messages/es.json` (namespace `play.summary`)

**Interfaces:**
- Consumes: `PlayStore.save(): Promise<boolean>` (Task 2).

- [ ] **Step 7.1: Claves i18n**

En `messages/es.json`, dentro de `play.summary` (respetar el orden alfabético u orden del bloque existente):

```json
"save": "Guardar partida",
"saveHint": "Se guarda solo en este dispositivo."
```

- [ ] **Step 7.2: Botón en `game-summary.tsx`**

Entre «Revancha» y «Descartar» (la revancha sigue primera: spec fases 0-2 §7):

```tsx
<button
  type="button"
  onClick={async () => {
    // Si el guardado falla (BD indisponible), la activa NO se toca y nos
    // quedamos en el resumen: no se pierde una partida por un fallo de disco.
    if (await store.save()) router.push("/partidas");
  }}
  className={buttonVariants("secondary", "w-full justify-center py-2.5 text-[14px]")}
>
  {t("summary.save")}
</button>
<p className="text-center text-[11px] text-muted-foreground">{t("summary.saveHint")}</p>
```

Y actualizar el docstring del componente: el párrafo «Guardar el historial llega en la fase 5...» se sustituye por una nota de que guardar existe desde fase 3 (local, almacén `saved`) y que la LISTA de guardadas es fase 7.

- [ ] **Step 7.3: Verificar typecheck + i18n**

```bash
npx tsc --noEmit && npx vitest run src/lib/play
```
Expected: limpio. (Si el proyecto tiene test de claves i18n huérfanas, correrlo también.)

- [ ] **Step 7.4: Commit**

```bash
git add src/components/play/game-summary.tsx messages/es.json
git commit -m "feat(play): guardar partida terminada en el almacen local saved (#931)"
```

---

### Task 8: e2e de guardar + espejo real + cierre de PR-B

**Files:**
- Modify: `e2e/partidas-persistencia.spec.ts`

- [ ] **Step 8.1: e2e guardar y espejo con dos páginas**

Añadir al spec de Task 5:

```ts
test("guardar una partida terminada limpia la activa", async ({ page }) => {
  // [arrange: partida rápida → finalizarla por la hoja de partida (helper del
  // spec mtg existente)] → en el resumen, click en «Guardar partida» →
  // aterriza en /partidas SIN banner de partida en curso.
});

test("dos pestañas ven la misma partida (espejo)", async ({ page, context }) => {
  // [arrange partida en `page`]
  const second = await context.newPage();
  await second.goto("/partida/activa");
  // gesto en `page` (p. ej. -1 vida) → en `second`, la vida cambia sin reload.
  // BroadcastChannel comparte origen y contexto: mismo context de Playwright vale.
});
```

- [ ] **Step 8.2: Correr e2e completo de play + build**

```bash
npm run test:e2e -- partidas-persistencia.spec.ts partidas-mtg.spec.ts partidas-navegacion.spec.ts
npm run build
```
Expected: todo PASS, build compila.

- [ ] **Step 8.3: Commit + push + PR-B**

```bash
git add e2e/partidas-persistencia.spec.ts
git commit -m "test(play): e2e de guardar y espejo entre pestañas (#931)"
git push
gh pr create --title "feat(play): espejo entre pestañas y guardar partida (#931)" --body-file - <<'EOF'
[resumen: BroadcastChannel + CAS cubiertos con tests, boton Guardar partida, e2e dos pestañas.]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

(Si PR-A ya se mergeó, PR-B sale de la misma rama actualizada contra main; si no, PR-B apunta a la rama de PR-A — decidir al llegar según el estado del review.)

- [ ] **Step 8.4: Cierre documental y de issues**

- `docs/requirements/backlog.md`: marcar la línea «BiblioPlay fases 3+» parcialmente — reescribir como fase 3 hecha (con puntero a la spec) y fases 5+ pendientes.
- Cerrar issues citando la spec y los commits: `gh issue close 933 932 935 936 --comment "Cerrada por la fase 3 (spec docs/superpowers/specs/2026-08-30-play-fase-3-persistencia-design.md): IndexedDB con CAS, espejo BroadcastChannel, destroy() y parseo de una pasada."`
- `docs/requirements/data-model.md` NO cambia (todo local, sin esquema Supabase). Superficie 6 de DRIFT-CHECK no aplica (sin columnas nuevas).
- Si el ledger de deuda del propio código quedó desfasado (comentarios en `store.ts` que citaban #935/#936 como pendientes), ya se borraron en Task 2 — verificar con `grep -rn "935\|936" src/lib/play`.

---

## Self-Review (hecho al escribir el plan)

- **Cobertura de spec:** §2 → Task 1; §3 (store async, cola, #935, #936) → Task 2; §5 migración → Task 2; §7 UI → Tasks 3–4; §4 espejo → Tasks 2+6+8; §6 guardar → Task 7; §8 tests → Tasks 1,2,5,6,8; §9 PRs → Tasks 5 y 8. Sin huecos.
- **Placeholders:** los bloques `[...]` restantes señalan SOLO código existente a conservar o arrange de e2e que vive en un spec que el implementador debe leer (`e2e/partidas-mtg.spec.ts`) — no requisitos sin definir.
- **Consistencia de tipos:** `PlayStoreSnapshot`, `ActiveGameRecord`, `save(): Promise<boolean>`, `parseSnapshot → ActiveGame | null` usados igual en Tasks 1–7. `parseLog` definido en Task 2 y solo usado allí.
