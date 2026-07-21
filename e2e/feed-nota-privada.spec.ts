import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El texto de una nota de sesión es privado: vive en `notes`, que no tiene
// política de lectura pública, y el compositor promete «por ahora nadie más la
// ve». `progress_sessions.note` guarda esa MISMA frase, y el feed la servía a
// tus seguidores.
//
// Nadie la pintaba —feed-card solo usa los minutos— pero FeedCard es un
// componente de cliente, así que el texto viajaba serializado en la carga de la
// página. Por eso este test NO mira lo que se ve: mira el HTML entero, payload
// RSC incluido. Un aserto visual habría pasado con el bug presente.
//
// headers()/assertOk()/settleCleanup()/login() están copiados de
// notas-captura.spec.ts: los specs de e2e no se importan entre sí.

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

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// A quién sigue el usuario de prueba. Se resuelve en vivo —nunca un UUID fijo—
// para sobrevivir a un reset de dev.
async function resolveFollowedPass(): Promise<{ userId: string; passId: string }> {
  const meRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: headers() },
  );
  await assertOk(meRes, "resolveFollowedPass: GET profiles");
  const [me] = (await meRes.json()) as { user_id: string }[];
  if (!me) throw new Error(`no se encontró el perfil de ${USERNAME}`);

  const followsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/follows?follower_id=eq.${me.user_id}&select=followee_id`,
    { headers: headers() },
  );
  await assertOk(followsRes, "resolveFollowedPass: GET follows");
  const follows = (await followsRes.json()) as { followee_id: string }[];
  if (follows.length === 0) {
    throw new Error(`${USERNAME} no sigue a nadie: el feed saldría vacío y el test no probaría nada`);
  }

  for (const f of follows) {
    const passRes = await fetch(
      `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${f.followee_id}&select=id&limit=1`,
      { headers: headers() },
    );
    await assertOk(passRes, "resolveFollowedPass: GET passes");
    const [pass] = (await passRes.json()) as { id: string }[];
    if (pass) return { userId: f.followee_id, passId: pass.id };
  }
  throw new Error("ningún usuario seguido tiene un pase donde colgar la sesión de prueba");
}

async function insertSession(userId: string, passId: string, note: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/progress_sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      user_id: userId,
      pass_id: passId,
      session_date: new Date().toISOString().slice(0, 10),
      duration_minutes: 42,
      note,
    }),
  });
  await assertOk(res, "insertSession: POST progress_sessions");
}

async function deleteSessionsByNote(note: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/progress_sessions?note=eq.${encodeURIComponent(note)}`,
    { method: "DELETE", headers: headers() },
  );
  await assertOk(res, "deleteSessionsByNote: DELETE progress_sessions");
}

test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

test("la nota de un usuario al que sigo NO viaja en el feed", async ({ page }) => {
  test.setTimeout(90_000);
  const { userId, passId } = await resolveFollowedPass();
  const SECRET = "e2e secreto que no debe salir del cuaderno de su autor";

  try {
    await insertSession(userId, passId, SECRET);
    await login(page);
    await page.goto("/");

    // La sesión sembrada SÍ llega al feed (los minutos), así que el evento está
    // ahí y el test mira donde debe: si esto fallara, la ausencia del texto no
    // probaría nada.
    await expect(page.getByText("42").first()).toBeVisible();

    // El texto, en cambio, no aparece NI en lo pintado ni en el payload RSC que
    // Next inlinea en la página. `page.content()` trae las dos cosas.
    expect(await page.content()).not.toContain(SECRET);
  } finally {
    await settleCleanup([() => deleteSessionsByNote(SECRET)]);
  }
});
