import { expect, test, type Page } from "@playwright/test";

// #995: interfaz anónima real. Cada contexto tiene su propia IDB; sin semillas,
// cuentas, proveedores simulados ni escrituras en Supabase.
async function openClock(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/partidas/reloj");
  await expect(page.getByRole("heading", { name: "Reloj", exact: true })).toBeVisible();
  await expect(page.getByLabel("Tiempo inicial (segundos)")).toBeVisible();
  return errors;
}

async function addPlayer(page: Page, name: string) {
  await page.getByRole("button", { name: "Añadir jugador", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Nombre del jugador" });
  await input.fill(name);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: `Editar a ${name}`, exact: true })).toBeVisible();
  await expect(input).toHaveCount(0);
}

async function expectGeometry(page: Page) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport);
}

for (const width of [320, 390, 1280]) {
  test.describe(`Reloj #995 a ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const { seconds, bank } of [
      { seconds: "10", bank: "0:10" },
      { seconds: "90", bank: "1:30" },
    ]) {
      test(`reiniciar y recargar conserva exactamente ${seconds} segundos`, async ({ page }) => {
        const errors = await openClock(page);
        await addPlayer(page, "Ana");
        await addPlayer(page, "Beto");
        await page.getByLabel("Tiempo inicial (segundos)").fill(seconds);
        await page.getByRole("button", { name: `Empezar ${seconds} s`, exact: true }).click();
        // Beto aún no ha consumido tiempo: lectura exacta, sin tolerancias.
        await expect(page.getByTestId("clock-time-1")).toHaveText(bank);
        await page.reload();
        await expect(page.getByTestId("clock-time-1")).toHaveText(bank);

        await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
        await page.getByRole("button", { name: "¿Seguro? Reinicia el reloj", exact: true }).click();
        await expect(page.getByLabel("Tiempo inicial (segundos)")).toHaveValue(seconds);
        await expectGeometry(page);
        await page.getByRole("button", { name: `Empezar ${seconds} s`, exact: true }).click();
        await expect(page.getByTestId("clock-time-1")).toHaveText(bank);
        expect(errors).toEqual([]);
      });
    }

    test("explica tiempos inválidos y permite recuperar los límites válidos", async ({ page }) => {
      const errors = await openClock(page);
      await addPlayer(page, "Ana");
      await addPlayer(page, "Beto");
      const input = page.getByLabel("Tiempo inicial (segundos)");
      for (const seconds of ["", "9.999", "7200.001", "10.0001"]) {
        await input.fill(seconds);
        await expect(input).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByRole("button", { name: "Empezar", exact: true })).toBeDisabled();
        const feedback = page.getByRole("status");
        await expect(feedback).toHaveText("Elige un tiempo entre 10 y 7200 segundos, con hasta 3 decimales.");
        await expect(input).toHaveAttribute("aria-describedby", (await feedback.getAttribute("id"))!);
        await expectGeometry(page);
      }
      for (const seconds of ["10", "7200", "10.001"]) {
        await input.fill(seconds);
        await expect(input).toHaveAttribute("aria-invalid", "false");
        await expect(page.getByRole("button", { name: /^Empezar / })).toBeEnabled();
        await expect(page.getByRole("status")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Empezar 10.001 s", exact: true }).click();
      await expect(page.getByTestId("clock-time-1")).toHaveText("0:10");
      await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
      await page.getByRole("button", { name: "¿Seguro? Reinicia el reloj", exact: true }).click();
      await expect(input).toHaveValue("10.001");
      expect(errors).toEqual([]);
    });

    test("muestra el duplicado y la mesa llena, y permite corregir o retirar un jugador", async ({ page }) => {
      const errors = await openClock(page);
      await addPlayer(page, "Ana");
      await addPlayer(page, "Beto");
      await page.getByRole("button", { name: "Añadir jugador", exact: true }).click();
      const input = page.getByRole("textbox", { name: "Nombre del jugador" });
      await input.fill(" Ana ");
      await input.press("Enter");
      await expect(input).toHaveValue(" Ana ");
      await expect(input).toHaveAttribute("aria-invalid", "true");
      const duplicate = page.getByRole("status");
      await expect(duplicate).toHaveText("Ana ya está en la mesa.");
      await expect(input).toHaveAttribute("aria-describedby", (await duplicate.getAttribute("id"))!);
      await expect(page.getByRole("button", { name: "Añadir", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Editar a Ana", exact: true })).toHaveCount(1);
      await expectGeometry(page);

      await input.fill("Cora");
      await expect(duplicate).toHaveCount(0);
      await page.getByRole("button", { name: "Añadir", exact: true }).click();
      await expect(page.getByRole("button", { name: "Editar a Cora", exact: true })).toBeVisible();
      for (const name of ["Dani", "Elena", "Fede"]) await addPlayer(page, name);
      await expect(page.getByRole("status")).toHaveText("La mesa ya tiene 6 jugadores.");
      await expect(page.getByRole("button", { name: "Añadir jugador", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Editar a / })).toHaveCount(6);
      await expectGeometry(page);

      await page.getByRole("button", { name: "Editar a Fede", exact: true }).click();
      await page.getByRole("button", { name: "Quitar a Fede de la mesa", exact: true }).click();
      await expect(page.getByRole("status")).toHaveCount(0);
      await addPlayer(page, "Gema");
      await expect(page.getByRole("button", { name: /^Editar a / })).toHaveCount(6);
      expect(errors).toEqual([]);
    });
  });
}
