import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
// OJO: no llamar a esta const `URL` — pisa el constructor global y fetch revienta.
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

// Rediseño de `Colecciones` en escritorio: cabecera con botón (ya no un tile en
// la rejilla), buscador y orden en CLIENTE, y tres columnas a 1440px.
//
// Los nombres se siembran a propósito con iniciales que NO están en orden de
// creación (Zafiro/Bruma/Almendra): así «Nombre» y el orden por defecto no
// pueden coincidir por casualidad y dar un verde falso.
test("colecciones en escritorio: botón en cabecera, búsqueda y orden en cliente, 3 columnas", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const uid = (await (await fetch(
    `${BASE}/rest/v1/profiles?username=eq.${USERNAME}&select=user_id`, { headers: H() },
  )).json())[0].user_id;

  const stamp = Date.now();
  const names = [`Zafiro ${stamp}`, `Bruma ${stamp}`, `Almendra ${stamp}`];
  const ids: string[] = [];

  try {
    for (const name of names) {
      const [col] = await (await fetch(`${BASE}/rest/v1/collections`, {
        method: "POST", headers: { ...H(), Prefer: "return=representation" },
        body: JSON.stringify({ user_id: uid, name }),
      })).json();
      ids.push(col.id);
    }

    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto("/coleccion?tab=colecciones");

    // ── Cabecera: el botón sustituye al tile punteado del final de la rejilla ──
    const nueva = page.getByRole("button", { name: /Nueva colección/ });
    await expect(nueva).toBeVisible();
    // El tile vivía DENTRO de la rejilla; el botón, en la fila de la cabecera.
    // Si volviera a haber uno por tarjeta, esto lo caza.
    await expect(nueva).toHaveCount(1);

    const cards = page.locator('a[href^="/coleccion/c/"]');
    // Las tarjetas SEMBRADAS por este test. El usuario de prueba puede tener
    // otras colecciones de antes, así que nada se cuenta en absoluto: todo se
    // acota al sello de tiempo de esta pasada.
    const seeded = cards.filter({ hasText: String(stamp) });
    await expect(seeded).toHaveCount(3);

    // ── Tres columnas a 1440: se mide la geometría real, no las clases ──
    // (las clases de Tailwind pueden estar puestas y no aplicarse; la posición
    // en pantalla es lo que ve el usuario). Tres tarjetas seguidas comparten
    // fila si comparten el borde superior.
    const tops = await cards.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    const firstRow = tops.filter((t) => t === tops[0]).length;
    expect(firstRow).toBe(3);

    // ── Búsqueda: filtra en el navegador, SIN navegar ──
    const urlBefore = page.url();
    const search = page.locator('input[name="coleccion-q"]');
    await expect(search).toBeVisible();
    await search.fill(names[1]);
    await expect(cards).toHaveCount(1);
    await expect(page.getByText(names[1], { exact: true })).toBeVisible();
    expect(page.url()).toBe(urlBefore); // ni recarga ni query string

    // Sin coincidencias: mensaje propio, no la rejilla entera ni un vacío mudo.
    await search.fill("no-existe-esto");
    await expect(cards).toHaveCount(0);
    await expect(page.getByText("Ninguna colección coincide")).toBeVisible();

    // Acotado al sello: quedan las tres sembradas y nada más, sea cual sea el
    // resto de la biblioteca del usuario de prueba.
    await search.fill(String(stamp));
    await expect(cards).toHaveCount(3);

    // ── Orden: «Nombre» reordena el DOM sin ir al servidor ──
    await page.getByRole("button", { name: "Nombre", exact: true }).click();
    const ordered = await cards.evaluateAll((els) =>
      els.map((el) => el.textContent ?? ""),
    );
    expect(ordered[0]).toContain("Almendra");
    expect(ordered[1]).toContain("Bruma");
    expect(ordered[2]).toContain("Zafiro");
    expect(page.url()).toBe(urlBefore);

    // ── Móvil: DOS columnas, no una ──
    // El rediseño ensancha el escritorio sin tocar el teléfono. A una sola
    // columna la tarjeta ocupa media pantalla y solo caben dos colecciones,
    // así que esto es tan parte del diseño como las tres de escritorio.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator('input[name="coleccion-q"]').fill(String(stamp));
    await expect(cards).toHaveCount(3);
    const mobileTops = await cards.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(mobileTops.filter((t) => t === mobileTops[0]).length).toBe(2);

    console.log("COLECCIONES DESKTOP OK");
  } finally {
    for (const id of ids) {
      await fetch(`${BASE}/rest/v1/collections?id=eq.${id}`, {
        method: "DELETE", headers: H(),
      });
    }
  }
});
