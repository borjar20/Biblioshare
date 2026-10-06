import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";
import type { CulturalRelease } from "../../src/lib/releases/types";
import { addDays, madridDay, formatReleaseDate } from "../../src/lib/releases/precision";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (url !== "http://127.0.0.1:54321") throw new Error("Novedades fixtures require disposable local Supabase");
const service = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const movieId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a10";
const monthBookId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a11";
const unknownBookId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a12";
const cinemaId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a21";
const digitalId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a22";
const internationalId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a23";
const monthId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a24";
const unknownId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a25";
const seasonId = "cbc1a019-0ac0-4d5e-8b24-9febc1bf0a26";
const tmdbId = 97139001;
const today = madridDay(new Date());
const month = addDays(today, 35).slice(0, 7);
const actors: Record<"editor" | "a" | "b", { id: string; email: string; password: string }> = {
  editor: { id: "", email: "ci-novedades-editor@example.test", password: randomUUID() },
  a: { id: "", email: "ci-novedades-a@example.test", password: randomUUID() },
  b: { id: "", email: "ci-novedades-b@example.test", password: randomUUID() },
};
let sourceBaseline: Database["public"]["Tables"]["release_sync_state"]["Row"][] = [];

function row(id: string, title: string, changes: Partial<CulturalRelease> = {}): Omit<CulturalRelease, "created_at" | "updated_at"> {
  return { id, title, work_key: `tmdb:movie:${tmdbId}`, source: "tmdb", source_key: `ci:novedades:${id}`, item_type: "movie", modality: "cinema",
    season_number: null, market: "ES", language: "und", date_value: today, date_precision: "day", status: "published", revision: 1,
    checked_at: new Date().toISOString(), subtitle: null, cover_url: null, synopsis: null, author: null, publisher: null, isbn: null,
    digital_platform: null, source_name: "CI Novedades fuente", source_url: "https://editorial.example/novedades", tmdb_id: tmdbId,
    book_id: null, movie_id: movieId, series_id: null, book_edition_id: null, ...changes };
}

async function cleanup() {
  // Delete exactly our fixed fixture actors before their catalog rows. This is
  // also the pre-run cleanup, so an interrupted previous run is recoverable.
  for (let page = 1; ; page += 1) {
    const users = await service.auth.admin.listUsers({ page, perPage: 1000 });
    expect(users.error).toBeNull();
    for (const user of users.data.users) if (Object.values(actors).some((actor) => actor.email === user.email)) {
      expect((await service.auth.admin.deleteUser(user.id)).error).toBeNull();
    }
    if (users.data.users.length < 1000) break;
  }
  expect((await service.from("cultural_releases").delete().like("source_key", "ci:novedades:%")).error).toBeNull();
  expect((await service.from("cultural_releases").delete().eq("source", "editorial").like("title", "CI Novedades%")).error).toBeNull();
  expect((await service.from("books").delete().like("title", "CI Novedades%")).error).toBeNull();
  expect((await service.from("movies").delete().eq("id", movieId)).error).toBeNull();
}

test.beforeAll(async () => {
  await cleanup();
  const baseline = await service.from("release_sync_state").select("*");
  expect(baseline.error).toBeNull(); sourceBaseline = baseline.data ?? [];
  for (const [name, actor] of Object.entries(actors)) {
    const account = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
    expect(account.error).toBeNull(); actor.id = account.data.user!.id;
    expect((await service.from("profiles").insert({ user_id: actor.id, username: `ci_novedades_${name}`, display_name: `CI Novedades ${name}`,
      is_public: false, onboarded_at: new Date().toISOString(), role: name === "editor" ? "admin" : "user" })).error).toBeNull();
  }
  expect((await service.from("movies").insert({ id: movieId, tmdb_id: tmdbId, title: "CI Novedades película", release_year: Number(today.slice(0, 4)), duration_minutes: 90 })).error).toBeNull();
  expect((await service.from("books").insert([{ id: monthBookId, title: "CI Novedades libro con mes", author: "Autora CI" }, { id: unknownBookId, title: "CI Novedades libro sin fecha", author: "Autora CI" }])).error).toBeNull();
  const releases = [
    row(cinemaId, "CI Novedades película"), row(digitalId, "CI Novedades película", { modality: "digital", date_value: addDays(today, 2) }),
    row(internationalId, "CI Novedades película", { market: "INT", date_value: addDays(today, 1) }),
    row(monthId, "CI Novedades libro con mes", { source: "editorial", work_key: `book:${monthBookId}`, item_type: "book", modality: "book", book_id: monthBookId,
      movie_id: null, tmdb_id: null, language: "es", date_precision: "month", date_value: month }),
    row(unknownId, "CI Novedades libro sin fecha", { source: "editorial", work_key: `book:${unknownBookId}`, item_type: "book", modality: "book_translation", book_id: unknownBookId,
      movie_id: null, tmdb_id: null, language: "es", date_precision: "unknown", date_value: null }),
    row(seasonId, "CI Novedades serie", { work_key: "tmdb:tv:97139002", item_type: "series", modality: "season", season_number: 2, market: "INT", movie_id: null,
      tmdb_id: 97139002, date_value: addDays(today, 3) }),
  ];
  expect((await service.from("cultural_releases").insert(releases)).error).toBeNull();
});

test.beforeEach(async () => {
  const ids = Object.values(actors).map((actor) => actor.id);
  expect((await service.from("release_subscriptions").delete().in("user_id", ids)).error).toBeNull();
  expect((await service.from("passes").delete().in("user_id", ids)).error).toBeNull();
});
test.afterAll(async () => {
  await cleanup();
  if (sourceBaseline.length) expect((await service.from("release_sync_state").upsert(sourceBaseline)).error).toBeNull();
});

async function login(page: Page, actor: typeof actors.a) {
  await page.goto("/login");
  await page.locator('input[name="email"]:visible').fill(actor.email);
  await page.locator('input[name="password"]:visible').fill(actor.password);
  await page.locator('button[type="submit"]:visible').click();
  await expect(page).not.toHaveURL(/\/login/);
}
async function countPasses(actorId: string) {
  const result = await service.from("passes").select("id").eq("user_id", actorId);
  expect(result.error).toBeNull(); return result.data?.length ?? 0;
}

for (const width of [390, 1280]) test(`Explorar público, fechas exactas/parciales, cine/digital, temporadas y entrada de Inicio · ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 850 });
  await page.goto("/buscar");
  await page.getByRole("link", { name: "Novedades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novedades", exact: true })).toBeVisible();
  const movie = page.locator('article[data-work-key="tmdb:movie:97139001"]');
  await expect(movie).toHaveCount(1);
  await expect(movie.getByText("Cine", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(movie.getByText("Digital", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(movie.getByRole("link", { name: "Añadir a Pendiente", exact: true })).toHaveCount(1);
  await expect(movie.getByRole("link", { name: "Avisarme", exact: true })).toHaveCount(2);
  await expect(movie.getByText("Internacional", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(movie.getByText(/Netflix|Prime|Disney/).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Anuncios sin día exacto", exact: true })).toBeVisible();
  const monthly = page.locator(`article[data-work-key="book:${monthBookId}"]`);
  await expect(monthly.getByText(formatReleaseDate({ date_precision: "month", date_value: month }), { exact: true }).filter({ visible: true })).toBeVisible();
  const unknown = page.locator(`article[data-work-key="book:${unknownBookId}"]`);
  await expect(unknown.getByText("Fecha por confirmar", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(unknown.getByText("Primera traducción al castellano", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`explorar-${width}.png`), fullPage: true });
  await page.getByLabel("Mercado", { exact: true }).filter({ visible: true }).selectOption("all");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(movie).toHaveCount(1);
  await expect(movie.getByRole("link", { name: "Avisarme", exact: true })).toHaveCount(3);
  const international = movie.locator(`[data-release-id="${internationalId}"]:visible`);
  await expect(international).toHaveCount(1);
  await expect(international).toContainText("Internacional");
  await page.goto("/novedades?tipo=series");
  await expect(page.getByRole("heading", { name: "Las fechas disponibles de estas series son internacionales", exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Ver fechas internacionales", exact: true }).click();
  await expect(page).toHaveURL(/\/novedades\?tipo=series&mercado=INT$/);
  await expect(page.locator('select[name="tipo"]').filter({ visible: true })).toHaveValue("series");
  await expect(page.getByLabel("Mercado", { exact: true }).filter({ visible: true })).toHaveValue("INT");
  await expect(page.getByText("Temporada 2", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Fecha internacional. No confirma disponibilidad en España.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sale esta semana", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver todas las novedades", exact: true })).toBeVisible();
});

test("Lo que esperas conserva retorno de sesión y distingue Pendiente, consentimiento por modalidad y dos cuentas", async ({ page, browser }) => {
  await page.goto("/novedades?seleccion=personal&tipo=movie");
  await expect(page).toHaveURL(/\/login\?next=%2Fnovedades%3Fseleccion%3Dpersonal%26tipo%3Dmovie/);
  await page.locator('input[name="email"]:visible').fill(actors.a.email);
  await page.locator('input[name="password"]:visible').fill(actors.a.password);
  await page.locator('button[type="submit"]:visible').click();
  await expect(page).toHaveURL(/\/novedades\?seleccion=personal&tipo=movie/);
  await expect(page.getByRole("heading", { name: "Aún no esperas ningún lanzamiento", exact: true }).filter({ visible: true })).toBeVisible();
  await page.goto("/novedades?tipo=movie");
  const movie = page.locator('article[data-work-key="tmdb:movie:97139001"]');
  await movie.getByRole("button", { name: "Añadir a Pendiente", exact: true }).click();
  await expect.poll(() => countPasses(actors.a.id)).toBe(1);
  const before = await service.from("release_subscriptions").select("release_id").eq("user_id", actors.a.id).eq("active", true);
  expect(before.error).toBeNull(); expect(before.data).toEqual([]);
  const cinema = movie.locator(`[data-release-id="${cinemaId}"]`);
  const digital = movie.locator(`[data-release-id="${digitalId}"]`);
  await digital.getByRole("button", { name: "Avisarme", exact: true }).click();
  await expect(digital.getByRole("button", { name: "Retirar aviso", exact: true })).toBeVisible();
  await expect(cinema.getByRole("button", { name: "Avisarme", exact: true })).toBeVisible();
  const choices = await service.from("release_subscriptions").select("release_id").eq("user_id", actors.a.id).eq("active", true);
  expect(choices.error).toBeNull(); expect(choices.data).toEqual([{ release_id: digitalId }]);
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL, serviceWorkers: "block" });
  try {
    const second = await context.newPage(); await login(second, actors.b);
    await second.goto("/novedades?seleccion=personal&tipo=movie");
    await expect(second.getByRole("heading", { name: "Aún no esperas ningún lanzamiento", exact: true }).filter({ visible: true })).toBeVisible();
    await second.goto("/admin/novedades");
    await expect(second).toHaveURL(/\/$/);
  } finally { await context.close(); }
  await page.goto("/novedades?seleccion=personal&tipo=movie");
  await page.locator(`[data-release-id="${digitalId}"]`).getByRole("button", { name: "Retirar aviso", exact: true }).click();
  await expect(page.locator(`[data-release-id="${digitalId}"]`).getByRole("button", { name: "Avisarme", exact: true })).toBeVisible();
  expect(await countPasses(actors.a.id)).toBe(1);
});

test("administración publica libro sin ISBN con mes, conserva biblioteca, cancela y retira un aviso elegido", async ({ page }) => {
  await login(page, actors.editor);
  await page.goto("/admin/novedades/nuevo");
  const title = `CI Novedades alta ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Título", { exact: true }).filter({ visible: true }).fill(title);
  await page.getByLabel("Autoría", { exact: true }).filter({ visible: true }).fill("Autora editorial CI");
  await page.getByLabel("Fecha anunciada", { exact: true }).filter({ visible: true }).selectOption("month");
  await page.getByLabel("Mes de lanzamiento", { exact: true }).filter({ visible: true }).fill(month);
  await page.getByLabel("Nombre de la fuente", { exact: true }).filter({ visible: true }).fill("CI Novedades editorial");
  await page.getByLabel("Enlace del anuncio editorial", { exact: true }).filter({ visible: true }).fill("https://editorial.example/alta-novedades");
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/novedades\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByText("Borrador", { exact: true }).filter({ visible: true })).toBeVisible();
  const draft = await service.from("cultural_releases").select("status,isbn,date_value,date_precision,book_id").eq("id", id).single();
  expect(draft.error).toBeNull(); expect(draft.data).toMatchObject({ status: "draft", isbn: null, date_value: month, date_precision: "month", book_id: null });
  const anonymous = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const hidden = await anonymous.from("cultural_releases").select("id").eq("id", id);
  expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByText("Publicado", { exact: true }).filter({ visible: true })).toBeVisible();
  const published = await service.from("cultural_releases").select("status,book_id,isbn,date_value,date_precision").eq("id", id).single();
  expect(published.error).toBeNull(); expect(published.data?.book_id).toBeTruthy();
  expect(published.data).toMatchObject({ status: "published", isbn: null, date_value: month, date_precision: "month" });
  expect(await countPasses(actors.editor.id)).toBe(0);
  await page.goto(`/novedades?lanzamiento=${id}`);
  const card = page.locator(`[data-release-id="${id}"]`);
  await card.getByRole("button", { name: "Avisarme", exact: true }).click();
  await expect(card.getByRole("button", { name: "Retirar aviso", exact: true })).toBeVisible();
  expect(await countPasses(actors.editor.id)).toBe(0);
  await page.goto(`/admin/novedades/${id}`);
  await page.getByRole("button", { name: "Acciones del anuncio", exact: true }).click();
  await page.getByRole("menuitem", { name: "Cancelar lanzamiento", exact: true }).click();
  await expect(page.getByText("Cancelado", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.goto(`/novedades?lanzamiento=${id}`);
  await expect(page.locator(`[data-release-id="${id}"]:visible`).getByText("Lanzamiento cancelado", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.locator(`[data-release-id="${id}"]`).getByRole("button", { name: "Retirar aviso", exact: true }).click();
  await expect(page.locator(`[data-release-id="${id}"]`).getByRole("status").filter({ hasText: "Aviso retirado. Tu biblioteca se conserva." })).toBeVisible();
  await expect.poll(async () => {
    const withdrawn = await service.from("release_subscriptions").select("active").eq("user_id", actors.editor.id).eq("release_id", id).single();
    expect(withdrawn.error).toBeNull();
    return withdrawn.data?.active;
  }, { message: "La retirada debe persistirse antes de comprobar que terminó" }).toBe(false);
  await expect(page.locator(`[data-release-id="${id}"]`).getByRole("button", { name: "Retirar aviso", exact: true })).toHaveCount(0);
  expect(await countPasses(actors.editor.id)).toBe(0);
});

test("un formulario editorial antiguo no sobrescribe una revisión de metadatos posterior", async ({ page }) => {
  await login(page, actors.editor);
  await page.goto(`/admin/novedades/${monthId}`);
  await expect(page.getByLabel("Título", { exact: true }).filter({ visible: true })).toHaveValue("CI Novedades libro con mes");
  const current = await service.from("cultural_releases").select("revision,updated_at").eq("id", monthId).single();
  expect(current.error).toBeNull();
  const revised = await service.from("cultural_releases").update({ source_name: "CI Novedades otra revisión" }).eq("id", monthId).select("revision,updated_at").single();
  expect(revised.error).toBeNull(); expect(revised.data?.revision).toBe(current.data?.revision);
  expect(revised.data?.updated_at).not.toBe(current.data?.updated_at);
  await page.getByLabel("Título", { exact: true }).filter({ visible: true }).fill("CI Novedades edición obsoleta");
  await page.getByRole("button", { name: "Guardar revisión", exact: true }).click();
  await expect(page.getByText("El anuncio cambió mientras lo editabas. Vuelve a cargarlo antes de guardar.", { exact: true }).filter({ visible: true })).toBeVisible();
  const unchanged = await service.from("cultural_releases").select("title,source_name").eq("id", monthId).single();
  expect(unchanged.error).toBeNull(); expect(unchanged.data).toMatchObject({ title: "CI Novedades libro con mes", source_name: "CI Novedades otra revisión" });
});

test("el cron protegido acepta un recordatorio una vez, la campana abre su mercado y el retiro evita nuevos avisos", async ({ page, request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("Missing disposable local cron fixture");
  const now = new Date().toISOString();
  // Successful synchronization today skips all provider work. These timestamps
  // are a local fixture and the suite restores the original source rows.
  expect((await service.from("release_sync_state").update({ last_success_at: now, last_attempt_at: now, last_error: null }).eq("source", "tmdb")).error).toBeNull();
  await login(page, actors.a);
  await page.goto(`/novedades?lanzamiento=${internationalId}`);
  const target = page.locator(`[data-release-id="${internationalId}"]`);
  await expect(target.getByText("Internacional", { exact: true })).toBeVisible();
  await target.getByRole("button", { name: "Avisarme", exact: true }).click();
  await expect(target.getByRole("button", { name: "Retirar aviso", exact: true })).toBeVisible();
  expect(await countPasses(actors.a.id)).toBe(0);

  const unauthorized = await request.post("/api/cron/releases", { data: {} });
  expect(unauthorized.status()).toBe(401);
  expect(await unauthorized.json()).toEqual({ error: "unauthorized" });
  const sweep = () => request.post("/api/cron/releases", { headers: { "x-cron-secret": secret }, data: {} });
  const first = await sweep();
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({ sync: { attempted: false, imported: 0, failed: false }, deliveries: { accepted: 1, failed: 0 } });
  const noticeQuery = () => service.from("notifications").select("id,type,target_type,target_id,actor_id,context")
    .eq("user_id", actors.a.id).eq("target_type", "release").eq("target_id", internationalId);
  const initial = await noticeQuery();
  expect(initial.error).toBeNull(); expect(initial.data).toHaveLength(1);
  expect(initial.data?.[0]).toMatchObject({ type: "release_reminder", target_type: "release", target_id: internationalId,
    actor_id: null, context: { subject: "CI Novedades película" } });
  const ledger = await service.from("release_deliveries").select("state,reason,accepted_at,notification_id")
    .eq("user_id", actors.a.id).eq("release_id", internationalId);
  expect(ledger.error).toBeNull(); expect(ledger.data).toHaveLength(1);
  expect(ledger.data?.[0]).toMatchObject({ state: "accepted", reason: "reminder", notification_id: initial.data?.[0].id });
  expect(ledger.data?.[0].accepted_at).toBeTruthy();
  const duplicate = await sweep();
  expect(duplicate.status()).toBe(200);
  expect(await duplicate.json()).toMatchObject({ sync: { attempted: false }, deliveries: { claimed: 0, accepted: 0, failed: 0 } });
  const afterRetry = await noticeQuery();
  expect(afterRetry.error).toBeNull(); expect(afterRetry.data).toEqual(initial.data);
  const otherAccount = await service.from("notifications").select("id").eq("user_id", actors.b.id).eq("target_id", internationalId);
  expect(otherAccount.error).toBeNull(); expect(otherAccount.data).toEqual([]);

  await page.goto("/buscar");
  await page.getByRole("button", { name: "Notificaciones", exact: true }).click();
  const notification = page.getByRole("region", { name: "Notificaciones", exact: true })
    .getByRole("link", { name: /Mañana llega CI Novedades película\./ });
  await expect(notification).toHaveCount(1);
  await expect(notification).toHaveAttribute("href", `/novedades?lanzamiento=${internationalId}`);
  await notification.click();
  await expect(page).toHaveURL(new RegExp(`/novedades\\?lanzamiento=${internationalId}$`));
  await expect(target.getByText("Internacional", { exact: true })).toBeVisible();
  await target.getByRole("button", { name: "Retirar aviso", exact: true }).click();
  await expect(target.getByRole("button", { name: "Avisarme", exact: true })).toBeVisible();
  const withdrawn = await service.from("release_subscriptions").select("active").eq("user_id", actors.a.id).eq("release_id", internationalId).single();
  expect(withdrawn.error).toBeNull(); expect(withdrawn.data?.active).toBe(false);
  // Two date revisions would enqueue updates for an active consent. Withdrawal
  // keeps this same tomorrow launch silent without removing the accepted row.
  expect((await service.from("cultural_releases").update({ date_value: addDays(today, 2) }).eq("id", internationalId)).error).toBeNull();
  expect((await service.from("cultural_releases").update({ date_value: addDays(today, 1) }).eq("id", internationalId)).error).toBeNull();
  const afterWithdrawal = await sweep();
  expect(afterWithdrawal.status()).toBe(200);
  expect(await afterWithdrawal.json()).toMatchObject({ sync: { attempted: false }, deliveries: { claimed: 0, accepted: 0, failed: 0 } });
  const retained = await noticeQuery();
  expect(retained.error).toBeNull(); expect(retained.data).toEqual(initial.data);
  expect(await countPasses(actors.a.id)).toBe(0);
});
