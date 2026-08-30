import { expect, type Page } from "@playwright/test";

// La partida de Play dejó de vivir en `localStorage["biblioshare:play:anon:active"]`
// y pasó a IndexedDB (BD `biblioshare-play`, object store `active`, keyPath
// `identity`) en la fase 3 del motor (#931, issue #956). La clave legada sigue
// existiendo en el código SOLO como import de un único uso en `hydrate()`
// (src/lib/play/core/store.ts): si hay algo ahí al arrancar se adopta y se
// borra; si no, no se toca. No es la persistencia real y no debe leerse como
// tal desde los specs — este fichero es el reemplazo.

/** Espejo mínimo de `ActiveGameRecord` (src/lib/play/core/db.ts): no se
 *  importa código de app desde un test e2e, así que la forma se repite aquí. */
export type ActiveGameRecord = {
  identity: string;
  v: 1;
  committed: { id: string; type: string; at: number; payload: unknown }[];
  pending: { id: string; type: string; at: number; payload: unknown } | null;
  rev: number;
};

/**
 * Lee el registro `active` de IndexedDB para una identidad ("anon" salvo que
 * el test opere con sesión). Debe llamarse SIEMPRE después de que la app ya
 * haya abierto la BD al menos una vez (p. ej. tras arrancar una partida por
 * la UI): un `indexedDB.open()` sin `onupgradeneeded` que llegara primero
 * crearía la BD vacía sin los object stores y dejaría a la apertura real de
 * la app sin `upgradeneeded` que disparar (mismo número de versión ⇒ no
 * vuelve a correr). Ningún test de este repo lee antes de que la UI haya
 * empezado una partida, así que el orden real nunca lo dispara.
 */
export async function readActiveRecord(
  page: Page,
  identity = "anon",
): Promise<ActiveGameRecord | null> {
  return page.evaluate((identity) => {
    return new Promise<ActiveGameRecord | null>((resolve, reject) => {
      const request = indexedDB.open("biblioshare-play");
      request.onerror = () => reject(request.error ?? new Error("indexedDB.open falló"));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("active")) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction("active", "readonly");
        const getRequest = tx.objectStore("active").get(identity);
        getRequest.onsuccess = () => resolve((getRequest.result as ActiveGameRecord) ?? null);
        getRequest.onerror = () => reject(getRequest.error ?? new Error("get falló"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      };
    });
  }, identity);
}

/**
 * `readActiveRecord` con reintento. La escritura a IndexedDB es asíncrona
 * (cola `writeChain` de `store.ts`): un tap deja el estado nuevo visible en
 * la UI (commit en memoria, síncrono) ANTES de que el `put` a IDB haya
 * aterrizado. Leer justo después de una acción de UI puede pillar el
 * registro todavía viejo — no es flakiness del test, es la asincronía que
 * `localStorage` no tenía. `expect.poll` absorbe esa ventana.
 */
export async function waitForActiveRecord(
  page: Page,
  predicate: (record: ActiveGameRecord | null) => boolean,
  identity = "anon",
): Promise<ActiveGameRecord | null> {
  let last: ActiveGameRecord | null = null;
  await expect
    .poll(async () => {
      last = await readActiveRecord(page, identity);
      return predicate(last);
    })
    .toBe(true);
  return last;
}

/** Todos los eventos de un registro, committed + la ráfaga pending si la hay. */
export function allEvents(record: ActiveGameRecord) {
  return [...record.committed, ...(record.pending ? [record.pending] : [])];
}
