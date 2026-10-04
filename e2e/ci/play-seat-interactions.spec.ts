import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { allEvents, waitForActiveRecord } from "../support/play-db";

// #1006/#1008: cada contexto es anónimo y posee su IndexedDB. Sin actores,
// semilla remota, imports de producto ni interceptación de API/almacenamiento.
const test = base.extend<{ browserHealth: void }>({
  browserHealth: [async ({ page }, runTest, testInfo) => {
    const observed = {
      pageErrors: [] as string[],
      consoleErrors: [] as string[],
      httpErrors: [] as { path: string; status: number }[],
      requestFailures: [] as { path: string; method: string; resourceType: string; error: string | null }[],
    };
    page.on("pageerror", error => observed.pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") observed.consoleErrors.push(message.text());
    });
    page.on("response", response => {
      if (response.status() >= 400) observed.httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    page.on("requestfailed", request => observed.requestFailures.push({
      path: new URL(request.url()).pathname,
      method: request.method(),
      resourceType: request.resourceType(),
      error: request.failure()?.errorText ?? null,
    }));
    try {
      await runTest();
    } finally {
      await testInfo.attach("browser-health", { body: JSON.stringify(observed, null, 2), contentType: "application/json" });
      expect(observed.pageErrors, "pageerror sin allowlist").toEqual([]);
      expect(observed.consoleErrors, "console.error sin allowlist").toEqual([]);
      expect(observed.httpErrors, "respuestas HTTP de error").toEqual([]);
      // Las cancelaciones se conservan completas para diagnóstico; esta suite
      // no afirma una auditoría global de red ni las transforma en éxito.
    }
  }, { auto: true }],
});

function button(scope: Locator, name: string) {
  return scope.getByRole("button", { name, exact: true }).filter({ visible: true });
}

function main(page: Page) {
  return page.getByRole("main").filter({ visible: true });
}

function seats(scope: Locator) {
  return scope.getByRole("button", { name: /^Editar a / }).filter({ visible: true });
}

async function openMtg(page: Page, mode = "commander") {
  await page.goto(`/partidas/mtg/nueva?modo=${mode}`);
  const root = main(page);
  await expect(root).toHaveCount(1);
  await expect(root.getByRole("heading", { name: "Nueva partida", exact: true })).toBeVisible();
  await expect(button(root, "Empezar")).toBeEnabled();
  return root;
}

async function openSeat(root: Locator, name: string) {
  const token = button(root, `Editar a ${name}`);
  await expect(token).toHaveCount(1);
  await expect(token).toHaveAttribute("aria-expanded", "false");
  await token.click();
  await expect(token).toHaveAttribute("aria-expanded", "true");
  const panel = root.locator("#mtg-seat").filter({ visible: true });
  await expect(panel).toHaveCount(1);
  await expect(panel.getByRole("textbox", { name: "Nombre", exact: true })).toBeVisible();
  return panel;
}

type ResourcesRecord = {
  identity: string;
  rev: number;
  log: { type: string; payload: { players?: string[] } }[];
};

// Sólo lectura, después de que la UI cargada haya creado los stores nativos.
async function resourcesRecord(page: Page) {
  return page.evaluate(() => new Promise<ResourcesRecord | null>((resolve, reject) => {
    const request = indexedDB.open("biblioshare-play");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("companion", "readonly");
      const get = tx.objectStore("companion").get("anon:resources");
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}

async function resourcesPlayers(page: Page, names: string[]) {
  await expect.poll(async () => {
    const record = await resourcesRecord(page);
    return record?.log.filter(event => event.type === "players_set").at(-1)?.payload.players;
  }).toEqual(names);
  return resourcesRecord(page);
}

type MtgStarted = {
  toolId: string;
  setup: {
    mode: string;
    startingLife: number;
    startingSeat: number;
    participants: { id: string; name: string; commanders: { id: string }[] }[];
  };
};

async function startAndCheck(page: Page, root: Locator, expected: { names: string[]; ids: string[]; mode?: string; life?: number; startingSeat?: number }) {
  await button(root, "Empezar").click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  const board = main(page);
  const life = expected.life ?? 40;
  await expect(board.getByRole("button", { name: /^Acciones de (?!la partida$)/ }).filter({ visible: true }))
    .toHaveCount(expected.names.length);
  for (const name of expected.names) {
    await expect(button(board, `Acciones de ${name}`)).toHaveCount(1);
    await expect(board.getByLabel(`Vidas de ${name}`, { exact: true }).filter({ visible: true })).toHaveText(String(life));
  }
  const record = await waitForActiveRecord(page, record => record !== null && allEvents(record).some(event => event.type === "game_started"));
  expect(record).not.toBeNull();
  const started = allEvents(record!).filter(event => event.type === "game_started");
  expect(started).toHaveLength(1);
  const payload = started[0].payload as MtgStarted;
  expect(payload).toMatchObject({ toolId: "mtg", setup: { mode: expected.mode ?? "commander", startingLife: life, startingSeat: expected.startingSeat ?? 0 } });
  expect(payload.setup.participants.map(player => player.name)).toEqual(expected.names);
  const ids = payload.setup.participants.map(player => player.id);
  expect(ids).toEqual(expected.ids);
  expect(ids.every(id => /^p[1-9]\d*$/.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  const commanders = payload.setup.participants.flatMap(player => player.commanders.map(commander => commander.id));
  expect(new Set(commanders).size).toBe(commanders.length);
  return record!;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    test("#1006 Recursos: tocar abre el panel y sólo quitar elimina; persiste al recargar", async ({ page }, testInfo) => {
      await page.goto("/partidas/recursos");
      const root = main(page);
      await expect(root).toHaveCount(1);
      await expect(root.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();
      await expect(seats(root)).toHaveCount(0);
      for (const name of ["Ana", "Beto"]) {
        await button(root, "Añadir jugador").click();
        const input = root.getByRole("textbox", { name: "Nombre del jugador", exact: true }).filter({ visible: true });
        await expect(input).toHaveCount(1);
        await input.fill(name);
        await input.press("Enter");
        await expect(button(root, `Editar a ${name}`)).toHaveCount(1);
      }
      const before = await resourcesPlayers(page, ["Ana", "Beto"]);
      expect(before).not.toBeNull();
      const ana = button(root, "Editar a Ana");
      await expect(ana).toHaveAttribute("aria-expanded", "false");
      await ana.click();
      await expect(ana).toHaveAttribute("aria-expanded", "true");
      await expect(seats(root)).toHaveCount(2);
      const panel = root.locator("#resources-seat").filter({ visible: true });
      await expect(panel).toHaveCount(1);
      await expect(panel.getByText("Ana", { exact: true })).toBeVisible();
      await expect(button(panel, "Quitar a Ana de la mesa")).toBeEnabled();
      expect(await resourcesRecord(page)).toEqual(before);
      await testInfo.attach("resources-seat-open", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

      // Cerrar y volver a tocar conserva ambas fichas y el registro persistido.
      await ana.click();
      await expect(panel).toHaveCount(0);
      await expect(seats(root)).toHaveCount(2);
      expect(await resourcesRecord(page)).toEqual(before);
      await ana.click();
      await expect(panel.getByText("Ana", { exact: true })).toBeVisible();
      await button(panel, "Quitar a Ana de la mesa").click();
      await expect(button(root, "Editar a Ana")).toHaveCount(0);
      await expect(seats(root)).toHaveCount(1);
      await expect(button(root, "Editar a Beto")).toHaveCount(1);
      await expect(panel).toHaveCount(0);
      const removed = await resourcesPlayers(page, ["Beto"]);
      expect(removed!.rev).toBeGreaterThan(before!.rev);
      await page.reload();
      await expect(root.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();
      await expect(seats(root)).toHaveCount(1);
      await expect(button(root, "Editar a Ana")).toHaveCount(0);
      await expect(button(root, "Editar a Beto")).toHaveCount(1);
      expect(await resourcesRecord(page)).toEqual(removed);
      await testInfo.attach("resources-seat-removed-reloaded", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    });

    test("#1008 MTG: añadir quinto, tocar su ficha y quitar devuelve cuatro que arrancan", async ({ page }, testInfo) => {
      const root = await openMtg(page);
      await expect(seats(root)).toHaveCount(4);
      await button(root, "Añadir jugador").click();
      await expect(seats(root)).toHaveCount(5);
      const fifth = button(root, "Editar a Jugador 5");
      // Añadir abre el panel; cerrar permite acreditar que la ficha lo reabre.
      await expect(fifth).toHaveAttribute("aria-expanded", "true");
      await fifth.click();
      await expect(fifth).toHaveAttribute("aria-expanded", "false");
      await expect(seats(root)).toHaveCount(5);
      const panel = await openSeat(root, "Jugador 5");
      await expect(panel.getByRole("textbox", { name: "Nombre", exact: true })).toHaveAttribute("placeholder", "Jugador 5");
      await expect(button(panel, "Quitar asiento")).toBeEnabled();
      await testInfo.attach("mtg-fifth-seat-open", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      await button(panel, "Quitar asiento").click();
      await expect(seats(root)).toHaveCount(4);
      await expect(fifth).toHaveCount(0);
      await expect(panel).toHaveCount(0);
      const record = await startAndCheck(page, root, { names: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"], ids: ["p1", "p2", "p3", "p4"] });
      await page.reload();
      for (const name of ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"]) {
        await expect(main(page).getByLabel(`Vidas de ${name}`, { exact: true }).filter({ visible: true })).toHaveText("40");
      }
      expect(await waitForActiveRecord(page, current => current?.rev === record.rev)).toEqual(record);
    });

    test("#1008 MTG: quitar por el medio y volver a añadir conserva ids únicos y quién empieza", async ({ page }, testInfo) => {
      const root = await openMtg(page);
      for (const [index, name] of ["Ana", "Beto", "Cris", "Dani"].entries()) {
        const panel = await openSeat(root, `Jugador ${index + 1}`);
        await panel.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
        await button(root, `Editar a ${name}`).click();
      }
      await button(root, "Añadir jugador").click();
      await expect(seats(root)).toHaveCount(5);
      const panel = root.locator("#mtg-seat").filter({ visible: true });
      await panel.getByRole("textbox", { name: "Nombre", exact: true }).fill("Eva");
      await button(root, "Editar a Eva").click();
      await button(root, "Empieza Eva").click();
      await expect(button(root, "Empieza Eva")).toHaveAttribute("aria-pressed", "true");
      const middle = await openSeat(root, "Beto");
      await button(middle, "Quitar asiento").click();
      await expect(button(root, "Editar a Beto")).toHaveCount(0);
      await expect(seats(root)).toHaveCount(4);
      await expect(button(root, "Empieza Eva")).toHaveAttribute("aria-pressed", "true");
      await button(root, "Añadir jugador").click();
      await expect(seats(root)).toHaveCount(5);
      await panel.getByRole("textbox", { name: "Nombre", exact: true }).fill("Fede");
      await button(root, "Editar a Fede").click();
      const record = await startAndCheck(page, root, { names: ["Ana", "Cris", "Dani", "Eva", "Fede"], ids: ["p1", "p3", "p4", "p5", "p2"], startingSeat: 3 });
      await testInfo.attach("mtg-gap-reused-board", { body: await page.screenshot(), contentType: "image/png" });
      await testInfo.attach("mtg-persisted-game-start", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    });

    test("#1008 MTG: quitar queda deshabilitado con dos y ausente en Duelo", async ({ page }, testInfo) => {
      let root = await openMtg(page);
      for (const name of ["Jugador 4", "Jugador 3"]) {
        const panel = await openSeat(root, name);
        await expect(button(panel, "Quitar asiento")).toBeEnabled();
        await button(panel, "Quitar asiento").click();
      }
      await expect(seats(root)).toHaveCount(2);
      const minimum = await openSeat(root, "Jugador 2");
      await expect(button(minimum, "Quitar asiento")).toHaveCount(1);
      await expect(button(minimum, "Quitar asiento")).toBeDisabled();
      await expect(seats(root)).toHaveCount(2);
      await testInfo.attach("mtg-minimum-two-seat-disabled", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

      root = await openMtg(page, "duel");
      await expect(seats(root)).toHaveCount(2);
      const duel = await openSeat(root, "Jugador 2");
      await expect(duel.getByRole("textbox", { name: "Nombre", exact: true })).toBeVisible();
      await expect(button(root, "Quitar asiento")).toHaveCount(0);
      await expect(button(root, "Añadir jugador")).toHaveCount(0);
      await startAndCheck(page, root, { names: ["Jugador 1", "Jugador 2"], ids: ["p1", "p2"], mode: "duel", life: 20 });
    });
  });
}
