import { expect, test, type Page } from "@playwright/test";

// E2E del editor de secuencia (`/saga/[id]/editar`, Task 9/10/11 de la fase 2a
// — sustituye el formulario por fila que cubrían sagas-rol-narrativo.spec.ts y
// sagas-colocacion-opcionalidad.spec.ts). Mismo universo QA y mismo patrón de
// sesión que esos dos specs: la cuenta `devtest` tiene `role='admin'` en dev,
// que cumple collaborator+ (ROLE_RANK, src/lib/auth/roles.ts), así que
// `/editar` no redirige.
//
// Verificado contra BD dev (`saga_items` + `sagas`, mcp__supabase-dev,
// 2026-07-26) antes de escribir este spec: "[QA Sagas v2] Era Uno" tiene 4
// miembros DIRECTOS, todos `placement=fijo` con posiciones 1-4 consecutivas
// (Rayuela=1, Libro sin valorar=2, Libro raro sin match=3, Para leer a Isabel
// Allende=4), y una única hija directa ("[QA Sagas v2] Nieta",
// `position_in_parent=5`). El editor pinta un hueco por posición, así que
// `draft.slots` tiene 5 elementos y `[data-testid="sequence-row"]:visible`
// devuelve 5 filas en ese orden. Los índices de fila de abajo (`nth(2)` =
// "Libro raro sin match", posición 3) salen de ese estado real — si la semilla
// cambia, se ajustan los índices, nunca se relaja la aserción.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno

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

type ItemRow = { item_id: string; position: number | null; placement: string | null };
type BlockRow = { id: string; position_in_parent: number | null; placement_in_parent: string | null };

/** Estado real en BD de los miembros directos (obras), para no fiarse de lo
 *  que pinta la pantalla. */
async function fetchItemRows(): Promise<ItemRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement`,
    { headers: adminHeaders() },
  );
  return res.json();
}

/** Estado real en BD del bloque-subsaga (Nieta): su posición vive en `sagas`,
 *  no en `saga_items`, pero el guardado de la secuencia la renumera igual que
 *  a las obras — un tándem o un alta/baja en medio de la lista le desplaza el
 *  hueco tanto como a cualquier fila. */
async function fetchBlockRow(): Promise<BlockRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sagas?parent_saga_id=eq.${ERA_UNO_ID}&select=id,position_in_parent,placement_in_parent`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as BlockRow[];
  return rows[0] ?? null;
}

/** Deja Era Uno exactamente como estaba antes de un guardado real, pase o
 *  falle el test: cada test que llama a `save()` reordena TODA la lista (el
 *  número es el índice del hueco, ver sequence-draft.ts), así que no basta con
 *  restaurar la fila que el test tocó a propósito — hay que restaurar las
 *  cuatro obras y el bloque. Vía REST directa porque la pantalla nueva no
 *  ofrece un campo de posición que teclear (regla de los dos árboles, y spec
 *  §«El número no se teclea»). */
async function restoreEraUno(items: ItemRow[], block: BlockRow | null) {
  for (const r of items) {
    await fetch(`${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${r.item_id}`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ position: r.position, placement: r.placement }),
    });
  }
  if (block) {
    await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${block.id}`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        position_in_parent: block.position_in_parent,
        placement_in_parent: block.placement_in_parent,
      }),
    });
  }
}

// Las dos cáscaras se montan A LA VEZ y se ocultan por breakpoint (regla de
// los dos árboles): sin `:visible` en cada locator, ambigüedad segura en
// cuanto haya dos cáscaras con la misma fila o el mismo texto.
const rows = (page: Page) => page.locator('[data-testid="sequence-row"]:visible');
const save = async (page: Page) => {
  await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
  await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();
};

test.describe("editor de secuencia — escritorio (cáscara A)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  });

  test("las tres zonas se ven a la vez", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "La secuencia" }).locator("visible=true")).toBeVisible();
    await expect(page.getByText("Cuando quieras", { exact: true }).locator("visible=true")).toBeVisible();
    await expect(rows(page)).toHaveCount(5);
  });

  test("bajar un hueco renumera, y el cambio sobrevive a recargar", async ({ page }) => {
    const itemsBefore = await fetchItemRows();
    const firstKey = await rows(page).first().getAttribute("data-key");

    try {
      // Sustituye al arrastre: el nudge ↓ de la primera fila (aria-label
      // "Bajar un hueco: {título}") intercambia el hueco 1 con el 2.
      await page.getByRole("button", { name: "Bajar un hueco" }).locator("visible=true").first().click();
      await save(page);
      await page.reload();
      // La fila que antes era la primera (identificada por su `data-key`
      // estable, no por su texto) tiene que aparecer ahora en el hueco 2.
      await expect(rows(page).nth(1)).toHaveAttribute("data-key", firstKey!);
    } finally {
      await restoreEraUno(itemsBefore, null);
    }
  });

  test("enviar una fila a «Cuando quieras» le quita el número en BD", async ({ page }) => {
    const itemsBefore = await fetchItemRows();
    const blockBefore = await fetchBlockRow();
    const first = rows(page).first();
    const key = await first.getAttribute("data-key");
    const itemId = key!.split(":")[2];

    try {
      await first.getByRole("button", { name: /^Acciones de / }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      // Fieldset "Dónde se lee": tres botones (no radios, no pestañas) con
      // `aria-pressed`. El de la secuencia mostraría "Hueco 1" en vez de "La
      // secuencia" porque esta fila SÍ tiene número — el de "Cuando quieras"
      // es el que interesa aquí.
      await sheet.getByRole("button", { name: "Cuando quieras" }).click();
      await save(page);

      const row = (await fetchItemRows()).find((r) => r.item_id === itemId)!;
      expect(row.placement).toBe("libre");
      expect(row.position).toBeNull();
    } finally {
      await restoreEraUno(itemsBefore, blockBefore);
    }
  });
});

test.describe("editor de secuencia — móvil (cáscara B)", () => {
  // Sin esto la suite corre a 1280 y esta cáscara NO se probaría nunca.
  test.use({ viewport: { width: 400, height: 880 } });

  test("las zonas son botones de grupo y solo se ve una sección a la vez", async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);

    // NO es un tablist a propósito (se retiró ese patrón ARIA a medias: sin
    // tabpanel, sin aria-controls, sin flechas) — es un role="group" con
    // botones `aria-pressed`, ver comentario de cabecera de shell-mobile.tsx.
    const group = page.getByRole("group", { name: "Zona que se está curando" }).locator("visible=true");
    const buttons = group.getByRole("button");
    await expect(buttons).toHaveCount(3);
    await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");

    // Con la pestaña "La secuencia" activa, la sección "Cuando quieras" de la
    // cáscara MÓVIL ni siquiera está montada (cada zona es un
    // `{tab === "x" && (...)}`, no CSS oculto). El mismo texto SÍ existe ya
    // en la cáscara de escritorio (oculta por CSS, pero montada — regla de
    // los dos árboles): sin `:visible` esta aserción sería un falso negativo
    // seguro, no una prueba de que la pestaña móvil no la pinta.
    await expect(page.getByText("Todavía no hay nada aquí", { exact: true }).locator("visible=true")).toHaveCount(0);

    await buttons.nth(1).click();
    await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(buttons.first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Todavía no hay nada aquí", { exact: true }).locator("visible=true")).toBeVisible();
  });

  test("la hoja mueve una fila de zona sin arrastrar", async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);

    // Cambio puramente de borrador (nunca se llama a `save`): no toca BD, así
    // que no necesita restaurar nada al terminar, pase o falle.
    await rows(page).first().getByRole("button", { name: /^Acciones de / }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Sin clasificar" }).click();
    // `onZone` desmonta la hoja (no hay animación que esperar): al cerrarse el
    // borrador ya movió la fila.
    await expect(dialog).toHaveCount(0);

    const group = page.getByRole("group", { name: "Zona que se está curando" }).locator("visible=true");
    await expect(group.getByRole("button", { name: /Sin clasificar/ })).toContainText("1");
  });
});

test("un tándem deja las dos obras en el mismo número y la siguiente en el siguiente", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  const itemsBefore = await fetchItemRows();
  const blockBefore = await fetchBlockRow();

  try {
    // Fila 3 (índice 2): "Libro raro sin match", posición 3 en el seed.
    await rows(page).nth(2).getByRole("button", { name: /^Acciones de / }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: /Mismo hueco que otra obra/ }).click();

    // Selector del tándem: radios nativos dentro de <label>, no botones —
    // clicar la etiqueta visible es lo que marca el radio (sr-only).
    const picker = page.getByRole("dialog");
    await picker.locator("li").filter({ hasText: "Rayuela" }).click();
    await picker.getByRole("button", { name: "Emparejar en el hueco 1" }).click();
    await save(page);

    const positions = (await fetchItemRows())
      .filter((r) => r.position !== null)
      .map((r) => r.position!)
      .sort((a, b) => a - b);
    // Dos obras comparten el 1 y NO se salta el 2: es la regla de renumerado
    // (el número es el índice del HUECO, no el de la entrada).
    expect(positions.filter((p) => p === 1)).toHaveLength(2);
    expect([...new Set(positions)]).toEqual([1, 2, 3]);
  } finally {
    await restoreEraUno(itemsBefore, blockBefore);
  }
});

test("guardar un borrador abierto antes NO borra una obra añadida por otro", async ({ page }) => {
  // La garantía de `p_removed` (20260726_save_saga_sequence.sql): la baja de
  // saga_items NUNCA es por omisión, a diferencia de save_saga_route /
  // save_saga_graph. Sin ella, este flujo perdería datos en silencio.
  await loginAsDevtest(page);
  await page.goto(`/saga/${ERA_UNO_ID}/editar`);
  const itemsBefore = await fetchItemRows();
  const countBefore = itemsBefore.length;

  const intruder = "00000000-0000-4000-8000-0000000000ff";
  await fetch(`${SUPABASE_URL}/rest/v1/saga_items`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({
      saga_id: ERA_UNO_ID, item_type: "book", item_id: intruder,
      position: null, placement: null, optional: false, is_primary: false,
    }),
  });

  try {
    // La pantalla NO se recarga: guarda el borrador cargado ANTES del alta
    // del intruso, así que su `entries` no lo incluye ni lo puede incluir.
    await page.getByRole("button", { name: "Bajar un hueco" }).locator("visible=true").first().click();
    await save(page);
    const after = await fetchItemRows();
    expect(after).toHaveLength(countBefore + 1);
    expect(after.some((r) => r.item_id === intruder)).toBe(true);
  } finally {
    await fetch(`${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${intruder}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    // El "Bajar un hueco" de arriba también reordenó las cuatro obras reales
    // (intercambia hueco 1 y 2): restaurarlas, igual que en el test hermano.
    await restoreEraUno(itemsBefore, null);
  }
});
