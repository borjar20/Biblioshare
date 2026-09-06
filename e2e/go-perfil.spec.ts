import { test, expect } from "@playwright/test";

const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// /go/<uuid> es el enlace que va grabado en soportes físicos (tarjeta NFC,
// spec 2026-09-04-enlace-estable-perfil-nfc-design.md). Se prueba SIN sesión a
// propósito: quien acerca la tarjeta al móvil no tiene por qué estar logueado,
// y una regresión que lo mandase a /login dejaría la tarjeta muda.

async function devtestId(): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

test.describe("/go/[id] — enlace estable al perfil", () => {
  test.skip(!USERNAME || !SERVICE_KEY, "requiere TEST_USER_USERNAME y SUPABASE_SERVICE_ROLE_KEY");

  test("responde 307 con Location /u/<username>", async ({ request }) => {
    const id = await devtestId();
    const res = await request.get(`/go/${id}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(new URL(res.headers()["location"]).pathname).toBe(`/u/${USERNAME}`);
  });

  test("un visitante anónimo acaba en el perfil, no en /login", async ({ page }) => {
    const id = await devtestId();
    await page.goto(`/go/${id}`);
    await page.waitForURL((u) => u.pathname === `/u/${USERNAME}`);
    await expect(page.getByText(`@${USERNAME}`).first()).toBeVisible();
  });

  test("404 con un id que no es uuid y con un uuid sin perfil", async ({ request }) => {
    expect((await request.get("/go/marta", { maxRedirects: 0 })).status()).toBe(404);
    const huerfano = "00000000-0000-4000-8000-000000000000";
    expect((await request.get(`/go/${huerfano}`, { maxRedirects: 0 })).status()).toBe(404);
  });
});
