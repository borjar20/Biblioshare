import { expect, test, type Page } from "@playwright/test";

// #1007: recursos anónimos, con IndexedDB propio del contexto. No crea
// cuentas ni filas remotas. La identidad de cada definición es su nombre.
test.use({ viewport: { width: 390, height: 844 } });

async function openResources(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/partidas/recursos");
  await expect(page.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Añadir jugador", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre del jugador" }).fill("Ana");
  await page.getByRole("textbox", { name: "Nombre del jugador" }).press("Enter");
  await expect(page.getByRole("button", { name: "Editar a Ana", exact: true })).toBeVisible();
  return errors;
}

test("el nombre Oro a medida ocupa el atajo hasta quitar esa definición", async ({ page }) => {
  const errors = await openResources(page);
  await page.getByRole("button", { name: "Recurso a medida", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre del recurso" }).fill(" Oro ");
  await page.getByRole("button", { name: "Crear ficha", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar Oro", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Crear Oro", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear Madera", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Recurso a medida", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Nombre del recurso" });
  await input.fill(" Oro ");
  await expect(page.getByRole("button", { name: "Crear ficha", exact: true })).toBeDisabled();
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Editar Oro", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Recurso a medida", exact: true }).click();

  await page.getByRole("button", { name: "Editar Oro", exact: true }).click();
  await page.getByRole("button", { name: "Quitar Oro", exact: true }).click();
  await page.getByRole("button", { name: "Crear Oro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar Oro", exact: true })).toHaveCount(1);
  await expect(page.getByTestId("res-0-Oro")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("cambiar de ficha con teclado durante un hold cancela el gesto anterior", async ({ page }) => {
  const errors = await openResources(page);
  for (const { name, initial } of [{ name: "Madera", initial: 2 }, { name: "Oro", initial: 5 }]) {
    await page.getByRole("button", { name: `Crear ${name}`, exact: true }).click();
    await page.getByRole("button", { name: `Editar ${name}`, exact: true }).click();
    for (let i = 0; i < initial; i++) {
      await page.getByRole("button", { name: "Uno más de inicio", exact: true }).click();
    }
    await expect(page.getByTestId(`res-0-${name}`)).toHaveText(String(initial));
  }
  await page.getByRole("button", { name: "Editar Madera", exact: true }).click();
  const more = page.getByRole("button", { name: "Uno más de inicio", exact: true });
  await more.scrollIntoViewIfNeeded();
  const box = await more.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  try {
    const initial = page.locator("#resources-def").getByText(/^\d+$/);
    await expect(initial).not.toHaveText("2");
    // El ratón permanece pulsado sobre el paso. El teclado cambia de ficha
    // sin generar un pointerleave que cancelaría el gesto por otra causa.
    await page.getByRole("button", { name: "Editar Oro", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(initial).toHaveText("5");
    await expect(page.getByTestId("res-0-Madera")).toHaveText("2");
    await expect(page.getByTestId("res-0-Oro")).toHaveText("5");
  } finally {
    await page.mouse.up();
  }
  await expect(page.getByTestId("res-0-Oro")).toHaveText("5");
  await page.getByRole("button", { name: "Uno más de inicio", exact: true }).click();
  await expect(page.getByTestId("res-0-Oro")).toHaveText("6");
  await page.reload();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("2");
  await expect(page.getByTestId("res-0-Oro")).toHaveText("6");
  expect(errors).toEqual([]);
});
