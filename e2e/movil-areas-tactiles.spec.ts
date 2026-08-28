import { test, expect, type Page } from "@playwright/test";
import { FINAL_EMPIRE_FILTER } from "./support/book-fixture";

// Áreas táctiles (F4-010/013/015 de la auditoría 2026-08). La auditoría midió
// en vivo que el 60-80% de los controles de cada vista baja de 40px en su lado
// corto, y que el peor de todos es el de puntuar: cinco dots de 7-10px partidos
// en DOS mitades pulsables dejan un target real de 3,5-5px.
//
// Nada de esto se puede cubrir con un unitario: sin motor de layout no hay caja
// que medir, y sin emulación de dispositivo no hay `pointer: coarse` que
// dispare la regla. Por eso las aserciones miran RECTÁNGULOS y eventos de dedo
// de verdad (CDP `Input.dispatchTouchEvent`), no clases de CSS: una clase puede
// estar puesta y no compilar, que es exactamente cómo se coló el bug de los
// botones del mapa (#722).
//
// El test NO guarda nada: se queda en el formulario de edición del diario, así
// que la nota vive en el estado del cliente y no toca la BD. Sin limpieza que
// olvidarse de hacer sobre la cuenta compartida `devtest`.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El más estrecho de los móviles que se soportan (la auditoría midió 360-430).
const MOVIL = { width: 360, height: 740 };
// El mínimo táctil que fija la regla del sistema (`tap-44` en globals.css).
const MINIMO = 44;

function headers() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Fixture persistente de `devtest`, resuelta por título y nunca por UUID fijo
// (patrón de notas-captura.spec.ts): sobrevive a un reset de dev.
async function libroConPase(): Promise<string | null> {
  const bookRes = await fetch(
    `${SUPABASE_URL}/rest/v1/books?${FINAL_EMPIRE_FILTER}&select=id`,
    { headers: headers() },
  );
  if (!bookRes.ok) return null;
  const [book] = (await bookRes.json()) as { id: string }[];
  if (!book) return null;

  const perfilRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: headers() },
  );
  if (!perfilRes.ok) return null;
  const [perfil] = (await perfilRes.json()) as { user_id: string }[];
  if (!perfil) return null;

  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${perfil.user_id}&item_type=eq.book&item_id=eq.${book.id}&select=id&limit=1`,
    { headers: headers() },
  );
  if (!passRes.ok) return null;
  const [pase] = (await passRes.json()) as { id: string }[];
  return pase ? book.id : null;
}

// Un dedo de verdad. `page.touchscreen` solo sabe dar toques, y un
// `dispatchEvent` sintético no vale: `setPointerCapture` necesita un puntero
// activo de verdad o lanza, que es justo el camino que hay que probar.
async function arrastraElDedo(page: Page, desde: number, hasta: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: desde, y }],
  });
  // Dos pasos intermedios: un solo salto no distingue «arrastra» de «toca en
  // el destino», y lo que se prueba es la corrección antes de soltar.
  for (const x of [desde + (hasta - desde) / 2, hasta]) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y }],
    });
  }
  return cdp;
}

test.describe("Áreas táctiles en móvil (auditoría 2026-08)", () => {
  test.skip(!EMAIL || !PASSWORD, "sin credenciales de test");
  // `isMobile` además de `hasTouch`: es lo que pone el navegador en
  // `pointer: coarse`, y sin eso la regla `tap-44` no se activa y el test
  // pasaría en verde midiendo el dibujo en vez del área.
  test.use({ viewport: MOVIL, hasTouch: true, isMobile: true });

  test("las mitades de RatingDots se pulsan a 44px aunque el dot mida 7", async ({
    page,
  }) => {
    const libroId = await libroConPase();
    test.skip(!libroId, "devtest no tiene ningún pase sobre el libro fixture");

    await login(page);
    await page.goto(`/libro/${libroId}?tab=log`);
    await page.getByRole("button", { name: "Editar" }).first().click();

    const grupo = page.getByRole("group", { name: "Tu valoración" }).first();
    await expect(grupo).toBeVisible();

    // La mitad derecha del último dot es el 10/10: el target más pequeño del
    // control (`size="sm"` son 7px de dibujo, 3,5 por mitad).
    const caja = await grupo
      .getByRole("button", { name: "10/10", exact: true })
      .boundingBox();
    expect(caja).not.toBeNull();
    expect(caja!.height).toBeGreaterThanOrEqual(MINIMO);
  });

  test("arrastrar el dedo por la fila aplica la nota que enseña el globo", async ({
    page,
  }) => {
    const libroId = await libroConPase();
    test.skip(!libroId, "devtest no tiene ningún pase sobre el libro fixture");

    await login(page);
    await page.goto(`/libro/${libroId}?tab=log`);
    await page.getByRole("button", { name: "Editar" }).first().click();

    const grupo = page.getByRole("group", { name: "Tu valoración" }).first();
    await expect(grupo).toBeVisible();
    // La FILA de dots, no el grupo: el grupo es un bloque que ocupa todo el
    // ancho de la columna y la nota se calcula sobre el ancho de la fila.
    const fila = grupo.locator("div").first();
    const caja = await fila.boundingBox();
    expect(caja).not.toBeNull();

    const y = caja!.y + caja!.height / 2;
    const izquierda = caja!.x + caja!.width * 0.05;
    const derecha = caja!.x + caja!.width * 0.95;

    // De la nota más baja a la más alta sin levantar el dedo.
    const cdp = await arrastraElDedo(page, izquierda, derecha, y);

    // Con el dedo aún apoyado: la nota, grande, encima de la fila. Es lo que
    // convierte un target de 3,5px en un gesto corregible.
    await expect(grupo.getByText("10", { exact: true })).toBeVisible();

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    // Al soltar se aplica lo que enseñaba el globo. El campo oculto es lo que
    // se enviaría: mide el valor real, no el relleno de los dots.
    await expect(page.locator('input[name="rating"]')).toHaveValue("10");

    // Y el mismo gesto hacia una nota intermedia: el tramo 3/10 está a 3,5px
    // del 2 y del 4 — la lotería que reportó la auditoría.
    const tercio = caja!.x + caja!.width * 0.25;
    const cdp2 = await arrastraElDedo(page, derecha, tercio, y);
    await cdp2.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator('input[name="rating"]')).toHaveValue("3");
  });

  test("tap-44 agranda el área solo con puntero grueso, no con ratón", async ({
    page,
  }) => {
    await page.goto("/login");

    // Sonda: un control del tamaño de los reincidentes que censó la auditoría
    // (el check de episodio son 22px). Se mide el ÁREA, no la clase: se
    // pregunta al navegador qué elemento hay a 18px del centro, que es donde
    // caía el dedo y no pasaba nada.
    const alcanzaFuera = await page.evaluate((clase) => {
      const boton = document.createElement("button");
      boton.className = clase;
      boton.style.cssText =
        "position:fixed;top:300px;left:150px;width:22px;height:22px";
      document.body.append(boton);
      const r = boton.getBoundingClientRect();
      const encontrado = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2 - 18,
      );
      const dentro = boton.contains(encontrado) || encontrado === boton;
      boton.remove();
      return dentro;
    }, "tap-44");

    expect(alcanzaFuera).toBe(true);
  });
});

// Con ratón NO se agranda: un área de 44px alrededor de un icono de 24 le
// robaría clics al vecino, y en escritorio la precisión ya alcanza. Va en un
// describe aparte porque necesita el contexto SIN emulación de dispositivo.
test.describe("La regla táctil no se aplica en escritorio", () => {
  test.skip(!EMAIL || !PASSWORD, "sin credenciales de test");

  test("tap-44 deja el área en el dibujo con puntero fino", async ({ page }) => {
    await page.goto("/login");

    const alcanzaFuera = await page.evaluate((clase) => {
      const boton = document.createElement("button");
      boton.className = clase;
      boton.style.cssText =
        "position:fixed;top:300px;left:150px;width:22px;height:22px";
      document.body.append(boton);
      const r = boton.getBoundingClientRect();
      const encontrado = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2 - 18,
      );
      const dentro = boton.contains(encontrado) || encontrado === boton;
      boton.remove();
      return dentro;
    }, "tap-44");

    expect(alcanzaFuera).toBe(false);
  });
});
