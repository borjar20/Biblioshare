import { test, expect, type Page } from "@playwright/test";

// Desbordes horizontales en móvil (#721). La auditoría de agosto los midió en
// vivo: la ficha de serie pintaba un layout de 470px en un viewport de 360, y la
// pestaña Sagas de Colección uno de 438. En los dos casos la causa era la misma
// —una celda de grid vale `min-width:auto`, así que su contenido no encoge—, y
// en los dos el síntoma es el mismo: la página entera se dibuja encogida y con
// scroll lateral.
//
// La aserción NO mira contenido: mira `scrollWidth`. Es lo único que distingue
// «cabe» de «no cabe» cuando el texto es idéntico en los dos casos. Y por eso
// mismo estos dos casos no se cubren con un unitario: sin motor de layout no
// hay ancho que medir.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El más estrecho de los móviles que se soportan (la auditoría midió 360-430).
const MOVIL = { width: 360, height: 740 };

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Una serie CON reparto: sin créditos no se monta la tira de avatares, que era
// justo lo que desbordaba. Si no hay ninguna, el test se salta en vez de pasar
// en falso.
async function serieConReparto(): Promise<string | null> {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const credits = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/credits?item_type=eq.series&select=item_id&limit=200`,
      { headers },
    )
  ).json()) as { item_id: string }[];

  const porObra = new Map<string, number>();
  for (const c of credits) porObra.set(c.item_id, (porObra.get(c.item_id) ?? 0) + 1);

  let mejor: string | null = null;
  let max = 0;
  for (const [id, n] of porObra) {
    if (n > max) {
      max = n;
      mejor = id;
    }
  }
  return max >= 3 ? mejor : null;
}

async function anchoDeLaPagina(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test.describe("Desbordes horizontales en móvil (#721)", () => {
  test.skip(!EMAIL || !PASSWORD, "sin credenciales de test");
  test.use({ viewport: MOVIL });

  test("la ficha de serie cabe en 360px en sus tres pestañas", async ({ page }) => {
    const serieId = await serieConReparto();
    test.skip(!serieId, "no hay ninguna serie con reparto en esta base");

    await login(page);
    await page.setViewportSize(MOVIL);

    await page.goto(`/serie/${serieId}`);
    // La tira de reparto es lo que desbordaba: se espera a que exista antes de
    // medir, o se mediría una página a medio montar (que sí cabe).
    await page.waitForLoadState("networkidle");

    expect(await anchoDeLaPagina(page)).toBeLessThanOrEqual(MOVIL.width);

    // Las otras dos pestañas comparten el contenedor de InfoPanel.
    for (const tab of ["episodes", "log"]) {
      await page.goto(`/serie/${serieId}?tab=${tab}`);
      await page.waitForLoadState("networkidle");
      expect(await anchoDeLaPagina(page), `pestaña ${tab}`).toBeLessThanOrEqual(MOVIL.width);
    }
  });

  test("la pestaña Sagas de Colección cabe en 360px", async ({ page }) => {
    await login(page);
    await page.setViewportSize(MOVIL);

    await page.goto("/coleccion?tab=sagas");
    await page.waitForLoadState("networkidle");

    expect(await anchoDeLaPagina(page)).toBeLessThanOrEqual(MOVIL.width);
  });

  // El cuaderno (#833): mismo fallo exacto que tenía /buscar —input sin
  // `w-full` dentro de una celda `flex-1` con `min-width:auto`—, medido en
  // 407px de página en un viewport de 360. Necesita sesión, así que vive en
  // este describe y no en el público de más abajo.
  test("el cuaderno cabe en 360px", async ({ page }) => {
    await login(page);
    await page.setViewportSize(MOVIL);

    await page.goto("/notas");
    await page.waitForLoadState("networkidle");

    expect(await anchoDeLaPagina(page)).toBeLessThanOrEqual(MOVIL.width);
  });
});

// /buscar (#721). Misma familia que los dos de arriba, distinta causa: el input
// de la barra de búsqueda no llevaba `w-full`, así que conservaba su ancho
// intrínseco (`size=20` → 273px) y la celda `flex-1` que lo envuelve vale
// `min-width:auto`, que no encoge por debajo de eso. Medido: 391px de fila en
// un viewport de 360. El modo Personas, con el MISMO markup pero con `w-full`,
// cabía — de ahí que el desborde solo se viera en Títulos.
//
// Es público: no necesita sesión, a diferencia de los dos tests de arriba.
test.describe("Desbordes horizontales en móvil · /buscar (#721)", () => {
  test.use({ viewport: MOVIL });

  for (const [nombre, url] of [
    ["sin consulta", "/buscar"],
    ["con resultados", "/buscar?type=book&q=dune"],
    ["modo Personas", "/buscar?modo=personas&q=a"],
  ] as const) {
    test(`/buscar cabe en 360px (${nombre})`, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      expect(await anchoDeLaPagina(page)).toBeLessThanOrEqual(MOVIL.width);
    });
  }
});
