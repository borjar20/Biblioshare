import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") {
  throw new Error("#1295 requires disposable local Supabase");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing local service key");

const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actorId = randomUUID();
const marker = `qa1295_${actorId.replaceAll("-", "").slice(0, 20)}`;
const credentials = { email: `${marker}@example.test`, password: `Qa1295!${randomUUID()}` };
const tables = [
  "profiles", "pet_state", "pet_battles", "passes", "pet_acorn_ledger",
  "pet_cosmetics", "pet_daily_missions", "user_celebrations",
];
const types = [
  { type: "book", label: "Libros" },
  { type: "movie", label: "Películas" },
  { type: "series", label: "Series" },
] as const;
const surfaces = [
  { path: "/buscar", title: "Buscar", input: 'input[name="q"]' },
  { path: "/buscar/manual", title: "Añadir manualmente", input: 'input[name="title"]' },
] as const;
type Surface = (typeof surfaces)[number];

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}
async function auditRows() {
  const counts: Array<{ table: string; count: number }> = [];
  for (const table of tables) {
    const rows = check(await database.from(table).select("user_id").eq("user_id", actorId));
    if (!rows) throw new Error(`Missing cleanup response for ${table}`);
    counts.push({ table, count: rows.length });
    expect(rows, `${table}: only this run's actor must be absent`).toEqual([]);
  }
  return counts;
}

// Browser artifacts must not retain login credentials. A failure screenshot is
// captured below only after leaving login; geometry attachments contain no HTML.
test.use({ trace: "off", screenshot: "off", deviceScaleFactor: 1 });

test.beforeAll(async ({}, info) => {
  // This UUID belongs to this invocation. Refuse collisions before REST cleanup
  // so an existing account can never be adopted or deleted by this suite.
  expect((await database.auth.admin.getUserById(actorId)).error?.status).toBe(404);
  const cleanup = await auditRows();
  for (const table of tables) check(await database.from(table).delete().eq("user_id", actorId));
  await writeFile(info.outputPath("cleanup-before.json"), JSON.stringify({ actorId, auth404: true, cleanup }, null, 2));

  const created = await database.auth.admin.createUser({
    id: actorId, ...credentials, email_confirm: true, user_metadata: { qa_marker: marker },
  });
  if (created.error) throw created.error;
  expect(created.data.user?.id, "Auth must use the owned UUID").toBe(actorId);
  check(await database.from("profiles").upsert({
    user_id: actorId, username: marker, role: "collaborator",
    onboarded_at: new Date().toISOString(), interests: ["book"],
  }));
  const profile = check(await database.from("profiles").select("role,onboarded_at").eq("user_id", actorId).single());
  expect(profile?.role).toBe("collaborator");
  expect(profile?.onboarded_at).toBeTruthy();
});

test.afterAll(async ({}, info) => {
  let auth404 = false;
  let cleanup: Array<{ table: string; count: number }> = [];
  try {
    const actor = await database.auth.admin.getUserById(actorId);
    if (actor.error?.status !== 404) {
      if (actor.error) throw actor.error;
      expect(actor.data.user?.email === credentials.email && actor.data.user?.user_metadata.qa_marker === marker,
        "Refusing cleanup of an unrelated actor").toBe(true);
      const deleted = await database.auth.admin.deleteUser(actorId);
      if (deleted.error) throw deleted.error;
    }
    auth404 = (await database.auth.admin.getUserById(actorId)).error?.status === 404;
    expect(auth404).toBe(true);
    cleanup = await auditRows();
  } finally {
    const evidence = JSON.stringify({ marker, actorId, auth404, cleanup }, null, 2);
    await writeFile(info.outputPath("cleanup-after.json"), evidence);
    if (process.env.QA1295_OUT) await writeFile(`${process.env.QA1295_OUT}/durable-cleanup-${actorId}.json`, evidence);
  }
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()
      && new URL(page.url()).pathname !== "/login"
      && await page.locator('input[name="email"], input[name="password"]').count() === 0) {
    await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true });
  }
});

async function assertSurface(page: Page, surface: Surface, active: string) {
  await expect(page).toHaveURL(new RegExp(`${surface.path.replaceAll("/", "\\/")}\\?type=${active}$`));
  await expect(page.getByRole("heading", { name: surface.title, level: 1, exact: true })).toBeVisible();
  await expect(page.locator(surface.input)).toBeVisible();
  await expect(page.locator("form").filter({ has: page.locator(surface.input) })).toHaveCount(1);
  if (surface.path === "/buscar") {
    await expect(page.locator(surface.input)).toHaveValue("");
    await expect(page.locator('input[name="type"]')).toHaveValue(active);
  } else {
    await expect(page.locator('input[name="creator"]')).toBeVisible();
  }
}

async function assertPills(page: Page, info: TestInfo, surface: Surface, active: string) {
  const main = page.getByRole("main");
  const pills = types.map(({ label }) => main.getByRole("link", { name: label, exact: true }));
  for (let index = 0; index < pills.length; index++) {
    await expect(pills[index]).toBeVisible();
    await expect(pills[index]).toHaveAttribute("href", `${surface.path}?type=${types[index].type}`);
  }
  const container = pills[0].locator("..");
  await expect(container.locator("a")).toHaveCount(3);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const geometry = await container.evaluate(element => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      fontStatus: document.fonts.status,
      container: box(element),
      pills: [...element.querySelectorAll("a")].map(link => ({
        ...box(link), href: link.getAttribute("href"), text: link.textContent?.trim(),
        background: getComputedStyle(link).backgroundColor,
        font: getComputedStyle(link).fontFamily,
      })),
    };
  });
  await info.attach(`${surface.path.replaceAll("/", "_")}-${active}-geometry`, {
    body: JSON.stringify(geometry, null, 2), contentType: "application/json",
  });
  expect(geometry.fontStatus).toBe("loaded");
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.container.left).toBeGreaterThanOrEqual(-0.5);
  expect(geometry.container.right).toBeLessThanOrEqual(geometry.viewport + 0.5);
  for (const pill of geometry.pills) {
    expect(pill.width).toBeGreaterThan(0);
    expect(pill.height).toBeGreaterThan(0);
    expect(pill.left, `${pill.text}: left edge stays in its container`).toBeGreaterThanOrEqual(geometry.container.left - 0.5);
    expect(pill.right, `${pill.text}: right edge stays in its container`).toBeLessThanOrEqual(geometry.container.right + 0.5);
    expect(pill.top).toBeGreaterThanOrEqual(geometry.container.top - 0.5);
    expect(pill.bottom).toBeLessThanOrEqual(geometry.container.bottom + 0.5);
  }
  // Check the rendered selection, independent of Tailwind class names.
  const selected = geometry.pills.find(pill => pill.href === `${surface.path}?type=${active}`);
  expect(selected).toBeDefined();
  for (const pill of geometry.pills.filter(pill => pill !== selected)) {
    expect(selected!.background).not.toBe(pill.background);
  }
  return pills;
}

for (const viewport of [{ width: 320, height: 844 }, { width: 1280, height: 900 }]) {
  test.describe(`${viewport.width}px type filters`, () => {
    test.use({ viewport });
    for (const surface of surfaces) {
      test(`${surface.path}: fit, keyboard access and selected destination`, async ({ page }, info) => {
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`/login?next=${encodeURIComponent(`${surface.path}?type=book`)}`);
        await page.locator('input[name="email"]').fill(credentials.email);
        await page.locator('input[name="password"]').fill(credentials.password);
        await page.locator('button[type="submit"]').click();
        await assertSurface(page, surface, "book");
        const [books, movies, series] = await assertPills(page, info, surface, "book");

        await books.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(books).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(movies).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(series).toBeFocused();
        await page.keyboard.press("Enter");
        await assertSurface(page, surface, "series");
        const [, selectedMovies, selectedSeries] = await assertPills(page, info, surface, "series");

        await selectedSeries.focus();
        await page.keyboard.press("Shift+Tab");
        await expect(selectedMovies).toBeFocused();
        await page.keyboard.press("Enter");
        await assertSurface(page, surface, "movie");
        await assertPills(page, info, surface, "movie");
        expect(errors).toEqual([]);
      });
    }
  });
}
