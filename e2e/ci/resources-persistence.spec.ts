import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Anónimo, IndexedDB propio de cada contexto; sin actores ni filas remotas.
test.use({ trace: "off", screenshot: "off" });

type NativeEvent = { sequence: number; doc: number; perf: number; at: number; event: string; [key: string]: unknown };
type ResourcesRecord = { identity: string; v: number; base: unknown; rev: number; log: Array<{ id: string; type: string; at: number; payload: unknown }> };
declare global {
  interface Window {
    __qa1328: {
      events: NativeEvent[];
      hold: () => Promise<void>;
      release: () => void;
      closeConnections: () => number;
    };
  }
}

/** Observación pasiva; cada resultado y excepción nativos se conserva.
 *  Sólo los casos controlados usan un bloqueo IDB real o close() nativo. */
function installNativeObserver() {
  const doc = performance.timeOrigin, events: NativeEvent[] = [], connections = new Set<IDBDatabase>();
  const ids = new WeakMap<IDBTransaction, string>(), pending = new Map<string, unknown>();
  let sequence = 0, transactionSequence = 0, releaseHeld = false, lastBank: string | null = null;
  const send = (event: string, detail: Record<string, unknown> = {}) => {
    const entry = { sequence: ++sequence, doc, perf: performance.now(), at: Date.now(), event, ...detail };
    events.push(entry);
    console.debug("__QA1328__" + JSON.stringify(entry));
  };
  const errorName = (request: IDBRequest) => { try { return request.error?.name; } catch { return undefined; } };
  const open = IDBFactory.prototype.open, transaction = IDBDatabase.prototype.transaction, get = IDBObjectStore.prototype.get;
  IDBFactory.prototype.open = function (...args) {
    const request = Reflect.apply(open, this, args) as IDBOpenDBRequest;
    if (args[0] === "biblioshare-play") {
      send("open", { version: args[1] });
      for (const event of ["success", "error", "blocked", "upgradeneeded"]) request.addEventListener(event, () => {
        if (event === "success") connections.add(request.result);
        send("open-" + event, { error: errorName(request) });
      }, { once: true });
    }
    return request;
  };
  IDBDatabase.prototype.transaction = function (...args) {
    let tx: IDBTransaction;
    try { tx = Reflect.apply(transaction, this, args) as IDBTransaction; }
    catch (error) {
      if (this.name === "biblioshare-play") send("transaction-throw", { error: error instanceof DOMException ? error.name : String(error) });
      throw error;
    }
    if (this.name === "biblioshare-play") {
      const id = `${doc}:tx${++transactionSequence}`, detail = { id, mode: tx.mode, stores: [...tx.objectStoreNames] };
      ids.set(tx, id); pending.set(id, detail); send("transaction", detail);
      for (const event of ["complete", "abort", "error"]) tx.addEventListener(event, () => {
        pending.delete(id); send("transaction-" + event, { ...detail, error: tx.error?.name });
      }, { once: true });
    }
    return tx;
  };
  for (const operation of ["get", "put", "delete"] as const) {
    const native = IDBObjectStore.prototype[operation];
    IDBObjectStore.prototype[operation] = function (...args: unknown[]) {
      const request = Reflect.apply(native, this, args) as IDBRequest;
      if (this.transaction.db.name !== "biblioshare-play") return request;
      const key = operation === "put" ? (args[0] as { identity?: string }).identity : args[0];
      if (this.name !== "companion" || key !== "anon:resources") return request;
      const detail = { operation, key, transaction: ids.get(this.transaction) };
      if (operation === "put") send("put-value", { ...detail, record: structuredClone(args[0]) });
      send("request", detail);
      request.addEventListener("success", () => send("request-success", {
        ...detail, result: operation === "get" ? structuredClone(request.result) : request.result,
      }), { once: true });
      request.addEventListener("error", () => send("request-error", { ...detail, error: errorName(request) }), { once: true });
      return request;
    };
  }
  window.__qa1328 = {
    events,
    hold: () => new Promise((resolve, reject) => {
      const request = Reflect.apply(open, indexedDB, ["biblioshare-play"]) as IDBOpenDBRequest;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = Reflect.apply(transaction, db, ["companion", "readwrite"]) as IDBTransaction;
        releaseHeld = false;
        let reads = 0;
        tx.addEventListener("complete", () => { send("controlled-hold-complete", { reads }); db.close(); }, { once: true });
        tx.addEventListener("abort", () => { send("controlled-hold-abort", { error: tx.error?.name }); db.close(); reject(tx.error); }, { once: true });
        const keepPending = () => {
          const read = Reflect.apply(get, tx.objectStore("companion"), ["anon:resources"]) as IDBRequest;
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            if (++reads === 1) { send("controlled-hold-acquired", { nativeRead: true }); resolve(); }
            if (!releaseHeld) keepPending();
          };
        };
        keepPending();
      };
    }),
    release: () => { releaseHeld = true; send("controlled-hold-release-requested"); },
    closeConnections: () => {
      let count = 0;
      for (const db of connections) { db.close(); count++; }
      send("controlled-native-close", { count });
      return count;
    },
  };
  new MutationObserver(() => {
    const value = document.querySelector('[data-testid="res-0-Oro"]')?.textContent?.trim() ?? null;
    if (value !== lastBank) { lastBank = value; send("bank-visible", { value, pending: [...pending.values()] }); }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  addEventListener("pagehide", () => send("pagehide", { bank: lastBank, pending: [...pending.values()] }));
  send("observer-installed", { nativeResultsUnchanged: true });
}

async function observe(page: Page) {
  const events: NativeEvent[] = [], errors: string[] = [];
  page.on("console", message => {
    const text = message.text();
    if (text.startsWith("__QA1328__")) events.push(JSON.parse(text.slice("__QA1328__".length)) as NativeEvent);
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(installNativeObserver);
  return { events, errors };
}

async function configuredFive(page: Page) {
  await page.goto("/partidas/recursos");
  await expect(page.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Añadir jugador", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Nombre del jugador" });
  await name.fill("Ana");
  await name.press("Enter");
  await expect(page.getByRole("button", { name: "Editar a Ana", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Crear Oro", exact: true }).click();
  await page.getByRole("button", { name: "Editar Oro", exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Uno más de inicio", exact: true }).click();
  await expect(page.getByTestId("res-0-Oro")).toHaveText("5");
}

async function readRecord(page: Page) {
  return page.evaluate(() => new Promise<ResourcesRecord | null>((resolve, reject) => {
    const request = indexedDB.open("biblioshare-play");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("companion", "readonly");
      const read = tx.objectStore("companion").get("anon:resources");
      let record: ResourcesRecord | null = null;
      read.onsuccess = () => { record = read.result ?? null; };
      tx.oncomplete = () => { db.close(); resolve(record); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}

async function evidence(info: TestInfo, observed: Awaited<ReturnType<typeof observe>>) {
  await info.attach("native-resources-events", { body: JSON.stringify(observed, null, 2), contentType: "application/json" });
}

function ackBeforeBank(events: NativeEvent[], value: string, matches: (record: ResourcesRecord) => boolean) {
  const write = events.find(entry => entry.event === "put-value" && matches(entry.record as ResourcesRecord));
  expect(write, "escritura exacta del cambio").toBeDefined();
  const ack = events.find(entry => entry.event === "transaction-complete" && entry.id === write!.transaction);
  const bank = events.findLast(entry => entry.event === "bank-visible" && entry.doc === write!.doc && entry.value === value);
  expect(ack, "ACK nativo de la transacción escrita").toBeDefined();
  expect(bank, "valor publicado en el mismo documento").toBeDefined();
  expect(ack!.sequence).toBeLessThan(bank!.sequence);
  return write!.record as ResourcesRecord;
}

for (const width of [320, 390, 1280]) {
  test(`inicio Oro 5→6 tiene ACK nativo antes del banco y recarga inmediata a ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const observed = await observe(page);
    try {
      await configuredFive(page);
      await page.getByRole("button", { name: "Uno más de inicio", exact: true }).click();
      await expect(page.getByTestId("res-0-Oro")).toHaveText("6");
      await page.reload(); // Adyacente: ninguna lectura, espera ni captura intermedia.
      await expect(page.getByTestId("res-0-Oro")).toHaveText("6");
      const record = await readRecord(page);
      expect(record).toMatchObject({ identity: "anon:resources", v: 1, base: null, rev: 8 });
      expect(record?.log.at(-1)).toMatchObject({ type: "resource_updated", payload: { name: "Oro", initial: 6, shared: false } });
      expect(record).toEqual(ackBeforeBank(observed.events, "6", value => value.rev === 8));
      await info.attach("restored-resources-record", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
      await page.screenshot({ path: info.outputPath("resources-saved-reloaded.png") });
      expect(observed.errors).toEqual([]);
    } finally { await evidence(info, observed); }
  });
}

test("IDB nativo pendiente mantiene banco5, acumula deltas y deshacer, luego confirma banco7", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const observed = await observe(page);
  try {
    await configuredFive(page);
    await page.getByRole("button", { name: "Cantidades rápidas de Oro", exact: true }).click();
    await page.evaluate(() => window.__qa1328.hold());
    try {
      const more = page.getByRole("button", { name: "Sumar Oro", exact: true });
      await more.click();
      await expect(page.getByRole("status")).toHaveText("Guardando los recursos…");
      await expect(page.getByTestId("res-0-Oro")).toHaveText("5");
      await expect(page.getByRole("button", { name: "Uno más de inicio", exact: true })).toBeDisabled();
      await expect(more).toBeEnabled();
      await expect(page.getByRole("button", { name: "Deshacer", exact: true })).toBeEnabled();
      await more.click();
      await page.getByRole("button", { name: "+5", exact: true }).click();
      await page.getByRole("button", { name: "Deshacer", exact: true }).click();
      await expect(page.getByTestId("res-0-Oro")).toHaveText("5");
      await page.screenshot({ path: info.outputPath("resources-native-pending.png") });
    } finally { await page.evaluate(() => window.__qa1328.release()); }
    // El banco puede alcanzar 7 en rev9 antes de terminar +5 y undo (rev10/11).
    // Este caso comprueba toda la cola; el natural 5→6 mantiene su recarga inmediata.
    await expect(page.getByRole("status")).toHaveText("Los recursos están guardados en este dispositivo.");
    await expect(page.getByTestId("res-0-Oro")).toHaveText("7");
    await page.reload();
    await expect(page.getByTestId("res-0-Oro")).toHaveText("7");
    const record = await readRecord(page);
    expect(record?.rev).toBe(11);
    expect(record?.log.slice(7).map(event => event.payload)).toEqual([
      { resource: "Oro", owner: "Ana", delta: 1 }, { resource: "Oro", owner: "Ana", delta: 1 },
    ]);
    expect(record).toEqual(ackBeforeBank(observed.events, "7", value => value.rev === 11));
    expect(observed.errors).toEqual([]);
  } finally { await evidence(info, observed); }
});

test("conexión nativa cerrada avisa de memoria, permite jugar y recargar restaura5", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const observed = await observe(page);
  try {
    await configuredFive(page);
    expect(await page.evaluate(() => window.__qa1328.closeConnections())).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Uno más de inicio", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("No se han guardado los últimos cambios de los recursos. Puedes seguir aquí, pero esos cambios se perderán al salir de esta pantalla, recargar o cerrar.");
    await expect(page.getByTestId("res-0-Oro")).toHaveText("6");
    await expect(page.getByRole("button", { name: "Uno más de inicio", exact: true })).toBeEnabled();
    const more = page.getByRole("button", { name: "Sumar Oro", exact: true });
    await expect(more).toBeEnabled();
    await more.click();
    await expect(page.getByTestId("res-0-Oro")).toHaveText("7");
    await page.screenshot({ path: info.outputPath("resources-native-memory.png") });
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.screenshot({ path: info.outputPath(`resources-native-memory-${width}px.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId("res-0-Oro")).toHaveText("5");
    const record = await readRecord(page);
    expect(record?.rev).toBe(7);
    expect(record?.log.at(-1)).toMatchObject({ type: "resource_updated", payload: { name: "Oro", initial: 5, shared: false } });
    expect(observed.events.filter(entry => entry.event === "transaction-throw").map(entry => entry.error)).toEqual(["InvalidStateError", "InvalidStateError"]);
    await page.screenshot({ path: info.outputPath("resources-native-memory-reloaded.png") });
    expect(observed.errors).toEqual([]);
  } finally { await evidence(info, observed); }
});
