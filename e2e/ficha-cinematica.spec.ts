import { expect, test } from "@playwright/test";

// Ficha cinemática (spec 2026-09-23). Lo que protege:
// 1. El bug que motivó el rediseño, con número: el cuerpo de las pestañas
//    medía ~771px a CUALQUIER viewport (raíl de 300 + tope de 1200). Con el cartel
//    (spec 2026-11-09) comparte fila con él: debe llenar la columna derecha.
// 2. La tarjeta «tu pase» existe una sola vez y se coloca donde toca (sin pase,
//    su botón principal es la intención «Quiero leerlo», spec 2026-11-10).
// 3. En móvil no hay scroll horizontal.
const BOOK = "/libro/3e80b690-ceef-49fb-b442-ecd2ea88be83";
// "Juego de tronos" (7fa0c2eb-755e-49c6-80c4-2b1f1245f48c): la serie con más
// episodios en dev (73, 8 temporadas) — la misma usada como sujeto en la
// verificación de cierre del plan 06 §5, y con ficha pública para anónimos.
const SERIES = "/serie/7fa0c2eb-755e-49c6-80c4-2b1f1245f48c";

test.describe("PC 1600", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("el cuerpo de las pestañas llena la columna derecha, junto al cartel", async ({ page }) => {
    // Desde lg el cartel es una columna fija a la izquierda (spec 2026-11-09) y el
    // cuerpo comparte fila con él: ya no mide >1100px, pero sí ocupa TODA la
    // columna derecha — su borde izquierdo queda tras el cartel y el derecho llega
    // al borde del contenedor.
    await page.goto(BOOK);
    const panel = page.locator("#item-tabpanel-info");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const poster = await page.locator("[data-poster]").boundingBox();
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box!.x).toBeGreaterThanOrEqual(poster!.x + poster!.width - 1);
    expect(box!.x + box!.width).toBeGreaterThanOrEqual(viewportWidth - 2);
    expect(box!.width).toBeGreaterThan(900);
  });

  test("una sola tarjeta, debajo del título", async ({ page }) => {
    await page.goto(BOOK);
    const follow = page.getByRole("button", { name: "Quiero leerlo", exact: true });
    await expect(follow).toHaveCount(1);
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    const card = await follow.boundingBox();
    // La tarjeta va bajo el título, en su misma columna (no a su derecha).
    expect(card!.y).toBeGreaterThanOrEqual(title!.y + title!.height - 1);
    expect(card!.x).toBeLessThan(title!.x + title!.width);
  });

  test("la ficha pública del libro muestra la comunidad junto a la información", async ({ page }) => {
    await page.goto(BOOK);
    const synopsis = page.getByRole("heading", { name: "Sinopsis" });
    const community = page.locator("#detail-community");
    await expect(community.getByRole("heading", { name: "Comunidad" })).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    const info = (await synopsis.boundingBox())!;
    const social = (await community.boundingBox())!;
    expect(social.x).toBeGreaterThanOrEqual(info.x + info.width);
  });

  test("Episodios comunitarios en escritorio: detalle al lado de la tabla", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`${SERIES}?tab=episodes`);
    const episodes = page.locator("#detail-episodes");
    const cell = episodes.getByRole("table").getByRole("button").first();
    await cell.click();
    const detail = episodes.getByRole("region", { name: "Detalle del episodio" });
    await expect(detail.getByRole("heading")).toBeVisible();
    await expect(cell).toHaveAttribute("aria-pressed", "true");
    await expect(detail).toBeFocused();
    expect((await detail.boundingBox())!.x).toBeGreaterThan((await cell.boundingBox())!.x);

  });
});

test.describe("tableta 1100, con la columna de cartel", () => {
  test.use({ viewport: { width: 1100, height: 800 } });
  const noOverflow = async (page: import("@playwright/test").Page) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  };

  test("Info sigue a una columna: las dos columnas empiezan en xl", async ({ page }) => {
    await page.goto(BOOK);
    const synopsis = await page.getByRole("heading", { name: "Sinopsis" }).boundingBox();
    const ficha = await page.locator("aside").filter({ hasText: "Primera publicación" }).boundingBox();
    expect(ficha!.y).toBeGreaterThan(synopsis!.y);
    expect(ficha!.x).toBeLessThan(synopsis!.x + 400);
    await noOverflow(page);
  });

  test("Episodios comunitarios en tableta: abre la ficha breve", async ({ page }) => {
    await page.goto(`${SERIES}?tab=episodes`);
    await page.locator("#detail-episodes").getByRole("button", { name: /^T1E1 ·/ }).click();
    await expect(page.getByRole("dialog", { name: "Detalle del episodio" })).toBeVisible();
    await noOverflow(page);

  });
});

test.describe("móvil 375", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("la tarjeta va bajo el hero, antes de la información, sin scroll horizontal", async ({ page }) => {
    await page.goto(BOOK);
    const follow = page.getByRole("button", { name: "Quiero leerlo", exact: true });
    await expect(follow).toBeVisible();
    const card = await follow.boundingBox();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    const panel = await page.locator("#item-tabpanel-info").boundingBox();
    const cover = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(card!.y).toBeGreaterThan(cover!.y);
    expect(card!.y).toBeLessThan(panel!.y);
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

  test("Episodios comunitarios en móvil: consulta la información y vuelve a la misma celda", async ({ page }) => {
    await page.goto(`${SERIES}?tab=episodes`);
    const episodes = page.locator("#detail-episodes");
    await expect(episodes.locator("details")).toHaveCount(0);
    const info = episodes.getByRole("button", { name: "Información por episodio" });
    await info.click();
    await expect(episodes.getByRole("article")).toHaveCount(0);
    await episodes.getByLabel("Elige una temporada").selectOption("7");
    await episodes.getByLabel("Elige un episodio").selectOption("1");
    await expect(episodes.getByRole("article")).toContainText("T7 · E1");
    await episodes.getByLabel("Elige una temporada").selectOption("2");
    await expect(episodes.getByRole("article")).toHaveCount(0);
    await info.click();
    const cell = episodes.getByRole("button", { name: /^T7E1 ·/ });
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeInViewport();
    const position = await page.evaluate(() => window.scrollY);
    await cell.click();
    const modal = page.getByRole("dialog", {name: "Detalle del episodio"});
    await expect(modal.getByRole("heading")).toBeVisible();
    await expect(modal.getByRole("textbox")).toHaveCount(0);
    await modal.getByRole("button", {name: "Cerrar"}).click();
    await expect(cell).toBeFocused();
    expect(Math.abs(await page.evaluate(() => window.scrollY) - position)).toBeLessThan(3);

  });
});
