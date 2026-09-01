import { test, expect } from "@playwright/test";

// Acompañante «Aleatorio» (spec randomizer). Anónimo: sin red de Supabase que
// montar — la identidad solo aísla la clave de IDB. Viewport móvil como el
// resto de suites de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("dados y moneda: resultado, feed, deshacer y recarga", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await expect(page.getByRole("heading", { name: "Aleatorio" })).toBeVisible();

  // Reposo: hint que centra el escenario. Tirar = tocar el dado.
  await expect(page.getByText("Toca el dado para tirar")).toBeVisible();
  await page.getByRole("button", { name: "Tirar el dado" }).click();
  await expect(page.getByTestId("dice-result")).toBeVisible();
  await expect(page.getByText("Toca el dado para tirar")).toHaveCount(0);

  // 3d6 vía stepper: el resultado formatea "a + b + c = total". El "+" solo
  // aparece en tiradas múltiples — el "4 = 4" viejo no lo satisface.
  await page.getByRole("button", { name: "Un dado más" }).click();
  await page.getByRole("button", { name: "Un dado más" }).click();
  await page.getByRole("button", { name: "Tirar 3d6" }).click();
  await expect(page.getByTestId("dice-result")).toContainText("+");

  // 3 monedas: recuento "N caras, M cruces" — solo el formato múltiple lleva
  // dígitos (el singular es "Cara"/"Cruz" a secas).
  await page.getByRole("tab", { name: "Moneda" }).click();
  await page.getByRole("button", { name: "Una moneda más" }).click();
  await page.getByRole("button", { name: "Una moneda más" }).click();
  await page.getByRole("button", { name: "Lanzar 3 monedas" }).click();
  await expect(page.getByTestId("coin-result")).toContainText(/\d/);

  // El feed acumula los tres resultados; deshacer quita el último (las monedas).
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

  // Mismo selector de fichas que Reloj, Recursos y Turnos: el input vive tras
  // la ficha «+» y el alta se confirma con Enter (SeatPicker).
  for (const name of ["Ana", "Beto", "Carla", "Dario"]) {
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByLabel("Nombre del jugador").press("Enter");
  }

  await page.getByRole("button", { name: /^primer jugador$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText(/Ana|Beto|Carla|Dario/);

  await page.getByRole("button", { name: /^orden aleatorio$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("1.");

  await page.getByLabel("Número de equipos").fill("2");
  await page.getByRole("button", { name: /^equipos$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("Equipo 1");
});

test("bolsa sin reemplazo se agota, se desactiva y se reinicia", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await page.getByRole("tab", { name: "Bolsa" }).click();

  // Sin scroll lateral en móvil: el input de nombre debe poder encoger
  // (min-w-0) o el formulario de añadir desborda el viewport de 390px. Se
  // abre el «+» antes de medir para que la fila del input esté cubierta.
  await page.getByRole("button", { name: "Añadir tipo" }).click();
  const overflow = await page.evaluate(
    () => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth,
  );
  expect(overflow).toBe(0);
  await page.getByRole("button", { name: "Añadir tipo" }).click();

  for (const tipo of ["Rojo", "Azul"]) {
    await page.getByRole("button", { name: "Añadir tipo" }).click();
    await page.getByLabel("Tipo de ficha").fill(tipo);
    await page.getByRole("button", { name: /^añadir$/i }).click();
  }

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
  await page.getByRole("button", { name: "Tirar el dado" }).click();
  await expect(page.getByTestId("dice-result")).toBeVisible();

  // ...y la partida sigue viva: el hub enseña el banner de partida en curso
  // (ActiveGameBanner, active-game-banner.tsx). El enlace es la mesa entera
  // y su nombre accesible acumula todos los textos internos, incluido el CTA
  // "Seguir" (play.resume) — no "continuar", que no existe en la copia real.
  await page.goto("/partidas");
  await expect(page.getByRole("link", { name: /seguir/i })).toBeVisible();
});

test("con reduced motion el resultado aparece al instante", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/partidas/aleatorio");
  await page.getByRole("button", { name: "Tirar el dado" }).click();
  // Sin teatro: nada de esperar los ~900 ms del cubo.
  await expect(page.getByTestId("dice-result")).toBeVisible({ timeout: 1500 });
});
