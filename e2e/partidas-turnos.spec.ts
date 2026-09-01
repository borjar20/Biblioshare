import { test, expect } from "@playwright/test";

// Acompañante «Turnos». Anónimo, IDB propio (clave :turns). Viewport móvil.
test.use({ viewport: { width: 390, height: 844 } });

test("configurar, avanzar fases y turnos, invertir, eliminar, recargar y deshacer", async ({
  page,
}) => {
  await page.goto("/partidas/turnos");
  await expect(page.getByRole("heading", { name: "Turnos" })).toBeVisible();

  // Fichas: la ficha «+» abre el input; Enter añade y cierra.
  for (const name of ["Ana", "Beto", "Carla"]) {
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByLabel("Nombre del jugador").press("Enter");
  }
  // Fases preset: se encienden en orden de toque.
  await page.getByRole("button", { name: "Mantenimiento" }).click();
  await page.getByRole("button", { name: /Acción/ }).click();
  await page.getByRole("button", { name: /^empezar$/i }).click();

  // Ana activa; el centro avanza FASE primero y luego JUGADOR.
  await expect(page.getByTestId("turn-token-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-center")).toHaveAccessibleName("Siguiente fase");
  await page.getByTestId("turn-center").click(); // a Acción
  await expect(page.getByTestId("turn-center")).toHaveAccessibleName("Siguiente jugador");
  await page.getByTestId("turn-center").click(); // a Beto
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R1");

  // Invertir: el avance va hacia atrás (Beto → Ana) SIN envolver (la vuelta
  // no se completa retrocediendo hacia el asiento 0).
  await page.getByRole("button", { name: /^invertir$/i }).click();
  await page.getByTestId("turn-center").click(); // fase
  await page.getByTestId("turn-center").click(); // jugador, hacia atrás
  await expect(page.getByTestId("turn-token-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R1");

  // Otro avance (Ana → Carla hacia atrás) SÍ envuelve → R2.
  await page.getByTestId("turn-center").click(); // fase
  await page.getByTestId("turn-center").click(); // jugador
  await expect(page.getByTestId("turn-token-2")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R2");

  // Eliminar a Beto (no activo) con confirm; el anillo lo atenúa.
  await page.getByTestId("turn-token-1").click();
  await page.getByRole("button", { name: "¿Eliminar a Beto?" }).click();
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-eliminated", "true");

  // Recarga conserva activo, ronda y eliminado.
  await page.reload();
  await expect(page.getByTestId("turn-token-2")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R2");
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-eliminated", "true");

  // Deshacer revierte la eliminación.
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-eliminated", "false");
});

test("la tarjeta del hub navega a turnos", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: "Turnos", exact: true }).click();
  await expect(page).toHaveURL(/\/partidas\/turnos$/);
  await expect(page.getByRole("heading", { name: "Turnos" })).toBeVisible();
});
