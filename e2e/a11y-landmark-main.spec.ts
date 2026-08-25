import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// Auditoría 2026-08, hallazgo F4-023 (issue #816): 15 de 17 rutas se servían sin
// landmark `<main>` y ninguna tenía skip-link, así que quien navega con teclado
// o lector de pantalla re-tabulaba la cabecera entera en CADA navegación.
//
// La corrección subió el landmark al armazón (`AppShell`), que es lo que hace
// que valga para toda la app de una vez — y también lo que hace que una
// regresión aquí se lleve las 17 rutas por delante en silencio. De ahí este
// spec: el `<main>` no se ve en pantalla, no lo nota nadie al romperlo.
//
// Se comprueba SIN axe a propósito: el repo no depende de axe, y las dos reglas
// que importan (`landmark-one-main` y el orden de tabulación) se expresan como
// aserciones normales. «Exactamente uno» cubre los dos fallos posibles: cero
// landmarks, y dos anidados si alguien vuelve a poner un `<main>` de página.

const PUBLICAS = ["/login", "/signup", "/recuperar"];

// Rutas con sesión. Se incluyen a propósito las cuatro que ANTES traían su
// propio `<main>` (estadísticas y notas entre ellas): si alguien deshace a
// medias el cambio, el fallo sale como dos landmarks, no como cero.
const PRIVADAS = ["/", "/coleccion", "/buscar", "/clubes", "/notas", "/estadisticas", "/ajustes"];

async function entrar(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function esperarUnSoloMain(page: Page, ruta: string) {
  const main = page.locator("main");
  await expect(main, `${ruta}: se esperaba exactamente un <main>`).toHaveCount(1);
  await expect(main, `${ruta}: el <main> no es el del armazón`).toHaveAttribute("id", "contenido");
}

test("las rutas públicas traen un solo landmark <main>", async ({ page }) => {
  for (const ruta of PUBLICAS) {
    await page.goto(ruta);
    await esperarUnSoloMain(page, ruta);
  }
});

test("las rutas con sesión traen un solo landmark <main>", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(90_000);

  await entrar(page);

  for (const ruta of [...PRIVADAS, `/u/${USERNAME}`]) {
    await page.goto(ruta);
    await esperarUnSoloMain(page, ruta);
  }
});

// El corazón del hallazgo: no basta con que el enlace exista, tiene que ser lo
// PRIMERO que recibe el foco. Si acaba detrás del logo o de la campana no sirve
// para nada — es exactamente la cabecera que se quería saltar.
test("el skip-link es el primer elemento enfocable y lleva al contenido", async ({ page }) => {
  await page.goto("/login");

  await page.keyboard.press("Tab");

  const enfocado = page.locator(":focus");
  await expect(enfocado).toHaveAttribute("href", "#contenido");
  // `sr-only` hasta que recibe foco: si siguiera invisible con el foco puesto,
  // quien ve la pantalla y navega con teclado no sabría que está ahí.
  await expect(enfocado).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator(":focus")).toHaveAttribute("id", "contenido");
});
