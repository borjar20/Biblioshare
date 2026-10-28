import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

// E2E de la ficha de saga para el lector (spec 2026-10-27): hero, balda con
// sus pilas, «Te toca» y los chips de itinerario. Solo LEE: no siembra ni
// modifica nada, así que no necesita limpieza. Mismo patrón de login y de REST
// con service role que sagas-timeline-estados.spec.ts.
//
// Universo QA "[QA Sagas v2] Universo" (seed documentado en sagas-v2.spec.ts):
// dos subsagas con obras propias —Era Uno (4) y Era Dos (2)— y un miembro
// directo, la «Trilogía». Rutas: «Orden de lectura» (lectura), «test iti» y
// «Publicación». El estado del lector sale de los pases de devtest, que otros
// specs mueven, así que NINGUNA aserción fija qué grupo o qué obra es «ahora»:
// se compara la balda consigo misma y con la lista accesible.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const ERA_DOS_ID = "c9a702f1-c96b-4daa-a7d4-b6fe135da11b";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USERNAME = process.env.TEST_USER_USERNAME!;

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

async function gotoFicha(page: Page, query = "") {
  await page.goto(`/saga/${UNIVERSO_ID}${query}`);
  await expect(page.getByTestId("saga-shelf")).toBeVisible();
}

const piles = (page: Page) => page.locator('[data-testid^="shelf-pile-"]');
const pileIds = async (page: Page) =>
  (await piles(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("shelf-pile-", "")))).sort();

const adminHeaders = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` });

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Hijas directas del universo con al menos una obra en su subárbol (hija o
 *  nieta): son las que «Subsagas» pinta como puerta. */
async function doorSagaIds(): Promise<string[]> {
  const kids = await rest<Array<{ id: string }>>(`sagas?parent_saga_id=eq.${UNIVERSO_ID}&select=id`);
  const out: string[] = [];
  for (const k of kids) {
    const grand = await rest<Array<{ id: string }>>(`sagas?parent_saga_id=eq.${k.id}&select=id`);
    const ids = [k.id, ...grand.map((g) => g.id)];
    const items = await rest<Array<{ item_id: string }>>(
      `saga_items?saga_id=in.(${ids.join(",")})&select=item_id&limit=1`,
    );
    if (items.length > 0) out.push(k.id);
  }
  return out;
}

/** Obras distintas del universo con algún pase terminado de devtest (lo que
 *  «Tu paso» cuenta como «Terminadas»). */
async function completedWorksOfDevtest(): Promise<number> {
  const [profile] = await rest<Array<{ user_id: string }>>(
    `profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
  );
  if (!profile) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  const items = await rest<Array<{ item_type: string; item_id: string }>>(
    `saga_items?saga_id=in.(${UNIVERSO_ID},${ERA_UNO_ID},${ERA_DOS_ID})&select=item_type,item_id`,
  );
  const inSaga = new Set(items.map((i) => `${i.item_type}:${i.item_id}`));
  const passes = await rest<Array<{ item_type: string; item_id: string }>>(
    `passes?user_id=eq.${profile.user_id}&status=eq.completed&select=item_type,item_id`,
  );
  return new Set(passes.map((p) => `${p.item_type}:${p.item_id}`).filter((k) => inSaga.has(k))).size;
}

/** Personas con follow aceptado de devtest que tienen algún pase en las obras
 *  del universo (lo que «Entre amigos» cuenta). Se lee por REST, no se asume. */
async function friendsWithPassesOfDevtest(): Promise<number> {
  const [profile] = await rest<Array<{ user_id: string }>>(
    `profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
  );
  if (!profile) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  const follows = await rest<Array<{ followee_id: string }>>(
    `follows?follower_id=eq.${profile.user_id}&status=eq.accepted&select=followee_id`,
  );
  if (follows.length === 0) return 0;
  const items = await rest<Array<{ item_type: string; item_id: string }>>(
    `saga_items?saga_id=in.(${UNIVERSO_ID},${ERA_UNO_ID},${ERA_DOS_ID})&select=item_type,item_id`,
  );
  const inSaga = new Set(items.map((i) => `${i.item_type}:${i.item_id}`));
  const passes = await rest<Array<{ user_id: string; item_type: string; item_id: string }>>(
    `passes?user_id=in.(${follows.map((x) => x.followee_id).join(",")})&select=user_id,item_type,item_id`,
  );
  return new Set(passes.filter((p) => inSaga.has(`${p.item_type}:${p.item_id}`)).map((p) => p.user_id)).size;
}

/** href de la primera portada enlazable de la balda, en el orden del DOM. */
const firstCoverHref = (page: Page) => page.locator("a[data-shelf-link]").first().getAttribute("href");

test.describe("ficha de saga · lector", () => {
  test("hero y balda; «ahora» apunta a la primera obra no leída", async ({ page }) => {
    await loginAsDevtest(page);
    await gotoFicha(page, "?ruta=lectura");

    await expect(page.getByTestId("saga-hero")).toBeVisible();
    const now = page.getByTestId("shelf-now");
    await expect(now).toHaveCount(1);

    // La lista accesible recorre la balda en orden: la primera fila que no
    // dice «leída» es la primera obra pendiente, y esa es la que marca «ahora».
    const firstUnread = page.getByTestId("shelf-a11y-list").locator("li").filter({ hasNotText: "leída" }).first();
    await expect(firstUnread).toContainText("ahora");
    expect(await now.getAttribute("href")).toBe(await firstUnread.locator("a").getAttribute("href"));
  });

  test("la pila de otro grupo se despliega al pulsarla, y el abierto pasa a pila", async ({ page }) => {
    await loginAsDevtest(page);
    await gotoFicha(page, "?ruta=lectura");

    // Con dos subsagas hay un grupo abierto y el otro plegado en pila. Acepta
    // cualquiera de las dos: cuál se pliega depende de los pases de devtest
    // (el abierto es el del «ahora»), que otros specs mueven.
    const antes = await pileIds(page);
    expect(antes).toHaveLength(1);
    expect([ERA_UNO_ID, ERA_DOS_ID]).toContain(antes[0]);
    const otro = antes[0] === ERA_UNO_ID ? ERA_DOS_ID : ERA_UNO_ID;

    await page.getByTestId(`shelf-pile-${antes[0]}`).click();

    await expect(page.getByTestId(`shelf-pile-${antes[0]}`)).toHaveCount(0);
    await expect(page.getByTestId(`shelf-pile-${otro}`)).toBeVisible();
  });

  test("el segmento de la barra despliega su grupo", async ({ page }) => {
    await loginAsDevtest(page);
    await gotoFicha(page, "?ruta=lectura");

    const [plegado] = await pileIds(page);
    const segment = page.getByTestId(`shelf-segment-${plegado}`);
    await expect(segment).toHaveAttribute("aria-pressed", "false");

    await segment.click();

    await expect(page.getByTestId(`shelf-pile-${plegado}`)).toHaveCount(0);
    await expect(segment).toHaveAttribute("aria-pressed", "true");
  });

  test("el chip «Publicación» cambia la URL y reordena la balda", async ({ page }) => {
    await loginAsDevtest(page);
    await gotoFicha(page, "?ruta=lectura");
    const antes = await firstCoverHref(page);
    const contadorAntes = await page.getByTestId("shelf-count").innerText();

    const chip = page.getByTestId("saga-shelf").getByRole("link", { name: "Publicación", exact: true });
    await chip.click();

    await expect(page).toHaveURL(/\?ruta=publicacion/);
    await expect(chip).toHaveAttribute("aria-current", "true");
    // Otro itinerario = otra primera portada y otro «N de M» (el denominador
    // cambia: la publicación incluye la Trilogía, que la curación no cuenta).
    await expect.poll(() => firstCoverHref(page)).not.toBe(antes);
    expect(await page.getByTestId("shelf-count").innerText()).not.toBe(contadorAntes);
  });

  test("«Te toca» nombra la obra «ahora» y enlaza a su ficha", async ({ page }) => {
    await loginAsDevtest(page);
    await gotoFicha(page, "?ruta=lectura");

    const nowHref = await page.getByTestId("shelf-now").getAttribute("href");
    const ahora = page.getByTestId("shelf-a11y-list").locator("li").filter({ hasText: "ahora" }).first();
    const nowTitle = (await ahora.locator("a").innerText()).split(" — ")[0];

    const nextUp = page.getByTestId("next-up");
    await expect(nextUp).toContainText(nowTitle);
    await expect(nextUp.getByRole("link", { name: "Ir a la obra" })).toHaveAttribute("href", nowHref!);
  });

  test("el enlace viejo ?tab=mapa acaba en el atlas con su lente", async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=publicacion`);

    // La pestaña «Mapa» y «Cómo leerla» se retiraron con el atlas (Task 10/11). El
    // redirect llega en streaming (200 + redirect en cliente): se afirma la URL final.
    // `ruta=publicacion` ya no es un itinerario sino una lente.
    await expect(page).toHaveURL(`/saga/${UNIVERSO_ID}/mapa?lente=publicacion`);
    await expect(page.getByRole("button", { name: "Publicación", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-reading-no]").first()).toBeVisible();
  });

  test("sin sesión: no hay «ahora» y «Te toca» dice «Empieza por»", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await page.goto(`/saga/${UNIVERSO_ID}?ruta=lectura`);
      await expect(page.getByTestId("saga-shelf")).toBeVisible();

      await expect(page.getByTestId("shelf-now")).toHaveCount(0);
      await expect(page.getByTestId("next-up")).toContainText("Empieza por");
    } finally {
      await context.close();
    }
  });

  test("la lista accesible tiene una fila por cada obra de la saga sembrada", async ({ page }) => {
    // Obras distintas del árbol del universo, por REST (la doble membresía de
    // «Para leer a Isabel Allende» cuenta una vez).
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/saga_items?saga_id=in.(${UNIVERSO_ID},${ERA_UNO_ID},${ERA_DOS_ID})&select=item_type,item_id`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!res.ok) throw new Error(`saga_items: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ item_type: string; item_id: string }>;
    const distintas = new Set(rows.map((r) => `${r.item_type}:${r.item_id}`)).size;
    expect(distintas).toBeGreaterThan(1);

    await loginAsDevtest(page);
    // La ruta «Publicación» es la que lista todas las obras, sin dejar fuera
    // las que la curación no numera.
    await gotoFicha(page, "?ruta=publicacion");
    await expect(page.getByTestId("shelf-a11y-list").locator("li")).toHaveCount(distintas);
  });

  test("con sesión: «Tu paso» cuenta las obras terminadas del lector", async ({ page }) => {
    const completed = await completedWorksOfDevtest();
    await loginAsDevtest(page);
    await gotoFicha(page, "?ruta=lectura");

    if (completed === 0) {
      // Sin pases terminados puede haber en curso o ninguno; en ambos casos la
      // tarjeta solo existe si hay algún pase. Lo determinista: si aparece,
      // «Terminadas» dice 0.
      const bloque = page.getByTestId("your-passage");
      if ((await bloque.count()) > 0) {
        await expect(bloque.locator("dt", { hasText: "Terminadas" }).locator("xpath=following-sibling::dd")).toHaveText("0");
      }
      return;
    }
    const bloque = page.getByTestId("your-passage");
    await expect(bloque).toBeVisible();
    await expect(
      bloque.locator("dt", { hasText: "Terminadas" }).locator("xpath=following-sibling::dd"),
    ).toHaveText(String(completed));
  });

  test("«Subsagas» tiene una puerta por hija con obras, enlazada a su ficha", async ({ page }) => {
    const esperadas = await doorSagaIds();
    expect(esperadas.length).toBeGreaterThan(0);
    await loginAsDevtest(page);
    await gotoFicha(page);

    const doors = page.getByTestId("subsaga-doors");
    await expect(doors).toBeVisible();
    const hrefs = await doors.locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect([...hrefs].sort()).toEqual(esperadas.map((id) => `/saga/${id}`).sort());
  });

  test("el acceso al mapa solo aparece con el mapa encendido y enlaza a /mapa", async ({ page }) => {
    await loginAsDevtest(page);
    // La tarjeta sale con `detail.graph !== null` (mapa encendido Y algo curado).
    // Antes el oráculo era «/mapa redirige a la ficha»; con el atlas, /mapa ya no
    // redirige nunca por el interruptor (spec del atlas §3), así que el oráculo es
    // el propio `show_map`, leído por REST. El universo tiene obras curadas.
    const [saga] = await rest<Array<{ show_map: boolean }>>(`sagas?id=eq.${UNIVERSO_ID}&select=show_map`);
    await gotoFicha(page);

    const teaser = page.getByTestId("atlas-teaser");
    if (saga.show_map) {
      await expect(teaser).toBeVisible();
      await expect(teaser).toHaveAttribute("href", `/saga/${UNIVERSO_ID}/mapa`);
    } else {
      await expect(teaser).toHaveCount(0);
    }
  });

  test("sin sesión: no hay «Tu paso» y las puertas enseñan recuentos, no progreso", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await page.goto(`/saga/${UNIVERSO_ID}`);
      await expect(page.getByTestId("saga-shelf")).toBeVisible();

      await expect(page.getByTestId("your-passage")).toHaveCount(0);
      const doors = page.getByTestId("subsaga-doors");
      await expect(doors).toBeVisible();
      const cards = doors.locator("a");
      const n = await cards.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        // Solo el recuento («4 obras»): sin sesión no hay «x de y».
        await expect(cards.nth(i).getByTestId("door-progress")).toHaveText(/^\D*\d+ obras?$/);
      }
    } finally {
      await context.close();
    }
  });

  test("con sesión: «Entre amigos» solo existe si alguien que sigues tiene pases en la saga", async ({ page }) => {
    const friends = await friendsWithPassesOfDevtest();
    await loginAsDevtest(page);
    await gotoFicha(page, "?ruta=lectura");

    const bloque = page.getByTestId("friends-on-saga");
    if (friends === 0) {
      await expect(bloque).toHaveCount(0);
      return;
    }
    await expect(bloque).toBeVisible();
    // Entre 1 y 4 filas, no `min(friends, 4)` exacto: la UI solo cuenta obras de
    // la ruta activa (?ruta=lectura) y el helper cuenta todo el universo, así
    // que alguien con pases solo en obras fuera de esa ruta no aparece.
    const filas = await bloque.locator("ul > li").count();
    expect(filas).toBeGreaterThanOrEqual(1);
    expect(filas).toBeLessThanOrEqual(4);
    await expect(bloque.locator("a[href^='/u/']").first()).toBeVisible();
  });

  test("sin sesión: no hay «Entre amigos»", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await page.goto(`/saga/${UNIVERSO_ID}`);
      await expect(page.getByTestId("saga-shelf")).toBeVisible();
      await expect(page.getByTestId("friends-on-saga")).toHaveCount(0);
      await expect(page.getByTestId("friends-on-saga-skeleton")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
