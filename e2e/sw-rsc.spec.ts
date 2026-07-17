import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// Opt-in: el service worker solo se registra en producción, así que este spec
// necesita un build real sirviendo en :3000 (Playwright lo reutiliza gracias a
// reuseExistingServer). Cómo correrlo:
//   npm run build && npm start          # en otra terminal, en :3000
//   SW_E2E=1 npx playwright test e2e/sw-rsc.spec.ts
test.describe("service worker y payloads RSC", () => {
  test.skip(process.env.SW_E2E !== "1", "requiere build de producción (ver cabecera)");
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(120_000);

  test("ningún payload RSC lo sirve el service worker", async ({ page }) => {
    // El bug: el SW servía de su caché los payloads de las navegaciones
    // cliente, así que la ficha repintaba datos de la visita anterior al
    // cambiar de pestaña y se comía la revalidación del servidor.
    const servedBySw: string[] = [];
    let rscSeen = 0;
    page.on("response", (response) => {
      if (!response.url().includes("_rsc=")) return;
      rscSeen += 1;
      if (response.fromServiceWorker()) servedBySw.push(response.url());
    });

    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // Sin SW al mando el test no probaría nada: se espera a que tome el control.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 30_000,
    });

    await page.goto("/buscar?type=book&q=dune");
    const card = page
      .locator('a[href*="/libro/"]')
      .or(page.getByRole("button", { name: /ediciones/ }))
      .first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // Ida y vuelta entre pestañas dos veces: la segunda visita a "Comunidad" es
    // justo donde el SW devolvía su copia cacheada de la primera.
    for (const name of [/comunidad/i, /registro/i, /comunidad/i]) {
      await page.getByRole("button", { name }).click();
      await page.waitForTimeout(600);
    }

    // Sin peticiones RSC el test sería vacuo: se exige haber visto alguna.
    expect(rscSeen).toBeGreaterThan(0);
    expect(servedBySw).toEqual([]);
  });
});
