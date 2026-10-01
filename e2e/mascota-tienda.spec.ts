import { test, expect } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { hideNextDevOverlay } from "./support/dev-overlay";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

test("tienda: recoger con desglose, comprar, estrenar y sobrevivir a una recarga", async ({ page, request }) => {
  test.setTimeout(180_000);
  await withBattleUsers(url, key, async (createUser) => {
    const user = await createUser("r5tiendaa");
    expect((await request.post(`${url}/rest/v1/pet_state`, { headers, data: { user_id: user.id, name: "Nuez", class: "wizard" } })).ok()).toBe(true);
    // Saldo sembrado directamente: esta prueba mira la tienda, no la concesión.
    expect((await request.post(`${url}/rest/v1/pet_acorn_ledger`, { headers, data: { user_id: user.id, source_key: "test:seed", amount: 200 } })).ok()).toBe(true);

    await hideNextDevOverlay(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/login?next=/mascota");
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator('button[type="submit"]').click();
    // Esperar al destino REAL: /login?next=/mascota también acaba en "/mascota" (#1174).
    await page.waitForURL((u) => u.pathname === "/mascota" && !u.search, { timeout: 30_000 });

    await page.getByRole("button", { name: "Ir al puesto", exact: true }).click();
    const shop = page.getByTestId("pet-shop");
    await expect(shop).toBeVisible();
    await expect(shop.getByTestId("acorn-balance")).toContainText("200");
    // La bienvenida está pendiente: recoger la ingresa y lo dice.
    await shop.getByRole("button", { name: /Recoger/ }).click();
    await expect(shop.getByRole("status")).toContainText("bienvenida");
    await expect(shop.getByTestId("acorn-balance")).toContainText("250");

    const creek = shop.getByTestId("scene-creek");
    // La vista previa debe mostrar la lámina entera, también cuando su tamaño
    // nativo no es 3/4 (el arroyo mide 280x380; #1176).
    const preview = creek.locator("img");
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const thumbnail = await preview.evaluate((img: HTMLImageElement) => {
      const { width, height } = img.getBoundingClientRect();
      return { width, height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
    });
    await test.info().attach("creek-thumbnail-dimensions", { body: JSON.stringify(thumbnail), contentType: "application/json" });
    expect(Math.abs(thumbnail.height - thumbnail.width * thumbnail.naturalHeight / thumbnail.naturalWidth)).toBeLessThanOrEqual(1);
    await test.info().attach("creek-thumbnail", { body: await preview.screenshot(), contentType: "image/png" });
    // Comprar y Poner llevan aria-label compuesto con el nombre de la escena
    // ("Comprar El arroyo por 100", "Poner El arroyo de fondo"): el texto visible
    // del botón no es el nombre accesible. Se localizan por regex, no por el texto
    // literal del botón (ver shop-panel.tsx).
    await creek.getByRole("button", { name: /^Comprar/ }).click();
    await expect(shop.getByTestId("acorn-balance")).toContainText("150");
    await creek.getByRole("button", { name: /^Poner .+ de fondo$/ }).click();
    await expect(creek).toContainText("Puesto ahora");
    await shop.screenshot({ path: ".superpowers/r5-tienda-mobile.png" });

    await page.reload();
    await page.getByRole("button", { name: "Ir al puesto", exact: true }).click();
    await expect(page.getByTestId("scene-creek")).toContainText("Puesto ahora");
    await expect(page.getByTestId("acorn-balance")).toContainText("150");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
