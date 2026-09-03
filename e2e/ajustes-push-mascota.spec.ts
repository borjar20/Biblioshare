import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 3 de la mascota (spec 2026-09-02-mascota-avisos-push): el
// quinto interruptor de «Recibir avisos de» («Mascota») persiste en
// `notification_preferences.category_pet`. El barrido de las 20:00 NO se prueba
// aquí: no es accionable desde el navegador (se cubre con SQL en dev y con los
// unitarios de `deliverPetNudges`).
//
// Mismo patrón que mascota.spec.ts: fetch nativo con service-role para leer la
// fila, y la fila devuelta a como estaba al terminar (también si el test muere
// a mitad; ver el `afterAll`).

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

type PrefsRow = Record<string, unknown> & { user_id: string; category_pet: boolean };

// Sin fila = defaults (opt-out, `loadMyPreferences`): la categoría está activa.
async function categoryPetEnBD(userId: string): Promise<boolean> {
  const rows = (await (
    await api(`notification_preferences?user_id=eq.${userId}&select=category_pet`)
  ).json()) as Array<{ category_pet: boolean }>;
  return rows[0]?.category_pet ?? true;
}

let userId: string;
let baseline: PrefsRow | null = null;

test.beforeAll(async () => {
  const perfiles = (await (await api(`profiles?username=eq.${USERNAME}&select=user_id`)).json()) as Array<{
    user_id: string;
  }>;
  if (perfiles.length !== 1) throw new Error(`no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  const rows = (await (
    await api(`notification_preferences?user_id=eq.${userId}&select=*`)
  ).json()) as PrefsRow[];
  baseline = rows[0] ?? null;
});

test.afterAll(async () => {
  if (!userId) return;
  // El interruptor apagado silencia los avisos del usuario de pruebas para
  // siempre si el test muere a mitad: la fila vuelve a como estaba (o se borra,
  // si no había ninguna).
  await api(`notification_preferences?user_id=eq.${userId}`, { method: "DELETE" });
  if (baseline) await api("notification_preferences", { method: "POST", body: JSON.stringify(baseline) });
});

test("el interruptor «Mascota» de avisos persiste en notification_preferences.category_pet", async ({ page }) => {
  await login(page);
  await page.goto("/ajustes");

  const sw = page.getByRole("switch", { name: "Mascota" });
  await expect(sw).toBeVisible();
  // Arranca deshabilitado hasta que `loadMyPreferences()` responde.
  await expect(sw).toBeEnabled();

  const antes = (await sw.getAttribute("aria-checked")) === "true";

  await sw.click();
  // El interruptor es OPTIMISTA (notification-preferences.tsx: `setPrefs` antes
  // del `startTransition`), así que `aria-checked` cambia ANTES de que el server
  // action escriba: la comprobación que vale es la de PostgREST, y se sondea.
  await expect(sw).toHaveAttribute("aria-checked", String(!antes));
  await expect.poll(() => categoryPetEnBD(userId)).toBe(!antes);

  // Recargar: el valor pintado viene del servidor, no del estado optimista.
  await page.reload();
  const swTrasRecarga = page.getByRole("switch", { name: "Mascota" });
  // Primero `toBeEnabled`: hasta que `loadMyPreferences()` responde, el
  // interruptor pinta los defaults (todo activo) y `aria-checked` mentiría.
  await expect(swTrasRecarga).toBeEnabled();
  await expect(swTrasRecarga).toHaveAttribute("aria-checked", String(!antes));

  // Dejarlo como estaba.
  await swTrasRecarga.click();
  await expect(swTrasRecarga).toHaveAttribute("aria-checked", String(antes));
  await expect.poll(() => categoryPetEnBD(userId)).toBe(antes);
});
