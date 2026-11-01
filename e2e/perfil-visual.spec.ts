import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

const admin = (json = false) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function createUser(request: APIRequestContext, username: string, isPublic: boolean) {
  const auth = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: admin(),
    data: { email: `${username}@example.com`, password: "TestPassword123!", email_confirm: true },
  });
  expect(auth.ok()).toBe(true);
  const user = await auth.json();
  const profile = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: admin(true),
    data: { user_id: user.id, username, is_public: isPublic },
  });
  if (!profile.ok()) {
    await deleteUser(user.id);
    expect(profile.ok()).toBe(true);
  }
  return { id: user.id as string, username };
}

async function deleteUser(id: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin() });
  if (!res.ok) console.warn(`No se pudo borrar el usuario de prueba ${id}: ${res.status}`);
}

// Los bloques del perfil llegan por streaming, cada uno tras su skeleton: una
// ausencia solo es fiable cuando la página ha terminado de llegar.
async function waitForProfileSettled(page: Page, activityEmpty: boolean) {
  if (activityEmpty) {
    await expect(page.getByRole("heading", { name: "Sin actividad todavía" })).toBeVisible();
  } else {
    await expect(page.getByTestId("profile-wall")).toBeVisible();
  }
  await expect(page.getByTestId("profile-figures")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[aria-hidden="true"].bg-surface-muted, [aria-hidden="true"].animate-pulse')).toHaveCount(0);
}

async function login(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto("/login");
  await submitLogin(page, email, password);
  await page.waitForURL("/");
}

// La cuenta de pruebas es admin (ve perfiles privados por la RLS de moderación),
// así que los casos de privacidad usan un visitante temporal sin rol.
const viewerLogin = (page: Page, viewer: { username: string }) =>
  login(page, `${viewer.username}@example.com`, "TestPassword123!");

test.describe("perfil visual", () => {
  test.skip(!SERVICE_KEY || !USERNAME, "requiere SUPABASE_SERVICE_ROLE_KEY y TEST_USER_USERNAME");

  test("perfil propio: cabecera, cifras y muro, y la portada abre su publicación", async ({ page }) => {
    await login(page);
    await page.goto(`/u/${USERNAME}`);
    await expect(page.getByTestId("profile-hero")).toBeVisible();
    await expect(page.getByTestId("profile-figures")).toBeVisible();
    await expect(page.getByTestId("profile-wall")).toBeVisible();
    const cover = page.getByTestId("profile-wall").locator('a[href^="/post/"]').first();
    await expect(cover).toBeVisible();
    const href = await cover.getAttribute("href");
    await cover.click();
    await page.waitForURL(`**${href}`);
  });

  test("cuenta nueva y pública vista por otra: degradado sin mosaico, «—» y muro vacío", async ({ page, request }) => {
    let fresh: { id: string; username: string } | undefined;
    try {
      fresh = await createUser(request, `pvnueva${Date.now()}`.slice(0, 20), true);
      await login(page);
      await page.goto(`/u/${fresh.username}`);
      await waitForProfileSettled(page, true);
      await expect(page.getByTestId("profile-hero")).toHaveAttribute("data-mosaic", "off");
      await expect(page.getByTestId("profile-figures")).toContainText("—");
      await expect(page.getByTestId("profile-wall")).toHaveCount(0);
      await expect(page.getByTestId("profile-now")).toHaveCount(0);
      await expect(page.getByTestId("profile-year")).toHaveCount(0);
    } finally {
      if (fresh) await deleteUser(fresh.id);
    }
  });

  test("perfil privado sin permiso: aviso y ningún bloque nuevo", async ({ page, request }) => {
    let viewer: { id: string; username: string } | undefined;
    let priv: { id: string; username: string } | undefined;
    try {
      viewer = await createUser(request, `pvvis${Date.now()}`.slice(0, 20), true);
      priv = await createUser(request, `pvpriv${Date.now()}`.slice(0, 20), false);
      await viewerLogin(page, viewer);
      await page.goto(`/u/${priv.username}`);
      await expect(page.getByRole("button", { name: "Solicitar seguir" })).toBeVisible();
      await expect(page.getByTestId("profile-hero")).toHaveCount(0);
      await expect(page.getByTestId("profile-figures")).toHaveCount(0);
      await expect(page.getByTestId("profile-wall")).toHaveCount(0);
    } finally {
      if (priv) await deleteUser(priv.id);
      if (viewer) await deleteUser(viewer.id);
    }
  });

  test("seguidor aceptado de un perfil privado: ve cabecera, cifras y muro", async ({ page, request }) => {
    let viewer: { id: string; username: string } | undefined;
    let priv: { id: string; username: string } | undefined;
    try {
      viewer = await createUser(request, `pvfol${Date.now()}`.slice(0, 20), true);
      priv = await createUser(request, `pvseg${Date.now()}`.slice(0, 20), false);
      const follow = await request.post(`${SUPABASE_URL}/rest/v1/follows`, {
        headers: admin(true),
        data: { follower_id: viewer.id, followee_id: priv.id, status: "accepted" },
      });
      expect(follow.ok()).toBe(true);
      await viewerLogin(page, viewer);
      await page.goto(`/u/${priv.username}`);
      await expect(page.getByTestId("profile-hero")).toBeVisible();
      await expect(page.getByTestId("profile-figures")).toBeVisible();
      // Cuenta sin actividad: no hay muro, pero sí la pestaña (estado vacío).
      await expect(page.getByRole("heading", { name: "Sin actividad todavía" })).toBeVisible();
    } finally {
      if (priv) await deleteUser(priv.id); // el borrado en cascada retira también el follow
      if (viewer) await deleteUser(viewer.id);
    }
  });

  test("sin sesión, un perfil público se ve y no hay scroll horizontal a 390 px", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`/u/${USERNAME}`);
    await expect(page.getByTestId("profile-hero")).toBeVisible();
    await waitForProfileSettled(page, false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
});
