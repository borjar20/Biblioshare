import { test, expect, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";
import { playToReveal } from "./support/sorteo";

// Spec 2026-11-06: desde el Inicio en escritorio la partida se abre en el sitio
// y, al empezar algo, sigues en el Inicio con eso en «Continúa». Usuario
// DESECHABLE con un pase en curso y tres pendientes (el trigger «¿Cuál toca?»
// exige ambas cosas), así la cuenta de pruebas no se toca.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2es";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  return res;
}

async function sweepDisposableUsers() {
  const rows = (await (await rest(`profiles?username=like.${USER_PREFIX}*&select=user_id`)).json()) as Array<{ user_id: string }>;
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, { method: "DELETE", headers: adminHeaders() });
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

function e2eBookId(letter: string): string {
  const suffix = (Date.now().toString(16) + Math.random().toString(16).slice(2)).padEnd(12, "0").slice(0, 12);
  return `e2e${letter}0001-0000-4000-8000-${suffix}`;
}

// Título explícito por libro: hay que distinguir el sorteado de los demás.
async function seedBookPass(userId: string, bookId: string, status: string, title: string) {
  await rest("books", {
    method: "POST",
    body: JSON.stringify({ id: bookId, title, author: "[E2E]", cover_url: COVER_URL }),
  });
  await rest("passes", {
    method: "POST",
    body: JSON.stringify({
      id: bookId,
      user_id: userId,
      item_type: "book",
      item_id: bookId,
      status,
      is_active: true,
      position: {},
      started_on: status === "planned" ? null : "2026-01-01",
      finished_on: null,
    }),
  });
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await submitLogin(page, email, PASSWORD);
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

test.use({ contextOptions: { reducedMotion: "reduce" }, viewport: { width: 1280, height: 900 } });

test.describe("Inicio · sacar un lomo en el sitio", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(120_000);

  test.beforeEach(async () => {
    await sweepDisposableUsers();
  });
  test.afterEach(async () => {
    await sweepDisposableUsers();
  });

  test("«¿Cuál toca?» abre la partida en el sitio y al empezar sigues en /", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}${Date.now()}`.slice(0, 20));
    await seedBookPass(user.id, e2eBookId("a"), "in_progress", "[E2E] Lomo en curso");
    const planned = [
      { id: e2eBookId("b"), title: "[E2E] Lomo pendiente uno" },
      { id: e2eBookId("c"), title: "[E2E] Lomo pendiente dos" },
      { id: e2eBookId("d"), title: "[E2E] Lomo pendiente tres" },
    ];
    for (const b of planned) await seedBookPass(user.id, b.id, "planned", b.title);
    await loginAs(page, user.email);

    await page.getByRole("button", { name: /¿Cuál toca\?/ }).click();
    const { stage, cta } = await playToReveal(page);
    const title = (await stage.getByRole("heading", { level: 3 }).textContent())!.trim();
    const winner = planned.find((b) => b.title === title);
    expect(winner, `el ganador «${title}» es uno de los pendientes sembrados`).toBeDefined();

    await cta.click();
    await expect(stage).toBeHidden({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/$/);

    // Prueba real: el pase del ganador pasa a en curso.
    await expect
      .poll(async () => {
        const rows = (await (
          await rest(`passes?user_id=eq.${user.id}&item_id=eq.${winner!.id}&status=eq.in_progress&select=id`)
        ).json()) as unknown[];
        return rows.length;
      }, { timeout: 15_000 })
      .toBe(1);
    const inProgress = (await (await rest(`passes?user_id=eq.${user.id}&status=eq.in_progress&select=id`)).json()) as unknown[];
    expect(inProgress).toHaveLength(2);

    // UI: el título sigue en el Inicio y ya no está en «Para más tarde» (no hay una
    // región accesible estable para «Continúa», así que se prueba por exclusión).
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.locator("a.later-item").filter({ hasText: title })).toHaveCount(0);
  });
});
