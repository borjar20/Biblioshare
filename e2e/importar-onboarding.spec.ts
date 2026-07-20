import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function setOnboardedAt(value: string | null) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${USERNAME}`,
    {
      method: "PATCH",
      headers: { ...adminHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ onboarded_at: value }),
    },
  );
  if (!res.ok) throw new Error(`no se pudo fijar onboarded_at: ${res.status}`);
}

async function userId(): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=user_id&username=eq.${USERNAME}`,
    { headers: adminHeaders() },
  );
  return ((await res.json()) as { user_id: string }[])[0].user_id;
}

// El spec manda a la cola de revisión la fila inventada del CSV; se limpia para
// no dejar basura acumulándose entre corridas (docs/TESTING.md).
async function limpiarPendientes() {
  const id = await userId();
  await fetch(
    `${SUPABASE_URL}/rest/v1/pending_import_rows?user_id=eq.${id}&status=eq.pending`,
    { method: "DELETE", headers: adminHeaders() },
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  // El proxy cachea "ya onboardeado" por usuario; al forzarlo por debajo hay
  // que tirar la cookie o el gate decide con el valor viejo.
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("importar desde el onboarding", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await setOnboardedAt(new Date().toISOString());
    await limpiarPendientes();
  });

  test("subir un CSV en el paso 2 añade títulos y encola los que no matchean", async ({
    page,
  }) => {
    await setOnboardedAt(null);
    await login(page);

    await page.goto("/onboarding?paso=2");
    await expect(
      page.getByRole("heading", { name: "Añade algo para empezar" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Importar mi biblioteca" }).click();
    await page.setInputFiles(
      'input[type="file"]',
      path.join(__dirname, "fixtures", "goodreads-min.csv"),
    );
    await page.getByRole("button", { name: /^(Subir|Importar fichero)/ }).first().click();

    // El resumen tarda: hay llamadas a Open Library por cada fila sin cachear.
    await expect(
      page.getByText(/añadidos?$|añadido$|No hemos podido añadir/),
    ).toBeVisible({ timeout: 150_000 });

    // La fila inventada del CSV no matchea y debe reportarse como pendiente.
    await expect(page.getByText(/necesitan? revisión/)).toBeVisible();

    // Y haber llegado de verdad a la cola de revisión, no solo al texto.
    const id = await userId();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pending_import_rows?select=payload&user_id=eq.${id}&status=eq.pending`,
      { headers: adminHeaders() },
    );
    const filas = (await res.json()) as { payload: { title: string } }[];
    expect(filas.some((f) => f.payload.title.startsWith("Zzzz"))).toBe(true);

    await page.getByRole("button", { name: /^Continuar/ }).click();
    await expect(page).toHaveURL(/paso=(3|fin)/, { timeout: 30_000 });
  });

  test("«Mejor elijo de la lista» devuelve a la rejilla", async ({ page }) => {
    await setOnboardedAt(null);
    await login(page);

    await page.goto("/onboarding?paso=2");
    await page.getByRole("button", { name: "Importar mi biblioteca" }).click();
    await expect(page.locator('input[type="file"]')).toBeVisible();

    await page.getByRole("button", { name: "Mejor elijo de la lista" }).click();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});
