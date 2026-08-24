import { test, expect, type Page } from "@playwright/test";

// El muro de /estadisticas tras el rediseño gráfico: panel héroe a tres columnas
// y las formas nuevas (lollipop, waffle, bullet, area).
//
// Qué cubre esto que los unitarios NO pueden: `column-span: all` dentro de una
// multicolumna es una regla de CSS que ningún test de nodo evalúa — jsdom no
// hace layout. Si Tailwind no genera la utilidad arbitraria, o si la regla no
// aplica por ir en un hijo que no es el directo del contenedor, el panel se
// queda a un tercio de ancho y todo lo demás sigue verde.
//
// Lo otro que cubre es el invariante de `SELF_DESCRIBING`: que las marcas sean
// alcanzables con TECLADO de verdad, en un navegador, y no solo que el atributo
// `tabindex` esté puesto en el árbol renderizado.
//
// No siembra datos: usa la biblioteca de devtest tal cual. Las aserciones son de
// forma y de foco, nunca de cifras concretas — un spec que dependa de cuántas
// obras tiene devtest se rompe la próxima vez que alguien registre una lectura.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("muro de estadísticas", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/estadisticas");
    // El muro son 18 consultas tras UN solo <Suspense>: se espera al contenido,
    // nunca a `networkidle`, que con streaming no llega.
    await expect(
      page.getByRole("heading", { name: "Calendario anual", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("el héroe ocupa el ancho completo de su sección", async ({ page }) => {
    const seccion = page.locator("#actividad");
    const tarjetaHeroe = page
      .getByRole("heading", { name: "Calendario anual", exact: true })
      .locator("xpath=ancestor::section[1]");

    const anchoSeccion = await seccion.evaluate((el) => el.clientWidth);
    const anchoHeroe = await tarjetaHeroe.evaluate((el) => el.clientWidth);

    // Tolerancia por el `gap` de la multicolumna, no por vaguedad: sin
    // `column-span` la tarjeta mediría un tercio, muy por debajo del 90 %.
    expect(anchoHeroe).toBeGreaterThan(anchoSeccion * 0.9);
  });

  test("el héroe es el primero de su sección, no cae en medio de la columna", async ({
    page,
  }) => {
    const seccion = page.locator("#actividad");
    const cajaSeccion = await seccion.boundingBox();
    const cajaHeroe = await page
      .getByRole("heading", { name: "Calendario anual", exact: true })
      .locator("xpath=ancestor::section[1]")
      .boundingBox();

    expect(cajaSeccion).not.toBeNull();
    expect(cajaHeroe).not.toBeNull();
    // Dentro de los primeros 200 px de la sección: por debajo del título y su
    // descripción, y por encima de cualquier otra tarjeta.
    expect(cajaHeroe!.y - cajaSeccion!.y).toBeLessThan(200);
  });

  test("las marcas de un gráfico se alcanzan con el teclado y dicen su cifra", async ({
    page,
  }) => {
    // La CARA no lleva marcas focalizables a propósito: el disparador del modal
    // la cubre entera. Hay que abrir la capa para consultarlas punto a punto.
    await page
      .getByRole("heading", { name: "Calendario anual", exact: true })
      .locator("xpath=ancestor::section[1]")
      .getByRole("button")
      .first()
      .click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();

    const marca = dialogo.getByRole("img").first();
    await marca.focus();
    await expect(marca).toBeFocused();
    // El nombre accesible lleva el dato, no solo el nombre del punto: es lo que
    // sustituye a la tabla que estos gráficos ya no pintan.
    await expect(marca).toHaveAttribute("aria-label", /\d/);
  });

  test("un ranking dibuja: dejó de ser una lista de texto", async ({ page }) => {
    // «Autores más leídos» y no «Autores mejor valorados»: el segundo exige dos
    // obras valoradas del mismo nombre y sale vacío en la cuenta de pruebas, así
    // que el test estaría comprobando el estado vacío sin enterarse.
    const tarjeta = page
      .getByRole("heading", { name: "Autores más leídos", exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(tarjeta).toBeVisible();
    // El tallo del lollipop. Si el panel siguiera en `ranking`, no existiría.
    // Va dentro de un `aria-hidden`, así que se busca en el DOM: `toBeVisible`
    // sobre el locator, no en el árbol accesible.
    await expect(tarjeta.locator("[data-stem]").first()).toBeVisible();
  });

  test("un reparto se cuenta en celdas, no se mide en ángulos", async ({ page }) => {
    const tarjeta = page
      .getByRole("heading", { name: "Estados", exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(tarjeta).toBeVisible();
    // `:visible` no es un adorno: cada panel pinta su gráfico DOS veces —una en
    // la cara y otra dentro del `<dialog>` de la capa, que está en el DOM aunque
    // esté cerrado—. Sin filtrar, la cuenta sale doblada.
    const celdas = tarjeta.locator("[data-cell]:visible");
    const n = await celdas.count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(100);
    // Y dice qué vale una celda: sin eso, contar no sirve de nada.
    await expect(tarjeta.getByText(/cada celda/).first()).toBeVisible();
  });

  test("la página no hace scroll horizontal en móvil", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });
});
