import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Editar una actividad ya creada (spec 2026-08-12, #596/#597): el panel
// "Modificar actividad" (título/descripción/fechas) y el tablero de hitos de
// buddy_read, que ahora se gestiona DONDE SE MIRA y no detrás de "Modificar".
// Nadie había visto esta pantalla funcionar con sesión real: quien la montó no
// pudo autenticarse en el navegador. Este spec es, por ahora, la única
// verificación de que hace lo que dice.
//
// Un tercer test cubre un fallo que solo se vio leyendo código, no con tsc ni
// con los unitarios: el tablero de hitos de una buddy_read SIN ítem en el pool
// se quedaba en blanco. Está arreglado (checkpoint-editor.tsx); este test lo
// fija.

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function entrarComo(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
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

async function crearClub(slug: string, owner: string): Promise<string> {
  const [club] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: "Editar Actividad E2E",
        visibility: "private",
        owner_id: owner,
      }),
    })
  ).json()) as { id: string }[];

  await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ club_id: club.id, user_id: owner, role: "owner", status: "active" }),
  });

  return club.id;
}

async function crearActividadBuddyRead(
  clubId: string,
  owner: string,
  title: string,
): Promise<string> {
  const [activity] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        club_id: clubId,
        kind: "buddy_read",
        title,
        status: "active",
        created_by: owner,
      }),
    })
  ).json()) as { id: string }[];
  return activity.id;
}

async function borrarActividad(activityId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

test.describe("editar una actividad de club", () => {
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-editar-act-${ts}`;
  let clubId: string | null = null;
  // Actividad "con ítem": cubre el panel de detalles y el tablero de hitos normal.
  let activityConItemId: string | null = null;
  // Actividad "sin ítem": cubre el aviso "elige primero el ítem" del tablero.
  let activitySinItemId: string | null = null;

  test.beforeAll(async () => {
    const owner = await devtestId();
    const bookId = await anyBook();
    clubId = await crearClub(slug, owner);

    activityConItemId = await crearActividadBuddyRead(clubId, owner, `con item ${ts}`);
    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({
        activity_id: activityConItemId,
        item_type: "book",
        item_id: bookId,
        added_by: owner,
        position: 0,
      }),
    });

    activitySinItemId = await crearActividadBuddyRead(clubId, owner, `sin item ${ts}`);
  });

  test.afterAll(async () => {
    if (activityConItemId) await borrarActividad(activityConItemId);
    if (activitySinItemId) await borrarActividad(activitySinItemId);
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  });

  test.beforeEach(async ({ page }) => {
    await entrarComo(page, EMAIL, PASSWORD);
  });

  test("un moderador cambia la fecha de fin y se ve en la pestaña Actividades", async ({
    page,
  }) => {
    await page.goto(`/club/${slug}/actividad/${activityConItemId}`);
    await page.getByRole("button", { name: "Modificar" }).click();

    await page.locator("#details-ends").fill("2026-12-24");
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await page.goto(`/club/${slug}?tab=actividades`);
    await expect(page.locator("#en-curso")).toContainText("24 dic");
  });

  test("los hitos se gestionan desde el tablero, sin pasar por Modificar", async ({ page }) => {
    await page.goto(`/club/${slug}/actividad/${activityConItemId}`);
    // Sin pulsar "Modificar": el editor tiene que estar aquí.
    await expect(page.getByPlaceholder(/Nombre del hito/)).toBeVisible();
  });

  test("una buddy_read sin ítem en el pool avisa en vez de dejar el tablero mudo", async ({
    page,
  }) => {
    await page.goto(`/club/${slug}/actividad/${activitySinItemId}`);
    // Antes: hueco en blanco. Ahora: el aviso de checkpointsPickItemFirst.
    await expect(
      page.getByText("Elige primero el ítem de la lectura para poder añadir hitos."),
    ).toBeVisible();
    // Y ningún formulario de alta de hitos, que exigiría un tipo de ítem que no existe.
    await expect(page.getByPlaceholder(/Nombre del hito/)).toHaveCount(0);
  });
});
