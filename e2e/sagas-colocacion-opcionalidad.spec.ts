import { expect, test, type Page } from "@playwright/test";

// E2E de los dos ejes nuevos de `/saga/[id]/editar` (commit 2627db7, sobre el
// editor de miembros de issue #167/#175): `placement` (Colocación: sin
// clasificar / hueco fijo / se lee cuando quieras) y `optional` (No cuenta en
// el progreso). Son ortogonales entre sí y respecto de `role` — este spec no
// toca `role` en absoluto, ver `e2e/sagas-rol-narrativo.spec.ts` para ese eje
// hermano (mismo universo QA, mismo patrón de fila-por-`<form>`).
//
// Universo QA: "[QA Sagas v2] Era Uno" (ERA_UNO_ID abajo), NO "Universo" — a
// diferencia de sagas-rol-narrativo.spec.ts, aquí interesa que la ficha que se
// visita para leer el hero SEA la saga dueña real de los `saga_items` que se
// tocan (así el denominador del test 3 se puede recalcular con una sola
// consulta a `saga_items`, sin tener que sumar subsagas). Verificado contra BD
// dev (2026-07-26) antes de escribir este spec: Era Uno tiene 4 miembros
// DIRECTOS (todos `placement=fijo`, `optional=false`) y una única hija,
// "[QA Sagas v2] Nieta", que hoy no tiene ni miembros propios ni nietas — así
// que el subárbol de Era Uno para efectos de `countedKeys` (./progress.ts) es
// exactamente sus 4 miembros directos, sin nada que recorrer por debajo. Si
// alguna vez alguien le añade contenido a Nieta, `fetchEraUnoProgress` de abajo
// dejaría de reflejar la realidad y este spec lo delataría con un mismatch
// entre el pct de la UI y el pct recalculado por REST — no en silencio.
//
// `workers: 1` / `fullyParallel: false` (playwright.config.ts) hace que TODA
// la suite corra en serie, así que reutilizar un miembro que también usa otro
// spec de sagas (p. ej. "Libro sin valorar", que sagas-rol-narrativo.spec.ts
// edita en su campo `role`) no compite en el tiempo — cada test dejará el
// campo que toca como lo encontró en su propio `finally`, campo por campo.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Mismo patrón que sagas-v2-biblioteca.spec.ts / sagas-v2-curacion.spec.ts:
// TEST_USER_* (cuenta persistente `devtest`, docs/TESTING.md) en vez de
// COLLAB_USER_* — devtest tiene `role='admin'` en BD dev (confirmado por REST
// antes de escribir este spec), que cumple `collaborator+`
// (ROLE_RANK: user < collaborator < admin, src/lib/auth/roles.ts), así que
// `/editar` no la redirige.
async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

let cachedUserId: string | null = null;
async function devtestId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  cachedUserId = rows[0].user_id;
  return cachedUserId;
}

// Recalcula el progreso de Era Uno por el MISMO camino que produce
// countedKeys + computeProgress (progress.ts / group-members.ts): denominador
// = miembros directos con `optional=false` (Nieta no aporta nada, ver
// comentario de cabecera); numerador = cuántos de esos tienen, para devtest,
// un pase con `status='completed'`. Sirve para predecir el pct exacto que
// debería pintar el hero antes/después de tocar `optional` en la UI, en vez
// de solo comprobar "cambió algo".
async function fetchEraUnoProgress(): Promise<{ total: number; completed: number; pct: number }> {
  const itemsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_type,item_id,optional`,
    { headers: adminHeaders() },
  );
  const items = (await itemsRes.json()) as { item_type: string; item_id: string; optional: boolean }[];
  const counted = items.filter((i) => !i.optional);
  const total = counted.length;
  if (total === 0) return { total: 0, completed: 0, pct: 0 };

  const userId = await devtestId();
  const byType = new Map<string, string[]>();
  for (const it of counted) {
    const list = byType.get(it.item_type) ?? [];
    list.push(it.item_id);
    byType.set(it.item_type, list);
  }

  const completedKeys = new Set<string>();
  for (const [itemType, ids] of byType) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${userId}&item_type=eq.${itemType}&item_id=in.(${ids.join(",")})&status=eq.completed&select=item_id`,
      { headers: adminHeaders() },
    );
    const rows = (await res.json()) as { item_id: string }[];
    for (const r of rows) completedKeys.add(`${itemType}:${r.item_id}`);
  }

  const completed = completedKeys.size;
  return { total, completed, pct: Math.round((completed / total) * 100) };
}

async function heroPct(page: Page): Promise<number> {
  const hero = page.getByTestId("saga-hero-progress");
  await expect(hero).toBeVisible();
  const text = (await hero.textContent()) ?? "";
  const match = /(\d+)%/.exec(text);
  if (!match) throw new Error(`hero sin pct reconocible: "${text}"`);
  return Number(match[1]);
}

// Localiza la fila (el <form> de MemberRow) por el título del miembro, igual
// que sagas-rol-narrativo.spec.ts — cada fila es un <form> independiente con
// su propio botón "Guardar".
function rowByTitle(page: Page, title: string) {
  return page.locator("form").filter({ hasText: title });
}

const BAD_PLACEMENT_TEXT =
  "«Hueco fijo» necesita un número, y «se lee cuando quieras» no lo admite.";

// ─────────────────────────────────────────────────────────────────────────
// Test 1: «Se lee cuando quieras» sin número guarda y sobrevive a un reload.
// Miembro: "Rayuela" (position=1, placement=fijo en el seed) — no lo toca
// ningún otro spec de sagas.
// ─────────────────────────────────────────────────────────────────────────
test("guardar «Se lee cuando quieras» sin número persiste tras recargar", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);

  const row = rowByTitle(page, "Rayuela");
  await expect(row).toBeVisible();
  const placementSelect = row.locator('select[name="placement"]');
  const positionInput = row.locator('input[name="position"]');

  // Precondición del seed.
  await expect(placementSelect).toHaveValue("fijo");
  await expect(positionInput).toHaveValue("1");

  try {
    await placementSelect.selectOption("libre");
    await positionInput.fill("");
    await row.getByRole("button", { name: "Guardar" }).click();
    await expect(row.getByText("Guardado", { exact: true })).toBeVisible();

    // Recarga desde cero: fuerza traer las props del servidor, sin nada de
    // estado de cliente que pueda maquillar un guardado que en realidad no
    // llegó a BD.
    await page.reload();
    const reloadedRow = rowByTitle(page, "Rayuela");
    await expect(reloadedRow.locator('select[name="placement"]')).toHaveValue("libre");
    await expect(reloadedRow.locator('input[name="position"]')).toHaveValue("");
  } finally {
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    const cleanupRow = rowByTitle(page, "Rayuela");
    if ((await cleanupRow.count()) > 0) {
      await cleanupRow.locator('input[name="position"]').fill("1");
      await cleanupRow.locator('select[name="placement"]').selectOption("fijo");
      await cleanupRow.getByRole("button", { name: "Guardar" }).click();
      await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: «Hueco fijo» sin número es una combinación imposible — el servidor
// la rechaza (badPlacement) y NO escribe nada. Miembro: "Para leer a Isabel
// Allende" (position=4, placement=fijo en el seed).
// ─────────────────────────────────────────────────────────────────────────
test("«Hueco fijo» sin número se rechaza y no escribe", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);

  const row = rowByTitle(page, "Para leer a Isabel Allende");
  await expect(row).toBeVisible();
  const placementSelect = row.locator('select[name="placement"]');
  const positionInput = row.locator('input[name="position"]');

  await expect(placementSelect).toHaveValue("fijo");
  await expect(positionInput).toHaveValue("4");

  try {
    // Deja "Hueco fijo" seleccionado (ya lo estaba) y vacía el número: la
    // combinación que el CHECK de BD (y su réplica en el servidor,
    // member-actions.ts) rechaza.
    await positionInput.fill("");
    await row.getByRole("button", { name: "Guardar" }).click();

    await expect(row.getByText(BAD_PLACEMENT_TEXT)).toBeVisible();
    await expect(row.getByText("Guardado", { exact: true })).toHaveCount(0);

    // Recarga y confirma que el valor previo (position=4) sigue en BD: el
    // rechazo del servidor no llegó a escribir.
    await page.reload();
    const reloadedRow = rowByTitle(page, "Para leer a Isabel Allende");
    await expect(reloadedRow.locator('select[name="placement"]')).toHaveValue("fijo");
    await expect(reloadedRow.locator('input[name="position"]')).toHaveValue("4");
  } finally {
    // Defensivo: si por lo que sea algo sí llegó a escribirse, lo deja como
    // lo encontró.
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    const cleanupRow = rowByTitle(page, "Para leer a Isabel Allende");
    if ((await cleanupRow.count()) > 0) {
      const positionNow = await cleanupRow.locator('input[name="position"]').inputValue();
      const placementNow = await cleanupRow.locator('select[name="placement"]').inputValue();
      if (positionNow !== "4" || placementNow !== "fijo") {
        await cleanupRow.locator('input[name="position"]').fill("4");
        await cleanupRow.locator('select[name="placement"]').selectOption("fijo");
        await cleanupRow.getByRole("button", { name: "Guardar" }).click();
        await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3 (la aserción que de verdad importa): marcar "No cuenta en el
// progreso" en un miembro baja el DENOMINADOR del hero exactamente en 1, sin
// tocar el numerador. Miembro: "Libro sin valorar" — devtest no tiene ningún
// pase sobre él (confirmado por REST antes de escribir este spec), así que
// queda fuera del cálculo de "completado" y el cambio de pct solo puede venir
// del denominador: una prueba limpia de que `optional` es lo que mueve el
// progreso y no otra cosa.
// ─────────────────────────────────────────────────────────────────────────
test("marcar «No cuenta en el progreso» baja el denominador del hero en 1", async ({ page }) => {
  await loginAsDevtest(page);

  const before = await fetchEraUnoProgress();
  expect(before.total).toBeGreaterThan(1); // si esto falla, el seed cambió y el resto del test no es fiable.

  await page.goto(`/saga/${ERA_UNO_ID}`);
  const pctBefore = await heroPct(page);
  // La UI tiene que coincidir con el recálculo por REST: si no coincidiera ya
  // aquí, el resto del test estaría prediciendo sobre un modelo equivocado.
  expect(pctBefore).toBe(before.pct);

  await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  const row = rowByTitle(page, "Libro sin valorar");
  await expect(row).toBeVisible();
  const optionalCheckbox = row.locator('input[name="optional"]');
  await expect(optionalCheckbox).not.toBeChecked();

  try {
    await optionalCheckbox.check();
    await row.getByRole("button", { name: "Guardar" }).click();
    await expect(row.getByText("Guardado", { exact: true })).toBeVisible();

    const after = await fetchEraUnoProgress();
    // El núcleo del test: el denominador cae en 1 y el numerador NO se mueve.
    expect(after.total).toBe(before.total - 1);
    expect(after.completed).toBe(before.completed);

    await page.goto(`/saga/${ERA_UNO_ID}`);
    const pctAfter = await heroPct(page);
    expect(pctAfter).toBe(after.pct);
    // pct estrictamente distinto de antes: con el mismo numerador y un
    // denominador menor, no puede quedar igual salvo un empate de redondeo
    // (que el seed actual no produce — completed>0/total pequeño). Si algún
    // día el seed cambiara y esto empezara a fallar por un empate de
    // redondeo real, sería una señal de que hay que fijar mejor el dato, no
    // de que el test esté mal.
    expect(pctAfter).not.toBe(pctBefore);
  } finally {
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    const cleanupRow = rowByTitle(page, "Libro sin valorar");
    if ((await cleanupRow.count()) > 0) {
      const cleanupCheckbox = cleanupRow.locator('input[name="optional"]');
      if (await cleanupCheckbox.isChecked()) {
        await cleanupCheckbox.uncheck();
        await cleanupRow.getByRole("button", { name: "Guardar" }).click();
        await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 4 (React 19 reset-tras-éxito, hallazgo B-2 de la revisión de Task 8 —
// ver e2e/sagas-rol-narrativo.spec.ts, mismo mecanismo, ahora sobre los DOS
// campos nuevos): un segundo "Guardar" sin tocar nada NO debe reenviar el
// `defaultValue` obsoleto de `placement`/`optional` y pisar lo que el primer
// guardado acaba de confirmar. Miembro: "Libro raro sin match" (position=3,
// placement=fijo, optional=false en el seed).
// ─────────────────────────────────────────────────────────────────────────
test("un segundo Guardar sin tocar nada no revierte placement/optional", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);

  const row = rowByTitle(page, "Libro raro sin match");
  await expect(row).toBeVisible();
  const placementSelect = row.locator('select[name="placement"]');
  const positionInput = row.locator('input[name="position"]');
  const optionalCheckbox = row.locator('input[name="optional"]');
  const saveButton = row.getByRole("button", { name: "Guardar" });

  await expect(placementSelect).toHaveValue("fijo");
  await expect(positionInput).toHaveValue("3");
  await expect(optionalCheckbox).not.toBeChecked();

  try {
    // 1) Cambia AMBOS campos nuevos a la vez (placement Y optional) y guarda.
    await placementSelect.selectOption("libre");
    await positionInput.fill("");
    await optionalCheckbox.check();
    await saveButton.click();
    await expect(row.getByText("Guardado", { exact: true })).toBeVisible();

    // 2) Segundo Guardar SIN TOCAR NADA. Sin el remount por `key` derivada de
    // `state.saved` (saga-members-editor.tsx), React 19 habría reseteado
    // estos campos no controlados a su `defaultValue` original (placement="",
    // optional=false) tras el éxito del paso 1, y este click reenviaría esos
    // valores viejos, borrando en silencio lo recién guardado. Se espera la
    // respuesta real del POST, no que "Guardado" siga visible: useActionState
    // conserva el estado anterior mientras la acción está en vuelo, así que
    // la etiqueta del paso 1 nunca desaparece y afirmarla aquí sería un no-op
    // que dejaría pasar un segundo POST caído sin que el test se entere.
    const secondSave = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes(`/saga/${ERA_UNO_ID}/editar`),
    );
    await saveButton.click();
    await secondSave;

    // 3) Recarga desde cero y confirma que AMBOS campos siguen en el valor
    // guardado, no en el original del seed.
    await page.reload();
    const reloadedRow = rowByTitle(page, "Libro raro sin match");
    await expect(reloadedRow.locator('select[name="placement"]')).toHaveValue("libre");
    await expect(reloadedRow.locator('input[name="position"]')).toHaveValue("");
    await expect(reloadedRow.locator('input[name="optional"]')).toBeChecked();
  } finally {
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    const cleanupRow = rowByTitle(page, "Libro raro sin match");
    if ((await cleanupRow.count()) > 0) {
      await cleanupRow.locator('input[name="position"]').fill("3");
      await cleanupRow.locator('select[name="placement"]').selectOption("fijo");
      const cleanupCheckbox = cleanupRow.locator('input[name="optional"]');
      if (await cleanupCheckbox.isChecked()) await cleanupCheckbox.uncheck();
      await cleanupRow.getByRole("button", { name: "Guardar" }).click();
      await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
    }
  }
});
