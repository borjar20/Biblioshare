import { expect, test } from "@playwright/test";

// E2E de la galería de portadas oficiales del editor de ficha
// (CatalogEditorForm en src/components/detail/catalog-editor.tsx +
// fetchOfficialCovers/setOfficialCover en src/lib/catalog/edit-actions.ts).
// Solo cubre PELÍCULA aquí: necesita un tmdb_id real para que TMDB devuelva
// imágenes de verdad, y `movies` siempre tiene ese campo poblado por el
// importador. El mismo flujo (botón "Ver otras portadas" -> galería de
// <img src="https://image.tmdb.org/..."> -> clic -> cover_url persistida)
// aplica igual a /libro/[id] (OpenLibrary, covers.openlibrary.org) y a
// /serie/[id] (TMDB /tv), pero un libro puede no tener
// `openlibrary_work_key` en la semilla y eso lo haría un test frágil sin
// aportar cobertura nueva sobre la lógica ya probada aquí.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

type MovieRow = { id: string; tmdb_id: number; cover_url: string | null };

// Cuántas películas candidatas se prueban antes de rendirse. TMDB no
// garantiza más de un poster para cada tmdb_id de la semilla (algunas
// películas de nicho solo tienen la que ya está guardada) — probar varias es
// lo que hace el test robusto sin fijar un id concreto de la BD.
const MAX_CANDIDATES = 6;

test("galería de portadas oficiales: elegir una la persiste en cover_url", async ({ page, request }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(120_000);

  const listRes = await request.get(
    `${SUPABASE_URL}/rest/v1/movies?select=id,tmdb_id,cover_url&tmdb_id=not.is.null&limit=${MAX_CANDIDATES}`,
    { headers: adminHeaders() }
  );
  const candidates = (await listRes.json()) as MovieRow[];
  test.skip(candidates.length === 0, "No hay ninguna película con tmdb_id en la BD para probar la galería");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // Se elige, entre los candidatos, la primera película cuya galería
  // devuelva al menos una portada distinta de la ya guardada. `chosen`
  // guarda el movie y la url elegida solo cuando se decide seguir adelante
  // (nunca se hace clic en nada hasta entonces), así la limpieza del
  // `finally` solo toca la fila que el test de verdad mutó.
  let chosen: { movie: MovieRow; pickedUrl: string } | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const movie = candidates[i];
    await page.goto(`/pelicula/${movie.id}?editar=ficha`);

    const showCoversButton = page.getByRole("button", { name: "Ver otras portadas" });
    // `waitFor` con timeout acotado, no un `isVisible()` puntual: justo tras
    // navegar (y más con `next dev` recompilando en caliente) el botón puede
    // tardar unos segundos en hidratarse, y un chequeo instantáneo lo
    // confundiría con "no es collaborator+".
    const isEditorOpen = await showCoversButton
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    // Si el editor no se abre ni para el primer candidato, TEST_USER no es
    // collaborator+ en este entorno: no es un fallo del feature, se salta
    // entero en vez de recorrer el resto de candidatos en balde.
    test.skip(!isEditorOpen, "TEST_USER no es collaborator+ en este entorno: el editor de ficha no se abrió");

    await showCoversButton.click();
    await expect(page.getByRole("button", { name: "Ocultar portadas" })).toBeVisible();

    // TMDB es una llamada de red real (fetchOfficialCovers, sin mock de
    // acciones por instrucción explícita del encargo): se sondea con margen
    // en vez de esperar una única aserción instantánea, pero sin bloquear
    // para siempre si esta película en concreto no trae portadas.
    const officialThumbs = page.locator('button[aria-label="Cambiar"] img[src^="https://image.tmdb.org/"]');
    try {
      await expect.poll(async () => officialThumbs.count(), { timeout: 10_000 }).toBeGreaterThan(0);
    } catch {
      continue; // esta película no trajo ninguna portada oficial; probar la siguiente
    }

    const count = await officialThumbs.count();
    for (let j = 0; j < count; j++) {
      const src = await officialThumbs.nth(j).getAttribute("src");
      if (src && src !== movie.cover_url) {
        chosen = { movie, pickedUrl: src };
        await officialThumbs.nth(j).locator("xpath=ancestor::button[1]").click();
        break;
      }
    }
    if (chosen) break;
  }

  test.skip(
    chosen === null,
    `TMDB no devolvió ninguna portada distinta de la ya guardada para ninguno de los ${candidates.length} candidatos probados`
  );

  try {
    const { movie, pickedUrl } = chosen!;

    // setOfficialCover escribe cover_url directamente (allowlist de host +
    // update, sin pasar por Storage): la prueba de verdad es la fila real en
    // BD, no solo la ausencia de un texto de error en pantalla.
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/movies?id=eq.${movie.id}&select=cover_url`,
            { headers: adminHeaders() }
          );
          const rows = (await res.json()) as { cover_url: string | null }[];
          return rows[0]?.cover_url ?? null;
        },
        { timeout: 15_000 }
      )
      .toBe(pickedUrl);

    await expect(page.getByText(/errors\.generic|No se pudo/i)).toHaveCount(0);
  } finally {
    // Restaura la portada original tenga éxito o no el test: setOfficialCover
    // escribe directo en `movies.cover_url` y este movie no es desechable
    // (viene de la semilla real, no se crea ni se borra aquí).
    if (chosen) {
      await request.patch(`${SUPABASE_URL}/rest/v1/movies?id=eq.${chosen.movie.id}`, {
        headers: adminHeaders(),
        data: { cover_url: chosen.movie.cover_url },
      });
    }
  }
});
