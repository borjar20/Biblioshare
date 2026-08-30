import { test, expect, type Page } from "@playwright/test";
import { waitForActiveRecord } from "./support/play-db";

// Puntuación por rondas, fase 4 de BiblioPlay (#931). Mismo gate de móvil que el
// resto de tableros de Play (partidas-mtg.spec.ts, partidas-persistencia.spec.ts):
// aquí SÍ se interactúa con el tablero (hoja de ronda, edición, deshacer), a
// diferencia de partidas-navegacion.spec.ts que solo cruza pantallas.
test.use({ viewport: { width: 390, height: 844 } });

/** Abre la hoja de ronda (alta o edición ya abierta por el llamador), rellena una
 *  puntuación por jugador en orden de asiento y confirma con «Apuntar». */
async function apuntarValores(page: Page, scores: number[]) {
  for (let seat = 0; seat < scores.length; seat++) {
    await page.getByLabel(`Puntos de Jugador ${seat + 1}`).fill(String(scores[seat]));
  }
  await page.getByRole("button", { name: /^apuntar$/i }).click();
}

/** Alta de una ronda nueva completa: abre la hoja desde «Añadir ronda» y apunta. */
async function nuevaRonda(page: Page, scores: number[]) {
  await page.getByRole("button", { name: /^añadir ronda$/i }).click();
  await apuntarValores(page, scores);
}

/** Celda de total de un asiento (0-based): última columna de su fila. */
function totalDe(page: Page, seat: number) {
  return page.locator("tbody tr").nth(seat).locator("td").last();
}

test("partida completa: preset, 3 rondas, editar, deshacer, finalizar, guardar", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: /puntuación por rondas/i }).click();
  await expect(page).toHaveURL(/\/partidas\/puntuacion$/);

  // El preset «Libre» ya viene seleccionado por defecto; se toca explícito de
  // todos modos porque es el paso que describe el enunciado.
  await page.getByRole("button", { name: /libre/i }).click();
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();

  // Tres rondas, valores distintos por jugador.
  await nuevaRonda(page, [5, 3, 2, 1]);
  await nuevaRonda(page, [4, 6, 1, 2]);
  await nuevaRonda(page, [3, 2, 5, 1]);

  // Totales: p1=12, p2=11, p3=8, p4=4.
  await expect(totalDe(page, 0)).toHaveText("12");
  await expect(totalDe(page, 1)).toHaveText("11");
  await expect(totalDe(page, 2)).toHaveText("8");
  await expect(totalDe(page, 3)).toHaveText("4");

  // Tocar cualquier celda de la columna R2 abre su edición (el evento es LA
  // RONDA entera, no la celda).
  await page.getByRole("button", { name: "Editar ronda 2" }).first().click();
  await apuntarValores(page, [14, 6, 1, 2]);

  // p1 pasa de 12 a 22 (5+14+3): el total cambia.
  await expect(totalDe(page, 0)).toHaveText("22");

  // Deshacer desde la hoja de partida revierte la edición entera. La etiqueta
  // dice QUÉ deshace (mismo criterio que mtg): «Ronda 2 editada».
  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  const undo = page.getByRole("button", { name: /^Deshacer: Ronda 2 editada$/i });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(totalDe(page, 0)).toHaveText("12");

  // Finalizar -> resumen con el ganador correcto según los totales (Jugador 1, 12).
  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /^finalizar la partida$/i }).click();
  await expect(page.getByRole("heading", { name: /gana jugador 1/i })).toBeVisible();

  // Guardar partida: vuelve a /partidas sin banner de partida en curso, y la
  // activa se borra de IndexedDB de verdad.
  await waitForActiveRecord(page, (r) => r !== null);
  await page.getByRole("button", { name: /^guardar partida$/i }).click();
  await expect(page).toHaveURL(/\/partidas$/);
  await expect(page.getByRole("link", { name: /partida en curso/i })).toHaveCount(0);
  expect(await waitForActiveRecord(page, (r) => r === null)).toBeNull();
});

test("una partida de puntuacion sobrevive al reload", async ({ page }) => {
  await page.goto("/partidas/puntuacion");
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();

  await nuevaRonda(page, [5, 3, 2, 1]);
  await nuevaRonda(page, [4, 6, 1, 2]);
  await expect(totalDe(page, 0)).toHaveText("9");

  await page.reload();

  // El tablero real (hidratado) vuelve con la misma cifra, no un tablero vacío.
  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();
  await expect(totalDe(page, 0)).toHaveText("9");
});

test("a X puntos: la banda de finalizar aparece al alcanzar el limite y no bloquea", async ({
  page,
}) => {
  await page.goto("/partidas/puntuacion");
  await page.getByRole("button", { name: /a x puntos/i }).click();
  await page.getByRole("link", { name: /^configurar la mesa$/i }).click();
  // El chooser arrastra jugadores y N por query (revisión 2026-08-31).
  await expect(page).toHaveURL(/\/partidas\/puntuacion\/nueva\?preset=puntos&jugadores=4&n=100$/);

  // El preset prefija 100; se cambia a 20 para que dos rondas basten para
  // alcanzarlo (spec §5: el preset SOLO prefija, se puede tocar).
  // `filter({ visible: true })`: el input del chooser sigue en el DOM de la
  // ruta anterior (la isla se congela en navegación soft) con el mismo
  // aria-label — sin el filtro el locator resuelve a dos.
  await page.getByLabel("Valor del límite").filter({ visible: true }).fill("20");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();

  await expect(page.getByText(/se alcanzó el límite/i)).toHaveCount(0);

  await nuevaRonda(page, [15, 5, 8, 3]);
  await nuevaRonda(page, [6, 10, 9, 4]);
  // p1 llega a 21 (>= 20): la banda informativa aparece.
  await expect(page.getByText(/se alcanzó el límite/i)).toBeVisible();

  // Con la banda visible, añadir OTRA ronda sigue funcionando: el límite es
  // informativo, no bloquea la mesa (spec §2/§4). Valores no nulos para que
  // el assert no pueda colar un submit que en realidad no hizo nada.
  await nuevaRonda(page, [1, 1, 1, 1]);
  await expect(totalDe(page, 0)).toHaveText("22");
  await expect(page.getByText(/se alcanzó el límite/i)).toBeVisible();
  // Control de que la ronda 3 realmente aterrizó (no solo que el total cambió).
  await expect(page.getByRole("button", { name: "Editar ronda 3" }).first()).toBeVisible();

  // Finalizar desde el botón de la propia banda.
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /gana jugador 1/i })).toBeVisible();
});
