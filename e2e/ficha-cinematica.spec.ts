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

  test("Info a dos columnas: la ficha técnica a la derecha, una sola vez, pegada bajo las pestañas", async ({ page }) => {
    // Viewport más bajo que el describe (1000px): a 1600x1000 la página del
    // libro no siempre tiene 1500px de contenido debajo del fold para que el
    // wheel la mueva; a 700px de alto sí sobra scrollable de sobra.
    await page.setViewportSize({ width: 1600, height: 700 });
    await page.goto(BOOK);
    const synopsis = page.getByRole("heading", { name: "Sinopsis" });
    await expect(synopsis).toBeVisible();
    const aside = page.getByTestId("info-aside");
    // Una sola ficha técnica en el DOM (antes el libro la pintaba dos veces).
    await expect(page.locator("aside").filter({ hasText: "Primera publicación" })).toHaveCount(1);
    const s = await synopsis.boundingBox();
    const a = await aside.boundingBox();
    expect(a!.x).toBeGreaterThan(s!.x + 400);

    // Confirma que la página realmente se movió antes de medir nada debajo.
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

    // Tras bajar, el lateral queda pegado justo bajo la barra de pestañas:
    // top de la barra + su alto + 24px de aire (DETAIL_ASIDE_STICKY), con
    // 3px de tolerancia por redondeo de subpíxel.
    const tabs = await page.getByRole("tablist").boundingBox();
    await expect
      .poll(async () => {
        const a2 = await aside.boundingBox();
        return a2!.y;
      })
      .toBeGreaterThanOrEqual(tabs!.y + tabs!.height + 24 - 3);
    await expect
      .poll(async () => {
        const a2 = await aside.boundingBox();
        return a2!.y;
      })
      .toBeLessThanOrEqual(tabs!.y + tabs!.height + 24 + 3);
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

  test("Info en una columna con el orden de siempre: sinopsis antes que la ficha, la ficha antes que las ediciones", async ({ page }) => {
    await page.goto(BOOK);
    const synopsis = await page.getByRole("heading", { name: "Sinopsis" }).boundingBox();
    const ficha = await page.locator("aside").filter({ hasText: "Primera publicación" }).boundingBox();
    const editions = await page.getByText("Ediciones", { exact: true }).first().boundingBox();
    expect(ficha!.y).toBeGreaterThan(synopsis!.y);
    expect(editions!.y).toBeGreaterThan(ficha!.y);
  });
});
