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
