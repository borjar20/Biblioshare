import { expect, test } from "@playwright/test";

// Visor de animaciones de la mascota (spec bellota-visor §3): guardia de admin y rejilla.
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

test("anónimo: /admin/mascota redirige al login con next", async ({ page }) => {
  await page.goto("/admin/mascota");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fmascota/);
});

for (const target of ["/admin", "/admin/contenido?kind=comment&status=removed&q=un%20texto"]) {
  test(`anónimo: conserva el destino administrativo ${target}`, async ({ page }) => {
    const expected = new URL(target, "https://biblioshare.test");
    await page.goto(target);
    await expect(page).toHaveURL((url) => {
      const next = url.searchParams.get("next");
      if (url.pathname !== "/login" || !next) return false;
      const destination = new URL(next, url.origin);
      // Next puede normalizar %20 a +: importan los valores de los filtros.
      return destination.pathname === expected.pathname &&
        destination.searchParams.toString() === expected.searchParams.toString();
    });
  });
}

test("admin: 19 sprites, la escala 3× ensancha el sprite y los controles mueven la animación", async ({ page }) => {
  // Prueba el retorno tras autenticarse, además de abrir la galería.
  await page.goto("/admin/mascota");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fmascota$/);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/admin/mascota");
  const sprites = page.getByTestId("pet-gallery").getByRole("img");
  await expect(sprites).toHaveCount(19);
  const before = await sprites.first().evaluate((el) => parseFloat(getComputedStyle(el).width));
  await page.getByTestId("pet-gallery-scale").selectOption("3");
  const after = await sprites.first().evaluate((el) => parseFloat(getComputedStyle(el).width));
  expect(after).toBeCloseTo(before * 1.5, 0); // 2× → 3×
  await page.getByTestId("pet-gallery-ready").check();
  await expect(sprites.last()).toHaveAttribute("data-anim", "ready");

  const beforeFrame = await sprites.first().evaluate((el) => el.getAnimations()[0]?.currentTime ?? null);
  await page.getByTestId("pet-gallery-next").click();
  const state = await sprites.first().evaluate((el) => ({ playState: el.getAnimations()[0]?.playState, t: el.getAnimations()[0]?.currentTime }));
  expect(state.playState).toBe("paused");
  expect(state.t).not.toBe(beforeFrame);
  await page.getByTestId("pet-gallery-replay").click();
  expect(await sprites.first().evaluate((el) => el.getAnimations()[0]?.playState)).toBe("running");
});
