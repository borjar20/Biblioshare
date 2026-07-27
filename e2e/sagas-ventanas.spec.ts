import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 2b (Task 7, Step 1 — brief en .superpowers/sdd/task-7-brief.md):
// la ventana de colocación de una entrada `libre` («Nacidos Era 2 es opcional,
// A PARTIR DE Era 1, y recomendable ANTES DE Viento y Verdad»). Cubre lo que
// las pruebas unitarias de sequence-draft.ts/get-saga-sequence.ts no pueden:
// que curar dos anclas en `/saga/[id]/editar` se guarda de verdad, sobrevive a
// un reload, y que la coherencia «solo lo `libre` tiene ventana» —que ningún
// CHECK entre tablas puede imponer— la sostiene el guardado real, no solo la
// función pura `sendTo`.
//
// Mismo universo QA y mismo patrón de sesión/limpieza que el resto de specs de
// sagas (sagas-colocacion-bloques.spec.ts, sagas-colocacion-opcionalidad.spec.ts):
// la cuenta `devtest` tiene `role='admin'` en dev, que cumple collaborator+.
//
// Aviso del brief: el plan original se escribió antes que los componentes, así
// que este spec no da por buenos sus nombres — está escrito leyendo
// window-editor.tsx, anchor-picker.tsx, row-sheet.tsx, shell-desktop.tsx y
// shell-mobile.tsx primero, y verificado contra BD dev (mcp__supabase-dev,
// 2026-07-27) antes de elegir el universo.
//
// Universo QA: "[QA Sagas v2] Era Uno" (no "Universo" — mismo motivo que
// sagas-colocacion-opcionalidad.spec.ts: interesa que `/editar` sea el de la
// saga DUEÑA real de los `saga_items` que se tocan, porque el editor de
// secuencia solo lista y solo puede escribir filas cuya `saga_id` es la propia
// saga, #187). Verificado contra BD dev: 4 miembros directos, todos
// `placement=fijo`/`optional=false` — Rayuela(1), Libro sin valorar(2), Libro
// raro sin match(3), Para leer a Isabel Allende(4) — y una única hija directa,
// "[QA Sagas v2] Nieta" (position_in_parent=5, placement_in_parent=fijo), que
// no tiene miembros propios. `getAnchorOptions` (fase 2b) resuelve las anclas
// del SUBÁRBOL de Era Uno, así que el universo de anclas disponibles para
// cualquier entrada `libre` de Era Uno es exactamente esos 4 ítems + el bloque
// Nieta (menos el propio sujeto).
//
// "Para leer a Isabel Allende" (posición 4, justo antes de Nieta) es la
// entrada que este spec pone `libre`: ningún otro spec de sagas cambia su
// `placement`/`position` (sagas-v2*.spec.ts solo la LEEN; solo
// sagas-rol-narrativo.spec.ts toca "Libro raro sin match", y únicamente su
// `role`, que este spec no usa). Como es la ÚLTIMA entrada antes del bloque
// Nieta, sacarla de la secuencia solo desplaza a Nieta un hueco (5→4) — el
// mismo efecto de renumeración que ya documentó
// sagas-colocacion-opcionalidad.spec.ts, y la razón de que la restauración de
// abajo también recomponga la posición de Nieta, no solo la del ítem.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno
const NIETA_ID = "02484dc9-9885-4627-9176-912ac45f85e0"; // [QA Sagas v2] Nieta
const ISABEL_ID = "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc"; // "Para leer a Isabel Allende"
const ISABEL_TITLE = "Para leer a Isabel Allende";
const RAYUELA_TITLE = "Rayuela";
const LIBRO_RARO_TITLE = "Libro raro sin match";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

async function save(page: Page) {
  await page.getByRole("button", { name: "Guardar secuencia" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
}

// Fila de la entrada, escopada a la cáscara VISIBLE: las dos se montan a la
// vez y se ocultan por breakpoint (regla de los dos árboles), así que sin
// `:visible` este locator encuentra dos elementos — mismo patrón que
// sagas-colocacion-bloques.spec.ts, aquí por `data-key` de OBRA (`i:book:<id>`)
// en vez de bloque (`s:<id>`).
function isabelRow(page: Page) {
  return page.locator(`[data-testid="sequence-row"][data-key="i:book:${ISABEL_ID}"]:visible`);
}

// `WindowEditor` (window-editor.tsx) NO lleva testid propio: se monta como el
// hermano inmediatamente siguiente a la fila dentro del mismo `<div key=e.key>`
// (ver shell-desktop.tsx/shell-mobile.tsx — ambos calcan la misma estructura
// `{row(e, null)}<WindowEditor .../>`), así que localizarlo por XPath relativo
// a la fila YA resuelta (`:visible`, por tanto única) es el único selector
// estable sin inventar un testid nuevo en el componente.
function isabelWindowEditor(page: Page) {
  return isabelRow(page).locator("xpath=following-sibling::div[1]");
}

type ItemRow = { item_id: string; position: number | null; placement: string | null };
type BlockRow = { id: string; position_in_parent: number | null; placement_in_parent: string | null };

/** `fetch` nativo, NO el fixture `request` de Playwright: ese muere con el
 *  contexto del test, así que en un timeout a mitad de test la limpieza del
 *  `finally` no llegaría a correr y dejaría filas huérfanas en dev (precedente:
 *  sagas-colocacion-bloques.spec.ts). Todas las funciones de abajo comprueban
 *  `res.ok` por la misma razón que allí (issues #180/#182): un 4xx que se
 *  tratara como éxito dejaría la restauración escribiendo basura en silencio. */
async function fetchIsabel(): Promise<ItemRow> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${ISABEL_ID}&select=item_id,position,placement`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`fetchIsabel: ${res.status} ${res.statusText} — ${await res.text()}`);
  const rows = (await res.json()) as ItemRow[];
  if (!rows[0]) throw new Error("fetchIsabel: no se encontró la fila en Era Uno — ¿cambió el seed?");
  return rows[0];
}

async function patchIsabel(patch: { position: number | null; placement: string | null }) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${ISABEL_ID}`,
    {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`patchIsabel: ${res.status} ${res.statusText} — ${await res.text()}`);
}

async function fetchNieta(): Promise<BlockRow> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sagas?id=eq.${NIETA_ID}&select=id,position_in_parent,placement_in_parent`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`fetchNieta: ${res.status} ${res.statusText} — ${await res.text()}`);
  const rows = (await res.json()) as BlockRow[];
  if (!rows[0]) throw new Error("fetchNieta: no se encontró Nieta — ¿cambió el seed?");
  return rows[0];
}

async function patchNieta(patch: { position_in_parent: number | null; placement_in_parent: string | null }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${NIETA_ID}`, {
    method: "PATCH",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patchNieta: ${res.status} ${res.statusText} — ${await res.text()}`);
}

async function fetchWindowRowsForIsabel(): Promise<unknown[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_placement_windows?item_id=eq.${ISABEL_ID}&select=id`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`fetchWindowRowsForIsabel: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res.json();
}

/** Limpieza defensiva de `saga_placement_windows`: el guardado real de la app
 *  las reemplaza por completo (`delete ... where saga_id = ...` dentro del
 *  RPC, 20260727_save_saga_sequence_windows.sql), pero un `PATCH` directo a
 *  `saga_items`/`sagas` en la restauración NUNCA toca esta tabla — así que sin
 *  este borrado explícito, una ventana creada por el test sobreviviría a la
 *  "restauración" del ítem y quedaría huérfana en dev. */
async function deleteWindowRowsForIsabel() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/saga_placement_windows?item_id=eq.${ISABEL_ID}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(`deleteWindowRowsForIsabel: ${res.status} ${res.statusText} — ${await res.text()}`);
}

async function insertWindowRow(row: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/saga_placement_windows`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insertWindowRow: ${res.status} ${res.statusText} — ${await res.text()}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1 (el que más valor añade de los tres, por orden del brief): poner las
// DOS anclas a una entrada `libre`, guardar, recargar y verlas — y de paso,
// el tope: con las dos puestas, `WindowEditor` no ofrece botón para añadir una
// tercera (window-editor.tsx: `{!bothSet && <button>...}`, condicional que
// solo se ejercita de verdad llegando a las dos anclas por la UI real).
// ─────────────────────────────────────────────────────────────────────────
test("las dos anclas de una entrada libre se guardan, persisten tras recargar, y no dejan añadir una tercera", async ({
  page,
}) => {
  const itemBefore = await fetchIsabel();
  const blockBefore = await fetchNieta();

  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);

    // 1) Mover la entrada a «Cuando quieras» — solo ahí existe `WindowEditor`
    // (montado condicionalmente por zona en shell-desktop.tsx/shell-mobile.tsx,
    // no por el componente en sí).
    await isabelRow(page).getByRole("button", { name: /^Acciones de /, exact: false }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cuando quieras" }).click();

    const windowEditor = isabelWindowEditor(page);

    // 2) Primera ancla («a partir de»): el botón de alta lleva `aria-label`
    // propio (window-editor.tsx: `t("windowAddFor", {title})`), que PISA el
    // texto visible ("+ Añadir ventana") como nombre accesible — hay que
    // localizarlo por ese `aria-label`, no por el texto que se ve en pantalla.
    await windowEditor
      .getByRole("button", { name: `Añadir ventana a ${ISABEL_TITLE}`, exact: true })
      .click();
    // El <dialog> de AnchorPicker SÍ usa el mismo texto como `aria-label` y
    // como texto del botón de enviar (sin interpolar título), así que aquí el
    // texto visible SÍ es el nombre accesible.
    let anchorDialog = page.getByRole("dialog", { name: "+ A partir de…" });
    // Clic en el <li>, no en el <label>/<input> directamente: el radio nativo
    // vive `sr-only` dentro del `<label>` (anchor-picker.tsx, clon deliberado
    // de tandem-picker.tsx) y el navegador reenvía el clic del área visible al
    // input asociado — mismo patrón que sagas-editor-secuencia.spec.ts con
    // tandem-picker.
    await anchorDialog.locator("li").filter({ hasText: RAYUELA_TITLE }).click();
    await anchorDialog.getByRole("button", { name: "+ A partir de…", exact: true }).click();

    // 3) Segunda ancla («antes de»): con `after` ya puesto y `before` aún no,
    // el `aria-label` pasa a `windowAddBeforeFor` (window-editor.tsx: `after ?
    // "windowAddBeforeFor" : "windowAddAfterFor"`) — mismo motivo que arriba,
    // se localiza por `aria-label`, no por el texto "+ Recomendable antes de…".
    await windowEditor
      .getByRole("button", { name: `Añadir antes de qué obra a ${ISABEL_TITLE}`, exact: true })
      .click();
    anchorDialog = page.getByRole("dialog", { name: "+ Recomendable antes de…" });
    await anchorDialog.locator("li").filter({ hasText: LIBRO_RARO_TITLE }).click();
    await anchorDialog.getByRole("button", { name: "+ Recomendable antes de…", exact: true }).click();

    // El tope (Test 3 del brief): con `bothSet`, `WindowEditor` no pinta NINGÚN
    // botón de alta — los dos únicos botones que quedan bajo la fila son las
    // ✕ de cada chip (`windowRemoveAnchor`). Comprobarlo por CUENTA total, no
    // por la ausencia de un texto concreto, es lo que de verdad demuestra que
    // no hay ninguna vía de añadir una tercera, ni con esta redacción ni con
    // otra futura.
    await expect(windowEditor.getByRole("button")).toHaveCount(2);

    // 4) Guardar y recargar desde cero: fuerza traer las props del servidor,
    // sin nada de estado de cliente que pueda maquillar un guardado que en
    // realidad no llegó a BD.
    await save(page);
    await page.reload();

    const reloadedWindowEditor = isabelWindowEditor(page);
    await expect(isabelRow(page)).toBeVisible();
    await expect(reloadedWindowEditor.getByText(RAYUELA_TITLE)).toBeVisible();
    await expect(reloadedWindowEditor.getByText(LIBRO_RARO_TITLE)).toBeVisible();

    // La verificación de verdad es contra BD, no contra lo que pinte la
    // pantalla: una fila por sujeto, con las dos anclas puestas.
    const rows = await fetchWindowRowsForIsabel();
    expect(rows.length).toBe(1);
  } finally {
    await patchIsabel({ position: itemBefore.position, placement: itemBefore.placement });
    await patchNieta({
      position_in_parent: blockBefore.position_in_parent,
      placement_in_parent: blockBefore.placement_in_parent,
    });
    await deleteWindowRowsForIsabel();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2 (Test 2 del brief — la coherencia, "el que más protege"): mover de
// vuelta a la secuencia una entrada `libre` que YA tiene una ventana guardada
// hace que esa ventana desaparezca de BD, porque ningún CHECK entre
// `saga_placement_windows` y `saga_items` puede imponerlo — lo sostiene el
// `delete from saga_placement_windows where saga_id = ...` del RPC
// (20260727_save_saga_sequence_windows.sql), antes de reinsertar solo lo que
// sigue siendo `libre`.
//
// La ventana se siembra por REST, no repitiendo el selector de anclas del
// Test 1: así se aísla la garantía del RPC (server-side) de la UI de
// selección (ya cubierta arriba), y es más fiel al escenario real — una
// ventana que ya estaba guardada de una sesión anterior, no una recién
// creada en el mismo borrador.
// ─────────────────────────────────────────────────────────────────────────
test("mover a la secuencia una entrada libre con ventana borra esa ventana en BD (coherencia)", async ({
  page,
}) => {
  const itemBefore = await fetchIsabel();
  const blockBefore = await fetchNieta();

  try {
    // Siembra: Isabel Allende pasa a `libre` con una ventana de una sola ancla
    // («a partir de Rayuela»), sin pasar por el editor.
    await patchIsabel({ position: null, placement: "libre" });
    await insertWindowRow({
      saga_id: ERA_UNO_ID,
      item_type: "book",
      item_id: ISABEL_ID,
      child_saga_id: null,
      after_item_type: "book",
      after_item_id: "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a", // Rayuela
      after_child_saga_id: null,
      before_item_type: null,
      before_item_id: null,
      before_child_saga_id: null,
    });

    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);

    // Confirma la siembra ANTES de actuar: si esto fallara, el resto del test
    // estaría demostrando algo distinto de lo que dice el título.
    await expect(isabelWindowEditor(page).getByText(RAYUELA_TITLE)).toBeVisible();

    // Act: la saca de «Cuando quieras» de vuelta a la secuencia. Sin
    // `slotNumber` (está en `free`), el botón de esa zona en la hoja dice "La
    // secuencia" (row-sheet.tsx: `t('zone.sequence')`, no "Hueco N" — eso solo
    // se pinta si YA está en un hueco).
    await isabelRow(page).getByRole("button", { name: /^Acciones de /, exact: false }).click();
    await page.getByRole("dialog").getByRole("button", { name: "La secuencia" }).click();
    await save(page);

    // Assert: la comprobación que de verdad protege este caso es contra BD —
    // ningún CHECK entre tablas puede haberlo hecho, así que si sigue habiendo
    // fila aquí es que el `delete` del RPC no corrió (o corrió mal).
    const rows = await fetchWindowRowsForIsabel();
    expect(rows.length).toBe(0);
  } finally {
    await patchIsabel({ position: itemBefore.position, placement: itemBefore.placement });
    await patchNieta({
      position_in_parent: blockBefore.position_in_parent,
      placement_in_parent: blockBefore.placement_in_parent,
    });
    await deleteWindowRowsForIsabel();
  }
});
