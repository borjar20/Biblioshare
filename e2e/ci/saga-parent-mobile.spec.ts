import { randomUUID } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") {
  throw new Error("#1311 requires disposable local Supabase");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing local service key");
const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actorId = randomUUID();
const marker = `qa1311_${actorId.replaceAll("-", "").slice(0, 20)}`;
const nameMarker = `QA1311 ${actorId.replaceAll("-", "").match(/.{1,8}/g)!.join(" ")}`;
const credentials = { email: `${marker}@example.test`, password: `Qa1311!${randomUUID()}` };
const fixtures = [{ width: 320, height: 844 }, { width: 1280, height: 900 }].map(viewport => ({
  viewport,
  childName: `${nameMarker} Hija ${viewport.width}`,
  parentName: `${nameMarker} Universo ${viewport.width}`,
}));
const ownedNames = fixtures.flatMap(fixture => [fixture.childName, fixture.parentName]);
const actorTables = [
  "profiles", "pet_state", "pet_battles", "passes", "pet_acorn_ledger",
  "pet_cosmetics", "pet_daily_missions", "user_celebrations",
];

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

async function cleanSagas() {
  const cleanup: Array<{ name: string; ids: string[]; remaining: number }> = [];
  const failures: string[] = [];
  // Exact names include this invocation's random marker. Recover a successful
  // insert even if the browser never received its redirect/action response.
  for (const name of ownedNames) {
    try {
      const rows = check(await database.from("sagas").select("id,name,source").eq("name", name));
      if (!rows) throw new Error("Missing saga ownership response");
      for (const row of rows) {
        expect(row.source, "Refusing cleanup of a non-manual saga").toBe("manual");
        const children = check(await database.from("sagas").select("name").eq("parent_saga_id", row.id));
        if (!children) throw new Error("Missing child ownership response");
        expect(children.every(child => ownedNames.includes(child.name)),
          "Refusing to detach an unrelated child during cleanup").toBe(true);
        check(await database.from("sagas").delete().eq("id", row.id).eq("name", name).eq("source", "manual"));
      }
      const remaining = check(await database.from("sagas").select("id").eq("name", name));
      if (!remaining) throw new Error("Missing saga cleanup response");
      cleanup.push({ name, ids: rows.map(row => row.id), remaining: remaining.length });
      expect(remaining).toEqual([]);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { cleanup, failures };
}

async function auditActor() {
  const counts: Array<{ table: string; count: number }> = [];
  for (const table of actorTables) {
    const rows = check(await database.from(table).select("user_id").eq("user_id", actorId));
    if (!rows) throw new Error(`Missing cleanup response for ${table}`);
    counts.push({ table, count: rows.length });
    expect(rows, `${table}: only this run's actor must be absent`).toEqual([]);
  }
  return counts;
}

// Keep credentials out of traces and automatic login screenshots. All explicit
// screenshots below show the editor after the login form has gone away.
test.use({ trace: "off", screenshot: "off", deviceScaleFactor: 1 });

test.beforeAll(async ({}, info) => {
  if (process.env.QA1311_FIXTURE_REGISTRY) {
    await appendFile(process.env.QA1311_FIXTURE_REGISTRY, JSON.stringify({ marker, actorId, fixtures }) + "\n");
  }
  expect((await database.auth.admin.getUserById(actorId)).error?.status).toBe(404);
  const actor = await auditActor();
  const sagas = await cleanSagas();
  await writeFile(info.outputPath("cleanup-before.json"), JSON.stringify({ marker, actorId, actor, ...sagas }, null, 2));
  expect(sagas.failures).toEqual([]);
  const created = await database.auth.admin.createUser({
    id: actorId, ...credentials, email_confirm: true, user_metadata: { qa_marker: marker },
  });
  if (created.error) throw created.error;
  expect(created.data.user?.id).toBe(actorId);
  check(await database.from("profiles").upsert({
    user_id: actorId, username: marker, role: "collaborator",
    onboarded_at: new Date().toISOString(), interests: ["book"],
  }));
});

test.afterAll(async ({}, info) => {
  const sagas = await cleanSagas();
  let auth404 = false;
  let actor: Array<{ table: string; count: number }> = [];
  const failures = [...sagas.failures];
  try {
    const existing = await database.auth.admin.getUserById(actorId);
    if (existing.error?.status !== 404) {
      if (existing.error) throw existing.error;
      expect(existing.data.user?.email === credentials.email && existing.data.user?.user_metadata.qa_marker === marker,
        "Refusing cleanup of an unrelated actor").toBe(true);
      const deleted = await database.auth.admin.deleteUser(actorId);
      if (deleted.error) throw deleted.error;
    }
    auth404 = (await database.auth.admin.getUserById(actorId)).error?.status === 404;
    expect(auth404).toBe(true);
    actor = await auditActor();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  const evidence = JSON.stringify({ marker, actorId, auth404, actor, cleanup: sagas.cleanup, failures }, null, 2);
  await info.attach("cleanup", { body: evidence, contentType: "application/json" });
  await writeFile(info.outputPath("cleanup-after.json"), evidence);
  if (process.env.QA1311_OUT) await writeFile(join(process.env.QA1311_OUT, `cleanup-${actorId}.json`), evidence);
  expect(failures).toEqual([]);
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()
      && new URL(page.url()).pathname !== "/login"
      && await page.locator('input[name="email"], input[name="password"]').count() === 0) {
    await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true });
  }
});

async function assertGeometry(page: Page, info: TestInfo, stage: string, creating: boolean) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const geometry = await page.locator("#universo").evaluate((section, creating) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const input = section.querySelector<HTMLInputElement>('input[maxlength="120"]');
    const button = creating
      ? input?.parentElement?.querySelector<HTMLButtonElement>("button")
      : section.querySelector<HTMLButtonElement>("button");
    const row = creating ? input?.parentElement : button?.parentElement;
    if (!row || !button || (creating && !input)) throw new Error("Missing actual parent editor controls");
    const range = document.createRange();
    range.selectNodeContents(button);
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusStyle = focused ? getComputedStyle(focused) : null;
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
      section: box(section),
      sectionOverflow: getComputedStyle(section).overflowX,
      row: box(row), rowWidth: row.clientWidth, rowScrollWidth: row.scrollWidth,
      rowOverflow: getComputedStyle(row).overflowX,
      controls: [input, button].filter((control): control is HTMLInputElement | HTMLButtonElement => control !== null).map(box),
      buttonText: button.textContent?.trim(),
      buttonLines: [...range.getClientRects()].filter(line => line.width > 0).map(line => ({ left: line.left, right: line.right })),
      button: box(button),
      focused: focused?.tagName,
      focusVisible: focused?.matches(":focus-visible") ?? false,
      outlineStyle: focusStyle?.outlineStyle,
      outlineWidth: focusStyle?.outlineWidth,
      boxShadow: focusStyle?.boxShadow,
    };
  }, creating);
  await info.attach(`parent-${stage}-geometry`, { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
  expect(geometry.documentClientWidth).toBe(geometry.viewport);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.documentClientWidth);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.documentClientWidth);
  expect(geometry.rowScrollWidth).toBeLessThanOrEqual(geometry.rowWidth);
  expect(["hidden", "clip"]).not.toContain(geometry.sectionOverflow);
  expect(["hidden", "clip"]).not.toContain(geometry.rowOverflow);
  for (const control of geometry.controls) {
    expect(control.width).toBeGreaterThan(0);
    expect(control.left).toBeGreaterThanOrEqual(geometry.row.left - 0.5);
    expect(control.right).toBeLessThanOrEqual(geometry.row.right + 0.5);
    expect(control.right).toBeLessThanOrEqual(geometry.documentClientWidth + 0.5);
  }
  for (const line of geometry.buttonLines) {
    expect(line.left).toBeGreaterThanOrEqual(geometry.button.left - 0.5);
    expect(line.right).toBeLessThanOrEqual(geometry.button.right + 0.5);
  }
  if (stage.endsWith("focused")) {
    expect(geometry.focusVisible).toBe(true);
    expect((geometry.outlineStyle !== "none" && Number.parseFloat(geometry.outlineWidth ?? "0") > 0)
      || (geometry.boxShadow !== undefined && geometry.boxShadow !== "none"), "Keyboard focus remains visible").toBe(true);
  }
}

for (const fixture of fixtures) {
  test.describe(`${fixture.viewport.width}px parent creation`, () => {
    test.use({ viewport: fixture.viewport });
    test("controls fit and keyboard creation persists after reload", async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/login?next=/sagas/nueva");
      await page.locator('input[name="email"]').fill(credentials.email);
      await page.locator('input[name="password"]').fill(credentials.password);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/sagas\/nueva$/);
      await expect(page.getByRole("heading", { name: "Nueva saga", level: 1, exact: true })).toBeVisible();
      await page.locator('input[name="name"]').fill(fixture.childName);
      await page.getByRole("button", { name: "Crear saga", exact: true }).click();
      await expect(page).toHaveURL(/\/saga\/[0-9a-f-]{36}$/);
      const childId = new URL(page.url()).pathname.split("/").at(-1)!;
      await page.goto(`/saga/${childId}/editar`);
      await expect(page).toHaveURL(new RegExp(`/saga/${childId}/editar$`));
      await expect(page.locator('input[name="name"]')).toHaveValue(fixture.childName);
      const section = page.locator("#universo");
      const input = section.getByPlaceholder("o crea un universo nuevo…", { exact: true });
      const create = section.getByRole("button", { name: "Crear y anidar", exact: true });
      await expect(input).toBeVisible();
      await expect(input).toHaveValue("");
      await expect(create).toBeDisabled();
      const before = check(await database.from("sagas").select("source,parent_saga_id").eq("id", childId).single());
      expect(before).toEqual({ source: "manual", parent_saga_id: null });
      await assertGeometry(page, info, "empty", true);
      await expect(input).toHaveAccessibleName("o crea un universo nuevo…");
      await input.fill("   ");
      await expect(create).toBeDisabled();
      await input.fill(fixture.parentName);
      await expect(create).toBeEnabled();
      await input.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(input).toBeFocused();
      await assertGeometry(page, info, "input-focused", true);
      await page.keyboard.press("Tab");
      await expect(create).toBeFocused();
      await assertGeometry(page, info, "button-focused", true);
      await page.screenshot({ path: info.outputPath("parent-button-focused.png"), fullPage: true });
      await page.keyboard.press("Enter");
      await expect(section.getByText(`Parte de ${fixture.parentName}`, { exact: true })).toBeVisible();
      await expect(section.getByRole("button", { name: "Quitar del universo", exact: true })).toBeEnabled();
      const parent = check(await database.from("sagas").select("id,name,source").eq("name", fixture.parentName).single());
      if (!parent) throw new Error("Created parent not found in local database");
      expect(parent.source).toBe("manual");
      expect(parent.id).not.toBe(childId);
      for (const stage of ["created", "reloaded"]) {
        if (stage === "reloaded") await page.reload();
        await expect(page).toHaveURL(new RegExp(`/saga/${childId}/editar$`));
        await expect(page.locator('input[name="name"]')).toHaveValue(fixture.childName);
        await expect(section.getByText(`Parte de ${fixture.parentName}`, { exact: true })).toBeVisible();
        await expect(input).toHaveCount(0);
        await expect(create).toHaveCount(0);
        const relation = check(await database.from("sagas").select("id,parent_saga_id").eq("id", childId).single());
        expect(relation).toEqual({ id: childId, parent_saga_id: parent.id });
        await info.attach(`relation-${stage}`, { body: JSON.stringify({ marker, parent, relation }, null, 2), contentType: "application/json" });
        await assertGeometry(page, info, stage, false);
      }
      await page.screenshot({ path: info.outputPath("parent-after-reload.png"), fullPage: true });
      expect(errors).toEqual([]);
    });
  });
}
