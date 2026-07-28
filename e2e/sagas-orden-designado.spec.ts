import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 4 (A): el curador DESIGNA cuál de sus itinerarios ocupa el
// puesto y la etiqueta de «Orden de lectura» en la ficha, y con uno designado
// la ruta sintética «lectura» —el mapa derivado— deja de ofrecerse.
//
// Universo QA: "[QA Sagas v2] Universo", que es el único universo QA con
// `show_map = true`. Hace falta: sin él la ruta sintética «lectura» no se
// ofrece NUNCA, y el test no distinguiría «la designada la sustituyó» de «no
// estaba desde el principio». Verificado contra BD dev (mcp__supabase-dev,
// 2026-07-28): `show_map = true`, 2 miembros directos y CERO itinerarios, así
// que el que siembra este spec es el único de la saga mientras corre.
//
// Mismo patrón de sesión y de limpieza que el resto de specs de sagas
// (sagas-ventanas.spec.ts): `fetch` nativo y NO el fixture `request` de
// Playwright —ese muere con el contexto del test, y en un timeout a mitad de
// test dejaría el `afterAll` sin correr y filas huérfanas en dev—, `res.ok`
// comprobado en cada escritura (issues #180/#182), y la semilla devuelta
// exactamente a como estaba.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo
const ROUTE_SLUG = "qa-designado";
const ROUTE_NAME = "QA Designado";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let routeId: string;

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

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

test.beforeAll(async () => {
  // El paso del itinerario apunta a un miembro REAL del Universo, resuelto por
  // REST en vez de escrito a ciegas: un `route_id`/`item_id` inventado pasaría
  // el insert (no hay FK contra saga_items) pero `resolveRoute` lo descartaría
  // por colgante y la ruta se pintaría vacía — el test seguiría en verde
  // demostrando otra cosa.
  const members = (await (
    await api(`saga_items?saga_id=eq.${UNIVERSO_ID}&select=item_type,item_id&limit=1`)
  ).json()) as Array<{ item_type: string; item_id: string }>;
  if (!members[0]) throw new Error("beforeAll: el Universo QA no tiene miembros — ¿cambió el seed?");

  const inserted = (await (
    await api("saga_routes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        saga_id: UNIVERSO_ID,
        slug: ROUTE_SLUG,
        name: ROUTE_NAME,
        summary: null,
        position: 1,
      }),
    })
  ).json()) as Array<{ id: string }>;
  routeId = inserted[0].id;

  await api("saga_route_entries", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      route_id: routeId,
      position: 1,
      item_type: members[0].item_type,
      item_id: members[0].item_id,
      child_saga_id: null,
      note: null,
    }),
  });
});

test.afterAll(async () => {
  // Los pasos se van solos por `on delete cascade` de saga_route_entries.route_id.
  await api(`saga_routes?id=eq.${routeId}`, { method: "DELETE" });
  const left = (await (
    await api(`saga_routes?saga_id=eq.${UNIVERSO_ID}&is_reading_order=is.true&select=id`)
  ).json()) as unknown[];
  expect(left).toHaveLength(0);
});

/** Chips del selector de rutas de la ficha. `RouteSelector` no lleva testid
 *  propio y pinta dos variantes según cuántas rutas haya (toggle con ≤2, tira
 *  de chips con 3+), pero las dos son `<Link>` al mismo `?tab=mapa&ruta=<slug>`:
 *  ese href es el único selector estable que vale para las dos, sin inventar un
 *  testid nuevo en el componente.
 *
 *  `:visible` porque las dos cáscaras se montan a la vez y se ocultan por
 *  breakpoint (regla de los dos árboles): sin él, cada locator encontraría el
 *  doble de elementos. */
function routeChips(page: Page) {
  return page.locator('a[href*="ruta="]:visible');
}

/** La fila de gestión de un itinerario, en la cáscara VISIBLE. La pantalla
 *  monta las dos cáscaras a la vez, así que sin `:visible` cada fila aparece
 *  dos veces y el locator es ambiguo. */
function row(page: Page, name: string) {
  return page.locator("li:visible").filter({ hasText: name });
}

/** La fila sintética del mapa generado: es el antiguo radio «Ninguno». */
const MAPA_GENERADO = "Mapa generado";

/** La chapa «ORDEN DE LECTURA» de la fila del itinerario en `/rutas`. Solo la
 *  pinta la fila designada, y su dato viene del SERVIDOR, así que
 *  aparecer/desaparecer es la única señal que no puede ser cierta sin que la
 *  escritura haya llegado a BD.
 *
 *  `exact: true` NO es cosmético: `getByText` con una cadena casa por
 *  SUBCADENA y sin distinguir mayúsculas, así que «Orden de lectura» a secas
 *  casaba también con el botón «Usar como orden de lectura» que ahora vive
 *  dentro de la misma fila — la chapa no desaparecía nunca al desdesignar y el
 *  test daba un falso rojo (y el de designar, un verde por el motivo
 *  equivocado). El rediseño metió ese texto dentro del `<li>`; antes vivía en
 *  el selector de radios, fuera. */
function badge(page: Page) {
  return row(page, ROUTE_NAME).getByText("Orden de lectura", { exact: true });
}

async function designar(page: Page, target: string) {
  await page.goto(`/saga/${UNIVERSO_ID}/rutas`);
  const boton = row(page, target).getByRole("button", { name: "Usar como orden de lectura" });

  // IDEMPOTENTE a propósito: los dos tests comparten la fila sembrada en
  // `beforeAll` y el primero deja el itinerario designado, así que el segundo
  // puede llegar aquí con el objetivo YA designado. En ese caso ese botón no
  // existe —la fila designada pinta «Es el orden de lectura», deshabilitado—,
  // y no hay nada que pulsar.
  if ((await boton.count()) > 0) {
    // Esperar a que se HABILITE antes de pulsar: es la señal de que el
    // componente está hidratado. Un clic anterior a la hidratación se pierde.
    await expect(boton).toBeEnabled();
    await boton.click();
  }

  // La designación se aplica al pulsar y la confirma el `router.refresh()` del
  // manager. Se espera a la chapa, no al botón: el botón también está
  // deshabilitado mientras la transición está en vuelo. Y recargar no sirve:
  // `revalidateSagaPage` no invalida esta pantalla, así que la recarga puede
  // servir caché.
  if (target === MAPA_GENERADO) await expect(badge(page)).toHaveCount(0);
  else await expect(badge(page)).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1: designar SUSTITUYE a la ruta sintética. Es la promesa entera de (A)
// —acabar con los dos chips que prometen lo mismo—, y lo único que la
// demuestra es que el chip designado ocupe el primer puesto CON la etiqueta
// «Orden de lectura» y que no quede ninguno con su nombre propio.
// ─────────────────────────────────────────────────────────────────────────
test("designar un itinerario le da el puesto y la etiqueta de «Orden de lectura», y quita la sintética", async ({
  page,
}) => {
  await loginAsDevtest(page);
  await designar(page, ROUTE_NAME);

  await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa`);
  const chips = routeChips(page);
  // El primero, no «alguno»: el puesto es parte de lo que se designa.
  await expect(chips.first()).toHaveText("Orden de lectura");
  // Y su nombre propio ya no está en ninguna parte del selector: la fila NO se
  // renombra en BD, la etiqueta la pone buildRouteList.
  await expect(chips.filter({ hasText: ROUTE_NAME })).toHaveCount(0);
  // Exactamente UN chip con esa etiqueta: si la sintética siguiera ofreciéndose
  // habría dos, que es justo el estado que esta fase viene a eliminar.
  await expect(chips.filter({ hasText: "Orden de lectura" })).toHaveCount(1);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: desdesignar lo devuelve todo. «Ninguno» es una opción de verdad, no
// un botón de borrar: devolverle el puesto al mapa generado es una elección
// tan legítima como designar, y tiene que dejar la ficha exactamente como
// estaba — la sintética Y el itinerario con su nombre propio.
// ─────────────────────────────────────────────────────────────────────────
test("desdesignar devuelve la ruta sintética y el nombre propio del itinerario", async ({ page }) => {
  await loginAsDevtest(page);
  await designar(page, ROUTE_NAME);
  await designar(page, MAPA_GENERADO);

  await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa`);
  const chips = routeChips(page);
  await expect(chips.filter({ hasText: "Orden de lectura" })).toHaveCount(1);
  await expect(chips.filter({ hasText: ROUTE_NAME })).toHaveCount(1);
  // Y la sintética recupera su puesto: primera de la lista.
  await expect(chips.first()).toHaveText("Orden de lectura");
});
