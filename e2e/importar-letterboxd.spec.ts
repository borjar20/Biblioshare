import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// «Pan's Labyrinth» es el caso que la PR #356 no cubría: Letterboxd exporta el
// título INGLÉS y TMDB no lo tiene ni en `title` (es-ES) ni en `original_title`
// — los dos son «El laberinto del fauno». Tiene que casar solo.
const TMDB_LABERINTO = 1417;
// «The Visit (2015)» son varias películas en TMDB: nadie debe elegir por el
// usuario. Estos son los ids que pueden acabar creados al elegir en el triaje.
const TMDB_VISITAS = [298312, 769428, 308063, 943649, 458631, 459990];

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function userId(): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=user_id&username=eq.${USERNAME}`,
    { headers: adminHeaders() },
  );
  return ((await res.json()) as { user_id: string }[])[0].user_id;
}

async function movieIdsByTmdb(tmdbIds: number[]): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/movies?select=id&tmdb_id=in.(${tmdbIds.join(",")})`,
    { headers: adminHeaders() },
  );
  return ((await res.json()) as { id: string }[]).map((m) => m.id);
}

async function passesFor(tmdbIds: number[]): Promise<number> {
  const movieIds = await movieIdsByTmdb(tmdbIds);
  if (movieIds.length === 0) return 0;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?select=id&user_id=eq.${await userId()}` +
      `&item_type=eq.movie&item_id=in.(${movieIds.join(",")})`,
    { headers: adminHeaders() },
  );
  return ((await res.json()) as unknown[]).length;
}

// El spec importa de verdad: deja pases del usuario de prueba. Se limpian para
// que la siguiente corrida vuelva a partir de cero (si no, la segunda vez todo
// sale «Ya en tu biblioteca» y el spec deja de probar nada). SIEMPRE filtrando
// por user_id: la base de dev tiene más cuentas.
async function limpiarPases() {
  const movieIds = await movieIdsByTmdb([TMDB_LABERINTO, ...TMDB_VISITAS]);
  if (movieIds.length === 0) return;
  await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${await userId()}` +
      `&item_type=eq.movie&item_id=in.(${movieIds.join(",")})`,
    { method: "DELETE", headers: adminHeaders() },
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("importar un diario de Letterboxd", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(180_000);

  test.beforeEach(limpiarPases);
  test.afterEach(limpiarPases);

  test("casa el título inglés solo y deja elegir cuando hay varios candidatos", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/importar");

    await page.setInputFiles(
      'input[type="file"]',
      path.join(__dirname, "fixtures", "letterboxd-diary-min.csv"),
    );
    await page.getByRole("button", { name: "Subir archivo" }).click();

    // El triaje tarda: cada fila dispara búsquedas contra TMDB.
    const triaje = page.getByRole("heading", {
      name: "Varias coincidencias: elige cuál era",
    });
    await expect(triaje).toBeVisible({ timeout: 150_000 });

    // «Pan's Labyrinth» no pide desempate: se importó sola, con su ficha en
    // español. Esto es lo que fallaba antes de esta PR.
    expect(await passesFor([TMDB_LABERINTO])).toBe(1);
    await expect(page.getByText("El laberinto del fauno")).toHaveCount(0);

    // «The Visit» sí, y hasta que el usuario elija no se ha escrito NADA.
    expect(await passesFor(TMDB_VISITAS)).toBe(0);

    const tarjeta = page.locator("li", { hasText: "The Visit (2015)" }).first();
    await tarjeta.getByRole("button").first().click();

    await expect(page.getByText(/The Visit — añadido/)).toBeVisible();
    expect(await passesFor(TMDB_VISITAS)).toBe(1);
  });
});
