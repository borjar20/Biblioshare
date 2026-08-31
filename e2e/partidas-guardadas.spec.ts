import { test, expect } from "@playwright/test";

// Fase 5 de BiblioPlay (#931, historial «Guardadas» local-first, spec §6-7):
// la UI lee SOLO IndexedDB y el sincronizador de fondo la iguala al servidor
// por detrás. Anónimo: sync es no-op sin sesión, así que este spec no toca
// red de Supabase — guardar es local, sin badge de subida y sin banner de
// adopción (esos casos con sesión quedan para cuando haya login e2e de Play).
// Mismo gate de móvil que partidas-puntuacion.spec.ts: aquí se interactúa con
// el tablero para poder finalizar una partida real.
test.use({ viewport: { width: 390, height: 844 } });

test("guardar una partida la lleva al historial; borrarla la quita", async ({ page }) => {
  // Arranque copiado de partidas-puntuacion.spec.ts: preset «Libre» por
  // defecto, jugar ya, una ronda mínima para poder finalizar.
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
