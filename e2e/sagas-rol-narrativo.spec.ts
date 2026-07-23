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
// Sin el arreglo (hallazgo 2 de la revisión, DATA-LOSS): React 19 resetea los
// campos NO controlados de un <form action={fn}> a su `defaultValue` tras el
// éxito. Si ese `defaultValue` sigue siendo la prop vieja (el valor con el que
// se montó la página, antes de guardar nada), el <select> vuelve a mostrar
// "Sin clasificar" aunque el usuario acabe de elegir un rol y la BD ya lo
// tenga guardado — y un segundo click en "Guardar", sin que nadie toque el
// campo, reenvía ese "" y borra el rol recién guardado.
//
// El escenario ejerce TAMBIÉN el hallazgo 1 de la revisión (`ownerSagaId`):
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
    await saveButton.click();
    await expect(savedLabel).toBeVisible();

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
