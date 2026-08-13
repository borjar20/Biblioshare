import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// La pestaña Actividades rediseñada (spec 2026-08-12, Task 10): secciones "En
// curso" / "Próximas" / "Historial", estados vacíos con y sin CTA, el asistente
// de propuesta que abre/cierra por querystring, y los chips de navegación por
// ancla. Nadie la había visto funcionar con sesión de miembro real todavía:
// quien montó la pantalla solo comprobó un 200 sin login. Este spec es, por
// ahora, la única verificación de que hace lo que dice.
//
// Un solo club sembrado con UNA actividad activa sin `startsOn` (así entra en
// "en curso" por la regla `!a.startsOn || a.startsOn <= today` de
// groupActivities) basta para las cuatro pruebas: "Próximas" e "Historial"
// quedan vacías por construcción, que es justo el estado que Task 11 tiene que
// cubrir.

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

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

async function devtestId(): Promise<string> {
  const rows = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
      { headers: adminHeaders() },
    )
  ).json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

async function anyBook(): Promise<string> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/books?select=id&limit=1`, { headers: adminHeaders() })
  ).json()) as { id: string }[];
  if (!rows[0]) throw new Error("no hay libros en catálogo para el e2e");
  return rows[0].id;
}

test.describe("pestaña Actividades", () => {
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-act-page-${ts}`;
  let clubId: string | null = null;
  let activityId: string | null = null;

  test.beforeAll(async () => {
    const owner = await devtestId();
    const bookId = await anyBook();

    const [club] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          slug,
          name: "Actividades Page E2E",
          visibility: "private",
          owner_id: owner,
        }),
      })
    ).json()) as { id: string }[];
    clubId = club.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ club_id: clubId, user_id: owner, role: "owner", status: "active" }),
    });

    // Activa, sin `startsOn`: cae en "en curso" (nunca dijo cuándo empieza).
    const [activity] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          club_id: clubId,
          kind: "list_challenge",
          title: `en curso ${ts}`,
          status: "active",
          created_by: owner,
        }),
      })
    ).json()) as { id: string }[];
    activityId = activity.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({
        activity_id: activityId,
        item_type: "book",
        item_id: bookId,
        added_by: owner,
        position: 0,
      }),
    });
  });

  test.afterAll(async () => {
    if (activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  });

  test.beforeEach(async ({ page }) => {
    await entrarComo(page, EMAIL, PASSWORD);
  });

  test("un club con una sola actividad activa sigue pareciendo una vista completa", async ({
    page,
  }) => {
    await page.goto(`/club/${slug}?tab=actividades`);

    // Anclado al " · " del contador (groupOngoing/groupUpcoming/groupHistory):
    // el rail de la derecha tiene su propio "Próximas fechas", y un regex
    // suelto /Próximas/ también lo cazaría a él, rompiendo el modo estricto.
    await expect(page.getByRole("heading", { name: /^En curso ·/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Próximas ·/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Historial ·/ })).toBeVisible();
  });

  test("el estado vacío de Próximas ofrece proponer, y el de Historial no", async ({ page }) => {
    await page.goto(`/club/${slug}?tab=actividades`);

    await expect(page.getByText("No hay próximas actividades")).toBeVisible();
    await expect(page.getByText("Todavía no hay actividades terminadas")).toBeVisible();
    // El historial se llena solo: no hay nada que ofrecer ahí. El botón lleva el
    // texto "Proponer actividad" (el "+" es aparte, aria-hidden).
    const historial = page.locator("#historial");
    await expect(historial.getByRole("link", { name: "Proponer actividad" })).toHaveCount(0);
    // Próximas sí lo ofrece.
    const proximas = page.locator("#proximas");
    await expect(proximas.getByRole("link", { name: "Proponer actividad" })).toBeVisible();
  });

  test("?nueva=1 abre el asistente y cerrarlo lo quita de la URL", async ({ page }) => {
    await page.goto(`/club/${slug}?tab=actividades&nueva=1`);

    // El asistente es un panel con h2 "Proponer actividad" (paso 1), no un
    // botón: en escritorio el botón de la cabecera del shell se oculta
    // mientras el asistente está abierto (son mutuamente excluyentes).
    await expect(page.getByRole("heading", { name: "Proponer actividad" })).toBeVisible();

    // Cerrarlo es el botón "Cerrar" (una X, aria-label="Cerrar"), no "Cancelar".
    await page.getByRole("button", { name: "Cerrar" }).click();
    await expect(page).toHaveURL(new RegExp(`tab=actividades$`));
    await expect(page.getByRole("heading", { name: "Proponer actividad" })).toHaveCount(0);
  });

  test("los chips llevan a su sección", async ({ page }) => {
    await page.goto(`/club/${slug}?tab=actividades`);

    // Los chips son anclas (<a href="#...">), no botones.
    await page.getByRole("link", { name: "Historial", exact: true }).click();
    await expect(page).toHaveURL(/#historial$/);

    await page.getByRole("link", { name: "En curso", exact: true }).click();
    await expect(page).toHaveURL(/#en-curso$/);
  });
});
