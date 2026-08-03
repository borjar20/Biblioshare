import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// La página de estadísticas completas (plan 05, F5, frame J) es privada y solo
// del dueño: sin sesión, el middleware/redirect la manda a /login.
test("un visitante sin sesión no entra a /estadisticas", async ({ page }) => {
  await page.goto("/estadisticas");
  await page.waitForURL(/\/login/);
  await expect(page).toHaveURL(/\/login/);
});

// El "Ver estadísticas completas ›" de la pestaña Estadísticas lleva a la J, y
// allí aparece el selector de período (plan 05, F5).
test("la pestaña Estadísticas enlaza a /estadisticas con su selector", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}?tab=estadisticas`);
  await page
    .getByRole("link", { name: /estadísticas completas/i })
    .click();

  await page.waitForURL(/\/estadisticas/);
  // El selector de período: el pill "Todo" es un enlace a ?periodo=todo.
  await expect(
    page.getByRole("link", { name: /^todo$/i }),
  ).toBeVisible();
});

// El panel se reorientó de progress_sessions hacia passes (historial real): la
// tarjeta titular es "completadas por año" y "la pila" pasó a foto del momento.
test("la página muestra completadas por año", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto("/estadisticas");
  await expect(page.getByText(/completadas por año/i)).toBeVisible();
  await expect(page.getByText(/la pila/i)).toBeVisible();
});
