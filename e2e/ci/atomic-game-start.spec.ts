import { expect, test } from "@playwright/test";
import { waitForActiveRecord } from "../support/play-db";

test.use({ viewport: { width: 390, height: 844 } });

// Los rechazos del reducer se ejercitan con init REAL en game-start.test.tsx.
// Aquí se comprueba el contrato visible: configurar conserva la partida hasta
// pulsar Empezar/Jugar ya, y un candidato válido ocupa el slot en un commit.
for (const entry of [
  { name: "Jugar ya", route: "/partidas/puntuacion", button: /^jugar ya$/i },
  { name: "Empezar", route: "/partidas/puntuacion/nueva", button: /^empezar$/i },
]) {
  test(`${entry.name} conserva la activa al configurar y sustituye solo al arrancar`, async ({ page }) => {
    await page.goto("/partidas/mtg/nueva?modo=commander&jugadores=2");
    await page.getByRole("button", { name: /^empezar$/i }).click();
    await expect(page).toHaveURL(/\/partida\/activa$/);
    await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
    await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
    // Espera a que la ráfaga se selle y aterrice: comparar revisiones antes de
    // ese sello confundiría una escritura normal de vidas con otro arranque.
    const old = await waitForActiveRecord(page, (record) =>
      record !== null && record.pending === null && record.committed.length === 2,
    );
    expect(old).not.toBeNull();

    await page.goto(entry.route);
    const start = page.getByRole("button", { name: entry.button });
    await expect(start).toBeEnabled();
    expect(await waitForActiveRecord(page, (record) => record?.rev === old!.rev)).toEqual(old);

    // Volver al tablero desde la configuración también conserva la huella
    // de la partida original. No basta con que siga habiendo algún registro.
    await page.goto("/partida/activa");
    await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
    await page.goto(entry.route);
    await expect(page.getByRole("button", { name: entry.button })).toBeEnabled();
    await page.getByRole("button", { name: entry.button }).click();
    await expect(page).toHaveURL(/\/partida\/activa$/);
    await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();

    const replacement = await waitForActiveRecord(page, (record) =>
      record !== null && record.committed[0].id !== old!.committed[0].id,
    );
    expect(replacement?.rev).toBe(old!.rev + 1);
    expect(replacement?.pending).toBeNull();
    expect(replacement?.committed).toHaveLength(1);
    expect(replacement?.committed[0]).toMatchObject({ type: "game_started", payload: { toolId: "score" } });

    await page.reload();
    await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();
    expect(await waitForActiveRecord(page, (record) => record?.rev === replacement!.rev)).toEqual(replacement);
  });
}
