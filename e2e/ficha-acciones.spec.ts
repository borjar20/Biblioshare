import { test, expect, type Page } from "@playwright/test";
import { FINAL_EMPIRE_FILTER } from "./support/book-fixture";
import { submitLogin } from "./support/visible-form";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E de los botones y acciones de la ficha (spec 2026-11-10-ficha-acciones):
// las intenciones que sustituyen a «Seguir», la tarjeta del hero como mando de
// la obra (estado, acción principal y nota) y las hojas que se abren desde
// cualquier pestaña. Se corre contra build de producción.
//
// Fixtures: obras del catálogo que `devtest` NO tiene (se le borran los pases
// creados al terminar) y el pase real de «The Final Empire», fotografiado antes
// y restaurado en `finally`. Los helpers están copiados de cierre-ritual.spec.ts
// (los specs no se importan entre sí), con comprobación de `res.ok` para que
// una restauración que falla se vea.

test.use({ contextOptions: { reducedMotion: "reduce" } });

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(60_000);
});

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} falló: ${res.status}`);
  return (await res.json()) as T;
}

async function patch(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} falló: ${res.status}`);
}

async function del(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error(`DELETE ${path} falló: ${res.status}`);
}

async function devtestId(): Promise<string> {
  const [row] = await rest<{ user_id: string }[]>(
    `profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
  );
  if (!row) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return row.user_id;
}

async function login(page: Page) {
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

const PASS_COLUMNS = "status,position,started_on,finished_on,rating,review,is_public";
type PassSnapshot = Record<string, unknown>;

async function snapshotPass(passId: string): Promise<PassSnapshot> {
  const [row] = await rest<PassSnapshot[]>(`passes?id=eq.${passId}&select=${PASS_COLUMNS}`);
  if (!row) throw new Error(`no se pudo fotografiar el pase ${passId}`);
  return row;
}

async function sessionIds(passId: string): Promise<Set<string>> {
  const rows = await rest<{ id: string }[]>(`progress_sessions?pass_id=eq.${passId}&select=id`);
  return new Set(rows.map((r) => r.id));
}

async function deleteNewSessions(passId: string, before: Set<string>) {
  const newIds = [...(await sessionIds(passId))].filter((id) => !before.has(id));
  if (newIds.length === 0) return;
  await del(`progress_sessions?id=in.(${newIds.join(",")})`);
}

// Terminar una obra publica sola su post `finished` (autopost.ts): se borra lo
// que el test haya creado sobre esa obra.
async function postIds(userId: string, anchorId: string): Promise<Set<string>> {
  const rows = await rest<{ id: string }[]>(`posts?author_id=eq.${userId}&anchor_id=eq.${anchorId}&select=id`);
  return new Set(rows.map((r) => r.id));
}

async function deleteNewPosts(userId: string, anchorId: string, before: Set<string>) {
  const newIds = [...(await postIds(userId, anchorId))].filter((id) => !before.has(id));
  if (newIds.length === 0) return;
  await del(`posts?id=in.(${newIds.join(",")})`);
}

type WorkType = "book" | "movie";
const TABLE = { book: "books", movie: "movies" } as const;
const SEGMENT = { book: "libro", movie: "pelicula" } as const;

// Una obra del catálogo sobre la que devtest no tiene NINGÚN pase (ni archivado):
// al terminar se le pueden borrar todos sin tocar nada suyo. Con portada, para
// que la ficha sea una ficha corriente. Falla en voz alta si no hay ninguna.
async function freeWork(type: WorkType, userId: string): Promise<string> {
  const owned = new Set(
    (await rest<{ item_id: string }[]>(`passes?user_id=eq.${userId}&item_type=eq.${type}&select=item_id`)).map(
      (r) => r.item_id,
    ),
  );
  const candidates = await rest<{ id: string }[]>(
    `${TABLE[type]}?select=id&cover_url=not.is.null&order=id.asc&limit=500`,
  );
  const id = candidates.find((c) => !owned.has(c.id))?.id;
  expect(id, `falta en este entorno un ${TABLE[type]} sin pase de ${USERNAME}`).toBeTruthy();
  return id!;
}

type PassRow = { id: string; status: string; rating: number | null; is_active: boolean };

async function passesOn(type: WorkType, itemId: string, userId: string): Promise<PassRow[]> {
  return rest<PassRow[]>(
    `passes?user_id=eq.${userId}&item_type=eq.${type}&item_id=eq.${itemId}&select=id,status,rating,is_active`,
  );
}

async function activePass(type: WorkType, itemId: string, userId: string): Promise<PassRow | undefined> {
  return (await passesOn(type, itemId, userId)).find((p) => p.is_active);
}

// Limpieza de una obra que devtest no tenía: fuera sus pases y lo que se publicó.
async function forgetWork(type: WorkType, itemId: string, userId: string, postsBefore: Set<string>) {
  await deleteNewPosts(userId, itemId, postsBefore);
  await del(`passes?user_id=eq.${userId}&item_type=eq.${type}&item_id=eq.${itemId}`);
  const left = await passesOn(type, itemId, userId);
  if (left.length > 0) throw new Error(`quedan ${left.length} pases de ${USERNAME} sobre ${itemId}`);
}

async function openFicha(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("tablist")).toBeVisible();
  // Un clic antes de hidratar se pierde sin error: se espera a que la red calle.
  await page.waitForLoadState("networkidle").catch(() => {});
}

// La escritura ha aterrizado: el badge OPTIMISTA aparece antes de que exista la
// fila (TRAMPAS §16) y aria-busy baja a false al terminar (issue #106).
async function settled(page: Page) {
  const badge = page.locator('[data-testid="status-badge"]');
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await expect(badge).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
}

function tab(page: Page, id: "info" | "community" | "log") {
  return page.locator(`#item-tab-${id}`);
}

const CLOSE_HEADING = "¿Qué te ha parecido?";

test.describe("con sesión", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  test("«Quiero leerlo» deja la obra pendiente sin cambiar de pestaña", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const bookId = await freeWork("book", userId);
    const postsBefore = await postIds(userId, bookId);

    try {
      await login(page);
      await openFicha(page, `/libro/${bookId}`);
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("button", { name: "Seguir", exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "Quiero leerlo", exact: true }).click();
      await settled(page);

      await expect.poll(async () => (await activePass("book", bookId, userId))?.status ?? null).toBe("planned");
      // Ninguna intención cambia de pestaña: aparece «Mi registro», pero sigue Información.
      await expect(tab(page, "log")).toBeVisible();
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
      expect(page.url()).not.toContain("tab=log");
      // Pendiente: el estado marcado en la tarjeta y sin puntos de nota.
      await expect(
        page.getByRole("group", { name: "Tu estado" }).getByRole("button", { name: "Pendiente", pressed: true }),
      ).toBeVisible();
      await expect(page.getByTestId("pass-card-rating")).toHaveCount(0);
    } finally {
      await forgetWork("book", bookId, userId, postsBefore);
    }
  });

  test("«Lo estoy leyendo» deja la obra en curso", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const bookId = await freeWork("book", userId);
    const postsBefore = await postIds(userId, bookId);

    try {
      await login(page);
      await openFicha(page, `/libro/${bookId}`);
      await page.getByRole("button", { name: "Lo estoy leyendo", exact: true }).click();
      await settled(page);

      await expect.poll(async () => (await activePass("book", bookId, userId))?.status ?? null).toBe("in_progress");
      await expect(
        page.getByRole("group", { name: "Tu estado" }).getByRole("button", { name: "Leyendo", pressed: true }),
      ).toBeVisible();
      // En curso, la acción principal es registrar una sesión.
      await expect(page.getByRole("button", { name: "Registrar sesión", exact: true })).toBeVisible();
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
    } finally {
      await forgetWork("book", bookId, userId, postsBefore);
    }
  });

  test("«Ya la vi» en una película abre el cierre y «Ahora no» la deja vista sin nota", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const movieId = await freeWork("movie", userId);
    const postsBefore = await postIds(userId, movieId);

    try {
      await login(page);
      await openFicha(page, `/pelicula/${movieId}`);
      // Una película se ve de una sentada: no hay «La estoy viendo».
      await expect(page.getByRole("button", { name: "La estoy viendo" })).toHaveCount(0);
      await page.getByRole("button", { name: "Ya la vi", exact: true }).click();

      await expect(page.getByRole("heading", { name: CLOSE_HEADING })).toBeVisible({ timeout: 20_000 });
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "Ahora no" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await expect
        .poll(async () => {
          const pass = await activePass("movie", movieId, userId);
          return pass ? `${pass.status}|${pass.rating}` : "";
        })
        .toBe("completed|null");
    } finally {
      await forgetWork("movie", movieId, userId, postsBefore);
    }
  });

  test("cambiar a terminado desde la tarjeta abre el cierre en Información", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const bookId = await freeWork("book", userId);
    const postsBefore = await postIds(userId, bookId);

    try {
      await login(page);
      await openFicha(page, `/libro/${bookId}`);
      await page.getByRole("button", { name: "Lo estoy leyendo", exact: true }).click();
      await settled(page);
      await expect.poll(async () => (await activePass("book", bookId, userId))?.status ?? null).toBe("in_progress");

      await page.getByRole("group", { name: "Tu estado" }).getByRole("button", { name: "Leído" }).click();
      await expect(page.getByRole("heading", { name: CLOSE_HEADING })).toBeVisible({ timeout: 20_000 });
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "Ahora no" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await expect.poll(async () => (await activePass("book", bookId, userId))?.status ?? null).toBe("completed");
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
      expect(page.url()).not.toContain("tab=");
    } finally {
      await forgetWork("book", bookId, userId, postsBefore);
    }
  });

  test("pulsar «8/10» en la tarjeta deja la nota 8 en el pase", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const bookId = await freeWork("book", userId);
    const postsBefore = await postIds(userId, bookId);

    try {
      await login(page);
      await openFicha(page, `/libro/${bookId}`);
      await page.getByRole("button", { name: "Lo estoy leyendo", exact: true }).click();
      await settled(page);
      await expect.poll(async () => (await activePass("book", bookId, userId))?.status ?? null).toBe("in_progress");

      const rating = page.getByTestId("pass-card-rating");
      await rating.getByRole("button", { name: "8/10", exact: true }).click();
      // Optimista: la tarjeta la enseña ya; la BD, cuando aterriza la escritura.
      await expect(rating).toHaveAttribute("data-value", "8");
      await settled(page);
      await expect.poll(async () => (await activePass("book", bookId, userId))?.rating ?? null).toBe(8);
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
    } finally {
      await forgetWork("book", bookId, userId, postsBefore);
    }
  });

  test("«Marcar vista» con la pestaña Comunidad activa abre el cierre ahí", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const movieId = await freeWork("movie", userId);
    const postsBefore = await postIds(userId, movieId);

    try {
      await login(page);
      await openFicha(page, `/pelicula/${movieId}`);
      await page.getByRole("button", { name: "Quiero verla", exact: true }).click();
      await settled(page);
      await expect.poll(async () => (await activePass("movie", movieId, userId))?.status ?? null).toBe("planned");

      await tab(page, "community").click();
      await expect(tab(page, "community")).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#item-tabpanel-community")).toBeVisible();

      await page.getByRole("button", { name: "Marcar vista", exact: true }).click();
      await expect(page.getByRole("heading", { name: CLOSE_HEADING })).toBeVisible({ timeout: 20_000 });
      await expect(tab(page, "community")).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "Ahora no" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await expect.poll(async () => (await activePass("movie", movieId, userId))?.status ?? null).toBe("completed");
      await expect(tab(page, "community")).toHaveAttribute("aria-selected", "true");
    } finally {
      await forgetWork("movie", movieId, userId, postsBefore);
    }
  });

  test("terminar un libro desde la sesión abre el cierre con Información activa", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const [book] = await rest<{ id: string; total_pages: number | null }[]>(
      `books?${FINAL_EMPIRE_FILTER}&select=id,total_pages`,
    );
    if (!book) throw new Error("no se encontró el libro fixture en catálogo");
    const [pass] = await rest<{ id: string; edition_id: string | null }[]>(
      `passes?user_id=eq.${userId}&item_type=eq.book&item_id=eq.${book.id}&is_active=eq.true&select=id,edition_id`,
    );
    if (!pass) throw new Error('devtest no tiene pase activo sobre "The Final Empire"');
    let total = book.total_pages;
    if (pass.edition_id) {
      const [edition] = await rest<{ total_pages: number | null }[]>(
        `book_editions?id=eq.${pass.edition_id}&select=total_pages`,
      );
      total = edition?.total_pages ?? total;
    }
    if (!total) throw new Error("sin total_pages resoluble para el libro fixture");

    const snapshot = await snapshotPass(pass.id);
    const sessionsBefore = await sessionIds(pass.id);
    const postsBefore = await postIds(userId, book.id);

    try {
      await patch(`passes?id=eq.${pass.id}`, {
        position: { page: total - 1 },
        status: "in_progress",
        finished_on: null,
        rating: null,
        review: null,
      });

      await login(page);
      await openFicha(page, `/libro/${book.id}`);
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");

      // La acción principal de la tarjeta es un botón: abre la hoja de sesión.
      await page.getByRole("button", { name: "Registrar sesión", exact: true }).click();
      await page.waitForURL(/\/sesion\//, { timeout: 15_000 });
      const sheet = page.getByRole("dialog");
      await sheet.locator('input[name="page"]').fill(String(total));
      await sheet.getByRole("button", { name: "Guardar sesión" }).click();

      // El cierre sube encima de la hoja de sesión con la ficha detrás, en Información.
      await expect(page.getByRole("heading", { name: CLOSE_HEADING })).toBeVisible({ timeout: 20_000 });
      await expect(tab(page, "info")).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "Ahora no" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });

      // Al salir de la hoja de sesión se vuelve a la ficha en Mi registro, a
      // propósito y desde antes de esta spec (exitHref de la ruta interceptada,
      // session-modal.tsx: «que se vea la sesión recién guardada»).
      await expect(page).toHaveURL(new RegExp(`/libro/${book.id}\\?tab=log$`));
      await expect.poll(async () => (await snapshotPass(pass.id)).status).toBe("completed");
    } finally {
      await patch(`passes?id=eq.${pass.id}`, snapshot);
      await deleteNewSessions(pass.id, sessionsBefore);
      await deleteNewPosts(userId, book.id, postsBefore);
    }
  });

  test("?cerrar=<pase> abre el cierre aunque la pestaña sea Comunidad", async ({ page }) => {
    test.setTimeout(90_000);
    const userId = await devtestId();
    const [book] = await rest<{ id: string }[]>(`books?${FINAL_EMPIRE_FILTER}&select=id`);
    if (!book) throw new Error("no se encontró el libro fixture en catálogo");
    const [pass] = await rest<{ id: string }[]>(
      `passes?user_id=eq.${userId}&item_type=eq.book&item_id=eq.${book.id}&is_active=eq.true&select=id`,
    );
    if (!pass) throw new Error('devtest no tiene pase activo sobre "The Final Empire"');
    const snapshot = await snapshotPass(pass.id);

    try {
      await login(page);
      await page.goto(`/libro/${book.id}?tab=community&cerrar=${pass.id}`);
      await expect(page.getByRole("heading", { name: CLOSE_HEADING })).toBeVisible({ timeout: 20_000 });
      await expect(tab(page, "community")).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "Ahora no" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await patch(`passes?id=eq.${pass.id}`, snapshot);
    }
  });

  test("Mi registro no tiene selector de estado ni «Quitar de mi biblioteca»", async ({ page }) => {
    const userId = await devtestId();
    const [book] = await rest<{ id: string }[]>(`books?${FINAL_EMPIRE_FILTER}&select=id`);
    if (!book) throw new Error("no se encontró el libro fixture en catálogo");
    const pass = await activePass("book", book.id, userId);
    if (!pass) throw new Error('devtest no tiene pase activo sobre "The Final Empire"');

    await login(page);
    await page.goto(`/libro/${book.id}?tab=log`);
    const panel = page.locator("#item-tabpanel-log");
    await expect(panel).toBeVisible();
    // El historial sí está: así la ausencia de abajo no pasa con un panel vacío.
    await expect(panel.getByTestId("diary-entry").first()).toBeVisible();
    await expect(panel.getByRole("group", { name: "Tu estado" })).toHaveCount(0);
    await expect(panel.getByText("Quitar de mi biblioteca")).toHaveCount(0);
    // El estado se cambia en la tarjeta, una sola vez en la página.
    await expect(page.getByRole("group", { name: "Tu estado" })).toHaveCount(1);
  });

  // Mi registro perdió su enlace rojo: en escritorio la barra del cartel no se
  // pinta, así que el ⋯ va junto a los chips de la cabecera (data-testid
  // hero-menu-desktop). Sin él no habría forma de quitar la obra en PC. Solo se
  // abre el menú: no se confirma el borrado.
  test("a 1440 px el ⋯ de la cabecera ofrece «Quitar de mi biblioteca»", async ({ page }) => {
    const userId = await devtestId();
    const [book] = await rest<{ id: string }[]>(`books?${FINAL_EMPIRE_FILTER}&select=id`);
    if (!book) throw new Error("no se encontró el libro fixture en catálogo");
    if (!(await activePass("book", book.id, userId))) {
      throw new Error('devtest no tiene pase activo sobre "The Final Empire"');
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await openFicha(page, `/libro/${book.id}`);
    const desktopMenu = page.getByTestId("hero-menu-desktop");
    await expect(desktopMenu).toBeVisible();
    await desktopMenu.getByRole("button", { name: "Más opciones" }).click();
    const menu = page.getByRole("dialog", { name: "Más opciones" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Quitar de mi biblioteca" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    // Nada escrito: el pase sigue ahí.
    expect(await activePass("book", book.id, userId)).toBeTruthy();
  });
});

test("anónimo: «Quiero leerlo» lleva a /login y vuelve a la ficha sin escribir", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(90_000);
  const userId = await devtestId();
  const bookId = await freeWork("book", userId);
  const postsBefore = await postIds(userId, bookId);

  try {
    await openFicha(page, `/libro/${bookId}`);
    await page.getByRole("button", { name: "Quiero leerlo", exact: true }).click();
    await page.waitForURL(/\/login\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toBe(`/libro/${bookId}`);

    await submitLogin(page, EMAIL, PASSWORD);
    await page.waitForURL(new RegExp(`/libro/${bookId}$`));
    // El clic anónimo no escribió nada: la tarjeta sigue ofreciendo las intenciones.
    await expect(page.getByRole("button", { name: "Quiero leerlo", exact: true })).toBeVisible();
    expect(await passesOn("book", bookId, userId)).toEqual([]);
  } finally {
    await forgetWork("book", bookId, userId, postsBefore);
  }
});
