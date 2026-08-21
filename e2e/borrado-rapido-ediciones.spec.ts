import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Libro del catálogo dev sobre el que se siembra (el mismo que usa happy-path).
const BOOK_ID = "12b43d1b-60d4-4ce6-bd38-1bdf729d4193";
// UUID fijos, como el resto de semillas QA (docs/TESTING.md): permiten limpiar
// ANTES y DESPUÉS, así que una pasada que muera a mitad no envenena la siguiente.
const FREE_EDITION_ID = "e0d17e00-0000-4000-8000-000000000001";
const USED_EDITION_ID = "e0d17e00-0000-4000-8000-000000000002";
const USED_PASS_ID = "e0d17e00-0000-4000-8000-000000000003";

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(
      `REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`,
    );
  }
  return res;
}

async function cleanup() {
  // El pase primero: el trigger block_edition_delete_if_used impide borrar una
  // edición que todavía tenga pases.
  await rest(`passes?id=eq.${USED_PASS_ID}`, { method: "DELETE" });
  await rest(`book_editions?id=in.(${FREE_EDITION_ID},${USED_EDITION_ID})`, {
    method: "DELETE",
  });
}

async function seed() {
  // Guarda de dato (mismo patrón que happy-path): sembrar contra un libro que
  // ya no existe deja filas huérfanas y un fallo ilegible más adelante.
  const books = (await (
    await rest(`books?id=eq.${BOOK_ID}&select=id`)
  ).json()) as unknown[];
  if (books.length === 0) {
    throw new Error(
      `[borrado-ediciones] el libro ${BOOK_ID} ya no está en \`books\`: elige otro para BOOK_ID.`,
    );
  }

  const profiles = (await (
    await rest(`profiles?username=eq.${USERNAME}&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  const userId = profiles[0]?.user_id;
  if (!userId) {
    throw new Error(`[borrado-ediciones] no hay perfil con username=${USERNAME}`);
  }

  await cleanup();

  await rest("book_editions", {
    method: "POST",
    body: JSON.stringify([
      { id: FREE_EDITION_ID, book_id: BOOK_ID, label: "QA LIBRE" },
      { id: USED_EDITION_ID, book_id: BOOK_ID, label: "QA EN USO" },
    ]),
  });

  // Pase CERRADO (is_active false) contra la edición «en uso»: basta para que
  // cuente como usada y no toca el pase activo que puedan usar otros specs.
  await rest("passes", {
    method: "POST",
    body: JSON.stringify({
      id: USED_PASS_ID,
      user_id: userId,
      item_type: "book",
      item_id: BOOK_ID,
      edition_id: USED_EDITION_ID,
      status: "completed",
      is_active: false,
      finished_on: "2020-01-01",
    }),
  });
}

async function editionExists(id: string): Promise<boolean> {
  const rows = (await (
    await rest(`book_editions?id=eq.${id}&select=id`)
  ).json()) as unknown[];
  return rows.length > 0;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// El botón × de una edición concreta: la tarjeta se localiza por su etiqueta.
// El borrado dejó de ser una × siempre visible en la tarjeta y pasó a vivir
// tras el «···» (F3-012). `deleteButton` mantiene su contrato —«el control que
// dispara el borrado de ESTA edición»— abriendo antes el menú; los tests no
// cambian. `toHaveCount(0)` sobre el disparador sigue distinguiendo «no se
// puede borrar» (no hay menú) de «se puede».
function editionCard(page: import("@playwright/test").Page, label: string) {
  return page
    .locator('[data-testid="edition-card"]')
    .filter({ hasText: label });
}

function deleteButton(page: import("@playwright/test").Page, label: string) {
  return editionCard(page, label).getByTestId("edition-actions");
}

async function openDeleteDialog(
  page: import("@playwright/test").Page,
  label: string,
) {
  await deleteButton(page, label).click();
  await page.getByTestId("delete-edition").click();
}

// La cuenta `devtest` es admin en dev, que cumple colaborador+.
//
// El caso «un usuario sin rol no ve el ×» NO se prueba aquí: degradar el rol de
// la cuenta de pruebas a mitad de suite deja el entorno envenenado si la pasada
// muere. El × está detrás de la misma prop `canContribute` que ya gobierna el
// «+ Añadir edición», y la server action revalida el rol por su cuenta.
test.describe("borrado rápido de ediciones desde la ficha", () => {
  test.skip(
    !EMAIL || !PASSWORD || !SERVICE_KEY,
    "TEST_USER_*/SERVICE_KEY no configurados",
  );
  test.setTimeout(90_000);

  test.beforeEach(async () => {
    await seed();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("una edición sin pases se borra desde la tira; con pases no se ofrece", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/libro/${BOOK_ID}?tab=info`);

    // La edición libre ofrece menú de acciones; la que tiene un pase, no.
    await expect(deleteButton(page, "QA LIBRE")).toBeVisible();
    await expect(deleteButton(page, "QA EN USO")).toHaveCount(0);

    // Cancelar no borra.
    await openDeleteDialog(page, "QA LIBRE");
    const dialog = page.getByTestId("delete-edition-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect(await editionExists(FREE_EDITION_ID)).toBe(true);

    // Confirmar sí borra: la tarjeta desaparece y la fila también.
    await openDeleteDialog(page, "QA LIBRE");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Borrar", exact: true }).click();
    await expect(
      page.locator('[data-testid="edition-card"]').filter({ hasText: "QA LIBRE" }),
    ).toHaveCount(0);
    expect(await editionExists(FREE_EDITION_ID)).toBe(false);
  });
});
