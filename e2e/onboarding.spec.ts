import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El asistente solo se ve con onboarded_at a null, así que cada test lo pone a
// null antes y lo restaura después — el estado normal de la cuenta de pruebas
// es "ya onboardeada", como el resto de perfiles.
async function setOnboardedAt(value: string | null) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${USERNAME}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ onboarded_at: value }),
    },
  );
  if (!res.ok) throw new Error(`no se pudo fijar onboarded_at: ${res.status}`);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  // El proxy cachea "ya onboardeado" en una cookie por usuario; al forzar el
  // estado por debajo hay que tirarla, o el gate decide con el valor viejo.
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("onboarding", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await setOnboardedAt(new Date().toISOString());
  });

  test("recorrido completo hasta la bienvenida", async ({ page }) => {
    await setOnboardedAt(null);
    await login(page);

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "¿Qué te gusta seguir?" })).toBeVisible();

    // Paso 1: sin elegir nada, Continuar está bloqueado.
    const continuar = page.getByRole("button", { name: /^Continuar/ });
    await expect(continuar).toBeDisabled();

    await page.getByRole("button", { name: "Libros" }).click();
    await expect(continuar).toBeEnabled();
    await continuar.click();

    // Paso 2: la rejilla de sugerencias.
    await expect(page).toHaveURL(/paso=2/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Añade algo para empezar" })).toBeVisible();

    // Se avanza hasta el final; el paso 3 solo aparece si hay a quién sugerir,
    // así que se acepta cualquiera de los dos botones.
    //
    // OJO: hay que ESPERAR a que la URL cambie antes de mirarla. `router.push`
    // es asíncrono, así que un `page.url()` justo después del clic devuelve la
    // anterior y la rama del paso 3 se salta sola.
    await page.getByRole("button", { name: /^(Continuar|Terminar)/ }).click();
    await expect(page).toHaveURL(/paso=(3|fin)/, { timeout: 30_000 });

    if (/paso=3/.test(page.url())) {
      await expect(page.getByRole("heading", { name: "Encuentra a tu gente" })).toBeVisible();
      await page.getByRole("button", { name: "Terminar" }).click();
      await expect(page).toHaveURL(/paso=fin/, { timeout: 30_000 });
    }

    await expect(page.getByRole("heading", { name: /^Todo listo/ })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Entrar a Biblioshare" }).click();
    await page.waitForURL("/");
  });

  test("el gate: una vez terminado, /onboarding lleva a la home", async ({ page }) => {
    await setOnboardedAt(new Date().toISOString());
    await login(page);

    await page.goto("/onboarding");
    await page.waitForURL("/");
  });

  test("un ?paso= inválido cae al primero, sin 404", async ({ page }) => {
    await setOnboardedAt(null);
    await login(page);

    await page.goto("/onboarding?paso=99");
    await expect(page.getByRole("heading", { name: "¿Qué te gusta seguir?" })).toBeVisible();
  });

  test("saltar los pasos también termina el onboarding", async ({ page }) => {
    await setOnboardedAt(null);
    await login(page);

    await page.goto("/onboarding");
    // «Saltar» lleva al mismo sitio que «Continuar», solo que sin guardar.
    await page.getByRole("link", { name: "Saltar" }).click();
    await expect(page).toHaveURL(/paso=2/, { timeout: 30_000 });

    await page.getByRole("link", { name: "Saltar" }).click();
    await expect(page).toHaveURL(/paso=(3|fin)/, { timeout: 30_000 });
    if (/paso=3/.test(page.url())) {
      await page.getByRole("link", { name: "Saltar" }).click();
    }

    await expect(page.getByRole("heading", { name: /^Todo listo/ })).toBeVisible({
      timeout: 30_000,
    });
  });
});
