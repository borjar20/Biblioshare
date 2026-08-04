import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// La página de estadísticas completas (plan 05, F5, frame J) es privada y solo
// del dueño: sin sesión, el middleware/redirect la manda a /login.
test("un visitante sin sesión no entra a /estadisticas", async ({ page }) => {
  await page.goto("/estadisticas");
  await page.waitForURL(/\/login/);
  await expect(page).toHaveURL(/\/login/);
});

// El "Ver estadísticas completas ›" de la pestaña Estadísticas lleva a la J, y
// allí aparece el selector de período (plan 05, F5).
test("la pestaña Estadísticas enlaza a /estadisticas con su selector", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}?tab=estadisticas`);
  await page
    .getByRole("link", { name: /estadísticas completas/i })
    .click();

  await page.waitForURL(/\/estadisticas/);
  // El selector de período: el pill "Todo" es un enlace a ?periodo=todo.
  await expect(
    page.getByRole("link", { name: /^todo$/i }),
  ).toBeVisible();
});

// El panel se reorientó de progress_sessions hacia passes (historial real): la
// tarjeta titular es "completadas por año" y "la pila" pasó a foto del momento.
test("la página muestra completadas por año", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto("/estadisticas");
  // Por el título del panel, no por texto suelto: desde el armazón accesible, el
  // título también aparece en el `<caption>` de la tabla de valores exactos.
  await expect(
    page.getByRole("heading", { name: "Completadas por año" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "La pila" })).toBeVisible();
});

// Contrato del armazón de paneles (docs/design/paneles-estadisticos.md). Lo que
// se comprueba aquí no es el aspecto, es que el dato sea LEGIBLE sin mirar el
// gráfico: cada panel es una región con nombre, declara su periodo y su unidad,
// y esconde detrás de un desplegable la tabla con los valores exactos.
test("cada panel es una región con nombre, contexto y tabla de valores exactos", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.goto("/estadisticas");

  // 1 · Región con nombre: el lector de pantalla puede saltar de panel a panel.
  const horas = page.getByRole("region", { name: "Horas por mes" });
  await expect(horas).toBeVisible();

  // 2 · Contexto: periodo y unidad, dentro del propio panel.
  await expect(horas).toContainText(/Valores en minutos/i);

  // 3 · Los valores exactos existen en el DOM, no solo como alturas de barra.
  const verTabla = horas.getByText(/Ver los 12 valores exactos/i);
  await expect(verTabla).toBeVisible();
  await verTabla.click();
  const tabla = horas.getByRole("table");
  await expect(tabla.getByRole("rowheader", { name: "Enero" })).toBeVisible();
  await expect(tabla.getByRole("columnheader", { name: "Mes" })).toBeVisible();

  // 4 · Un panel que ignora el selector de periodo lo dice en su contexto, en
  //     vez de fingir que obedece al filtro de la página.
  await expect(page.getByRole("region", { name: "Estados" })).toContainText(
    /Ahora mismo/i,
  );

  // 5 · Los paneles que ya son texto (ranking) no repiten una tabla plegada:
  //     su lista ordenada ES el dato.
  const mejores = page.getByRole("region", { name: "Mejor valoradas" });
  await expect(mejores.getByText(/valores exactos/i)).toHaveCount(0);
});
