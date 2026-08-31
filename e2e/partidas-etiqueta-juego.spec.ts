import { test, expect } from "@playwright/test";

// Etiqueta de juego en puntuación (#931, spec §2-§6, Task 5). La etiqueta viaja
// en el LOG (gameName en setup + evento game_labeled) hasta el resumen, el
// historial «Guardadas» y los chips de "a qué jugáis" del siguiente setup --
// nunca se edita a mano el summary guardado (decisiones.md 2026-08-31).
// Anónimo, mismo criterio que partidas-guardadas.spec.ts: guardar es local,
// sin red de Supabase que montar. Viewport móvil porque ambos guiones
// interactúan con el tablero real para poder finalizar una partida.
test.use({ viewport: { width: 390, height: 844 } });

test("la etiqueta viaja del setup al historial y los chips la recuerdan", async ({ page }) => {
  await page.goto("/partidas/puntuacion/nueva");
  await page.getByLabel("¿A qué jugáis?").fill("UNO");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // El header del tablero muestra el juego etiquetado en vez del nombre
  // genérico de la herramienta ("Puntuación por rondas").
  await expect(page.locator("header b")).toHaveText("UNO");

  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();
  await page.getByRole("button", { name: /^añadir ronda$/i }).click();
  await page.getByLabel("Puntos de Jugador 1").fill("5");
  await page.getByLabel("Puntos de Jugador 2").fill("3");
  await page.getByLabel("Puntos de Jugador 3").fill("2");
  await page.getByLabel("Puntos de Jugador 4").fill("1");
  await page.getByRole("button", { name: /^apuntar$/i }).click();

  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /^finalizar la partida$/i }).click();
  await expect(page.getByRole("heading", { name: /gana jugador 1/i })).toBeVisible();

  // Resumen: la etiqueta viaja sola, sin tocar "Añadir juego" -- ese botón
  // solo aparece cuando NO hay etiqueta (segundo test).
  await expect(page.getByText("UNO", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar juego" })).toBeVisible();

  // "Guardar partida" (finalizar el guardado) vs "Guardar" (confirmar la
  // edición de etiqueta, scoreSummary.saveGame) son botones distintos que
  // coexisten en esta pantalla -- match exacto/anclado para no confundirlos.
  await page.getByRole("button", { name: /^guardar partida$/i }).click();
  await expect(page).toHaveURL(/\/partidas$/);
  await expect(page.getByRole("heading", { name: "Guardadas" })).toBeVisible();

  const fila = page.getByRole("button", { name: /UNO/ });
  await expect(fila).toBeVisible();

  // Volver al setup con una navegación dura (evita el DOM congelado de una
  // transición blanda): el chip de "juegos anteriores" recuerda UNO y, al
  // tocarlo, rellena el campo.
  await page.goto("/partidas/puntuacion/nueva");
  const chips = page.locator('[aria-label="Juegos anteriores"]');
  await expect(chips.getByRole("button", { name: "UNO" })).toBeVisible();
  await chips.getByRole("button", { name: "UNO" }).click();
  await expect(page.getByLabel("¿A qué jugáis?")).toHaveValue("UNO");
});

test("añadir la etiqueta desde el resumen de una partida sin ella", async ({ page }) => {
  // Arranque sin etiqueta, patrón de partidas-guardadas.spec.ts: preset
  // «Libre» por defecto, jugar ya, una ronda mínima para poder finalizar.
  await page.goto("/partidas/puntuacion");
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();

  await page.getByRole("button", { name: /^añadir ronda$/i }).click();
  await page.getByLabel("Puntos de Jugador 1").fill("5");
  await page.getByLabel("Puntos de Jugador 2").fill("3");
  await page.getByLabel("Puntos de Jugador 3").fill("2");
  await page.getByLabel("Puntos de Jugador 4").fill("1");
  await page.getByRole("button", { name: /^apuntar$/i }).click();

  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /^finalizar la partida$/i }).click();
  await expect(page.getByRole("heading", { name: /gana jugador 1/i })).toBeVisible();

  // Sin etiqueta: solo "Añadir juego" (nunca "Editar juego").
  await page.getByRole("button", { name: "Añadir juego" }).click();
  await page.getByRole("textbox").fill("Chinchón");
  // Confirmar con el "Guardar" de la edición de etiqueta -- match exacto, no
  // el "Guardar partida" de más abajo en la misma pantalla.
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(page.getByText("Chinchón", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar juego" })).toBeVisible();

  await page.getByRole("button", { name: /^guardar partida$/i }).click();
  await expect(page).toHaveURL(/\/partidas$/);

  const fila = page.getByRole("button", { name: /Chinchón/ });
  await expect(fila).toBeVisible();
});
