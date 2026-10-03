import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

const apiUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(apiUrl.hostname)) {
  throw new Error("#1325 requires disposable local Supabase");
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("Missing local service key");
const database = createClient(apiUrl.href, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const marker = "qa1325_profile_collection_alias";
const tables = [
  "profiles", "pet_state", "pet_battles", "passes", "pet_acorn_ledger",
  "pet_cosmetics", "pet_daily_missions", "user_celebrations",
] as const;
const actors = {
  owner: { id: "de91b63d-5d73-4ab0-97ef-277132500001", username: "qa1325_alias_owner" },
  visitor: { id: "de91b63d-5d73-4ab0-97ef-277132500002", username: "qa1325_alias_visitor" },
} as const;
type Actor = { id: string; username: string; email: string; password: string };
type Fixture = { owner: Actor; createVisitor: () => Promise<Actor> };
const labels = { book: "Libros", movie: "Películas", series: "Series", todos: "Todo" } as const;

function check<T extends { data: unknown; error: { message: string } | null }>(result: T): T["data"] {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function cleanup(info: TestInfo, phase: "before" | "after") {
  const evidence: Array<{ id: string; auth404: boolean; rows: Record<string, number> }> = [];
  for (const actor of Object.values(actors)) {
    const found = await database.auth.admin.getUserById(actor.id);
    if (found.data.user) {
      // Fixed IDs allow a later run to remove residue after an interrupted browser.
      // An account with a different marker is never adopted or deleted.
      expect(found.data.user.email, "fixture email ownership").toBe(`${actor.username}@example.test`);
      expect(found.data.user.user_metadata.qa_marker, "fixture marker ownership").toBe(marker);
      check(await database.auth.admin.deleteUser(actor.id));
    } else {
      expect(found.error?.status, "Auth lookup must return an interpretable 404").toBe(404);
    }
    const absent = await database.auth.admin.getUserById(actor.id);
    expect(absent.error?.status, "Auth account must be absent after REST cleanup").toBe(404);
    const rows: Record<string, number> = {};
    for (const table of tables) {
      const result = check(await database.from(table).select("user_id").eq("user_id", actor.id));
      expect(result, `${phase}: ${table} must contain no rows for this actor`).toEqual([]);
      rows[table] = result?.length ?? -1;
    }
    evidence.push({ id: actor.id, auth404: true, rows });
  }
  await info.attach(`cleanup-${phase}`, { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
}

async function createActor(kind: keyof typeof actors): Promise<Actor> {
  const actor = { ...actors[kind], email: `${actors[kind].username}@example.test`, password: `Qa1325!${randomUUID()}` };
  check(await database.auth.admin.createUser({
    id: actor.id, email: actor.email, password: actor.password,
    email_confirm: true, user_metadata: { qa_marker: marker },
  }));
  check(await database.from("profiles").upsert({
    user_id: actor.id, username: actor.username, is_public: true,
    onboarded_at: new Date().toISOString(), interests: ["book"],
  }));
  const profile = check(await database.from("profiles")
    .select("username, interests, onboarded_at, is_public").eq("user_id", actor.id).single());
  expect(profile?.interests, "single book interest is a seeded and read-back precondition").toEqual(["book"]);
  expect(profile?.username).toBe(actor.username);
  expect(profile?.onboarded_at).toBeTruthy();
  expect(profile?.is_public).toBe(true);
  return actor;
}

const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({}, runFixture, info) => {
    const errors: unknown[] = [];
    try {
      await cleanup(info, "before");
      const owner = await createActor("owner");
      await runFixture({ owner, createVisitor: () => createActor("visitor") });
    } catch (error) {
      errors.push(error);
    } finally {
      try { await cleanup(info, "after"); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "#1325 test/setup and REST cleanup failures");
  },
});
test.use({ trace: "off", screenshot: "off" });

async function login(page: Page, actor: Actor) {
  await page.goto("/login?next=%2Fcoleccion");
  await page.locator('input[name="email"]').fill(actor.email);
  await page.locator('input[name="password"]').fill(actor.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(url => url.pathname === "/coleccion");
  await expect(page.getByRole("heading", { name: "Mi Biblioteca", exact: true })).toBeVisible();
}

async function observeLibrary(page: Page, info: TestInfo, request: string) {
  await expect(page).toHaveURL(url => url.pathname === "/coleccion");
  await expect(page.getByRole("heading", { name: "Mi Biblioteca", exact: true })).toBeVisible();
  const field = page.locator('main form[action="/coleccion"] input[name="type"]');
  await expect(field).toHaveCount(1);
  const filters = page.getByRole("button", { name: /^Filtros/ });
  await filters.click();
  const group = page.getByRole("group", { name: "Filtros", exact: true });
  await expect(group).toBeVisible();
  const selected = await group.locator('a[aria-current="page"]').allTextContents();
  const url = new URL(page.url());
  const observation = {
    request, destination: `${url.pathname}${url.search}`, formType: await field.inputValue(),
    selected: selected.map(label => label.trim()), interests: ["book"],
  };
  await info.attach(`library-${request.replaceAll(/[^a-z0-9]/gi, "_")}`, {
    body: JSON.stringify(observation, null, 2), contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath(`library-${randomUUID()}.png`), fullPage: true });
  return { field, group };
}

for (const type of ["book", "movie", "series", "todos"] as const) {
  test(`owner alias preserves explicit type=${type} (#1325)`, async ({ page, fixture }, info) => {
    await login(page, fixture.owner);
    const directPath = `/coleccion?type=${type}`;
    await page.goto(directPath);
    const direct = await observeLibrary(page, info, directPath);
    await expect(direct.field).toHaveValue(type);
    await expect(direct.group.getByRole("link", { name: labels[type], exact: true })).toHaveAttribute("aria-current", "page");

    const aliasPath = `/u/${fixture.owner.username}?tab=coleccion&type=${type}`;
    await page.goto(aliasPath);
    const alias = await observeLibrary(page, info, aliasPath);
    // Record the visible state before the failing assertion, preserving the native red.
    await expect(alias.field).toHaveValue(type);
    await expect(page).toHaveURL(url => url.pathname === "/coleccion" && url.searchParams.get("type") === type);
    await expect(alias.group.getByRole("link", { name: labels[type], exact: true })).toHaveAttribute("aria-current", "page");
  });
}

for (const type of [undefined, "invalid"] as const) {
  test(`owner alias ${type ?? "without type"} keeps the Library default`, async ({ page, fixture }, info) => {
    await login(page, fixture.owner);
    await page.goto("/coleccion");
    const direct = await observeLibrary(page, info, "/coleccion");
    await expect(direct.field).toHaveValue("book");
    const aliasPath = `/u/${fixture.owner.username}?tab=coleccion${type ? `&type=${type}` : ""}`;
    await page.goto(aliasPath);
    const alias = await observeLibrary(page, info, aliasPath);
    await expect(alias.field).toHaveValue("book");
    await expect(page).toHaveURL(url => url.pathname === "/coleccion" && url.search === "");
  });
}

for (const visitor of ["anonymous", "authenticated"] as const) {
  test(`${visitor} visitor stays on the target profile collection`, async ({ page, fixture }, info) => {
    if (visitor === "authenticated") await login(page, await fixture.createVisitor());
    const path = `/u/${fixture.owner.username}?tab=coleccion&type=movie`;
    await page.goto(path);
    await expect(page).toHaveURL(url => url.pathname === `/u/${fixture.owner.username}` && url.search === "?tab=coleccion&type=movie");
    await expect(page.locator(`main a[href="${path}"]`).filter({ hasText: labels.movie })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mi Biblioteca", exact: true })).toHaveCount(0);
    const url = new URL(page.url());
    await info.attach(`visitor-${visitor}`, {
      body: JSON.stringify({ path: `${url.pathname}${url.search}`, libraryRedirect: false }), contentType: "application/json",
    });
  });
}
