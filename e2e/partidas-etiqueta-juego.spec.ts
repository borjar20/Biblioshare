import { test, expect, type Page } from "@playwright/test";

// Etiqueta de juego en puntuación (#931, spec §2-§6, Task 5). La etiqueta viaja
// en el LOG (gameName en setup + evento game_labeled) hasta el resumen, el
// historial «Guardadas» y los chips de "a qué jugáis" del siguiente setup --
// nunca se edita a mano el summary guardado (decisiones.md 2026-08-31).
// Anónimo, mismo criterio que partidas-guardadas.spec.ts: guardar es local,
// sin red de Supabase que montar. Viewport móvil porque ambos guiones
// interactúan con el tablero real para poder finalizar una partida.
test.use({ viewport: { width: 390, height: 844 } });

// La hoja de ronda usa chips (+20/+10/+5/-5/-10) y ±1, no inputs (d594ffcb).
// Helpers duplicados de partidas-puntuacion.spec.ts -- los specs de Playwright
// no comparten helpers, y son solo dos funciones pequeñas.
/** Compone `target` para un asiento con chips (+20/+10/+5/−5/−10) y ±1. */
async function ponerPuntos(page: Page, seat: number, target: number) {
  const name = `Jugador ${seat + 1}`;
  await page.getByRole("button", { name: `Puntuar a ${name}` }).click();
  let value = Number(await page.getByLabel(`Puntos de ${name}`).textContent());
  const chip = async (label: string) =>
    page.getByRole("button", { name: `Sumar ${label} a ${name}` }).click();
  while (target - value >= 20) { await chip("+20"); value += 20; }
  while (target - value >= 10) { await chip("+10"); value += 10; }
  while (target - value >= 5) { await chip("+5"); value += 5; }
  while (value - target >= 10) { await chip("-10"); value -= 10; }
  while (value - target >= 5) { await chip("-5"); value -= 5; }
  while (value < target) { await page.getByRole("button", { name: `Sumar uno a ${name}` }).click(); value++; }
  while (value > target) { await page.getByRole("button", { name: `Restar uno a ${name}` }).click(); value--; }
  await expect(page.getByLabel(`Puntos de ${name}`)).toHaveText(String(target));
}

/** Hoja de ronda ya abierta: pone cada puntuación en orden de asiento y confirma. */
async function apuntarValores(page: Page, scores: number[]) {
  for (let seat = 0; seat < scores.length; seat++) {
    await ponerPuntos(page, seat, scores[seat]);
  }
  await page.getByRole("button", { name: /^apuntar$/i }).click();
}

test("la etiqueta viaja del setup al historial y los chips la recuerdan", async ({ page }) => {
  await page.goto("/partidas/puntuacion/nueva");
  // El campo vive tras el «+» (juguete sobre formulario, spec visual-first §5).
  await page.getByRole("button", { name: "Otro juego" }).click();
  await page.getByLabel("¿A qué jugáis?").fill("UNO");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // El header del tablero muestra el juego etiquetado en vez del nombre
  // genérico de la herramienta ("Puntuación por rondas").
  await expect(page.locator("header b")).toHaveText("UNO");

  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();
  await page.getByRole("button", { name: /^añadir ronda$/i }).click();
  await apuntarValores(page, [5, 3, 2, 1]);

  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /^finalizar la partida$/i }).click();
  await expect(page.getByRole("heading", { name: /gana jugador 1/i })).toBeVisible();

  // Resumen: la etiqueta viaja sola, sin tocar "Añadir juego" -- ese botón
  // solo aparece cuando NO hay etiqueta (segundo test). El DOM congelado de
  // la ruta anterior (#1003, mismo criterio que
  // partidas-puntuacion.spec.ts:191-193) vive dentro del MISMO <main> que el
  // resumen -- no hay landmark que lo separe -- y conserva el chip "UNO" del
  // picker de "juegos anteriores". Acotado al <p> que envuelve "Editar
  // juego" (único, sin homólogo congelado) para desambiguar.
  const etiquetaResumen = page.locator("p").filter({ has: page.getByRole("button", { name: "Editar juego" }) });
  await expect(etiquetaResumen.getByText("UNO", { exact: true })).toBeVisible();
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
  // tocarlo, rellena el campo (el «+» solo abre el disclosure para mirar el
  // valor confirmado -- tocar el chip ya basta para fijarlo).
  await page.goto("/partidas/puntuacion/nueva");
  const chips = page.locator('[aria-label="Juegos anteriores"]');
  await expect(chips.getByRole("button", { name: "UNO" })).toBeVisible();
  await chips.getByRole("button", { name: "UNO" }).click();
  await page.getByRole("button", { name: "Otro juego" }).click();
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
  await apuntarValores(page, [5, 3, 2, 1]);

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
