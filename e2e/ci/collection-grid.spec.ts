import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test as base, type Locator, type TestInfo } from "@playwright/test";

const apiUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(apiUrl.hostname)) {
  throw new Error("Collection grid requires disposable local Supabase");
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("Missing disposable local service key");
const database = createClient(apiUrl.href, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actorId = "66274600-c011-4e70-a390-000000000001";
const username = "qa662746_collection_grid";
const email = `${username}@example.test`;
const marker = "qa662746_collection_grid";
const ownedTables = [
  "profiles", "collections", "passes", "pet_state", "pet_battles",
  "pet_acorn_ledger", "pet_cosmetics", "pet_daily_missions", "user_celebrations",
] as const;

function checked<T extends { data: unknown; error: { message: string } | null }>(result: T): T["data"] {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function cleanup(info: TestInfo, phase: "before" | "after") {
  const found = await database.auth.admin.getUserById(actorId);
  if (found.data.user) {
    expect(found.data.user.email, "owned fixture email").toBe(email);
    expect(found.data.user.user_metadata.qa_marker, "owned fixture marker").toBe(marker);
    checked(await database.auth.admin.deleteUser(actorId));
  } else {
    expect(found.error?.status, "interpretable Auth absence").toBe(404);
  }
  expect((await database.auth.admin.getUserById(actorId)).error?.status).toBe(404);
  const rows: Record<string, number> = {};
  for (const table of ownedTables) {
    const remaining = checked(await database.from(table).select("user_id").eq("user_id", actorId));
    expect(remaining, `${phase}: ${table} must contain no fixture rows`).toEqual([]);
    rows[table] = remaining?.length ?? -1;
  }
  await info.attach(`cleanup-${phase}`, {
    body: JSON.stringify({ actorId, auth404: true, rows }, null, 2), contentType: "application/json",
  });
}

const test = base.extend<{ fixture: { password: string; names: string[] } }>({
  fixture: async ({}, runFixture, info) => {
    const errors: unknown[] = [];
    try {
      await cleanup(info, "before");
      const password = `Qa662746!${randomUUID()}`;
      checked(await database.auth.admin.createUser({
        id: actorId, email, password, email_confirm: true, user_metadata: { qa_marker: marker },
      }));
      checked(await database.from("profiles").upsert({
        user_id: actorId, username, onboarded_at: new Date().toISOString(), interests: ["book"],
      }));
      const names = ["Zafiro", "Bruma", "Almendra", "Delta", "Cobre"].map(name => `${name} qa662746`);
      for (const name of names) {
        checked(await database.from("collections").insert({ user_id: actorId, name }));
      }
      const seeded = checked(await database.from("collections").select("name").eq("user_id", actorId));
      expect(seeded?.map(row => row.name).sort()).toEqual([...names].sort());
      await runFixture({ password, names });
    } catch (error) {
      errors.push(error);
    } finally {
      try { await cleanup(info, "after"); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Collection grid/setup/cleanup failures");
  },
});
test.use({ trace: "off", screenshot: "off" });

async function geometry(cards: Locator) {
  return cards.evaluateAll(elements => {
    const rects = elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width) };
    });
    return { rects, firstRow: rects.filter(rect => rect.top === rects[0]?.top).length };
  });
}

test("Colecciones usa 4/3/2 columnas; cabecera, búsqueda y orden siguen en cliente (#662/#746)", async ({ page, fixture }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login?next=%2Fcoleccion%3Ftab%3Dcolecciones");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(url => url.pathname === "/coleccion" && url.searchParams.get("tab") === "colecciones");

  const cards = page.locator('main a[href^="/coleccion/c/"]');
  await expect(cards).toHaveCount(5);
  const create = page.getByRole("button", { name: /Nueva colección/ });
  await expect(create).toHaveCount(1);
  await expect(create).toBeVisible();
  expect(await create.evaluate(element => element.closest(".grid") === null), "create button is outside the card grid").toBe(true);

  const samples = [];
  for (const [width, columns] of [[1440, 4], [1200, 3], [390, 2]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await geometry(cards)).firstRow).toBe(columns);
    samples.push({ width, expectedColumns: columns, ...await geometry(cards) });
    await page.screenshot({ path: info.outputPath(`collection-grid-${width}.png`), fullPage: true });
  }
  await info.attach("collection-grid-geometry", {
    body: JSON.stringify(samples, null, 2), contentType: "application/json",
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  const url = page.url();
  let documentNavigations = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations++;
  });
  const search = page.locator('input[name="coleccion-q"]');
  await search.fill(fixture.names[1]);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(fixture.names[1]);
  await search.fill("no-existe-qa662746");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("Ninguna colección coincide con la búsqueda.", { exact: true })).toBeVisible();
  await search.fill("qa662746");
  await expect(cards).toHaveCount(5);
  await page.getByRole("button", { name: "Nombre", exact: true }).click();
  const order = ["Almendra", "Bruma", "Cobre", "Delta", "Zafiro"];
  for (const [index, name] of order.entries()) await expect(cards.nth(index)).toContainText(name);
  expect(page.url()).toBe(url);
  expect(documentNavigations).toBe(0);
  await info.attach("collection-client-controls", {
    body: JSON.stringify({ filteredCount: 1, noMatches: true, order, documentNavigations, urlUnchanged: true }),
    contentType: "application/json",
  });
});
