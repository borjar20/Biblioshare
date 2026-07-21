import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E de notas y citas · Plan A: capturar desde la hoja de sesión con el
// anclaje VIVO, capturar desde la ficha, y releer ordenado por posición.
//
// Independiente de los demás specs a propósito: sin test.describe.serial y sin
// depender de ids que otro test haya creado. Fixtures reales y persistentes de
// `devtest`, resueltas por título (nunca por UUID fijo) para sobrevivir a un
// reset de dev. headers()/devtestId()/login() están copiados de
// registrar-sesion-v2.spec.ts: los specs de e2e no se importan entre sí.

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

// PostgREST puede devolver 401/403/500 sin que fetch lance: hay que mirar
// res.ok explícitamente o un fallo de limpieza/lectura pasa desapercibido.
async function assertOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;
  let body = "";
  try {
    body = await res.text();
  } catch {
    // sin cuerpo legible, se reporta solo el estado.
  }
  throw new Error(
    `${context}: HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`,
  );
}

// Ejecuta varios pasos de limpieza de forma aislada: el fallo de uno no
// cancela los demás (a diferencia de encadenar awaits en el mismo finally).
// Si alguno falla, se relanza al final para que el fallo sea ruidoso.
async function settleCleanup(steps: Array<() => Promise<void>>): Promise<void> {
  const results = await Promise.allSettled(steps.map((step) => step()));
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((f) => f.reason),
      `fallaron ${failures.length} de ${steps.length} paso(s) de limpieza`,
    );
  }
}

let cachedUserId: string | null = null;
async function devtestId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: headers() },
  );
  await assertOk(res, `devtestId: GET profiles?username=${USERNAME}`);
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

async function resolveBookFixture(userId: string) {
  const bookRes = await fetch(
    `${SUPABASE_URL}/rest/v1/books?title=eq.${encodeURIComponent("The Final Empire")}&select=id`,
    { headers: headers() },
  );
  await assertOk(bookRes, 'resolveBookFixture: GET books?title="The Final Empire"');
  const [book] = (await bookRes.json()) as { id: string }[];
  if (!book) throw new Error('no se encontró el libro fixture "The Final Empire"');

  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${userId}&item_type=eq.book&item_id=eq.${book.id}&is_active=eq.true&select=id,status,position`,
    { headers: headers() },
  );
  await assertOk(passRes, `resolveBookFixture: GET passes?item_id=${book.id}`);
  const [pass] = (await passRes.json()) as {
    id: string;
    status: string;
    position: unknown;
  }[];
  if (!pass) throw new Error('devtest no tiene pase activo sobre "The Final Empire"');
  return { itemId: book.id, passId: pass.id, snapshot: pass };
}

async function resolveSeriesFixture() {
  const seriesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/series?title=eq.${encodeURIComponent("Juego de tronos")}&select=id`,
    { headers: headers() },
  );
  await assertOk(seriesRes, 'resolveSeriesFixture: GET series?title="Juego de tronos"');
  const [series] = (await seriesRes.json()) as { id: string }[];
  if (!series) throw new Error('no se encontró la serie fixture "Juego de tronos"');
  return { itemId: series.id };
}

async function setPassPage(passId: string, page: number) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/passes?id=eq.${passId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ position: { page }, status: "in_progress" }),
  });
  await assertOk(res, `setPassPage: PATCH passes?id=${passId} (page=${page})`);
}

async function restorePass(
  passId: string,
  snapshot: { status: string; position: unknown },
) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/passes?id=eq.${passId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status: snapshot.status, position: snapshot.position }),
  });
  await assertOk(res, `restorePass: PATCH passes?id=${passId}`);
}

// `devtest` es una cuenta persistente y compartida: toda nota creada por un
// test se borra en su finally, o envenena las corridas siguientes.
async function deleteNotesByBody(userId: string, body: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=eq.${encodeURIComponent(body)}`,
    { method: "DELETE", headers: headers() },
  );
  await assertOk(res, `deleteNotesByBody: DELETE notes?body=${body}`);
}

// La nota de una sesión se escribe TAMBIÉN en `progress_sessions.note`, así que
// borrar solo la fila de `notes` deja media pareja detrás y `devtest` acumula
// sesiones de prueba entre corridas. Se borra la sesión entera: es de esta
// prueba, no del usuario.
async function deleteSessionsByNote(userId: string, body: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/progress_sessions?user_id=eq.${userId}&note=eq.${encodeURIComponent(body)}`,
    { method: "DELETE", headers: headers() },
  );
  await assertOk(res, `deleteSessionsByNote: DELETE progress_sessions?note=${body}`);
}

async function countNotesByBody(userId: string, body: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=eq.${encodeURIComponent(body)}&select=id`,
    { headers: headers() },
  );
  await assertOk(res, `countNotesByBody: GET notes?body=${body}`);
  return ((await res.json()) as unknown[]).length;
}

async function countNotesByItem(userId: string, itemId: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&item_id=eq.${itemId}&select=id`,
    { headers: headers() },
  );
  await assertOk(res, `countNotesByItem: GET notes?item_id=${itemId}`);
  return ((await res.json()) as unknown[]).length;
}

async function insertNote(
  userId: string,
  itemId: string,
  body: string,
  position: Record<string, number>,
) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      user_id: userId,
      item_type: "series",
      item_id: itemId,
      kind: "quote",
      body,
      position,
    }),
  });
  await assertOk(res, `insertNote: POST notes (body=${body})`);
}

function sessionLink(page: Page, passId: string) {
  const heading = page.getByRole("heading", { name: "Sesiones", level: 3 });
  return heading
    .locator("xpath=..")
    .getByRole("link", { name: /registrar sesión/i })
    .and(page.locator(`[href="/sesion/${passId}"]`));
}

test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

test("el anclaje de la nota sigue a la pagina que acabo de marcar, NO a la guardada del pase", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, snapshot } = await resolveBookFixture(userId);
  const BODY = "e2e · anclaje vivo";

  try {
    // El pase se queda en la 180; la sesión va a marcar la 240. Si el
    // compositor leyera la posición GUARDADA en vez del campo vivo, la nota
    // saldría anclada a 180 y este test lo cazaría.
    await setPassPage(passId, 180);

    await page.goto(`/libro/${itemId}?tab=log`);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.locator('input[name="page"]').fill("240");
    await dialog.getByRole("button", { name: /añadir una nota o cita/i }).click();

    // El anclaje sigue al campo, no a la base.
    await expect(dialog.getByText(/Pág\. 240/)).toBeVisible();
    await expect(dialog.getByText(/Pág\. 180/)).toHaveCount(0);

    await dialog.locator('textarea[name="note"]').fill(BODY);
    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Y lo que se guardó es 240.
    await page.goto(`/libro/${itemId}?tab=log`);
    const card = page.getByText(BODY).locator("xpath=ancestor::article");
    await expect(card).toBeVisible();
    await expect(card.getByText(/Pág\. 240/)).toBeVisible();
  } finally {
    await settleCleanup([
      () => deleteNotesByBody(userId, BODY),
      () => deleteSessionsByNote(userId, BODY),
      () => restorePass(passId, snapshot),
    ]);
  }
});

test("capturar desde la ficha sin sesion, y borrar desde la lista", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId } = await resolveBookFixture(userId);
  const BODY = "e2e · captura desde la ficha";

  try {
    await page.goto(`/libro/${itemId}?tab=log`);

    await page.getByRole("button", { name: /añadir una nota o cita/i }).first().click();
    await page.locator('textarea[name="note"]').fill(BODY);
    await page.locator('input[name="noteTags"]').fill("#E2E, e2e");
    await page.getByRole("button", { name: /^guardar$/i }).click();

    const card = page.getByText(BODY).locator("xpath=ancestor::article");
    await expect(card).toBeVisible({ timeout: 15_000 });
    // normalizeTags: minúsculas, sin #, sin duplicadas → una sola etiqueta.
    await expect(card.getByText("#e2e")).toHaveCount(1);

    await card.getByRole("button", { name: /borrar/i }).click();
    await expect(page.getByText(BODY)).toHaveCount(0, { timeout: 15_000 });
    expect(await countNotesByBody(userId, BODY)).toBe(0);
  } finally {
    await settleCleanup([() => deleteNotesByBody(userId, BODY)]);
  }
});

test("el orden es por posicion: T1E12 va antes que T2E5", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId } = await resolveSeriesFixture();
  const EARLY = "e2e · temporada uno episodio doce";
  const LATE = "e2e · temporada dos episodio cinco";

  try {
    // Se insertan al revés a propósito: si el orden fuera el de inserción o el
    // de created_at, saldrían al revés y el test fallaría.
    await insertNote(userId, itemId, LATE, { season: 2, episode: 5 });
    await insertNote(userId, itemId, EARLY, { season: 1, episode: 12 });

    await page.goto(`/serie/${itemId}?tab=log`);

    const bodies = await page
      .locator("article")
      .filter({ hasText: /^e2e · temporada/ })
      .allInnerTexts();
    const earlyAt = bodies.findIndex((b) => b.includes(EARLY));
    const lateAt = bodies.findIndex((b) => b.includes(LATE));
    expect(earlyAt).toBeGreaterThanOrEqual(0);
    expect(earlyAt).toBeLessThan(lateAt);

    // Y el anclaje de serie se PINTA (el defecto preexistente que arregla la
    // Tarea 4: antes se leía como "sin posición").
    await expect(page.getByText("T1E12")).toBeVisible();
  } finally {
    await settleCleanup([
      () => deleteNotesByBody(userId, EARLY),
      () => deleteNotesByBody(userId, LATE),
    ]);
  }
});

test("guardar la sesion con el compositor vacio no crea ninguna nota", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, snapshot } = await resolveBookFixture(userId);

  const countBefore = await countNotesByItem(userId, itemId);

  try {
    await setPassPage(passId, 100);
    await page.goto(`/libro/${itemId}?tab=log`);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//);

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="page"]').fill("120");
    // Se despliega el compositor y se deja VACÍO a propósito.
    await dialog.getByRole("button", { name: /añadir una nota o cita/i }).click();
    await dialog.getByRole("button", { name: /^guardar sesión$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    expect(await countNotesByItem(userId, itemId)).toBe(countBefore);
  } finally {
    await settleCleanup([() => restorePass(passId, snapshot)]);
  }
});

// Regresión de la issue #109: el texto de una nota tomada durante una sesión se
// pintaba DOS veces en la pestaña Registro — una desde `progress_sessions.note`
// (session-list) y otra desde la tabla `notes` (NotesSection). `addSession`
// escribe en las dos, deliberadamente, así que el arreglo no es dejar de
// escribir sino dejar de pintar la copia que ya tiene hogar.
test("la nota de una sesion se pinta UNA sola vez en Registro", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, snapshot } = await resolveBookFixture(userId);
  const BODY = "e2e · nota que no debe salir dos veces";

  try {
    await setPassPage(passId, 150);
    await page.goto(`/libro/${itemId}?tab=log`);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//);

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="page"]').fill("170");
    await dialog.getByRole("button", { name: /añadir una nota o cita/i }).click();
    await dialog.locator('textarea[name="note"]').fill(BODY);
    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.goto(`/libro/${itemId}?tab=log`);
    // Exactamente una. Antes del arreglo salían dos: la de session-list y la de
    // «Mis notas y citas».
    await expect(page.getByText(BODY, { exact: true })).toHaveCount(1);

    // Y la que queda es la tarjeta de notas, con su anclaje — no la línea suelta
    // de la lista de sesiones.
    const card = page.getByText(BODY, { exact: true }).locator("xpath=ancestor::article");
    await expect(card.getByText(/Pág\. 170/)).toBeVisible();
  } finally {
    await settleCleanup([
      () => deleteNotesByBody(userId, BODY),
      () => deleteSessionsByNote(userId, BODY),
      () => restorePass(passId, snapshot),
    ]);
  }
});
