import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 2 (spec 2026-09-02-mascota-misiones-logros): abrir /mascota
// crea tres misiones; registrar 20 minutos cumple session_minutes si tocó (si
// no tocó, se fuerza la fila) y la celebración se drena; la galería enseña
// logros bloqueados con progreso. Mismo patrón de sesión/limpieza que
// mascota.spec.ts: fetch nativo con service-role y filas devueltas a como estaban.
//
// progress_sessions.insert (ver src/lib/sessions/actions.ts): user_id, pass_id,
// duration_minutes, session_date, position son las columnas que escribe addSession;
// started_at es nullable (20260717_progress_sessions_started_at.sql — `add column
// started_at timestamptz;` sin NOT NULL) así que el POST de test no lo necesita.

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

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let userId: string;
let hadPet = false;

test.beforeAll(async () => {
  const perfiles = (await (await api(`profiles?username=eq.${USERNAME}&select=user_id`)).json()) as Array<{ user_id: string }>;
  if (perfiles.length !== 1) throw new Error(`no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  const pets = (await (await api(`pet_state?user_id=eq.${userId}&select=user_id`)).json()) as unknown[];
  hadPet = pets.length === 1;
  if (!hadPet) {
    await api("pet_state", { method: "POST", body: JSON.stringify({ user_id: userId, name: "Nuez", class: "barbarian" }) });
  }
  await api(`pet_daily_missions?user_id=eq.${userId}`, { method: "DELETE" });
  await api(`user_celebrations?user_id=eq.${userId}&event_type=in.(pet_mission_done,pet_achievement)`, { method: "DELETE" });
});

test.afterAll(async () => {
  await api(`pet_daily_missions?user_id=eq.${userId}`, { method: "DELETE" });
  await api(`user_celebrations?user_id=eq.${userId}&event_type=in.(pet_mission_done,pet_achievement)`, { method: "DELETE" });
  await api(`progress_sessions?user_id=eq.${userId}&session_date=eq.${localDay()}&duration_minutes=eq.20`, { method: "DELETE" });
  if (!hadPet) await api(`pet_state?user_id=eq.${userId}`, { method: "DELETE" });
});

test("abrir /mascota crea tres misiones del día y pinta la galería de logros", async ({ page }) => {
  await login(page);
  await page.goto("/mascota?view=diary");
  await expect(page.getByTestId("mission-board").filter({ visible: true })).toBeVisible();
  // La MISMA visita que genera las misiones ya las pinta (#1028: antes había
  // que recargar porque el render releía el resultado memoizado de antes del
  // insert). Si esto vuelve a necesitar un segundo goto, el bug ha vuelto.
  await expect(page.getByTestId("mission-board").filter({ visible: true }).locator("li")).toHaveCount(3);
  const rows = (await (await api(`pet_daily_missions?user_id=eq.${userId}&day=eq.${localDay()}&select=slot,template`)).json()) as Array<{ slot: number; template: string }>;
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((r) => r.template)).size).toBe(3);

  await page.getByRole("button", { name: "Logros", exact: true }).click();
  await expect(page.getByTestId("achievement-grid")).toBeVisible();
  // Una tarjeta por familia, con su nivel y el siguiente umbral visible.
  const cards = page.getByTestId("achievement-grid").locator("li[data-testid^='achievement-']");
  await expect(cards).toHaveCount(11);
  await expect(page.getByTestId("achievement-posts")).toHaveAttribute("data-tier", /^\d+$/);
  await expect(page.getByTestId("achievement-posts").getByText("Siguiente")).toBeVisible();
  // Tras la migración 20260904 no queda ninguna clave plana.
  const flat = (await (await api(`user_celebrations?user_id=eq.${userId}&event_type=eq.pet_achievement&event_key=not.like.pet_achievement:*:*&select=event_key`)).json()) as unknown[];
  expect(flat).toHaveLength(0);
});

test("una sesión de 20 minutos cumple session_minutes y se gana la celebración", async ({ page }) => {
  await login(page);
  await page.goto("/mascota?view=diary");
  await expect(page.getByTestId("mission-board").filter({ visible: true })).toBeVisible();

  // Fija las TRES plantillas del día (el sorteo es determinista pero depende
  // del usuario de prueba): la fila manda sobre el generador. Se parchean los
  // tres huecos, no solo el 0, porque si el sorteo ya había puesto
  // session_minutes en otro hueco habría DOS filas con esa plantilla y
  // `mission-session_minutes` resolvería dos elementos (fallo por estricto).
  const fixed = [
    { slot: 0, template: "session_minutes", target: 20 },
    { slot: 1, template: "note", target: 1 },
    { slot: 2, template: "quote", target: 1 },
  ];
  for (const f of fixed) {
    await api(`pet_daily_missions?user_id=eq.${userId}&day=eq.${localDay()}&slot=eq.${f.slot}`, {
      method: "PATCH",
      body: JSON.stringify({ template: f.template, target: f.target, xp: 2, item_type: null, item_id: null, item_title: null, completed_at: null }),
    });
  }

  // Un pase abierto cualquiera del usuario para colgar la sesión.
  const passes = (await (await api(`passes?user_id=eq.${userId}&status=eq.in_progress&select=id&limit=1`)).json()) as Array<{ id: string }>;
  test.skip(passes.length === 0, "el usuario de prueba no tiene ningún pase en curso");
  await api("progress_sessions", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, pass_id: passes[0].id, duration_minutes: 20, session_date: localDay(), position: {} }),
  });

  await page.goto("/mascota?view=diary");
  const mission = page.getByTestId("mission-session_minutes").filter({ visible: true });
  await expect(mission).toHaveAttribute("data-completed", "true");

  const won = (await (await api(`user_celebrations?user_id=eq.${userId}&event_type=eq.pet_mission_done&select=event_key`)).json()) as Array<{ event_key: string }>;
  expect(won.some((w) => w.event_key === `pet_mission_done:${localDay()}:0`)).toBe(true);
});
