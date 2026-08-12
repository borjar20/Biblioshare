import { test, expect, type Page } from "@playwright/test";

// Ficha de persona (`/persona/[id]`) como explorador de créditos a tres áreas
// (FICHA · OBRAS · RAÍL), y con la obra COMPLETA de la persona hidratada desde
// TMDB en la primera visita. Spec:
// docs/superpowers/specs/2026-08-12-ficha-persona-tres-columnas-design.md
//
// ⚠️ POR QUÉ TODO ESTE SPEC HACE LOGIN, incluso las pruebas de layout: `anon` no
// tiene grant de escritura sobre el catálogo (42501, esperado desde la
// navegación anónima #359/#360), así que un visitante sin sesión NO dispara la
// hidratación y la ficha se queda con lo que ya hubiera en base.
//
// ⚠️ Y POR QUÉ NO SE ELIGE A LA PERSONA CON MÁS FILAS EN `credits`: en dev la
// inmensa mayoría de `credits` son HUÉRFANOS — apuntan a `movies` que ya no
// existen (medido el 2026-08-12: 16 créditos sanos frente a miles de filas).
// `getPersonProfile` los descarta, con razón, así que una persona con 226
// créditos puede tener CERO obras. Este spec se construye su propio caso: coge a
// alguien con créditos SANOS, deja que la ficha lo hidrate, y comprueba sobre
// ese resultado.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

test.use({ serviceWorkers: "block" });

async function rest<T>(
  path: string,
  init: { method?: string; body?: unknown; returnRows?: boolean } = {},
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.returnRows ? { Prefer: "return=representation" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} — ${text}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * Espera a que el `<Suspense>` haya terminado.
 *
 * Es una aserción con valor propio, no solo una espera: mientras el contenido
 * está en vuelo, el esqueleto y el contenido real conviven en el DOM y hay DOS
 * `[data-area="obras"]`. Exigir que quede exactamente UNO comprueba que el
 * esqueleto se retira de verdad — si se quedara pegado bajo la ficha, esto lo
 * caza.
 */
async function waitForWorks(page: Page) {
  await expect(page.locator('[data-area="obras"]')).toHaveCount(1);
  await expect(page.locator('[data-area="obras"]')).toBeVisible();
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

/**
 * Una persona de TMDB con al menos un crédito que SÍ resuelve contra el
 * catálogo. Devuelve su id y cuántos créditos tiene ahora mismo.
 */
async function findPersonWithRealWork(): Promise<{ id: string; credits: number }> {
  const movies = await rest<Array<{ id: string }>>("movies?select=id&limit=60");
  const ids = movies.map((m) => m.id).join(",");
  const credits = await rest<Array<{ person_id: string }>>(
    `credits?select=person_id&item_type=eq.movie&item_id=in.(${ids})`,
  );

  const counts = new Map<string, number>();
  for (const c of credits) counts.set(c.person_id, (counts.get(c.person_id) ?? 0) + 1);

  for (const [personId] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const [person] = await rest<Array<{ id: string; tmdb_id: number | null }>>(
      `people?select=id,tmdb_id&id=eq.${personId}`,
    );
    if (!person?.tmdb_id) continue;
    const all = await rest<Array<{ id: string }>>(`credits?select=id&person_id=eq.${personId}`);
    return { id: person.id, credits: all.length };
  }
  throw new Error("dev no tiene ninguna persona de TMDB con créditos que resuelvan a catálogo");
}

test.describe("ficha de persona", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  test("hidrata la obra completa y la pinta a tres columnas", async ({ page }) => {
    test.setTimeout(180_000);

    const target = await findPersonWithRealWork();

    // Se fuerza el estado "sin hidratar" para que este test cubra de verdad el
    // camino de hidratación aunque otra pasada ya lo hubiera recorrido.
    await rest(`people?id=eq.${target.id}`, {
      method: "PATCH",
      body: { credits_hydrated_at: null },
    });

    await login(page);

    await page.setViewportSize({ width: 1700, height: 1000 });
    await page.goto(`/persona/${target.id}`);
    await waitForWorks(page);

    // 1. EL BUG DE FONDO: la ficha ya no muestra solo lo que alguien hubiera
    //    abierto alguna vez. Tras la visita hay más créditos que antes...
    const after = await rest<Array<{ id: string }>>(`credits?select=id&person_id=eq.${target.id}`);
    expect(
      after.length,
      `debería tener más créditos que los ${target.credits} de partida`,
    ).toBeGreaterThan(target.credits);

    // ...y la marca queda puesta, para que la segunda visita no vuelva a llamar
    // a la API.
    const [row] = await rest<Array<{ credits_hydrated_at: string | null }>>(
      `people?select=credits_hydrated_at&id=eq.${target.id}`,
    );
    expect(row.credits_hydrated_at).not.toBeNull();

    // 2. TRES ÁREAS, con la ficha a la izquierda del centro y el ancho del
    //    mockup (308px), no una fracción elástica.
    await page.reload();
    await waitForWorks(page);
    const ficha = page.locator('[data-area="ficha"]');
    const obras = page.locator('[data-area="obras"]');
    await expect(ficha).toBeVisible();

    const fichaBox = (await ficha.boundingBox())!;
    const obrasBox = (await obras.boundingBox())!;
    expect(fichaBox.x + fichaBox.width).toBeLessThanOrEqual(obrasBox.x + 1);
    expect(Math.round(fichaBox.width)).toBe(308);

    // 3. Destacadas + «El resto, por año», y LA regla del diseño: una obra
    //    destacada NO vuelve a salir en la lista de abajo.
    const featuredBlock = page.getByTestId("person-featured");
    const restBlocks = page.getByTestId("person-rest");
    await expect(featuredBlock).toBeVisible();
    await expect(restBlocks.first()).toBeVisible();

    const featuredTitles = (await featuredBlock.locator("a span.font-serif").allInnerTexts())
      .map((s) => s.trim())
      .filter(Boolean);
    // Si esto no encuentra nada, la comprobación de abajo sería vacua: el
    // test tiene que fallar aquí, no pasar por no haber mirado nada.
    expect(featuredTitles.length).toBeGreaterThan(0);

    const restTitles = (await restBlocks.locator("a span.font-serif").allInnerTexts())
      .map((s) => s.trim())
      .filter(Boolean);
    expect(restTitles.length).toBeGreaterThan(0);

    for (const title of featuredTitles) {
      expect(restTitles, `«${title}» está destacada y además en la lista`).not.toContain(title);
    }
  });

  test("los filtros viven en la URL y «atrás» funciona", async ({ page }) => {
    test.setTimeout(180_000);
    const target = await findPersonWithRealWork();

    await login(page);
    await page.setViewportSize({ width: 1700, height: 1000 });
    await page.goto(`/persona/${target.id}`);
    await waitForWorks(page);

    // Un chip de crédito lleva su recuento y navega cambiando la URL.
    const creditChip = page.getByRole("link", { name: /·\s*\d+$/ }).first();
    await expect(creditChip).toBeVisible();
    await creditChip.click();
    await expect(page).toHaveURL(/credito=/);

    // Funciona el botón atrás porque son enlaces de verdad, no estado cliente.
    await page.goBack();
    await expect(page).not.toHaveURL(/credito=/);

    // Y se puede llegar prefiltrado desde fuera.
    await page.goto(`/persona/${target.id}?tipo=peliculas`);
    await expect(page.getByRole("link", { name: "Películas" })).toBeVisible();
  });

  test("sin obras: aviso, sin raíl y sin destacadas", async ({ page }) => {
    // Una persona SIN ids externos: es el único modo de alcanzar este estado
    // ahora que la ficha hidrata en la primera visita.
    const [person] = await rest<Array<{ id: string }>>("people?select=id", {
      method: "POST",
      body: { name: `QA sin obra ${Date.now()}` },
      returnRows: true,
    });

    try {
      await login(page);
      await page.setViewportSize({ width: 1700, height: 1000 });
      await page.goto(`/persona/${person.id}`);

      await expect(
        page.getByText("Aún no hay obras de esta persona en el catálogo."),
      ).toBeVisible();
      // El raíl NO se pinta: un raíl de cajas vacías es peor que no tenerlo.
      await expect(page.locator('[data-area="rail"]')).toHaveCount(0);
      await expect(page.getByText("Destacadas")).toHaveCount(0);
    } finally {
      await rest(`people?id=eq.${person.id}`, { method: "DELETE" });
    }
  });

  test("cero scroll horizontal en todos los anchos", async ({ page }) => {
    test.setTimeout(180_000);
    const target = await findPersonWithRealWork();

    await login(page);
    for (const width of [390, 900, 1300, 1700]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/persona/${target.id}`);
      await waitForWorks(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `hay scroll horizontal a ${width}px`).toBe(false);
    }
  });
});
