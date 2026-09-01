import { test, expect, type Page } from "@playwright/test";

// Fase 5 de BiblioPlay (#931, historial «Guardadas» local-first, spec §6-7):
// la UI lee SOLO IndexedDB y el sincronizador de fondo la iguala al servidor
// por detrás. Anónimo: sync es no-op sin sesión, así que este spec no toca
// red de Supabase — guardar es local, sin badge de subida y sin banner de
// adopción (esos casos con sesión quedan para cuando haya login e2e de Play).
// Mismo gate de móvil que partidas-puntuacion.spec.ts: aquí se interactúa con
// el tablero para poder finalizar una partida real.
test.use({ viewport: { width: 390, height: 844 } });

// Copiados verbatim de partidas-puntuacion.spec.ts (los specs de Playwright
// no comparten helpers; la duplicación es el patrón de la casa, ya lo hizo
// partidas-etiqueta-juego.spec.ts): la hoja de ronda es chips + steppers
// desde d594ffcb, ya no inputs con .fill().
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

test("guardar una partida la lleva al historial; borrarla la quita", async ({ page }) => {
  // Arranque copiado de partidas-puntuacion.spec.ts: preset «Libre» por
  // defecto, jugar ya, una ronda mínima para poder finalizar.
  await page.goto("/partidas/puntuacion");
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();

  await page.getByRole("button", { name: /^añadir ronda$/i }).click();
  await apuntarValores(page, [5, 3, 2, 1]);

  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /^finalizar la partida$/i }).click();
  await expect(page.getByRole("heading", { name: /gana jugador 1/i })).toBeVisible();

  // Guardar → aterriza en /partidas con el historial «Guardadas».
  await page.getByRole("button", { name: /^guardar partida$/i }).click();
  await expect(page).toHaveURL(/\/partidas$/);
  await expect(page.getByRole("heading", { name: "Guardadas" })).toBeVisible();

  const fila = page.getByRole("button", { name: /Ganó/ });
  await expect(fila).toBeVisible();
  await expect(page.getByText("Pendiente de subir")).toHaveCount(0); // anon: sin badge de subida
  await expect(page.getByText(/partidas? guardadas? en este dispositivo/)).toHaveCount(0); // sin banner de adopción

  // Abrir detalle → eliminar. El listener del diálogo se registra ANTES del
  // click que dispara el confirm (window.confirm de handleDelete).
  await fila.click();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar partida" }).click();
  await expect(page.getByText("Las partidas que guardes aparecerán aquí.")).toBeVisible();
});
