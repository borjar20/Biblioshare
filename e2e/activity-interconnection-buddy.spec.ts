import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es miembro

// Flujo A de la interconexión de actividades (frame 14): desde un ítem de un reto por lista
// ACTIVO, el curador (creador o moderator+) abre una hoja que ofrece arrancar una lectura
// conjunta a partir de ese ítem. Solo aplica a libro/serie -- las películas quedan fuera de
// alcance (ver Task 4). El montaje directo por REST (service role) es deliberado: no hay
// asistente de UI para crear un reto por lista ya activo con ítems, así que se siembra el
// estado exacto que el board necesita (reto activo, con un ítem de libro, y el propio devtest
// como creador Y participante -- el board solo pinta la rejilla a participantes, ver notas de
// integración del plan).
function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

let cachedUserId: string | null = null;
async function devtestId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  cachedUserId = rows[0].user_id;
  return cachedUserId;
}

async function clubId(slug: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clubs?slug=eq.${encodeURIComponent(slug)}&select=id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as { id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el club ${slug}`);
  return rows[0].id;
}

async function anyBook(): Promise<{ id: string; title: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books?select=id,title&limit=1`, {
    headers: adminHeaders(),
  });
  const rows = (await res.json()) as { id: string; title: string }[];
  if (!rows[0]) throw new Error("no hay libros en catálogo para el e2e");
  return rows[0];
}

test("curador abre lectura conjunta desde un ítem del reto por lista activo", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const userId = await devtestId();
  const club = await clubId(CLUB_SLUG);
  const book = await anyBook();
  const titulo = `e2e reto conectar ${Date.now()}`;

  let activityId: string | null = null;
  let childId: string | null = null;

  try {
    // ── Siembra: reto por lista activo, con un ítem, devtest como creador y participante ──
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        club_id: club,
        kind: "list_challenge",
        title: titulo,
        status: "active",
        created_by: userId,
      }),
    });
    const [created] = (await createRes.json()) as { id: string }[];
    expect(created, "el reto debe crearse").toBeTruthy();
    activityId = created.id;

    const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        activity_id: activityId,
        item_type: "book",
        item_id: book.id,
        added_by: userId,
        position: 0,
      }),
    });
    expect(itemRes.ok, "el ítem del reto debe insertarse").toBeTruthy();

    const participantRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ activity_id: activityId, user_id: userId }),
    });
    expect(participantRes.ok, "devtest debe unirse al reto").toBeTruthy();

    // ── Login y navegación directa a la ficha del reto ──
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${CLUB_SLUG}/actividad/${activityId}`);

    // ── Toca el ítem en la rejilla -> se abre la hoja del frame 14 ──
    await page.locator(`button[title="${book.title}"]`).click();
    await expect(
      page.getByRole("heading", { name: "Conectar una actividad desde este ítem" }),
    ).toBeVisible();
    // El título del libro aparece también como chip en la rejilla del reto, así que
    // se asienta sobre el título de la hoja (id propio) en vez de un getByText ambiguo.
    await expect(page.locator("#item-connect-title")).toHaveText(book.title);

    // ── Abre la lectura conjunta ──
    await page.getByRole("button", { name: "Abrir lectura conjunta" }).click();

    // ── Aterriza en la actividad hija: lectura conjunta activa, nacida de ese ítem ──
    // El predicado excluye el id del padre a propósito: la URL del reto padre también
    // casa /actividad/<uuid>$, así que una regex sola resolvería al instante sin esperar
    // la navegación a la hija, y el page.url() de abajo leería el padre (list_challenge).
    await page.waitForURL(
      (url) => /\/actividad\/[0-9a-f-]+$/i.test(url.pathname) && !url.pathname.endsWith(activityId!),
      { timeout: 15_000 },
    );
    // El chip de la hija reúne tipo+estado en un solo elemento; se asienta sobre su
    // texto exacto para no chocar con el h1 ("Lectura conjunta · Rayuela") ni con el
    // route-announcer de Next, que también contienen "Lectura conjunta".
    await expect(page.getByText("Lectura conjunta · Activa")).toBeVisible();

    // Verificación de datos: la hija quedó enlazada al padre y nació con el mismo ítem.
    const url = page.url();
    childId = url.slice(url.lastIndexOf("/") + 1);
    const childRes = await fetch(
      `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${childId}&select=id,kind,status,spawned_from_activity_id,spawned_from_item_type,spawned_from_item_id,club_activity_items(item_type,item_id)`,
      { headers: adminHeaders() },
    );
    const [child] = (await childRes.json()) as {
      kind: string;
      status: string;
      spawned_from_activity_id: string;
      spawned_from_item_type: string;
      spawned_from_item_id: string;
      club_activity_items: { item_type: string; item_id: string }[];
    }[];
    expect(child, "la hija debe existir en BD").toBeTruthy();
    expect(child.kind).toBe("buddy_read");
    expect(child.status).toBe("active");
    expect(child.spawned_from_activity_id).toBe(activityId);
    expect(child.spawned_from_item_type).toBe("book");
    expect(child.spawned_from_item_id).toBe(book.id);
    expect(child.club_activity_items).toHaveLength(1);
    expect(child.club_activity_items[0].item_id).toBe(book.id);

    console.log("CONECTAR ÍTEM -> LECTURA CONJUNTA OK:", activityId, "->", childId);
  } finally {
    // Limpieza: la hija (si llegó a nacer) y el reto padre (items/participantes van por
    // cascade). No hay `Prefer` de vuelta ninguna aquí porque no necesitamos representación.
    if (childId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${childId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    if (activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
