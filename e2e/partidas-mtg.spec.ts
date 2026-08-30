import { test, expect, type Page } from "@playwright/test";
import { allEvents, waitForActiveRecord } from "./support/play-db";

// La mesa se juega en móvil: ese es el gate de la fase 1 (#931).
test.use({ viewport: { width: 390, height: 844 } });

async function empezarPartida(page: Page) {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  // Espera a que el tablero esté vivo, no solo la URL.
  await expect(page.getByLabel("Vidas de Jugador 1")).toBeVisible();
}

test("una vida menos en UN toque, y el tablero se come el marco", async ({ page }) => {
  await empezarPartida(page);

  // Es la única pantalla de la app sin topbar ni barra de cinco.
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^inicio$/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
});

test("deshacer dice QUÉ deshace, y lo deshace", async ({ page }) => {
  await empezarPartida(page);
  await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();

  // La etiqueta no puede perder el «qué»: sin ella hay que pulsar y mirar.
  const undo = page.getByRole("button", { name: /^Deshacer:/ });
  await expect(undo).toHaveAttribute("aria-label", /Jugador 1/);

  await undo.click();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("40");
});

test("la ráfaga funde los toques seguidos en un solo evento", async ({ page }) => {
  await empezarPartida(page);
  const menos = page.getByRole("button", { name: "Quitar una vida a Jugador 2" });
  await menos.click();
  await menos.click();
  await menos.click();

  await expect(page.getByLabel("Vidas de Jugador 2")).toHaveText("37");

  // Un `life_changed` de -3, no tres de -1: es lo que hace que deshacer no vaya de
  // uno en uno.
  const record = await waitForActiveRecord(page, (r) =>
    !!r && allEvents(r).some((e) => e.type === "life_changed"),
  );
  const eventos = allEvents(record!);
  const vidas = eventos.filter((e) => e.type === "life_changed");
  expect(vidas).toHaveLength(1);
  expect(vidas[0].payload).toMatchObject({ target: "p2", delta: -3 });
});

test("la partida sobrevive a cerrar la pestaña", async ({ page }) => {
  await empezarPartida(page);
  await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

  await page.reload();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
});

test("daño de comandante: la celda ES el control — cada toque +1, y la ráfaga es un evento", async ({
  page,
}) => {
  await empezarPartida(page);

  await page.getByRole("button", { name: "Daño de comandante de Jugador 1" }).click();

  // El comandante PROPIO también está en la rejilla (puede hacerte los 21), marcado
  // como «tuyo» y al final.
  await expect(page.getByText("tuyo")).toBeVisible();

  const celda = page.getByRole("button", { name: "Jugador 2 +1" });
  for (let i = 0; i < 5; i++) await celda.click();

  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("35");

  const record = await waitForActiveRecord(page, (r) =>
    !!r && allEvents(r).some((e) => e.type === "commander_damage"),
  );
  const eventos = allEvents(record!);
  const dmg = eventos.filter((e) => e.type === "commander_damage");
  expect(dmg).toHaveLength(1);
  // La fuente es el COMANDANTE, no el jugador: son 21 de cada uno por separado.
  expect(dmg[0].payload).toMatchObject({ source: "p2-c1", target: "p1", delta: 5 });
});

test("mantener pulsada la celda revela las mitades, y la izquierda resta", async ({ page }) => {
  await empezarPartida(page);
  await page.getByRole("button", { name: "Daño de comandante de Jugador 1" }).click();

  const celda = page.getByRole("button", { name: "Jugador 2 +1" });
  await celda.click();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

  // Pulsación larga (el click va con el botón 600 ms apretado): expande la celda en
  // dos mitades SIN sumar de rebote.
  await celda.click({ delay: 600 });
  const menos = page.getByRole("button", { name: "Jugador 2 −1" });
  await expect(menos).toBeVisible();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

  await menos.click();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("40");
});

test("21 de un mismo comandante se avisa, pero no elimina a nadie", async ({ page }) => {
  await empezarPartida(page);
  await page.getByRole("button", { name: "Daño de comandante de Jugador 1" }).click();
  const celda = page.getByRole("button", { name: "Jugador 2 +1" });
  for (let i = 0; i < 21; i++) await celda.click();
  await page.getByRole("button", { name: "Cerrar" }).click();

  // El botón queda en estado letal, pero el jugador sigue en la mesa: avisa, no
  // elimina — la decisión es de la mesa.
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("19");
  // Espera a que la ráfaga entera (21 toques fundidos en un evento) haya
  // aterrizado en IDB antes de comprobar la ausencia: si se lee a mitad de
  // ráfaga, la ausencia de `player_eliminated` no prueba nada.
  const record = await waitForActiveRecord(page, (r) =>
    !!r &&
    allEvents(r).some((e) => e.type === "commander_damage" && (e.payload as { delta?: number }).delta === 21),
  );
  const eventos = allEvents(record!);
  expect(eventos.some((e) => e.type === "player_eliminated")).toBe(false);
});

test("el turno pasa en un toque y nombra a quien le toca", async ({ page }) => {
  await empezarPartida(page);
  const turno = page.getByRole("button", { name: "Pasar el turno a Jugador 2" });
  await turno.click();
  await expect(page.getByRole("button", { name: "Pasar el turno a Jugador 3" })).toBeVisible();
});

test("terminar y revancha: la mesa vuelve puesta y el turno rota un asiento", async ({ page }) => {
  await empezarPartida(page);

  await page.getByRole("button", { name: "Acciones de Jugador 2" }).click();
  await page.getByRole("button", { name: /gana la partida/i }).click();

  await expect(page.getByRole("heading", { name: /gana jugador 2/i })).toBeVisible();

  await page.getByRole("button", { name: /^revancha$/i }).click();
  await expect(page).toHaveURL(/revancha=1/);
  await expect(page.getByText(/ahora empieza jugador 2/i)).toBeVisible();

  // Revancha NO descarta: la partida terminada sigue ahí hasta que arranque otra.
  expect(await waitForActiveRecord(page, (r) => r !== null)).not.toBeNull();
});

test("el selector manda sobre la orientación: «tumbado» gira el tablero sin girar el móvil", async ({
  page,
}) => {
  await empezarPartida(page);

  // El viewport es vertical (390x844) y el giro del sistema da igual: elegir un
  // preset tumbado contra-rota el escenario entero por CSS.
  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /en filas · móvil tumbado/i }).click();
  await page.getByRole("button", { name: "Cerrar" }).click();

  await expect(page.locator("[data-rotated]")).toHaveCount(1);

  // Y el tablero girado sigue siendo un instrumento, no un dibujo: los toques
  // atraviesan el transform.
  await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");

  // Volver a «de pie» deshace el giro.
  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /en filas · móvil de pie/i }).click();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.locator("[data-rotated]")).toHaveCount(0);
});

test("salir de la mesa conserva la partida, y el hub la ofrece para seguir", async ({ page }) => {
  await empezarPartida(page);
  await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();

  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /salir de la mesa/i }).click();
  await expect(page).toHaveURL(/\/partidas$/);

  // Salir NO es descartar: la partida sigue guardada y el hub la ofrece.
  expect(await waitForActiveRecord(page, (r) => r !== null)).not.toBeNull();
  await expect(page.getByRole("link", { name: /partida en curso/i })).toBeVisible();
});

test("descartar borra la partida y deja el vacío con salida", async ({ page }) => {
  await empezarPartida(page);
  // Precondición: el registro EXISTE antes de descartar. Sin esto, si la
  // escritura inicial aún no aterrizó, el assert final de null pasaría sin
  // que deleteActive corriera — el mismo "pase accidental" que se arregló.
  await waitForActiveRecord(page, (r) => r !== null);
  await page.getByRole("button", { name: "Acciones de la partida" }).click();
  await page.getByRole("button", { name: /^descartar la partida$/i }).click();
  // Dos toques: borra la partida entera y no hay deshacer que la traiga.
  await page.getByRole("button", { name: /se borra la partida entera/i }).click();

  await expect(page.getByText(/no hay ninguna partida en curso/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /ir a partidas/i })).toBeVisible();
  expect(await waitForActiveRecord(page, (r) => r === null)).toBeNull();
});

test("accesibilidad del tablero: orden de asientos, etiquetas y una sola región que anuncia", async ({
  page,
}) => {
  await empezarPartida(page);

  // La rotación es solo visual: el orden del DOM es el de asientos.
  const nombres = await page
    .getByRole("button", { name: /^Acciones de Jugador/ })
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(nombres).toEqual([
    "Acciones de Jugador 1",
    "Acciones de Jugador 2",
    "Acciones de Jugador 3",
    "Acciones de Jugador 4",
  ]);

  // Ningún botón se queda sin nombre accesible.
  const sinNombre = await page.getByRole("button").evaluateAll((els) =>
    els.filter((e) => !(e.getAttribute("aria-label") || e.textContent || "").trim()).length,
  );
  expect(sinNombre).toBe(0);

  // Una sola región que anuncia el último movimiento; más de una las pisa entre sí.
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/Jugador 1/);
});
