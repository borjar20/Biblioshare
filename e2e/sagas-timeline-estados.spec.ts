import { expect, test, type Locator, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

// E2E de la fase 1 del timeline con los cuatro estados: el componente único de
// orden de lectura, montado en móvil y al pie del grafo de PC.
//
// Mudado al atlas (Task 11 del atlas, 2026-10-28): el timeline se retiró. Con
// un itinerario activo el atlas no reordena la columna: conserva el plano de la
// curación y marca cada obra del itinerario con su número de paso
// (`data-step`), que es lo que aquí se comprueba. La numeración de lectura vive
// en «Ver como lista». El test de PC («el mismo timeline al pie del grafo») se
// borró: el atlas es un solo árbol para todos los anchos y sagas-atlas.spec.ts
// lo prueba en escritorio y en móvil.
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
/** Claves (`i:<tipo>:<uuid>`) de los pasos sembrados, en el orden del ITINERARIO. */
let stepKeys: string[] = [];

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
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

  stepKeys = reversed.map((m) => `i:${m.item_type}:${m.item_id}`);
});

test.afterAll(async () => {
  // Los pasos se van solos por `on delete cascade` de saga_route_entries.route_id.
  await api(`saga_routes?id=eq.${routeId}`, { method: "DELETE" });
});

/** El atlas ha pintado su primer layout (saga-atlas.tsx marca `data-ready`). */
async function atlasReady(page: Page) {
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
}

/** Abre «Ver como lista» y devuelve sus enlaces, en orden. */
async function listLinks(page: Page): Promise<Locator> {
  await atlasReady(page);
  await page.getByRole("button", { name: "Ver como lista" }).click();
  const lista = page.getByRole("list", { name: /^Obras de / });
  await expect(lista).toBeVisible();
  return lista.getByRole("link");
}

test.describe("atlas · pasos y numeración", () => {
  test("móvil, con itinerario activo: cada paso lleva SU número, en su orden", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}/mapa?ruta=${ROUTE_SLUG}`);
    await atlasReady(page);

    // El orden del itinerario, que es el INVERSO del curado: el paso N es la obra N
    // del itinerario, no la N de la curación.
    for (const [i, key] of stepKeys.entries()) {
      await expect(page.locator(`[data-work-key="${key}"]`)).toHaveAttribute("data-step", String(i + 1));
    }
    await expect(page.locator("[data-work-key][data-step]")).toHaveCount(stepKeys.length);
  });

  test("móvil, ruta «lectura»: la lista numera desde 1", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}/mapa?ruta=lectura`);

    // La PRIMERA entrada, no «que exista un 1»: con la numeración 0-based que
    // tenía el #220 seguía habiendo un «1» — el de la segunda fila — así que una
    // aserción de existencia pasaba con el bug puesto.
    await expect((await listLinks(page)).first()).toHaveAccessibleName(/^1\. /);
  });

  // Riesgo 5 de la spec: la ficha es PÚBLICA, y es fácil construir la vista
  // mirando solo la de con sesión. Sin login se tiene que ver ENTERA — sin
  // estados de lectura, pero con todas sus obras y sus números.
  test("sin sesión: la lista se ve igual, con su numeración", async ({ browser }) => {
    const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/saga/${UNIVERSO_ID}/mapa?ruta=lectura`);

    await expect((await listLinks(page)).first()).toHaveAccessibleName(/^1\. /);
    await page.close();
  });
});
