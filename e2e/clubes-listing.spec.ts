import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// La página /clubes pasó de `"use client"` a Server Component (#438). No había
// e2e que la cubriera —los specs de club van directos a /club/[slug]—, así que
// esto verifica lo que el refactor promete: (1) redirige sin sesión, (2) con
// sesión el HTML del SERVIDOR ya trae las secciones (las lecturas van en un
// Promise.all de servidor, no en un useEffect que se ejecuta tras hidratar) y
// (3) el buscador quedó como isla de cliente sobre `?q=`.

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test("sin sesión, /clubes redirige a login", async ({ page }) => {
  await page.goto("/clubes");
  await page.waitForURL(/\/login/);
  await expect(page).toHaveURL(/\/login/);
});

test("con sesión, el HTML del servidor ya trae las secciones de /clubes", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  await login(page);

  // El HTML tal cual llega del servidor, antes de ejecutar ni un JS: si las
  // lecturas (server actions llamadas desde el RSC) fallaran en runtime, o si la
  // página siguiera montando vacía como cuando era cliente, esto saldría rojo.
  const response = await page.goto("/clubes", { waitUntil: "commit" });
  const html = await response!.text();
  expect(html).toContain("Mis clubes");
  expect(html).toContain("Descubrir");

  await expect(page.getByRole("heading", { name: "Mis clubes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Descubrir" })).toBeVisible();
});

test("el buscador de clubes empuja el término a ?q= (isla de cliente)", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  await login(page);
  await page.goto("/clubes");

  await page.getByPlaceholder("Buscar clubes...").fill("zzznoexiste");
  await page.waitForURL(/\/clubes\?q=zzznoexiste/);
  await expect(page).toHaveURL(/q=zzznoexiste/);
});
