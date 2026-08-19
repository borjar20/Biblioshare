import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E del rediseño de registrar sesión (spec 2026-07-20-registrar-sesion-v2,
// Tareas 1-7): `/sesion/[passId]` pasó de página completa a ruta
// interceptada — modal a pantalla completa en móvil, tarjeta centrada en pc
// — sin perder la página de origen; el guardado ya NO redirige en servidor
// (el cliente cierra con router.back(), un solo salto de historial); el
// auto-cierre (sesión que alcanza el final) encadena la hoja de cierre como
// un SEGUNDO <dialog> apilado; y los bloques de libro/serie llevan la
// rejilla de episodios acotada con scroll propio. Todo esto ya se comprobó
// a mano en un navegador real — este fichero existe para que esa cobertura
// no se pierda, no para descubrir si funciona.
//
// Independiente de pase-hub.spec.ts a propósito: no usa test.describe.serial
// ni depende de un bookId que otro test haya creado antes. Usa fixtures
// REALES y persistentes de la cuenta `devtest` ("The Final Empire",
// "Juego de tronos"), resueltas por título/consulta — nunca por UUID fijo —
// para sobrevivir a un reset de la base de datos de dev. headers()/
// devtestId() están copiados de pase-hub.spec.ts (no se importan: los specs
// de e2e no se referencian entre sí), tal como pide el brief de la Tarea 8.

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

let cachedUserId: string | null = null;
async function devtestId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: headers() },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  cachedUserId = rows[0].user_id;
  return cachedUserId;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// ─────────────────────────────────────────────────────────────────────────
// Fixtures reales de devtest, resueltas por título (no por UUID fijo, para
// sobrevivir a un reset de dev). "The Final Empire" es normalmente
// in_progress con position={}; "Juego de tronos" normalmente completed con
// 8 temporadas — ver contexto de la Tarea 8. Preparar datos por la UI es
// frágil (docs/TRAMPAS.md §15): estos helpers solo LEEN por REST, la UI es
// para verificar.
// ─────────────────────────────────────────────────────────────────────────

type BookFixture = { itemId: string; passId: string; total: number };

async function resolveBookFixture(userId: string): Promise<BookFixture> {
  const bookRes = await fetch(
    `${SUPABASE_URL}/rest/v1/books?title=eq.${encodeURIComponent("The Final Empire")}&select=id,total_pages`,
    { headers: headers() },
  );
  const [book] = (await bookRes.json()) as {
    id: string;
    total_pages: number | null;
  }[];
  if (!book) throw new Error('no se encontró el libro fixture "The Final Empire" en catálogo');

  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${userId}&item_type=eq.book&item_id=eq.${book.id}&is_active=eq.true&select=id`,
    { headers: headers() },
  );
  const [pass] = (await passRes.json()) as { id: string }[];
  if (!pass) throw new Error('devtest no tiene pase activo sobre "The Final Empire"');

  // El total contra el que valida addSession es la EDICIÓN primaria, no
  // books.total_pages (mismo criterio que maxBookPosition en pase-hub.spec.ts).
  const editionRes = await fetch(
    `${SUPABASE_URL}/rest/v1/book_editions?book_id=eq.${book.id}&is_primary=eq.true&select=total_pages&limit=1`,
    { headers: headers() },
  );
  const [edition] = (await editionRes.json()) as { total_pages: number | null }[];
  const total = edition?.total_pages ?? book.total_pages;
  if (!total) throw new Error('sin total_pages resoluble para "The Final Empire"');

  return { itemId: book.id, passId: pass.id, total };
}

type SeriesFixture = { itemId: string; passId: string };

async function resolveSeriesFixture(userId: string): Promise<SeriesFixture> {
  const seriesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/series?title=eq.${encodeURIComponent("Juego de tronos")}&select=id`,
    { headers: headers() },
  );
  const [series] = (await seriesRes.json()) as { id: string }[];
  if (!series) throw new Error('no se encontró la serie fixture "Juego de tronos" en catálogo');

  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${userId}&item_type=eq.series&item_id=eq.${series.id}&is_active=eq.true&select=id`,
    { headers: headers() },
  );
  const [pass] = (await passRes.json()) as { id: string }[];
  if (!pass) throw new Error('devtest no tiene pase activo sobre "Juego de tronos"');

  return { itemId: series.id, passId: pass.id };
}

// Instantánea completa del pase para devolverlo exactamente a como estaba:
// los tests de guardado mutan position/status (addSession) y, si encadenan
// la hoja de cierre, también finished_on/rating/review/is_public (closePass
// — ver savePassFields en src/lib/passes/actions.ts). `devtest` es una
// cuenta persistente y compartida: dejar un pase cerrado o con la página
// movida envenena corridas futuras (mismo principio que el teardown de
// pase-hub.spec.ts, aplicado aquí a un UPDATE en vez de a un DELETE).
type PassSnapshot = Record<string, unknown>;

async function snapshotPass(passId: string): Promise<PassSnapshot> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?id=eq.${passId}&select=status,position,started_on,finished_on,rating,review,is_public`,
    { headers: headers() },
  );
  const [row] = (await res.json()) as PassSnapshot[];
  if (!row) throw new Error(`no se pudo fotografiar el pase ${passId}`);
  return row;
}

async function restorePass(passId: string, snapshot: PassSnapshot) {
  await fetch(`${SUPABASE_URL}/rest/v1/passes?id=eq.${passId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(snapshot),
  });
}

// addSession inserta en progress_sessions (nunca lo deshace un cierre): hay
// que anotar los ids existentes ANTES de guardar y borrar solo los NUEVOS
// después — la obra sigue viva, así que no se puede simplemente vaciar la
// tabla para ese pase.
async function sessionIds(passId: string): Promise<Set<string>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/progress_sessions?pass_id=eq.${passId}&select=id`,
    { headers: headers() },
  );
  const rows = (await res.json()) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

async function deleteNewSessions(passId: string, before: Set<string>) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/progress_sessions?pass_id=eq.${passId}&select=id`,
    { headers: headers() },
  );
  const rows = (await res.json()) as { id: string }[];
  const newIds = rows.map((r) => r.id).filter((id) => !before.has(id));
  if (newIds.length === 0) return;
  await fetch(`${SUPABASE_URL}/rest/v1/progress_sessions?id=in.(${newIds.join(",")})`, {
    method: "DELETE",
    headers: headers(),
  });
}

// Deja el pase parado en la penúltima página de su edición: la sesión de
// después alcanza justo el final y dispara el auto-cierre (mismo patrón que
// parkPassBeforeEnd del brief de la Tarea 8).
async function parkBookPassBeforeEnd(passId: string, total: number) {
  await fetch(`${SUPABASE_URL}/rest/v1/passes?id=eq.${passId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ position: { page: total - 1 }, status: "in_progress" }),
  });
}

// La ficha (?tab=log) puede tener VARIOS enlaces a /sesion/<passId>: el CTA
// del rail (junto a la portada) para libro, y el de la sección Sesiones
// (session-list.tsx, SIEMPRE "Registrar sesión" mientras haya un pase
// activo). Para SERIE el CTA del rail no apunta a /sesion en absoluto — va a
// `?tab=episodes` ("Marcar episodio", ver src/app/serie/[id]/page.tsx) — así
// que contar índices por href (nth(1)) NO es fiable entre tipos de medio: en
// libro hay 2-3 enlaces con ese href, en serie solo 1. En vez de adivinar un
// índice, se ancla al propio bloque "Sesiones" (session-list.tsx: el h3 y el
// link son hermanos en el mismo contenedor) — funciona igual para los dos
// tipos y no depende de cuántos otros enlaces compartan el href.
function sessionLink(page: Page, passId: string) {
  const heading = page.getByRole("heading", { name: "Sesiones", level: 3 });
  return heading
    .locator("xpath=..")
    .getByRole("link", { name: /registrar sesión/i })
    .and(page.locator(`[href="/sesion/${passId}"]`));
}

test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

test("el enlace de la ficha abre un dialog con la pagina de origen detras; la navegacion dura renderiza la pagina completa sin dialogs", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId } = await resolveBookFixture(userId);

  const originUrl = `/libro/${itemId}?tab=log`;
  await page.goto(originUrl);

  await sessionLink(page, passId).click();
  await page.waitForURL(/\/sesion\//, { timeout: 15_000 });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Registrar sesión").first()).toBeVisible();

  // La página de origen sigue MONTADA detrás del modal (soft nav de la ruta
  // interceptada, no un hard nav a /sesion): su h1 sigue en el árbol aunque
  // el diseño lo tape.
  await expect(
    page.getByRole("heading", { name: "The Final Empire", level: 1 }),
  ).toHaveCount(1);

  const deepLinkUrl = page.url();

  // Navegación DURA al MISMO passId: sin interceptar. Página completa
  // propia (metadata "Guardar sesión — Biblioshare", ver
  // src/app/sesion/[passId]/page.tsx) y CERO dialogs abiertos.
  await page.goto(deepLinkUrl);
  await expect(page).toHaveTitle(/Guardar sesión/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("escape, clic en el fondo y el boton X cierran el modal con UN SOLO salto de historial", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId } = await resolveBookFixture(userId);
  const originUrl = `/libro/${itemId}?tab=log`;
  const dialog = page.getByRole("dialog");

  // Esta es LA regresión que más importa cubrir: un bug real hizo que el
  // <dialog> exterior (session-modal.tsx) y ClosePassSheet dispararan CADA
  // UNO su propio router.back() para el mismo gesto de cierre — dos saltos
  // de historial en vez de uno, que dejaban al usuario en el INICIO en vez
  // de en la ficha de origen. El fix (closeOnce con un ref, ver
  // session-modal.tsx) vive en un solo sitio; aquí se comprueba el
  // contrato desde fuera para las tres salidas que no implican guardar.
  await page.goto(originUrl);

  await sessionLink(page, passId).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(originUrl);

  // Clic en el fondo: fuera de la tarjeta centrada (pc), e.target === el
  // propio <dialog> (comprobado: session-modal.tsx documenta este mismo
  // comportamiento), que dispara el mismo cierre que Escape.
  await sessionLink(page, passId).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(originUrl);

  // Botón ✕ (aria-label="Cerrar").
  await sessionLink(page, passId).click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(originUrl);
});

test("guardar una sesion normal (sin autocierre) cierra el modal con un solo salto de historial", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId } = await resolveBookFixture(userId);
  const originUrl = `/libro/${itemId}?tab=log`;

  const passSnapshot = await snapshotPass(passId);
  const sessionsBefore = await sessionIds(passId);

  try {
    await page.goto(originUrl);
    const dialog = page.getByRole("dialog");
    await sessionLink(page, passId).click();
    await expect(dialog).toBeVisible();

    // Página 5: lejísimos del total (669), así que nunca dispara el
    // auto-cierre por accidente.
    await dialog.locator('input[name="page"]').fill("5");
    await dialog.getByRole("button", { name: "Guardar sesión" }).click();

    // Un guardado normal (sin passClosed) sale por el MISMO closeSheet que
    // Escape/backdrop/✕: un solo dialog, un solo salto de historial.
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(originUrl);
  } finally {
    await restorePass(passId, passSnapshot);
    await deleteNewSessions(passId, sessionsBefore);
  }
});

test("el auto-cierre encadena la hoja de cierre como SEGUNDO dialog sin tocar la URL; Ahora no cierra ambos con un solo salto de historial", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, total } = await resolveBookFixture(userId);
  const originUrl = `/libro/${itemId}?tab=log`;

  const passSnapshot = await snapshotPass(passId);
  const sessionsBefore = await sessionIds(passId);

  try {
    await parkBookPassBeforeEnd(passId, total);

    await page.goto(originUrl);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//, { timeout: 15_000 });
    const urlWithModalOpen = page.url();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await dialog.locator('input[name="page"]').fill(String(total));
    await dialog.getByRole("button", { name: "Guardar sesión" }).click();

    // La hoja de cierre sube como SEGUNDO dialog, apilado ENCIMA del
    // primero — y la URL NO cambia todavía (sigue en /sesion/<passId>, no
    // ha navegado a la ficha).
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(
      page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
    ).toBeVisible();
    expect(page.url()).toBe(urlWithModalOpen);

    await page.getByRole("button", { name: "Ahora no" }).click();

    // Cierra AMBOS dialogs con un SOLO salto de historial: vuelve
    // exactamente al origen, nunca al inicio.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(originUrl);
  } finally {
    await restorePass(passId, passSnapshot);
    await deleteNewSessions(passId, sessionsBefore);
  }
});

test("el auto-cierre + Guardar en la hoja de cierre tambien cierra ambos dialogs con un solo salto de historial", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, total } = await resolveBookFixture(userId);
  const originUrl = `/libro/${itemId}?tab=log`;

  const passSnapshot = await snapshotPass(passId);
  const sessionsBefore = await sessionIds(passId);

  try {
    await parkBookPassBeforeEnd(passId, total);

    await page.goto(originUrl);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//, { timeout: 15_000 });
    const urlWithModalOpen = page.url();

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="page"]').fill(String(total));
    await dialog.getByRole("button", { name: "Guardar sesión" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(
      page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
    ).toBeVisible();
    expect(page.url()).toBe(urlWithModalOpen);

    // Esta vez, en vez de "Ahora no": guardar el cierre (sin nota, la nota
    // no es lo que se está probando aquí).
    await page.getByRole("button", { name: "Guardar", exact: true }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(originUrl);
  } finally {
    await restorePass(passId, passSnapshot);
    await deleteNewSessions(passId, sessionsBefore);
  }
});

test("la hoja de libro tiene exactamente un input de pagina y uno de duracion, con el tipo correcto", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId } = await resolveBookFixture(userId);

  await page.goto(`/libro/${itemId}?tab=log`);
  await sessionLink(page, passId).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const pageInput = dialog.locator('input[name="page"]');
  const durationInput = dialog.locator('input[name="durationMinutes"]');
  await expect(pageInput).toHaveCount(1);
  await expect(durationInput).toHaveCount(1);
  await expect(pageInput).toHaveAttribute("type", "number");
  await expect(pageInput).toHaveAttribute("inputmode", "numeric");

  // Cierre limpio (Escape) sin guardar nada: no muta estado del pase.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("la rejilla de episodios de una serie va acotada (272px) con scroll propio", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId } = await resolveSeriesFixture(userId);

  await page.goto(`/serie/${itemId}?tab=log`);
  await sessionLink(page, passId).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const grid = dialog.locator('[data-testid="episode-grid"]');
  await expect(grid).toBeVisible();

  const box = await grid.boundingBox();
  expect(box).not.toBeNull();
  // 17rem = 272px (GRID_MAX_HEIGHT, series-episode-grid.tsx). Un margen de
  // 1px absorbe el redondeo de subpíxel entre navegadores.
  expect(box!.height).toBeLessThanOrEqual(273);

  const scrollable = await grid.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(scrollable).toBe(true);

  // Cierre limpio (Escape) sin guardar nada: no muta estado del pase.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

// ─────────────────────────────────────────────────────────────────────────
// Regresión: guardar desde una pantalla que NO es la ficha
// ─────────────────────────────────────────────────────────────────────────
// Los tests de arriba entran al modal con page.goto(ficha) — navegación DURA
// con la ficha como entrada anterior, que es justo el caso sano de
// closeOnce(): sale por router.back(), y eso DESMONTA la ruta interceptada,
// que se llevaba el <dialog> por delante y tapaba el fallo de abajo.
//
// El usuario real entra a registrar desde el inicio (tarjeta de hoy),
// y ahí la entrada anterior NO es la ficha: closeOnce toma la
// rama router.replace(exitHref), una navegación SOFT que conserva el slot
// @modal — la ruta NO se desmonta y el <dialog> sigue MONTADO. Cerrarlo con
// close() no bastaba: su className forzaba `display:flex`, que gana a la
// regla del navegador `dialog:not([open]) { display: none }`, así que la hoja
// se quedaba PINTADA en flujo normal, sin backdrop y fuera del top layer, con
// la barra de pestañas de la ficha atravesándola.
//
// Y encima te dejaba en la ficha, que no es de donde venías (issue #161). El
// destino sale ahora del ORIGEN REAL, capturado antes de navegar
// (session-origin.tsx), no de deducirlo del historial a posteriori — que es
// lo que no se puede hacer: cuando el push a /sesion degrada a replace, la
// entrada de la ficha desaparece y "hay entrada anterior" deja de significar
// "el usuario venía de ahí". Ver el comentario de previousEntryIs.
test("guardar desde el inicio vuelve al inicio y no deja la hoja pintada", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId } = await resolveBookFixture(userId);

  const passSnapshot = await snapshotPass(passId);
  const sessionsBefore = await sessionIds(passId);

  try {
    await page.goto("/");
    await expect(page.locator(`[href^="/sesion/${passId}"]`).first()).toBeVisible();

    await page.locator(`[href^="/sesion/${passId}"]`).first().click();
    await page.waitForURL(/\/sesion\//, { timeout: 15_000 });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="page"]').fill("5");
    await dialog.getByRole("button", { name: "Guardar sesión" }).click();

    // Vuelves al INICIO, que es de donde saliste. No a la ficha.
    await expect(page).toHaveURL("/", { timeout: 15_000 });
    expect(page.url()).not.toContain(`/libro/${itemId}`);

    // Lo que este test protege: la hoja no queda pintada. `toBeHidden` no
    // basta como red de seguridad — comprobamos el alto REAL, que es lo que
    // falló en producción (un <dialog> cerrado pero con display:flex sigue
    // midiendo y pintándose, y Playwright lo daría por "hidden" solo si mira
    // el atributo).
    await expect(dialog).toBeHidden();
    const painted = await page.evaluate(() => {
      const d = [...document.querySelectorAll("dialog")].find((x) =>
        (x.textContent ?? "").includes("Registrar sesión"),
      );
      return d ? d.getBoundingClientRect().height : 0;
    });
    expect(painted).toBe(0);
  } finally {
    await restorePass(passId, passSnapshot);
    await deleteNewSessions(passId, sessionsBefore);
  }
});
