import { test, expect } from "@playwright/test";

// Registro completo con una cuenta desechable. Se borra al final (incluida la
// fila de auth.users), como manda docs/TESTING.md.
//
// CAMBIO DE COMPORTAMIENTO (spec 2026-07-20): antes este test afirmaba que el
// registro entraba directo al feed «sin pasar por onboarding». Ahora el
// asistente de 3 pasos SÍ se ofrece, una sola vez, justo después de registrarse
// — que es su único momento. Lo que se sigue comprobando es que el perfil queda
// creado con el @usuario del registro y que se llega al feed al terminar.
test("registro completo: pasa por el onboarding y entra con perfil", async ({ page, request }) => {
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

  // Sin confirmación de email en dev → sesión inmediata y perfil ya creado, y
  // desde ahí al asistente.
  await page.waitForURL(/\/onboarding/, { timeout: 20000 });
  await expect(page.getByRole("heading", { name: "¿Qué te gusta seguir?" })).toBeVisible();

  // Se salta entero: el asistente nunca debe ser un muro. Cada «Saltar» avanza
  // sin guardar, y el número de pasos depende de si hay gente que sugerir.
  await page.getByRole("link", { name: "Saltar" }).click();
  await expect(page).toHaveURL(/paso=2/, { timeout: 30000 });
  await page.getByRole("link", { name: "Saltar" }).click();
  await expect(page).toHaveURL(/paso=(3|fin)/, { timeout: 30000 });
  if (/paso=3/.test(page.url())) {
    await page.getByRole("link", { name: "Saltar" }).click();
    await expect(page).toHaveURL(/paso=fin/, { timeout: 30000 });
  }

  await page.getByRole("button", { name: "Entrar a Biblioshare" }).click();
  await page.waitForURL("/", { timeout: 20000 });
  // Un árbol de cabecera por breakpoint (plan 01): a 1280 se ve el saludo y
  // "Novedades" queda oculta en el DOM, así que el locator lleva :visible.
  await expect(page.locator("h1:visible")).toHaveText(/hola,|novedades/i);

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
