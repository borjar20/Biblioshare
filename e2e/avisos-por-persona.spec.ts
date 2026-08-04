import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders(json = false) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function createUser(request: APIRequestContext, username: string) {
  const email = `${username}@example.com`;
  const password = "TestPassword123!";
  const auth = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  expect(auth.ok()).toBe(true);
  const user = await auth.json();
  const profile = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: adminHeaders(true),
    data: { user_id: user.id, username, is_public: true },
  });
  expect(profile.ok()).toBe(true);
  return { id: user.id as string, username, email, password };
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function deleteUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

// La campana solo aparece cuando el seguimiento está aceptado (perfil público
// → auto-aceptado, como en social-safety.spec.ts). Marcar una categoría es una
// mutación optimista con persistencia real (setFollowNotify escribe
// follows.notify_events), así que el check que importa es: sigue marcada tras
// recargar, no solo tras el toggle en cliente.
test("A sigue a B, abre la campana de avisos y la categoría marcada persiste", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const a = await createUser(request, `avisosa${stamp}`.slice(0, 20));
  const b = await createUser(request, `avisosb${stamp}`.slice(0, 20));

  try {
    await login(page, a.email, a.password);
    await page.goto(`/u/${b.username}`);
    await page.getByRole("button", { name: /^seguir$/i }).click();
    await expect(page.getByRole("button", { name: /^siguiendo$/i })).toBeVisible();

    const bell = page.getByRole("button", { name: /avisos de esta persona/i });
    await expect(bell).toBeVisible();
    await bell.click();

    const checkbox = page.getByRole("menu").getByLabel(/termine o reseñe una obra/i);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    await page.reload();
    await page.getByRole("button", { name: /avisos de esta persona/i }).click();
    await expect(
      page.getByRole("menu").getByLabel(/termine o reseñe una obra/i),
    ).toBeChecked();
  } finally {
    await deleteUser(a.id);
    await deleteUser(b.id);
  }
});
