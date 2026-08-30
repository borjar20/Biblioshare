import { test, expect } from "@playwright/test";

// BiblioPlay, fase 1 (#931). Sin backend: la partida vive en localStorage, así que
// no hay maquinaria REST que limpiar (spec §8) — y tampoco hace falta limpiar el
// storage: Playwright da un contexto nuevo por test, así que cada uno empieza con el
// almacenamiento vacío.
//
// Aquí HUBO un `addInitScript` que borraba las claves `biblioshare:play*`, y era un
// bug: ese script corre en CADA navegación, así que al pasar de la configuración al
// tablero se llevaba por delante la partida que se acababa de crear, y los tests
// fallaban acusando al código.

test("anónimo llega a Partidas y puede empezar una partida sin cuenta", async ({ page }) => {
  // No hace falta cuenta para jugar (decisión 2026-08-29 (3)): ni redirección a
  // /login ni pantalla vacía.
  await page.goto("/partidas");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Partidas" })).toBeVisible();

  await page.getByRole("link", { name: /magic/i }).first().click();
  await expect(page).toHaveURL(/\/partidas\/mtg$/);

  await page.getByRole("link", { name: /nueva partida/i }).click();
  await expect(page).toHaveURL(/\/partidas\/mtg\/nueva/);

  // Cero es un camino de primera: se empieza sin escribir nada.
  await expect(page.getByPlaceholder("Jugador 4")).toBeVisible();
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // La partida quedó guardada bajo la identidad anónima, no bajo una vacía.
  const stored = await page.evaluate(() => window.localStorage.getItem("biblioshare:play:anon:active"));
  expect(stored, "la partida del anónimo se guarda en su propia clave").not.toBeNull();
  const snapshot = JSON.parse(stored!);
  expect(snapshot.committed[0].type).toBe("game_started");
  expect(snapshot.committed[0].payload.toolId).toBe("mtg");
});

test("el hub enseña la partida en curso con su forma, y vuelve a ella", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  await page.goto("/partidas");
  const banner = page.getByRole("link", { name: /partida en curso/i });
  await expect(banner).toBeVisible();
  // La miniatura enseña las vidas de verdad: cuatro asientos a 40.
  await expect(banner.getByText("40")).toHaveCount(4);
  await banner.click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
});

test("el modo manda: Duelo son 20 vidas y exactamente dos asientos", async ({ page }) => {
  await page.goto("/partidas/mtg");
  await page.getByRole("button", { name: /duelo/i }).click();
  await page.getByRole("link", { name: /nueva partida de duelo/i }).click();

  // La cabecera, no el resumen de «Personalizar»: «20 vidas» sale en los dos sitios.
  await expect(page.getByText(/duelo · 20 vidas/i)).toBeVisible();
  // Duelo no ofrece elegir cuánta gente: min y max son 2.
  await expect(page.getByPlaceholder("Jugador 2")).toBeVisible();
  await expect(page.getByPlaceholder("Jugador 3")).toHaveCount(0);

  await page.getByRole("button", { name: /^empezar$/i }).click();
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("biblioshare:play:anon:active"),
  );
  const setup = JSON.parse(stored!).committed[0].payload.setup;
  expect(setup.mode).toBe("duel");
  expect(setup.startingLife).toBe(20);
  expect(setup.participants).toHaveLength(2);
});

test("lo escrito en la mesa llega a la partida, y la mesa se recuerda", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");

  await page.getByPlaceholder("Jugador 1").fill("Ana");
  // Partner: el comandante es una lista de uno o dos, no un campo aparte.
  await page.getByRole("button", { name: /añadir comandante/i }).first().click();
  await page.getByLabel("Comandante 1").first().fill("Tymna");
  await page.getByLabel("Comandante 2").first().fill("Thrasios");

  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  const setup = await page.evaluate(() => {
    const raw = window.localStorage.getItem("biblioshare:play:anon:active");
    return JSON.parse(raw!).committed[0].payload.setup;
  });
  expect(setup.participants[0].name).toBe("Ana");
  // Dos comandantes, dos contadores de 21 independientes, ids distintos.
  expect(setup.participants[0].commanders.map((c: { name?: string }) => c.name)).toEqual([
    "Tymna",
    "Thrasios",
  ]);
  const ids = setup.participants.flatMap((p: { commanders: { id: string }[] }) =>
    p.commanders.map((c) => c.id),
  );
  expect(new Set(ids).size, "ids de comandante únicos en toda la mesa").toBe(ids.length);

  // La mesa se recuerda AL EMPEZAR: es lo que hace posible la revancha.
  const table = await page.evaluate(() =>
    window.localStorage.getItem("biblioshare:play:anon:table"),
  );
  expect(JSON.parse(table!).setup.participants[0].name).toBe("Ana");
});
