import { test, expect } from "@playwright/test";

// El splash vive en el root layout, así que aparece en cualquier carga
// completa —incluida la pantalla de auth— sin necesidad de sesión.
test("el splash cubre al cargar y luego desaparece", async ({ page }) => {
  await page.goto("/");
  const splash = page.getByRole("status", { name: /biblioteca de todo/i });
  await expect(splash).toBeVisible();
  // Min-visible (650ms) + fade (400ms) → se desmonta. Margen amplio.
  await expect(splash).toBeHidden({ timeout: 5000 });
});

test("con prefers-reduced-motion también desaparece", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const splash = page.getByRole("status", { name: /biblioteca de todo/i });
  await expect(splash).toBeHidden({ timeout: 5000 });
  await context.close();
});
