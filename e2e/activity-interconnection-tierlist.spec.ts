import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es miembro

// Flujo B de la interconexión de actividades (frame 15): al finalizar un reto por lista, el
// curador (creador o moderator+) ve la oferta de cerrarlo con una tierlist de los mismos
// ítems -- oferta única, desaparece en cuanto ya hay una tierlist enlazada. El montaje directo
// por REST (service role) siembra un reto ACTIVO con un ítem, devtest como creador Y
// participante (necesario para ver el botón "Finalizar" de creador no-mod); el propio test
// finaliza el reto desde la UI (acción real de la barra de moderación/creador), tal como
// describe el brief, en vez de sembrar directamente el estado `finished`.
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

async function anyBooks(count: number): Promise<{ id: string; title: string }[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books?select=id,title&limit=${count}`, {
    headers: adminHeaders(),
  });
  const rows = (await res.json()) as { id: string; title: string }[];
  if (rows.length < count) throw new Error("no hay suficientes libros en catálogo para el e2e");
  return rows;
}

test("crea una tierlist al cerrar el reto", async ({ page }) => {
  test.setTimeout(60_000);

  const userId = await devtestId();
  const club = await clubId(CLUB_SLUG);
  const books = await anyBooks(2);
  const titulo = `e2e reto cerrar ${Date.now()}`;

  let activityId: string | null = null;
  let childId: string | null = null;

  try {
    // ── Siembra: reto por lista activo, con dos ítems, devtest como creador y participante ──
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

    for (const [i, book] of books.entries()) {
      const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          activity_id: activityId,
          item_type: "book",
          item_id: book.id,
          added_by: userId,
          position: i,
        }),
      });
      expect(itemRes.ok, "el ítem del reto debe insertarse").toBeTruthy();
    }

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

    // No debe verse la oferta mientras el reto sigue activo (solo se ofrece al finalizar).
    // Nota: "Cierra con una tierlist" vive en un <div>, no en un heading semántico -- se
    // consulta por texto, no por rol, a diferencia de "Actividades enlazadas a este reto"
    // (esa sí es un <h3> real, ver linked-activities.tsx).
    await expect(page.getByText("Cierra con una tierlist")).toHaveCount(0);

    // ── Finaliza el reto desde la UI (creador no-mod) ──
    await page.getByRole("button", { name: "Finalizar" }).click();
    await expect(page.getByText("Finalizada")).toBeVisible();

    // ── La oferta de tierlist aparece ──
    await expect(page.getByText("Cierra con una tierlist")).toBeVisible();
    await page.getByRole("button", { name: "Crear" }).click();

    // ── Aterriza en la tierlist hija, activa ──
    // Predicado que excluye el padre: su URL también casa /actividad/<uuid>$, y una
    // regex sola resolvería sin esperar la navegación a la hija (mismo latente que buddy).
    await page.waitForURL(
      (url) => /\/actividad\/[0-9a-f-]+$/i.test(url.pathname) && !url.pathname.endsWith(activityId!),
      { timeout: 15_000 },
    );
    // Chip tipo+estado en un solo elemento: texto exacto para no chocar con el h1
    // ("Tierlist · <título del reto>") ni con el route-announcer de Next.
    await expect(page.getByText("Tierlist · Activa")).toBeVisible();

    const url = page.url();
    childId = url.slice(url.lastIndexOf("/") + 1);

    // Verificación de datos: la hija quedó enlazada al padre, sin ítem de origen (oferta de
    // cierre, no conexión por ítem), y con los mismos ítems del pool del padre copiados.
    const childRes = await fetch(
      `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${childId}&select=id,kind,status,spawned_from_activity_id,spawned_from_item_type,spawned_from_item_id,club_activity_items(item_type,item_id)`,
      { headers: adminHeaders() },
    );
    const [child] = (await childRes.json()) as {
      kind: string;
      status: string;
      spawned_from_activity_id: string;
      spawned_from_item_type: string | null;
      spawned_from_item_id: string | null;
      club_activity_items: { item_type: string; item_id: string }[];
    }[];
    expect(child, "la hija debe existir en BD").toBeTruthy();
    expect(child.kind).toBe("tierlist");
    expect(child.status).toBe("active");
    expect(child.spawned_from_activity_id).toBe(activityId);
    expect(child.spawned_from_item_type).toBeNull();
    expect(child.spawned_from_item_id).toBeNull();
    expect(child.club_activity_items).toHaveLength(books.length);
    const childItemIds = child.club_activity_items.map((i) => i.item_id).sort();
    expect(childItemIds).toEqual(books.map((b) => b.id).sort());

    // ── Volviendo al reto: oferta única (ya no está) y la hija figura enlazada ──
    // Navegación fresca en vez de goBack(): el back del navegador sirve el bfcache
    // del padre renderizado ANTES de que naciera la hija (linkedChildren vacío), y
    // el heading de enlazadas solo aparece con ≥1 hija. Un usuario que vuelve a
    // entrar ve el estado fresco -- que es justo lo que este assert comprueba.
    await page.goto(`/club/${CLUB_SLUG}/actividad/${activityId}`);
    await expect(
      page.getByRole("heading", { name: "Actividades enlazadas a este reto" }),
    ).toBeVisible();
    await expect(page.getByText("Cierra con una tierlist")).toHaveCount(0);
    await expect(page.getByText(titulo, { exact: false }).first()).toBeVisible();

    console.log("CERRAR RETO -> TIERLIST OK:", activityId, "->", childId);
  } finally {
    // Limpieza: la hija (si llegó a nacer) y el reto padre (items/participantes van por
    // cascade).
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
