import { test, expect } from "@playwright/test";

// Acompañante «Aleatorio» (spec randomizer). Anónimo: sin red de Supabase que
// montar — la identidad solo aísla la clave de IDB. Viewport móvil como el
// resto de suites de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("dados y moneda: resultado, feed, deshacer y recarga", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await expect(page.getByRole("heading", { name: "Aleatorio" })).toBeVisible();

  await page.getByRole("button", { name: "d6", exact: true }).click();
  await expect(page.getByTestId("dice-result")).toBeVisible();

  // Tirada libre 3d6: el resultado formatea "a + b + c = total".
  await page.getByLabel("Cuántos").fill("3");
  await page.getByLabel("Caras").fill("6");
  await page.getByRole("button", { name: /^tirar$/i }).click();
  await expect(page.getByTestId("dice-result")).toContainText("=");

  await page.getByRole("tab", { name: "Moneda" }).click();
  await page.getByRole("button", { name: /^lanzar moneda$/i }).click();
  await expect(page.getByTestId("coin-result")).toHaveText(/^(Cara|Cruz)$/);

  // El feed acumula los tres resultados; deshacer quita el último (la moneda).
  const feed = page.locator('section[aria-label="Últimos resultados"] li');
  await expect(feed).toHaveCount(3);
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(feed).toHaveCount(2);

  // El estado sobrevive a una recarga (store companion en IDB).
  await page.reload();
  await expect(page.locator('section[aria-label="Últimos resultados"] li')).toHaveCount(2);

  // Limpiar todo (dos toques) vacía el feed; deshacer el cleared lo recupera.
  await page.getByRole("button", { name: /^limpiar todo$/i }).click();
  await page.getByRole("button", { name: /borra todo/i }).click();
  await expect(page.locator('section[aria-label="Últimos resultados"] li')).toHaveCount(0);
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(page.locator('section[aria-label="Últimos resultados"] li')).toHaveCount(2);
});

test("jugadores: primero, orden y equipos", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await page.getByRole("tab", { name: "Jugadores" }).click();

  for (const name of ["Ana", "Beto", "Carla", "Dario"]) {
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByRole("button", { name: /^añadir$/i }).click();
  }

  await page.getByRole("button", { name: /^primer jugador$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText(/Ana|Beto|Carla|Dario/);

  await page.getByRole("button", { name: /^orden aleatorio$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("Orden:");

  await page.getByLabel("Número de equipos").fill("2");
  await page.getByRole("button", { name: /^equipos$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("Equipos:");
});

test("bolsa sin reemplazo se agota, se desactiva y se reinicia", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await page.getByRole("tab", { name: "Bolsa" }).click();

  await page.getByLabel("Tipo de ficha").fill("Rojo");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: /^añadir$/i }).click();
  await page.getByLabel("Tipo de ficha").fill("Azul");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: /^añadir$/i }).click();

  await expect(page.getByText("Quedan 2")).toBeVisible();
  await page.getByRole("button", { name: /^sacar ficha$/i }).click();
  await page.getByRole("button", { name: /^sacar ficha$/i }).click();
  await expect(page.getByText("Quedan 0")).toBeVisible();
  await expect(page.getByRole("button", { name: /^sacar ficha$/i })).toBeDisabled();

  await page.getByRole("button", { name: /^reiniciar bolsa$/i }).click();
  await expect(page.getByText("Quedan 2")).toBeVisible();
});

test("convive con una partida de puntuación activa", async ({ page }) => {
  // Arrancar una partida real («jugar ya» del sub-hub de puntuación)...
  await page.goto("/partidas/puntuacion");
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // ...usar el Aleatorio en medio...
  await page.goto("/partidas/aleatorio");
  await page.getByRole("button", { name: "d6", exact: true }).click();
  await expect(page.getByTestId("dice-result")).toBeVisible();

  // ...y la partida sigue viva: el hub enseña el banner de partida en curso
  // (ActiveGameBanner, active-game-banner.tsx). El enlace es la mesa entera
  // y su nombre accesible acumula todos los textos internos, incluido el CTA
  // "Seguir" (play.resume) — no "continuar", que no existe en la copia real.
  await page.goto("/partidas");
  await expect(page.getByRole("link", { name: /seguir/i })).toBeVisible();
});
