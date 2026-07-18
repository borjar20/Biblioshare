import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
// OJO: no llamar a esta const `URL` — pisa el constructor global y fetch revienta.
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

// Colección v2 · Sesión 2: filtro de tipo en «Todo» y la hoja «Añadir a colección»
// (frame D). Se conduce desde el grid de Todo (los ítems ahí están en biblioteca).
test("Todo filtra por tipo y la hoja añade el ítem a una colección", async ({ page }) => {
  test.setTimeout(60_000);

  const uid = (await (await fetch(
    `${BASE}/rest/v1/profiles?username=eq.${USERNAME}&select=user_id`, { headers: H() },
  )).json())[0].user_id;

  const name = `e2e s2 ${Date.now()}`;
  let colId: string | null = null;
  try {
    const [col] = await (await fetch(`${BASE}/rest/v1/collections`, {
      method: "POST", headers: { ...H(), Prefer: "return=representation" },
      body: JSON.stringify({ user_id: uid, name }),
    })).json();
    colId = col.id;

    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // ── Todo con ?type=book: solo libros (hay enlaces /libro, ninguno /pelicula ni /serie) ──
    await page.goto("/coleccion?tab=todo&type=book");
    await expect(page.getByRole("link", { name: "Libros" })).toBeVisible();
    const firstBook = page.locator('a[href^="/libro/"]').first();
    await expect(firstBook).toBeVisible();
    await expect(page.locator('a[href^="/pelicula/"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/serie/"]')).toHaveCount(0);

    // El ítem de la primera tarjeta (para verificar en BD después).
    const href = await firstBook.getAttribute("href");
    const itemId = href!.split("/").pop()!;

    // ── Hoja «Añadir a colección» desde esa tarjeta: marcar la colección y Hecho ──
    await page.getByRole("button", { name: "Añadir a colección" }).first().click();
    // Cada tarjeta monta su propio <dialog>; solo uno está `[open]`.
    const sheet = page.locator("dialog[open]");
    await expect(sheet).toBeVisible();
    await sheet.getByText(name).click(); // marca la fila de la colección sembrada
    await sheet.getByRole("button", { name: "Hecho" }).click();
    await expect(sheet).toHaveCount(0);

    // ── BD: el libro quedó en la colección ──
    await expect
      .poll(async () => {
        const rows = await (await fetch(
          `${BASE}/rest/v1/collection_items?collection_id=eq.${colId}&item_type=eq.book&item_id=eq.${itemId}&select=item_id`,
          { headers: H() },
        )).json();
        return Array.isArray(rows) ? rows.length : 0;
      }, { timeout: 10_000 })
      .toBe(1);

    console.log("COLECCION V2 S2 OK:", name, "->", itemId);
  } finally {
    if (colId) await fetch(`${BASE}/rest/v1/collections?id=eq.${colId}`, { method: "DELETE", headers: H() });
  }
});
