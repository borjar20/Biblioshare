import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// E2E de los dos ejes de `/saga/[id]/editar` (spec 2026-07-25): `placement`
// (Colocación: sin clasificar / hueco fijo / se lee cuando quieras) y
// `optional` (No cuenta en el progreso). Reescrito para el editor de
// secuencia (Task 9/12 de la fase 2a — sustituye el formulario por fila
// `<form>` que tenía cada miembro). Son ortogonales entre sí y respecto de
// `role` — este spec no toca `role` en absoluto, ver
// `e2e/sagas-rol-narrativo.spec.ts` para ese eje hermano (mismo universo QA).
//
// Universo QA: "[QA Sagas v2] Era Uno" (ERA_UNO_ID abajo), NO "Universo" —
// interesa que la ficha que se visita para leer el hero SEA la saga dueña
// real de los `saga_items` que se tocan (así el denominador del test 3 se
// puede recalcular con una sola consulta a `saga_items`, sin tener que sumar
// subsagas). Era Uno tiene 4 miembros DIRECTOS (todos `placement=fijo`,
// `optional=false` en el seed, confirmado contra BD dev 2026-07-26) y una
// única hija, "[QA Sagas v2] Nieta", que hoy no tiene ni miembros propios ni
// nietas — así que el subárbol de Era Uno para efectos de `countedKeys`
// (./progress.ts) es exactamente sus 4 miembros directos.
//
// Cambio de arquitectura (Task 9, `get-saga-sequence.ts`): el editor de
// secuencia SOLO lista y SOLO puede escribir los `saga_items` cuya `saga_id`
// es la propia saga que se edita — ya no "toda la subsaga" como hacía el
// formulario viejo. Los miembros de Era Uno se curan en `/saga/${ERA_UNO_ID}/editar`,
// nunca en el de Universo, aunque la FICHA de Universo (`getSagaDetail`, sin
// cambios) los siga agregando para pintarlos.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno
// Padre de Era Uno — solo lo usa el Test 5 (abajo): la cabecera de grupo de
// "Era Uno" (tick + nombre + contador) SOLO se pinta vista desde aquí, nunca
// en `/saga/${ERA_UNO_ID}` a secas (ahí es `isSoleDirectGroup` y la cabecera
// se omite, ver comentario en saga-info.tsx).
const SAGA_UNIVERSO = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Mismo patrón que sagas-v2-biblioteca.spec.ts / sagas-v2-curacion.spec.ts:
// TEST_USER_* (cuenta persistente `devtest`, docs/TESTING.md) en vez de
// COLLAB_USER_* — devtest tiene `role='admin'` en BD dev, que cumple
// `collaborator+` (ROLE_RANK: user < collaborator < admin,
// src/lib/auth/roles.ts), así que `/editar` no la redirige.
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
// = miembros directos con `optional=false`; numerador = cuántos de esos
// tienen, para devtest, un pase con `status='completed'`.
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

// Localiza la fila por el título del miembro, escopada a la cáscara VISIBLE:
// las dos se montan a la vez y se ocultan por breakpoint (regla de los dos
// árboles), así que sin `:visible` este locator encuentra dos elementos.
function rowByTitle(page: Page, title: string) {
  return page.locator('[data-testid="sequence-row"]:visible').filter({ hasText: title });
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Guardar secuencia" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
}

type ItemRow = {
  item_id: string;
  position: number | null;
  placement: string | null;
  optional: boolean;
};
type BlockRow = { id: string; position_in_parent: number | null; placement_in_parent: string | null };

async function fetchEraUnoItems(): Promise<ItemRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement,optional`,
    { headers: adminHeaders() },
  );
  return res.json();
}

async function fetchEraUnoBlock(): Promise<BlockRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sagas?parent_saga_id=eq.${ERA_UNO_ID}&select=id,position_in_parent,placement_in_parent`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as BlockRow[];
  return rows[0] ?? null;
}

// Restaura Era Uno tal cual estaba antes de un guardado real: el número es el
// índice del hueco (sequence-draft.ts), así que sacar una fila de la
// secuencia (o metérsela) renumera TODAS las que quedan detrás, incluido el
// bloque "Nieta" — no basta con deshacer el cambio del ítem tocado a
// propósito. Vía REST directa: la pantalla nueva no tiene campo de posición
// que teclear (spec §«El número no se teclea»).
async function restoreEraUno(items: ItemRow[], block: BlockRow | null) {
  for (const r of items) {
    await fetch(`${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${r.item_id}`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ position: r.position, placement: r.placement, optional: r.optional }),
    });
  }
  if (block) {
    await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${block.id}`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ position_in_parent: block.position_in_parent, placement_in_parent: block.placement_in_parent }),
    });
  }
}

// Equivalente accesible del contorno punteado (Fix Task 7, cierre —
// `saga.noOrderSlotHint` en messages/es.json). Se referencia por constante
// para que un cambio de redacción rompa el test en vez de dejarlo mintiendo
// en verde.
const NO_SLOT_TEXT = "Sin hueco asignado en esta lista.";

// ─────────────────────────────────────────────────────────────────────────
// Test 1: «Se lee cuando quieras» sin número guarda y sobrevive a un reload.
// Miembro: "Rayuela" (position=1, placement=fijo en el seed) — no lo toca
// ningún otro spec de sagas.
// ─────────────────────────────────────────────────────────────────────────
test("guardar «Se lee cuando quieras» sin número persiste tras recargar", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);

  const itemsBefore = await fetchEraUnoItems();
  const blockBefore = await fetchEraUnoBlock();
  const row = rowByTitle(page, "Rayuela");
  await expect(row).toBeVisible();
  const key = await row.getAttribute("data-key");
  const itemId = key!.split(":")[2];

  try {
    await row.getByRole("button", { name: /^Acciones de / }).click();
    const sheet = page.getByRole("dialog");
    // La ZONA es la colocación (spec §«Tres zonas») — ya no hay desplegable
    // de `placement` con un valor intermedio que dejar inconsistente.
    await sheet.getByRole("button", { name: "Cuando quieras" }).click();
    await expect(sheet).toHaveCount(0);
    await save(page);

    // Recarga desde cero: fuerza traer las props del servidor, sin nada de
    // estado de cliente que pueda maquillar un guardado que en realidad no
    // llegó a BD. La verificación de verdad es contra BD, no contra lo que
    // pinte la pantalla.
    await page.reload();
    await expect(rowByTitle(page, "Rayuela")).toBeVisible();
    const persisted = (await fetchEraUnoItems()).find((r) => r.item_id === itemId)!;
    expect(persisted.placement).toBe("libre");
    expect(persisted.position).toBeNull();
  } finally {
    await restoreEraUno(itemsBefore, blockBefore);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2 (antes: "«Hueco fijo» sin número se rechaza y no escribe", por
// formulario). El editor de secuencia deriva el número del índice del hueco
// y JAMÁS lo deja teclear (spec §«El número no se teclea») — la combinación
// «hueco fijo sin número» ya no es alcanzable desde la UI, así que ya no hay
// paso de curación que reescribir. El CHECK de BD que la rechazaba sigue
// vivo (`saga_items_placement_position`, 20260725_saga_placement.sql) y sigue
// siendo la última red si algo escribe fuera de la UI (un futuro RPC, una
// migración manual…) — se prueba directamente por REST, mismo patrón que el
// Test 7 de abajo (rama simétrica del mismo CHECK).
// ─────────────────────────────────────────────────────────────────────────
test("el CHECK de BD rechaza «hueco fijo» sin número (placement=fijo, position=null)", async () => {
  const restUrl = `${SUPABASE_URL}/rest/v1/saga_items`;
  const badItemId = randomUUID();

  const badRes = await fetch(restUrl, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      saga_id: ERA_UNO_ID,
      item_type: "book",
      item_id: badItemId,
      position: null,
      placement: "fijo",
    }),
  });

  expect(badRes.status).toBe(400);
  const badBody = (await badRes.json()) as { code?: string; message?: string };
  expect(badBody.code).toBe("23514");
  expect(badBody.message).toContain("saga_items_placement_position");

  // Confirma que no escribió nada.
  const checkRes = await fetch(
    `${restUrl}?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${badItemId}&select=id`,
    { headers: adminHeaders() },
  );
  expect(((await checkRes.json()) as unknown[]).length).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3 (la aserción que de verdad importa): marcar "No cuenta en el
// progreso" en un miembro baja el DENOMINADOR del hero exactamente en 1, sin
// tocar el numerador. Miembro: "Libro sin valorar" — devtest no tiene ningún
// pase sobre él, así que queda fuera del cálculo de "completado" y el cambio
// de pct solo puede venir del denominador.
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
  const itemsBefore = await fetchEraUnoItems();
  const row = rowByTitle(page, "Libro sin valorar");
  await expect(row).toBeVisible();
  // El checkbox "opcional" vive EN la fila (densidad "compact" de escritorio),
  // sin necesidad de abrir la hoja — ver sequence-row.tsx.
  const optionalCheckbox = row.getByRole("checkbox", { name: "opcional" });
  await expect(optionalCheckbox).not.toBeChecked();

  try {
    await optionalCheckbox.check();
    await save(page);

    const after = await fetchEraUnoProgress();
    // El núcleo del test: el denominador cae en 1 y el numerador NO se mueve.
    expect(after.total).toBe(before.total - 1);
    expect(after.completed).toBe(before.completed);

    await page.goto(`/saga/${ERA_UNO_ID}`);
    const pctAfter = await heroPct(page);
    expect(pctAfter).toBe(after.pct);
    // pct estrictamente distinto de antes: con el mismo numerador y un
    // denominador menor, no puede quedar igual salvo un empate de redondeo
    // (que el seed actual no produce).
    expect(pctAfter).not.toBe(pctBefore);
  } finally {
    await restoreEraUno(itemsBefore, null);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 4 histórico OMITIDO A PROPÓSITO (no reescrito, no relajado): "un
// segundo Guardar sin tocar nada no revierte placement/optional".
//
// Protegía el hallazgo B-2 de la revisión de Task 8 (React 19 resetea los
// campos NO controlados de un `<form action={fn}>` a su `defaultValue` tras
// el éxito) sobre los dos campos de este spec. Mismo razonamiento que el test
// gemelo omitido en `e2e/sagas-rol-narrativo.spec.ts`: el editor de secuencia
// (Task 9) sustituyó ese `<form>` incontrolado por estado de React explícito
// (`useSequenceDraft`) — el guardado con éxito no toca ningún `defaultValue`,
// solo limpia `removed`/`isNew` en el propio estado (use-sequence-draft.ts:58-68).
// La clase de bug que este test protegía no tiene análogo estructural en la
// pantalla nueva. Se documenta en el informe de Task 12 en vez de borrarlo en
// silencio.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Test 5 (review de 76a3ef8, Finding 1): el contador de la cabecera de un
// grupo tiene que decir SIEMPRE lo mismo que la grid pinta debajo.
//
// La cabecera de "Era Uno" (tick + nombre + contador) SOLO se pinta vista
// desde `SAGA_UNIVERSO` — `/saga/${ERA_UNO_ID}` en solitario es
// `isSoleDirectGroup` y la omite por diseño — así que este test edita en Era
// Uno pero verifica en Universo.
//
// Miembro: "Rayuela" (position=1, placement=fijo en el seed) — el mismo que
// Test 1 alterna entre `fijo`/`libre`. La suite corre en serie (`workers: 1`
// en playwright.config.ts), así que no hay solape entre ambos tests, y este
// también restaura el seed en su `finally` pase o falle.
// ─────────────────────────────────────────────────────────────────────────
test("el contador de la cabecera de un grupo coincide con su grid, incluso con un «libre» dentro", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  const itemsBefore = await fetchEraUnoItems();
  const blockBefore = await fetchEraUnoBlock();

  const row = rowByTitle(page, "Rayuela");
  await expect(row).toBeVisible();

  // La cabecera de "Era Uno" es un `<h3>` + tick + un `<span>` con el
  // contador (decorativo, sin rol ni etiqueta accesible — no hay forma de
  // localizarlo por rol, así que se acota por texto puramente numérico
  // dentro de la MISMA fila que el `<h3>`, el único nodo así en esa fila).
  // La grid es el `<ul>` hermano inmediatamente siguiente a esa fila
  // (estructura de saga-info.tsx: `GroupBody` se pinta justo después del
  // `<div>` de cabecera dentro del mismo grupo).
  const eraUnoHeading = page.getByRole("heading", {
    level: 3,
    name: "[QA Sagas v2] Era Uno",
  });
  const eraUnoHeaderRow = eraUnoHeading.locator("xpath=..");
  const eraUnoCount = eraUnoHeaderRow.getByText(/^\d+$/);
  const eraUnoGrid = eraUnoHeading.locator("xpath=../following-sibling::ul[1]");
  const freeHeading = page.getByRole("heading", { level: 2, name: "Cuando quieras" });

  try {
    await page.goto(`/saga/${SAGA_UNIVERSO}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Baseline del seed: 4 miembros directos, todos `fijo` — cabecera y grid
    // coinciden en 4, y no hay sección «Cuando quieras» todavía.
    await expect(eraUnoCount).toHaveText("4");
    await expect(eraUnoGrid.getByRole("listitem")).toHaveCount(4);
    await expect(freeHeading).toHaveCount(0);

    // Pone Rayuela en «Se lee cuando quieras» (mismo cambio que Test 1).
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    const editRow = rowByTitle(page, "Rayuela");
    await editRow.getByRole("button", { name: /^Acciones de / }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Cuando quieras" }).click();
    await expect(sheet).toHaveCount(0);
    await save(page);

    // La aserción que de verdad importa: la cabecera BAJA a 3 — no se queda
    // huérfana en 4 — y la grid pinta exactamente esos mismos 3, nunca un
    // número que la grid de debajo no respalde. Rayuela sale de la grid de
    // su grupo y aparece solo en «Cuando quieras».
    await page.goto(`/saga/${SAGA_UNIVERSO}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(eraUnoCount).toHaveText("3");
    await expect(eraUnoGrid.getByRole("listitem")).toHaveCount(3);
    await expect(eraUnoGrid.getByText("Rayuela")).toHaveCount(0);
    // A diferencia de `eraUnoGrid` (donde `GroupBody` es el propio `<ul>`,
    // hermano directo de la fila de cabecera), la sección «Cuando quieras»
    // envuelve sus listas en un `<div className="flex flex-col gap-5">`
    // (saga-info.tsx, fix issue #198: acoge tanto obras sueltas como bloques
    // libres enteros) — el `<ul>` de los miembros sueltos es DESCENDIENTE de
    // ese div, no hermano directo del `<h2>`. `following-sibling::ul[1]`
    // nunca lo encuentra (hallazgo 2026-07-27, al correr la suite de sagas
    // tras la fase 3): no es una regresión del producto — el snapshot de
    // accesibilidad del test fallido ya mostraba a "Rayuela" pintado bajo
    // "Cuando quieras" — es que el árbol de accesibilidad aplana los `<div>`
    // sin rol, así que ocultaba el desajuste con el DOM real que sí sigue
    // `xpath`. Un salto más (al div, luego a su primer `ul` descendiente)
    // sigue exactamente la estructura real sin debilitar la comprobación.
    const freeGrid = freeHeading.locator("xpath=following-sibling::div[1]//ul[1]");
    await expect(freeGrid.getByText("Rayuela").first()).toBeVisible();
  } finally {
    await restoreEraUno(itemsBefore, blockBefore);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 6 (review de 76a3ef8, Finding 2): el `sr-only` que explica el contorno
// punteado (`labels.noSlot`, `saga.noOrderSlotHint`) tiene que salir SIN
// sesión. `MemberCell`/`GroupBody` no reciben `canConfigure` en su firma (a
// diferencia del aviso de deuda de curación, que sí), así que es
// estructuralmente imposible que dependa del rol de quien mira — la prueba
// de eso es visitar la página sin loguearse en absoluto.
//
// Sin cambios respecto al spec original: es de solo lectura, no toca
// `/editar` en ningún momento, así que la reescritura de Task 9 no le afecta.
//
// Miembro read-only: "Trilogía La casa de los espíritus", miembro DIRECTO de
// `SAGA_UNIVERSO` con `placement=null` fijo en el seed; ningún spec de sagas
// lo muta.
// ─────────────────────────────────────────────────────────────────────────
test("el sr-only del contorno punteado sale sin sesión, solo en la obra sin hueco", async ({
  page,
}) => {
  await page.goto(`/saga/${SAGA_UNIVERSO}`);
  await page.waitForLoadState("networkidle").catch(() => {});

  // Sin sesión, el aviso de deuda de curación (canConfigure-gated,
  // `unclassifiedNotice`) nunca se pinta. Si el sr-only aparece de todos
  // modos, queda demostrado que es independiente de ese aviso y del rol de
  // quien mira, no solo "en teoría" sino en esta misma carga de página.
  await expect(page.getByText(/obras? sin clasificar/)).toHaveCount(0);

  const unclassifiedItem = page
    .locator("li")
    .filter({ hasText: "Trilogía La casa de los espíritus" });
  await expect(unclassifiedItem).toBeVisible();
  await expect(unclassifiedItem.locator("div").first()).toHaveClass(/outline-dashed/);
  await expect(
    unclassifiedItem.getByText(NO_SLOT_TEXT, { exact: true }),
  ).toBeAttached();

  // Control negativo: un miembro `fijo` normal (Rayuela, en la grid de Era
  // Uno) no lleva ni el contorno ni el sr-only — el hint es condicional, no
  // un texto que se cuela en toda celda.
  const classifiedItem = page.locator("li").filter({ hasText: "Rayuela" });
  await expect(classifiedItem).toBeVisible();
  await expect(classifiedItem.locator("div").first()).not.toHaveClass(/outline-dashed/);
  await expect(classifiedItem.getByText(NO_SLOT_TEXT, { exact: true })).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 7 (Crítico del review final de la rama, 2026-07-26): pin del CHECK de
// BD `saga_items_placement_position` directamente por REST, sin pasar por la
// UI. Rama simétrica del Test 2 de arriba: «`placement=null` con `position`
// puesto», escrito como `OR` de tres ramas en el CHECK original, colaba
// porque con `placement IS NULL` las dos primeras ramas daban `NULL` (no
// `FALSE`) y el `OR` entero salía `NULL` — y un CHECK solo rechaza `FALSE`.
// Ni la UI ni ningún RPC pueden ejercitar esa rama hoy (el editor no ofrece
// "sin clasificar" con número), así que la única forma de golpear el CHECK
// real es un INSERT directo, como hace este test.
//
// `saga_items.item_id` no lleva FK (es polimórfico: book|movie|series) así
// que no hace falta un libro/película/serie real para ejercitar el CHECK.
// ─────────────────────────────────────────────────────────────────────────
test("el CHECK de BD rechaza «sin clasificar» con número puesto (placement=null, position≠null)", async () => {
  const restUrl = `${SUPABASE_URL}/rest/v1/saga_items`;
  const badItemId = randomUUID();

  const badRes = await fetch(restUrl, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      saga_id: ERA_UNO_ID,
      item_type: "book",
      item_id: badItemId,
      position: 999,
      placement: null,
    }),
  });

  // 400 + código de Postgres 23514 (check_violation) sobre el constraint
  // exacto — no basta con "no 2xx", porque un 400 por otro motivo (p. ej. un
  // typo de columna) haría pasar el test sin que el CHECK haya intervenido.
  expect(badRes.status).toBe(400);
  const badBody = (await badRes.json()) as { code?: string; message?: string };
  expect(badBody.code).toBe("23514");
  expect(badBody.message).toContain("saga_items_placement_position");

  // Confirma que no escribió nada (defensivo: si el 400 viniera de un motivo
  // distinto al CHECK, esto lo delataría).
  const checkRes = await fetch(
    `${restUrl}?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${badItemId}&select=id`,
    { headers: adminHeaders() },
  );
  expect(((await checkRes.json()) as unknown[]).length).toBe(0);

  // Control positivo, mismo request salvo `placement:'fijo'`: confirma que
  // el rechazo de arriba es del CHECK sobre esta combinación exacta, no de
  // algo ajeno (RLS, columna inexistente, etc.) que bloquease cualquier
  // INSERT en `saga_items` diera igual el valor. Se limpia inmediatamente.
  const goodItemId = randomUUID();
  const goodRes = await fetch(restUrl, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      saga_id: ERA_UNO_ID,
      item_type: "book",
      item_id: goodItemId,
      position: 999,
      placement: "fijo",
    }),
  });
  expect(goodRes.status).toBe(201);
  await fetch(`${restUrl}?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${goodItemId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
});
