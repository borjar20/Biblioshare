import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";

// Una única suite, también importada por e2e/ci. Los cambios de viewport y
// scroll son nativos; login, búsqueda y selección usan el producto real.
// No depende de posts o usernames sembrados previamente en desarrollo.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const LOCAL = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(SUPABASE_URL);
const database = LOCAL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;
const marker = `qa765_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
// La búsqueda global usa ilike %query%: el autor debe quedar fuera del
// prefijo de las seis candidatas, también en su nombre visible.
const owner = { id: randomUUID(), username: marker.replace("qa765_", "owner765_"), email: `${marker}@example.test`,
  password: `Qa765!${randomUUID()}` };
const candidates = Array.from({ length: 6 }, (_, index) => ({
  id: randomUUID(), username: `${marker}_${index}`, email: `${marker}_${index}@example.test`,
  password: `Qa765!${randomUUID()}`,
}));
const actors = [owner, ...candidates];
const attempted = new Set<string>();
const bookId = randomUUID();
const postId = randomUUID();
const commentId = randomUUID();
const userTables = ["profiles", "pet_state", "pet_battles", "passes", "pet_acorn_ledger",
  "pet_cosmetics", "pet_daily_missions", "user_celebrations"];

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

async function auditRows() {
  const result: Array<{ table: string; count: number }> = [];
  for (const table of userTables) {
    const rows = check(await database!.from(table).select("user_id").in("user_id", actors.map(actor => actor.id)));
    expect(rows, `${table}: no filas de los actores propios`).toEqual([]);
    result.push({ table, count: rows!.length });
  }
  for (const [table, id] of [["books", bookId], ["posts", postId], ["comments", commentId]]) {
    const rows = check(await database!.from(table).select("id").eq("id", id));
    expect(rows, `${table}: fixture ausente`).toEqual([]);
    result.push({ table, count: rows!.length });
  }
  const targets = check(await database!.from("interaction_targets").select("id").in("source_id", [postId, commentId]));
  expect(targets, "targets de post y comentario ausentes").toEqual([]);
  result.push({ table: "interaction_targets", count: targets!.length });
  return result;
}

async function attach(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: JSON.stringify(value, null, 2), contentType: "application/json" });
}

test.use({ serviceWorkers: "block", trace: "off", screenshot: "off", deviceScaleFactor: 1 });

test.describe("El desplegable de @menciones sigue cabiendo sin teclear (#765)", () => {
  test.skip(!database || !ANON_KEY, "requiere Supabase local desechable; usar playwright.ci.config.ts");

  test.beforeAll(async ({}, info) => {
    for (const actor of actors) {
      expect((await database!.auth.admin.getUserById(actor.id)).error?.status, "UUID nuevo, nunca adoptar otro actor").toBe(404);
    }
    await attach(info, "cleanup-before", { marker, rows: await auditRows(), auth404: true });
    for (const actor of actors) {
      attempted.add(actor.id);
      const created = await database!.auth.admin.createUser({
        id: actor.id, email: actor.email, password: actor.password, email_confirm: true,
        user_metadata: { qa_marker: marker },
      });
      if (created.error) throw created.error;
      expect(created.data.user?.id).toBe(actor.id);
      check(await database!.from("profiles").upsert({
        user_id: actor.id, username: actor.username, display_name: actor.username,
        role: "user", is_public: true, onboarded_at: new Date().toISOString(), interests: ["book"],
      }));
    }
    check(await database!.from("books").insert({ id: bookId, title: marker, author: "Prueba de menciones" }));
    check(await database!.from("posts").insert({ id: postId, author_id: owner.id, kind: "thought",
      anchor_type: "book", anchor_id: bookId,
      body: Array.from({ length: 35 }, (_, index) => `Línea ${index + 1} del post de prueba.`).join("\n"),
    }));
    const target = check(await database!.from("interaction_targets").select("id").eq("kind", "post").eq("source_id", postId).single());
    // El comentario nativo deja contenido debajo del composer de escritorio:
    // se puede mover el campo entre los dos bordes sin cambiar su CSS.
    check(await database!.from("comments").insert({ id: commentId, author_id: owner.id,
      interaction_target_id: target!.id,
      body: Array.from({ length: 35 }, (_, index) => `Línea ${index + 1} del comentario de prueba.`).join("\n"),
    }));
  });

  test.afterAll(async ({}, info) => {
    if (!database) return;
    const cleanup: { globalSignOut: boolean; auth404: string[]; rows?: Awaited<ReturnType<typeof auditRows>> } = {
      globalSignOut: false, auth404: [],
    };
    try {
      // DELETE por REST antes del borrado Auth, filtrado por UUID y dueño.
      check(await database.from("comments").delete().eq("id", commentId).eq("author_id", owner.id));
      check(await database.from("posts").delete().eq("id", postId).eq("author_id", owner.id));
      check(await database.from("books").delete().eq("id", bookId).eq("title", marker));
      for (const actor of actors) {
        if (!attempted.has(actor.id)) continue;
        const existing = await database.auth.admin.getUserById(actor.id);
        if (existing.error?.status !== 404) {
          if (existing.error) throw existing.error;
          expect(existing.data.user?.email === actor.email && existing.data.user?.user_metadata.qa_marker === marker,
            "no borrar una cuenta ajena").toBe(true);
          if (actor.id === owner.id) {
            const session = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
            const signedIn = await session.auth.signInWithPassword({ email: actor.email, password: actor.password });
            if (signedIn.error) throw signedIn.error;
            expect(signedIn.data.user?.id).toBe(actor.id);
            const signedOut = await session.auth.signOut({ scope: "global" });
            if (signedOut.error) throw signedOut.error;
            cleanup.globalSignOut = true;
          }
          const deleted = await database.auth.admin.deleteUser(actor.id);
          if (deleted.error) throw deleted.error;
        }
        expect((await database.auth.admin.getUserById(actor.id)).error?.status).toBe(404);
        cleanup.auth404.push(actor.id);
      }
      cleanup.rows = await auditRows();
    } finally {
      await attach(info, "cleanup-after", { marker, ...cleanup });
    }
  });

  test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus && !page.isClosed()
        && new URL(page.url()).pathname !== "/login"
        && await page.locator('input[name="email"], input[name="password"]').count() === 0) {
      await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true });
    }
  });

  async function login(page: Page) {
    await page.goto("/login");
    await page.fill('input[name="email"]', owner.email);
    await page.fill('input[name="password"]', owner.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
    await page.goto(`/post/${postId}`);
    await page.evaluate(() => document.fonts.ready);
  }

  async function open(page: Page) {
    const input = page.getByPlaceholder(/escribe un comentario/i).first();
    await expect(input).toBeVisible();
    await input.click();
    await input.pressSequentially(`@${marker}`);
    const list = page.locator("ul[data-mention-list]");
    await expect(list).toBeVisible();
    await expect(list.getByRole("button")).toHaveCount(candidates.length);
    await expect(list.locator("button > span:first-child")).toHaveText(candidates.map(candidate => `@${candidate.username}`));
    await expect(input).toBeFocused();
    return { input, list };
  }

  async function geometry(page: Page) {
    return page.locator("ul[data-mention-list]").evaluate(list => {
      const rect = list.getBoundingClientRect();
      const viewport = window.visualViewport;
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        visibleTop: viewport?.offsetTop ?? 0,
        visibleBottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
        width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
        maxHeight: Number.parseFloat((list as HTMLElement).style.maxHeight),
        side: list.classList.contains("bottom-full") ? "arriba" : "abajo" };
    });
  }

  async function fits(page: Page, info: TestInfo, phase: string) {
    // Da tiempo a la medición agrupada por frame y a su render antes de leer
    // una caja que todavía podría caber con el alto anterior.
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect.poll(async () => {
      const box = await geometry(page);
      return box.top >= box.visibleTop && box.bottom <= box.visibleBottom && box.left >= 0
        && box.right <= box.width && box.documentWidth <= box.width;
    }, { message: `${phase}: los cuatro bordes de la lista deben caber` }).toBe(true);
    const box = await geometry(page);
    await attach(info, phase, box);
    await page.screenshot({ path: info.outputPath(`${phase}.png`) });
    return box;
  }

  async function positionDesktopAnchor(input: Locator, info: TestInfo, targetTop: number, phase: string) {
    // Primero se abre y enfoca: click/caret pueden desplazar el documento.
    // Sólo después movemos el campo mediante scroll nativo, sin alterar CSS.
    await input.evaluate((field, top) => {
      window.scrollBy({ top: field.getBoundingClientRect().top - top, behavior: "instant" });
    }, targetTop);
    await input.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const read = () => input.evaluate(field => {
      const rect = field.getBoundingClientRect();
      const viewport = window.visualViewport;
      const visibleTop = viewport?.offsetTop ?? 0;
      const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
      return { top: rect.top, bottom: rect.bottom, visibleTop, visibleBottom,
        roomAbove: rect.top - visibleTop, roomBelow: visibleBottom - rect.bottom,
        scrollY: window.scrollY, documentHeight: document.documentElement.scrollHeight,
        focused: document.activeElement === field };
    });
    let anchor = await read();
    try {
      await expect.poll(async () => {
        anchor = await read();
        return Math.abs(anchor.top - targetTop) < 1 && anchor.focused;
      }, { message: `${phase}: campo enfocado y colocado por scroll nativo en y=${targetTop}` }).toBe(true);
    } finally {
      await attach(info, phase, { targetTop, ...anchor });
    }
    expect(anchor.top, "el campo debe seguir dentro del área visible").toBeGreaterThan(anchor.visibleTop);
    expect(anchor.bottom, "el campo debe seguir dentro del área visible").toBeLessThan(anchor.visibleBottom);
    return anchor;
  }

  for (const width of [320, 360]) {
    test(`en móvil ${width}px, tras contraer, rotar y recuperar el viewport`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 740 });
      await login(page);
      let actions = 0;
      page.on("request", request => { if (request.method() === "POST" && request.headers()["next-action"]) actions++; });
      const { input, list } = await open(page);
      const before = await fits(page, info, "mobile-open");
      const searches = actions;
      expect(searches).toBeGreaterThan(0);

      await page.setViewportSize({ width, height: 300 });
      const short = await fits(page, info, "mobile-short");
      expect(short.maxHeight).toBeLessThan(before.maxHeight);
      await expect(input).toHaveValue(`@${marker}`);

      await page.setViewportSize({ width: 740, height: width });
      await fits(page, info, "mobile-rotated");
      await page.setViewportSize({ width, height: 740 });
      const restored = await fits(page, info, "mobile-restored");
      expect(restored.maxHeight).toBe(before.maxHeight);
      expect(actions, "ningún cambio de viewport debe consultar candidatos").toBe(searches);
      await list.getByRole("button", { name: `@${candidates[2].username}`, exact: false }).click();
      await expect(input).toHaveValue(`@${candidates[2].username} `);
      await expect(input).toBeFocused();
      await expect(list).toHaveCount(0);
    });
  }

  test("en escritorio, cambia de lado al hacer scroll de página sin teclear", async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    let actions = 0;
    page.on("request", request => { if (request.method() === "POST" && request.headers()["next-action"]) actions++; });
    const { input, list } = await open(page);
    const listHeight = await list.evaluate(element => element.getBoundingClientRect().height);
    const searches = actions;
    expect(searches).toBeGreaterThan(0);

    const lower = await positionDesktopAnchor(input, info, 720, "desktop-anchor-lower");
    expect(lower.roomAbove).toBeGreaterThan(listHeight);
    expect(lower.roomBelow).toBeLessThan(listHeight);
    const before = await fits(page, info, "desktop-open");
    expect(before.side).toBe("arriba");

    const upper = await positionDesktopAnchor(input, info, 100, "desktop-anchor-upper");
    expect(upper.roomAbove).toBeLessThan(listHeight);
    expect(upper.roomBelow).toBeGreaterThan(listHeight);
    expect(upper.scrollY, "el documento se ha desplazado con la lista abierta").toBeGreaterThan(lower.scrollY);
    const scrolled = await fits(page, info, "desktop-scrolled");
    expect(scrolled.side).toBe("abajo");
    const returned = await positionDesktopAnchor(input, info, 720, "desktop-anchor-returned");
    expect(returned.roomAbove).toBeGreaterThan(listHeight);
    expect(returned.roomBelow).toBeLessThan(listHeight);
    expect(returned.scrollY, "el documento ha vuelto a la posición inicial").toBeCloseTo(lower.scrollY, 0);
    const restored = await fits(page, info, "desktop-restored");
    expect(restored.side).toBe("arriba");
    expect(actions, "el scroll no debe consultar candidatos").toBe(searches);
    await expect(input).toHaveValue(`@${marker}`);
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue(`@${candidates[1].username} `);
    await expect(input).toBeFocused();
    await expect(list).toHaveCount(0);
  });
});
