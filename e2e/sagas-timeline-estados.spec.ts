import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 1 del timeline con los cuatro estados: el componente único de
// orden de lectura, montado en móvil y al pie del grafo de PC.
//
// Mismo patrón que sagas-orden-designado.spec.ts: `fetch` nativo (NO el fixture
// `request` de Playwright, que muere con el contexto del test y dejaría filas
// huérfanas en un timeout), `res.ok` comprobado en cada escritura (#180/#182) y
// la semilla devuelta exactamente a como estaba.
//
// Universo QA: "[QA Sagas v2] Universo". Verificado contra BD dev el
// 2026-07-28: es el único universo QA con `show_map = true` —sin él
// `resolveSagaGraph` devuelve `graph = null` y no hay timeline que mirar; Era
// Uno lo tiene en `false`— y sus 2 miembros directos están SIN CLASIFICAR
// (`position = null`). Eso no estorba: un paso del itinerario recibe su `step`
// por CLAVE (`i:book:<uuid>`), tenga hueco o no. Los números de la ruta
// «lectura» salen de las obras de las subsagas, que sí tienen hueco.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ROUTE_SLUG = "qa-timeline";
const ROUTE_NAME = "QA Timeline";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let routeId: string;
/** Títulos de los pasos sembrados, en el orden del ITINERARIO. */
let stepTitles: string[] = [];

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

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

test.beforeAll(async () => {
  // Miembros REALES del universo, resueltos por REST: un item_id inventado
  // pasaría el insert (no hay FK contra saga_items) pero `resolveRoute` lo
  // descartaría por colgante y el test seguiría en verde demostrando otra cosa.
  const members = (await (
    await api(`saga_items?saga_id=eq.${UNIVERSO_ID}&select=item_type,item_id,position&order=position&limit=2`)
  ).json()) as Array<{ item_type: string; item_id: string }>;
  if (members.length < 2) throw new Error("beforeAll: el Universo QA necesita ≥2 miembros directos — ¿cambió el seed?");

  const inserted = (await (
    await api("saga_routes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ saga_id: UNIVERSO_ID, slug: ROUTE_SLUG, name: ROUTE_NAME, summary: null, position: 1 }),
    })
  ).json()) as Array<{ id: string }>;
  routeId = inserted[0].id;

  // ORDEN INVERSO al curado, a propósito: es lo que distingue «la columna son
  // los pasos» de «la columna sigue siendo la curación y por casualidad
  // coincide».
  const reversed = [...members].reverse();
  await api("saga_route_entries", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      reversed.map((m, i) => ({
        route_id: routeId,
        position: i + 1,
        item_type: m.item_type,
        item_id: m.item_id,
        child_saga_id: null,
        note: null,
      })),
    ),
  });

  const books = (await (
    await api(`books?id=in.(${reversed.map((m) => m.item_id).join(",")})&select=id,title`)
  ).json()) as Array<{ id: string; title: string }>;
  stepTitles = reversed.map((m) => books.find((b) => b.id === m.item_id)!.title);
});

test.afterAll(async () => {
  // Los pasos se van solos por `on delete cascade` de saga_route_entries.route_id.
  await api(`saga_routes?id=eq.${routeId}`, { method: "DELETE" });
});

/** El timeline VISIBLE. Las dos cáscaras (móvil y pie de PC) se montan a la vez
 *  y se ocultan por breakpoint (regla de los dos árboles): sin `:visible` este
 *  locator encuentra dos. */
function timeline(page: Page) {
  return page.locator('[data-testid="reading-timeline"]:visible');
}

/** Primer «Nº N» que pinta la columna visible, tal cual. */
async function firstOrderNo(page: Page): Promise<string | undefined> {
  const texts = await timeline(page).locator("span.font-mono").allInnerTexts();
  return texts.map((x) => x.trim()).find((x) => /^Nº \d+$/.test(x));
}

test.describe("timeline · fase 1", () => {
  test("móvil, con itinerario activo: la columna son SUS pasos, en su orden", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=${ROUTE_SLUG}`);

    const tl = timeline(page);
    await expect(tl).toBeVisible();

    // El orden del itinerario, que es el INVERSO del curado.
    const titles = (await tl.locator("span.font-serif").allInnerTexts()).map((x) => x.trim());
    const found = stepTitles.map((t) => titles.indexOf(t));
    expect(found.every((i) => i !== -1)).toBe(true);
    expect([...found].sort((a, b) => a - b)).toEqual(found);
  });

  test("móvil, ruta «lectura»: el timeline numera desde 1 y ya no hay «Como lista lineal»", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    await expect(timeline(page)).toBeVisible();
    // El PRIMER número de la columna, no «que exista un Nº 1»: con la
    // numeración 0-based que tenía el #220 seguía habiendo un «Nº 1» — el de la
    // segunda fila — así que una aserción de existencia pasaba con el bug
    // puesto. Medido con inyección de fallo, no supuesto.
    await expect(firstOrderNo(page)).resolves.toBe("Nº 1");
    await expect(page.getByText("Como lista lineal")).toHaveCount(0);
  });

  test("PC: el mismo timeline al pie del grafo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    await expect(timeline(page)).toBeVisible();
  });

  // Riesgo 5 de la spec: la ficha es PÚBLICA, y es fácil construir el timeline
  // mirando solo la vista con sesión. Sin login se tiene que ver ENTERO — sin
  // estados de lectura, pero con todas sus filas y sus números.
  test("sin sesión: el timeline se ve igual, con sus filas y su numeración", async ({ browser }) => {
    const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    await expect(timeline(page)).toBeVisible();
    // El PRIMER número de la columna, no «que exista un Nº 1»: con la
    // numeración 0-based que tenía el #220 seguía habiendo un «Nº 1» — el de la
    // segunda fila — así que una aserción de existencia pasaba con el bug
    // puesto. Medido con inyección de fallo, no supuesto.
    await expect(firstOrderNo(page)).resolves.toBe("Nº 1");
    await page.close();
  });
});
