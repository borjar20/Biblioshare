import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { deleteExperienceActor, experienceActor } from "./support/experience-fixtures";
import { visibleFormContaining } from "./support/visible-form";
import { follow } from "./support/margin-fixtures";
import {
  upsertWrapUp,
  weekFullPayload,
  wrapUpAdmin,
} from "./support/wrap-up-fixtures";
import type { WrapUpPayload } from "@/lib/wrap-ups/types";

// Crónicas (wrap-ups), spec 2026-10-06. Corre contra un build de PRODUCCIÓN
// (`npm run build && npm run start`), no `next dev`: un `use cache` mal puesto
// pasa el build y falla en `next start` (regla #437 de AGENTS.md).
//
// A y B son actores desechables. B sigue a A. Nunca se sustituyen las crónicas
// ni publicaciones de la cuenta QA persistente. La semilla usa service role
// (el cliente no puede escribir `wrap_ups`) en cada test, para que el reintento
// de Playwright parta otra vez de «sin ver y sin publicar».

type Actor = Awaited<ReturnType<typeof experienceActor>>;

const admin = wrapUpAdmin();
let ownerId = "";
let owner: Actor | undefined;
const contexts: BrowserContext[] = [];
let payload: WrapUpPayload;
let follower: Actor | undefined;

async function loggedInPage(browser: Browser, actor?: { email: string; password: string }) {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000", reducedMotion: "reduce" });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  await page.goto("/login");
  // Con build de producción el streaming puede dejar un segundo formulario en un
  // segmento oculto (strict mode lo veía doble en el primer intento): solo el visible.
  const form = visibleFormContaining(page, 'input[name="email"]');
  await form.locator('input[name="email"]').fill((actor ?? owner)!.email);
  await form.locator('input[name="password"]').fill((actor ?? owner)!.password);
  await form.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.describe("crónicas (wrap-ups)", () => {
  test.beforeAll(async () => {
    owner = await experienceActor("wrap-owner", true);
    ownerId = owner.id;
    const built = await weekFullPayload(admin, ownerId);
    payload = built.payload;
    console.log(`[wrap-ups] payload semanal: ${built.source}, ${payload.stories.length} stories, paleta ${payload.palette}`);
    follower = await experienceActor("wrap-follower", true);
    await follow(follower.id, ownerId);
  });

  test.beforeEach(async () => {
    await upsertWrapUp(admin, ownerId, payload);
  });

  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.close()));
  });

  test.afterAll(async () => {
    // Las dos limpiezas van por separado: que falle una no debe dejar la otra.
    const errors: unknown[] = [];
    if (follower) await deleteExperienceActor(follower).catch((e) => errors.push(e));
    if (owner) await deleteExperienceActor(owner).catch((e) => errors.push(e));
    if (errors.length) throw errors[0];
  });

  test("abrir, avanzar, publicar y verlo desde un seguidor", async ({ browser }) => {
    const a = await loggedInPage(browser);
    await a.goto("/");
    const cover = a.getByRole("link", { name: /^Tu semana/ });
    await expect(cover).toHaveAttribute("data-unseen", "true");
    await cover.click();
    await expect(a).toHaveURL(/\/wrap\/week$/);
    const player = a.getByRole("dialog");
    await expect(player).toBeVisible();

    // Avanza con el teclado hasta la story de cierre (la última): ahí viven las acciones.
    const total = payload.stories.length;
    for (let i = 1; i < total; i++) await a.keyboard.press("ArrowRight");
    await expect(player.getByRole("list", { name: `Story ${total} de ${total}` })).toBeVisible();
    // «Compartir» es botón si el dispositivo comparte ficheros; en Chrome de escritorio, enlace de descarga.
    await expect(player.getByRole("button", { name: "Compartir" }).or(player.getByRole("link", { name: "Descargar imagen" }))).toBeVisible();

    await player.getByRole("button", { name: "Publicar en el feed" }).click();
    await expect(player.getByText("Publicado", { exact: true })).toBeVisible();
    await expect(player.getByRole("button", { name: "Despublicar" })).toBeVisible();
    const { data: row } = await admin.from("wrap_ups").select("published_post_id,seen_at")
      .eq("user_id", ownerId).eq("kind", "week").single();
    expect(row?.published_post_id, "publish_wrap_up dejó el post enlazado").toBeTruthy();
    expect(row?.seen_at, "abrir la crónica la marca vista").toBeTruthy();

    // Escape cierra el <dialog> nativo y vuelve a la home, ya sin el anillo de «sin ver».
    await a.keyboard.press("Escape");
    await expect(a).toHaveURL(/\/$/);
    await expect(a.getByRole("link", { name: /^Tu semana/ })).toHaveAttribute("data-unseen", "false");

    // B (sigue a A) ve la tarjeta en su feed y abre la imagen grande.
    const b = await loggedInPage(browser, follower!);
    await b.goto("/");
    const card = b.getByTestId("wrap-up-feed-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("Su semana en Biblioshare")).toBeVisible();
    await card.getByRole("button", { name: "Ver la imagen de la crónica" }).click();
    const imageDialog = b.getByRole("dialog", { name: /^Crónica de / });
    await expect(imageDialog).toBeVisible();
    const img = imageDialog.getByRole("img");
    await expect(img).toHaveAttribute("src", /^\/api\/og\/wrap-up\/share\/[0-9a-f-]{36}$/);
    // La imagen la sirve la ruta con la sesión de B (misma RLS que el feed): tiene que cargar.
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 30_000 }).toBe(1080);
    await b.keyboard.press("Escape");
    await expect(imageDialog).toBeHidden();

    // Despublicar se lleva el post del feed de B (share → post por trigger).
    await a.goto("/wrap/week");
    await expect(a.getByRole("dialog")).toBeVisible();
    for (let i = 1; i < total; i++) await a.keyboard.press("ArrowRight");
    await a.getByRole("dialog").getByRole("button", { name: "Despublicar" }).click();
    await expect(a.getByRole("dialog").getByRole("button", { name: "Publicar en el feed" })).toBeVisible();
    await b.reload();
    await expect(b.getByTestId("wrap-up-feed-card")).toHaveCount(0);
  });

  test("la imagen publicada revalida perfil privado, seguimiento y bloqueo", async ({ browser, request }) => {
    const a = await loggedInPage(browser);
    await a.goto("/wrap/week");
    await expect(a.getByRole("dialog")).toBeVisible();
    for (let i = 1; i < payload.stories.length; i++) await a.keyboard.press("ArrowRight");
    await a.getByRole("dialog").getByRole("button", { name: "Publicar en el feed" }).click();
    await expect(a.getByRole("dialog").getByText("Publicado", { exact: true })).toBeVisible();
    const { data: share, error } = await admin.from("wrap_up_shares").select("id").eq("user_id", ownerId).eq("kind", "week").single();
    expect(error).toBeNull();
    const url = "/api/og/wrap-up/share/" + share!.id;
    const publicImage = await request.get(url);
    expect(publicImage.status()).toBe(200);
    expect(publicImage.headers()["cache-control"]).toContain("private");
    expect(publicImage.headers()["cache-control"]).toContain("no-cache");
    try {
      const privacy = await admin.from("profiles").update({ is_public: false }).eq("user_id", ownerId);
      expect(privacy.error).toBeNull();
      expect((await request.get(url)).status()).toBe(404);
      const b = await loggedInPage(browser, follower!);
      expect((await b.request.get(url)).status()).toBe(200);
      expect((await b.request.get("/api/og/wrap-up/week", { maxRedirects: 0 })).status()).not.toBe(200);
      const block = await admin.from("user_blocks").insert({ blocker_id: ownerId, blocked_id: follower!.id });
      expect(block.error).toBeNull();
      expect((await b.request.get(url)).status()).toBe(404);
      // El borrado autorizado del dueño arrastra share y post.
      const removed = await admin.from("wrap_ups").delete().eq("user_id", ownerId).eq("kind", "week");
      expect(removed.error).toBeNull();
      expect((await a.request.get(url)).status()).toBe(404);
      const remaining = await admin.from("wrap_up_shares").select("id").eq("id", share!.id);
      expect(remaining.data).toEqual([]);
    } finally {
      await admin.from("user_blocks").delete().eq("blocker_id", ownerId).eq("blocked_id", follower!.id);
      await admin.from("profiles").update({ is_public: true }).eq("user_id", ownerId);
    }
  });

  test("compartir web precarga una imagen lenta antes del clic", async ({ browser }) => {
    const a = await loggedInPage(browser);
    await a.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
        (window as unknown as { wrapShare: unknown }).wrapShare = {
          active: navigator.userActivation.isActive, name: data.files?.[0].name, size: data.files?.[0].size,
        };
      } });
    });
    // La ruta real termina de generar el PNG tras agotar la activación de un clic.
    await a.route("**/api/og/wrap-up/week", async (route) => {
      await new Promise(resolve => setTimeout(resolve, 6200));
      await route.continue();
    });
    await a.goto("/wrap/week");
    await expect(a.getByRole("dialog")).toBeVisible();
    for (let i = 1; i < payload.stories.length; i++) await a.keyboard.press("ArrowRight");
    const share = a.getByRole("dialog").getByRole("button", { name: "Compartir", exact: true });
    await expect(share).toBeEnabled({ timeout: 30_000 });
    await share.click();
    await expect.poll(() => a.evaluate(() => (window as unknown as { wrapShare: unknown }).wrapShare)).toMatchObject({ active: true, name: "biblioshare-week.png" });
    const size = await a.evaluate(() => (window as unknown as { wrapShare: { size: number } }).wrapShare.size);
    expect(size).toBeGreaterThan(1000);
  });

  test("la imagen es un PNG 1080×1920", async ({ browser }) => {
    const a = await loggedInPage(browser);
    const res = await a.request.get("/api/og/wrap-up/week");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    const buf = await res.body();
    expect(buf.readUInt32BE(16)).toBe(1080);
    expect(buf.readUInt32BE(20)).toBe(1920);
  });

  test("sin sesión, la imagen del dueño no se sirve", async ({ request }) => {
    const res = await request.get("/api/og/wrap-up/week", { maxRedirects: 0 });
    expect(res.status()).not.toBe(200);
    expect(res.headers()["content-type"] ?? "").not.toContain("image/png");
  });
});
