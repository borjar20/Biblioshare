import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database, Json } from "../../src/lib/supabase/database.types";
import type { WrapUpPayload } from "../../src/lib/wrap-ups/types";
import { madridDay } from "../../src/lib/releases/precision";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (url !== "http://127.0.0.1:54321") throw new Error("Home fixtures require disposable local Supabase");
const service = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const actor = { id: "", email: "ci-home-expandable@example.test", password: randomUUID() };
const today = madridDay(new Date());
const cover = "https://covers.openlibrary.org/b/id/ci-home-expandable-L.jpg";
const books = Array.from({ length: 14 }, (_, index) => ({ id: `b1400010-2026-4000-a000-${String(index + 1).padStart(12, "0")}`, title: index === 0 ? "CI Inicio: La increíble y triste historia de la cándida Eréndira y de su abuela desalmada" : index === 1 ? "CI Inicio segunda historia" : `CI Inicio pendiente ${index}` }));
const passes = books.map((_, index) => `b1400010-2026-4000-b000-${String(index + 1).padStart(12, "0")}`);
const editions = books.map((_, index) => `b1400010-2026-4000-c000-${String(index + 1).padStart(12, "0")}`);
const releases = books.slice(2, 5).map((_, index) => `b1400010-2026-4000-d000-${String(index + 1).padStart(12, "0")}`);

function payload(kind: "week" | "month"): WrapUpPayload {
  const periodStart = kind === "week" ? "2026-09-28" : "2026-09-01";
  const periodEnd = kind === "week" ? "2026-10-04" : "2026-09-30";
  return { v: 1, kind, periodStart, periodEnd, intensity: "full", narrator: "reader", palette: "book", pet: null,
    stories: [{ id: "cover" }, { id: "time", minutes: { book: 100, movie: 0, series: 0 }, episodesWithoutRuntime: 0, previousMinutes: null }, { id: "closing" }],
    share: { kind, periodStart, periodEnd, narrator: "reader", palette: "book", minutes: 100, episodesWithoutRuntime: 0, finished: 0, covers: [], pet: null } };
}
async function cleanup() {
  for (let page = 1; ; page++) {
    const users = await service.auth.admin.listUsers({ page, perPage: 1000 }); expect(users.error).toBeNull();
    for (const user of users.data.users) if (user.email === actor.email) expect((await service.auth.admin.deleteUser(user.id)).error).toBeNull();
    if (users.data.users.length < 1000) break;
  }
  expect((await service.from("cultural_releases").delete().like("source_key", "ci:home-expandable:%")).error).toBeNull();
  expect((await service.from("books").delete().in("id", books.map((book) => book.id))).error).toBeNull();
}
test.beforeAll(async () => {
  await cleanup();
  const account = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true }); expect(account.error).toBeNull(); actor.id = account.data.user!.id;
  expect((await service.from("profiles").insert({ user_id: actor.id, username: "ci_home_expandable", display_name: "Lectora", is_public: true, onboarded_at: new Date().toISOString() })).error).toBeNull();
  expect((await service.from("books").insert(books.map((book) => ({ ...book, author: "Autora de prueba", cover_url: cover, total_pages: 400 })))).error).toBeNull();
  expect((await service.from("book_editions").insert(books.map((book, index) => ({ id: editions[index], book_id: book.id, label: "Edición CI", is_primary: false, cover_url: cover, total_pages: 400 })))).error).toBeNull();
  expect((await service.from("passes").insert(books.map((book, index) => ({ id: passes[index], user_id: actor.id, item_type: "book" as const, item_id: book.id, edition_id: editions[index], is_active: true, is_public: true, status: index < 2 ? "in_progress" as const : "planned" as const, started_on: index < 2 ? today : null, planned_on: today, position: index < 2 ? { page: 120 } : {} })))).error).toBeNull();
  expect((await service.from("progress_sessions").insert({ user_id: actor.id, pass_id: passes[0], duration_minutes: 35, session_date: today, position: { page: 120 }, note: "Una buena lectura" })).error).toBeNull();
  expect((await service.from("posts").insert(Array.from({ length: 24 }, (_, index) => ({ author_id: actor.id, anchor_type: "book" as const, anchor_id: books[0].id, kind: "thought" as const, body: index === 0 ? "Primera crónica social de prueba" : `Pensamiento CI ${index}`, created_at: new Date(Date.now() - index * 60_000).toISOString() })))).error).toBeNull();
  expect((await service.from("cultural_releases").insert(books.slice(2, 5).map((book, index) => ({ id: releases[index], title: `CI Novedad ${index + 1} con título completo`, work_key: `book:${book.id}`, source: "editorial" as const, source_key: `ci:home-expandable:${index}`, item_type: "book" as const, modality: "book" as const, market: "ES", language: "es", date_value: today, date_precision: "day" as const, status: "published" as const, revision: 1, checked_at: new Date().toISOString(), cover_url: cover, synopsis: "Sinopsis suficiente de prueba", synopsis_language: "es", author: "Autora CI", publisher: "Editorial CI", source_name: "Editorial CI", source_url: "https://example.test/editorial", book_id: book.id })))).error).toBeNull();
});
test.afterAll(cleanup);
const browserErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  for (const kind of ["week", "month"] as const) {
    const data = payload(kind);
    expect((await service.from("wrap_ups").upsert({ user_id: actor.id, kind, period_start: data.periodStart, period_end: data.periodEnd, intensity: data.intensity, payload: data as unknown as Json, seen_at: null })).error).toBeNull();
  }
  await page.route((request) => request.href.includes("ci-home-expandable-L.jpg"), (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#ad6b54"/><text x="20" y="120" fill="#fff">La historia</text></svg>' }));
});
async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]:visible').fill(actor.email);
  await page.locator('input[name="password"]:visible').fill(actor.password);
  await page.locator('button[type="submit"]:visible').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".home-today-panel")).toBeAttached();
}
async function holdMorph(locator: Locator) {
  await locator.evaluate((panel) => {
    const observer = new MutationObserver(() => {
      panel.getAnimations({ subtree: true }).forEach((animation) => { animation.pause(); animation.currentTime = 0; });
      observer.disconnect();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ["data-expanded"] });
  });
}
async function seen(kind: "week" | "month") {
  const result = await service.from("wrap_ups").select("seen_at").eq("user_id", actor.id).eq("kind", kind).single(); expect(result.error).toBeNull(); return result.data?.seen_at;
}
for (const width of [320, 390, 768]) test(`resúmenes, obra elegida, crónica fijada y retorno · ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
  await page.emulateMedia({ reducedMotion: width === 390 ? "no-preference" : "reduce", colorScheme: width === 768 ? "dark" : "light" });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), width === 768 ? "dark" : "light");
  await login(page);
  const trigger = page.getByRole("button", { name: "Ampliar lo que disfrutas", exact: true });
  await expect(trigger).toContainText(books[0].title);
  await expect(page.getByRole("heading", { name: "¿Qué has disfrutado hoy?", exact: true })).toBeVisible();
  await expect(page.getByText("Primera crónica social de prueba", { exact: true })).toBeVisible();
  const firstPost = await page.getByText("Primera crónica social de prueba", { exact: true }).locator("xpath=ancestor::article[1]").boundingBox();
  const headingBox = await page.locator(".home-focus-heading").boundingBox();
  // Se conserva el presupuesto del feed más la cabecera solicitada, ahora visible.
  expect(firstPost!.y).toBeLessThan((width === 320 ? 640 : 844) - 70 + headingBox!.height + 10);
  expect(await seen("week")).toBeNull(); expect(await seen("month")).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: false });
  if (width === 390) {
    await page.getByRole("button", { name: "Compartir un pensamiento", exact: true }).click();
    await page.locator("textarea").fill("Borrador que conserva el feed");
  }
  if (width === 390) {
    // Pausar en el cambio de estado, antes de pintar: el host lento no altera
    // el fotograma que se compara ni convierte la prueba en una carrera de reloj.
    await page.locator(".home-today-panel").evaluate((panel) => {
      const observer = new MutationObserver(() => {
        if (panel.getAttribute("data-expanded") !== "true") return;
        panel.getAnimations({ subtree: true }).forEach((animation) => { animation.pause(); animation.currentTime = 0; });
        observer.disconnect();
      });
      observer.observe(panel, { attributes: true, attributeFilter: ["data-expanded"] });
    });
  }
  const coverNode = await page.locator(".home-focus-card .today-card-cover").elementHandle();
  const before = await page.locator(".home-focus-card .today-card").boundingBox();
  expect(before!.height).toBeCloseTo(106, 0);
  await trigger.click();
  const todayDialog = page.getByRole("region", { name: "Lo que disfrutas", exact: true });
  if (width === 390) {
    const morph = page.locator(".home-today-panel");
    // La misma portada y barra interpolan su geometría, sin desaparecer.
    const firstFrame = await morph.evaluate((panel) => {
      panel.getAnimations({ subtree: true }).forEach((animation) => { animation.pause(); animation.currentTime = 0; });
      const cover = panel.querySelector(".today-card-cover")!;
      return { animations: panel.getAnimations({ subtree: true }).length, width: cover.getBoundingClientRect().width, opacity: Number(getComputedStyle(cover).opacity), height: panel.querySelector(".today-card")!.getBoundingClientRect().height };
    });
    expect(firstFrame.animations).toBeGreaterThan(0);
    expect(firstFrame.width).toBeCloseTo(48, 0);
    expect(firstFrame.opacity).toBeGreaterThan(0.95);
    expect(firstFrame.height).toBeCloseTo(before!.height, 0);
    const middle = await morph.evaluate((panel) => {
      panel.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 160; });
      return { width: panel.querySelector(".today-card-cover")!.getBoundingClientRect().width, height: panel.querySelector(".today-card")!.getBoundingClientRect().height };
    });
    expect(middle.width).toBeGreaterThan(48);
    expect(middle.width).toBeLessThan(58);
    expect(middle.height).toBeGreaterThan(firstFrame.height);
    expect(await coverNode!.evaluate((cover) => cover === document.querySelector(".home-focus-card .today-card-cover"))).toBe(true);
    await morph.evaluate((panel) => { panel.getAnimations({ subtree: true }).forEach((animation) => animation.finish()); });
    await page.screenshot({ path: testInfo.outputPath("home-expanded.png"), fullPage: false });
  }
  await expect(todayDialog).toBeVisible();
  await expect(todayDialog.locator(".home-focus-context a")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await todayDialog.getByRole("button", { name: `Poner ${books[1].title} arriba`, exact: true }).click();
  await todayDialog.getByRole("button", { name: "Recoger: Lo que disfrutas", exact: true }).click();
  await expect(todayDialog).toBeHidden(); await expect(trigger).toBeFocused(); await expect(trigger).toContainText(books[1].title);
  await expect(trigger).toBeInViewport();
  if (width === 390) await expect(page.locator("textarea")).toHaveValue("Borrador que conserva el feed");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page.locator('.home-panel-quick a')).toHaveAttribute("href", `/sesion/${passes[1]}`);
  await trigger.click(); await expect(todayDialog.locator('.today-card-body')).toContainText(books[1].title);
  await page.keyboard.press("Escape"); await expect(todayDialog).toBeHidden();
  if (width === 390) {
    await trigger.click();
    await page.getByRole("button", { name: "Ampliar tu actividad", exact: true }).click();
    await expect(todayDialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Tu actividad", exact: true })).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("region", { name: "Tu actividad", exact: true })).toBeHidden();
    const footer = todayDialog.getByRole("button", { name: "Recoger: Lo que disfrutas", exact: true });
    await footer.click(); await expect(todayDialog).toBeHidden();
    await expect(trigger).toBeInViewport();
  }
  const weekPanel = page.locator(".home-releases-morph");
  const weekCovers = await weekPanel.locator(".release-work-cover").elementHandles();
  const weekStart = await weekCovers[0].boundingBox();
  if (width === 390) await holdMorph(weekPanel);
  await page.getByRole("button", { name: "Ampliar Sale esta semana", exact: true }).click();
  if (width === 390) {
    const first = await weekCovers[0].boundingBox();
    expect(first!.x).toBeCloseTo(weekStart!.x, 0); expect(first!.y).toBeCloseTo(weekStart!.y, 0);
    await weekPanel.evaluate((panel) => panel.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 160; }));
    const middle = await weekCovers[0].boundingBox();
    expect(middle!.width).toBeGreaterThan(weekStart!.width); expect(middle!.width).toBeLessThan(64);
    await weekPanel.evaluate((panel) => panel.getAnimations({ subtree: true }).forEach((animation) => animation.finish()));
    expect(await weekCovers[0].evaluate((cover) => cover === document.querySelector(".home-releases-morph .release-work-cover"))).toBe(true);
  }
  const releasesDialog = page.getByRole("region", { name: "Sale esta semana", exact: true });
  await expect(releasesDialog.getByRole("link", { name: "Ver todas las novedades", exact: true })).toHaveAttribute("href", "/novedades");
  await expect(releasesDialog.locator('[data-release-id]')).toHaveCount(3);
  const closeBox = (await weekPanel.locator(".home-focus-collapse").boundingBox())!;
  const calendarBox = (await releasesDialog.getByRole("link", { name: "Ver todas las novedades", exact: true }).boundingBox())!;
  expect(closeBox.x + closeBox.width <= calendarBox.x || calendarBox.x + calendarBox.width <= closeBox.x ||
    closeBox.y + closeBox.height <= calendarBox.y || calendarBox.y + calendarBox.height <= closeBox.y).toBe(true);
  await releasesDialog.getByRole("button", { name: "Recoger: Sale esta semana", exact: true }).click(); await expect(releasesDialog).toBeHidden();
  const statsPanel = page.locator(".home-stats-morph");
  const bar = await statsPanel.locator(".weekly-strip-bar").first().elementHandle();
  if (width === 390) await holdMorph(statsPanel);
  await page.getByRole("button", { name: "Ampliar tu actividad", exact: true }).click();
  if (width === 390) {
    const firstWidth = (await bar!.boundingBox())!.width;
    await statsPanel.evaluate((panel) => panel.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 160; }));
    const middleWidth = (await bar!.boundingBox())!.width;
    expect(middleWidth).toBeGreaterThan(firstWidth); expect(middleWidth).toBeLessThan(20);
    await statsPanel.evaluate((panel) => panel.getAnimations({ subtree: true }).forEach((animation) => animation.finish()));
    expect(await bar!.evaluate((node) => node === document.querySelector(".home-stats-morph .weekly-strip-bar"))).toBe(true);
  }
  await expect(page.getByRole("region", { name: "Tu actividad", exact: true })).toBeVisible();
  const statsClose = statsPanel.locator(".home-focus-collapse");
  const statsCloseBox = (await statsClose.boundingBox())!;
  const statsHeadingBox = (await statsPanel.locator(".home-shared-title").boundingBox())!;
  expect(statsCloseBox.y + statsCloseBox.height / 2).toBeCloseTo(statsHeadingBox.y + statsHeadingBox.height / 2, 0);
  expect(statsCloseBox.width).toBe(44); expect(statsCloseBox.height).toBe(44);
  await statsClose.click(); await expect(page.getByRole("region", { name: "Tu actividad", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Abrir tu crónica", exact: true }).click();
  const story = page.getByRole("dialog").filter({ has: page.locator('ol') });
  await expect(story).toBeVisible();
  await expect.poll(() => seen("week")).not.toBeNull(); expect(await seen("month")).toBeNull();
  if (width === 390) {
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await story.getByRole("button", { name: "Publicar en el feed", exact: true }).click();
    await expect(story.getByRole("button", { name: "Despublicar", exact: true })).toBeVisible();
    await story.getByRole("button", { name: "Despublicar", exact: true }).click();
    await expect(story.getByRole("button", { name: "Publicar en el feed", exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape"); await expect(story).toBeHidden();
  await expect(page.getByRole("button", { name: "Abrir tu crónica", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("PC mantiene contenido y permite bajar el lateral sin mover el feed", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 680 }); await login(page);
  await expect(page.locator('.today-card-body')).toBeVisible();
  await expect(page.locator(".home-today-panel .home-panel-trigger")).toBeHidden();
  const feedY = (await page.locator('[data-area="feed"]').boundingBox())!.y;
  const personal = page.locator('[data-area="personal"]');
  expect(await personal.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(personal.locator(`[data-release-id="${releases[2]}"]`)).toBeAttached();
  await personal.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(personal.locator(`[data-release-id="${releases[2]}"]`)).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect((await page.locator('[data-area="feed"]').boundingBox())!.y).toBe(feedY);
  expect((await personal.locator('.home-week-card img').first().boundingBox())!.width).toBeLessThanOrEqual(36);
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: false });
  await personal.getByRole("link", { name: "Ver todas las novedades", exact: true }).click(); await expect(page).toHaveURL(/\/novedades$/);
});

test("resize, sesión y navegación completa vuelven con los bloques recogidos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page);
  await page.getByRole("button", { name: "Ampliar lo que disfrutas", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 680 });
  await expect(page.locator('.today-card-body')).toBeVisible(); expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect.poll(() => page.locator('.home-panel-details').first().evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Ampliar lo que disfrutas", exact: true }).click();
  const dialog = page.getByRole("region", { name: "Lo que disfrutas", exact: true });
  await dialog.getByRole("link", { name: /Registrar/, exact: false }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sesion/${passes[0]}`));
  await page.goBack(); await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toBeHidden(); expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByRole("button", { name: "Ampliar lo que disfrutas", exact: true }).click(); await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Ampliar lo que disfrutas", exact: true }).click();
  await page.getByRole("link", { name: "Biblioteca", exact: true }).click();
  await expect(page).toHaveURL(/\/coleccion$/);
  await page.goBack(); await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Ampliar lo que disfrutas", exact: true }).click();
  await expect(dialog).toBeVisible();
});

test("Novedades deja abrir la crónica y conserva el panel al volver", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.getByRole("button", { name: "Ampliar Sale esta semana", exact: true }).click();
  await page.getByRole("button", { name: "Abrir tu crónica", exact: true }).click();
  const story = page.getByRole("dialog").filter({ has: page.locator("ol") });
  await expect(story).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(story).toBeHidden();
  await expect(page.getByRole("region", { name: "Sale esta semana", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Sale esta semana", exact: true }).getByRole("button", { name: "Recoger: Sale esta semana", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir tu crónica", exact: true })).toBeInViewport();
});

test("cola, colección y descubrimiento conservan sus vistas completas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await service.from("passes").update({ status: "planned", started_on: null, position: {} }).eq("user_id", actor.id)).error).toBeNull();
  await login(page);
  const trigger = page.getByRole("button", { name: "Ampliar lo que disfrutas", exact: true });
  await expect(trigger).toContainText("Tu siguiente historia");
  await trigger.click();
  const dialog = page.getByRole("region", { name: "Lo que disfrutas", exact: true });
  await expect(dialog.getByRole("button", { name: /Sacar un lomo/ })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  expect((await service.from("passes").delete().in("id", passes.slice(2))).error).toBeNull();
  expect((await service.from("passes").update({ status: "completed", started_on: today, finished_on: today, position: { page: 400 } }).eq("user_id", actor.id)).error).toBeNull();
  await page.reload(); await expect(trigger).toContainText("Volver a disfrutar");
  await trigger.click(); await expect(dialog.getByRole("button", { name: /Empezar/ }).first()).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  expect((await service.from("passes").delete().eq("user_id", actor.id)).error).toBeNull();
  expect((await service.from("cultural_releases").delete().in("id", releases)).error).toBeNull();
  await page.reload(); await expect(trigger).toContainText("Descubre algo nuevo");
  await trigger.click(); await expect(dialog.getByRole("link").first()).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Ampliar Sale esta semana", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sale esta semana", exact: true }).getByRole("link", { name: "Ver todas las novedades", exact: true })).toBeVisible();
});
