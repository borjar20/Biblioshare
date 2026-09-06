import { expect, test } from "@playwright/test";

test("production build serves and hydrates the login form", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
  expect(errors).toEqual([]);
});
