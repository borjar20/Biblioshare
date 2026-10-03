import { test, expect, type Page } from "@playwright/test";

// Los recorridos parten de Inicio: que una ruta responda 200 no demuestra
// que sea alcanzable. Son lecturas con la cuenta persistente, sin escribir.
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// El login introduce credenciales; estos specs no guardan traces.
test.use({ trace: "off" });
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(60_000);
});

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

function primaryNav(page: Page) {
  // Los roles excluyen la copia del otro breakpoint y el DOM de Activity.
  return page.getByRole("navigation", { name: "Navegación principal" });
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Ajustes" }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(page.getByRole("menu")).toHaveCount(0);
}

for (const width of [390, 768]) {
  test.describe(`IA de navegación a ${width}px`, () => {
    test.skip(!EMAIL || !PASSWORD || !USERNAME, "TEST_USER_* no configurado");
    test.use({ viewport: { width, height: 900 }, hasTouch: true, isMobile: width < 768 });

    test("los cinco destinos se alcanzan desde Inicio sin pasar por el perfil", async ({ page }) => {
      await login(page);
      const nav = primaryNav(page);
      await expect(nav).toHaveCount(1);
      await expect(nav.getByRole("link")).toHaveText(["Inicio", "Biblioteca", "Experiencias", "Comunidad", "Buscar"]);
      await expect(nav.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute("aria-current", "page");
      for (const [name, path, heading] of [
        ["Experiencias", "/experiencias", "Experiencias"],
        ["Comunidad", "/comunidad", "Comunidad"],
        ["Buscar", "/buscar", "Buscar"],
        ["Biblioteca", "/coleccion", "Mi Biblioteca"],
      ]) {
        const link = nav.getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute("href", path);
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
        await expect(link).toHaveAttribute("aria-current", "page");
      }
      await expect(nav.getByRole("link", { name: "Partidas" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Mi perfil", exact: true })).toBeVisible();
    });

    test("Biblioteca reúne Cuaderno, Retos y objetivos y Estadísticas", async ({ page }) => {
      await login(page);
      const library = primaryNav(page).getByRole("link", { name: "Biblioteca", exact: true });
      await library.click();
      const tools = page.getByRole("navigation", { name: "Herramientas de tu biblioteca" });
      await expect(tools.getByRole("link")).toHaveText(["Cuaderno", "Retos y objetivos", "Estadísticas"]);
      for (const [name, path, heading] of [
        ["Cuaderno", "/notas", "Cuaderno"],
        ["Retos y objetivos", "/coleccion/rincon", "Retos y objetivos"],
        ["Estadísticas", "/estadisticas", "Estadísticas"],
      ]) {
        const link = tools.getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute("href", path);
        const box = await link.boundingBox();
        expect(box, `${name}: control visible`).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
        if (path === "/coleccion/rincon") {
          // El objetivo es el primer editor, antes de los retos existentes.
          // Abrir y cancelar protege sus namespaces sin escribir en la cuenta.
          await page.getByRole("button", { name: "Editar", exact: true }).first().click();
          await expect(page.getByRole("spinbutton", { name: "Objetivo diario de lectura (min)", exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Cancelar", exact: true }).click();
        }
        await expect(library).toHaveAttribute("aria-current", "page");
        await library.click();
        await expect(page).toHaveURL(/\/coleccion$/);
      }
    });

    test("el avatar abre un perfil sin la antigua fila de herramientas", async ({ page }) => {
      await login(page);
      const avatar = page.getByRole("link", { name: "Mi perfil", exact: true });
      await expect(avatar).toHaveAttribute("href", `/u/${USERNAME}`);
      await avatar.click();
      await expect(page).toHaveURL(new RegExp(`/u/${USERNAME}$`));
      await expect(page.getByText(`@${USERNAME}`, { exact: true }).filter({ visible: true })).toBeVisible();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Lo tuyo" })).toHaveCount(0);
      const main = page.getByRole("main");
      await expect(main.getByRole("link", { name: "Actividad", exact: true })).toHaveAttribute("href", `/u/${USERNAME}?tab=actividad`);
      await expect(main.getByRole("link", { name: "Experiencias", exact: true })).toHaveAttribute("href", `/u/${USERNAME}?tab=experiencias`);
      for (const name of ["Cuaderno", "Estadísticas", "Rincón", "Partidas", "Mascota"]) {
        await expect(main.getByRole("link", { name, exact: true })).toHaveCount(0);
      }
      // El acceso a editar la identidad del dueño sigue siendo un enlace real.
      await expect(main.getByRole("link", { name: "Ajustes", exact: true })).toHaveAttribute("href", "/ajustes");
      await page.getByRole("button", { name: "Más opciones" }).click();
      const menu = page.getByRole("menu", { name: "Más opciones" });
      await expect(menu.getByRole("menuitem")).toHaveText(["Partidas", "Mascota", "Ajustes"]);
      for (const [name, path] of [["Partidas", "/partidas"], ["Mascota", "/mascota"], ["Ajustes", "/ajustes"]]) {
        await expect(menu.getByRole("menuitem", { name, exact: true })).toHaveAttribute("href", path);
      }
    });
  });
}

test.describe("IA de navegación con teclado", () => {
  test.skip(!EMAIL || !PASSWORD || !USERNAME, "TEST_USER_* no configurado");

  test("Más lleva a Ajustes y conserva los accesos de cuenta", async ({ page }) => {
    await login(page);
    await openSettings(page);
    await expect(page.getByRole("heading", { name: "Ajustes", level: 1 })).toBeVisible();
    for (const section of ["Perfil", "Cuenta", "Tus datos", "Avisos"]) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Importar biblioteca" })).toHaveAttribute("href", "/importar");
    await expect(page.getByRole("link", { name: "Exportar CSV" })).toHaveAttribute("href", "/api/export");
    await page.getByRole("link", { name: "Cambiar contraseña" }).click();
    await expect(page).toHaveURL(/\/cuenta\/contrasena$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ajustes", exact: true })).toHaveAttribute("href", "/ajustes");
  });

  test("Más recorre sus enlaces, devuelve el foco y se cierra al volver entre pestañas", async ({ page }) => {
    await login(page);
    await primaryNav(page).getByRole("link", { name: "Comunidad", exact: true }).click();
    const sections = page.getByRole("navigation", { name: "Secciones de Comunidad" });
    await sections.getByRole("link", { name: "Personas", exact: true }).click();
    await expect(page).toHaveURL(/\/comunidad\?tab=personas$/);
    const trigger = page.getByRole("button", { name: "Más opciones" });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Partidas" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("menuitem", { name: "Ajustes" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("menuitem", { name: "Partidas" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Ajustes" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("menuitem", { name: "Ajustes" })).toBeFocused();
    // Mismo pathname: el historial solo cambia la query, sin clic exterior.
    await page.goBack();
    await expect(page).toHaveURL(/\/comunidad$/);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.goForward();
    await expect(page).toHaveURL(/\/comunidad\?tab=personas$/);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("Comunidad busca clubes sin perder foco y restaura el filtro al volver", async ({ page }) => {
    await login(page);
    const community = primaryNav(page).getByRole("link", { name: "Comunidad", exact: true });
    await community.click();
    const search = page.getByPlaceholder("Buscar clubes...", { exact: true }).filter({ visible: true });
    await search.fill("cine");
    await expect(page).toHaveURL(/\/comunidad\?q=cine$/);
    await expect(search).toBeFocused();
    await search.press("End");
    await search.pressSequentially(" y libros");
    await expect(page).toHaveURL(/\/comunidad\?q=cine(?:%20|\+)y(?:%20|\+)libros$/);
    await expect(search).toHaveValue("cine y libros");
    await expect(search).toBeFocused();
    await page.getByRole("navigation", { name: "Secciones de Comunidad" }).getByRole("link", { name: "Clubes", exact: true }).click();
    await expect(page).toHaveURL(/\/comunidad$/);
    await expect(search).toHaveValue("");
    await page.goBack();
    await expect(page).toHaveURL(/\/comunidad\?q=cine(?:%20|\+)y(?:%20|\+)libros$/);
    await expect(search).toHaveValue("cine y libros");
    await primaryNav(page).getByRole("link", { name: "Inicio", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await community.click();
    await expect(page).toHaveURL(/\/comunidad$/);
    await expect(search).toHaveValue("");
  });

  test("Personas se busca dentro de Comunidad y el resultado abre un perfil", async ({ page }) => {
    await login(page);
    await primaryNav(page).getByRole("link", { name: "Comunidad", exact: true }).click();
    await page.getByRole("navigation", { name: "Secciones de Comunidad" }).getByRole("link", { name: "Personas", exact: true }).click();
    await page.getByRole("searchbox", { name: "Buscar personas", exact: true }).fill("devtest");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/\/comunidad\?tab=personas&q=devtest$/);
    const result = page.getByRole("main").getByRole("link").filter({ hasText: "@devtest" });
    await expect(result).toHaveAttribute("href", "/u/devtest");
    await result.click();
    await expect(page).toHaveURL(/\/u\/devtest$/);
    await expect(page.getByText("@devtest", { exact: true }).filter({ visible: true })).toBeVisible();
  });
});

test("Sagas se ve como un destino en Buscar sin sesión", async ({ page }) => {
  await page.goto("/buscar");
  const link = page.getByRole("link", { name: "Explorar sagas" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/sagas");
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(36);
  await link.click();
  await expect(page).toHaveURL(/\/sagas$/);
});
