import { expect, test, type Page } from "@playwright/test";

// E2E de la issue #198: la ficha lee la colocación curada de un bloque
// (`sagas.position_in_parent`/`placement_in_parent`), en vez de la heurística
// del `position` mínimo de sus miembros. Cubre lo que las pruebas unitarias de
// group-members.ts no pueden: que lo curado en `/saga/[id]/editar` se ve de
// verdad en `/saga/[id]`, de punta a punta.
//
// Mismo universo QA y mismo patrón de sesión que el resto de specs de sagas
// (sagas-editor-secuencia.spec.ts, sagas-colocacion-opcionalidad.spec.ts):
// la cuenta `devtest` tiene `role='admin'` en dev, que cumple collaborator+.
const UNIVERSO = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo

// Verificado contra BD dev (mcp__supabase-dev, 2026-07-26) antes de escribir
// este spec: las tres hijas directas del universo tienen `position_in_parent`
// y `placement_in_parent` a NULL (ninguna colocada) — si se dejaran así, un
// test de "el orden curado manda" no discriminaría nada, porque todo saldría
// de la heurística de compatibilidad (issue #198 / group-members.ts). De las
// tres, "Era Vacía" tiene 0 `saga_items` propios: `groupMembers` nunca crea un
// bucket para un grupo sin miembros, así que ese bloque JAMÁS aparece en la
// ficha y no sirve para este test. Las otras dos SÍ tienen miembros:
//   - Era Uno: 4 obras, posiciones 1-4 (heurística: minPos = 1)
//   - Era Dos: 2 obras, posiciones 4-5 (heurística: minPos = 4)
// Sin colocación curada, la heurística ya pondría a Era Uno antes que Era Dos
// (1 < 4) — un mal caso para demostrar que la colocación MANDA sobre la
// heurística. El segundo test cura explícitamente el orden CONTRARIO (Era Dos
// antes que Era Uno) como primer paso, precisamente para que discrimine.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const ERA_UNO_NAME = "[QA Sagas v2] Era Uno";
const ERA_DOS_ID = "c9a702f1-c96b-4daa-a7d4-b6fe135da11b";
const ERA_DOS_NAME = "[QA Sagas v2] Era Dos";

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

type ChildRow = { id: string; position_in_parent: number | null; placement_in_parent: string | null };

/** Colocación de las hijas directas del universo, para restaurar al terminar.
 *  `fetch` nativo, NO el fixture `request` de Playwright: ese muere con el
 *  contexto del test, así que en un timeout a mitad de test la limpieza del
 *  `finally` no llegaría a correr y dejaría filas huérfanas en dev (ya pasó en
 *  otra rama de este proyecto). */
async function fetchChildren(): Promise<ChildRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sagas?parent_saga_id=eq.${UNIVERSO}&select=id,position_in_parent,placement_in_parent`,
    { headers: adminHeaders() },
  );
  // Fix revisión final #198 (Minor 4): sin este chequeo, un 4xx (p. ej. una
  // service key caducada) devuelve un body de error que `res.json()` parsea
  // igualmente como si fueran filas — `before` sale mal formado, `restore` al
  // final del test "restaura" basura, y los dos tests siguen en verde con dev
  // sucio. Misma familia de fallo que las issues #180/#182.
  if (!res.ok) {
    throw new Error(`fetchChildren: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return res.json();
}

async function restore(rows: ChildRow[]) {
  for (const r of rows) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${r.id}`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        position_in_parent: r.position_in_parent,
        placement_in_parent: r.placement_in_parent,
      }),
    });
    // Fix revisión final #198 (Minor 4): sin este chequeo, un PATCH que falla
    // (4xx) deja la fila con la colocación que puso el propio test (no la
    // original) y el `finally` del test no se entera — dev queda sucio y el
    // test, igualmente, en verde.
    if (!res.ok) {
      throw new Error(`restore(${r.id}): ${res.status} ${res.statusText} — ${await res.text()}`);
    }
  }
}

async function patchChild(id: string, patch: { position_in_parent: number; placement_in_parent: string }) {
  await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

const save = async (page: Page) => {
  await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
  await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();
};

test("un bloque marcado libre en el editor aparece en «Cuando quieras» de la ficha", async ({ page }) => {
  const before = await fetchChildren();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO}/editar`);

    // Era Dos: bloque real con miembros (a diferencia de Era Vacía), así que
    // sí puede aparecer en la ficha. Se localiza por su `data-key` exacto
    // (`s:<id>`, ver get-saga-sequence.ts) en vez de "el primero" — el orden
    // de las filas sin colocar no está garantizado por la semilla.
    const row = page.locator(`[data-testid="sequence-row"][data-key="s:${ERA_DOS_ID}"]:visible`);
    await row.getByRole("button", { name: /^Acciones de /, exact: false }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cuando quieras" }).click();
    await save(page);

    // Y en la ficha ya no está en la lista de arriba, sino bajo «Cuando quieras».
    await page.goto(`/saga/${UNIVERSO}`);
    const free = page.locator("section").filter({ hasText: "Cuando quieras" });
    await expect(free.getByRole("heading", { name: ERA_DOS_NAME })).toBeVisible();
  } finally {
    await restore(before);
  }
});

test("el orden curado de los bloques es el que pinta la ficha", async ({ page }) => {
  const before = await fetchChildren();
  try {
    // Arrange: cura el orden CONTRARIO al que daría la heurística de
    // compatibilidad (minPos de los miembros pondría a Era Uno primero, ver
    // comentario de cabecera) — es la única forma de que este test discrimine
    // "la colocación manda" de "la heurística ya acertaba por casualidad".
    await patchChild(ERA_DOS_ID, { position_in_parent: 1, placement_in_parent: "fijo" });
    await patchChild(ERA_UNO_ID, { position_in_parent: 2, placement_in_parent: "fijo" });

    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO}`);
    let headings = await page.locator("section h3:visible").allInnerTexts();
    expect(headings.indexOf(ERA_DOS_NAME)).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf(ERA_DOS_NAME)).toBeLessThan(headings.indexOf(ERA_UNO_NAME));

    // Act: baja Era Dos (hueco 1) un puesto en el editor real — ahora el orden
    // curado pasa a ser Era Uno, Era Dos.
    await page.goto(`/saga/${UNIVERSO}/editar`);
    const eraDosRow = page.locator(`[data-testid="sequence-row"][data-key="s:${ERA_DOS_ID}"]:visible`);
    await eraDosRow.getByRole("button", { name: /^Bajar un hueco/ }).click();
    await save(page);

    // Assert: la ficha refleja el nuevo orden curado, no el anterior.
    await page.goto(`/saga/${UNIVERSO}`);
    headings = await page.locator("section h3:visible").allInnerTexts();
    expect(headings.indexOf(ERA_UNO_NAME)).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf(ERA_UNO_NAME)).toBeLessThan(headings.indexOf(ERA_DOS_NAME));
  } finally {
    await restore(before);
  }
});
