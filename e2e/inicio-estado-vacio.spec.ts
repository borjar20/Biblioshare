import { test, expect, type Page } from "@playwright/test";

// Estados vacíos de la columna personal del Inicio (TodayBlock). Cada test crea
// un usuario DESECHABLE con la biblioteca sembrada al estado exacto y entra como
// él, así la biblioteca real de la cuenta de pruebas no se toca. Se barren los
// huérfanos por prefijo antes y después.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2ev";
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

// Usuario desechable ya onboardeado (para no caer en el asistente) y con la
// biblioteca vacía. Devuelve id + credenciales para entrar como él.
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

// Id con forma de uuid, único por ejecución (evita choques de PK en reruns
// contra libros [E2E] que quedan de una ejecución anterior — sweepDisposableUsers
// solo barre usuarios, no libros).
function e2eBookId(letter: string): string {
  const suffix = (Date.now().toString(16) + Math.random().toString(16).slice(2)).padEnd(12, "0").slice(0, 12);
  return `e2e${letter}0001-0000-4000-8000-${suffix}`;
}

// Un libro desechable + un pase del usuario en el estado dado.
async function seedBookPass(userId: string, bookId: string, status: string) {
  await rest("books", {
    method: "POST",
    body: JSON.stringify({ id: bookId, title: `[E2E] ${status} ${bookId.slice(0, 8)}`, author: "[E2E]", cover_url: COVER_URL }),
  });
  await rest("passes", {
    method: "POST",
    body: JSON.stringify({
      id: bookId, // reutilizamos el uuid del libro como uuid del pase (distinto espacio, vale)
      user_id: userId,
      item_type: "book",
      item_id: bookId,
      status,
      is_active: true,
      position: {},
      started_on: status === "planned" ? null : "2026-01-01",
      finished_on: status === "completed" ? "2026-01-02" : null,
    }),
  });
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("Inicio · estados de la columna personal", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(120_000);

  test.beforeEach(async () => {
    await sweepDisposableUsers();
  });
  test.afterEach(async () => {
    await sweepDisposableUsers();
  });

  test("estado 4: usuario sin nada ve el descubrimiento", async ({ page }) => {
    const { email } = await createOnboardedUser(`${USER_PREFIX}e${Date.now()}`.slice(0, 20));
    await loginAs(page, email);
    // Scoped al bloque de descubrimiento: la nav también trae un link "Buscar".
    const discovery = page.locator("section").filter({ hasText: /encuentra algo para disfrutar/i });
    await expect(discovery.getByRole("heading", { name: /encuentra algo para disfrutar/i })).toBeVisible();
    await expect(discovery.getByRole("link", { name: /^buscar$/i })).toBeVisible();
    await expect(discovery.getByRole("link", { name: /explorar la colección/i })).toBeVisible();
  });

  test("estado 3: solo completados ve '¿Qué empezamos?'", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}c${Date.now()}`.slice(0, 20));
    await seedBookPass(user.id, e2eBookId("c"), "completed");
    await loginAs(page, user.email);
    await expect(page.getByRole("heading", { name: /¿qué empezamos\?/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^empezar$/i }).first()).toBeVisible();
  });

  test("estado 2: con cola ve 'próxima lectura' y 'Empezar' lo pasa a en curso", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}p${Date.now()}`.slice(0, 20));
    await seedBookPass(user.id, e2eBookId("a"), "planned");
    await loginAs(page, user.email);

    await expect(page.getByRole("heading", { name: /¿qué te apetece hoy\?/i })).toBeVisible();
    await expect(page.getByText(/lo tienes guardado para más tarde/i)).toBeVisible();

    await page.getByRole("button", { name: /^empezar$/i }).click();

    // Tras empezar, el bloque pasa a "En curso" (estado 1).
    await expect(page.getByRole("heading", { name: /¿qué has disfrutado hoy\?/i })).toBeVisible({ timeout: 15_000 });
    // Y el efecto real: el pase queda in_progress.
    await expect
      .poll(async () => {
        const rows = (await (
          await rest(`passes?user_id=eq.${user.id}&status=eq.in_progress&select=id`)
        ).json()) as unknown[];
        return rows.length;
      }, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
  });

  test("estado 1: con algo en curso mantiene la UI actual", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}i${Date.now()}`.slice(0, 20));
    await seedBookPass(user.id, e2eBookId("b"), "in_progress");
    await loginAs(page, user.email);
    await expect(page.getByRole("heading", { name: /¿qué has disfrutado hoy\?/i })).toBeVisible();
    await expect(page.getByText(/^en curso$/i).first()).toBeVisible();
  });
});
