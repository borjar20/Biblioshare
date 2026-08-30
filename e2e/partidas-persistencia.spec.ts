import { expect, test, type Page } from "@playwright/test";
import { waitForActiveRecord } from "./support/play-db";

// La mesa se juega en móvil: mismo gate que el resto de specs de Play (#931).
test.use({ viewport: { width: 390, height: 844 } });

async function empezarPartida(page: Page) {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  // Espera a que el tablero esté vivo, no solo la URL.
  await expect(page.getByLabel("Vidas de Jugador 1")).toBeVisible();
}

test.describe("persistencia de la partida", () => {
  test("una partida sobrevive a recargar la página", async ({ page }) => {
    await empezarPartida(page);

    // Un gesto que deje huella distinta del estado inicial.
    await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
    await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

    await page.reload();

    // El tablero vuelve con el MISMO estado: la vida tocada sigue tocada.
    await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
  });

  test("tras recargar no aparece el vacío de «no hay partida» ni un frame", async ({ page }) => {
    await empezarPartida(page);
    await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
    await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

    await page.reload();

    // Espera a que el tablero real (hidratado) esté de vuelta...
    await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

    // ...y que el vacío de «no hay partida» nunca haya llegado a pintarse.
    await expect(page.getByText("No hay ninguna partida en curso")).toHaveCount(0);
  });

  test("guardar una partida terminada limpia la activa", async ({ page }) => {
    await empezarPartida(page);
    await waitForActiveRecord(page, (r) => r !== null);

    // Termina la partida por la hoja de acciones (mismo camino que el spec mtg).
    await page.getByRole("button", { name: "Acciones de Jugador 2" }).click();
    await page.getByRole("button", { name: /gana la partida/i }).click();
    await expect(page.getByRole("heading", { name: /gana jugador 2/i })).toBeVisible();

    await page.getByRole("button", { name: /^guardar partida$/i }).click();
    await expect(page).toHaveURL(/\/partidas$/);

    // Sin banner de partida en curso: deleteActive() borró la activa de verdad.
    await expect(page.getByRole("link", { name: /partida en curso/i })).toHaveCount(0);
    expect(await waitForActiveRecord(page, (r) => r === null)).toBeNull();
  });

  test("dos pestañas ven la misma partida (espejo)", async ({ page, context }) => {
    await empezarPartida(page);
    await waitForActiveRecord(page, (r) => r !== null);

    // BroadcastChannel comparte origen y contexto: mismo context de Playwright vale
    // como "otra pestaña".
    const second = await context.newPage();
    await second.goto("/partida/activa");
    await expect(second.getByLabel("Vidas de Jugador 1")).toHaveText("40");

    await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
    await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

    // La segunda pestaña ve el cambio sin recargar: el espejo por BroadcastChannel.
    await expect(second.getByLabel("Vidas de Jugador 1")).toHaveText("39");

    await second.close();
  });
});
