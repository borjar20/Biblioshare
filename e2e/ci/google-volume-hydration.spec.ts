import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const namespace = process.env.GOOGLE_VOLUME_HYDRATION_NAMESPACE ?? "";
const registry = process.env.GOOGLE_VOLUME_HYDRATION_FIXTURES ?? "";
const providerLog = process.env.GOOGLE_VOLUME_HYDRATION_LOG ?? "";
if (api !== "http://127.0.0.1:54321" || !process.env.SUPABASE_SERVICE_ROLE_KEY || !anonKey) {
  throw new Error("#1290 requires disposable local Supabase and its local service/anonymous keys");
}
if (!/^[0-9]{10,}$/.test(namespace) || !registry || !providerLog || registry === providerLog) {
  throw new Error("#1290 requires a dedicated namespace, fixture registry and provider log");
}
const database = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const marker = `qa1290_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
const { projectId } = JSON.parse(readFileSync(".superpowers/supabase-local/bootstrap.json", "utf8")) as { projectId: string };
if (!/^biblioshare-local-[a-f0-9]{8}$/.test(projectId)) throw new Error("#1290 requires a generated disposable local project");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPlEAAAAASUVORK5CYII=", "base64");
const actorTables = ["profiles", "pet_state", "pet_battles", "passes", "pet_acorn_ledger", "pet_cosmetics", "pet_daily_missions", "user_celebrations"];
const bookColumns = "id,google_books_volume_id,openlibrary_work_key,isbn,title,author,synopsis,cover_url,total_pages,hydrated_at,repr_meta,wikidata_id,published_year,genres";

type Fixture = {
  namespace: string; marker: string; label: string; volumeId: string; bookId: string; isbn: string;
  searchTitle: string; title: string; authors: string[]; synopsis: string; cover: string;
  language: string; pages: number; delayMs: number; mode: "ok" | "http503"; revision: number;
  alternateTitles: string[]; alternateAuthors: string[];
  workKey?: string; openLibraryTitle?: string; openLibrarySynopsis?: string;
};
type Book = {
  id: string; google_books_volume_id: string | null; openlibrary_work_key: string | null; isbn: string | null;
  title: string | null; author: string | null; synopsis: string | null; cover_url: string | null;
  total_pages: number | null; hydrated_at: string | null; repr_meta: Record<string, unknown> | null;
  wikidata_id: string | null; published_year: number | null; genres: string[] | null;
};
type ProviderEvent = {
  marker: string; volumeId: string; kind: string; status?: number; revision: number;
  bookId?: string; counter?: number; phase?: "start" | "complete" | "error";
};
type CaseContext = { page: Page; info: TestInfo; fixture: Fixture; actorId: string; actionId: string };

function fixture(label: string, index: number): Fixture {
  const isbnBase = `978${namespace.slice(-7)}${String(index).padStart(2, "0")}`;
  const checksum = [...isbnBase].reduce((sum, digit, place) => sum + Number(digit) * (place % 2 ? 3 : 1), 0);
  const volumeId = `gbhydrate1290_${namespace}_${marker}_${label}`;
  return {
    namespace, marker, label, volumeId, bookId: randomUUID(), isbn: isbnBase + (10 - checksum % 10) % 10,
    searchTitle: `Resultado ISBN ${marker} ${label}`, title: `Ficha del volumen ${marker} ${label}`,
    authors: [`Autor canónico ${label}`, "Segundo autor no elegido"],
    synopsis: `Sinopsis canónica del volumen ${marker} ${label}.`,
    cover: `https://books.google.com/books/content?id=${volumeId}&img=1&zoom=1&edge=curl`,
    language: "es-ES", pages: 321, delayMs: 3500, mode: "ok", revision: 1,
    alternateTitles: [], alternateAuthors: [],
  };
}
function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}
function privateAudit(actorId: string, bookIds: string[]) {
  for (const id of [actorId, ...bookIds]) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
      throw new Error("Private cleanup audit requires exact owned UUIDs");
    }
  }
  const ids = bookIds.map(id => `'${id}'::uuid`).join(",") || "null::uuid";
  const query = `select json_build_object('quotas',(select count(*) from private.request_quotas where user_id='${actorId}'::uuid),
    'editionKeys',(select count(*) from private.book_edition_isbn_keys where book_id in (${ids})),
    'editions',(select count(*) from public.book_editions where book_id in (${ids})));`;
  const result = execFileSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: query, encoding: "utf8", windowsHide: true, timeout: 15_000 });
  return JSON.parse(result.trim()) as { quotas: number; editionKeys: number; editions: number };
}
function readRegistry(): Fixture[] {
  return readFileSync(registry, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Fixture);
}
function writeRegistry(records: Fixture[]) {
  // Atomic replacement keeps the running provider from observing a truncated
  // registry and forwarding an owned synthetic request to the real service.
  const temporary = `${registry}.${marker}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, records.map(row => JSON.stringify(row)).join("\n") + (records.length ? "\n" : ""));
    renameSync(temporary, registry);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
function registerFixture(owned: Fixture) {
  const records = readRegistry();
  expect(records.some(row => row.volumeId === owned.volumeId && row.marker !== marker), "Refusing another run's fixture").toBe(false);
  writeRegistry([...records.filter(row => row.volumeId !== owned.volumeId), owned]);
}
function events(owned: Fixture): ProviderEvent[] {
  if (!existsSync(providerLog)) return [];
  return readFileSync(providerLog, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as ProviderEvent)
    .filter(row => row.marker === marker && row.volumeId === owned.volumeId);
}
async function books(owned: Fixture): Promise<Book[]> {
  return check(await database.from("books").select(bookColumns).eq("google_books_volume_id", owned.volumeId)) as Book[];
}
async function book(owned: Fixture): Promise<Book> {
  const rows = await books(owned);
  expect(rows, "Exactly one book must keep the owned Google identity").toHaveLength(1);
  return rows[0];
}
function cover(owned: Fixture) {
  const url = new URL(owned.cover); url.searchParams.set("zoom", "2"); url.searchParams.delete("edge");
  return url.toString();
}
async function snapshot(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: JSON.stringify(value, null, 2), contentType: "application/json" });
}
function resolveActionId() {
  // Read only the matching public endpoint. Never persist/dump the manifest,
  // which also contains the Server Action encryption key.
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
    node?: Record<string, { exportedName?: string; filename?: string; workers?: Record<string, unknown> }>;
  };
  const matches = Object.entries(manifest.node ?? {}).filter(([, action]) => action.exportedName === "openCatalogItem"
    && action.filename === "src/app/buscar/actions.ts" && action.workers?.["app/buscar/page"]);
  expect(matches, "Fresh build must identify precisely one real openCatalogItem action").toHaveLength(1);
  expect(matches[0][0]).toMatch(/^[0-9a-f]{40,42}$/);
  return matches[0][0];
}

test.use({ viewport: { width: 375, height: 844 }, deviceScaleFactor: 1, trace: "off", screenshot: "off" });
test.afterAll(() => {
  // Other workers' registrations are preserved, even after a failed test.
  writeRegistry(readRegistry().filter(row => row.marker !== marker));
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed() && new URL(page.url()).pathname !== "/login"
    && await page.locator('input[name="email"], input[name="password"]').count() === 0) {
    await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true });
  }
});

async function ownCase(page: Page, info: TestInfo, owned: Fixture, run: (context: CaseContext) => Promise<void>) {
  const actorId = randomUUID();
  const credentials = { email: `qa1290_${actorId}@example.test`, password: `Qa1290!${randomUUID()}` };
  const actorSession = createClient(api!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const errors: string[] = [];
  const ownedBookIds: string[] = [];
  let ownsVolume = false, attemptedActor = false;
  const cleanup: Record<string, unknown> = { actorId, marker, volumeId: owned.volumeId };
  page.on("pageerror", error => errors.push(error.message));
  try {
    expect(await books(owned)).toEqual([]);
    expect(check(await database.from("books").select("id").eq("id", owned.bookId))).toEqual([]);
    ownsVolume = true;
    check(await database.from("books").delete().eq("google_books_volume_id", owned.volumeId));
    expect((await database.auth.admin.getUserById(actorId)).error?.status).toBe(404);
    const before: Array<{ table: string; count: number }> = [];
    for (const table of actorTables) {
      const rows = check(await database.from(table).select("user_id").eq("user_id", actorId));
      expect(rows).toEqual([]);
      before.push({ table, count: rows?.length ?? -1 });
      check(await database.from(table).delete().eq("user_id", actorId));
    }
    const privateBefore = privateAudit(actorId, [owned.bookId]);
    expect(privateBefore).toEqual({ quotas: 0, editionKeys: 0, editions: 0 });
    await snapshot(info, "cleanup-before", { actorId, auth404: true, books: 0, tables: before, privateRows: privateBefore });
    registerFixture(owned);
    attemptedActor = true;
    const created = await database.auth.admin.createUser({ id: actorId, ...credentials, email_confirm: true, user_metadata: { qa_marker: marker } });
    if (created.error) throw created.error;
    expect(created.data.user?.id).toBe(actorId);
    check(await database.from("profiles").upsert({ user_id: actorId,
      username: `qa1290_${actorId.replaceAll("-", "").slice(0, 20)}`, role: "user",
      onboarded_at: new Date().toISOString(), interests: ["book"] }));
    await page.route("https://books.google.com/books/content?**", async route => {
      if (new URL(route.request().url()).searchParams.get("id") === owned.volumeId) {
        await route.fulfill({ status: 200, contentType: "image/png", body: png });
      } else await route.continue();
    });
    await page.goto("/login?next=%2Fbuscar%3Ftype%3Dbook");
    await page.locator('input[name="email"]').fill(credentials.email);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/buscar\?type=book$/);
    await expect(page.locator('input[name="q"]')).toBeVisible();
    const actionId = resolveActionId();
    const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
    await run({ page, info, fixture: owned, actorId, actionId });
    expect(readFileSync(".next/BUILD_ID", "utf8").trim()).toBe(buildId);
    expect(errors).toEqual([]);
  } finally {
    const failures: unknown[] = [];
    try {
      await snapshot(info, "provider-requests", events(owned));
      await snapshot(info, "browser-errors", errors);
    } catch (error) { failures.push(error); }
    if (ownsVolume) {
      try {
        const ownedBooks = await books(owned);
        const ids = ownedBooks.map(row => row.id);
        ownedBookIds.push(...ids);
        cleanup.bookIds = ids;
        for (const row of ownedBooks) {
          expect(row.google_books_volume_id).toBe(owned.volumeId);
          expect(check(await database.from("credits").select("person_id").eq("item_type", "book").eq("item_id", row.id)),
            "Owned synthetic fixtures declare no OL authors, so they must create no people or credits").toEqual([]);
          check(await database.from("books").delete().eq("id", row.id).eq("google_books_volume_id", owned.volumeId));
          expect(check(await database.from("book_editions").select("id").eq("book_id", row.id))).toEqual([]);
        }
        expect(await books(owned)).toEqual([]);
        cleanup.books = 0; cleanup.editions = 0; cleanup.credits = 0;
      } catch (error) { failures.push(error); }
    }
    if (attemptedActor) {
      try {
        const actor = await database.auth.admin.getUserById(actorId);
        if (actor.error?.status !== 404) {
          if (actor.error) throw actor.error;
          expect(actor.data.user?.email === credentials.email && actor.data.user?.user_metadata.qa_marker === marker,
            "Refusing cleanup of an unrelated actor").toBe(true);
          cleanup.ownershipVerified = true;
          try {
            // This ephemeral session never leaves memory. Global sign-out
            // revokes the actor's browser sessions before deleting Auth.
            const signedIn = await actorSession.auth.signInWithPassword(credentials);
            if (signedIn.error) throw signedIn.error;
            expect(signedIn.data.user?.id).toBe(actorId);
            const signedOut = await actorSession.auth.signOut({ scope: "global" });
            if (signedOut.error) throw signedOut.error;
            cleanup.globalSignOut = true;
          } catch (error) {
            cleanup.globalSignOut = false;
            failures.push(error); // Preserve FAIL, then continue REST cleanup.
          }
          const deleted = await database.auth.admin.deleteUser(actorId);
          if (deleted.error) throw deleted.error;
        }
        cleanup.auth404 = (await database.auth.admin.getUserById(actorId)).error?.status === 404;
        expect(cleanup.auth404).toBe(true);
        const counts: Array<{ table: string; count: number }> = [];
        for (const table of actorTables) {
          const rows = check(await database.from(table).select("user_id").eq("user_id", actorId));
          expect(rows).toEqual([]);
          counts.push({ table, count: rows?.length ?? -1 });
        }
        cleanup.tables = counts;
      } catch (error) { failures.push(error); }
    }
    try {
      const privateRows = privateAudit(actorId, [...new Set([...ownedBookIds, owned.bookId])]);
      cleanup.privateRows = privateRows;
      expect(privateRows).toEqual({ quotas: 0, editionKeys: 0, editions: 0 });
    } catch (error) { failures.push(error); }
    cleanup.failureCount = failures.length;
    const text = JSON.stringify(cleanup, null, 2);
    const path = info.outputPath("cleanup.json");
    await writeFile(path, text);
    await info.attach("cleanup", { path, contentType: "application/json" });
    if (process.env.QA1290_OUT) await writeFile(`${process.env.QA1290_OUT}/google-volume-cleanup-${actorId}.json`, text);
    if (failures.length) throw new AggregateError(failures, "Owned #1290 fixture cleanup failed");
  }
}

async function seed(context: CaseContext, fields: Record<string, unknown> = {}) {
  const { fixture: owned } = context;
  check(await database.from("books").insert({ id: owned.bookId, google_books_volume_id: owned.volumeId,
    title: null, author: null, synopsis: null, cover_url: null, total_pages: null,
    openlibrary_work_key: null, isbn: null, wikidata_id: null, published_year: null, genres: null,
    hydrated_at: null, repr_meta: null, ...fields }));
  const row = await book(owned); await snapshot(context.info, "seeded-book", row); return row;
}
async function hydrated(context: CaseContext, previousStamp: string | null = null) {
  await expect.poll(async () => {
    const rows = await books(context.fixture);
    return rows.length === 1 && !!rows[0].hydrated_at && rows[0].hydrated_at !== previousStamp;
  }, { timeout: 30_000, message: "Owned book must finish hydration with a new seal" }).toBe(true);
  const row = await book(context.fixture); await snapshot(context.info, "hydrated-book", row); return row;
}
function hydrationActivity(owned: Fixture) {
  return events(owned).filter(event => ["volume-detail-start", "volume-detail", "hydrate-rpc"].includes(event.kind));
}
async function committedActionAndRender(context: CaseContext, initial: Book) {
  // The budgeted action and the initial detail render both saw the empty row.
  // Google responses alone do not prove their subsequent RPC writes finished.
  // Match both real PostgREST commit responses before freezing the reload row.
  await expect.poll(() => {
    const calls = events(context.fixture).filter(event => event.kind === "hydrate-rpc");
    return {
      bookIds: [...new Set(calls.map(event => event.bookId))],
      started: calls.filter(event => event.phase === "start").length,
      completed: calls.filter(event => event.phase === "complete").length,
      successful: calls.filter(event => event.phase === "complete" && event.status === 204).length,
      failed: calls.filter(event => event.phase === "error").length,
    };
  }, { timeout: 30_000, message: "Both owned action/render hydration transactions must actually commit" })
    .toEqual({ bookIds: [initial.id], started: 2, completed: 2, successful: 2, failed: 0 });
  const activity = hydrationActivity(context.fixture);
  const calls = activity.filter(event => event.kind === "hydrate-rpc");
  const started = calls.filter(event => event.phase === "start").map(event => event.counter).sort();
  const completed = calls.filter(event => event.phase === "complete").map(event => event.counter).sort();
  expect(started.every(counter => typeof counter === "number" && Number.isInteger(counter) && counter > 0)).toBe(true);
  expect(new Set(started).size).toBe(2);
  expect(completed, "Each observed request must have its own matching commit response").toEqual(started);
  expect(activity.filter(event => event.kind === "volume-detail-start")).toHaveLength(2);
  expect(activity.filter(event => event.kind === "volume-detail" && event.status === 200)).toHaveLength(2);
  const row = await book(context.fixture);
  expect(row.id).toBe(initial.id);
  expect(row.hydrated_at).not.toBeNull();
  expect(Date.parse(row.hydrated_at!)).toBeGreaterThanOrEqual(Date.parse(initial.hydrated_at!));
  // Only the two proven concurrent commits may advance this pre-checkpoint
  // seal. The complete final row, including its seal, remains immutable below.
  expect(row).toEqual({ ...initial, hydrated_at: row.hydrated_at });
  await snapshot(context.info, "committed-action-and-render", { initialStamp: initial.hydrated_at, row, activity });
  return { row, activity };
}
function assertGoogleMetadata(row: Book, owned: Fixture) {
  expect(row).toMatchObject({ google_books_volume_id: owned.volumeId, title: owned.title,
    author: owned.authors[0], synopsis: owned.synopsis, cover_url: cover(owned), total_pages: owned.pages,
    openlibrary_work_key: null, isbn: null, wikidata_id: null, published_year: null });
  expect(row.genres ?? []).toEqual([]);
  expect(row.repr_meta).toMatchObject({ title: { lang: "es", source: "google_books" },
    synopsis: { lang: "es", source: "google_books" }, cover: { lang: "es", source: "google_books" },
    pages: { source: "google_books" } });
  expect(events(owned).filter(event => ["google-text", "inventaire", "openlibrary-work"].includes(event.kind))).toEqual([]);
}
async function assertVisible(page: Page, title: string, synopsis?: string) {
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible({ timeout: 30_000 });
  if (synopsis) await expect(page.getByText(synopsis, { exact: true }).first()).toBeVisible();
}
async function registeredAction(context: CaseContext) {
  // Existing rows render as normal links in search. Exercise the real action
  // with a stale, uncached SearchResult to cover the RPC re-select path too.
  const { page, actionId, fixture: owned } = context;
  const response = await page.request.post("/buscar", { maxRedirects: 0,
    headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8", Origin: new URL(page.url()).origin },
    data: JSON.stringify([{ itemType: "book", externalId: "", googleVolumeId: owned.volumeId,
      matchedIsbn: owned.isbn, title: owned.searchTitle, subtitle: "Texto del navegador que no debe sustituir la fila", coverUrl: null,
      year: null, genres: null }]),
  });
  expect([200, 303], "Real action must return its redirect response").toContain(response.status());
  const destination = response.headers()["x-action-redirect"]?.split(";")[0];
  expect(destination).toBe(`/libro/${owned.bookId}`);
  await snapshot(context.info, "registered-action", { actionId, status: response.status(), destination });
}

const fresh = fixture("fresh", 1);
test("ISBN opens the real action, hydrates its exact volume and refreshes automatically", async ({ page }, info) => {
  await ownCase(page, info, fresh, async context => {
    await page.goto(`/buscar?type=book&q=${fresh.isbn}`);
    const card = page.getByTestId("search-result-card").filter({ hasText: fresh.searchTitle });
    await expect(card).toHaveCount(1);
    expect(await books(fresh), "Searching alone must not create catalog rows").toEqual([]);
    const submitted = page.waitForRequest(request => request.method() === "POST" && request.headers()["next-action"] === context.actionId);
    await card.click(); await submitted;
    await expect(page).toHaveURL(/\/libro\/[0-9a-f-]{36}$/);
    await assertVisible(page, "Sin título");
    const initial = await hydrated(context); assertGoogleMetadata(initial, fresh);
    expect(new URL(page.url()).pathname).toBe(`/libro/${initial.id}`);
    await assertVisible(page, fresh.title, fresh.synopsis); // No manual reload before this assertion.
    const { row, activity } = await committedActionAndRender(context, initial);
    assertGoogleMetadata(row, fresh);
    await page.reload(); await assertVisible(page, fresh.title, fresh.synopsis);
    expect(await book(fresh)).toEqual(row);
    expect(hydrationActivity(fresh), "Reload must respect cooldown without starting another Google GET or hydration RPC").toEqual(activity);
  });
});

for (const [label, meta, index] of [["legacy_null", null, 2], ["legacy_empty", {}, 3]] as const) {
  const owned = fixture(label, index);
  test(`${label}: a recently sealed empty shell is rescued and refreshes without a reload`, async ({ page }, info) => {
    await ownCase(page, info, owned, async context => {
      const baseline = new Date(Date.now() - 60_000).toISOString();
      const seeded = await seed(context, { hydrated_at: baseline, repr_meta: meta });
      await page.goto(`/libro/${owned.bookId}`); await assertVisible(page, "Sin título");
      const row = await hydrated(context, seeded.hydrated_at); assertGoogleMetadata(row, owned);
      expect(row.id).toBe(owned.bookId);
      await assertVisible(page, owned.title, owned.synopsis);
      await page.reload(); await assertVisible(page, owned.title, owned.synopsis);
      expect(await book(owned)).toEqual(row);
    });
  });
}

const recovery = fixture("recovery", 4); recovery.mode = "http503"; recovery.delayMs = 0;
test("HTTP failure leaves the shell unsealed and a later visit retries the same volume", async ({ page }, info) => {
  await ownCase(page, info, recovery, async context => {
    await seed(context);
    await page.goto(`/libro/${recovery.bookId}`); await assertVisible(page, "Sin título");
    await expect.poll(() => events(recovery).filter(event => event.kind === "volume-detail" && event.status === 503).length).toBeGreaterThan(0);
    const failed = await book(recovery);
    expect(failed).toMatchObject({ hydrated_at: null, title: null, author: null, synopsis: null, cover_url: null, total_pages: null, repr_meta: null });
    await snapshot(info, "failed-unsealed-book", failed);
    recovery.mode = "ok"; recovery.revision = 2; recovery.delayMs = 2500; registerFixture(recovery);
    await page.reload();
    const row = await hydrated(context); assertGoogleMetadata(row, recovery);
    expect(row.id).toBe(recovery.bookId);
    await assertVisible(page, recovery.title, recovery.synopsis);
    expect(events(recovery).some(event => event.kind === "volume-detail" && event.status === 200 && event.revision === 2)).toBe(true);
    await page.reload(); expect(await book(recovery)).toEqual(row);
  });
});

const curated = fixture("curated", 5); curated.delayMs = 0;
const curatedTitle = `Ficha curada ${marker}`, curatedAuthor = "Autor de curación manual";
curated.alternateTitles = [curatedTitle]; curated.alternateAuthors = [curatedAuthor];
test("a re-selected curated row keeps manual fields when its old seal allows a review", async ({ page }, info) => {
  await ownCase(page, info, curated, async context => {
    const baseline = new Date(Date.now() - 31 * 86400_000).toISOString();
    const manual = { title: curatedTitle, author: curatedAuthor, synopsis: "Sinopsis curada a mano.",
      cover_url: cover(curated), total_pages: 222, hydrated_at: baseline,
      repr_meta: { title: { lang: "es", source: "manual" }, cover: { lang: "es", source: "manual" },
        synopsis: { lang: "es", source: "manual" }, pages: { source: "manual" } } };
    const seeded = await seed(context, manual); await registeredAction(context);
    const row = await hydrated(context, seeded.hydrated_at);
    expect(row).toMatchObject({ ...manual, hydrated_at: row.hydrated_at });
    expect(events(curated).some(event => event.kind === "volume-detail" && event.status === 200)).toBe(true);
    await page.goto(`/libro/${curated.bookId}`); await assertVisible(page, curatedTitle, manual.synopsis);
    await page.reload(); expect(await book(curated)).toEqual(row);
  });
});

const cooldown = fixture("cooldown", 6); cooldown.delayMs = 0;
const cooldownTitle = `Representación reciente ${marker}`;
cooldown.alternateTitles = [cooldownTitle]; cooldown.alternateAuthors = ["Autor reciente"];
test("a re-selected populated row retains its recent seal and cooldown", async ({ page }, info) => {
  await ownCase(page, info, cooldown, async context => {
    const row = await seed(context, { title: cooldownTitle, author: "Autor reciente", synopsis: "Recent English synopsis.",
      cover_url: cover(cooldown), total_pages: 111, hydrated_at: new Date().toISOString(),
      repr_meta: { title: { lang: "en", source: "google_books" }, cover: { lang: "en", source: "google_books" },
        synopsis: { lang: "en", source: "google_books" }, pages: { source: "google_books" } } });
    await registeredAction(context);
    expect(await book(cooldown)).toEqual(row);
    await page.goto(`/libro/${cooldown.bookId}`); await assertVisible(page, cooldownTitle);
    await page.reload(); await assertVisible(page, cooldownTitle);
    expect(await book(cooldown)).toEqual(row);
    expect(events(cooldown).filter(event => event.kind === "volume-detail")).toEqual([]);
  });
});

const openLibrary = fixture("openlibrary", 7);
openLibrary.workKey = `OL1290${namespace}07W`;
openLibrary.openLibraryTitle = `Obra OpenLibrary ${marker}`;
openLibrary.openLibrarySynopsis = `Sinopsis propia de OpenLibrary ${marker}.`;
test("an existing OpenLibrary work keeps its work branch even when a Google ID is present", async ({ page }, info) => {
  await ownCase(page, info, openLibrary, async context => {
    await seed(context, { openlibrary_work_key: openLibrary.workKey });
    await page.goto(`/libro/${openLibrary.bookId}`);
    const row = await hydrated(context);
    expect(row).toMatchObject({ id: openLibrary.bookId, google_books_volume_id: openLibrary.volumeId,
      openlibrary_work_key: openLibrary.workKey, title: openLibrary.openLibraryTitle, synopsis: openLibrary.openLibrarySynopsis });
    expect(row.repr_meta).toMatchObject({ title: { source: "openlibrary" }, synopsis: { source: "openlibrary" } });
    expect(events(openLibrary).some(event => event.kind === "openlibrary-work")).toBe(true);
    expect(events(openLibrary).filter(event => event.kind === "volume-detail")).toEqual([]);
    await assertVisible(page, openLibrary.openLibraryTitle!, openLibrary.openLibrarySynopsis);
    await page.reload(); expect(await book(openLibrary)).toEqual(row);
  });
});
