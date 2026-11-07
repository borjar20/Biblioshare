import { test, expect, type Page } from "@playwright/test";
import { FINAL_EMPIRE_FILTER } from "./support/book-fixture";
import { submitLogin } from "./support/visible-form";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E del ritual de cierre (hoja «¿Qué te ha parecido?»): lacre de nota,
// dedicatoria, despedida y cierre del diálogo. Reduced motion para que la
// despedida (~1,6 s) y el microrritual de la sesión duren ≤120 ms y el test no
// dependa de animaciones. Mismo patrón de fixtures y limpieza que
// registrar-sesion-v2.spec.ts: pases REALES de `devtest` resueltos por REST,
// fotografiados antes y restaurados en `finally`. Los helpers están copiados y
// no importados porque los specs no se referencian entre sí.

test.use({ contextOptions: { reducedMotion: "reduce" } });

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(60_000);
});

test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  return (await res.json()) as T;
}

async function patch(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
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
  const rows = await rest<{ id: string }[]>(`progress_sessions?pass_id=eq.${passId}&select=id`);
  const newIds = rows.map((r) => r.id).filter((id) => !before.has(id));
  if (newIds.length === 0) return;
  await fetch(`${SUPABASE_URL}/rest/v1/progress_sessions?id=in.(${newIds.join(",")})`, {
    method: "DELETE",
    headers: headers(),
  });
}

// Se ancla al bloque «Sesiones» de la ficha (ver registrar-sesion-v2.spec.ts).
function sessionLink(page: Page, passId: string) {
  return page
    .getByRole("heading", { name: "Sesiones", level: 3 })
    .locator("xpath=..")
    .getByRole("link", { name: /registrar sesión/i })
    .and(page.locator(`[href="/sesion/${passId}"]`));
}

test("libro: terminar por sesión, lacrar 8/10 con dedicatoria y guardar deja nota y reseña", async ({
  page,
}) => {
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
  const dedication = `Dedicatoria e2e ${Date.now()}`;

  try {
    await patch(`passes?id=eq.${pass.id}`, {
      position: { page: total - 1 },
      status: "in_progress",
      finished_on: null,
      rating: null,
      review: null,
    });

    await login(page);
    await page.goto(`/libro/${book.id}?tab=log`);
    await sessionLink(page, pass.id).click();
    await page.waitForURL(/\/sesion\//, { timeout: 15_000 });

    const sheet = page.getByRole("dialog");
    await sheet.locator('input[name="page"]').fill(String(total));
    await sheet.getByRole("button", { name: "Guardar sesión" }).click();

    await expect(page.getByRole("heading", { name: "¿Qué te ha parecido?" })).toBeVisible({
      timeout: 20_000,
    });
    const close = page.getByRole("dialog").last();
    // El objeto de cierre de un libro es la última página.
    await expect(close.locator('[class*="lastPage"]').first()).toBeVisible();

    await close.getByRole("button", { name: "8/10" }).click();
    await close.locator('textarea[name="review"]').fill(dedication);
    await close.getByRole("button", { name: "Guardar", exact: true }).click();

    // La despedida (reduced motion: ≤120 ms) y el cierre de ambos diálogos.
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/libro/${book.id}`));

    await expect
      .poll(
        async () => {
          const [row] = await rest<{ rating: number | null; review: string | null; status: string }[]>(
            `passes?id=eq.${pass.id}&select=rating,review,status`,
          );
          return row ? `${row.status}|${row.rating}|${row.review}` : "";
        },
        { timeout: 20_000 },
      )
      .toBe(`completed|8|${dedication}`);
  } finally {
    await patch(`passes?id=eq.${pass.id}`, snapshot);
    await deleteNewSessions(pass.id, sessionsBefore);
  }
});

test("película: marcar Vista enseña la entrada y «Ahora no» cierra la hoja", async ({ page }) => {
  test.setTimeout(90_000);
  const userId = await devtestId();
  const [pass] = await rest<{ id: string; item_id: string }[]>(
    `passes?user_id=eq.${userId}&item_type=eq.movie&status=eq.completed&is_active=eq.true&select=id,item_id&limit=1`,
  );
  if (!pass) throw new Error("devtest no tiene ningún pase de película completado para reutilizar");
  const snapshot = await snapshotPass(pass.id);

  try {
    // Se devuelve a «en curso» para poder volver a marcarla Vista desde la ficha.
    await patch(`passes?id=eq.${pass.id}`, { status: "in_progress", finished_on: null });

    await login(page);
    await page.goto(`/pelicula/${pass.item_id}?tab=log`);
    await page.getByRole("group", { name: "Tu estado" }).getByRole("button", { name: "Vista" }).click();

    await expect(page.getByRole("heading", { name: "¿Qué te ha parecido?" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("dialog").locator('[class*="ticket"]').first()).toBeVisible();

    await page.getByRole("button", { name: "Ahora no" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await patch(`passes?id=eq.${pass.id}`, snapshot);
  }
});
