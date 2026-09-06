import { test, expect } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";

test("alta manual directa y cola de otro usuario usan la RPC de catálogo", async ({ page }) => {
  test.setTimeout(180_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  expect(url, "este spec escribe solo en biblioshare-dev").toBe("https://tyvzpuhxfwxrnkcpzxyg.supabase.co");
  expect(key, "se necesita la service key de desarrollo").toBeTruthy();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  async function rest(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${url}/rest/v1/${path}`, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const suffix = Date.now().toString(36);
  const directTitle = `E2E926-direct-${suffix}`;
  const pendingTitle = `E2E926-pending-${suffix}`;
  const titleFilter = `title=in.(${directTitle},${pendingTitle})`;
  await withBattleUsers(url, key, async (create) => {
    const reviewer = await create(`qa926r_${suffix}`);
    const owner = await create(`qa926o_${suffix}`);
    const ids = `(${reviewer.id},${owner.id})`;
    async function cleanup() {
      await rest(`pending_import_rows?user_id=in.${ids}`, "DELETE");
      await rest(`passes?user_id=in.${ids}`, "DELETE");
      await rest(`books?${titleFilter}`, "DELETE");
    }
    try {
      await cleanup();
      await rest(`profiles?user_id=eq.${reviewer.id}`, "PATCH", { role: "collaborator", onboarded_at: new Date().toISOString() });
      await rest(`profiles?user_id=eq.${owner.id}`, "PATCH", { onboarded_at: new Date().toISOString() });
      await rest("pending_import_rows", "POST", { user_id: owner.id, item_type: "book",
        payload: { rowNumber: 1, title: pendingTitle, author: "QA Author", year: 2000, isbn: null,
          publisher: null, pageCount: 100, status: "planned", rating: null, bookFormat: null,
          diaryDates: [], unknownStatusLabel: null } });
      await page.goto("/login");
      await page.locator('input[name="email"]').fill(reviewer.email);
      await page.locator('input[name="password"]').fill(reviewer.password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.waitForURL("/");

      await page.goto("/importar");
      await page.locator('input[type="file"]').setInputFiles({ name: "manual.csv", mimeType: "text/csv",
        buffer: Buffer.from(`Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read\n1,${directTitle},QA Author,,0,to-read,\n`) });
      await page.getByRole("button", { name: "Subir archivo", exact: true }).click();
      await page.getByRole("button", { name: "Añadir a mi biblioteca", exact: true }).click({ timeout: 90_000 });
      await expect(page.getByText(`${directTitle} — añadido`, { exact: true })).toBeVisible();

      await page.goto("/importar/pendientes");
      const form = page.locator("form").filter({ has: page.locator(`input[name="title"][value="${pendingTitle}"]`) });
      await form.getByRole("button", { name: "Añadir a la biblioteca del usuario", exact: true }).click();
      await expect(form).toHaveCount(0);
      const books = await rest(`books?select=id,title&${titleFilter}`) as Array<{ id: string; title: string }>;
      expect(books).toHaveLength(2);
      for (const [title, userId] of [[directTitle, reviewer.id], [pendingTitle, owner.id]]) {
        const book = books.find((b) => b.title === title)!;
        const passes = await rest(`passes?select=user_id,item_id&item_id=eq.${book.id}`);
        expect(passes).toEqual([{ user_id: userId, item_id: book.id }]);
      }
    } finally {
      await cleanup();
    }
  });
});
