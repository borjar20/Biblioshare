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

  // Home autenticada: el feed (el dashboard se mudó a Perfil › Panel). La
  // cabecera tiene un árbol por breakpoint (plan 01, frames A y B): "Novedades"
  // en móvil y el saludo en escritorio, y el otro queda en el DOM oculto. La
  // suite corre a 1280, así que el locator SIEMPRE lleva :visible — el mismo
  // cuidado que en la ficha.
  await expect(page.locator("h1:visible")).toHaveText(/hola,|novedades/i);

  // La nav lleva a las 5 secciones.
  await expect(page.getByRole("link", { name: /^colección$/i }).first()).toBeVisible();

  // Buscar un libro y ver resultados. Una tarjeta de resultado es un ENLACE si
  // la obra ya está en el catálogo, y un BOTÓN si todavía no (§7.39: la búsqueda
  // no crea filas; la obra nace al pulsarla). Hay que aceptar las dos formas.
  await page.goto("/buscar?q=rayuela&type=book");
  const firstResult = page
    .locator('a[href*="/libro/"]')
    .or(page.getByRole("button", { name: /rayuela/i }))
    .first();
  await expect(firstResult).toBeVisible({ timeout: 15_000 });

  // Abrir la ficha del primer resultado
  await firstResult.click();
  await page.waitForURL(/\/libro\//, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: /comunidad/i }).or(page.getByText(/comunidad/i)).first()).toBeVisible();

  // Perfil propio
  await page.goto(`/u/${USERNAME}`);
  await expect(page.getByText(`@${USERNAME}`).first()).toBeVisible();
});

// Colecciones sorteables (§7.28): marcar una colección como pool del sorteo la
// hace aparecer en el filtro por colección, y desmarcarla la retira. Sustituye
// al test de colas nombradas (§7.22), retiradas el 2026-07-20. Auto-limpiante
// (nombre único por ejecución) para no dejar residuo en el proyecto dev.
test("marcar una colección como sorteable la ofrece en el filtro del sorteo", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  const collectionName = `e2e-${Date.now()}`;

  await page.goto("/coleccion");
  await page.getByRole("button", { name: /nueva colección/i }).click();
  await page.getByLabel(/^nombre$/i).fill(collectionName);
  await page.getByRole("button", { name: /^crear$/i }).click();

  // Crear navega al detalle de la colección nueva.
  await page.waitForURL(/\/coleccion\/c\//);
  await expect(page.getByRole("heading", { name: collectionName })).toBeVisible();

  // Marcarla como sorteable desde el menú «⋯».
  await page.getByRole("button", { name: /acciones de la colección/i }).click();
  await page.getByRole("menuitem", { name: /usar en el sorteo/i }).click();
  // El menú refleja el estado nuevo: ahora ofrece quitarla.
  await page.getByRole("button", { name: /acciones de la colección/i }).click();
  await expect(page.getByRole("menuitem", { name: /quitar del sorteo/i })).toBeVisible();
  await page.keyboard.press("Escape");

  // Lo que de verdad importa: la colección se ofrece ya en el filtro del
  // sorteo, que vive en el Rincón del perfil detrás del panel «⚙ Filtros».
  await page.goto(`/u/${USERNAME}?tab=rincon`);
  // El botón se pinta en el servidor pero abre la hoja desde estado de
  // cliente: un clic anterior a la hidratación no hace nada y el test se
  // quedaba esperando. Reintentar hasta que la hoja aparezca de verdad.
  await expect(async () => {
    await page.getByRole("button", { name: /sacar un lomo/i }).click();
    await expect(
      page.getByRole("heading", { name: /deja que decida la estantería/i }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: /filtros/i }).click();
  await expect(page.getByRole("button", { name: collectionName })).toBeVisible();
  await page.keyboard.press("Escape");

  // Limpieza: borrar la colección (confirm() nativo).
  await page.goto("/coleccion");
  await page.getByRole("link", { name: new RegExp(collectionName) }).click();
  await page.waitForURL(/\/coleccion\/c\//);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /acciones de la colección/i }).click();
  await page.getByRole("menuitem", { name: /^borrar$/i }).click();
  await page.waitForURL(/\/coleccion$/);
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

  // Los retos viven en Perfil › Rincón desde el mockup Perfil v2 (plan 05, P2).
  await page.goto(`/u/${USERNAME}?tab=rincon`);
  await page.getByRole("button", { name: /nuevo reto/i }).click();
  // La hoja de "Editar perfil" (un <dialog> cerrado) también tiene un campo
  // "Nombre" en el DOM: se apunta al del reto por su id para no cazar el oculto
  // (regla de los dos árboles del README).
  await page.locator("#challenge-name").fill(name);
  await page.getByLabel(/objetivo \(número/i).fill("9999");
  await page.getByLabel(/desde/i).fill("2026-01-01");
  await page.getByLabel(/hasta/i).fill("2026-12-31");
  await page.getByRole("button", { name: /crear reto/i }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  const card = page
    .getByTestId("challenge-card")
    .filter({ hasText: name });
  // Muestra "N de 9999". El objetivo es deliberadamente inalcanzable: con un
  // objetivo bajo (10) el reto nace ya cumplido en cuanto la cuenta de prueba
  // acumula ítems completados en el año, y la tarjeta pasa a decir
  // "¡Completado!" en vez del progreso.
  await expect(card.getByText(/de 9999/)).toBeVisible();

  // Limpieza.
  await card.getByRole("button", { name: /eliminar/i }).click();
  await expect(page.getByRole("heading", { name })).toHaveCount(0);
});
