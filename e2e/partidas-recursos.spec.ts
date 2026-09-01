import { test, expect } from "@playwright/test";

// Acompañante «Recursos». Anónimo, IDB propio (clave :resources). Viewport
// móvil como el resto de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("configurar, ajustar, chips rápidos, recargar, deshacer y reiniciar", async ({ page }) => {
  await page.goto("/partidas/recursos");
  await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
  await expect(page.getByText("Configura jugadores y recursos para empezar.")).toBeVisible();

  for (const name of ["Ana", "Beto"]) {
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
  }
  await page.getByLabel("Nombre del recurso").fill("Madera");
  await page.getByLabel("Valor inicial").fill("5");
  await page.getByRole("button", { name: "Añadir recurso" }).click();
  await page.getByLabel("Nombre del recurso").fill("Oro");
  await page.getByLabel("Compartido (banco)").check();
  await page.getByRole("button", { name: "Añadir recurso" }).click();

  // Tablero: banco primero, luego Ana (res-0) y Beto. Madera de Ana a 5.
  await expect(page.getByTestId("res-0-Madera")).toHaveText("5");
  await page.getByRole("button", { name: "Sumar Madera" }).first().click();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("6");

  // Chips rápidos: ± abre los deltas y +5 emite uno solo.
  await page.getByRole("button", { name: "Cantidades rápidas de Madera" }).first().click();
  await page.getByRole("button", { name: "+5", exact: true }).first().click();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("11");

  // Banco compartido.
  await page.getByRole("button", { name: "Sumar Oro" }).click();
  await expect(page.getByTestId("res-bank-Oro")).toHaveText("1");

  // Recarga conserva (IDB).
  await page.reload();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("11");
  await expect(page.getByTestId("res-bank-Oro")).toHaveText("1");

  // Deshacer revierte el último ajuste (el Oro del banco).
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(page.getByTestId("res-bank-Oro")).toHaveText("0");

  // Reiniciar valores (dos toques) vuelve al inicial.
  await page.getByRole("button", { name: /^reiniciar valores$/i }).click();
  await page.getByRole("button", { name: /todos a su inicial/i }).click();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("5");
});

test("la tarjeta del hub navega a recursos", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: "Recursos", exact: true }).click();
  await expect(page).toHaveURL(/\/partidas\/recursos$/);
  await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
});
