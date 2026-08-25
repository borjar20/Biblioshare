import { test, expect, type Page } from "@playwright/test";

// El desplegable de @menciones se salía de la pantalla en móvil. La causa no
// era el ancho: era que el `<ul>` iba `absolute` SIN ancla vertical, así que se
// quedaba en su posición estática (debajo del textarea). En el hilo de
// `/post/[id]` el composer es `fixed bottom-0` en móvil, de modo que la lista
// nacía pegada al borde inferior y caía fuera: medido a 360x740, la caja salía
// en y=734 con 202px de alto, o sea 196px por debajo de la pantalla.
//
// La aserción mira la CAJA de la lista contra el viewport, no su contenido: es
// lo único que distingue «se ve» de «está pintada fuera», y sin motor de layout
// no hay caja que medir (por eso esto no se cubre con un unitario).
//
// Se comprueban los dos bordes, no solo el de abajo: la solución voltea la
// lista hacia arriba cuando no cabe, y un volteo incondicional la sacaría por
// arriba en los composers que están a media página.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MOVIL = { width: 360, height: 740 };
const ESCRITORIO = { width: 1280, height: 900 };

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function unPostCualquiera(): Promise<string | null> {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const posts = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id&limit=1`, { headers })
  ).json()) as { id: string }[];
  return posts[0]?.id ?? null;
}

// Abre el autocompletado escribiendo `@` + prefijo y devuelve la caja de la
// lista junto al viewport. `pressSequentially` (no `fill`) porque el hook
// escucha `onInput` y necesita el caret real tras cada tecla.
async function cajaDelDesplegable(page: Page) {
  const textarea = page.getByPlaceholder(/escribe un comentario/i).first();
  await textarea.waitFor({ state: "visible", timeout: 30_000 });
  await textarea.click();
  await textarea.pressSequentially("@d", { delay: 120 });

  const lista = page.locator("ul[data-mention-list]");
  await lista.waitFor({ state: "visible", timeout: 20_000 });

  return page.evaluate(() => {
    const r = document.querySelector("ul[data-mention-list]")!.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

test.use({ serviceWorkers: "block" });

test.describe("El desplegable de @menciones cabe en pantalla", () => {
  test.skip(!EMAIL || !PASSWORD, "sin credenciales de test");

  test("en móvil, con el composer pegado al borde inferior", async ({ page }) => {
    test.setTimeout(180_000);
    const postId = await unPostCualquiera();
    test.skip(!postId, "no hay posts en la base dev");

    await page.setViewportSize(MOVIL);
    await login(page);
    await page.setViewportSize(MOVIL);
    await page.goto(`/post/${postId}`);

    const caja = await cajaDelDesplegable(page);
    expect(caja.bottom, "la lista se sale por abajo").toBeLessThanOrEqual(caja.vh);
    expect(caja.top, "la lista se sale por arriba").toBeGreaterThanOrEqual(0);
    expect(caja.right, "la lista se sale por la derecha").toBeLessThanOrEqual(caja.vw);
    expect(caja.left, "la lista se sale por la izquierda").toBeGreaterThanOrEqual(0);
  });

  test("en escritorio, con el composer a media página", async ({ page }) => {
    test.setTimeout(180_000);
    const postId = await unPostCualquiera();
    test.skip(!postId, "no hay posts en la base dev");

    await page.setViewportSize(ESCRITORIO);
    await login(page);
    await page.setViewportSize(ESCRITORIO);
    await page.goto(`/post/${postId}`);

    const caja = await cajaDelDesplegable(page);
    expect(caja.bottom, "la lista se sale por abajo").toBeLessThanOrEqual(caja.vh);
    expect(caja.top, "la lista se sale por arriba").toBeGreaterThanOrEqual(0);
  });
});
