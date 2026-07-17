import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// PNG 8x8 rojo, VÁLIDO y decodable por createImageBitmap. Ojo: un PNG 1x1 NO
// sirve — Chromium lo rechaza con "source image could not be decoded" y
// toSquareWebp lanzaría, dando un falso resultado. Este tiene varios píxeles.
const PNG_8x8 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=",
  "base64"
);

// Sube un avatar y comprueba que la server action devolvió una URL FRESCA del
// bucket `avatars` (con un ?v= posterior al inicio del test). Esto prueba una
// subida NUEVA con service-role (la subida directa de usuario daba RLS 403); no
// basta con ver "una imagen del bucket avatars", porque el avatar inicial ya es
// una. Limpieza: borra el objeto subido.
test("subir avatar: la server action devuelve una URL fresca de Storage", async ({ page, request }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const testStart = Date.now();

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}`);
  await page.getByRole("button", { name: /editar perfil/i }).click();

  await page.setInputFiles('input[type="file"]', {
    name: "avatar.png",
    mimeType: "image/png",
    buffer: PNG_8x8,
  });

  // El input oculto avatarUrl solo se rellena con la URL pública (con ?v= de
  // cache-bust) cuando uploadAvatar TIENE ÉXITO. El valor inicial ya apunta al
  // bucket avatars, así que no basta con "contiene /avatars/": hay que esperar a
  // un ?v= posterior al inicio del test, que solo aparece tras una subida nueva.
  const hidden = page.locator('input[name="avatarUrl"]');
  await expect
    .poll(
      async () => {
        const value = (await hidden.inputValue()) || "";
        if (!value.includes("/storage/v1/object/public/avatars/")) return 0;
        return Number(new URL(value).searchParams.get("v")) || 0;
      },
      { timeout: 15_000 }
    )
    .toBeGreaterThanOrEqual(testStart);

  // Y no debe verse el error de avatar.
  await expect(page.getByText(/no se pudo subir el avatar|avatarError/i)).toHaveCount(0);

  // Limpieza: borrar el objeto {uid}/avatar.webp que dejó la subida. El uid se
  // obtiene del admin API por email (mismo patrón que signup.spec.ts).
  const list = await request.get(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const users = (await list.json()).users as { id: string; email: string }[];
  const uid = users.find((u) => u.email === EMAIL)?.id;
  if (uid) {
    await request.post(`${SUPABASE_URL}/storage/v1/object/remove/avatars`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      data: { prefixes: [`${uid}/avatar.webp`] },
    });
  }
});
