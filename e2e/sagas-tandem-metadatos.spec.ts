import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 2 del timeline con estados: los metadatos del HUECO compartido
// (`saga_tandems`). Lo que cubre y las unitarias no pueden: que el guardado
// llega a BD por el RPC de siete argumentos, que deshacer el tándem borra su
// fila EN LA MISMA transacción —lo único que ningún CHECK puede garantizar,
// porque la pertenencia es un empate entre filas y no una FK— y que la ficha
// pública lo dice.
//
// Mismo universo y mismo patrón de sesión/limpieza que
// `e2e/sagas-editor-secuencia.spec.ts`, del que sale el gesto de emparejar:
// `fetch` nativo (no el fixture `request`, que muere con el contexto y dejaría
// filas huérfanas en un timeout), `res.ok` comprobado en cada escritura
// (#180/#182) y la semilla devuelta a como estaba.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo (el que tiene show_map)
const NOTA = "Se cuentan lo mismo desde dos bandos";

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

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

type ItemRow = { item_id: string; position: number | null; placement: string | null };
type BlockRow = { id: string; position_in_parent: number | null; placement_in_parent: string | null };

const fetchItems = async (): Promise<ItemRow[]> =>
  (await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement`)).json();
const fetchBlock = async (): Promise<BlockRow | null> =>
  (await api(`sagas?parent_saga_id=eq.${ERA_UNO_ID}&select=id,position_in_parent,placement_in_parent`))
    .json()
    .then((rows: BlockRow[]) => rows[0] ?? null);
const fetchTandems = async (): Promise<Array<{ position: number; modo: string | null; nota: string | null }>> =>
  (await api(`saga_tandems?saga_id=eq.${ERA_UNO_ID}&select=position,modo,nota`)).json();

/** Deja Era Uno como estaba: un guardado real renumera TODA la lista, así que
 *  no basta con revertir la fila que el test tocó — hay que reponer las cuatro
 *  obras, el bloque y cualquier metadato de tándem. */
async function restore(items: ItemRow[], block: BlockRow | null) {
  for (const r of items) {
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${r.item_id}`, {
      method: "PATCH",
      body: JSON.stringify({ position: r.position, placement: r.placement }),
    });
  }
  if (block) {
    await api(`sagas?id=eq.${block.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        position_in_parent: block.position_in_parent,
        placement_in_parent: block.placement_in_parent,
      }),
    });
  }
  await api(`saga_tandems?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
}

// Las dos cáscaras del editor se montan A LA VEZ y se ocultan por breakpoint
// (regla de los dos árboles): sin `:visible`, ambigüedad segura.
const rows = (page: Page) => page.locator('[data-testid="sequence-row"]:visible');
const tandemMeta = (page: Page) => page.locator('[data-testid="tandem-meta"]:visible');
const save = async (page: Page) => {
  await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
  await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();
};

/** Empareja la fila 3 con el hueco 1, el mismo gesto que ya cubre
 *  `sagas-editor-secuencia.spec.ts`: dos obras compartiendo el hueco 1. */
async function emparejar(page: Page) {
  await rows(page).nth(2).getByRole("button", { name: /^Acciones de / }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Mismo hueco que otra obra/ }).click();
  const picker = page.getByRole("dialog");
  await picker.locator("li").filter({ hasText: "Rayuela" }).click();
  await picker.getByRole("button", { name: "Emparejar en el hueco 1" }).click();
}

test("declarar modo y nota de un tándem persiste tras recargar", async ({ page }) => {
  const items = await fetchItems();
  const block = await fetchBlock();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    await emparejar(page);

    // Los controles solo existen bajo un hueco COMPARTIDO: antes de emparejar
    // no había ninguno, y esa es la mitad de lo que prueba este locator.
    await expect(tandemMeta(page)).toHaveCount(1);
    await tandemMeta(page).getByRole("button", { name: "A la vez" }).click();
    await tandemMeta(page).getByRole("textbox").fill(NOTA);
    await save(page);

    // Contra BD, no contra la pantalla: es lo único que demuestra que el
    // séptimo argumento del RPC llegó de verdad.
    expect(await fetchTandems()).toEqual([{ position: 1, modo: "simultaneo", nota: NOTA }]);

    await page.reload();
    await expect(tandemMeta(page).getByRole("button", { name: "A la vez" })).toHaveAttribute("aria-pressed", "true");
    await expect(tandemMeta(page).getByRole("textbox")).toHaveValue(NOTA);
  } finally {
    await restore(items, block);
  }
});

test("deshacer el tándem borra su fila de metadatos en la misma transacción", async ({ page }) => {
  const items = await fetchItems();
  const block = await fetchBlock();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    await emparejar(page);
    await tandemMeta(page).getByRole("button", { name: "Cualquier orden" }).click();
    await save(page);
    expect(await fetchTandems()).toHaveLength(1);

    // Deshacer y volver a guardar: la fila tiene que irse sola, sin que nadie
    // la borre a mano. Ningún CHECK puede imponerlo —la pertenencia al tándem
    // es un empate entre filas, no una FK—, así que lo sostiene el RPC.
    // El nombre accesible sale del aria-label (`unpairFor`: «Deshacer el
    // tándem del hueco N»), no del texto visible del botón («Deshacer
    // tándem»). Un locator que no casa se agota como TIMEOUT del test, no
    // como fallo claro — costó una pasada entera descubrirlo.
    await page.getByRole("button", { name: /^Deshacer el tándem/ }).locator("visible=true").first().click();
    await expect(tandemMeta(page)).toHaveCount(0);
    await save(page);

    expect(await fetchTandems()).toEqual([]);
  } finally {
    await restore(items, block);
  }
});

test("la ficha pública dice qué clase de tándem es, y su nota", async ({ page }) => {
  const items = await fetchItems();
  const block = await fetchBlock();
  try {
    // Semilla por REST: aísla el render de la UI de curación, que ya cubren los
    // dos tests de arriba. El tándem vive en Era Uno, pero se mira en el
    // UNIVERSO — es el único universo QA con `show_map = true`, y su timeline
    // incluye las obras de sus hijas.
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.d6d61eab-6ef4-4691-a8f0-b89068508fd4`, {
      method: "PATCH",
      body: JSON.stringify({ position: 2, placement: "fijo" }),
    });
    await api("saga_tandems", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ saga_id: ERA_UNO_ID, position: 2, modo: "indistinto", nota: NOTA }),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    const fila = page.locator('[data-testid="timeline-tandem"]:visible').first();
    await expect(fila).toBeVisible();
    await expect(fila).toContainText("Cualquier orden");
    await expect(fila).toContainText(NOTA);
  } finally {
    await restore(items, block);
  }
});
