import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const namespace = process.env.DETAIL_NOTES_NAMESPACE ?? "";

if (!/^[0-9]{10,}$/.test(namespace)) {
  throw new Error("DETAIL_NOTES_NAMESPACE must be numeric with at least 10 digits");
}

const runId = namespace.slice(-10);
const CASES = [
  { id: `75400000-0000-4000-8000-${runId}01`, key: `OL754${namespace}01W`, label: "stable" },
  { id: `75400000-0000-4000-8000-${runId}02`, key: `OL754${namespace}02W`, label: "abandon" },
] as const;
type Fixture = (typeof CASES)[number];

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
}
async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}/rest/v1/${path}`, { ...init, headers: { ...adminHeaders(), ...init.headers } });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${response.status}`);
  return response;
}
async function rows<T>(path: string): Promise<T[]> {
  return (await (await rest(path)).json()) as T[];
}
async function assertAbsent(path: string, label: string) {
  if ((await rows<unknown>(path)).length) throw new Error(`${label} already exists; refusing to adopt it`);
}
function shellTitle(fixture: Fixture) { return `QA754 ${namespace} ${fixture.label} shell`; }
function hydratedTitle(fixture: Fixture) { return `QA754 ${namespace} ${fixture.label} hydrated`; }
function bookPath(fixture: Fixture, select = "id,openlibrary_work_key,title") {
  return `books?${new URLSearchParams({ id: `eq.${fixture.id}`, openlibrary_work_key: `eq.${fixture.key}`, select })}`;
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/");
}
async function waitForHydration() {
  await expect.poll(async () => {
    const ids = CASES.map((fixture) => fixture.id).join(",");
    const hydrated = await rows<{ id: string; hydrated_at: string | null }>(`books?id=in.(${ids})&select=id,hydrated_at`);
    return hydrated.length === CASES.length && hydrated.every((book) => book.hydrated_at !== null);
  }, { timeout: 30_000, intervals: [200, 400, 800], message: "the two owned #754 books did not finish after() hydration" }).toBe(true);
}

test.describe.serial("#754 NotesSection streaming", () => {
  test.setTimeout(90_000);

  test("private notes stay private, render during hydration, and survive an early leave", async ({ page }, testInfo) => {
    if (new URL(API_URL).hostname !== "127.0.0.1") throw new Error("Requires disposable local Supabase");

    const unique = randomUUID().replaceAll("-", "");
    const email = `notes754_${unique}@example.test`;
    const password = "Notes754LocalOnly!";
    const noteBodies = new Map(CASES.map((fixture) => [fixture.id, `QA754 private note ${fixture.label} ${unique}`]));
    const browserErrors: string[] = [];
    const evidence: Record<string, unknown> = { namespace, private: false, stable: false, abandon: false };
    const ownedBooks: Fixture[] = [];
    const ownedPasses: Array<{ id: string; itemId: string }> = [];
    const ownedNotes: Fixture[] = [];
    let userId: string | null = null;
    let ownsProfile = false;

    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

    try {
      for (const fixture of CASES) {
        await assertAbsent(`books?id=eq.${fixture.id}&select=id`, `book ${fixture.id}`);
        await assertAbsent(`books?openlibrary_work_key=eq.${encodeURIComponent(fixture.key)}&select=id`, `work key ${fixture.key}`);
        const response = await rest("books", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ id: fixture.id, title: shellTitle(fixture), author: "QA754 local fixture", openlibrary_work_key: fixture.key, hydrated_at: null }),
        });
        const [book] = (await response.json()) as Array<{ id: string; openlibrary_work_key: string; title: string; hydrated_at: string | null }>;
        expect(book).toMatchObject({ id: fixture.id, openlibrary_work_key: fixture.key, title: shellTitle(fixture), hydrated_at: null });
        ownedBooks.push(fixture);
      }

      const createdUser = await fetch(`${API_URL}/auth/v1/admin/users`, {
        method: "POST", headers: adminHeaders(), body: JSON.stringify({ email, password, email_confirm: true }),
      });
      expect(createdUser.ok).toBe(true);
      userId = (await createdUser.json() as { id: string }).id;
      await rest("profiles", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, username: `notes754_${unique.slice(0, 14)}`, is_public: false, onboarded_at: new Date().toISOString() }),
      });
      ownsProfile = true;

      for (const fixture of ownedBooks) {
        const passResponse = await rest("passes", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ user_id: userId, item_type: "book", item_id: fixture.id, status: "planned", is_active: true, is_public: false }),
        });
        const [pass] = (await passResponse.json()) as Array<{ id: string; user_id: string; item_id: string }>;
        expect(pass).toMatchObject({ user_id: userId, item_id: fixture.id });
        ownedPasses.push({ id: pass.id, itemId: fixture.id });

        const body = noteBodies.get(fixture.id)!;
        const noteResponse = await rest("notes", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ user_id: userId, item_type: "book", item_id: fixture.id, kind: "note", body, position: { page: 1 }, is_public: false, is_spoiler: false, is_favorite: false, meta: {} }),
        });
        const [note] = (await noteResponse.json()) as Array<{ user_id: string; item_id: string; body: string; is_public: boolean }>;
        expect(note).toMatchObject({ user_id: userId, item_id: fixture.id, body, is_public: false });
        ownedNotes.push(fixture);
      }

      // Local Next lacks this hosted asset. Only this exact URL is masked; CI blocks service workers.
      await page.route("http://127.0.0.1:3000/_vercel/speed-insights/script.js", (route) =>
        route.fulfill({ status: 200, contentType: "application/javascript", body: ";" }),
      );

      await test.step("privacy: anonymous access cannot read the private note", async () => {
        const anonymous = await fetch(`${API_URL}/rest/v1/notes?item_id=eq.${CASES[0].id}&select=id`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        });
        expect(anonymous.ok).toBe(true);
        expect(await anonymous.json()).toEqual([]);
        evidence.private = true;
      });

      await login(page, email, password);

      await test.step("stable reader: the owner sees the private body during hydration", async () => {
        // The exact body, not merely the NotesSection heading, proves its query.
        await page.goto(`/libro/${CASES[0].id}?tab=log`);
        await expect(page.getByText(noteBodies.get(CASES[0].id)!)).toBeVisible({ timeout: 30_000 });
        evidence.stable = true;
      });

      await test.step("abandonment: leave after commit while Tabs remains delayed", async () => {
        await page.goto(`/libro/${CASES[1].id}`, { waitUntil: "commit" });
        await expect(page.getByText(shellTitle(CASES[1])).first()).toBeVisible({ timeout: 15_000 });
        await page.goto("/coleccion");
        await expect(page).toHaveURL(/\/coleccion/);
        evidence.abandon = true;
      });

      await waitForHydration();
      expect(browserErrors, browserErrors.join("\n")).toEqual([]);
    } finally {
      const cleanupErrors: unknown[] = [];
      const healthPath = testInfo.outputPath("browser-health.json");
      await writeFile(healthPath, JSON.stringify({ browserErrors, evidence }, null, 2));
      await testInfo.attach("browser-health", { path: healthPath, contentType: "application/json" });

      if (userId) for (const fixture of ownedNotes) {
        const body = noteBodies.get(fixture.id)!;
        const path = `notes?user_id=eq.${userId}&item_id=eq.${fixture.id}&body=eq.${encodeURIComponent(body)}`;
        try {
          expect(await rows<{ user_id: string; item_id: string; body: string }>(`${path}&select=user_id,item_id,body`))
            .toEqual([{ user_id: userId, item_id: fixture.id, body }]);
          await rest(path, { method: "DELETE" });
          await assertAbsent(`${path}&select=id`, `cleanup note ${fixture.id}`);
        } catch (error) { cleanupErrors.push(error); }
      }

      for (const pass of ownedPasses) {
        const path = `passes?id=eq.${pass.id}&user_id=eq.${userId}&item_id=eq.${pass.itemId}`;
        try {
          expect(await rows<{ id: string; user_id: string; item_id: string }>(`${path}&select=id,user_id,item_id`))
            .toEqual([{ id: pass.id, user_id: userId, item_id: pass.itemId }]);
          await rest(path, { method: "DELETE" });
          await assertAbsent(`${path}&select=id`, `cleanup pass ${pass.id}`);
        } catch (error) { cleanupErrors.push(error); }
      }

      for (const fixture of ownedBooks) {
        try {
          const owned = await rows<{ id: string; openlibrary_work_key: string; title: string }>(bookPath(fixture));
          expect(owned).toHaveLength(1);
          expect(owned[0]).toMatchObject({ id: fixture.id, openlibrary_work_key: fixture.key });
          expect([shellTitle(fixture), hydratedTitle(fixture)]).toContain(owned[0].title);
          await rest(bookPath(fixture), { method: "DELETE" });
          await assertAbsent(bookPath(fixture, "id"), `cleanup book ${fixture.id}`);
        } catch (error) { cleanupErrors.push(error); }
      }

      if (userId && ownsProfile) {
        const path = `profiles?user_id=eq.${userId}`;
        try {
          expect(await rows<{ user_id: string }>(`${path}&select=user_id`)).toEqual([{ user_id: userId }]);
          await rest(path, { method: "DELETE" });
          await assertAbsent(`${path}&select=user_id`, `cleanup profile ${userId}`);
        } catch (error) { cleanupErrors.push(error); }
      }

      if (userId) {
        const deleted = await fetch(`${API_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders() });
        if (!deleted.ok) cleanupErrors.push(new Error(`cleanup user ${userId}: HTTP ${deleted.status}`));
      }
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "detail-notes fixture cleanup failed");
    }
  });
});
