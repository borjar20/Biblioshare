import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// Plan 02 (Colección) T3: la pestaña General deja de ser una rejilla con filtros
// y pasa a ser «Actualizado recientemente» SIN buscador (frame A del mockup);
// los filtros solo viven en las pestañas de tipo (frame B). El usuario de prueba
// ya tiene biblioteca sembrada, así que basta con leer la UI.
test("General = recientes sin filtros; la pestaña de tipo sí los trae", async ({
  page,
}) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // ── General: cabecera serif, eyebrow de recientes y NADA de buscador ──
  await page.goto("/coleccion");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tu colección" }),
  ).toBeVisible();
  await expect(page.getByText("Actualizado recientemente")).toBeVisible();
  await expect(page.locator('input[name="q"]')).toHaveCount(0);

  // ── Pestaña de tipo (Libros): buscador presente y sin el eyebrow de General ──
  await page.goto("/coleccion?tab=book");
  await expect(page.locator('input[name="q"]')).toBeVisible();
  await expect(page.getByText("Actualizado recientemente")).toHaveCount(0);

  console.log("COLECCION GENERAL OK");
});
