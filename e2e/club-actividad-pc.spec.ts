import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// La vista de actividad dentro del shell del club (spec 2026-07-21). Lo que se
// protege aquí NO es la estética: es que el responsive no se resolviera
// duplicando controles. La suite corre a 1280 = lg, así que un `hidden lg:block`
// mal puesto deja DOS botones «Salir» en el DOM y `getByRole` revienta por
// strict mode -- exactamente lo que este test detecta.

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

async function anyBook(): Promise<string> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/books?select=id&limit=1`, { headers: adminHeaders() })
  ).json()) as { id: string }[];
  if (!rows[0]) throw new Error("no hay libros en catálogo para el e2e");
  return rows[0].id;
}

test("la actividad vive en el shell del club y no duplica controles", async ({ page }) => {
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-pc-${ts}`;
  const owner = await devtestId();
  const bookId = await anyBook();

  let clubId: string | null = null;
  let activityId: string | null = null;

  try {
    const [club] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({ slug, name: "Shell PC E2E", visibility: "private", owner_id: owner }),
      })
    ).json()) as { id: string }[];
    clubId = club.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ club_id: clubId, user_id: owner, role: "owner", status: "active" }),
    });

    const [activity] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          club_id: clubId,
          kind: "list_challenge",
          title: `shell pc ${ts}`,
          status: "active",
          created_by: owner,
        }),
      })
    ).json()) as { id: string }[];
    activityId = activity.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({
        activity_id: activityId,
        item_type: "book",
        item_id: bookId,
        added_by: owner,
        position: 0,
      }),
    });

    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ activity_id: activityId, user_id: owner }),
    });

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${slug}/actividad/${activityId}`);

    // 1. El sidebar del club está presente, con «Actividades» como sección activa.
    //    La cabecera de la actividad también enlaza «‹ Actividades» de vuelta
    //    (mismo texto, navegación distinta): acotamos al <aside> del sidebar
    //    para no toparnos con la ambigüedad -- son dos enlaces legítimos, no
    //    un control duplicado.
    const sidebar = page.locator("aside");
    const sidebarActividades = sidebar.getByRole("link", { name: "Actividades" });
    await expect(sidebarActividades).toHaveCount(1);
    await expect(sidebarActividades).toBeVisible();

    // 2. Un solo control por acción. `getByRole` es strict: si hubiera dos
    //    «Modificar» (uno para móvil y otro para PC), esta línea falla sola.
    await expect(page.getByRole("button", { name: "Modificar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Finalizar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Archivar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Salir" })).toHaveCount(1);

    // 3. El rail trae la clasificación, y sigue habiendo un solo encabezado.
    await expect(
      page.getByRole("heading", { name: "Clasificación del club" }),
    ).toHaveCount(1);

    // 4. En móvil el orden se conserva y tampoco hay duplicados.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Modificar" })).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Clasificación del club" }),
    ).toHaveCount(1);

    console.log("ACTIVIDAD PC OK:", slug);
  } finally {
    if (activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
