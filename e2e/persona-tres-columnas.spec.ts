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

// Directores prolíficos de TMDB. Se usa el primero que NO esté ya en `people`:
// `people.tmdb_id` es único, así que sembrar uno repetido reventaría el alta, y
// además arruinaría la aserción «de cero créditos a filmografía».
const TMDB_SEED_CANDIDATES = [
  { tmdbId: 525, name: "QA Christopher Nolan" },
  { tmdbId: 1032, name: "QA Martin Scorsese" },
  { tmdbId: 138, name: "QA Quentin Tarantino" },
  { tmdbId: 488, name: "QA Steven Spielberg" },
  { tmdbId: 5655, name: "QA Wes Anderson" },
];

/** Crea una persona de TMDB nueva, sin un solo crédito. */
async function seedFreshTmdbPerson(): Promise<{ id: string }> {
  for (const candidate of TMDB_SEED_CANDIDATES) {
    const existing = await rest<Array<{ id: string }>>(
      `people?select=id&tmdb_id=eq.${candidate.tmdbId}`,
    );
    if (existing.length > 0) continue;

    const [person] = await rest<Array<{ id: string }>>("people?select=id", {
      method: "POST",
      body: { name: `${candidate.name} ${Date.now()}`, tmdb_id: candidate.tmdbId },
      returnRows: true,
    });
    return person;
  }
  throw new Error(
    "todos los tmdb_id semilla ya están en `people`: añade otro a TMDB_SEED_CANDIDATES",
  );
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
    test.setTimeout(240_000);

    // ⚠️ El test se SIEMBRA SU PROPIA PERSONA, en vez de reusar una de la base y
    // ponerle `credits_hydrated_at` a null. Ese atajo no sirve: a alguien ya
    // hidratado la segunda pasada no le puede CRECER el recuento (el upsert
    // encuentra las filas ya puestas), así que el test pasaba la primera vez y
    // fallaba siempre después — «Expected: > 38, Received: 38». Con una persona
    // nueva de cero créditos, la aserción «de 0 a filmografía» es determinista.
    const person = await seedFreshTmdbPerson();

    try {
      await login(page);

      await page.setViewportSize({ width: 1700, height: 1000 });
      await page.goto(`/persona/${person.id}`);
      await waitForWorks(page);

      // 1. EL BUG DE FONDO: la ficha ya no muestra solo lo que alguien hubiera
      //    abierto alguna vez. Esta persona no tenía NI UN crédito.
      const after = await rest<Array<{ id: string }>>(
        `credits?select=id&person_id=eq.${person.id}`,
      );
      expect(
        after.length,
        "una persona recién creada debería acabar con su filmografía entera",
      ).toBeGreaterThanOrEqual(10);

      // ...y la marca queda puesta, para que la segunda visita no vuelva a
      // llamar a la API.
      const [row] = await rest<Array<{ credits_hydrated_at: string | null }>>(
        `people?select=credits_hydrated_at&id=eq.${person.id}`,
      );
      expect(row.credits_hydrated_at).not.toBeNull();

      // 2. TRES ÁREAS, con la ficha a la izquierda del centro y ancho FIJO
      //    (360px), no una fracción elástica.
      await page.reload();
      await waitForWorks(page);
      const ficha = page.locator('[data-area="ficha"]');
      const obras = page.locator('[data-area="obras"]');
      await expect(ficha).toBeVisible();

      const fichaBox = (await ficha.boundingBox())!;
      const obrasBox = (await obras.boundingBox())!;
      expect(fichaBox.x + fichaBox.width).toBeLessThanOrEqual(obrasBox.x + 1);
      expect(Math.round(fichaBox.width)).toBe(360);

      // 2b. La columna de la ficha NUNCA pasa de la ventana: si la biografía es
      //     larga, la que hace scroll es ELLA, no la página. Sin esto, «Ver más»
      //     obligaba a recorrer la página entera para leer el final.
      const fichaFits = await page.evaluate(() => {
        const el = document.querySelector('[data-area="ficha"]') as HTMLElement | null;
        if (!el) return null;
        const child = el.firstElementChild as HTMLElement | null;
        return {
          alto: Math.round(el.getBoundingClientRect().height),
          ventana: window.innerHeight,
          hijoDesplazable: child ? getComputedStyle(child).overflowY : null,
        };
      });
      expect(fichaFits!.alto).toBeLessThanOrEqual(fichaFits!.ventana);
      expect(fichaFits!.hijoDesplazable).toBe("auto");

      // 3. Destacadas + filmografía, y LA regla del diseño (cambiada el
      //    2026-08-12 a petición del dueño): una obra destacada SÍ vuelve a
      //    salir en la lista. La tira de arriba es un atajo, no un cajón donde
      //    meter cinco obras y sacarlas del recorrido cronológico.
      const featuredBlock = page.getByTestId("person-featured");
      const timeline = page.getByTestId("person-rest");
      await expect(featuredBlock).toBeVisible();
      await expect(timeline).toBeVisible();

      // El TÍTULO de la tarjeta destacada, no su subtítulo: `CoverCard` pinta
      // los dos con `font-serif` y el subtítulo («2008 · Dirección») no es el
      // nombre de ninguna obra — compararlo contra la lista fallaba siempre.
      const featuredTitles = (
        await featuredBlock.locator("a span.font-serif.font-semibold").allInnerTexts()
      )
        .map((s) => s.trim())
        .filter(Boolean);
      // Si esto no encuentra nada, la comprobación de abajo sería vacua: el
      // test tiene que fallar aquí, no pasar por no haber mirado nada.
      expect(featuredTitles.length).toBeGreaterThan(0);

      const listTitles = (await timeline.locator("span.font-serif").allInnerTexts())
        .map((s) => s.trim())
        .filter(Boolean);
      expect(listTitles.length).toBeGreaterThan(0);

      for (const title of featuredTitles) {
        expect(listTitles, `«${title}» está destacada y NO sale en la filmografía`).toContain(title);
      }
    } finally {
      // Los créditos primero: `credits.person_id` referencia a `people`.
      await rest(`credits?person_id=eq.${person.id}`, { method: "DELETE" });
      await rest(`people?id=eq.${person.id}`, { method: "DELETE" });
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
