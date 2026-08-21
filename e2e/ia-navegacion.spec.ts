import { test, expect, type Page } from "@playwright/test";

// IA de navegación + página de Ajustes (acción 8 de la auditoría 2026-08:
// F3-010, F4-007, F1-025).
//
// Lo que protege este fichero NO es que las páginas existan —ya existían
// todas— sino que se pueda LLEGAR a ellas. El fallo que se arregla aquí es el
// más silencioso que hay: `/cuenta/contrasena` tenía cero enlaces en `src/` y
// aun así respondía 200, así que ningún test de "la ruta funciona" lo habría
// pillado nunca. Por eso los asertos de abajo siempre empiezan navegando con
// clics desde el perfil, no con `page.goto()` al destino.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

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

test.describe("IA de navegación", () => {
  test.skip(
    !EMAIL || !PASSWORD || !USERNAME,
    "TEST_USER_* no configurado",
  );

  test("el engranaje del perfil lleva a /ajustes, que es una página", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/u/${USERNAME}`);

    // Enlace, no botón: antes era el disparador de un <dialog>. Que sea un
    // <a href> es la mitad del arreglo — una pantalla de ajustes tiene que
    // poder marcarse, compartirse y volverse con el botón atrás.
    const gear = page.getByRole("link", { name: "Ajustes" });
    await expect(gear).toBeVisible();
    await gear.click();

    await expect(page).toHaveURL(/\/ajustes$/);
    await expect(
      page.getByRole("heading", { name: "Ajustes", level: 1 }),
    ).toBeVisible();

    // Las cuatro secciones. Si alguna desapareciera, su contenido volvería a
    // no tener casa (que es de donde venimos).
    for (const section of ["Perfil", "Cuenta", "Tus datos", "Avisos"]) {
      await expect(
        page.getByRole("heading", { name: section, level: 2 }),
      ).toBeVisible();
    }

    // Cerrar sesión sigue existiendo: se mudó desde la hoja del perfil y es
    // fácil perderlo en una mudanza.
    await expect(
      page.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeVisible();
  });

  test("desde Ajustes se llega a importar, exportar y contraseña", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/ajustes");

    // Los tres caminos que la auditoría dio por enterrados. Importar solo se
    // alcanzaba desde DENTRO de la hoja de «Editar perfil»; la contraseña, solo
    // desde el correo de recuperación.
    await expect(
      page.getByRole("link", { name: "Importar biblioteca" }),
    ).toHaveAttribute("href", "/importar");
    await expect(
      page.getByRole("link", { name: "Exportar CSV" }),
    ).toHaveAttribute("href", "/api/export");

    await page.getByRole("link", { name: "Cambiar contraseña" }).click();
    await expect(page).toHaveURL(/\/cuenta\/contrasena$/);

    // La pantalla dejó de ser un formulario suelto: tiene título de página y
    // salida de vuelta a Ajustes.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ajustes" }),
    ).toHaveAttribute("href", "/ajustes");
  });

  test("el menú del avatar abre «Tú» y lleva al Cuaderno", async ({ page }) => {
    await login(page);

    const trigger = page.getByRole("button", { name: "Tu cuenta" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    for (const item of ["Mi perfil", "Cuaderno", "Estadísticas", "Ajustes"]) {
      await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
    }

    // Son enlaces reales, no botones que empujan la ruta: se pueden abrir en
    // otra pestaña. El aserto lo comprueba por el href, que un <button> no
    // tendría.
    await expect(
      menu.getByRole("menuitem", { name: "Cuaderno" }),
    ).toHaveAttribute("href", "/notas");

    await menu.getByRole("menuitem", { name: "Cuaderno" }).click();
    await expect(page).toHaveURL(/\/notas$/);
    // Y se cierra al navegar: con Cache Components el componente no se
    // desmonta en navegación soft y se quedaría abierto sobre la página nueva.
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("Sagas se ve como un destino en Buscar", async ({ page }) => {
    // /buscar es pública: este acceso tiene que existir también sin sesión.
    await page.goto("/buscar");

    const link = page.getByRole("link", { name: "Explorar sagas" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/sagas");

    // Era una línea de 11px en versalitas grises, indistinguible de un rótulo
    // de sección. Ahora tiene cuerpo de control: se mide, no se supone.
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(36);

    await link.click();
    await expect(page).toHaveURL(/\/sagas$/);
  });
});

// El bloque móvil va aparte porque `test.use` es por fichero o por describe, y
// aquí hace falta `isMobile: true` además de `hasTouch`: es lo que pone al
// navegador en `pointer: coarse`. Sin eso, un `setViewportSize` a 390 sigue
// siendo un ratón, y las reglas táctiles del sistema no se activan.
test.describe("IA de navegación en móvil", () => {
  test.skip(!EMAIL || !PASSWORD || !USERNAME, "TEST_USER_* no configurado");
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });

  test("los mismos destinos cuelgan del perfil", async ({ page }) => {
    await login(page);
    await page.goto(`/u/${USERNAME}`);

    // En móvil no hay avatar en la topbar: la entrada a lo tuyo es la pestaña
    // Perfil de la barra inferior, y de ahí cuelga la fila.
    await expect(page.getByRole("button", { name: "Tu cuenta" })).toHaveCount(0);

    const row = page.getByRole("navigation", { name: "Lo tuyo" });
    await expect(row).toBeVisible();
    for (const item of ["Cuaderno", "Estadísticas", "Ajustes"]) {
      const link = row.getByRole("link", { name: item });
      await expect(link).toBeVisible();
      // Regla táctil de 44px (F4-015). Se mide el RECTÁNGULO, no la clase: una
      // clase puede estar puesta y no compilar (#722), y `tap-44` además
      // agranda el área con un pseudo-elemento que `boundingBox()` no ve — por
      // eso estos chips llevan `min-h-[44px]` de verdad.
      const box = await link.boundingBox();
      expect(box, `${item} debe tener caja`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await row.getByRole("link", { name: "Estadísticas" }).click();
    await expect(page).toHaveURL(/\/estadisticas$/);
  });
});
