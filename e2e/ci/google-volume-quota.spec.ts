import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test as base, type Locator, type Page, type TestInfo } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (API_URL !== "http://127.0.0.1:54321") throw new Error("#1237 requires disposable local Supabase");
const namespace = process.env.GOOGLE_VOLUME_QUOTA_NAMESPACE ?? "";
const registry = process.env.GOOGLE_VOLUME_QUOTA_FIXTURES;
if (!/^[0-9]{10,}$/.test(namespace) || !registry) throw new Error("Missing #1237 provider fixture metadata");
const { projectId } = JSON.parse(readFileSync(".superpowers/supabase-local/bootstrap.json", "utf8")) as { projectId: string };
if (!/^biblioshare-local-[a-f0-9]{8}$/.test(projectId)) throw new Error("Requires a generated disposable local project");
const database = createClient(API_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const messages = {
  googleBooksCreate: "Has alcanzado el límite horario de nuevas altas desde Google Books. Puedes abrir o añadir títulos que ya existen.",
  catalogRequest: "Has hecho demasiadas peticiones en poco tiempo. Espera un momento antes de volver a intentarlo.",
};
function resolveOpenCatalogItemActionId() {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
    node?: Record<string, { exportedName?: string; filename?: string; workers?: Record<string, unknown> }>;
  };
  const matches = Object.entries(manifest.node ?? {}).filter(([, action]) => action.exportedName === "openCatalogItem"
    && action.filename === "src/app/buscar/actions.ts" && Object.hasOwn(action.workers ?? {}, "app/buscar/page"));
  if (matches.length !== 1) throw new Error("Expected one openCatalogItem server action for /buscar in the installed build");
  return matches[0][0];
}
const openCatalogItemActionId = resolveOpenCatalogItemActionId();
type Operation = "catalog_google_volume_create" | "catalog_request";
type Book = { id: string; google_books_volume_id: string };
type Quota = { operation: Operation; used: number; window_started_at: string };
type Fixture = { namespace: string; isbn: string; volumeId: string; title: string };
type Actor = {
  id: string; email: string; password: string; prefix: string;
  client: SupabaseClient; fixtures: Fixture[]; volumes: string[];
  observations: unknown[];
};
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
function sql(query: string): string {
  return execFileSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: query, encoding: "utf8", windowsHide: true, timeout: 15_000 }).trim();
}
function makeFixture(token: string, number: number): Fixture {
  const suffix = ((Number.parseInt(token.slice(0, 8), 16) + number) % 100_000).toString().padStart(5, "0");
  const firstTwelve = `978${namespace.slice(-4)}${suffix}`;
  const sum = [...firstTwelve].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  const isbn = firstTwelve + (10 - sum % 10) % 10;
  return { namespace, isbn, volumeId: `gbquota1237_${namespace}_${token}_isbn${number}`, title: `QA1237 ${token} ${number}` };
}
async function state(actor: Actor, stage: string) {
  const books = check(await database.from("books").select("id,google_books_volume_id").in("google_books_volume_id", actor.volumes).order("id")) as Book[];
  const passes = check(await database.from("passes").select("id").eq("user_id", actor.id));
  const quotas = JSON.parse(sql(`select coalesce(json_agg(json_build_object('operation',operation,'used',used,'window_started_at',window_started_at) order by operation),'[]'::json) from private.request_quotas where user_id='${actor.id}'::uuid;`)) as Quota[];
  const snapshot = { stage, actorId: actor.id, books, passCount: passes?.length ?? 0, quotas };
  actor.observations.push(snapshot);
  return snapshot;
}
function used(snapshot: Awaited<ReturnType<typeof state>>, operation: Operation) {
  return snapshot.quotas.find(row => row.operation === operation)?.used ?? 0;
}
async function register(actor: Actor, volumeId: string): Promise<string> {
  const id = check(await actor.client.rpc("register_catalog_item_by_volume", { p_volume_id: volumeId })) as string;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}
async function consume(actor: Actor, operation: Operation, cost: number) {
  expect(check(await actor.client.rpc("consume_request_quota", { p_operation: operation, p_cost: cost }))).toBe(true);
}
function expire(actor: Actor, operation: Operation, interval: "2 hours" | "2 minutes") {
  sql(`update private.request_quotas set window_started_at=statement_timestamp()-interval '${interval}' where user_id='${actor.id}'::uuid and operation='${operation}';`);
}
async function cleanup(actor: Actor, info: TestInfo) {
  const books = check(await database.from("books").select("id").in("google_books_volume_id", actor.volumes)) as Array<{ id: string }>;
  const ids = books.map(book => book.id);
  check(await database.from("passes").delete().eq("user_id", actor.id));
  if (ids.length) {
    expect(check(await database.from("passes").select("id").eq("item_type", "book").in("item_id", ids))).toEqual([]);
    check(await database.from("books").delete().in("id", ids));
  }
  const signedOut = await actor.client.auth.signOut();
  if (signedOut.error) throw signedOut.error;
  const existing = await database.auth.admin.getUserById(actor.id);
  if (existing.error || existing.data.user?.email !== actor.email) throw new Error("Refusing cleanup of an unrelated user");
  const deleted = await database.auth.admin.deleteUser(actor.id);
  if (deleted.error) throw deleted.error;
  const auth404 = (await database.auth.admin.getUserById(actor.id)).error?.status === 404;
  expect(auth404).toBe(true);
  const tables: Array<{ table: string; count: number }> = [];
  for (const table of ["profiles", "pet_state", "pet_battles", "passes", "pet_acorn_ledger", "pet_cosmetics", "pet_daily_missions", "user_celebrations"]) {
    const rows = check(await database.from(table).select("user_id").eq("user_id", actor.id));
    tables.push({ table, count: rows?.length ?? 0 }); expect(rows).toEqual([]);
  }
  const idList = ids.map(id => `'${id}'::uuid`).join(",") || "null::uuid";
  const privateRows = JSON.parse(sql(`select json_build_object('quotas',(select count(*) from private.request_quotas where user_id='${actor.id}'::uuid),'editionKeys',(select count(*) from private.book_edition_isbn_keys where book_id in (${idList})),'editions',(select count(*) from public.book_editions where book_id in (${idList})));`)) as Record<string, number>;
  expect(Object.values(privateRows)).toEqual([0, 0, 0]);
  expect(check(await database.from("books").select("id").in("google_books_volume_id", actor.volumes))).toEqual([]);
  await info.attach("quota-cleanup", { body: JSON.stringify({ actorId: actor.id, auth404, tables, ...privateRows, deletedBookIds: ids }), contentType: "application/json" });
}

const test = base.extend<{ actor: Actor }>({
  actor: async ({}, runCase, info) => {
    const token = randomUUID().replaceAll("-", "");
    const prefix = `gbquota1237_${namespace}_${token}_`;
    const fixtures = [makeFixture(token, 0), makeFixture(token, 1)];
    const actor: Actor = {
      id: "", email: `gbquota1237_${token}@example.test`, password: randomUUID() + "aA1!", prefix,
      client: createClient(API_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
      fixtures, volumes: [...fixtures.map(fixture => fixture.volumeId), ...Array.from({ length: 59 }, (_, index) => prefix + index)], observations: [],
    };
    try {
      // Fresh UUID ownership: refuse adoption, then perform the before-cleanup.
      expect(check(await database.from("books").select("id").in("google_books_volume_id", actor.volumes))).toEqual([]);
      check(await database.from("books").delete().in("google_books_volume_id", actor.volumes));
      const created = await database.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error("Could not create the disposable actor");
      actor.id = created.data.user.id;
      check(await database.from("profiles").upsert({ user_id: actor.id, username: `gbq_${token.slice(0, 20)}`, onboarded_at: new Date().toISOString(), interests: ["book"] }));
      const signedIn = await actor.client.auth.signInWithPassword({ email: actor.email, password: actor.password });
      if (signedIn.error || !signedIn.data.session) throw new Error("Could not sign in the disposable actor");
      for (const fixture of fixtures) appendFileSync(registry!, JSON.stringify(fixture) + "\n");
      const before = await state(actor, "own-empty-precondition");
      expect(before.books).toEqual([]); expect(before.passCount).toBe(0); expect(before.quotas).toEqual([]);
      await runCase(actor);
    } finally {
      try { if (actor.id) await cleanup(actor, info); }
      finally { await info.attach("quota-state", { body: JSON.stringify(actor.observations), contentType: "application/json" }); }
    }
  },
});
// Auth credentials and cookies must never enter retained Playwright traces.
test.use({ trace: "off" });

async function login(page: Page, actor: Actor) {
  await page.goto(`/login?next=${encodeURIComponent("/buscar?type=book")}`);
  await page.locator('input[name="email"]').fill(actor.email);
  await page.locator('input[name="password"]').fill(actor.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/buscar\?type=book$/);
  await expect(page.locator('input[name="q"]')).toBeVisible();
}
async function search(page: Page, fixture: Fixture) {
  await page.locator('input[name="q"]').fill(fixture.isbn);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`q=${fixture.isbn}`));
  const card = page.getByTestId("search-result-card");
  await expect(card).toHaveCount(1); await expect(card).toBeVisible();
  return card;
}
async function noOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(bounds.document).toBeLessThanOrEqual(bounds.width); expect(bounds.body).toBeLessThanOrEqual(bounds.width);
}
// Read the same browser Response as React, without asking CDP to retain its
// resource body. The clone is observed in parallel; the original stays intact.
function installActionResponseCapture({ expectedReason, actionId }: { expectedReason: keyof typeof messages; actionId: string }) {
  const originalFetch = window.fetch;
  const observation = {
    postCount: 0, complete: false, status: null as number | null,
    error: null as "RATE_LIMIT" | null, reason: null as keyof typeof messages | null,
    captureError: null as "ACTION_FETCH_FAILED" | "RSC_BODY_READ_FAILED" | null,
  };
  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), location.href);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const matches = url.origin === location.origin && url.pathname === "/buscar"
      && method === "POST" && headers.get("next-action") === actionId;
    if (matches) observation.postCount++;
    let response: Response;
    try {
      response = await originalFetch.call(window, input, init);
    } catch (error) {
      if (matches) { observation.captureError = "ACTION_FETCH_FAILED"; observation.complete = true; }
      throw error;
    }
    if (matches) {
      observation.status = response.status;
      void (async () => {
        try {
          const body = await response.clone().text();
          observation.error = body.includes("RATE_LIMIT") ? "RATE_LIMIT" : null;
          observation.reason = body.includes(expectedReason) ? expectedReason : null;
        } catch {
          observation.captureError = "RSC_BODY_READ_FAILED";
        } finally {
          observation.complete = true;
        }
      })();
    }
    return response;
  };
  return { snapshot: () => ({ ...observation }), restore: () => { window.fetch = originalFetch; } };
}
async function rejected(page: Page, card: Locator, reason: keyof typeof messages, actor: Actor) {
  const beforeUrl = page.url();
  const capture = await page.evaluateHandle(installActionResponseCapture, { expectedReason: reason, actionId: openCatalogItemActionId });
  try {
    const responsePromise = page.waitForResponse(response => response.request().method() === "POST"
      && response.request().headers()["next-action"] === openCatalogItemActionId && new URL(response.url()).pathname === "/buscar");
    await card.click();
    const response = await responsePromise;
    await expect.poll(() => capture.evaluate(observer => observer.snapshot().complete)).toBe(true);
    const captured = await capture.evaluate(observer => observer.snapshot());
    expect(captured.captureError).toBeNull(); expect(captured.postCount).toBe(1);
    expect(captured.status).toBe(response.status());
    const observation = { stage: "real-action-rejection", reason, status: captured.status, rateLimit: captured.error === "RATE_LIMIT", expectedReason: captured.reason === reason };
    actor.observations.push(observation);
    expect(observation).toMatchObject({ status: 200, rateLimit: true, expectedReason: true });
    const notice = page.getByRole("alert").filter({ hasText: messages[reason] });
    await expect(notice).toHaveCount(1); await expect(notice).toHaveText(messages[reason]);
    await expect(card).toBeEnabled(); expect(page.url()).toBe(beforeUrl);
    expect(await card.getAttribute("aria-describedby")).toBe(await notice.getAttribute("id"));
    const sameCell = await card.evaluate((element, noticeId) => element.parentElement?.querySelector('[role="alert"]')?.id === noticeId, await notice.getAttribute("id"));
    expect(sameCell).toBe(true);
    const cardBox = await card.boundingBox(), noticeBox = await notice.boundingBox();
    expect(cardBox).not.toBeNull(); expect(noticeBox).not.toBeNull();
    expect(Math.abs(noticeBox!.x - cardBox!.x)).toBeLessThanOrEqual(1);
    expect(noticeBox!.y).toBeGreaterThanOrEqual(cardBox!.y + cardBox!.height);
    await noOverflow(page);
  } finally {
    try { await capture.evaluate(observer => observer.restore()); }
    finally { await capture.dispose(); }
  }
}
async function opened(page: Page, card: Locator, actor: Actor, fixture: Fixture) {
  await card.click();
  await expect(page).toHaveURL(/\/libro\/[0-9a-f-]{36}$/);
  await expect(page.locator("h1").first()).toBeVisible();
  const snapshot = await state(actor, "real-catalog-row-opened");
  const book = snapshot.books.find(row => row.google_books_volume_id === fixture.volumeId);
  expect(book).toBeDefined(); expect(new URL(page.url()).pathname).toBe(`/libro/${book!.id}`);
  expect(snapshot.passCount).toBe(0); await noOverflow(page);
  return { snapshot, book: book! };
}

for (const width of [320, 1280]) {
  test.describe(`${width}px Google Books creation quota`, () => {
    test.use({ viewport: { width, height: width === 320 ? 844 : 900 } });
    test("new creation rejects, retries after the hour, and reuses existing books at both caps", async ({ page, actor }) => {
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      await login(page, actor);
      const stalePage = await page.context().newPage();
      stalePage.on("pageerror", error => errors.push(error.message));
      try {
        await stalePage.goto("/buscar?type=book");
        const staleCard = await search(stalePage, actor.fixtures[1]);
        expect(await staleCard.evaluate(element => element.tagName)).toBe("BUTTON");
        const ids = [];
        for (let index = 0; index < 59; index++) ids.push(await register(actor, actor.prefix + index));
        const existingId = await register(actor, actor.fixtures[1].volumeId); ids.push(existingId);
        expect(new Set(ids).size).toBe(60);
        const capped = await state(actor, "sixty-real-authenticated-creations");
        expect(capped.books).toHaveLength(60); expect(used(capped, "catalog_google_volume_create")).toBe(60); expect(used(capped, "catalog_request")).toBe(0);
        const card = await search(page, actor.fixtures[0]);
        await expect(card).toContainText(actor.fixtures[0].title);
        await rejected(page, card, "googleBooksCreate", actor);
        const denied = await state(actor, "sixty-first-creation-rejected");
        expect(denied.books).toHaveLength(60); expect(denied.books.some(book => book.google_books_volume_id === actor.fixtures[0].volumeId)).toBe(false);
        expect(denied.passCount).toBe(0); expect(used(denied, "catalog_google_volume_create")).toBe(60); expect(used(denied, "catalog_request")).toBe(1);
        expire(actor, "catalog_google_volume_create", "2 hours");
        const retried = await opened(page, card, actor, actor.fixtures[0]);
        expect(retried.snapshot.books).toHaveLength(61); expect(used(retried.snapshot, "catalog_google_volume_create")).toBe(1); expect(used(retried.snapshot, "catalog_request")).toBe(2);

        // Exhaust only the actor's new hourly bucket via the real quota RPC;
        // the 60 actual creations and rejected 61st were proved above.
        await consume(actor, "catalog_google_volume_create", 59);
        const reused = await opened(stalePage, staleCard, actor, actor.fixtures[1]);
        expect(reused.book.id).toBe(existingId); expect(reused.snapshot.books).toHaveLength(61);
        expect(used(reused.snapshot, "catalog_google_volume_create")).toBe(60); expect(used(reused.snapshot, "catalog_request")).toBe(3);
        check(await database.from("book_editions").insert({ book_id: existingId, label: "Edición sintética QA1237", isbn: actor.fixtures[1].isbn, created_by: actor.id }));
        await consume(actor, "catalog_request", 57);
        await stalePage.goto("/buscar?type=book");
        const existingCard = await search(stalePage, actor.fixtures[1]);
        expect(await existingCard.evaluate(element => element.tagName)).toBe("A");
        await expect(existingCard).toHaveAttribute("href", `/libro/${existingId}`);
        const beforeLink = await state(actor, "existing-link-at-both-caps");
        await opened(stalePage, existingCard, actor, actor.fixtures[1]);
        const afterLink = await state(actor, "existing-link-does-not-consume-quota");
        expect(afterLink.books).toEqual(beforeLink.books); expect(afterLink.quotas).toEqual(beforeLink.quotas);
        expect(used(afterLink, "catalog_google_volume_create")).toBe(60); expect(used(afterLink, "catalog_request")).toBe(60);
        expect(errors).toEqual([]);
      } finally { await stalePage.close(); }
    });

    test("request-minute rejection has distinct feedback and the same result can retry", async ({ page, actor }) => {
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      await login(page, actor);
      const card = await search(page, actor.fixtures[0]);
      await expect(card).toContainText(actor.fixtures[0].title);
      const searched = await state(actor, "search-is-read-only");
      expect(searched.books).toEqual([]); expect(searched.quotas).toEqual([]);
      await consume(actor, "catalog_request", 60);
      await rejected(page, card, "catalogRequest", actor);
      const denied = await state(actor, "request-minute-rejected-no-write");
      expect(denied.books).toEqual([]); expect(denied.passCount).toBe(0);
      expect(used(denied, "catalog_request")).toBe(61); expect(used(denied, "catalog_google_volume_create")).toBe(0);
      expire(actor, "catalog_request", "2 minutes");
      const retried = await opened(page, card, actor, actor.fixtures[0]);
      expect(retried.snapshot.books).toHaveLength(1); expect(used(retried.snapshot, "catalog_google_volume_create")).toBe(1); expect(used(retried.snapshot, "catalog_request")).toBe(1);
      expect(errors).toEqual([]);
    });
  });
}
