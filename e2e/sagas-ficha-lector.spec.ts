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

    // Con dos subsagas hay un grupo abierto y el otro plegado en pila.
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

  test("el enlace viejo ?tab=mapa acaba en «Cómo leerla» con su ruta", async ({ page }) => {
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=publicacion`);

    await expect(page).toHaveURL(`/saga/${UNIVERSO_ID}/como-leerla?ruta=publicacion`);
    // El selector de itinerario de «Cómo leerla» ofrece las rutas y la
    // publicación se pinta como lista por año (numerada 01, 02…), no como
    // timeline.
    await expect(page.getByRole("link", { name: "Publicación", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Orden de lectura", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^01 / })).toBeVisible();
  });

  test("sin sesión: no hay «ahora» y «Te toca» dice «Empieza por»", async ({ browser }) => {
    const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await page.goto(`/saga/${UNIVERSO_ID}?ruta=lectura`);
    await expect(page.getByTestId("saga-shelf")).toBeVisible();

    await expect(page.getByTestId("shelf-now")).toHaveCount(0);
    await expect(page.getByTestId("next-up")).toContainText("Empieza por");
    await page.close();
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
});
