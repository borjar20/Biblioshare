import { test, expect } from "@playwright/test";

// Acompañante «Reloj» (spec reloj). Anónimo, IDB propio (clave :clock).
// Viewport móvil como el resto de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("ajedrez: configurar, pasar turno, pausar y sobrevivir a la recarga", async ({ page }) => {
  await page.goto("/partidas/reloj");
  await expect(page.getByRole("heading", { name: "Reloj" })).toBeVisible();

  // Fichas: la ficha «+» abre el único input que queda; Enter añade y la cierra.
  for (const name of ["Ana", "Beto"]) {
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByLabel("Nombre del jugador").press("Enter");
  }
  await page.getByRole("button", { name: "1 min", exact: true }).click();
  await page.getByRole("button", { name: /^empezar 1 min$/i }).click();

  // Ana activa; pasar turno activa a Beto.
  await expect(page.getByTestId("clock-zone-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("clock-time-0")).toHaveText(/^(1:00|0:5\d)$/);
  await page.getByTestId("clock-zone-0").click();
  await expect(page.getByTestId("clock-zone-1")).toHaveAttribute("data-active", "true");

  // Pausar congela el número. Se espera a que la pausa esté COMMITEADA
  // (aparece «Reanudar») antes de leer el tiempo congelado — sin esto hay una
  // carrera teórica entre el click y la captura (review Task 6).
  await page.getByRole("button", { name: /^pausa$/i }).click();
  await expect(page.getByRole("button", { name: /^reanudar$/i })).toBeVisible();
  const frozen = await page.getByTestId("clock-time-1").innerText();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("clock-time-1")).toHaveText(frozen);

  // Recargar conserva bancos, activo y pausa (IDB + timestamps).
  await page.reload();
  await expect(page.getByTestId("clock-zone-1")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("clock-time-1")).toHaveText(frozen);
  await page.getByRole("button", { name: /^reanudar$/i }).click();
  await expect(page.getByRole("button", { name: /^pausa$/i })).toBeVisible();
});

test("cuenta atrás: preset, aro que suma, corre y se congela en pausa", async ({ page }) => {
  await page.goto("/partidas/reloj");
  await page.getByRole("tab", { name: "Cuenta atrás" }).click();

  await page.getByRole("button", { name: "30 s", exact: true }).click();
  await expect(page.getByTestId("countdown-time")).toHaveText("0:30");

  // El aro es el selector: un toque suma 30 s con la cuenta parada.
  await page.getByRole("button", { name: "Añadir 30 segundos" }).click();
  await expect(page.getByTestId("countdown-time")).toHaveText("1:00");

  // Corre (el número baja) y la pausa congela. El 0 exacto lo clavan los
  // unit del motor — aquí no se espera medio minuto.
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page.getByTestId("countdown-time")).not.toHaveText("1:00", { timeout: 3000 });
  await page.getByRole("button", { name: /^pausa$/i }).click();
  // Pausa COMMITEADA antes de leer (misma carrera que el test de ajedrez).
  await expect(page.getByRole("button", { name: /^reanudar$/i })).toBeVisible();
  const frozen = await page.getByTestId("countdown-time").textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("countdown-time")).toHaveText(frozen ?? "");
  await page.getByRole("button", { name: /^reanudar$/i }).click();
  await expect(page.getByRole("button", { name: /^pausa$/i })).toBeVisible();
});

test("la tarjeta del hub navega al reloj", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: "Reloj", exact: true }).click();
  await expect(page).toHaveURL(/\/partidas\/reloj$/);
  await expect(page.getByRole("heading", { name: "Reloj" })).toBeVisible();
});
