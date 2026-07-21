import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E del cuaderno /notas (Plan B): filtros, búsqueda, orden por obra y
// paginación — todo servidor, todo en la URL.
//
// Las notas de este spec se marcan con la etiqueta `e2ecuaderno` y se filtran
// por ella: `devtest` es una cuenta compartida y persistente con notas de otras
// corridas, así que contar "todas las notas" daría un número distinto cada vez.
// Filtrar por la etiqueta propia hace los asertos deterministas.
//
// headers()/assertOk()/settleCleanup()/devtestId()/login() están copiados de
// notas-captura.spec.ts: los specs de e2e no se importan entre sí.

const TAG = "e2ecuaderno";

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

async function resolveItem(table: "books" | "series", title: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?title=eq.${encodeURIComponent(title)}&select=id`,
    { headers: headers() },
  );
  await assertOk(res, `resolveItem: GET ${table}?title=${title}`);
  const [row] = (await res.json()) as { id: string }[];
  if (!row) throw new Error(`no se encontró el fixture "${title}" en ${table}`);
  return row.id;
}

type SeedNote = {
  itemType: "book" | "series";
  itemId: string;
  kind: "note" | "quote";
  body: string;
  position?: Record<string, number>;
  isFavorite?: boolean;
};

async function insertNotes(userId: string, notes: SeedNote[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(
      notes.map((n) => ({
        user_id: userId,
        item_type: n.itemType,
        item_id: n.itemId,
        kind: n.kind,
        body: n.body,
        position: n.position ?? null,
        is_favorite: n.isFavorite ?? false,
        meta: { tags: [TAG] },
      })),
    ),
  });
  await assertOk(res, `insertNotes: POST notes (${notes.length})`);
}

// Borra por etiqueta: `meta @> {"tags":["e2ecuaderno"]}` en sintaxis PostgREST.
async function deleteSeeded(userId: string) {
  const filter = encodeURIComponent(JSON.stringify({ tags: [TAG] }));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&meta=cs.${filter}`,
    { method: "DELETE", headers: headers() },
  );
  await assertOk(res, "deleteSeeded: DELETE notes?meta=cs");
}

test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

test("el cuaderno filtra por tipo, por favoritas y busca en el texto", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const bookId = await resolveItem("books", "The Final Empire");

  const QUOTE = "e2e cuaderno · la cita del acantilado";
  const NOTE = "e2e cuaderno · la nota preferida";

  try {
    await deleteSeeded(userId);
    await insertNotes(userId, [
      { itemType: "book", itemId: bookId, kind: "quote", body: QUOTE, position: { page: 12 } },
      { itemType: "book", itemId: bookId, kind: "note", body: NOTE, isFavorite: true },
    ]);

    // Sin filtros: están las dos.
    await page.goto(`/notas?etiqueta=${TAG}`);
    await expect(page.getByText(QUOTE)).toBeVisible();
    await expect(page.getByText(NOTE)).toBeVisible();

    // Solo citas.
    await page.getByRole("link", { name: "Citas", exact: true }).click();
    await expect(page).toHaveURL(/tipo=cita/);
    await expect(page.getByText(QUOTE)).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);

    // Solo favoritas (y de vuelta a "Todas" para no acumular el filtro de tipo).
    //
    // Hay que esperar a que CADA navegación cuaje antes de pinchar la siguiente
    // pill: los enlaces de la barra se construyen sobre el estado de la página
    // que los pintó, así que pinchar dos seguidos sobre el DOM viejo compone un
    // filtro que no es el que se quería (tipo=cita + favoritas → vacío).
    await page.getByRole("link", { name: "Todas", exact: true }).click();
    await expect(page).not.toHaveURL(/tipo=/);
    await page.getByRole("link", { name: "Solo favoritas" }).click();
    await expect(page).toHaveURL(/favoritas=1/);
    await expect(page.getByText(NOTE)).toBeVisible();
    await expect(page.getByText(QUOTE)).toHaveCount(0);

    // La búsqueda va sobre el cuerpo.
    await page.goto(`/notas?etiqueta=${TAG}`);
    await page.locator('input[name="q"]').fill("acantilado");
    await page.getByRole("button", { name: /buscar/i }).click();
    await expect(page.getByText(QUOTE)).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);

    // Un filtro sin resultados dice por qué está vacío.
    await page.goto(`/notas?etiqueta=${TAG}&q=zzzznoexiste`);
    await expect(page.getByText("Ninguna nota con estos filtros.")).toBeVisible();
  } finally {
    await settleCleanup([() => deleteSeeded(userId)]);
  }
});

test("el orden por obra agrupa y dentro de la obra va por posicion", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const seriesId = await resolveItem("series", "Juego de tronos");

  const EARLY = "e2e cuaderno · temporada uno episodio doce";
  const LATE = "e2e cuaderno · temporada dos episodio cinco";

  try {
    await deleteSeeded(userId);
    // Insertadas al revés: si el orden fuera el de inserción o el de created_at,
    // saldrían invertidas.
    await insertNotes(userId, [
      { itemType: "series", itemId: seriesId, kind: "quote", body: LATE, position: { season: 2, episode: 5 } },
      { itemType: "series", itemId: seriesId, kind: "quote", body: EARLY, position: { season: 1, episode: 12 } },
    ]);

    await page.goto(`/notas?etiqueta=${TAG}&orden=obra`);

    const bodies = await page
      .locator("article")
      .filter({ hasText: /^e2e cuaderno · temporada/ })
      .allInnerTexts();
    const earlyAt = bodies.findIndex((b) => b.includes(EARLY));
    const lateAt = bodies.findIndex((b) => b.includes(LATE));
    expect(earlyAt).toBeGreaterThanOrEqual(0);
    expect(earlyAt).toBeLessThan(lateAt);

    // Y el grupo lleva el título de la obra por cabecera.
    await expect(page.getByRole("link", { name: "Juego de tronos" })).toBeVisible();
  } finally {
    await settleCleanup([() => deleteSeeded(userId)]);
  }
});

test("la paginacion parte el resultado y no repite ni se salta notas", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const userId = await devtestId();
  const bookId = await resolveItem("books", "The Final Empire");

  // 25 notas → dos páginas de 20 + 5. Numeradas para poder comprobar que la
  // unión de las dos páginas son las 25, sin repetidas.
  const TOTAL = 25;
  const bodies = Array.from({ length: TOTAL }, (_, i) => `e2e cuaderno · nota ${i + 1} de ${TOTAL}`);

  try {
    await deleteSeeded(userId);
    await insertNotes(
      userId,
      bodies.map((body) => ({ itemType: "book" as const, itemId: bookId, kind: "note" as const, body })),
    );

    await page.goto(`/notas?etiqueta=${TAG}`);
    await expect(page.getByText(`${TOTAL} notas`)).toBeVisible();
    await expect(page.getByText("Página 1 de 2")).toBeVisible();

    const onPage = async () => {
      const texts = await page.locator("article").allInnerTexts();
      return texts
        .map((t) => bodies.find((b) => t.includes(b)))
        .filter((b): b is string => Boolean(b));
    };

    const first = await onPage();
    expect(first).toHaveLength(20);

    await page.getByRole("link", { name: /siguientes/i }).click();
    await expect(page.getByText("Página 2 de 2")).toBeVisible();
    const second = await onPage();
    expect(second).toHaveLength(5);

    // Ni repetidas ni perdidas: la unión son exactamente las 25.
    expect(new Set([...first, ...second]).size).toBe(TOTAL);
  } finally {
    await settleCleanup([() => deleteSeeded(userId)]);
  }
});

test("a 390x700 la barra de filtros no desborda la pantalla", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 700 });
  await login(page);
  const userId = await devtestId();
  const bookId = await resolveItem("books", "The Final Empire");
  const BODY = "e2e cuaderno · medida en movil";

  try {
    await deleteSeeded(userId);
    await insertNotes(userId, [
      { itemType: "book", itemId: bookId, kind: "quote", body: BODY, position: { page: 7 } },
    ]);

    await page.goto(`/notas?etiqueta=${TAG}`);
    await expect(page.getByText(BODY)).toBeVisible();

    // La barra lleva buscador + 5 pills + chips de filtro activo: es justo el
    // tipo de fila que se sale por la derecha en móvil sin que lint, tsc ni
    // build digan nada. Solo se caza midiendo.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await settleCleanup([() => deleteSeeded(userId)]);
  }
});

test("la etiqueta de una tarjeta es un filtro y se puede quitar", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const bookId = await resolveItem("books", "The Final Empire");
  const BODY = "e2e cuaderno · nota etiquetada";

  try {
    await deleteSeeded(userId);
    await insertNotes(userId, [
      { itemType: "book", itemId: bookId, kind: "note", body: BODY },
    ]);

    await page.goto("/notas");
    await page.getByRole("link", { name: `#${TAG}` }).first().click();

    await expect(page).toHaveURL(new RegExp(`etiqueta=${TAG}`));
    await expect(page.getByText(BODY)).toBeVisible();

    // El chip de la etiqueta activa la quita y devuelve al cuaderno entero.
    await page.getByRole("link", { name: new RegExp(`Etiqueta #${TAG}`) }).click();
    await expect(page).toHaveURL(/\/notas$/);
  } finally {
    await settleCleanup([() => deleteSeeded(userId)]);
  }
});
