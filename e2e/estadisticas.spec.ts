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

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Contrato del armazón de paneles (docs/design/paneles-estadisticos.md). Lo que
// se comprueba aquí no es el aspecto: es que el dato sea LEGIBLE sin mirar el
// gráfico, plegado y desplegado. Cada panel es una región con nombre, declara su
// periodo y su unidad de un vistazo, y al pulsarlo enseña los valores exactos.
test("cada panel es una región con nombre, contexto y tabla de valores exactos", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  // 1 · Región con nombre: el lector de pantalla puede saltar de panel a panel.
  const horas = page.getByRole("region", { name: "Horas por mes" });
  await expect(horas).toBeVisible();

  // 2 · Plegado: el rótulo dice periodo y unidad en cuatro palabras.
  await expect(horas).toContainText(/2026 · min/i);

  // 3 · Plegado, la tabla NO está a la vista: la vista general es compacta.
  const tabla = horas.getByRole("table");
  await expect(tabla).toBeHidden();

  // 4 · La tarjeta ENTERA es el control: se pulsa y se despliega.
  await horas.locator("summary").click();
  await expect(tabla).toBeVisible();
  await expect(tabla.getByRole("rowheader", { name: "Enero" })).toBeVisible();
  await expect(tabla.getByRole("columnheader", { name: "Mes" })).toBeVisible();
  // Y ahí sí aparece la frase larga de contexto, con la unidad completa.
  await expect(horas).toContainText(/Valores en minutos/i);

  // 5 · Un panel que ignora el selector de periodo lo dice ANTES de su cifra,
  //     sin necesidad de desplegarlo.
  await expect(page.getByRole("region", { name: "Estados" })).toContainText(
    /Ahora mismo · foto del momento/i,
  );

  // 6 · Los paneles que ya son texto (ranking) no repiten tabla ni desplegados:
  //     su lista ordenada ES el dato.
  const mejores = page.getByRole("region", { name: "Mejor valoradas" });
  await mejores.locator("summary").click();
  await expect(mejores.getByRole("table")).toHaveCount(0);
});

// Un panel plegado tiene que seguir diciendo su dato en TEXTO. Si al plegarlo se
// quedara solo el dibujo, el rediseño compacto habría deshecho justo lo que este
// sistema arregla.
test("plegado, el panel sigue teniendo su cifra en texto y no solo el gráfico", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  const horas = page.getByRole("region", { name: "Horas por mes" });
  // Sin desplegar nada: el `<dl>` con la cifra que preside la tarjeta.
  const hero = horas.locator("dl").first();
  await expect(hero).toBeVisible();
  await expect(hero).toContainText(/\d/);
});

// La pestaña Estadísticas del perfil usa el MISMO armazón que /estadisticas
// (issue #423): mismo contrato y, sobre todo, los mismos números.
test("la pestaña del perfil usa el armazón de paneles", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto(`/u/${USERNAME}?tab=estadisticas`);

  const semana = page.getByRole("region", { name: "Lectura esta semana" });
  await expect(semana).toBeVisible();
  await expect(semana).toContainText(/Últimos 7 días · ventana móvil · min/i);

  // Se despliega igual que en el muro, y da los valores exactos por día.
  await semana.locator("summary").click();
  await expect(semana.getByRole("table")).toBeVisible();
  await expect(
    semana.getByRole("columnheader", { name: "Día" }),
  ).toBeVisible();

  // El calendario y el editor de objetivo NO son paneles: siguen siendo
  // controles con estado propio y no se pliegan.
  await expect(page.getByRole("region", { name: "Racha" })).toBeVisible();
});
