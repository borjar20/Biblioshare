import { test, expect, type Page } from "@playwright/test";

// #713 — las reseñas de pase de una SERIE se escribían y no se pintaban nunca.
//
// El panel de comunidad elegía rama con `episodeReviews !== undefined`, y la
// ficha de serie pasaba SIEMPRE el array (aunque viniera vacío), así que la rama
// de reseñas de pase era código muerto: al cerrar el pase de una serie, lo que
// el usuario escribía desaparecía de la ficha, que seguía diciendo «Todavía no
// hay reseñas». En libro y película sí se veían.
//
// El test siembra la reseña por REST con service-role (no por la UI: cerrar un
// pase desde el navegador arrastra media hoja de cierre y aquí lo que se prueba
// es el RENDER, no la escritura) y limpia al terminar.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function devtestId(): Promise<string> {
  const rows = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
      { headers: adminHeaders() },
    )
  ).json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

async function algunaSerie(): Promise<string | null> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/series?select=id&limit=1`, { headers: adminHeaders() })
  ).json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("Reseñas de pase en la ficha de serie (#713)", () => {
  test.skip(!EMAIL || !PASSWORD || !SERVICE_KEY, "sin credenciales de test");

  test("una reseña escrita al cerrar el pase de una serie SE VE en Comunidad", async ({ page }) => {
    const serieId = await algunaSerie();
    test.skip(!serieId, "no hay series en el catálogo de esta base");
    const userId = await devtestId();

    // Texto único por ejecución: si el test dejara residuo, la siguiente pasada
    // no lo confundiría con el suyo.
    const texto = `Reseña de pase E2E ${Date.now()} — esto lo escribió el cierre del pase, no un episodio`;

    // `is_active: false` a propósito: el usuario de pruebas puede tener ya un
    // pase activo de esta serie y `passes_one_active` lo rechazaría. Al panel
    // de comunidad le da igual —`getReviews` filtra por reseña pública con
    // fecha de cierre, no por pase activo—, que es justo lo que se quiere
    // probar.
    //
    // Fecha de cierre presente: desde #719 la BD lo exige para un `completed`
    // (constraint `passes_status_dates`).
    const creado = await fetch(`${SUPABASE_URL}/rest/v1/passes`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userId,
        item_type: "series",
        item_id: serieId,
        status: "completed",
        is_active: false,
        position: {},
        started_on: "2026-01-01",
        finished_on: "2026-01-20",
        rating: 9,
        review: texto,
        is_public: true,
      }),
    });
    const [pase] = (await creado.json()) as { id: string }[];
    if (!pase?.id) throw new Error("no se pudo sembrar el pase con reseña");

    try {
      await login(page);
      await page.goto(`/serie/${serieId}?tab=community`);

      await expect(page.getByText(texto)).toBeVisible({ timeout: 15_000 });
      // Y el panel deja de mentir con el vacío.
      await expect(page.getByText("Todavía no hay reseñas")).toHaveCount(0);
    } finally {
      await fetch(`${SUPABASE_URL}/rest/v1/passes?id=eq.${pase.id}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  });
});
