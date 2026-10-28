import { expect, test, type Locator, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

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
// Mudado al atlas (Task 11 del atlas, 2026-10-28): el timeline y su barra de
// filtros (`role-filter-*`, `role-ribbon`) se retiraron. La lente Rol del atlas
// pinta un carril por rol; tocar su etiqueta fija `?rol=`, que ATENÚA las obras
// de otros roles (`data-dimmed`) en vez de esconderlas, y el rol se lee en el
// nombre accesible de cada obra. El número de lectura vive en «Ver como lista».
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

// `ruta=lectura` fija el atlas a la curación: sin ella la ruta activa sería la
// que el lector tenga adoptada.
const ATLAS = `/saga/${UNIVERSO_ID}/mapa?ruta=lectura`;

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
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

/** El atlas ha pintado su primer layout (saga-atlas.tsx marca `data-ready`). */
async function atlasReady(page: Page) {
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
}

/** Abre «Ver como lista» del atlas (el sustituto accesible del plano y del timeline
 *  retirado) y devuelve la `ol` de obras. */
async function openList(page: Page) {
  await atlasReady(page);
  await page.getByRole("button", { name: "Ver como lista" }).click();
  const lista = page.getByRole("list", { name: /^Obras de / });
  await expect(lista).toBeVisible();
  return lista;
}

/** La entrada de una obra por el nombre de SU enlace («N. Título»): filtrar por texto
 *  casaría también con las entradas que la nombran como ancla o compañera de tándem. */
const fila = (lista: Locator, title: string) =>
  lista.getByRole("listitem").filter({
    has: lista.page().getByRole("link", { name: new RegExp(`^(\\d+\\. )?${title}$`) }),
  });

const obra = (page: Page, itemId: string) => page.locator(`[data-work-key="i:book:${itemId}"]`);
/** Etiqueta de un carril de la lente Rol: un botón con `aria-pressed`. */
const carril = (page: Page, name: string) =>
  page.locator("[data-atlas-stage]").getByRole("button", { name, exact: true });

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

test("tocar un carril resalta su rol, atenúa el resto y se puede volver", async ({ page }) => {
  await page.goto(`${ATLAS}&lente=rol`);
  await atlasReady(page);
  await expect(obra(page, RELATO.id)).not.toHaveAttribute("data-dimmed", /.+/);

  // El carril es un botón dentro del plano: Enter es el mismo camino que el clic y no
  // depende de dónde haya caído la cámara.
  await carril(page, "Precuela").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]rol=precuela(&|$)/);
  await expect(carril(page, "Precuela")).toHaveAttribute("aria-pressed", "true");

  // Atenúa, no esconde: las precuelas siguen sin atenuar y lo que no es precuela —
  // incluida la obra que vive dentro de un tándem— se atenúa, pero sigue ahí.
  await expect(obra(page, PRECUELA_A.id)).not.toHaveAttribute("data-dimmed", /.+/);
  await expect(obra(page, PRECUELA_B.id)).not.toHaveAttribute("data-dimmed", /.+/);
  await expect(obra(page, RELATO.id)).toHaveAttribute("data-dimmed", "true");

  // Lo que lo hace REVERSIBLE: con el resaltado puesto siguen los demás carriles,
  // porque salen de las obras y no de lo resaltado.
  await expect(carril(page, "Relato")).toHaveAttribute("aria-pressed", "false");

  // Tocar el mismo carril otra vez quita el resaltado.
  await carril(page, "Precuela").focus();
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/rol=/);
  await expect(obra(page, RELATO.id)).not.toHaveAttribute("data-dimmed", /.+/);
});

test("la lente NO renumera: la obra conserva su número", async ({ page }) => {
  // El número se lee de la propia página en los dos estados en vez de fijarlo a
  // mano: lo que se afirma es que NO cambia, no cuál es. Renumerar solo lo
  // resaltado haría que el atlas contara la saga distinto que el resto del producto.
  const numero = async () => {
    const enlace = fila(await openList(page), PRECUELA_B.title).getByRole("link");
    return (await enlace.getAttribute("aria-label"))?.match(/^(\d+)\. /)?.[1];
  };
  await page.goto(ATLAS);
  const antes = await numero();
  expect(antes).toBeDefined();

  await page.goto(`${ATLAS}&lente=rol&rol=precuela`);
  expect(await numero()).toBe(antes);
});

test("el rol de una obra con hueco se dice en la obra", async ({ page }) => {
  // Hasta la fase 5 una obra CON HUECO no decía su rol en ninguna parte. En el
  // atlas va en su nombre accesible (y en el pie de la portada al acercar).
  await page.goto(ATLAS);
  await atlasReady(page);
  await expect(obra(page, PRECUELA_A.id)).toHaveAttribute("aria-label", /, Precuela(,|$)/);
  // Y en la lista, en su línea de datos.
  await expect(fila(await openList(page), PRECUELA_A.title)).toContainText("Precuela");
});

test("filtrar NO mueve el progreso de la balda", async ({ page }) => {
  // El límite duro de la spec, otra vez: `progress.ts` sale de la fase como
  // entró. El mockup pide lo contrario en dos sitios y se descarta a sabiendas
  // — reabrir el denominador es la familia de fallo del #91 y el #185.
  await loginAsDevtest(page);
  // El contador «N de M» vive en la balda de la ficha, no en el atlas: se lee
  // allí, y el resaltado se aplica en el atlas (la ficha también acepta ?rol=
  // sin cambiar el contador). Siempre en la misma ruta (`lectura`).
  await page.goto(`/saga/${UNIVERSO_ID}?ruta=lectura`);
  const count = page.getByTestId("shelf-count");
  await expect(count).toBeVisible();
  const antes = (await count.innerText()).trim();

  // El resaltado se aplica de verdad en el atlas (el `?rol=` viejo se traduce a la
  // lente Rol): una precuela sin atenuar y el relato atenuado.
  await page.goto(`${ATLAS}&rol=precuela`);
  await expect(page).toHaveURL(/lente=rol/);
  await atlasReady(page);
  await expect(obra(page, PRECUELA_A.id)).not.toHaveAttribute("data-dimmed", /.+/);
  await expect(obra(page, RELATO.id)).toHaveAttribute("data-dimmed", "true");

  // Y el contador de la balda, en la ficha, sigue igual.
  await page.goto(`/saga/${UNIVERSO_ID}?ruta=lectura&rol=precuela`);
  await expect(page.getByTestId("shelf-count")).toHaveText(antes);
});
