import { test, expect } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// Sorteo "sacar un lomo" (spec 2026-07-17): la tarjeta del Rincón abre la
// hoja, la ruleta revela un resultado y el CTA deja el ítem en curso.
// OJO: el CTA muta datos del usuario de test (un pendiente pasa a en curso);
// mientras le queden pendientes, las siguientes ejecuciones siguen valiendo.
test("sacar un lomo: hoja, sorteo y empezar el pase", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}?tab=rincon`);

  const openButton = page.getByRole("button", { name: /sacar un lomo/i });
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  await expect(openButton.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");

  await openButton.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /deja que decida/i })).toBeVisible();

  await sheet.getByRole("button", { name: /sorpréndeme/i }).click();
  // La ruleta desacelera unos segundos antes del revelado.
  const cta = sheet.getByRole("button", {
    name: /empezar a leer|ver esta noche|empezar la t1/i,
  });
  await expect(cta).toBeVisible({ timeout: 15_000 });

  await cta.click();
  await expect(sheet.getByRole("button", { name: /en curso/i })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /ver ficha/i })).toBeVisible();
});

// Enlace directo (spec 2026-11-01): Biblioteca e Inicio llevan aquí y la hoja
// llega abierta, sin pulsar la tarjeta.
test("?sorteo=1 abre la hoja al llegar y cerrarla limpia la URL", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");

  await page.goto("/coleccion/rincon?sorteo=1");
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  const sheet = page.getByRole("dialog");
  await expect(sheet.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");

  await expect(sheet.getByRole("heading", { name: /deja que decida/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/coleccion\/rincon$/);
});
