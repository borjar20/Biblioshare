import { test, expect } from "@playwright/test";
import { waitForActiveRecord } from "./support/play-db";

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

  await page.getByRole("link", { name: /configurar la mesa/i }).click();
  await expect(page).toHaveURL(/\/partidas\/mtg\/nueva/);

  // Cero es un camino de primera: «Empezar» está activo sin abrir nada, y la mesa
  // plegada enseña en su resumen a los cuatro de la mesa.
  await expect(page.getByText(/jugador 4/i).first()).toBeVisible();
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // La partida quedó guardada bajo la identidad anónima, no bajo una vacía.
  const record = await waitForActiveRecord(page, (r) => r !== null);
  expect(record, "la partida del anónimo se guarda en su propia identidad").not.toBeNull();
  expect(record!.committed[0].type).toBe("game_started");
  expect((record!.committed[0].payload as { toolId: string }).toolId).toBe("mtg");
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
  await page.getByRole("link", { name: /configurar la mesa/i }).click();

  // La cabecera, no el resumen de «Personalizar»: «20 vidas» sale en los dos sitios.
  await expect(page.getByText(/duelo · 20 vidas/i)).toBeVisible();
  // Duelo no ofrece elegir cuánta gente: min y max son 2.
  await page.getByText("En la mesa").click();
  await expect(page.getByPlaceholder("Jugador 2")).toBeVisible();
  await expect(page.getByPlaceholder("Jugador 3")).toHaveCount(0);

  await page.getByRole("button", { name: /^empezar$/i }).click();
  const record = await waitForActiveRecord(page, (r) => r !== null);
  const setup = (record!.committed[0].payload as { setup: Record<string, unknown> }).setup;
  expect(setup.mode).toBe("duel");
  expect(setup.startingLife).toBe(20);
  expect(setup.participants).toHaveLength(2);
});

test("lo escrito en la mesa llega a la partida, y la mesa se recuerda", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");

  // Los campos son lo opcional y viven plegados: se abre la mesa para escribir.
  await page.getByText("En la mesa").click();
  await page.getByPlaceholder("Jugador 1").fill("Ana");
  // Partner: el comandante es una lista de uno o dos, no un campo aparte.
  await page.getByRole("button", { name: /añadir comandante/i }).first().click();
  await page.getByLabel("Comandante 1").first().fill("Tymna");
  await page.getByLabel("Comandante 2").first().fill("Thrasios");

  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  const record = await waitForActiveRecord(page, (r) => r !== null);
  const setup = (
    record!.committed[0].payload as {
      setup: { participants: { name: string; commanders: { id: string; name?: string }[] }[] };
    }
  ).setup;
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

test("«Jugar ya»: del hub de Magic a la mesa en dos toques, sin pasar por configurar", async ({
  page,
}) => {
  await page.goto("/partidas/mtg");
  // Cuántos sois es la única pregunta del camino rápido.
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  const record = await waitForActiveRecord(page, (r) => r !== null);
  const setup = (
    record!.committed[0].payload as { setup: { mode: string; participants: unknown[] } }
  ).setup;
  expect(setup.mode).toBe("commander");
  expect(setup.participants).toHaveLength(5);
});

test("la mesa habitual reaparece en el hub y arranca con el turno rotado", async ({ page }) => {
  // Primera partida de la tarde: quick start de 4.
  await page.goto("/partidas/mtg");
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // De vuelta al hub, la mesa quedó recordada y se ofrece como tarjeta.
  await page.goto("/partidas/mtg");
  await expect(page.getByText(/tu mesa habitual/i)).toBeVisible();
  await page.getByRole("button", { name: /jugar con esta mesa/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // Empieza el siguiente: la convención de revancha, también aquí. Esta es ya
  // la SEGUNDA partida de la sesión (la primera fue el "jugar ya" de arriba),
  // así que no basta con "no nulo": el registro viejo también lo es. Se
  // espera al valor concreto que solo puede traer la partida nueva.
  const record = await waitForActiveRecord(
    page,
    (r) =>
      !!r &&
      (r.committed[0]?.payload as { setup?: { startingSeat?: number } } | undefined)?.setup
        ?.startingSeat === 1,
  );
  const setup = (record!.committed[0].payload as { setup: { startingSeat: number } }).setup;
  expect(setup.startingSeat).toBe(1);
});
