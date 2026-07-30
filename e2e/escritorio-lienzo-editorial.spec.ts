import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test("Mi Biblioteca muestra el raíl contextual en escritorio", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto("/coleccion?tab=todo");

  await expect(page.locator("[data-editorial-main]")).toBeVisible();
  await expect(page.locator("[data-editorial-rail]")).toContainText(/tu biblioteca/i);
  await expect(
    page
      .locator("[data-editorial-rail]")
      .getByRole("link", { name: /buscar títulos/i }),
  ).toHaveAttribute("href", "/buscar");
});
