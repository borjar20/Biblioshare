import { test, expect, type Page } from "@playwright/test";

// Catálogo server-authoritative (#674): la búsqueda ya NO escribe en la base
// (§7.32) — la fila nace vacía ("shell", hydrated_at null) al abrir la ficha
// (openCatalogItem, src/app/buscar/actions.ts → register_catalog_item RPC) y
// se hidrata server-side desde el proveedor (TMDB) con un presupuesto corto
// antes de redirigir. Este e2e cubre el camino real de punta a punta: login →
// /buscar → abrir un resultado de película → la ficha muestra título y
// sinopsis REALES, no la shell vacía ("Sin título" / "Sin sinopsis
// disponible."). La regresión de seguridad (un INSERT directo a movies/books/
// series debe fallar) ya la cubre el SQL de la Task 11
// (supabase/migrations/20260818_catalog_f_revoke_insert.sql) — no se repite
// aquí.
//
// Convención de datos (docs/TESTING.md): sin usuarios ni filas de catálogo con
// UUID fijo que sembrar de antemano — la fila la crea la propia UI al abrir la
// ficha, así que no hay nada que insertar por REST antes del test. Y NO se
// limpia la fila de `movies` que nace del clic: a diferencia de los usuarios/
// pases desechables, el catálogo es compartido y autoritativo por diseño
// (#674) — borrar una obra real arrastraría los pases de quien la tenga en su
// biblioteca (`catalog_item_has_passes`, #272). Solo se restaura onboarded_at.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Título conocido y estable en TMDB — cualquier idioma de búsqueda de TMDB lo
// resuelve como primer resultado.
const MOVIE_QUERY = "El viaje de Chihiro";

// Textos "vacíos" de la shell sin hidratar (messages/es.json, ns "detail"):
// si la ficha los sigue mostrando, la hidratación server-side no llegó.
const UNTITLED = "Sin título";
const NO_SYNOPSIS = "Sin sinopsis disponible.";

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
}

// El asistente de onboarding solo se ve con onboarded_at a null — mismo patrón
// que e2e/onboarding.spec.ts. El usuario de pruebas es siempre "ya
// onboardeado" fuera del test, así que se restaura en el afterEach.
async function setOnboardedAt(value: string | null) {
  const res = await rest(`profiles?username=eq.${encodeURIComponent(USERNAME)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ onboarded_at: value }),
  });
  if (!res.ok) throw new Error(`no se pudo fijar onboarded_at: ${res.status}`);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  // El proxy cachea "ya onboardeado" en una cookie por usuario; al forzar el
  // estado por debajo hay que tirarla, o el gate decide con el valor viejo.
  await page.context().clearCookies({ name: "bs_onb" });
}

// La hidratación pega a TMDB con un presupuesto corto (HYDRATION_BUDGET_MS =
// 1200 ms) antes de redirigir; si no llega a tiempo, sigue en after() y la
// ficha llega en el siguiente pintado. Se reintenta con recarga en vez de
// asumir que el primer render ya trae los datos — es justo el margen que pide
// la Task 12.
async function waitForRealFicha(
  page: Page,
): Promise<{ title: string; synopsisParagraph: import("@playwright/test").Locator }> {
  const heading = page.getByRole("heading", { level: 1 });
  const synopsisHeading = page.getByRole("heading", { name: "Sinopsis" });
  // El contenedor de InfoPanel: <div gap-4> > (<div justify-between> <h2/></div>, <p/>...)
  const synopsisBlock = synopsisHeading.locator("..").locator("..");

  for (let attempt = 0; attempt < 8; attempt++) {
    const title = (await heading.textContent())?.trim() ?? "";
    const hasNoSynopsisFallback = await synopsisBlock.getByText(NO_SYNOPSIS).count();
    const paragraph = synopsisBlock.locator("p").first();
    const synopsisText = (await paragraph.textContent().catch(() => null))?.trim() ?? "";

    if (title && title !== UNTITLED && hasNoSynopsisFallback === 0 && synopsisText.length > 0) {
      return { title, synopsisParagraph: paragraph };
    }

    await page.waitForTimeout(2_000);
    await page.reload();
  }

  // Se agotaron los reintentos: se devuelve el estado actual y que las
  // aserciones del test digan exactamente qué faltó.
  return { title: (await heading.textContent())?.trim() ?? "", synopsisParagraph: synopsisBlock.locator("p").first() };
}

test.describe("catálogo server-authoritative (#674)", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await setOnboardedAt(new Date().toISOString());
  });

  test("alta desde /buscar muestra la ficha con datos del proveedor (título y sinopsis reales)", async ({
    page,
  }) => {
    await setOnboardedAt(new Date().toISOString());
    await login(page);

    await page.goto("/buscar?type=movie");
    // TypePills son <Link>, no botones — confirma que el pill de Películas
    // está activo antes de buscar.
    await expect(page.getByRole("link", { name: "Películas" })).toBeVisible();

    await page.getByRole("searchbox").fill(MOVIE_QUERY);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/buscar\?.*q=/);

    // Primer resultado: tanto el <Link> (ya cacheado) como el <button>
    // (OpenResultButton, shell aún por crear) comparten la clase "group" en
    // search-result-card.tsx/open-result-button.tsx — no hace falta
    // distinguirlos, los dos acaban en la misma ficha.
    const firstResult = page.locator(".group").first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    // openCatalogItem redirige a /pelicula/<id> tras crear (o reutilizar,
    // register_catalog_item es idempotente) la shell y de intentar hidratarla
    // dentro del presupuesto. La fila de `movies` NO se limpia al terminar: a
    // diferencia de los usuarios/pases desechables de otros specs, el
    // catálogo es compartido y autoritativo por diseño (#674) — un título
    // real (aquí, uno bien conocido en TMDB) puede llegar ya cacheado de una
    // pasada anterior o de uso real, y borrarlo arrastraría los pases de
    // quien lo tenga en su biblioteca (`catalog_item_has_passes`, #272).
    await page.waitForURL(/\/pelicula\/[0-9a-f-]{36}/, { timeout: 30_000 });

    const { title, synopsisParagraph } = await waitForRealFicha(page);

    // Título real, no la shell vacía.
    expect(title).not.toBe("");
    expect(title).not.toBe(UNTITLED);

    // Sinopsis real y visible (no el fallback "Sin sinopsis disponible.").
    await expect(synopsisParagraph).toBeVisible();
    const synopsisText = (await synopsisParagraph.textContent())?.trim() ?? "";
    expect(synopsisText.length).toBeGreaterThan(10);
    expect(synopsisText).not.toBe(NO_SYNOPSIS);
  });
});
