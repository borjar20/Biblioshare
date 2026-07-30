import { test, expect } from "@playwright/test";

test("página de género lista obras y 404 en slug inválido", async ({ page }) => {
  await page.goto("/genero/ciencia-ficcion");
  await expect(page.getByRole("heading", { name: "Ciencia ficción" })).toBeVisible();

  const res = await page.goto("/genero/no-existe");
  expect(res?.status()).toBe(404);
});
