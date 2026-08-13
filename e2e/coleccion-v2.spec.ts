import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
// OJO: no llamar a esta const `URL` — pisa el constructor global y fetch revienta.
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

// Colección v2 · Sesión 1: crear una colección con un ítem la muestra en el grid
// de «Mi Biblioteca» y su detalle renderiza ese ítem. El ítem se elige de un pase
// ACTIVO existente de devtest a propósito: el detalle (getCollection) hidrata vía
// la biblioteca y descarta claves sin pase activo, así que un collection_item de
// un título no trackeado no se vería (limitación conocida de S1; el caso «añadir
// sin trackear» es de la Sesión 2).
test("colecciones: grid + detalle de una colección sembrada", async ({ page }) => {
  test.setTimeout(60_000);

  const uid = (await (await fetch(
    `${BASE}/rest/v1/profiles?username=eq.${USERNAME}&select=user_id`, { headers: H() },
  )).json())[0].user_id;

  // Un pase activo de devtest -> el ítem tiene pase, así que el detalle lo pinta.
  const pass = (await (await fetch(
    `${BASE}/rest/v1/passes?user_id=eq.${uid}&is_active=eq.true&select=item_type,item_id&limit=1`,
    { headers: H() },
  )).json())[0];
  const meta = (await (await fetch(
    `${BASE}/rest/v1/${pass.item_type === "book" ? "books" : pass.item_type === "movie" ? "movies" : "series"}?id=eq.${pass.item_id}&select=title`,
    { headers: H() },
  )).json())[0];

  const name = `e2e col ${Date.now()}`;
  let colId: string | null = null;
  try {
    const [col] = await (await fetch(`${BASE}/rest/v1/collections`, {
      method: "POST", headers: { ...H(), Prefer: "return=representation" },
      body: JSON.stringify({ user_id: uid, name }),
    })).json();
    colId = col.id;
    await fetch(`${BASE}/rest/v1/collection_items`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ collection_id: colId, item_type: pass.item_type, item_id: pass.item_id }),
    });

    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // ── Grid de Colecciones: la colección sembrada aparece con su recuento ──
    // `/coleccion` a secas abre en `Todo`, NO en `Colecciones`: la pestaña hay
    // que pedirla. Este test navegaba sin `?tab=` y llevaba roto desde que el
    // defecto cambió — buscaba la tarjeta de la colección en la rejilla de la
    // biblioteca, donde nunca ha estado.
    await page.goto("/coleccion?tab=colecciones");
    const card = page.getByRole("link", { name: new RegExp(name) });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", `/coleccion/c/${colId}`);

    // ── Detalle: cabecera con el nombre y el ítem del pase sembrado ──
    await card.click();
    await page.waitForURL(new RegExp(`/coleccion/c/${colId}`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText(meta.title).first()).toBeVisible();

    console.log("COLECCIONES V2 OK:", name);
  } finally {
    if (colId) await fetch(`${BASE}/rest/v1/collections?id=eq.${colId}`, { method: "DELETE", headers: H() });
  }
});
