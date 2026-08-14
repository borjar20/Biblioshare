import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// Colección v2: «Mi Biblioteca» abre en la pestaña `Todo` (la biblioteca
// completa con su buscador server-side, `name="q"`, que va a la URL). La
// pestaña `Colecciones` tiene su PROPIO buscador —de colecciones, en cliente y
// con otro nombre de campo—, así que la ausencia de `q` sigue siendo lo que
// distingue una pestaña de la otra.
//
// El usuario de prueba ya tiene biblioteca sembrada, así que basta con leer la UI.
test("Mi Biblioteca: Colecciones sin el buscador de biblioteca; Todo con él", async ({
  page,
}) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // ── Colecciones: cabecera renombrada, SIN el buscador de biblioteca... ──
  await page.goto("/coleccion?tab=colecciones");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mi Biblioteca" }),
  ).toBeVisible();
  await expect(page.locator('input[name="q"]')).toHaveCount(0);
  // (Que SÍ aparece el buscador propio de colecciones lo comprueba
  // `coleccion-desktop.spec.ts`, que siembra colecciones: sin ninguna, la
  // pestaña enseña su estado vacío y la barra no se pinta.)

  // ── Todo (la pestaña por defecto): la biblioteca completa y su buscador ──
  await page.goto("/coleccion");
  await expect(page.locator('input[name="q"]')).toBeVisible();

  console.log("MI BIBLIOTECA OK");
});
