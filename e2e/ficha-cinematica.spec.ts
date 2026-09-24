import { expect, test } from "@playwright/test";

// Ficha cinemática (spec 2026-09-23). Lo que protege:
// 1. El bug que motivó el rediseño, con número: el cuerpo de las pestañas
//    medía ~771px a CUALQUIER viewport (raíl de 300 + tope de 1200).
// 2. La tarjeta «tu pase» existe una sola vez y se coloca donde toca.
// 3. En móvil no hay scroll horizontal.
const BOOK = "/libro/3e80b690-ceef-49fb-b442-ecd2ea88be83";

test.describe("PC 1600", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("el cuerpo de las pestañas usa el ancho (> 1100px)", async ({ page }) => {
    await page.goto(BOOK);
    const panel = page.getByRole("tabpanel");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.width).toBeGreaterThan(1100);
  });

  test("una sola tarjeta, a la derecha del título", async ({ page }) => {
    await page.goto(BOOK);
    const follow = page.getByRole("button", { name: /^seguir$/i });
    await expect(follow).toHaveCount(1);
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    const card = await follow.boundingBox();
    expect(card!.x).toBeGreaterThan(title!.x + 200);
  });
});

test.describe("móvil 375", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("la tarjeta va bajo el hero, antes de las pestañas, sin scroll horizontal", async ({ page }) => {
    await page.goto(BOOK);
    const follow = page.getByRole("button", { name: /^seguir$/i });
    await expect(follow).toBeVisible();
    const card = await follow.boundingBox();
    const tabs = await page.getByRole("tablist").boundingBox();
    const cover = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(card!.y).toBeGreaterThan(cover!.y);
    expect(card!.y).toBeLessThan(tabs!.y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
