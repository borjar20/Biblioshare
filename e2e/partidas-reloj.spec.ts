import { test, expect } from "@playwright/test";

// Acompañante «Reloj» (spec reloj). Anónimo, IDB propio (clave :clock).
// Viewport móvil como el resto de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("ajedrez: configurar, pasar turno, pausar y sobrevivir a la recarga", async ({ page }) => {
  await page.goto("/partidas/reloj");
  await expect(page.getByRole("heading", { name: "Reloj" })).toBeVisible();

  for (const name of ["Ana", "Beto"]) {
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByRole("button", { name: /^añadir$/i }).click();
  }
  await page.getByRole("button", { name: "1 min", exact: true }).click();
  await page.getByRole("button", { name: /^empezar$/i }).click();

  // Ana activa; pasar turno activa a Beto.
  await expect(page.getByTestId("clock-zone-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("clock-time-0")).toHaveText(/^(1:00|0:5\d)$/);
  await page.getByTestId("clock-zone-0").click();
  await expect(page.getByTestId("clock-zone-1")).toHaveAttribute("data-active", "true");

  // Pausar congela el número.
  await page.getByRole("button", { name: /^pausa$/i }).click();
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

test("cuenta atrás de 5 s llega a 0:00 y el CTA vuelve a Empezar", async ({ page }) => {
  await page.goto("/partidas/reloj");
  await page.getByRole("tab", { name: "Cuenta atrás" }).click();

  await page.getByLabel("Segundos personalizados").fill("5");
  await page.getByLabel("Segundos personalizados").press("Enter");
  await expect(page.getByTestId("countdown-time")).toHaveText("0:05");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page.getByTestId("countdown-time")).toHaveText("0:00", { timeout: 7000 });
  await expect(page.getByRole("button", { name: /^empezar$/i })).toBeVisible();
});

test("la tarjeta del hub navega al reloj", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: "Reloj", exact: true }).click();
  await expect(page).toHaveURL(/\/partidas\/reloj$/);
  await expect(page.getByRole("heading", { name: "Reloj" })).toBeVisible();
});
