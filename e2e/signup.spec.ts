import { test, expect } from "@playwright/test";

// Registro completo con una cuenta desechable. Se borra al final (incluida la
// fila de auth.users), como manda docs/TESTING.md.
test("registro completo: entra con perfil, sin pasar por onboarding", async ({ page, request }) => {
  const stamp = Date.now();
  const username = `e2e${stamp}`.slice(0, 20);
  const email = `${username}@example.com`;
  const password = "TestPassword123!";

  await page.goto("/signup");
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel(/^usuario$/i).fill(username);
  await expect(page.getByText(/^disponible$/i)).toBeVisible({ timeout: 8000 });
  await page.getByLabel(/contrase/i).fill(password);
  await page.getByRole("button", { name: /crear cuenta/i }).click();

  // Sin confirmación de email en dev → sesión inmediata y perfil ya creado:
  // debe aterrizar en el feed, NO en /onboarding.
  await page.waitForURL("/", { timeout: 20000 });
  expect(page.url()).not.toContain("onboarding");
  await expect(page.getByRole("heading", { name: /novedades/i })).toBeVisible();

  // Y el perfil existe con el @usuario elegido en el registro.
  await page.goto(`/u/${username}`);
  await expect(page.getByText(`@${username}`).first()).toBeVisible();

  // Limpieza: borrar el usuario (cascade borra el perfil).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const list = await request.get(`${url}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const users = (await list.json()).users as { id: string; email: string }[];
  const victim = users.find((u) => u.email === email);
  expect(victim, "el usuario de prueba debe existir para poder borrarlo").toBeTruthy();
  const del = await request.delete(`${url}/auth/v1/admin/users/${victim!.id}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  expect(del.ok()).toBeTruthy();
  console.log("LIMPIEZA OK: usuario", username, "borrado");
});
