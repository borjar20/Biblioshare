import { expect, test, type Locator, type Page } from "@playwright/test";

// e2e de curación de sagas (Sagas v2 fase 3.5, Task 6): crear desde /sagas,
// anidar en universo, editar la ficha de una saga, y multi-chip + "hacer
// principal" en el editor de catálogo de un ítem. Contra el seed QA estable
// de dev (mismo universo que sagas-v2.spec.ts/sagas-v2-mapa.spec.ts/
// sagas-v2-editor.spec.ts) — este spec NO toca ese seed salvo por el
// "hacer principal" del test 2, que se revierte al final.
//
// Todo lo que este spec CREA lleva el prefijo único `[QA Curación] ` (sagas
// nuevas). La UI no permite borrar sagas (fuera de alcance de esta fase), así
// que esos residuos quedan en BD tras correr el spec — el controller los
// limpia por SQL (`delete from sagas where name like '[QA Curación]%'`)
// después de la corrida definitiva, no este fichero.
const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";

// Ítem del seed QA con doble membresía (spec fase 1, `.superpowers/sdd/
// task-6-collab-report.md` / e2e/sagas-v2.spec.ts): "Para leer a Isabel
// Allende", primary en el Universo, también miembro de Era Uno. Confirmado en
// BD dev antes de escribir este spec (saga_items: is_primary=true para
// 69c07496…, false para 53118dd4…) — si algún día cambia el seed, este test
// falla en el primer assert de las DOS chips, no en un sitio más confuso.
const BOOK_DOUBLE_MEMBERSHIP = "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc";
const SAGA_UNIVERSO_NAME = "[QA Sagas v2] Universo";
const SAGA_ERA_UNO_NAME = "[QA Sagas v2] Era Uno";

const UNIVERSO_NAME = "[QA Curación] Universo";
const HIJA_NAME = "[QA Curación] Hija";
const OVERVIEW_TEXT = "Sinopsis de prueba QA";

// UUID v4-ish (mismo patrón laxo que el resto de specs de sagas: no hace
// falta validar la versión, solo tener un separador fiable de la URL).
const UUID_PART = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SAGA_URL_RE = new RegExp(`/saga/(${UUID_PART})$`, "i");

// Calcado del helper `loginAs` de sagas-v2-editor.spec.ts (patrón del repo:
// no importar entre specs de e2e).
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Crea una saga desde /sagas/nueva (asume que ya se está en esa URL) y
// devuelve el uuid capturado de la URL de redirección de `createSaga`
// (server action → redirect(`/saga/${id}`)). Nunca se busca por nombre en
// /sagas para identidad: en la segunda pasada del spec ya existirá una saga
// homónima (residuo de la primera), y `createSaga` siempre crea una fila
// NUEVA (a diferencia de `setParentSaga`, que busca-o-crea) — por eso la
// única fuente de verdad para "cuál es la mía" es la URL de esta redirección.
async function createSagaAndCaptureId(page: Page, name: string): Promise<string> {
  await page.locator('input[name="name"]').fill(name);
  await page.getByRole("button", { name: "Crear saga" }).click();
  await page.waitForURL(SAGA_URL_RE);
  const match = SAGA_URL_RE.exec(page.url());
  if (!match) throw new Error(`URL de saga inesperada tras crear: ${page.url()}`);
  return match[1];
}

// `updateSagaMeta` (guardar sinopsis) no deja ningún rastro visible de éxito
// en el DOM -- a diferencia de CatalogEditor, SagaMetaEditor no pinta un
// flash de "guardado" para el formulario de metadatos (solo un error si
// falla). Así que en vez de un `waitForTimeout` (prohibido) se espera la
// respuesta de red real del POST del Server Action antes de navegar fuera de
// la página: navegar antes de que resuelva cancelaría el fetch en vuelo del
// propio Next.js y se perdería el guardado silenciosamente.
async function clickAndWaitForActionResponse(page: Page, locator: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST" && res.status() === 200),
    locator.click(),
  ]);
  return response;
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1: crear una saga (Universo), editar su ficha (sinopsis), crear una
// segunda saga (Hija) y anidarla bajo la primera vía SagaPicker. Verifica el
// índice /sagas (crear + "Nueva saga"), la edición de ficha (Task 4) y
// anidar en universo (Task 4/2).
// ─────────────────────────────────────────────────────────────────────────
test("colaborador: crear saga, editar su ficha y anidar una segunda saga", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAs(page, COLLAB_EMAIL, COLLAB_PASSWORD);

  // ── Crear "[QA Curación] Universo" desde /sagas → "Nueva saga" ──
  await page.goto("/sagas");
  await page.getByRole("link", { name: /Nueva saga/ }).click();
  await page.waitForURL("/sagas/nueva");
  const universoId = await createSagaAndCaptureId(page, UNIVERSO_NAME);

  await expect(page.getByRole("heading", { level: 1, name: UNIVERSO_NAME })).toBeVisible();

  // ── Editar ficha: sinopsis ──
  await page.getByRole("link", { name: /Editar ficha/ }).click();
  await page.waitForURL(new RegExp(`/saga/${universoId}/editar$`));
  // Efecto de haber navegado a la página correcta: el input de nombre trae
  // el valor ya guardado (defaultValue=initial.name).
  await expect(page.locator('input[name="name"]')).toHaveValue(UNIVERSO_NAME);

  await page.locator('textarea[name="overview"]').fill(OVERVIEW_TEXT);
  await clickAndWaitForActionResponse(
    page,
    page.getByRole("button", { name: "Guardar cambios" }),
  );

  // Volver a la ficha (no hay redirect automático tras guardar metadatos) y
  // comprobar nombre + sinopsis.
  await page.goto(`/saga/${universoId}`);
  await expect(page.getByRole("heading", { level: 1, name: UNIVERSO_NAME })).toBeVisible();
  await expect(page.getByText(OVERVIEW_TEXT)).toBeVisible();

  // ── Crear "[QA Curación] Hija" desde /sagas/nueva directamente ──
  await page.goto("/sagas/nueva");
  const hijaId = await createSagaAndCaptureId(page, HIJA_NAME);
  await expect(page.getByRole("heading", { level: 1, name: HIJA_NAME })).toBeVisible();

  // ── Anidar Hija bajo Universo vía SagaPicker (bloque Universo de /editar) ──
  await page.goto(`/saga/${hijaId}/editar`);
  await page.getByPlaceholder("Buscar una saga…").fill(UNIVERSO_NAME);
  // En la segunda pasada del spec ya existe un residuo homónimo de la
  // primera corrida (createSaga nunca reutiliza) — el picker puede devolver
  // más de un resultado con el mismo nombre. Se acepta `.first()` de forma
  // explícita: para los asserts de esta prueba no importa CUÁL de los dos
  // universos homónimos queda como padre (todos comparten el mismo texto de
  // nombre, así que el assert de "Parte de" no se ve afectado), y el assert
  // de la tarjeta en /sagas más abajo se ancla al href de `hijaId`
  // (identidad real), no al nombre del universo.
  const universoResult = page.getByRole("button", { name: UNIVERSO_NAME }).first();
  await expect(universoResult).toBeVisible();
  await universoResult.click();

  // Efecto de que `setParentSaga` resolvió: el bloque cambia de picker a la
  // vista compacta con "Quitar del universo".
  await expect(page.getByRole("button", { name: "Quitar del universo" })).toBeVisible();

  await page.goto(`/saga/${hijaId}`);
  await expect(page.getByText(`Parte de ${UNIVERSO_NAME}`)).toBeVisible();

  // La tarjeta del universo que quedó como padre (sea cual sea, ver
  // comentario arriba) debe listar la chip de Hija en /sagas — se ancla por
  // href al uuid capturado de Hija, no por nombre (nunca ambiguo aunque haya
  // universos homónimos).
  await page.goto("/sagas");
  await expect(page.locator(`a[href="/saga/${hijaId}"]`)).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: multi-chip + "hacer principal" sobre el ítem de doble membresía
// del seed QA. Restaura el estado original al final (la primary vuelve a
// ser el Universo) para no dejar deriva en el seed compartido con otros
// specs de sagas.
// ─────────────────────────────────────────────────────────────────────────
test("colaborador: multi-chip de sagas y hacer principal en el editor de catálogo", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginAs(page, COLLAB_EMAIL, COLLAB_PASSWORD);

  await page.goto(`/libro/${BOOK_DOUBLE_MEMBERSHIP}`);
  await page.getByRole("button", { name: /Editar ficha/ }).click();
  // Efecto de entrar en modo edición: el formulario de catálogo (con su
  // propio "Guardar cambios") sustituye a la ficha de lectura.
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toBeVisible();

  const universoLink = page.getByRole("link", { name: SAGA_UNIVERSO_NAME });
  const eraUnoLink = page.getByRole("link", { name: SAGA_ERA_UNO_NAME });
  await expect(universoLink).toBeVisible();
  await expect(eraUnoLink).toBeVisible();

  // Cada chip es el <span> contenedor inmediato del link (ver
  // catalog-editor.tsx, bloque de sagas): ★ + link + "hacer principal" (si
  // no es primary) + botón "×" son hermanos dentro de ese mismo <span>.
  const universoChip = universoLink.locator("xpath=..");
  const eraUnoChip = eraUnoLink.locator("xpath=..");

  // Estado inicial del seed: Universo es la primary.
  await expect(universoChip.locator('[title="Saga principal"]')).toBeVisible();
  await expect(eraUnoChip.locator('[title="Saga principal"]')).toHaveCount(0);
  await expect(eraUnoChip.getByRole("button", { name: "hacer principal" })).toBeVisible();

  // Promocionar Era Uno.
  await eraUnoChip.getByRole("button", { name: "hacer principal" }).click();
  await expect(eraUnoChip.locator('[title="Saga principal"]')).toBeVisible();
  await expect(universoChip.locator('[title="Saga principal"]')).toHaveCount(0);
  await expect(universoChip.getByRole("button", { name: "hacer principal" })).toBeVisible();

  // Restaurar: Universo vuelve a ser la primary (estado final = estado inicial).
  await universoChip.getByRole("button", { name: "hacer principal" }).click();
  await expect(universoChip.locator('[title="Saga principal"]')).toBeVisible();
  await expect(eraUnoChip.locator('[title="Saga principal"]')).toHaveCount(0);
  await expect(eraUnoChip.getByRole("button", { name: "hacer principal" })).toBeVisible();
});
