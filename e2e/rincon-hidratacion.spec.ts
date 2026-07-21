import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Regresión de la issue #112: MemorizeCard sorteaba la nota inicial dentro del
// inicializador de useState, que corre DOS veces (servidor e hidratación) con
// resultados distintos. React lo reporta como error de hidratación en la consola
// del navegador — el HTML servido no es el que espera al hidratar.
//
// Este spec necesita VARIAS notas: con una sola, los dos sorteos coinciden por
// fuerza (índice 0) y el bug no se manifiesta. Por eso siembra tres.
//
// headers()/assertOk()/settleCleanup()/devtestId()/login() están copiados de
// notas-cuaderno.spec.ts: los specs de e2e no se importan entre sí.

const TAG = "e2ehidratacion";

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

async function resolveBookId(): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?title=eq.${encodeURIComponent("The Final Empire")}&select=id`,
    { headers: headers() },
  );
  await assertOk(res, "resolveBookId: GET books");
  const [row] = (await res.json()) as { id: string }[];
  if (!row) throw new Error('no se encontró el libro fixture "The Final Empire"');
  return row.id;
}

async function seedNotes(userId: string, bookId: string, bodies: string[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(
      bodies.map((body) => ({
        user_id: userId,
        item_type: "book",
        item_id: bookId,
        kind: "quote",
        body,
        meta: { tags: [TAG] },
      })),
    ),
  });
  await assertOk(res, "seedNotes: POST notes");
}

async function deleteSeeded(userId: string) {
  const filter = encodeURIComponent(JSON.stringify({ tags: [TAG] }));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&meta=cs.${filter}`,
    { method: "DELETE", headers: headers() },
  );
  await assertOk(res, "deleteSeeded: DELETE notes?meta=cs");
}

test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

test("el Rincon hidrata sin desajuste con varias notas guardadas", async ({ page }) => {
  test.setTimeout(90_000);
  const userId = await devtestId();
  const bookId = await resolveBookId();

  // React reporta el desajuste como error de consola del navegador. Se recogen
  // TODOS y se filtran los de hidratación: la página tiene otros mensajes
  // (avisos de dev de Next) que no son lo que este test vigila.
  const hydrationErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/hydrat|hidrat|did not match|server rendered/i.test(text)) {
      hydrationErrors.push(text);
    }
  });
  page.on("pageerror", (err) => {
    if (/hydrat|did not match|server rendered/i.test(err.message)) {
      hydrationErrors.push(err.message);
    }
  });

  try {
    await deleteSeeded(userId);
    await seedNotes(userId, bookId, [
      "e2e hidratacion · nota uno",
      "e2e hidratacion · nota dos",
      "e2e hidratacion · nota tres",
    ]);

    await login(page);
    await page.goto(`/u/${USERNAME}?tab=rincon`);

    // Memorizar está pintada y con una nota dentro (no el estado vacío).
    const memorize = page.getByRole("heading", { name: "Memorizar" }).locator("xpath=../..");
    await expect(memorize.getByRole("link", { name: "Ver todas" })).toBeVisible();

    // Y "Otra nota" sigue funcionando tras hidratar: el sorteo del servidor fija
    // la PRIMERA, no congela la tarjeta.
    const before = await memorize.innerText();
    await memorize.getByRole("button", { name: "Otra nota" }).click();
    await expect.poll(() => memorize.innerText()).not.toBe(before);

    expect(hydrationErrors).toEqual([]);
  } finally {
    await settleCleanup([() => deleteSeeded(userId)]);
  }
});
