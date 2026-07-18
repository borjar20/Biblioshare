import { test, expect, type APIRequestContext } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Directorio de miembros (Sesión D, frame 9): pantalla abierta a todo miembro, solo
// lectura, con secciones Equipo/Miembros, 4 filtros server-side y búsqueda. El montaje
// crea un club privado propio con un roster CONOCIDO (dueño devtest + un mod + un
// miembro que participa en una actividad) para que los recuentos y el split sean
// deterministas, en vez de depender de la pertenencia ambiente de un club compartido.

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

// Cambiar de usuario NO es ir a /login sin más: el middleware rebota a "/" a quien ya
// tiene sesión, así que hay que tirar las cookies antes (igual que club-join-request).
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

// Usuario desechable con email confirmado y su perfil (username = nombre visible).
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

test("directorio: equipo/miembros, filtros, búsqueda y stub para no-miembro", async ({
  page,
  request,
}) => {
  // Dos logins (dueño → forastero) + siembra no caben en los 30 s por defecto.
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-dir-${ts}`;
  const owner = await devtestId();
  const mod = await crearUsuario(request, `e2edirmod${ts}`.slice(0, 20));
  const member = await crearUsuario(request, `e2edirmem${ts}`.slice(0, 20));
  const outsider = await crearUsuario(request, `e2ediro${ts}`.slice(0, 20));

  let clubId: string | null = null;
  let activityId: string | null = null;

  try {
    // ── Siembra: club privado + roster conocido ──
    const [club] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          slug,
          name: "Directorio E2E",
          visibility: "private",
          owner_id: owner,
        }),
      })
    ).json()) as { id: string }[];
    expect(club, "el club debe crearse").toBeTruthy();
    clubId = club.id;

    // joined_at distintos: el dueño primero (fundó), luego el mod, luego el miembro.
    const membersRes = await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify([
        { club_id: clubId, user_id: owner, role: "owner", status: "active", joined_at: "2024-01-01T00:00:00Z" },
        { club_id: clubId, user_id: mod.id, role: "moderator", status: "active", joined_at: "2024-06-01T00:00:00Z" },
        { club_id: clubId, user_id: member.id, role: "member", status: "active", joined_at: "2025-01-01T00:00:00Z" },
      ]),
    });
    expect(membersRes.ok, "el roster debe insertarse").toBeTruthy();

    // Una actividad con el miembro participando -> activityCount = 1 ("en 1 actividad").
    const [activity] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          club_id: clubId,
          kind: "buddy_read",
          title: `dir activity ${ts}`,
          status: "active",
          created_by: owner,
        }),
      })
    ).json()) as { id: string }[];
    activityId = activity.id;
    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ activity_id: activityId, user_id: member.id }),
    });

    // ── El dueño (miembro) ve el directorio ──
    await entrarComo(page, EMAIL, PASSWORD);
    await page.goto(`/club/${slug}/miembros`);

    // Cabecera y buscador. El h1 es "Miembros"; hay también un link "Miembros" en el
    // sidebar y un h2 "Miembros · N", de ahí el level:1 exacto.
    await expect(page.getByRole("heading", { level: 1, name: "Miembros" })).toBeVisible();
    await expect(page.getByPlaceholder("Buscar miembro…")).toBeVisible();

    // Los cuatro filtros, con los recuentos del roster sembrado (3 en total, 2 de equipo).
    await expect(page.getByRole("button", { name: "Todos · 3" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Equipo · 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Más activos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevos" })).toBeVisible();

    // Equipo: dueño (chip "Dueño" + "Tú") y mod (chip "Mod").
    await expect(page.getByText("Dueño", { exact: true })).toBeVisible();
    await expect(page.getByText("Mod", { exact: true })).toBeVisible();
    await expect(page.getByText("Tú", { exact: true })).toBeVisible();

    // El miembro trae su recuento de participación cruzando actividades.
    await expect(page.getByText("en 1 actividad", { exact: false })).toBeVisible();

    // La fila del miembro enlaza a su perfil; el ⊕ de invitar aparece para moderación.
    await expect(
      page.getByRole("link", { name: new RegExp(member.username) }),
    ).toHaveAttribute("href", `/u/${member.username}`);
    await expect(page.getByRole("link", { name: "Invitar" })).toBeVisible();

    // ── Filtro «Equipo»: oculta al miembro normal, mantiene al equipo ──
    await page.getByRole("button", { name: "Equipo · 2" }).click();
    await expect(page.getByText(member.username)).toHaveCount(0);
    await expect(page.getByText("Dueño", { exact: true })).toBeVisible();

    // ── Búsqueda server-side (debounce 300 ms) ──
    await page.getByRole("button", { name: "Todos · 3" }).click();
    await page.getByPlaceholder("Buscar miembro…").fill(member.username);
    await expect(page.getByText(member.username).first()).toBeVisible();
    await expect(page.getByText("Dueño", { exact: true })).toHaveCount(0);

    await page.getByPlaceholder("Buscar miembro…").fill("zzz-nadie-existe-xyz");
    await expect(page.getByText("Nadie coincide con la búsqueda.")).toBeVisible();

    // ── Un no-miembro en /miembros de un club privado ve el stub, no un 404 ──
    await entrarComo(page, outsider.email, outsider.password);
    await page.goto(`/club/${slug}/miembros`);
    await expect(page.getByRole("heading", { name: /directorio e2e/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /solicitar unirse/i })).toBeVisible();
    // Y NADA del roster: el buscador del directorio no existe para él.
    await expect(page.getByPlaceholder("Buscar miembro…")).toHaveCount(0);

    console.log("DIRECTORIO OK:", slug);
  } finally {
    // Limpieza con fetch nativo (el `request` de Playwright muere con el contexto).
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
    for (const u of [mod, member, outsider]) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
