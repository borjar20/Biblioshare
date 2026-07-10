import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// Happy path de lectura (no mutación): login → home → buscar → ficha →
// perfil. Cubre auth, middleware, RLS de lectura y el enrutado principal.
// Requiere el usuario de prueba sembrado en el proyecto Supabase dev.
test("recorrido principal del usuario autenticado", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  // Login
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // Home autenticada (dashboard de estadísticas)
  await expect(page.getByText(`@${USERNAME}`).first()).toBeVisible();

  // Buscar un libro y ver resultados
  await page.goto("/buscar?q=rayuela&type=book");
  const firstResult = page.locator('a[href*="/libro/"]').first();
  await expect(firstResult).toBeVisible({ timeout: 15_000 });

  // Abrir la ficha del primer resultado
  await firstResult.click();
  await page.waitForURL(/\/libro\//);
  await expect(page.getByRole("tab", { name: /comunidad/i }).or(page.getByText(/comunidad/i)).first()).toBeVisible();

  // Perfil propio
  await page.goto(`/u/${USERNAME}`);
  await expect(page.getByText(`@${USERNAME}`).first()).toBeVisible();
});
