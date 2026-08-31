import { test, expect } from "@playwright/test";

// Jugadores habituales, fase 6 de BiblioPlay (#931, Task 8). Habituales son una
// feature CON SESIÓN (decisión de fase 6, decisiones.md 2026-08-31): sin
// cuenta no hay `play_players` que ofrecer, así que `RegularPicker` y
// `PlayersManager` devuelven `null` para `identity === "anon"` -- este spec
// prueba esa ausencia en los tres sitios donde la UI de habituales podría
// asomar, y que el camino de siempre (empezar una partida) sigue intacto.
//
// Sin viewport móvil propio: a diferencia de partidas-puntuacion.spec.ts y
// partidas-mtg.spec.ts, aquí no se interactúa con el TABLERO (hoja de ronda,
// vidas...) -- solo se cruzan pantallas de setup/hub y se mira el DOM, el
// mismo criterio que partidas-navegacion.spec.ts.

test("puntuación: sin sesión, no hay «Recordar como habitual» ni chips de habituales", async ({
  page,
}) => {
  await page.goto("/partidas/puntuacion/nueva");
  // La mesa vive plegada tras un <details>; se abre por su summary, no por rol
  // (mismo criterio que partidas-navegacion.spec.ts).
  await page.getByText("En la mesa").click();
  // Se escribe un nombre real: es justo la señal que, con sesión, dispara
  // chips de sugerencia y el botón «Recordar» -- probar la ausencia con el
  // campo vacío no demostraría nada.
  await page.getByLabel("Nombre").first().fill("Ana");

  await expect(page.getByRole("button", { name: /recordar como habitual/i })).toHaveCount(0);
  // La fila de chips lleva el aria-label como atributo del contenedor (no es
  // un control de formulario, así que no es cosa de `getByLabel`), y es
  // literalmente el mismo texto «Tus jugadores» que la tarjeta del hub -- se
  // apunta al atributo exacto para no confundir ambos casos.
  await expect(page.locator('[aria-label="Tus jugadores"]')).toHaveCount(0);
});

test("mtg: sin sesión, no hay «Recordar como habitual» ni chips de habituales", async ({
  page,
}) => {
  await page.goto("/partidas/mtg/nueva");
  await page.getByText("En la mesa").click();
  await page.getByLabel("Nombre").first().fill("Ana");

  await expect(page.getByRole("button", { name: /recordar como habitual/i })).toHaveCount(0);
  await expect(page.locator('[aria-label="Tus jugadores"]')).toHaveCount(0);
});

test("hub: sin sesión, no hay tarjeta «Tus jugadores»", async ({ page }) => {
  await page.goto("/partidas");
  await expect(page.getByRole("heading", { name: "Partidas" })).toBeVisible();

  // La tarjeta es un botón (título + contador «Ninguno todavía»/«N jugadores»),
  // no texto suelto -- se asevera sobre el control, que es lo que un lector de
  // pantalla anuncia y lo único que distingue esta tarjeta del mismo texto
  // como chipsLabel en las pantallas de setup.
  await expect(page.getByRole("button", { name: /^tus jugadores/i })).toHaveCount(0);
  // «Guardadas» sí es del anónimo (fase 5): su presencia confirma que se
  // renderizó el bloque entero y la ausencia de arriba no es un falso
  // negativo por una página que no cargó.
  await expect(page.getByRole("heading", { name: "Guardadas" })).toBeVisible();
});

test("el flujo básico sigue intacto: partida score libre arranca y el tablero se ve", async ({
  page,
}) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: /puntuación por rondas/i }).click();
  await expect(page).toHaveURL(/\/partidas\/puntuacion$/);

  await page.getByRole("button", { name: /libre/i }).click();
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await expect(page.getByRole("button", { name: /^añadir ronda$/i })).toBeVisible();
});
