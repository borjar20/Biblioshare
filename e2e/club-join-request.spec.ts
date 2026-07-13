import { test, expect, type APIRequestContext } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-private-club"; // privado, y devtest es su dueño

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// Cambiar de usuario NO es simplemente ir a /login: el middleware rebota a "/" a
// quien ya tiene sesión (AUTH_PATHS), y el formulario nunca aparece. Hay que
// tirar la sesión antes.
async function entrarComo(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Crea un usuario desechable con email ya confirmado y su perfil.
async function crearUsuario(request: APIRequestContext, username: string) {
  const email = `${username}@example.com`;
  const password = "TestPassword123!";

  const res = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  const user = await res.json();

  await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    data: { user_id: user.id, username },
  });

  return { id: user.id as string, email, password };
}

// Un club privado ya no da 404 a un extraño: le enseña su identidad y le deja
// pedir entrar. El contenido sigue siendo de sus miembros.
test("club privado: un extraño solicita entrar y el dueño lo aprueba", async ({
  page,
  request,
}) => {
  // Tres logins (forastero → dueño → forastero) no caben en los 30 s por defecto.
  test.setTimeout(120_000);

  const username = `e2ereq${Date.now()}`.slice(0, 20);
  const forastero = await crearUsuario(request, username);

  try {
    // ── 1. El forastero abre el club privado ──
    await entrarComo(page, forastero.email, forastero.password);

    await page.goto(`/club/${CLUB_SLUG}`);

    // Ve QUÉ es (identidad), no lo que hay dentro. Antes esto era un 404.
    await expect(
      page.getByRole("heading", { name: /test private club/i }),
    ).toBeVisible();
    // Y NADA del interior: ni feed, ni actividades, ni gestión.
    await expect(page.getByRole("link", { name: /^feed$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^gesti/i })).toHaveCount(0);

    // ── 2. Solicita entrar ──
    await page.getByRole("button", { name: /solicitar unirse/i }).click();
    await expect(
      page.getByRole("button", { name: /solicitud enviada/i }),
    ).toBeVisible();

    // La solicitud NO da acceso: sigue sin ver el interior.
    await page.reload();
    await expect(page.getByRole("link", { name: /^feed$/i })).toHaveCount(0);

    // ── 3. El dueño la ve en Gestión y la aprueba ──
    await entrarComo(page, EMAIL, PASSWORD);

    await page.goto(`/club/${CLUB_SLUG}?tab=gestion`);
    await expect(page.getByText(/solicitudes de entrada/i)).toBeVisible();

    // La fila de ESTE usuario, por testid: si otro test dejara solicitudes
    // sueltas, aprobar "la primera" aprobaría la de otro y el test mentiría.
    const fila = page.locator(`[data-testid="join-request"][data-username="${username}"]`);
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: /^aceptar$/i }).click();

    // Su solicitud desaparece de la lista (las de otros no son asunto de este test).
    await expect(fila).toHaveCount(0);

    // ── 4. Ahora sí es miembro: la BD manda, no la UI ──
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/club_members?user_id=eq.${forastero.id}&select=status,role`,
      { headers: adminHeaders() },
    );
    const [membresia] = await res.json();
    expect(membresia.status).toBe("active");
    expect(membresia.role).toBe("member");

    // ── 5. Y ya ve el interior ──
    await entrarComo(page, forastero.email, forastero.password);
    await page.goto(`/club/${CLUB_SLUG}`);
    await expect(page.getByRole("link", { name: /^feed$/i })).toBeVisible();
    console.log("SOLICITUD OK:", username, "-> miembro activo");
  } finally {
    // fetch nativo, NO el `request` de Playwright: ese fixture muere junto con el
    // contexto del navegador, así que si el test expira la limpieza no llega a
    // ejecutarse y deja usuarios y solicitudes sueltos en la base (pasó).
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${forastero.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    console.log("LIMPIEZA OK: usuario", username, "borrado");
  }
});
