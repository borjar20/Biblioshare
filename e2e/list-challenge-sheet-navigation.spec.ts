import { test, expect } from "@playwright/test";

// Regresión: la hoja ItemConnectSheet (frame 14) de un reto por lista queda ROTA al
// navegar a la ficha de un ítem ("Ver ficha") y volver atrás. Con Cache Components el
// árbol de la ficha de actividad se conserva en navegación soft: la hoja reaparece
// encima de la página, fuera del top layer (sin backdrop, sin Escape) y no se puede
// cerrar. Comportamiento esperado: al volver, la hoja está cerrada.
//
// Reusa el mismo montaje directo por REST que activity-interconnection-buddy.spec.ts:
// no hay asistente de UI para sembrar un reto por lista activo con ítems.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es miembro

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function devtestId(): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

async function clubId(slug: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clubs?slug=eq.${encodeURIComponent(slug)}&select=id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as { id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el club ${slug}`);
  return rows[0].id;
}

async function anyBook(): Promise<{ id: string; title: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books?select=id,title&limit=1`, {
    headers: adminHeaders(),
  });
  const rows = (await res.json()) as { id: string; title: string }[];
  if (!rows[0]) throw new Error("no hay libros en catálogo para el e2e");
  return rows[0];
}

test("la hoja del reto por lista se cierra al ir a la ficha del ítem y volver", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const userId = await devtestId();
  const club = await clubId(CLUB_SLUG);
  const book = await anyBook();
  const titulo = `e2e reto navegar ${Date.now()}`;

  let activityId: string | null = null;

  try {
    // ── Siembra: reto por lista activo, con un ítem, devtest creador y participante ──
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        club_id: club,
        kind: "list_challenge",
        title: titulo,
        status: "active",
        created_by: userId,
      }),
    });
    const [created] = (await createRes.json()) as { id: string }[];
    expect(created, "el reto debe crearse").toBeTruthy();
    activityId = created.id;

    const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        activity_id: activityId,
        item_type: "book",
        item_id: book.id,
        added_by: userId,
        position: 0,
      }),
    });
    expect(itemRes.ok, "el ítem del reto debe insertarse").toBeTruthy();

    const participantRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ activity_id: activityId, user_id: userId }),
    });
    expect(participantRes.ok, "devtest debe unirse al reto").toBeTruthy();

    // ── Login y navegación a la ficha del reto ──
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${CLUB_SLUG}/actividad/${activityId}`);

    // ── Toca el ítem -> se abre la hoja ──
    const heading = page.getByRole("heading", {
      name: "Conectar una actividad desde este ítem",
    });
    await page.locator(`button[title="${book.title}"]`).click();
    await expect(heading).toBeVisible();

    // ── "Ver ficha" del ítem -> navega a /libro/<id> ──
    await page.getByRole("link", { name: /ficha/i }).click();
    await page.waitForURL(new RegExp(`/libro/${book.id}`));

    // ── Volver atrás a la ficha del reto ──
    await page.goBack();
    await page.waitForURL(new RegExp(`/actividad/${activityId}$`));

    // ── La hoja NO debe seguir abierta encima de la ficha ──
    await expect(heading).toBeHidden();
  } finally {
    if (activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
