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

// La nota queda enlazada a su sesión (session_id) tras guardar — se borra
// la sesión por ahí, ya no por progress_sessions.note (columna que
// SessionNotebook dejó de escribir, ver spec 2026-07-29 D6).
async function deleteSessionByLinkedNote(userId: string, body: string) {
  const noteRes = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=eq.${encodeURIComponent(body)}&select=session_id`,
    { headers: headers() },
  );
  await assertOk(noteRes, `deleteSessionByLinkedNote: GET notes?body=${body}`);
  const [note] = (await noteRes.json()) as { session_id: string | null }[];
  if (!note?.session_id) return;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/progress_sessions?id=eq.${note.session_id}`,
    { method: "DELETE", headers: headers() },
  );
  await assertOk(res, `deleteSessionByLinkedNote: DELETE progress_sessions?id=${note.session_id}`);
}

// settleCleanup corre sus pasos en PARALELO (Promise.allSettled) — si
// deleteSessionByLinkedNote y deleteNotesByBody fueran dos pasos sueltos,
// habría carrera: la nota podría borrarse antes de que el primero la
// consulte para encontrar su session_id. Van secuenciados en un único paso.
async function cleanupSessionAndNote(userId: string, body: string): Promise<void> {
  await deleteSessionByLinkedNote(userId, body);
  await deleteNotesByBody(userId, body);
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
    await dialog.getByRole("button", { name: /^guardar$/i }).click();
    await expect(dialog.getByText(BODY)).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Y lo que se guardó es 240.
    await page.goto(`/libro/${itemId}?tab=log`);
    const card = page.getByText(BODY).locator("xpath=ancestor::article");
    await expect(card).toBeVisible();
    await expect(card.getByText(/Pág\. 240/)).toBeVisible();
  } finally {
    await settleCleanup([
      () => cleanupSessionAndNote(userId, BODY),
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

    // Borrar dejó de ser un enlace rojo en cada tarjeta: vive tras el «···» y
    // pregunta (F3-012). Playwright descarta los diálogos por defecto.
    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: /acciones de la nota/i }).click();
    await page.getByRole("menuitem", { name: /borrar/i }).click();
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
// (session-list) y otra desde la tabla `notes` (NotesSection). Desde 2026-07-29
// `progress_sessions.note` ya no se escribe (SessionNotebook, ver spec) — este
// test se conserva como regresión de que la nota siga pintándose una sola vez.
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
    await dialog.getByRole("button", { name: /^guardar$/i }).click();
    await expect(dialog.getByText(BODY)).toBeVisible({ timeout: 10_000 });
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
      () => cleanupSessionAndNote(userId, BODY),
      () => restorePass(passId, snapshot),
    ]);
  }
});

test("varias notas en la misma sesion quedan todas enlazadas al guardar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, snapshot } = await resolveBookFixture(userId);
  const BODY_A = "e2e · primera nota de la sesion";
  const BODY_B = "e2e · segunda nota de la sesion";

  try {
    await setPassPage(passId, 200);
    await page.goto(`/libro/${itemId}?tab=log`);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//);

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="page"]').fill("220");
    await dialog.getByRole("button", { name: /añadir una nota o cita/i }).click();

    await dialog.locator('textarea[name="note"]').fill(BODY_A);
    await dialog.getByRole("button", { name: /^guardar$/i }).click();
    await expect(dialog.getByText(BODY_A)).toBeVisible({ timeout: 10_000 });

    // Guardada la primera, el compositor se vacía pero sigue abierto — la
    // segunda no requiere reabrirlo. Este es justo el caso que cazó la
    // carrera arreglada en note-composer.tsx (bodyRef): guardar es async, y
    // si se escribe la siguiente nota antes de que resuelva, el reset no
    // debe borrar lo ya tecleado.
    await dialog.locator('textarea[name="note"]').fill(BODY_B);
    await dialog.getByRole("button", { name: /^guardar$/i }).click();
    await expect(dialog.getByText(BODY_B)).toBeVisible({ timeout: 10_000 });

    // Las dos ya existen en BD ANTES de guardar la sesión (persistencia
    // inmediata, D1 de la spec) — es lo que este test cubre que los demás no.
    // expect.poll: el insert ya resolvió en el navegador (la tarjeta se ve),
    // pero esta lectura va por una conexión HTTP aparte contra Supabase dev
    // (remoto) — un margen de milisegundos de propagación no es un fallo.
    await expect.poll(() => countNotesByBody(userId, BODY_A)).toBe(1);
    await expect.poll(() => countNotesByBody(userId, BODY_B)).toBe(1);

    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Y tras guardar la sesión, las dos quedan enlazadas a ELLA (mismo
    // session_id), no sueltas.
    async function fetchLinkedNotes(): Promise<{ session_id: string | null }[]> {
      const notesRes = await fetch(
        `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=in.(${encodeURIComponent(BODY_A)},${encodeURIComponent(BODY_B)})&select=session_id`,
        { headers: headers() },
      );
      await assertOk(notesRes, "check session_id enlazado");
      return (await notesRes.json()) as { session_id: string | null }[];
    }
    await expect.poll(async () => (await fetchLinkedNotes()).length).toBe(2);
    const rows = await fetchLinkedNotes();
    expect(rows[0].session_id).not.toBeNull();
    expect(rows[0].session_id).toBe(rows[1].session_id);
  } finally {
    await settleCleanup([
      () => cleanupSessionAndNote(userId, BODY_A),
      () => deleteNotesByBody(userId, BODY_B),
      () => restorePass(passId, snapshot),
    ]);
  }
});
