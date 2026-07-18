import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// Colección v2: «Mi Biblioteca» abre en la pestaña `Colecciones` (grid de
// colecciones, sin buscador); la biblioteca completa con filtros vive en `Todo`.
// El usuario de prueba ya tiene biblioteca sembrada, así que basta con leer la UI.
test("Mi Biblioteca: Colecciones sin buscador; Todo con buscador", async ({
  page,
}) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // ── Colecciones (default): cabecera renombrada y SIN buscador ──
  await page.goto("/coleccion");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mi Biblioteca" }),
  ).toBeVisible();
  await expect(page.locator('input[name="q"]')).toHaveCount(0);

  // ── Todo: la biblioteca completa SÍ trae el buscador ──
  await page.goto("/coleccion?tab=todo");
  await expect(page.locator('input[name="q"]')).toBeVisible();

  console.log("MI BIBLIOTECA OK");
});
