import { test, expect, type Page } from "@playwright/test";

// Desde la ficha de un libro se tiene que poder llegar a la ficha de su autor.
// Spec: docs/superpowers/specs/2026-08-13-libro-enlace-autor-design.md
//
// Se siembra el caso entero (persona SIN tmdb_id = autora de libro, libro y
// crédito `author`) para no llamar a Open Library ni depender de la base de dev.
// Sembrar el crédito además hace que `ensureItemEnriched` no tenga nada que
// hacer al abrir la ficha: el caso es determinista.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2la";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

test.use({ serviceWorkers: "block" });

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

async function del(path: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "DELETE", headers: adminHeaders() });
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

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("ficha de libro · acceso al autor", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(180_000);

  test("el autor de la ficha lleva a su ficha de persona", async ({ page }) => {
    await sweepDisposableUsers();

    const user = await createOnboardedUser(`${USER_PREFIX}${Date.now()}`.slice(0, 20));
    const personId = crypto.randomUUID();
    const bookId = crypto.randomUUID();
    const authorName = `[E2E] Autora ${personId.slice(0, 8)}`;

    try {
      await rest("people", {
        method: "POST",
        body: JSON.stringify({ id: personId, name: authorName }),
      });
      await rest("books", {
        method: "POST",
        body: JSON.stringify({
          id: bookId,
          title: `[E2E] libro ${bookId.slice(0, 8)}`,
          author: authorName,
          cover_url: COVER_URL,
          published_year: 2019,
          total_pages: 300,
        }),
      });
      await rest("credits", {
        method: "POST",
        body: JSON.stringify({
          item_type: "book",
          item_id: bookId,
          person_id: personId,
          role: "author",
        }),
      });

      await loginAs(page, user.email);
      await page.setViewportSize({ width: 1700, height: 1000 });
      await page.goto(`/libro/${bookId}`);

      // La ficha de la obra se pinta dos veces (móvil y PC) desde el mismo
      // array de filas; a 1700px la visible es la de la columna lateral.
      const enlaceAutor = page.getByRole("link", { name: authorName }).first();
      await expect(enlaceAutor).toBeVisible();
      await expect(enlaceAutor).toHaveAttribute("href", `/persona/${personId}`);

      // Y de verdad lleva a la ficha de persona, no solo apunta a ella.
      await enlaceAutor.click();
      await page.waitForURL(`**/persona/${personId}`);
      await expect(page.getByRole("heading", { name: authorName })).toBeVisible();
    } finally {
      await del(`credits?item_id=eq.${bookId}`);
      await del(`books?id=eq.${bookId}`);
      await del(`people?id=eq.${personId}`);
      await sweepDisposableUsers();
    }
  });
});
