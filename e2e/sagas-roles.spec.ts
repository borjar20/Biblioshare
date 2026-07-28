import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 5: los roles se ven (cinta en la portada) y se usan como lente
// (filtro en la cabecera). Lo que cubre y las unitarias no pueden:
//
//  · que el `?rol=` llega al motor a través de la página y los tres montajes —
//    las unitarias prueban `deriveTimeline`, no el cableado;
//  · que la barra SIGUE ofreciendo todos los roles con un filtro puesto, que es
//    lo único que permite volver (las cuentas salen del grafo, no de lo
//    visible: la lección de `optionalCount` en la fase 4);
//  · que la cinta dice el rol en una obra CON HUECO, que hasta esta fase no lo
//    decía en ninguna parte;
//  · que filtrar NO mueve el progreso. Es el límite duro de la spec, y es lo
//    que impide que un futuro «ya que estamos» reabra el denominador.
//
// Mismo patrón que `sagas-opcionales-saltables.spec.ts` (fase 4): `fetch`
// nativo —no el fixture `request`, que muere con el contexto y dejaría la
// semilla desviada—, `res.ok` comprobado en cada escritura (#180/#182), y la
// semilla devuelta EXACTAMENTE a como estaba, medida antes de tocar nada.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";

// Tres obras de Era Uno, elegidas por lo que representan (medido contra BD dev
// el 2026-07-28, todas con `role = null` en el seed):
//  · Rayuela y «Para leer a Isabel Allende» tienen HUECO PROPIO: son la fila
//    `entry`, la que hasta la fase 5 no decía el rol en ningún sitio.
//  · «Libro raro sin match» comparte el hueco 2 con «Libro sin valorar», o sea
//    que vive en una fila `tandem`. Lleva un rol distinto a propósito: así el
//    filtro tiene que atravesar también esa forma de fila, que es donde es más
//    fácil que se rompa.
const PRECUELA_A = { id: "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a", title: "Rayuela" };
const PRECUELA_B = { id: "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc", title: "Para leer a Isabel Allende" };
const RELATO = { id: "d6d61eab-6ef4-4691-a8f0-b89068508fd4", title: "Libro raro sin match" };

// La ficha abre en «Info»; el timeline vive en «Mapa de lectura» (`?tab=mapa`),
// y `ruta=lectura` fija la columna a la curación — sin ella la ruta activa sería
// la que el lector tenga adoptada y el test dependería de un estado que no
// controla.
const MAPA = `/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`;

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

const setRole = (itemId: string, role: string | null) =>
  api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

/** El rol de cada obra ANTES del test, para devolverlo tal cual. Se MIDE, no se
 *  asume: en la fase 4 dar por buena una línea base puesta a mano dejó la
 *  semilla desviada. */
const baseline = new Map<string, string | null>();

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Los dos árboles (móvil y PC) se montan A LA VEZ y se ocultan por breakpoint,
// así que sin `:visible` toda consulta es ambigua. El proyecto corre en Desktop
// Chrome: lo visible es el pie del grafo de PC.
const timeline = (page: Page) => page.locator('[data-testid="reading-timeline"]:visible');
const barra = (page: Page) => page.locator('[data-testid="role-filter-bar"]:visible');
const fila = (page: Page, title: string) => timeline(page).locator("div").filter({ hasText: title }).last();

test.beforeAll(async () => {
  const filas = (await (
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,role,position`)
  ).json()) as Array<{ item_id: string; role: string | null; position: number | null }>;

  for (const obra of [PRECUELA_A, PRECUELA_B, RELATO]) {
    const row = filas.find((f) => f.item_id === obra.id);
    if (!row) throw new Error(`beforeAll: ¿cambió el seed de Era Uno? falta ${obra.title}`);
    if (row.position === null) throw new Error(`beforeAll: ${obra.title} debería tener hueco`);
    baseline.set(obra.id, row.role);
  }

  await setRole(PRECUELA_A.id, "precuela");
  await setRole(PRECUELA_B.id, "precuela");
  await setRole(RELATO.id, "relato");
});

test.afterAll(async () => {
  for (const [itemId, role] of baseline) await setRole(itemId, role);
});

test("la lente por rol deja solo las obras de ese rol, y la barra sigue ofreciendo los demás", async ({
  page,
}) => {
  await page.goto(MAPA);
  await expect(timeline(page).getByText(RELATO.title)).toBeVisible();

  await barra(page).getByTestId("role-filter-precuela").click();
  await page.waitForURL(/rol=precuela/);

  await expect(timeline(page).getByText(PRECUELA_A.title)).toBeVisible();
  await expect(timeline(page).getByText(PRECUELA_B.title)).toBeVisible();
  // Y lo que NO es precuela deja de verse, incluida la obra que vive dentro de
  // una fila `tandem`.
  await expect(timeline(page).getByText(RELATO.title)).toHaveCount(0);

  // Lo que hace REVERSIBLE la barra: con el filtro puesto sigue ofreciendo los
  // otros roles, porque las cuentas salen del GRAFO y no de las filas visibles.
  // Calculadas sobre lo visible, este chip habría desaparecido con su obra.
  await expect(barra(page).getByTestId("role-filter-relato")).toBeVisible();

  await barra(page).getByTestId("role-filter-all").click();
  await expect(page).not.toHaveURL(/rol=/);
  await expect(timeline(page).getByText(RELATO.title)).toBeVisible();
});

test("la lente NO renumera: la fila conserva su número", async ({ page }) => {
  // El número se lee de la propia página en los dos estados en vez de fijarlo a
  // mano: lo que se afirma es que NO cambia, no cuál es. Renumerar solo lo
  // visible haría que el timeline contara la saga distinto que el resto del
  // producto.
  await page.goto(MAPA);
  const antes = await fila(page, PRECUELA_B.title).getByText(/^Nº \d+$/).first().innerText();

  await page.goto(`${MAPA}&rol=precuela`);
  const despues = await fila(page, PRECUELA_B.title).getByText(/^Nº \d+$/).first().innerText();

  expect(despues).toBe(antes);
});

test("la cinta dice el rol sobre la portada de una obra con hueco", async ({ page }) => {
  // Hasta la fase 5 una obra CON HUECO no decía su rol en ninguna parte: el
  // chip solo se montaba en ramas, ventanas y puentes.
  await page.goto(MAPA);
  const cinta = fila(page, PRECUELA_A.title).getByTestId("role-ribbon").first();
  await expect(cinta).toBeVisible();
  await expect(cinta).toHaveText(/Precuela/i);
});

test("filtrar NO mueve el progreso del hero", async ({ page }) => {
  // El límite duro de la spec, otra vez: `progress.ts` sale de la fase como
  // entró. El mockup pide lo contrario en dos sitios y se descarta a sabiendas
  // — reabrir el denominador es la familia de fallo del #91 y el #185.
  await loginAsDevtest(page);
  await page.goto(MAPA);
  const antes = await page.getByTestId("saga-hero-progress").innerText();

  await page.goto(`${MAPA}&rol=precuela`);
  expect(await page.getByTestId("saga-hero-progress").innerText()).toBe(antes);
});
