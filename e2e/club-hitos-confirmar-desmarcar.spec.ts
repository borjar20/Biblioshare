import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Confirmar en dos pasos y desmarcar en cascada un hito de lectura conjunta
// (spec 2026-08-12, docs/superpowers/specs/2026-08-12-hitos-confirmar-y-desmarcar-design.md).
// Nadie había visto esta pantalla funcionar con sesión real: quien implementó
// confirm/unconfirm no pudo autenticarse en el navegador. Este spec es, por
// ahora, la única verificación de que hace lo que dice.
//
// Confirmar exige ser PARTICIPANTE de la actividad, no solo miembro del club
// (is_activity_participant, vía club_activity_participants) -- si el usuario
// de prueba solo estuviera en el club, el botón "Ya llegué aquí" ni
// aparecería y los tres tests fallarían por el motivo equivocado.
//
// confirm_checkpoint/unconfirm_checkpoint son autodeclarados desde #471: no
// comprueban la posición del lector contra `passes`, así que no hace falta
// sembrar progreso de lectura -- solo participación, ítem en el pool y hitos.

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

async function crearClub(slug: string, owner: string): Promise<string> {
  const [club] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: "Hitos Confirmar/Desmarcar E2E",
        visibility: "private",
        owner_id: owner,
      }),
    })
  ).json()) as { id: string }[];

  await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ club_id: club.id, user_id: owner, role: "owner", status: "active" }),
  });

  return club.id;
}

async function crearActividadBuddyRead(
  clubId: string,
  owner: string,
  title: string,
): Promise<string> {
  const [activity] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        club_id: clubId,
        kind: "buddy_read",
        title,
        status: "active",
        created_by: owner,
      }),
    })
  ).json()) as { id: string }[];
  return activity.id;
}

async function anadirItem(activityId: string, bookId: string, owner: string) {
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
}

async function anadirParticipante(activityId: string, userId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ activity_id: activityId, user_id: userId }),
  });
}

async function crearHito(
  activityId: string,
  owner: string,
  label: string,
  position: Record<string, number>,
  order: number,
): Promise<string> {
  const [checkpoint] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_checkpoints`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        activity_id: activityId,
        label,
        position,
        order,
        created_by: owner,
      }),
    })
  ).json()) as { id: string }[];
  return checkpoint.id;
}

// Siembra directa de "confirmado" saltándose la RPC: club_activity_checkpoint_reads
// no tiene política de escritura de cliente a propósito (solo confirm_checkpoint la
// escribe), pero el rol de servicio bypassa RLS igual que bypassa cualquier otra
// tabla aquí. Sirve para dejar el hito 3 pre-confirmado sin depender de que el test
// de "confirmar" haya corrido antes.
async function confirmarComoAdmin(checkpointId: string, userId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/club_activity_checkpoint_reads`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ checkpoint_id: checkpointId, user_id: userId }),
  });
}

async function borrarActividad(activityId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

test.describe("confirmar y desmarcar hitos de una lectura conjunta", () => {
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-hitos-${ts}`;
  let clubId: string | null = null;
  // Una actividad por escenario -- evita que el estado que deja un test
  // (confirmado/no confirmado) contamine el siguiente.
  let activityPreguntaId: string | null = null;
  let activityConfirmarId: string | null = null;
  let activityDesmarcarId: string | null = null;

  test.beforeAll(async () => {
    const owner = await devtestId();
    const bookId = await anyBook();
    clubId = await crearClub(slug, owner);

    activityPreguntaId = await crearActividadBuddyRead(clubId, owner, `pregunta ${ts}`);
    await anadirItem(activityPreguntaId, bookId, owner);
    await anadirParticipante(activityPreguntaId, owner);
    await crearHito(activityPreguntaId, owner, "Capítulo 1", { page: 50 }, 0);

    activityConfirmarId = await crearActividadBuddyRead(clubId, owner, `confirmar ${ts}`);
    await anadirItem(activityConfirmarId, bookId, owner);
    await anadirParticipante(activityConfirmarId, owner);
    await crearHito(activityConfirmarId, owner, "Capítulo 1", { page: 50 }, 0);

    activityDesmarcarId = await crearActividadBuddyRead(clubId, owner, `desmarcar ${ts}`);
    await anadirItem(activityDesmarcarId, bookId, owner);
    await anadirParticipante(activityDesmarcarId, owner);
    const h1 = await crearHito(activityDesmarcarId, owner, "Capítulo 1", { page: 50 }, 0);
    const h2 = await crearHito(activityDesmarcarId, owner, "Capítulo 2", { page: 100 }, 1);
    const h3 = await crearHito(activityDesmarcarId, owner, "Capítulo 3", { page: 150 }, 2);
    await confirmarComoAdmin(h1, owner);
    await confirmarComoAdmin(h2, owner);
    await confirmarComoAdmin(h3, owner);
  });

  test.afterAll(async () => {
    if (activityPreguntaId) await borrarActividad(activityPreguntaId);
    if (activityConfirmarId) await borrarActividad(activityConfirmarId);
    if (activityDesmarcarId) await borrarActividad(activityDesmarcarId);
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

  test("una sola pulsación no marca el hito: hace falta confirmar", async ({ page }) => {
    await page.goto(`/club/${slug}/actividad/${activityPreguntaId}`);

    await page.getByRole("button", { name: "Ya llegué aquí" }).first().click();
    // Aparece la pregunta, y el hito NO se ha marcado todavía.
    await expect(page.getByRole("button", { name: "Sí" })).toBeVisible();
    await expect(page.getByText("Chat abierto")).toHaveCount(0);

    // exact: true -- sin él, "No" hace match por subcadena con el botón de
    // cabecera "Notificaciones" (strict mode violation).
    await page.getByRole("button", { name: "No", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ya llegué aquí" }).first()).toBeVisible();

    // Sin recargar, un fallo que marcara en BD pero no repintara pasaría igual
    // este test -- el reload es lo que de verdad prueba que no quedó nada escrito.
    await page.reload();
    await expect(page.getByText("Chat abierto")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ya llegué aquí" }).first()).toBeVisible();
  });

  test("confirmar marca el hito y abre su chat", async ({ page }) => {
    await page.goto(`/club/${slug}/actividad/${activityConfirmarId}`);
    await page.getByRole("button", { name: "Ya llegué aquí" }).first().click();
    await page.getByRole("button", { name: "Sí" }).click();
    await expect(page.getByText("Chat abierto").first()).toBeVisible();
  });

  test("desmarcar un hito arrastra a los posteriores", async ({ page }) => {
    // Parte de tres hitos confirmados, sembrados en beforeAll.
    await page.goto(`/club/${slug}/actividad/${activityDesmarcarId}`);

    // .first() es el hito de menor `order` (Capítulo 1): la lista se pinta
    // ordenada y es el que arrastra a los otros dos al desmarcarse.
    await page.getByRole("button", { name: "Desmarcar" }).first().click();
    await page.getByRole("button", { name: "Sí" }).click();

    // El primero se desmarca y con él caen los dos siguientes: no queda ninguno.
    await expect(page.getByText("Chat abierto")).toHaveCount(0);
  });
});
