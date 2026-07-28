import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 3: el MOTIVO de una ventana y su mini-track. Lo que cubre y
// las unitarias no pueden: que el motivo llega a BD dentro del `p_windows` del
// RPC (sin argumento nuevo), que muere con la última ancla en la MISMA
// transacción, y que la ficha PÚBLICA pinta el tramo sin marcador para quien no
// ha iniciado sesión — que es el riesgo 5 de la spec y lo único que ninguna
// unitaria ve entero.
//
// Mismo universo y mismo patrón de sesión/limpieza que `sagas-ventanas.spec.ts`
// y `sagas-tandem-metadatos.spec.ts`: `fetch` nativo (no el fixture `request`,
// que muere con el contexto y dejaría filas huérfanas en un timeout), `res.ok`
// comprobado en cada escritura (#180/#182) y la semilla devuelta a como estaba.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // el único universo QA con show_map
const RARO_ID = "d6d61eab-6ef4-4691-a8f0-b89068508fd4";
const RAYUELA_ID = "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a";
const RARO_TITLE = "Libro raro sin match";
const RAYUELA_TITLE = "Rayuela";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

type ItemRow = { item_id: string; position: number | null; placement: string | null };
const fetchItems = async (): Promise<ItemRow[]> =>
  (await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement`)).json();
const fetchWindows = async (): Promise<Array<{ item_id: string; motivo: string | null }>> =>
  (await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}&select=item_id,motivo`)).json();

/** Devuelve Era Uno a su línea base: un guardado real renumera TODA la lista,
 *  así que no basta con revertir la fila que el test tocó. */
async function restore(items: ItemRow[]) {
  for (const r of items) {
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${r.item_id}`, {
      method: "PATCH",
      body: JSON.stringify({ position: r.position, placement: r.placement }),
    });
  }
  await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
}

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Las dos cáscaras del editor se montan A LA VEZ y se ocultan por breakpoint
// (regla de los dos árboles): sin `:visible`, ambigüedad segura. El editor de
// ventana es el hermano siguiente de la fila, igual que en
// `sagas-ventanas.spec.ts`, de donde sale todo el gesto de anclar.
const raroRow = (page: Page) =>
  page.locator(`[data-testid="sequence-row"][data-key="i:book:${RARO_ID}"]:visible`);
const windowEditor = (page: Page) => raroRow(page).locator("xpath=following-sibling::div[1]");
const reasonBox = (page: Page) => windowEditor(page).locator('[data-testid="window-reason"]');
const save = async (page: Page) => {
  await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
  await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();
};

/** Manda «Libro raro sin match» a «Cuando quieras». */
async function aCuandoQuieras(page: Page) {
  await raroRow(page).getByRole("button", { name: /^Acciones de /, exact: false }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cuando quieras" }).click();
}

/** Le pone el ancla «a partir de Rayuela». El botón de alta lleva `aria-label`
 *  propio (`windowAddFor`) que PISA el texto visible «+ Añadir ventana» como
 *  nombre accesible — hay que localizarlo por ahí, no por lo que se ve. El
 *  <dialog> de `AnchorPicker`, en cambio, sí usa el texto visible. */
async function anclarEnRayuela(page: Page) {
  await windowEditor(page)
    .getByRole("button", { name: `Añadir ventana a ${RARO_TITLE}`, exact: true })
    .click();
  const dlg = page.getByRole("dialog", { name: "+ A partir de…" });
  // Clic en el <li>, no en el radio: vive `sr-only` dentro del <label>.
  await dlg.locator("li").filter({ hasText: RAYUELA_TITLE }).click();
  await dlg.getByRole("button", { name: "+ A partir de…", exact: true }).click();
}

test("declarar el motivo de una ventana persiste tras recargar", async ({ page }) => {
  const items = await fetchItems();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    await aCuandoQuieras(page);

    // Sin ancla no hay ventana, y sin ventana no hay control de motivo: esta
    // mitad del test la prueba el `toHaveCount(0)`, ANTES de anclar.
    await expect(reasonBox(page)).toHaveCount(0);
    await anclarEnRayuela(page);
    await expect(reasonBox(page)).toHaveCount(1);

    await reasonBox(page).getByRole("button", { name: "Spoilers", exact: true }).click();
    await save(page);

    // Contra BD, no contra la pantalla: es lo único que demuestra que el motivo
    // viajó DENTRO de `p_windows` y que el RPC lo escribió.
    expect(await fetchWindows()).toEqual([{ item_id: RARO_ID, motivo: "spoiler" }]);

    await page.reload();
    await expect(reasonBox(page).getByRole("button", { name: "Spoilers", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    await restore(items);
  }
});

test("quitar la última ancla se lleva el motivo por delante", async ({ page }) => {
  const items = await fetchItems();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    await aCuandoQuieras(page);
    await anclarEnRayuela(page);
    await reasonBox(page).getByRole("button", { name: "Contexto", exact: true }).click();
    await save(page);
    expect(await fetchWindows()).toHaveLength(1);

    // Quitar la única ancla: la ventana entera muere, y el motivo con ella.
    // Ningún CHECK puede imponerlo — `saga_placement_windows_needs_anchor`
    // rechaza la fila sin anclas, pero nadie borra la que YA existe. Lo
    // sostiene `clearAnchor` en el borrador, y el guardado tiene que
    // reflejarlo en la misma transacción.
    await windowEditor(page)
      .getByRole("button", { name: `Quitar «${RAYUELA_TITLE}» de ${RARO_TITLE}`, exact: true })
      .click();
    await expect(reasonBox(page)).toHaveCount(0);
    await save(page);

    expect(await fetchWindows()).toEqual([]);
  } finally {
    await restore(items);
  }
});

test("la ficha pública pinta el tramo, y SIN sesión no marca posición", async ({ browser }) => {
  const items = await fetchItems();
  try {
    // Semilla por REST: aísla el render de la UI de curación, que ya cubren los
    // dos tests de arriba. La ventana vive en Era Uno, pero se mira en el
    // UNIVERSO — el único universo QA con `show_map`, y su timeline incluye las
    // obras de sus hijas.
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RARO_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ position: null, placement: "libre" }),
    });
    await api("saga_placement_windows", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        saga_id: ERA_UNO_ID,
        item_type: "book",
        item_id: RARO_ID,
        after_item_type: "book",
        after_item_id: RAYUELA_ID,
        motivo: "spoiler",
      }),
    });

    // Contexto NUEVO y sin sesión: la ficha es pública, y esta es la vista por
    // defecto de cualquiera que llegue de fuera, no una variante secundaria.
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    const fila = page.locator('[data-testid="timeline-window"]:visible').first();
    await expect(fila).toBeVisible();
    await expect(fila.locator('[data-testid="window-track"]')).toBeVisible();
    await expect(fila.locator('[data-testid="window-reason-note"]')).toContainText("spoilers");
    // Lo que NO se pinta sin sesión. Por cuenta, no por texto: es lo que
    // demuestra que no hay ninguna vía de que aparezcan.
    await expect(fila.locator('[data-testid="window-track-you"]')).toHaveCount(0);
    await expect(fila.locator('[data-testid="window-notice"]')).toHaveCount(0);
    await anon.close();
  } finally {
    await restore(items);
  }
});

test("con sesión, la misma ventana sí marca posición y avisa", async ({ page }) => {
  const items = await fetchItems();
  try {
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RARO_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ position: null, placement: "libre" }),
    });
    await api("saga_placement_windows", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        saga_id: ERA_UNO_ID,
        item_type: "book",
        item_id: RARO_ID,
        after_item_type: "book",
        after_item_id: RAYUELA_ID,
        motivo: "contexto",
      }),
    });

    await loginAsDevtest(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    const fila = page.locator('[data-testid="timeline-window"]:visible').first();
    await expect(fila).toBeVisible();
    // La otra mitad del par: el mismo dato, con sesión, SÍ trae marcador y
    // aviso. Sin este test, borrar el flag `authenticated` no tumbaría nada.
    await expect(fila.locator('[data-testid="window-track-you"]')).toHaveCount(1);
    await expect(fila.locator('[data-testid="window-notice"]')).toHaveCount(1);
  } finally {
    await restore(items);
  }
});
