import { expect, test, type Page } from "@playwright/test";

// E2E de la mascota (spec 2026-09-02): eclosión, compañera en el shell (y su
// ausencia en pantallas a sangre), reacción al registrar actividad y ocultar
// desde ajustes. Mismo patrón de sesión/limpieza que
// biblioteca-ocultar-abandonados.spec.ts: fetch nativo con service-role y la
// fila devuelta a como estaba.

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

type PetRow = { user_id: string; name: string; class: string; companion_hidden: boolean; last_level: number; last_stage: string };

let userId: string;
let baseline: PetRow | null = null;

test.beforeAll(async () => {
  const perfiles = (await (await api(`profiles?username=eq.${USERNAME}&select=user_id`)).json()) as Array<{ user_id: string }>;
  if (perfiles.length !== 1) throw new Error(`no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  const rows = (await (await api(`pet_state?user_id=eq.${userId}&select=user_id,name,class,companion_hidden,last_level,last_stage`)).json()) as PetRow[];
  baseline = rows[0] ?? null;
  // Arranca SIN mascota para probar la eclosión.
  await api(`pet_state?user_id=eq.${userId}`, { method: "DELETE" });
});

test.afterAll(async () => {
  await api(`pet_state?user_id=eq.${userId}`, { method: "DELETE" });
  if (baseline) await api("pet_state", { method: "POST", body: JSON.stringify(baseline) });
});

test("eclosión: nombre + clase → detalle; compañera en el shell; ausente en pantalla a sangre", async ({ page }) => {
  await login(page);

  await page.goto("/mascota");
  await expect(page.getByTestId("hatch-form")).toBeVisible();
  await page.fill('input[name="name"]', "Nuez");
  await page.locator('input[name="class"][value="wizard"]').check({ force: true });
  await page.getByRole("button", { name: "Eclosionar" }).click();

  await expect(page.getByTestId("pet-detail")).toBeVisible();
  await expect(page.getByTestId("pet-name")).toHaveText("Nuez");

  await page.goto("/coleccion");
  await expect(page.getByTestId("pet-companion")).toBeVisible();

  await page.goto("/partida/activa");
  await expect(page.getByTestId("pet-companion")).toHaveCount(0);
});

test("la compañera se oculta desde ajustes y vuelve", async ({ page }) => {
  await login(page);
  await page.goto("/ajustes");
  const toggle = page.getByTestId("pet-companion-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  // El interruptor es optimista (pet-companion-toggle.tsx): `aria-checked`
  // cambia en el propio click, ANTES de que el server action escriba en
  // `pet_state`. Mismo patrón que hide-dropped-toggle en
  // biblioteca-ocultar-abandonados.spec.ts: navegar de inmediato gana la
  // carrera contra la escritura y el chrome recién montado en /coleccion lee
  // el valor viejo. Se espera la respuesta del POST del propio server action
  // antes de navegar.
  const escrituraOculta = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().includes("/ajustes") && res.request().postData() === "[true]",
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await escrituraOculta;

  await page.goto("/coleccion");
  await expect(page.getByTestId("pet-companion")).toHaveCount(0);

  await page.goto("/ajustes");
  const escrituraVisible = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().includes("/ajustes") && res.request().postData() === "[false]",
  );
  await page.getByTestId("pet-companion-toggle").click();
  await escrituraVisible;
  await page.goto("/coleccion");
  await expect(page.getByTestId("pet-companion")).toBeVisible();
});

test("sin sesión no hay compañera", async ({ page }) => {
  await page.goto("/buscar");
  await expect(page.getByTestId("pet-companion")).toHaveCount(0);
});
