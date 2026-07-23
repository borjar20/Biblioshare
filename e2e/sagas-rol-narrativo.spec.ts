import { expect, test, type Page } from "@playwright/test";

// E2E de la revisión de Task 8 (issue #167, `/saga/[id]/editar`). Contra el
// universo QA compartido `sagas-v2*.spec.ts` (seed de fase 2) — este spec NO
// escribe nada nuevo en BD: usa un miembro cuyo `role` el seed deja en null
// (`Libro sin valorar`, ver más abajo) y lo devuelve a null al terminar, así
// que relanzar la suite no acumula estado.
//
// Criterio de aceptación innegociable de la revisión:
//
//   Tras un guardado con éxito, volver a pulsar Guardar SIN TOCAR NADA no
//   cambia ningún dato.
//
// Sin el arreglo (hallazgo B-2 de la revisión, DATA-LOSS): React 19 resetea los
// campos NO controlados de un <form action={fn}> a su `defaultValue` tras el
// éxito. Si ese `defaultValue` sigue siendo la prop vieja (el valor con el que
// se montó la página, antes de guardar nada), el <select> vuelve a mostrar
// "Sin clasificar" aunque el usuario acabe de elegir un rol y la BD ya lo
// tenga guardado — y un segundo click en "Guardar", sin que nadie toque el
// campo, reenvía ese "" y borra el rol recién guardado.
//
// El escenario ejerce TAMBIÉN el hallazgo B-1 de la revisión (`ownerSagaId`):
// se edita el rol de un miembro que en `saga_items` NO cuelga de la saga que
// se está editando (Universo, `UNIVERSO_ID`) sino de su subsaga "Era Uno"
// (`53118dd4-ccd9-4a9d-8241-5899816a9eab` — confirmado con
// `mcp__supabase-dev__execute_sql` contra `saga_items`). La pantalla
// `/editar` de Universo lista igualmente ese miembro (incluye TODA la
// subsaga, ver comentario en `src/app/saga/[id]/editar/page.tsx`), así que si
// el action bindeara mal `ownerSagaId` (p. ej. contra la saga que se edita en
// vez de la dueña real de la fila), el guardado fallaría en silencio con
// "notMember" y este test no llegaría ni al primer "Guardado".
//
// Convención del repo: cada spec de e2e es autónoma, sin helpers compartidos
// (comentario de cabecera de `e2e/sagas-itinerarios.spec.ts`) — el `loginAs`
// de abajo está calcado de `e2e/sagas-v2-editor.spec.ts`.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo

// Miembro sembrado con role=null y position=2, cuya fila real de saga_items
// cuelga de "[QA Sagas v2] Era Uno" (53118dd4-ccd9-4a9d-8241-5899816a9eab),
// no de Universo — confirmado contra BD antes de escribir este test. Título
// suficientemente específico (no coincide con ningún otro ítem del seed) para
// localizar su `<form>` por texto sin ambigüedad.
const MEMBER_TITLE = "Libro sin valorar";

const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";

// Calcado del helper `loginAs` de sagas-v2-editor.spec.ts/sagas-itinerarios.spec.ts.
async function loginAsCollaborator(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', COLLAB_EMAIL);
  await page.fill('input[name="password"]', COLLAB_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Localiza la fila (el <form> de MemberRow) por el título del miembro: cada
// fila es un <form> independiente con su propio botón "Guardar", así que
// escopar por aquí evita ambigüedad con las demás filas de la pantalla.
function memberRow(page: Page) {
  return page.locator("form").filter({ hasText: MEMBER_TITLE });
}

test("un segundo Guardar sin tocar nada no reenvía un rol obsoleto", async ({ page }) => {
  await loginAsCollaborator(page);
  await page.goto(`/saga/${UNIVERSO_ID}/editar`);

  const row = memberRow(page);
  await expect(row).toBeVisible();
  const roleSelect = row.locator('select[name="role"]');
  const saveButton = row.getByRole("button", { name: "Guardar" });
  const savedLabel = row.getByText("Guardado", { exact: true });

  // Precondición del seed: sin rol asignado todavía.
  await expect(roleSelect).toHaveValue("");

  try {
    // 1) Pone un rol y guarda.
    await roleSelect.selectOption("spin_off");
    await saveButton.click();
    await expect(savedLabel).toBeVisible();

    // 2) Vuelve a pulsar Guardar SIN TOCAR NINGÚN CAMPO. Sin el arreglo, el
    // <select> ya se habría reseteado a "" tras el paso 1 (reset-tras-éxito
    // de React 19 aplicado sobre el `defaultValue` obsoleto), así que este
    // click reenviaría "" y borraría el rol recién guardado.
    //
    // Se espera al POST del server action, NO a que "Guardado" siga visible:
    // `useActionState` conserva el estado anterior mientras hay una acción en
    // vuelo, así que la etiqueta del paso 1 nunca desaparece y afirmarla aquí
    // sería un no-op. Con un no-op, un segundo POST que se cayera dejaría el
    // `spin_off` del paso 1 en BD y el test daría VERDE sin haber probado
    // nada — la red antipérdida dejaría de discriminar en silencio.
    const secondSave = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes(`/saga/${UNIVERSO_ID}/editar`),
    );
    await saveButton.click();
    await secondSave;

    // 3) Recarga desde cero (fuerza traer las props del servidor, sin nada
    // de estado de cliente que pueda maquillar un reset que ya ocurrió) y
    // confirma que el rol sigue siendo el guardado, no el original null.
    await page.reload();
    const roleSelectAfterReload = memberRow(page).locator('select[name="role"]');
    await expect(roleSelectAfterReload).toHaveValue("spin_off");
  } finally {
    // Limpieza: deja el seed como estaba (role=null) para no ensuciar dev de
    // cara a la siguiente corrida, tanto si el test pasó como si no.
    const cleanupRow = memberRow(page);
    const cleanupSelect = cleanupRow.locator('select[name="role"]');
    if ((await cleanupSelect.count()) > 0 && (await cleanupSelect.inputValue()) !== "") {
      await cleanupSelect.selectOption("");
      await cleanupRow.getByRole("button", { name: "Guardar" }).click();
      await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Tests A/B/C (Task 9). Miembro sembrado con position=3 y role=null, cuya
// fila real de saga_items cuelga de "[QA Sagas v2] Era Uno"
// (53118dd4-ccd9-4a9d-8241-5899816a9eab) — confirmado contra BD
// (`saga_items` + `books`) antes de escribir este bloque. Título único en
// todo el árbol del universo (no hay otro ítem cuyo título lo contenga), así
// que localizar su `<form>`/`<li>` por texto no es ambiguo.
//
// Deliberadamente NO se reutiliza `MEMBER_TITLE`/`memberRow` de arriba: ese
// miembro es del test antipérdida (arriba) y mezclar propósitos en la misma
// fila dificulta saber, si algo falla, cuál de los dos tests dejó el dato a
// medias. Se elige uno distinto y se restaura en cada `finally`.
//
// OJO con lo que el seed YA trae hecho a mano (y que un día se revertirá,
// según el encargo): "Trilogía La casa de los espíritus" (miembro directo del
// Universo, position=null) ya tiene role="precuela" HOY. Por eso las
// aserciones de chip de abajo escopan siempre al `<li>` de ESTE ítem
// (`.locator("li").filter({ hasText: LOOSE_ITEM_TITLE })`), nunca a la
// sección entera: `section.getByText("Precuela")` a secas daría un falso
// positivo en el test B (sin chip) porque Trilogía ya pinta ese chip en la
// MISMA sección "Fuera del orden principal" del grupo Nexo... salvo que aquí
// el ítem vive en el grupo "Era Uno", una sección `data-testid="out-of-order"`
// DISTINTA a la del grupo Nexo (cada grupo con miembros sueltos pinta la
// suya). Por eso también hace falta filtrar `getByTestId("out-of-order")`
// por texto: puede haber más de un nodo con ese testid en la página a la vez
// (uno por grupo), y un locator con más de un match revienta en modo
// estricto.
const LOOSE_ITEM_TITLE = "Libro raro sin match";

function rowByTitle(page: Page, title: string) {
  return page.locator("form").filter({ hasText: title });
}

test("una obra sin número aparece en «Fuera del orden principal» con su rol", async ({ page }) => {
  await loginAsCollaborator(page);
  await page.goto(`/saga/${UNIVERSO_ID}/editar`);

  const row = rowByTitle(page, LOOSE_ITEM_TITLE);
  await expect(row).toBeVisible();
  const positionInput = row.locator('input[name="position"]');
  const roleSelect = row.locator('select[name="role"]');
  const saveButton = row.getByRole("button", { name: "Guardar" });

  // Precondición del seed: position=3, sin rol.
  await expect(positionInput).toHaveValue("3");
  await expect(roleSelect).toHaveValue("");

  try {
    await positionInput.fill("");
    await roleSelect.selectOption("precuela");
    await saveButton.click();
    await expect(row.getByText("Guardado", { exact: true })).toBeVisible();

    await page.goto(`/saga/${UNIVERSO_ID}`);

    // Filtra el testid duplicado (uno por grupo con sueltos) al de ESTE ítem.
    const section = page.getByTestId("out-of-order").filter({ hasText: LOOSE_ITEM_TITLE });
    await expect(section.getByRole("heading", { name: "Fuera del orden principal" })).toBeVisible();

    // Lo que de verdad afirma este test: pertenencia (sección) Y decoración
    // (chip), ambas sobre la fila de ESTE ítem, no sobre la sección entera.
    const item = section.locator("li").filter({ hasText: LOOSE_ITEM_TITLE });
    await expect(item.getByText("Precuela")).toBeVisible();
  } finally {
    // Deja position/role como los trajo el seed, pase o falle el test.
    await page.goto(`/saga/${UNIVERSO_ID}/editar`);
    const cleanupRow = rowByTitle(page, LOOSE_ITEM_TITLE);
    if ((await cleanupRow.count()) > 0) {
      await cleanupRow.locator('input[name="position"]').fill("3");
      await cleanupRow.locator('select[name="role"]').selectOption("");
      await cleanupRow.getByRole("button", { name: "Guardar" }).click();
      await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
    }
  }
});

test("una obra sin número Y sin rol sale en la sección, pero sin chip", async ({ page }) => {
  // Separa pertenencia (position === null) de decoración (role !== null): es
  // la distinción que más fácil se rompe al refactorizar la grid, y la que
  // hace que "sin clasificar" se vea como trabajo pendiente en vez de
  // disfrazarse. Ver el comentario de cabecera del bloque sobre por qué las
  // aserciones de ausencia escopan al `<li>` de este ítem y no a la sección
  // entera (Trilogía ya pinta un chip "Precuela" en su propia sección, y esa
  // sección NO es esta).
  await loginAsCollaborator(page);
  await page.goto(`/saga/${UNIVERSO_ID}/editar`);

  const row = rowByTitle(page, LOOSE_ITEM_TITLE);
  const positionInput = row.locator('input[name="position"]');
  const roleSelect = row.locator('select[name="role"]');

  await expect(positionInput).toHaveValue("3");
  await expect(roleSelect).toHaveValue("");

  try {
    await positionInput.fill("");
    // role se deja tal cual: "" ya es "sin clasificar".
    await row.getByRole("button", { name: "Guardar" }).click();
    await expect(row.getByText("Guardado", { exact: true })).toBeVisible();

    await page.goto(`/saga/${UNIVERSO_ID}`);

    const section = page.getByTestId("out-of-order").filter({ hasText: LOOSE_ITEM_TITLE });
    const item = section.locator("li").filter({ hasText: LOOSE_ITEM_TITLE });
    await expect(item).toBeVisible();
    for (const label of ["Precuela", "Spin-off", "Relato", "Paralela"]) {
      await expect(item.getByText(label)).toHaveCount(0);
    }
  } finally {
    await page.goto(`/saga/${UNIVERSO_ID}/editar`);
    const cleanupRow = rowByTitle(page, LOOSE_ITEM_TITLE);
    if ((await cleanupRow.count()) > 0) {
      await cleanupRow.locator('input[name="position"]').fill("3");
      await cleanupRow.getByRole("button", { name: "Guardar" }).click();
      await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
    }
  }
});

test("el progreso del hero NO se mueve al marcar un rol", async ({ page }) => {
  // Red contra el #91: el rol es puramente semántico y no toca el
  // denominador. La saga tiene grafo (hasGraph=true), así que el denominador
  // real sale de `saga_nodes.order_no` (main-order.ts), un campo totalmente
  // distinto de `saga_items.position/role` que toca este test — no hay
  // manera de que marcar un rol lo mueva, y este test lo deja fijado en rojo
  // si algún día alguien reengancha el progreso a otra fuente.
  //
  // OJO: el hero imprime un PORCENTAJE (`{progress.pct}%`,
  // `saga-hero.tsx:102`), no "N de M" — ese otro número es el de la ruta
  // (route-view.tsx) y confundirlos es literalmente el #91. No fijamos aquí
  // el valor baseline (a diferencia de itinerarios): esta saga puede ganar o
  // perder pases completados entre corridas por otros specs/QA manual, así
  // que la aserción es "no cambió", no "vale tal cosa".
  await loginAsCollaborator(page);
  await page.goto(`/saga/${UNIVERSO_ID}`);
  const hero = page.getByTestId("saga-hero-progress");
  await expect(hero).toBeVisible();
  const before = await hero.textContent();

  await page.goto(`/saga/${UNIVERSO_ID}/editar`);
  const row = rowByTitle(page, LOOSE_ITEM_TITLE);
  const roleSelect = row.locator('select[name="role"]');
  await expect(roleSelect).toHaveValue("");

  try {
    await roleSelect.selectOption("relato");
    await row.getByRole("button", { name: "Guardar" }).click();
    await expect(row.getByText("Guardado", { exact: true })).toBeVisible();

    await page.goto(`/saga/${UNIVERSO_ID}`);
    await expect(page.getByTestId("saga-hero-progress")).toHaveText(before ?? "");
  } finally {
    await page.goto(`/saga/${UNIVERSO_ID}/editar`);
    const cleanupRow = rowByTitle(page, LOOSE_ITEM_TITLE);
    const cleanupRole = cleanupRow.locator('select[name="role"]');
    if ((await cleanupRole.count()) > 0 && (await cleanupRole.inputValue()) !== "") {
      await cleanupRole.selectOption("");
      await cleanupRow.getByRole("button", { name: "Guardar" }).click();
      await expect(cleanupRow.getByText("Guardado", { exact: true })).toBeVisible();
    }
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
// Fabricarla sin tocar código de producción exigiría mutar el grafo
// compartido (`/saga/<id>/mapa/editar`), y ninguna vía es segura:
//   - El inspector del editor (editor-inspector.tsx) NO permite cambiar el
//     tipo de una arista existente, solo borrarla o crear una nueva con la
//     herramienta de arista actualmente seleccionada.
//   - El único ítem fuera de columna con groupSagaId no nulo ("Para leer a
//     Isabel Allende", spin-off de Era Uno) YA tiene una arista `opcional`
//     hacia el nodo orderNo=1: `earliestSpineFor` se queda con la conexión de
//     MENOR orderNo, así que una arista `requisito` añadida hacia cualquier
//     otro nodo de la columna (orderNo 2+) no cambiaría qué rama se pinta.
//   - Mover "Trilogía" a una subsaga (para que groupSagaId deje de ser null y
//     su arista requisito pase a rama) cambiaría la pertenencia estructural
//     que otras specs hermanas asumen fija (`sagas-v2-mapa.spec.ts` la cuenta
//     como "1 nexo puro"), y `sagas-v2-editor.spec.ts` (test "quitar el
//     nexo…") documenta de primera mano que revertir un cambio de grafo por
//     UI no deja el seed exactamente igual — el mismo motivo por el que ese
//     test se queda en un ciclo quitar→descartar en vez de guardar→revertir.
//
// Conclusión: sin un dato reproducible que ya produzca la rama, forzar uno
// aquí sería precisamente lo que este bloque de reglas prohíbe ("no te lo
// inventes ni fuerces datos raros"). Se documenta el hueco en vez de fingir
// cobertura: la guarda de `branchRequisite` sigue sin red e2e. Repórtese como
// issue de seguimiento (ver informe de Task 9).
