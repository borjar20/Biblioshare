import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Un moderador marca una fecha en el club. Se comprueba que se crea de verdad
// (no solo que se pinte), que NO navega a ninguna ficha, y que su URL de detalle
// devuelve 404. Se autolimpia.
test("evento: se crea, aparece en la lista y no tiene ficha", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 420, height: 1100 });
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto("/club/test-public-club?tab=actividades");
  await page.getByRole("button", { name: /proponer actividad/i }).first().click();

  const titulo = `e2e evento ${Date.now()}`;
  await page.getByLabel(/^título$/i).fill(titulo);
  // OJO con el ancla: la tarjeta de kind contiene el nombre Y su descripción, así
  // que su nombre accesible es "Evento Una fecha señalada del club". Un
  // /^evento$/ no casaría y el test fallaría sin que nada estuviera roto.
  await page.getByRole("button", { name: /^evento\b/i }).click();
  await page.getByRole("button", { name: /^continuar$/i }).click();

  // Paso 2 de un evento: SOLO la fecha. Si aparece el pool de ítems, la rama
  // del asistente no se está aplicando.
  await expect(page.getByRole("button", { name: /^añadir ítem$/i })).toHaveCount(0);
  await page.getByLabel(/^fecha$/i).fill("2027-03-15");
  await page.getByRole("button", { name: /^crear evento$/i }).click();

  // Existe en la BD. Se comprueba antes que la pantalla: la UI puede pintar el
  // título desde su propio estado aunque el submit falle (falso verde ya visto
  // en propose-wizard.spec.ts).
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  let creado: { id: string; status: string; kind: string; starts_on: string } | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(titulo)}&select=id,status,kind,starts_on`,
          { headers },
        );
        [creado] = await res.json();
        return creado?.id ?? null;
      },
      { timeout: 15000 },
    )
    .not.toBeNull();

  expect(creado!.kind).toBe("evento");
  expect(creado!.status).toBe("active"); // nace activo, no propuesto
  expect(creado!.starts_on).toBe("2027-03-15");

  // La tarjeta se ve bajo su grupo...
  await expect(page.getByText("Fechas señaladas")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(titulo).first()).toBeVisible();

  // ...y NO enlaza a ninguna ficha. Se comprueba que la URL no cambia, no solo
  // que falte un <a>: lo que rompería de verdad es que el envoltorio condicional
  // se invierta y la tarjeta vuelva a ser un Link.
  await expect(
    page.locator(`a[href*="/actividad/"]`).filter({ hasText: titulo }),
  ).toHaveCount(0);
  const urlAntes = page.url();
  await page.getByText(titulo).first().click();
  await page.waitForTimeout(500);
  expect(page.url()).toBe(urlAntes);

  // Y su ficha, pedida a mano, da 404.
  const respuesta = await page.goto(
    `/club/test-public-club/actividad/${creado!.id}`,
  );
  expect(respuesta?.status()).toBe(404);

  // Limpieza.
  const del = await request.delete(
    `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${creado!.id}`,
    { headers },
  );
  expect(del.ok()).toBeTruthy();
  console.log("LIMPIEZA OK: evento", creado!.id, "borrado");
});
