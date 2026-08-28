import { test, expect } from "@playwright/test";

// El usuario SIN sesión: navega el chrome público y, al pisar una pantalla
// bloqueada, aterriza en /login?next= para volver tras entrar.
test("anónimo ve nav pública y botón de login en una página pública", async ({ page }) => {
  await page.goto("/buscar");
  // CTA de login en el header (no avatar).
  await expect(page.getByRole("link", { name: /iniciar sesión/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /crear cuenta/i })).toBeVisible();
  // Nav pública presente; Biblioteca NO. (La entrada se llamaba «Colección»
  // hasta F3-011 — ver docs/UI-GLOSARIO.md.)
  await expect(page.getByRole("link", { name: /^Buscar$/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Biblioteca$/ })).toHaveCount(0);
});

test("anónimo en página gated cae en /login?next= y no pierde el destino", async ({ page }) => {
  await page.goto("/coleccion");
  await expect(page).toHaveURL(/\/login\?next=%2Fcoleccion/);
});

// Regresión: un anónimo puede abrir un perfil PÚBLICO sin 500. Las políticas
// RLS de passes/follows/feed llaman a users_are_blocked()/filter_unblocked_user_ids(),
// y el rol `anon` no tenía EXECUTE sobre ellas ni SELECT sobre user_blocks —
// leer el perfil lanzaba «permission denied» y tumbaba la página. `devtest` es
// el usuario de pruebas de DEV (público y con biblioteca sembrada), así que
// recorre el camino de lectura completo (getLibraryStats → passes).
test("anónimo abre un perfil público sin error (grants de los helpers de bloqueo)", async ({ page }) => {
  const res = await page.goto("/u/devtest");
  expect(res?.status()).toBe(200);
  // `exact`: con el shell estático del perfil (#476), la metadata llega por
  // streaming y Next pinta el <title> dentro del <body> — sin exact, el
  // locator casa también «@devtest — Biblioshare» y rompe el strict mode.
  await expect(page.getByText("@devtest", { exact: true })).toBeVisible();
});

// Acciones in-page (issue #358): para el anónimo, seguir un perfil es un ENLACE
// a login con retorno, no un botón que dispara la acción y redirige a /login
// pelado. El mismo patrón (loginHref) cubre el "Seguir" de la ficha (useFollow)
// y el link de comentar de reseñas/actividad.
test("anónimo: seguir un perfil es un enlace a /login?next=", async ({ page }) => {
  await page.goto("/u/devtest");
  await expect(
    page.getByRole("link", { name: /^seguir$/i }).first(),
  ).toHaveAttribute("href", /\/login\?next=%2Fu%2Fdevtest/);
});

test("anónimo: 'Seguir' en una ficha lleva a /login?next= con la ficha", async ({ page }) => {
  // Ficha pública cacheada en DEV (Cien años de soledad). El "Seguir" del hero/
  // rail (useFollow) es un botón que, para el anónimo, hace router.push a login
  // recordando la ficha — no dispara la acción.
  const bookPath = "/libro/3e80b690-ceef-49fb-b442-ecd2ea88be83";
  await page.goto(bookPath);
  await page
    .getByRole("button", { name: /^seguir$/i })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login\?next=%2Flibro%2F3e80b690/);
});

// Round-trip completo: el anónimo pisa una página gated, se loguea desde el
// /login?next= al que cae, y vuelve a esa página — no a la home. Es el retorno
// que safeNext + el hidden input hacen posible (la review final marcó que no
// tenía e2e por necesitar un usuario autenticado).
test("tras loguearse desde /login?next=, vuelve a la página gated de origen", async ({ page }) => {
  await page.goto("/coleccion");
  await expect(page).toHaveURL(/\/login\?next=%2Fcoleccion/);

  await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');

  // Vuelve a /coleccion (el next), no a "/".
  await page.waitForURL("/coleccion");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mi Biblioteca" }),
  ).toBeVisible();
});
