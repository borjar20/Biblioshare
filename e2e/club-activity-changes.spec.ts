import { test, expect, type APIRequestContext } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cambios de actividad (plan 04 §6, mockup `-cambios-`): la vista previa sin unirse
// (frame B) y la barra de acciones consolidada (Salir + grupo ◈ MOD). Un club privado
// propio con un dueño (devtest, creador de la actividad) y un miembro raso deja probar
// las dos caras: el miembro no-participante ve la PREVIA con chat bloqueado y solo
// «Unirme»; el moderador ve la barra MOD y nunca la previa.

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

async function crearUsuario(request: APIRequestContext, username: string) {
  const email = `${username}@example.com`;
  const password = "TestPassword123!";
  const res = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  const user = await res.json();
  await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: adminJson(),
    data: { user_id: user.id, username },
  });
  return { id: user.id as string, username, email, password };
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

test("previa sin unirse + unirse + barra MOD", async ({ page, request }) => {
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-act-${ts}`;
  const owner = await devtestId();
  const member = await crearUsuario(request, `e2eactmem${ts}`.slice(0, 20));
  const bookId = await anyBook();

  let clubId: string | null = null;
  let activityId: string | null = null;

  try {
    // ── Siembra: club privado, dueño + miembro raso, reto por lista ACTIVO del dueño ──
    const [club] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({ slug, name: "Cambios E2E", visibility: "private", owner_id: owner }),
      })
    ).json()) as { id: string }[];
    clubId = club.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify([
        { club_id: clubId, user_id: owner, role: "owner", status: "active" },
        { club_id: clubId, user_id: member.id, role: "member", status: "active" },
      ]),
    });

    const [activity] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          club_id: clubId,
          kind: "list_challenge",
          title: `cambios reto ${ts}`,
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

    const activityUrl = `/club/${slug}/actividad/${activityId}`;

    // ── 1. El miembro no-participante ve la VISTA PREVIA (frame B) ──
    await entrarComo(page, member.email, member.password);
    await page.goto(activityUrl);

    await expect(page.getByText("Reto por lista · Activa")).toBeVisible();
    await expect(page.getByText("Únete para ver y participar")).toBeVisible();
    const unirme = page.getByRole("button", { name: "Unirme" });
    await expect(unirme).toBeVisible();
    // Aún NO participa: sin «Salir» y sin la sección de chat real (el heading vive
    // solo en la vista de participante; en la previa el chat es un teaser aria-hidden).
    await expect(page.getByRole("button", { name: "Salir" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Chat de la actividad" })).toHaveCount(0);

    // ── 2. Se une desde la barra inferior de la previa ──
    await unirme.click();
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chat de la actividad" })).toBeVisible();
    await expect(page.getByText("Únete para ver y participar")).toHaveCount(0);

    // BD: el miembro quedó como participante.
    const parts = (await (
      await fetch(
        `${SUPABASE_URL}/rest/v1/club_activity_participants?activity_id=eq.${activityId}&user_id=eq.${member.id}&select=user_id`,
        { headers: adminHeaders() },
      )
    ).json()) as unknown[];
    expect(parts).toHaveLength(1);

    // ── 3. El moderador (dueño) ve la barra ◈ MOD y nunca la previa ──
    await entrarComo(page, EMAIL, PASSWORD);
    await page.goto(activityUrl);
    await expect(page.getByText("Únete para ver y participar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Modificar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Archivar" })).toBeVisible();

    console.log("CAMBIOS ACTIVIDAD OK:", slug);
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
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${member.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  }
});
