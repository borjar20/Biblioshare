import { test, expect } from "@playwright/test";

// El usuario SIN sesión: navega el chrome público y, al pisar una pantalla
// bloqueada, aterriza en /login?next= para volver tras entrar.
test("anónimo ve nav pública y botón de login en una página pública", async ({ page }) => {
  await page.goto("/buscar");
  // CTA de login en el header (no avatar).
  await expect(page.getByRole("link", { name: /iniciar sesión/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /crear cuenta/i })).toBeVisible();
  // Nav pública presente; Colección NO.
  await expect(page.getByRole("link", { name: /^Buscar$/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Colección$/ })).toHaveCount(0);
});

test("anónimo en página gated cae en /login?next= y no pierde el destino", async ({ page }) => {
  await page.goto("/coleccion");
  await expect(page).toHaveURL(/\/login\?next=%2Fcoleccion/);
});

// Round-trip completo: el anónimo pisa una página gated, se loguea desde el
// /login?next= al que cae, y vuelve a esa página — no a la home. Es el retorno
// que safeNext + el hidden input hacen posible (la review final marcó que no
// tenía e2e por necesitar un usuario autenticado).
test("tras loguearse desde /login?next=, vuelve a la página gated de origen", async ({ page }) => {
  await page.goto("/coleccion");
  await expect(page).toHaveURL(/\/login\?next=%2Fcoleccion/);

  await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');

  // Vuelve a /coleccion (el next), no a "/".
  await page.waitForURL("/coleccion");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mi Biblioteca" }),
  ).toBeVisible();
});
