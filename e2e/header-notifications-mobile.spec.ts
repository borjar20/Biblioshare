import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import type { Notification } from "../src/lib/social/notification-types";

// Cuenta persistente: no catálogo ni actores nuevos. Abrir marca avisos como leídos.
test.use({ trace: "off" });
test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD, "Requiere la cuenta persistente TEST_USER_*");
const widths = [320, 360, 390, 412, 768] as const;

async function login(page: Page) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) throw new Error("TEST_USER_EMAIL y TEST_USER_PASSWORD son necesarios");
  await page.goto("/login");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const bell = page.getByRole("button", { name: "Notificaciones", exact: true });
  await expect(bell).toBeVisible();
  // Si llega un aviso real, fallar antes de abrir: esta QA no debe cambiar read_at.
  await expect(bell.locator("span"), "precondición: la cuenta persistente no tiene avisos sin leer").toHaveCount(0);
}

function notificationPanel(page: Page): Locator {
  // Título visible durante carga, vacío y lista; no depende de clases CSS.
  return page.getByRole("region", { name: "Notificaciones", exact: true });
}

async function expectPanelFits(page: Page, panel: Locator) {
  const viewport = page.viewportSize()!;
  const bounds = await panel.boundingBox();
  const header = await page.locator("header").boundingBox();
  expect(bounds).not.toBeNull();
  expect(header).not.toBeNull();
  expect(bounds!.x, `borde izquierdo a ${viewport.width}px`).toBeGreaterThanOrEqual(16);
  expect(bounds!.x + bounds!.width, `borde derecho a ${viewport.width}px`).toBeLessThanOrEqual(viewport.width - 16);
  expect(bounds!.y, "el panel empieza debajo de la cabecera").toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(bounds!.y + bounds!.height, "el panel cabe también en altura").toBeLessThanOrEqual(viewport.height - 8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "sin scroll horizontal").toBe(viewport.width);
}

for (const theme of ["light", "dark"] as const) {
  test(`notification panel fits every viewport in ${theme} theme`, async ({ page }, testInfo) => {
    await page.addInitScript((choice) => localStorage.setItem("theme", choice), theme);
    await page.setViewportSize({ width: 320, height: 844 });
    await login(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    const bell = page.getByRole("button", { name: "Notificaciones", exact: true });
    await bell.click();
    const panel = notificationPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.locator("[aria-busy='true']")).toHaveCount(0);
    const rows = await panel.getByRole("listitem").count();
    if (rows === 0) await expect(panel.getByText("Todavía no tienes notificaciones.", { exact: true })).toBeVisible();
    else await expect(panel.getByRole("list")).toBeVisible();
    await testInfo.attach("real-loaded-state", { body: JSON.stringify({ state: rows ? "list" : "empty", rows }), contentType: "application/json" });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await testInfo.attach(`notification-${theme}-${width}`, { body: await page.screenshot(), contentType: "image/png" });
      await testInfo.attach(`bounds-${theme}-${width}`, { body: JSON.stringify({ width, panel: await panel.boundingBox(), header: await page.locator("header").boundingBox() }), contentType: "application/json" });
      await expectPanelFits(page, panel);
      const triggerBounds = await bell.boundingBox();
      expect(triggerBounds!.width, "objetivo táctil de campana").toBeGreaterThanOrEqual(44);
      expect(triggerBounds!.height, "objetivo táctil de campana").toBeGreaterThanOrEqual(44);
      const brand = await page.locator("header").getByRole("link", { name: "Biblioshare", exact: true }).boundingBox();
      expect(brand!.x + brand!.width, "la marca no se solapa con los controles").toBeLessThanOrEqual(triggerBounds!.x);
    }
    // La lectura real debe terminar: no acreditar sólo el marco del loading.
    await expect(panel.locator("[aria-busy='true']")).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expectPanelFits(page, panel);
  });
}

// Tema y perfil permanecen accesibles cuando cambia la disposición de la cabecera.
test("mobile menu keeps direct profile and exposes theme with keyboard navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "Mi perfil", exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Cambiar tema", exact: true })).toHaveCount(0);
  const trigger = header.getByRole("button", { name: "Más opciones", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowUp");
  const menu = page.getByRole("menu", { name: "Más opciones", exact: true });
  const theme = menu.getByRole("menuitem").filter({ hasText: /tema/i });
  await expect(menu).toBeVisible();
  await expect(theme).toBeFocused();
  await testInfo.attach("mobile-more-menu-390", { body: await page.screenshot(), contentType: "image/png" });
  const wasDark = await page.locator("html").evaluate((element) => element.classList.contains("dark"));
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${wasDark ? "light" : "dark"}\\b`));
  await expect(menu).toBeHidden();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  // Las flechas deben saltar la fila de tema oculta en escritorio.
  await page.setViewportSize({ width: 768, height: 844 });
  await expect(header.getByRole("button", { name: "Cambiar tema", exact: true })).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("ArrowUp");
  await expect(menu).toBeVisible();
  await expect(theme).toBeHidden();
  await expect(page.locator(":focus")).toHaveAttribute("role", "menuitem");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toBeVisible();
  await header.getByRole("link", { name: "Biblioshare", exact: true }).click();
  await expect(menu).toBeHidden();
});

test("notification panel stays reachable in a short viewport and dismisses accessibly", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await login(page);
  const bell = page.getByRole("button", { name: "Notificaciones", exact: true });
  await bell.click();
  const panel = notificationPanel(page);
  await expect(panel).toBeVisible();
  await expectPanelFits(page, panel);
  await expect(panel.locator("[aria-busy='true']")).toHaveCount(0);
  await expectPanelFits(page, panel);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
  await bell.click();
  await expect(panel).toBeVisible();
  await page.locator("header").getByRole("link", { name: "Biblioshare", exact: true }).click();
  await expect(panel).toBeHidden();
});


// Observaciones del mismo recorrido, sin capturar formularios ni credenciales.
const runtime = new WeakMap<Page, { errors: string[]; failed: Array<{ path: string; error: string | undefined }> }>();
test.beforeEach(async ({ page }) => {
  const observations = { errors: [] as string[], failed: [] as Array<{ path: string; error: string | undefined }> };
  runtime.set(page, observations);
  page.on("pageerror", (error) => observations.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") observations.errors.push(message.text()); });
  page.on("requestfailed", (request) => observations.failed.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
});
test.afterEach(async ({ page }, testInfo) => {
  const observations = runtime.get(page)!;
  await testInfo.attach("browser-runtime", { body: JSON.stringify(observations), contentType: "application/json" });
  expect(observations.errors, "sin errores de consola ni excepciones del navegador").toEqual([]);
});

// Sólo se sustituye la respuesta de lectura: login, chrome, CSS y renderer reales.
// No se crean filas en Supabase ni se modifica el permiso de notificaciones push.
test("mocked long notification list scrolls to its final row and footer in a short viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await login(page);
  const manifestPath = process.env.HEADER_NOTIFICATIONS_MANIFEST_PATH ?? [".next/dev/server/server-reference-manifest.json", ".next/server/server-reference-manifest.json"].find(existsSync);
  if (!manifestPath) throw new Error("Falta el manifest local para identificar únicamente fetchNotifications");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    node: Record<string, { filename?: string; exportedName?: string }>;
  };
  const action = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === "fetchNotifications" && entry.filename?.endsWith("src/lib/social/notification-actions.ts"));
  if (!action) throw new Error("fetchNotifications no figura en el manifest compilado");
  const fixture: Notification[] = Array.from({ length: 20 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    type: "new_follower",
    actorId: "00000000-0000-4000-8000-100000000001",
    actorUsername: "header_geometry_fixture",
    actorDisplayName: `Aviso de geometría ${index + 1} ${"TextoLargoSinEspacios".repeat(8)}`,
    actorAvatarUrl: null,
    href: "/",
    readAt: "2026-10-04T00:00:00.000Z",
    createdAt: "2026-10-04T00:00:00.000Z",
    extraActorsCount: 0,
    context: null,
  }));
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void;
  const requestReached = new Promise<void>((resolve) => { reached = resolve; });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || request.headers()["next-action"] !== action[0]) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.text();
    const rootLine = body.split("\n").find((line) => line.startsWith("0:{"));
    if (!rootLine) throw new Error("La lectura no devolvió una raíz Flight reconocible");
    const root = JSON.parse(rootLine.slice(2)) as { a?: string };
    const resultId = root.a?.match(/^\$@([0-9a-f]+)$/)?.[1];
    if (!resultId) throw new Error("La raíz Flight no contiene la promesa de resultado");
    const resultLine = body.split("\n").find((line) => line.startsWith(resultId + ":["));
    if (!resultLine || !Array.isArray(JSON.parse(resultLine.slice(resultId.length + 1)))) throw new Error("fetchNotifications no devolvió la lista esperada");
    reached();
    await held;
    await route.fulfill({ response, body: body.replace(resultLine, `${resultId}:${JSON.stringify(fixture)}`) });
  });
  const bell = page.getByRole("button", { name: "Notificaciones", exact: true });
  try {
    await bell.click();
    await requestReached;
    const panel = notificationPanel(page);
    await expect(panel.locator("[aria-busy='true']")).toBeVisible();
    await expectPanelFits(page, panel);
    await testInfo.attach("held-loading-320x360", { body: await page.screenshot(), contentType: "image/png" });
    release();
    await expect(panel.getByRole("listitem")).toHaveCount(20);
    await expect(panel.locator("[aria-busy='true']")).toHaveCount(0);
    await expectPanelFits(page, panel);
    const scroll = await panel.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
    expect(scroll.scroll, "el panel limita una lista larga y permite recorrerla").toBeGreaterThan(scroll.client);
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(panel.getByRole("listitem").last()).toBeInViewport();
    const footer = panel.locator("ul + div");
    await expect(footer).toBeInViewport();
    const footerBounds = await footer.boundingBox();
    const panelBounds = await panel.boundingBox();
    expect(footerBounds!.y + footerBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height);
    await testInfo.attach("long-list-bottom-320x360", { body: await page.screenshot(), contentType: "image/png" });
    await testInfo.attach("long-list-scroll", { body: JSON.stringify(scroll), contentType: "application/json" });
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
