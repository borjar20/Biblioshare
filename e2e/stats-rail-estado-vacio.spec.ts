import { test, expect, type Page } from "@playwright/test";

// Estados de la columna de estadísticas del Inicio (StatsRail): frío → bienvenida
// (sin 0s); con datos → cada bloque aparece a su umbral. Cada test crea un usuario
// DESECHABLE onboardeado, siembra por REST, entra como él y comprueba el aside.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2ws";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

async function sweepDisposableUsers() {
  const rows = (await (
    await rest(`profiles?username=like.${USER_PREFIX}*&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  }
}

async function createOnboardedUser(username: string): Promise<{ id: string; email: string }> {
  const email = `${username}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin/users: ${res.status} — ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      username,
      display_name: username,
      is_public: false,
      onboarded_at: new Date().toISOString(),
    }),
  });
  return { id: user.id, email };
}

// UUID v4 válido con sufijo aleatorio: sin colisiones entre reruns.
function uuid(prefix4: string): string {
  const hex = "0123456789abcdef";
  let tail = "";
  // 12 hex del último bloque, variando por reloj para no colisionar.
  const seed = `${prefix4}${Math.floor(performance.now())}`;
  for (let i = 0; i < 12; i++) tail += hex[(seed.charCodeAt(i % seed.length) + i) % 16];
  return `${prefix4.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${tail}`;
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("Inicio · estados de la columna de estadísticas", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await sweepDisposableUsers();
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  test.afterEach(async () => {
    await sweepDisposableUsers();
  });

  test("frío: usuario sin datos ve la bienvenida y NO ceros", async ({ page }) => {
    const { email } = await createOnboardedUser(`${USER_PREFIX}f${Date.now()}`.slice(0, 20));
    await loginAs(page, email);
    const aside = page.locator('aside[data-area="stats"]');
    await expect(aside.getByText(/aquí verás cómo vas/i)).toBeVisible();
    await expect(aside.getByRole("link", { name: /fijar una meta 2026/i })).toBeVisible();
    // Sin gráficos vacíos: ni "esta semana" ni "Tu 2026" en frío.
    await expect(aside.getByRole("heading", { name: /esta semana/i })).toHaveCount(0);
    await expect(aside.getByText(/^tu 2026$/i)).toHaveCount(0);
  });

  test("año: una peli completada este año enciende 'Tu 2026' (semana sigue oculta)", async ({
    page,
  }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}y${Date.now()}`.slice(0, 20));
    const movieId = uuid("e2ec");
    await rest("movies", {
      method: "POST",
      body: JSON.stringify({ id: movieId, title: `[E2E] peli ${movieId.slice(0, 8)}`, cover_url: COVER_URL }),
    });
    const today = new Date().toISOString().slice(0, 10);
    await rest("passes", {
      method: "POST",
      body: JSON.stringify({
        id: movieId,
        user_id: user.id,
        item_type: "movie",
        item_id: movieId,
        status: "completed",
        is_active: true,
        position: {},
        started_on: today,
        finished_on: today,
      }),
    });
    await loginAs(page, user.email);
    const aside = page.locator('aside[data-area="stats"]');
    await expect(aside.getByText(/^tu 2026$/i)).toBeVisible();
    // Sin sesión de lectura, la semana no aparece; y ya no hay bienvenida.
    await expect(aside.getByRole("heading", { name: /esta semana/i })).toHaveCount(0);
    await expect(aside.getByText(/aquí verás cómo vas/i)).toHaveCount(0);
  });

  test("semana: una sesión de lectura hoy enciende 'Lectura esta semana'", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}w${Date.now()}`.slice(0, 20));
    const bookId = uuid("e2eb");
    await rest("books", {
      method: "POST",
      body: JSON.stringify({ id: bookId, title: `[E2E] libro ${bookId.slice(0, 8)}`, author: "[E2E]", cover_url: COVER_URL }),
    });
    await rest("passes", {
      method: "POST",
      body: JSON.stringify({
        id: bookId,
        user_id: user.id,
        item_type: "book",
        item_id: bookId,
        status: "in_progress",
        is_active: true,
        position: {},
        started_on: new Date().toISOString().slice(0, 10),
      }),
    });
    await rest("progress_sessions", {
      method: "POST",
      body: JSON.stringify({
        user_id: user.id,
        pass_id: bookId,
        session_date: new Date().toISOString().slice(0, 10),
        duration_minutes: 30,
        position: {},
      }),
    });
    await loginAs(page, user.email);
    const aside = page.locator('aside[data-area="stats"]');
    await expect(aside.getByRole("heading", { name: /esta semana/i })).toBeVisible();
    await expect(aside.getByText(/aquí verás cómo vas/i)).toHaveCount(0);
  });
});
