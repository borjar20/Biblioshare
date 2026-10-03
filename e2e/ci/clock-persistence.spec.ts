import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.use({ trace: "off", screenshot: "off" });

type NativeEvent = { sequence: number; doc: number; perf: number; at: number; event: string; [key: string]: unknown };
type ClockRecord = { identity: string; v: number; base: unknown; rev: number; log: Array<{ id: string; type: string; at: number; payload: unknown }> };
declare global {
  interface Window {
    __qa1313: {
      events: NativeEvent[];
      hold: () => Promise<{ id: string; mode: string; store: string }>;
      release: () => void;
      closeConnections: () => number;
    };
  }
}

// Passive observation preserves every native result and exception. The only
// controlled operations below are a real transaction hold and IDBDatabase.close.
function installNativeObserver() {
  const doc = performance.timeOrigin, events: NativeEvent[] = [], connections = new Set<IDBDatabase>();
  const ids = new WeakMap<IDBTransaction, string>(); let sequence = 0, transactionSequence = 0, bankSeen = false;
  const pending = new Map<string, unknown>(); let releaseHeld = false;
  const send = (event: string, bits: Record<string, unknown> = {}) => {
    const entry = { sequence: ++sequence, doc, perf: performance.now(), at: Date.now(), event, ...bits };
    events.push(entry); console.debug("__QA1313__" + JSON.stringify(entry));
  };
  const errorName = (request: IDBRequest) => { try { return request.error?.name; } catch { return undefined; } };
  const open = IDBFactory.prototype.open, transaction = IDBDatabase.prototype.transaction;
  const get = IDBObjectStore.prototype.get;
  IDBFactory.prototype.open = function (...args) {
    const request = Reflect.apply(open, this, args) as IDBOpenDBRequest;
    if (args[0] === "biblioshare-play") {
      send("open", { name: args[0], version: args[1] });
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
      const id = ids.get(this.transaction), detail = { operation, key, transaction: id, store: this.name };
      if (this.name === "companion" && key === "anon:clock" && operation === "put") {
        send("put-value", { ...detail, record: structuredClone(args[0]) });
      }
      send("request", detail);
      request.addEventListener("success", () => send("request-success", {
        ...detail, result: operation === "get" && key === "anon:clock" ? structuredClone(request.result) : request.result,
      }), { once: true });
      request.addEventListener("error", () => send("request-error", { ...detail, error: errorName(request) }), { once: true });
      return request;
    };
  }
  window.__qa1313 = {
    events,
    hold: () => new Promise((resolve, reject) => {
      const request = Reflect.apply(open, indexedDB, ["biblioshare-play"]) as IDBOpenDBRequest;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = Reflect.apply(transaction, db, ["companion", "readwrite"]) as IDBTransaction;
        const id = `${doc}:controlled-hold`; let reads = 0; releaseHeld = false;
        send("controlled-lock-acquired", { id, mode: tx.mode, stores: [...tx.objectStoreNames] });
        tx.addEventListener("complete", () => { send("controlled-lock-complete", { id, reads }); db.close(); }, { once: true });
        tx.addEventListener("abort", () => { send("controlled-lock-abort", { id, error: tx.error?.name }); db.close(); reject(tx.error); }, { once: true });
        const next = () => {
          // These are actual native reads, with unchanged values. Record a count
          // rather than flooding the passive product observation with hold reads.
          const read = Reflect.apply(get, tx.objectStore("companion"), ["anon:clock"]) as IDBRequest;
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            reads += 1;
            if (reads === 1) resolve({ id, mode: tx.mode, store: "companion" });
            if (!releaseHeld) next();
          };
        }; next();
      };
    }),
    release: () => { releaseHeld = true; send("controlled-lock-release-requested"); },
    closeConnections: () => {
      let count = 0; for (const db of connections) { db.close(); count += 1; }
      send("controlled-native-close", { count }); return count;
    },
  };
  addEventListener("pagehide", () => send("pagehide", { pending: [...pending.values()] }));
  new MutationObserver(() => {
    if (bankSeen || document.querySelector('[data-testid="clock-time-1"]')?.textContent?.trim() !== "1:30") return;
    bankSeen = true;
    send("banks-visible", { banks: [0, 1].map(i => document.querySelector(`[data-testid="clock-time-${i}"]`)?.textContent?.trim()), pending: [...pending.values()] });
  }).observe(document, { subtree: true, childList: true, characterData: true });
  send("observer-installed", { nativeResultsUnchanged: true });
}

async function open(page: Page) {
  const events: NativeEvent[] = [], errors: string[] = [];
  page.on("console", message => {
    if (message.text().startsWith("__QA1313__")) events.push(JSON.parse(message.text().slice("__QA1313__".length)) as NativeEvent);
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(installNativeObserver);
  await page.goto("/partidas/reloj");
  await expect(page.getByLabel("Tiempo inicial (segundos)")).toBeVisible();
  for (const name of ["Ana", "Beto"]) {
    await page.getByRole("button", { name: "Añadir jugador", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Nombre del jugador" });
    await input.fill(name); await input.press("Enter");
    await expect(page.getByRole("button", { name: `Editar a ${name}`, exact: true })).toBeVisible();
    await expect(input).toHaveCount(0);
  }
  await page.getByLabel("Tiempo inicial (segundos)").fill("90");
  return { events, errors };
}

async function inspectAfterReload(page: Page): Promise<ClockRecord | null> {
  return page.evaluate(() => new Promise<ClockRecord | null>((resolve, reject) => {
    const request = indexedDB.open("biblioshare-play");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("companion", "readonly");
      const get = tx.objectStore("companion").get("anon:clock"); let record: ClockRecord | null = null;
      get.onsuccess = () => { record = get.result ?? null; };
      tx.oncomplete = () => { db.close(); resolve(record); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}

async function attach(info: TestInfo, events: NativeEvent[], detail: unknown) {
  await info.attach("native-indexeddb-events", { body: JSON.stringify({ detail, events }, null, 2), contentType: "application/json" });
}

function assertAckBeforeBanks(events: NativeEvent[]) {
  const put = events.find(event => event.event === "put-value" && event.key === "anon:clock");
  expect(put, "A native companion put must be observed").toBeTruthy();
  const complete = events.find(event => event.event === "transaction-complete" && event.id === put?.transaction && event.doc === put?.doc);
  const visible = events.find(event => event.event === "banks-visible");
  expect(complete, "Native tx.oncomplete must be observed").toBeTruthy();
  expect(visible).toBeTruthy(); expect(complete!.doc).toBe(visible!.doc);
  expect(complete!.sequence).toBeLessThan(visible!.sequence);
  expect(complete!.perf).toBeLessThanOrEqual(visible!.perf);
  return put!.record as ClockRecord;
}

async function reloadImmediately(page: Page) {
  await expect(page.getByTestId("clock-time-1")).toHaveText("1:30");
  // No durability read/wait, evaluate, screenshot or ACK assertion between
  // this visible bank and reload. ACK evidence is assessed after reload.
  await page.reload();
  await expect(page.getByTestId("clock-time-1")).toHaveText("1:30");
  await expect(page.getByTestId("clock-zone-0")).toContainText("Ana");
  await expect(page.getByTestId("clock-zone-1")).toContainText("Beto");
  const activeBank = page.getByTestId("clock-time-0");
  await expect(activeBank).toHaveText(/^\d+:\d{2}$/);
  await expect(page.getByTestId("clock-zone-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("clock-zone-1")).toHaveAttribute("data-active", "false");
  await expect(page.getByLabel("Tiempo inicial (segundos)")).toHaveCount(0);
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport); expect(geometry.body).toBeLessThanOrEqual(geometry.viewport);
  const record = await inspectAfterReload(page);
  const before = (await activeBank.innerText()).trim();
  await expect(activeBank).not.toHaveText(before);
  const after = (await activeBank.innerText()).trim();
  const seconds = (bank: string) => {
    const [minutes, rest] = bank.split(":").map(Number);
    return minutes * 60 + rest;
  };
  expect(seconds(before)).toBeGreaterThan(0);
  expect(seconds(before)).toBeLessThanOrEqual(90);
  expect(seconds(after)).toBeLessThan(seconds(before));
  await expect(page.getByTestId("clock-time-1")).toHaveText("1:30");
  return { geometry, record, activeBank: { before, after, observedAt: Date.now() } };
}

for (const width of [320, 390, 1280]) {
  test.describe(`Clock durability #1313 at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });
    test("native ACK precedes natural banks and immediate reload restores the snapshot", async ({ page }, info) => {
      const observed = await open(page); let after;
      try {
        await page.getByRole("button", { name: "Empezar 90 s", exact: true }).click();
        after = await reloadImmediately(page);
        const written = assertAckBeforeBanks(observed.events);
        expect(after.record).toEqual(written); expect(written.rev).toBe(1); expect(written.log).toHaveLength(1);
        expect(written.log[0].type).toBe("chess_configured");
        expect(written.log[0].payload).toEqual({ players: ["Ana", "Beto"], initialMs: 90000, incrementMs: 0 });
        expect(observed.errors).toEqual([]);
      } finally { await attach(info, observed.events, { mode: "natural", after }); }
    });
    test("real transaction contention keeps setup disabled until ACK then immediate reload restores it", async ({ page }, info) => {
      const observed = await open(page); let held, after, released = false;
      try {
        held = await page.evaluate(() => window.__qa1313.hold());
        await page.getByRole("button", { name: "Empezar 90 s", exact: true }).click();
        await expect(page.getByRole("status")).toHaveText("Guardando el reloj…");
        await expect(page.locator("fieldset")).toHaveJSProperty("disabled", true);
        await expect(page.getByRole("button", { name: "Empezar 90 s", exact: true })).toBeDisabled();
        await expect(page.getByTestId("clock-time-1")).toHaveCount(0);
        await expect(page.getByLabel("Tiempo inicial (segundos)")).toHaveValue("90");
        await page.screenshot({ path: info.outputPath("native-contention-pending.png"), fullPage: true });
        await page.evaluate(() => window.__qa1313.release());
        released = true;
        after = await reloadImmediately(page);
        const written = assertAckBeforeBanks(observed.events); expect(after.record).toEqual(written);
        expect(written.log[0].payload).toEqual({ players: ["Ana", "Beto"], initialMs: 90000, incrementMs: 0 });
        expect(observed.errors).toEqual([]);
      } finally {
        if (!released) await page.evaluate(() => window.__qa1313?.release()).catch(() => {});
        await attach(info, observed.events, { mode: "controlled-real-readwrite-contention", held, after });
      }
    });
  });
}

test.describe("Clock fallback #1313, native closed connection", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("unavailable write on a closed native connection warns, remains usable and is lost on reload", async ({ page }, info) => {
    const observed = await open(page); let closed, after;
    try {
      closed = await page.evaluate(() => window.__qa1313.closeConnections()); expect(closed).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Empezar 90 s", exact: true }).click();
      await expect(page.getByTestId("clock-time-1")).toHaveText("1:30");
      await expect(page.getByRole("status")).toHaveText("No se han guardado los últimos cambios del reloj. Puedes seguir jugando aquí, pero esos cambios se perderán al salir de esta pantalla, recargar o cerrar.");
      await expect(page.locator("fieldset")).toHaveJSProperty("disabled", false);
      await expect(page.getByRole("button", { name: "Pausa", exact: true })).toBeEnabled();
      expect(observed.events.some(event => event.event === "transaction-throw" && event.error === "InvalidStateError")).toBe(true);
      await page.screenshot({ path: info.outputPath("closed-native-connection-warning.png"), fullPage: true });
      await page.reload();
      await expect(page.getByLabel("Tiempo inicial (segundos)")).toHaveValue("300");
      await expect(page.getByRole("button", { name: /^Editar a / })).toHaveCount(0);
      await expect(page.getByTestId("clock-time-1")).toHaveCount(0);
      after = await inspectAfterReload(page); expect(after).toBeNull(); expect(observed.errors).toEqual([]);
    } finally { await attach(info, observed.events, { mode: "native-closed-connection", closed, after, limit: "Connection closed deliberately; does not demonstrate private-mode or quota failure, or that browser IndexedDB is generally unavailable." }); }
  });
});
