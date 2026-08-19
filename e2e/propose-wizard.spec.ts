import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El asistente crea la actividad con su pool y sus hitos de un tirón. Este test
// lo comprueba de punta a punta y se autolimpia (borra la actividad que crea;
// items y checkpoints caen por cascade).
test("asistente: propone una lectura conjunta ya montada (ítem + hitos)", async ({
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
  // `link`, no `button`: el CTA que ABRE el asistente es un <a href=?nueva=1>
  // desde el rediseño de la pestaña Actividades (#598). El botón homónimo que
  // queda es el SUBMIT de dentro del asistente.
  await page
    .getByRole("link", { name: /proponer actividad/i })
    .first()
    .click();

  // ── Paso 1: común + tarjetas de tipo ──
  const titulo = `e2e lectura ${Date.now()}`;
  await page.getByLabel(/^título$/i).fill(titulo);
  await expect(page.getByText(/un ítem, por tramos con hitos/i)).toBeVisible();
  await page.getByRole("button", { name: /lectura conjunta/i }).click();
  await page.getByRole("button", { name: /^continuar$/i }).click();

  // ── Paso 2 ──
  // Sin ítem elegido, el editor de hitos pide elegirlo primero: no se puede
  // marcar una posición sin saber si es libro (página) o serie (episodio).
  await expect(page.getByText(/elige primero el ítem/i)).toBeVisible();

  await page.getByRole("button", { name: /^añadir ítem$/i }).click();
  const opcion = page.locator("button").filter({ has: page.locator("img") });
  await opcion.first().waitFor({ timeout: 15000 });
  const elegido = (await opcion.first().innerText()).split("\n")[0];
  await opcion.first().click();

  // Con el ítem puesto, el editor de hitos ya sabe qué posición pedir.
  await expect(page.getByText(/elige primero el ítem/i)).toHaveCount(0);
  await page.getByRole("button", { name: /añadir hito/i }).click();
  await page.screenshot({ path: "shots/wizard-2.png", fullPage: true });

  await page.getByPlaceholder(/hito/i).first().fill("Primer tramo");
  await page.getByPlaceholder(/p.g/i).first().fill("120");

  await page.getByRole("button", { name: /^proponer actividad$/i }).click();

  // OJO con este assert. La primera versión comprobaba `getByText(titulo)`, y
  // daba FALSO VERDE: el asistente muestra el título en su propia cabecera, así
  // que el texto estaba en pantalla aunque el submit fallara y no se creara
  // nada. Ahora se comprueba la TARJETA de la actividad — un enlace a su ficha —
  // que solo existe si la actividad se creó de verdad.
  const tarjeta = page.locator('a[href*="/actividad/"]').filter({ hasText: titulo });
  await expect(tarjeta).toBeVisible({ timeout: 15000 });

  // Y que el asistente se cerró (si el submit falla, sigue abierto). El botón
  // "Proponer actividad" es el SUBMIT del asistente y solo existe con el
  // asistente abierto: cerrado, no debe quedar ninguno. Antes se esperaba 1
  // porque el CTA que abre el asistente también era un botón; desde #598 es un
  // enlace, así que se comprueba aparte que ese sigue ahí — sin esa segunda
  // aserción, un "0 botones" sería trivialmente cierto en una página vacía.
  await expect(page.getByRole("button", { name: /^proponer actividad$/i })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /proponer actividad/i }).first(),
  ).toBeVisible();

  console.log("PROPUESTA OK:", titulo, "| item:", elegido);

  // ── Y nació MONTADA: con su ítem y su hito, no vacía ──
  // Esto es lo que de verdad se está probando. La UI puede enseñar la tarjeta y
  // la actividad estar vacía por dentro.
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(titulo)}&select=id,status,club_activity_items(id),club_activity_checkpoints(id,label,position,due_on)`,
    { headers },
  );
  const [creada] = await res.json();
  expect(creada, "la actividad debe existir en la base").toBeTruthy();
  expect(creada.status).toBe("proposed");
  expect(creada.club_activity_items).toHaveLength(1);
  expect(creada.club_activity_checkpoints).toHaveLength(1);
  expect(creada.club_activity_checkpoints[0].position).toEqual({ page: 120 });

  // Limpieza: borrar la actividad (items y checkpoints van por cascade).
  const del = await request.delete(
    `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${creada.id}`,
    { headers },
  );
  expect(del.ok()).toBeTruthy();
  console.log("LIMPIEZA OK: actividad", creada.id, "borrada");
});
