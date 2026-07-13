import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// Happy path de lectura (no mutación): login → home → buscar → ficha →
// perfil. Cubre auth, middleware, RLS de lectura y el enrutado principal.
// Requiere el usuario de prueba sembrado en el proyecto Supabase dev.
test("recorrido principal del usuario autenticado", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  // Login
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // Home autenticada: el feed (el dashboard se mudó a Perfil › Panel).
  await expect(
    page.getByRole("heading", { name: /novedades/i }),
  ).toBeVisible();

  // La nav lleva a las 5 secciones.
  await expect(page.getByRole("link", { name: /^colección$/i }).first()).toBeVisible();

  // Buscar un libro y ver resultados
  await page.goto("/buscar?q=rayuela&type=book");
  const firstResult = page.locator('a[href*="/libro/"]').first();
  await expect(firstResult).toBeVisible({ timeout: 15_000 });

  // Abrir la ficha del primer resultado
  await firstResult.click();
  await page.waitForURL(/\/libro\//);
  await expect(page.getByRole("tab", { name: /comunidad/i }).or(page.getByText(/comunidad/i)).first()).toBeVisible();

  // Perfil propio
  await page.goto(`/u/${USERNAME}`);
  await expect(page.getByText(`@${USERNAME}`).first()).toBeVisible();
});

// Colas múltiples (§7.22): crear una cola nombrada y borrarla. Auto-limpiante
// (nombre único por ejecución) para no dejar residuo en el proyecto dev.
test("crear y borrar una cola nombrada", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  const queueName = `e2e-${Date.now()}`;

  // Las colas viven dentro de Colección desde el rediseño Paper.
  await page.goto("/coleccion?tab=colas");
  await page.getByRole("button", { name: /nueva cola/i }).click();
  await page.getByLabel(/nombre de la nueva cola/i).fill(queueName);
  await page.getByRole("button", { name: /^crear$/i }).click();

  // La cola nueva aparece como pestaña.
  const tab = page.getByRole("link", { name: queueName });
  await expect(tab).toBeVisible();

  // Seleccionarla y borrarla; la pestaña desaparece.
  await tab.click();
  await expect(page.getByRole("textbox", { name: /nombre de la cola/i })).toHaveValue(queueName);
  await page.getByRole("button", { name: /^eliminar$/i }).click();
  await expect(page.getByRole("link", { name: queueName })).toHaveCount(0);
});

// Retos (§7.10): crear un reto con criterio de tipo y verificar que rinde
// progreso. Auto-limpiante.
test("crear y borrar un reto", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  const name = `e2e reto ${Date.now()}`;

  // Los retos viven en Perfil › Panel desde el rediseño Paper.
  await page.goto(`/u/${USERNAME}?tab=panel`);
  await page.getByRole("button", { name: /nuevo reto/i }).click();
  await page.getByLabel(/^nombre$/i).fill(name);
  // El Panel también tiene "Objetivo diario de lectura" (GoalsForm), así que
  // hay que apuntar al del reto y no a cualquier /objetivo/.
  await page.getByLabel(/objetivo \(número/i).fill("9999");
  await page.getByLabel(/desde/i).fill("2026-01-01");
  await page.getByLabel(/hasta/i).fill("2026-12-31");
  await page.getByRole("button", { name: /crear reto/i }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  // La tarjeta es el div `rounded-lg` que contiene el nombre del reto.
  const card = page.locator("div.rounded-lg").filter({ hasText: name });
  // Muestra "N de 9999". El objetivo es deliberadamente inalcanzable: con un
  // objetivo bajo (10) el reto nace ya cumplido en cuanto la cuenta de prueba
  // acumula ítems completados en el año, y la tarjeta pasa a decir
  // "¡Completado!" en vez del progreso.
  await expect(card.getByText(/de 9999/)).toBeVisible();

  // Limpieza.
  await card.getByRole("button", { name: /eliminar/i }).click();
  await expect(page.getByRole("heading", { name })).toHaveCount(0);
});
