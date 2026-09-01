import { test, expect, type Page } from "@playwright/test";
import { waitForActiveRecord } from "./support/play-db";

// Puntuación por rondas, fase 4 de BiblioPlay (#931). Mismo gate de móvil que el
// resto de tableros de Play (partidas-mtg.spec.ts, partidas-persistencia.spec.ts):
// aquí SÍ se interactúa con el tablero (hoja de ronda, edición, deshacer), a
// diferencia de partidas-navegacion.spec.ts que solo cruza pantallas.
test.use({ viewport: { width: 390, height: 844 } });

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

test("configurar la mesa arrastra jugadores y N por query", async ({ page }) => {
  await page.goto("/partidas/puntuacion");
  await page.getByRole("button", { name: /a x puntos/i }).click();
  // El chooser arrastra jugadores y N por query (revisión 2026-08-31).
  await page.getByRole("link", { name: /^configurar la mesa$/i }).click();
  await expect(page).toHaveURL(/\/partidas\/puntuacion\/nueva\?preset=puntos&jugadores=4&n=100$/);
});

test("a X puntos: la banda de finalizar aparece al alcanzar el limite y no bloquea", async ({
  page,
}) => {
  // El preset prefija 100; se navega directo con n=20 para que dos rondas
  // basten para alcanzarlo (spec §5: el preset SOLO prefija, se puede tocar
  // -- aquí sin input, con el stepper solo hay −/+ y mantener).
  await page.goto("/partidas/puntuacion/nueva?preset=puntos&jugadores=4&n=20");
  await expect(page.getByLabel("Valor del límite").filter({ visible: true })).toHaveText("20");
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

test("config: Libre → Puntos con el stepper, y el juego tras el «+»", async ({ page }) => {
  await page.goto("/partidas/puntuacion/nueva");
  await expect(page.getByLabel("¿A qué jugáis?")).toHaveCount(0);
  await page.getByRole("button", { name: "Puntos", exact: true }).click();
  await page.getByRole("button", { name: "Subir límite" }).click();
  await expect(page.getByLabel("Valor del límite")).toHaveText("105");
  await page.getByRole("button", { name: "Otro juego" }).click();
  await page.getByLabel("¿A qué jugáis?").fill("Chinchón");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
});

test("reconfigurar desde dentro: la mesa llega prefijada y Empezar reinicia", async ({ page }) => {
  await page.goto("/partidas/puntuacion/nueva?preset=libre");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await nuevaRonda(page, [5, 3, 2, 1]);
  await expect(totalDe(page, 0)).toHaveText("5");

  // Hoja de partida → Reconfigurar: entra en la configuración SIN descartar.
  await page.getByRole("button", { name: /acciones de la partida/i }).click();
  await page.getByRole("button", { name: /reconfigurar la mesa/i }).click();
  await expect(page).toHaveURL(/\/partidas\/puntuacion\/nueva\?reconfigurar=1$/);
  // La mesa llega PUESTA: el nombre materializado al arrancar («Jugador 1»)
  // viene como VALOR del campo, no como placeholder — eso es el prefill. El
  // campo vive en el panel del asiento, que se abre tocando su ficha.
  await page.getByRole("button", { name: "Editar a Jugador 1" }).click();
  await expect(page.getByLabel("Nombre")).toHaveValue("Jugador 1");

  // Corregir un fallo (el nombre) y reiniciar.
  await page.getByLabel("Nombre").fill("Anna");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  // Partida NUEVA: sin rondas (el total vuelve a 0) y con el nombre corregido.
  // Acotado a la tabla: el DOM congelado de la ruta anterior conserva la ficha
  // del asiento, cuyo rótulo es también exactamente «Anna».
  await expect(page.getByRole("table").getByText("Anna")).toBeVisible();
  await expect(totalDe(page, 0)).toHaveText("0");
  await expect(page.getByRole("button", { name: "Editar ronda 1" })).toHaveCount(0);
});

test("la mesa de fichas cabe en movil con ocho asientos y el panel abierto", async ({ page }) => {
  // El caso más ancho de la pantalla: ocho fichas (envuelven) más el panel del
  // asiento, que lleva campo + «Quitar asiento» en la misma fila. Sin `min-w-0`
  // el campo no encoge y el panel desborda los 390px (mismo fallo que la bolsa
  // del Aleatorio).
  await page.goto("/partidas/puntuacion/nueva?jugadores=8");
  await page.getByRole("button", { name: "Editar a Jugador 8" }).click();
  await expect(page.getByLabel("Nombre")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth,
  );
  expect(overflow).toBe(0);

  // Con ocho asientos ya no cabe otro: la ficha «+» desaparece (MAX_PLAYERS).
  await expect(page.getByRole("button", { name: "Añadir jugador" })).toHaveCount(0);
});
