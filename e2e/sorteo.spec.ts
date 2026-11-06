import { test, expect } from "@playwright/test";
import { submitLogin } from "./support/visible-form";
import { playToReveal } from "./support/sorteo";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

test.use({ contextOptions: { reducedMotion: "reduce" } });

// Sacar un lomo (spec 2026-11-06): la partida es un <dialog> que se abre en el
// sitio. OJO: el CTA muta datos del usuario de test (un pendiente pasa a en
// curso); mientras le queden pendientes, las siguientes ejecuciones siguen valiendo.
test("Rincón: la partida llega al CTA y deja el ítem en curso", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}?tab=rincon`);

  const openButton = page.getByRole("button", { name: /sacar un lomo/i });
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  await expect(openButton.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");

  await openButton.click();
  const { stage, cta } = await playToReveal(page);
  await cta.click();
  // Tras el CTA la partida se cierra sola y la página se refresca.
  await expect(stage).toBeHidden({ timeout: 10_000 });
});

// Enlace directo: Biblioteca e Inicio llevan aquí y la partida llega abierta.
test("?sorteo=1 abre la partida, limpia la URL y la entrada de Biblioteca la reabre", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");

  await page.goto("/coleccion/rincon?sorteo=1");
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  const stage = page.getByRole("dialog", { name: "Sacar un lomo" });
  await expect(stage.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");

  await expect(stage.getByRole("button", { name: "¡Tirar!" })).toBeVisible();
  // El parámetro se quita con replaceState nada más abrir, sin esperar al cierre.
  await expect(page).not.toHaveURL(/sorteo/);
  await page.keyboard.press("Escape");
  await expect(stage).toBeHidden();
  await expect(page).toHaveURL(/\/coleccion\/rincon$/);

  // Segunda visita con navegación de cliente (no `goto`, que recarga): así el
  // Rincón puede seguir montado con Activity y la partida tiene que reabrirse igual.
  await page.getByRole("link", { name: "Volver a Biblioteca" }).click();
  await expect(page).toHaveURL(/\/coleccion$/);
  await page
    .getByRole("navigation", { name: "Herramientas de tu biblioteca" })
    .getByRole("link", { name: /sacar un lomo/i })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Sacar un lomo" }).getByRole("button", { name: "¡Tirar!" }),
  ).toBeVisible();
});
