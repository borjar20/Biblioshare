import { expect, test, type Page } from "@playwright/test";

// E2E del rol narrativo (issue #167), reescrito para el editor de secuencia
// (Task 9/12 de la fase 2a — sustituye el formulario por fila `<form>` que
// tenía cada miembro). Contra el universo QA compartido `sagas-v2*.spec.ts`
// (seed de fase 2).
//
// Convención del repo: cada spec de e2e es autónoma, sin helpers compartidos
// (comentario de cabecera de `e2e/sagas-itinerarios.spec.ts`) — el `loginAs`
// de abajo está calcado de `e2e/sagas-v2-editor.spec.ts`.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo
// Cambio de arquitectura (Task 9, `get-saga-sequence.ts`): el editor de
// secuencia SOLO lista y SOLO puede escribir los `saga_items` cuya `saga_id`
// es la propia saga que se edita — ya no "toda la subsaga" como hacía el
// formulario viejo (issue #187). Los miembros de "Era Uno" se curan ahora en
// SU PROPIO `/editar`, nunca en el de Universo, aunque la FICHA de Universo
// (`getSagaDetail`, sin cambios) los siga agregando para pintarlos.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno

// Miembro DIRECTO de Era Uno, position=3 / placement=fijo / role=null en el
// seed — confirmado contra BD dev (`saga_items`, mcp__supabase-dev) antes de
// escribir este spec. Título suficientemente específico (no coincide con
// ningún otro ítem del seed) para localizar su fila sin ambigüedad.
const LOOSE_ITEM_TITLE = "Libro raro sin match";

const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Calcado del helper `loginAs` de sagas-v2-editor.spec.ts/sagas-itinerarios.spec.ts.
async function loginAsCollaborator(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', COLLAB_EMAIL);
  await page.fill('input[name="password"]', COLLAB_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

type ItemRow = { item_id: string; position: number | null; placement: string | null; role: string | null };
type BlockRow = { id: string; position_in_parent: number | null; placement_in_parent: string | null };

async function fetchEraUnoItems(): Promise<ItemRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement,role`,
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
      body: JSON.stringify({ position: r.position, placement: r.placement, role: r.role }),
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

// ─────────────────────────────────────────────────────────────────────────
// Test histórico OMITIDO A PROPÓSITO (no reescrito, no relajado): "un segundo
// Guardar sin tocar nada no reenvía un rol obsoleto".
//
// Protegía el hallazgo B-2 de la revisión de Task 8: React 19 resetea los
// campos NO controlados de un `<form action={fn}>` a su `defaultValue` tras
// el éxito, y un `defaultValue` obsoleto hacía que un segundo "Guardar" sin
// tocar nada reenviara "" y borrara el rol recién guardado.
//
// El editor de secuencia (Task 9) sustituyó ese `<form>` por defecto
// incontrolado por estado de React explícito (`useSequenceDraft` — ver su
// comentario de cabecera: "ÚNICA fuente de estado del editor"): el `<select>`
// de rol es CONTROLADO (`value={entry.role ?? ""}`), y un guardado con éxito
// no toca ningún `defaultValue` — solo limpia `removed`/`isNew` en el propio
// estado de React (use-sequence-draft.ts:58-68). No hay ningún mecanismo por
// el que un segundo guardado sin cambios pueda reenviar un valor viejo: la
// clase de bug que este test protegía no tiene análogo estructural en la
// pantalla nueva, no porque se haya arreglado aquí, sino porque la arquitectura
// que lo causaba ya no existe. Reescribirlo forzando algo "parecido" sería
// fabricar cobertura de un mecanismo que ya no aplica. Se documenta en el
// informe de Task 12 en vez de borrarlo en silencio.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Tests A/B/C (Task 9, reescritos 2026-07-26 para el editor de secuencia —
// Decisión 1 del encargo de Task 9: "Fuera del orden principal" desaparece).
//
// Colocación: el editor ya no ofrece un desplegable de `placement` con un
// valor intermedio inconsistente — la ZONA ES la colocación (spec §«Tres
// zonas», sequence-draft.ts:4-6). Mandar una fila a "Sin clasificar" declara
// `placement = null` directamente, sin el rechazo `badPlacement` que existía
// cuando el formulario permitía dejar `placement: "fijo"` con `position`
// vacío (ese rechazo AHORA es estructuralmente imposible desde la UI: el
// número lo deriva el índice del hueco, nunca se teclea — cubierto por
// e2e/sagas-colocacion-opcionalidad.spec.ts, que sí ejercita el CHECK
// directamente por REST).
//
// Las aserciones de chip escopan siempre al `<li>` de ESTE ítem
// (`.locator("li").filter({ hasText: LOOSE_ITEM_TITLE })`), nunca a la página
// entera — ver razonamiento original en el historial de este fichero.
// ─────────────────────────────────────────────────────────────────────────

test("una obra sin clasificar aparece en la grid de su grupo con su rol", async ({ page }) => {
  await loginAsCollaborator(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);

  const itemsBefore = await fetchEraUnoItems();
  const blockBefore = await fetchEraUnoBlock();
  const row = rowByTitle(page, LOOSE_ITEM_TITLE);
  await expect(row).toBeVisible();

  try {
    await row.getByRole("button", { name: /^Acciones de / }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Rol primero: el botón de zona cierra la hoja al pulsarlo (`onZone`
    // desmonta vía `setMenuKey(null)`), así que tiene que ir el último.
    await sheet.getByLabel("Qué es").selectOption("precuela");
    await sheet.getByRole("button", { name: "Sin clasificar" }).click();
    await expect(sheet).toHaveCount(0);

    await save(page);

    await page.goto(`/saga/${UNIVERSO_ID}`);

    // Lo que de verdad afirma este test: pertenencia (visible en la grid,
    // marcada como sin clasificar por el contorno) Y decoración (chip),
    // ambas sobre la fila de ESTE ítem.
    const item = page.locator("li").filter({ hasText: LOOSE_ITEM_TITLE });
    await expect(item).toBeVisible();
    // El contorno punteado dorado es la ÚNICA señal de "sin clasificar" en la
    // grid (MemberCell, `m.placement === null`, saga-info.tsx:76).
    await expect(item.locator("div").first()).toHaveClass(/outline-dashed/);
    await expect(item.getByText("Precuela")).toBeVisible();
  } finally {
    // Deja position/placement/role como los trajo el seed, pase o falle el test.
    await restoreEraUno(itemsBefore, blockBefore);
  }
});

test("una obra sin clasificar Y sin rol sale en la grid, pero sin chip", async ({ page }) => {
  // Separa pertenencia (placement === null) de decoración (role !== null): es
  // la distinción que más fácil se rompe al refactorizar la grid, y la que
  // hace que "sin clasificar" se vea como trabajo pendiente en vez de
  // disfrazarse.
  await loginAsCollaborator(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);

  const itemsBefore = await fetchEraUnoItems();
  const blockBefore = await fetchEraUnoBlock();
  const row = rowByTitle(page, LOOSE_ITEM_TITLE);
  await expect(row).toBeVisible();

  try {
    await row.getByRole("button", { name: /^Acciones de / }).click();
    const sheet = page.getByRole("dialog");
    // role se deja tal cual: sin tocar el select, "" ya es "sin rol".
    await sheet.getByRole("button", { name: "Sin clasificar" }).click();
    await expect(sheet).toHaveCount(0);

    await save(page);

    await page.goto(`/saga/${UNIVERSO_ID}`);

    const item = page.locator("li").filter({ hasText: LOOSE_ITEM_TITLE });
    await expect(item).toBeVisible();
    await expect(item.locator("div").first()).toHaveClass(/outline-dashed/);
    for (const label of ["Precuela", "Spin-off", "Relato", "Paralela"]) {
      await expect(item.getByText(label)).toHaveCount(0);
    }
  } finally {
    await restoreEraUno(itemsBefore, blockBefore);
  }
});

test("el progreso del hero NO se mueve al marcar un rol", async ({ page }) => {
  // Red contra el #91: el rol es puramente semántico y no toca el
  // denominador. `saga_items.role`, que es lo único que toca este test, es un
  // campo totalmente distinto de `optional` — no hay manera de que marcar un
  // rol lo mueva.
  //
  // OJO: el hero imprime un PORCENTAJE (`{progress.pct}%`,
  // `saga-hero.tsx:102`), no "N de M". No fijamos aquí el valor baseline (a
  // diferencia de itinerarios): esta saga puede ganar o perder pases
  // completados entre corridas por otros specs/QA manual, así que la
  // aserción es "no cambió", no "vale tal cosa".
  await loginAsCollaborator(page);
  await page.goto(`/saga/${UNIVERSO_ID}`);
  const hero = page.getByTestId("saga-hero-progress");
  await expect(hero).toBeVisible();
  const before = await hero.textContent();

  await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  const itemsBefore = await fetchEraUnoItems();
  const row = rowByTitle(page, LOOSE_ITEM_TITLE);
  await expect(row).toBeVisible();

  try {
    await row.getByRole("button", { name: /^Acciones de / }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Qué es").selectOption("relato");
    // Cierra con la ✕, NO con un botón de zona: este test no debe tocar la
    // colocación, solo el rol.
    await sheet.getByRole("button", { name: "Cerrar" }).click();
    await expect(sheet).toHaveCount(0);

    await save(page);

    await page.goto(`/saga/${UNIVERSO_ID}`);
    await expect(page.getByTestId("saga-hero-progress")).toHaveText(before ?? "");
  } finally {
    // No toca zonas, así que no hace falta restaurar el bloque — solo el rol.
    await restoreEraUno(itemsBefore, null);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test D (guarda del badge "Requisito" en el timeline) — OMITIDO A PROPÓSITO.
//
// Investigado contra BD dev (`saga_edges`/`saga_nodes`, `mcp__supabase-dev`):
// en TODA la base dev hay exactamente UNA arista `edge_type='requisito'`
// (id `2a237928-aadf-4b63-9f2a-d1d8a9123092`), y conecta "Trilogía La casa de
// los espíritus" (de174e85…, sin position, miembro DIRECTO del Universo) con
// el nodo de columna orderNo=4. En `derive-timeline.ts`, un nodo fuera de
// columna se pinta como RAMA solo si `groupSagaId !== null`; si es null (caso
// "Trilogía": `saga_items.saga_id === Universo`, ver `directChildFor` en
// get-saga-detail.ts) se pinta como PUENTE. Esa única arista `requisito`
// produce, hoy, un puente — nunca una rama con `edgeType: "requisito"` — así
// que no hay forma de ejercer el badge `branchRequisite` (reading-timeline.tsx)
// leyendo el seed tal cual.
//
// El editor de grafo se retiró en la fase 2a (Task 11, `/mapa/editar`
// redirige a `/editar`), así que fabricar el dato ya ni siquiera es posible
// por UI — solo quedaría una migración de datos directa sobre `saga_edges`,
// que mutaría el grafo compartido que otras specs hermanas (`sagas-v2-mapa.spec.ts`)
// asumen fijo. Se mantiene sin red e2e — issue de seguimiento, ver informe de
// Task 9/12.
