import { test, expect } from "@playwright/test";

// Feed: tarjetas por tipo (branch feat/feed-tarjetas-por-tipo). Verificación de
// runtime real + PRIVACIDAD de notas públicas — no la cubre el vitest de
// group-feed-entries porque depende de la RLS de `notes` y de que la
// composición del feed (feed.ts) NUNCA sirva el body de una nota privada.
//
// Cubre las cuatro variantes de src/components/social/feed-item.tsx:
//   A · Colección  → CollectionCard: un seguido que dio de alta ≥2 obras el
//        MISMO día se pinta como UNA tarjeta ("añadió N títulos") con lista
//        vertical (lomo + título + autor + "Añadir" por fila) y badge "Colección".
//   B · Avances    → ProgressTimelineCard: ≥2 sesiones de progreso del MISMO
//        libro dentro de 7 días → UNA timeline ("avanzó en {título}") con
//        "Llegó a la pág. N" por paso y un "%" cuando el libro tiene total_pages.
//   PRIV · sobre B: cada sesión lleva una fila `notes` enlazada por session_id.
//        La privada (is_public=false) NO debe aparecer en el DOM; la pública
//        (is_public=true, is_spoiler=false) SÍ; la pública-spoiler queda velada
//        hasta pulsar "Mostrar spoiler".
//   C · Reseña     → ReviewCard: un seguido que terminó+reseñó un libro →
//        badge "Finalizado", dots de valoración y el texto de la reseña.
//
// Convención de datos (docs/TESTING.md): siembra por REST con la service key,
// limpia ANTES (dentro del try) y DESPUÉS (finally) con UUIDs fijos. El caso
// Colección siembra temporalmente un pase activo de devtest para comprobar la
// pertenencia del visitante; cleanFixtures lo retira en ambos extremos.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Prefijo barrible de los usuarios desechables (≤20 chars con el timestamp).
const USER_PREFIX = "e2fc";

// UUIDs fijos de catálogo/pases/sesiones/notas: limpiables ANTES y DESPUÉS
// aunque el usuario que los creó tenga id aleatorio y una pasada muriera a mitad.
const COL_BOOKS = [
  "e2fc0b01-0000-4000-8000-000000000001",
  "e2fc0b02-0000-4000-8000-000000000002",
  "e2fc0b05-0000-4000-8000-000000000005",
  "e2fc0b06-0000-4000-8000-000000000006",
];
const COL_PASSES = [
  "e2fc0a01-0000-4000-8000-000000000001",
  "e2fc0a02-0000-4000-8000-000000000002",
  "e2fc0a05-0000-4000-8000-000000000005",
  "e2fc0a06-0000-4000-8000-000000000006",
];
const VIEWER_COL_PASS = "e2fc0a09-0000-4000-8000-000000000009";
const VIEWER_INACTIVE_COL_PASS = "e2fc0a08-0000-4000-8000-000000000008";
const PROG_BOOK = "e2fc0b03-0000-4000-8000-000000000003";
const PROG_PASS = "e2fc0a03-0000-4000-8000-000000000003";
const PROG_SESSIONS = [
  "e2fc0501-0000-4000-8000-000000000001", // backdated · nota PRIVADA
  "e2fc0502-0000-4000-8000-000000000002", // hoy · nota PÚBLICA
  "e2fc0503-0000-4000-8000-000000000003", // hoy · nota PÚBLICA + spoiler
];
const PROG_NOTES = [
  "e2fc0e01-0000-4000-8000-000000000001",
  "e2fc0e02-0000-4000-8000-000000000002",
  "e2fc0e03-0000-4000-8000-000000000003",
];
const REV_BOOK = "e2fc0b04-0000-4000-8000-000000000004";
const REV_PASS = "e2fc0a04-0000-4000-8000-000000000004";

const ALL_BOOKS = [...COL_BOOKS, PROG_BOOK, REV_BOOK];
const ALL_PASSES = [
  ...COL_PASSES,
  VIEWER_COL_PASS,
  VIEWER_INACTIVE_COL_PASS,
  PROG_PASS,
  REV_PASS,
];

const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function devtestId(): Promise<string> {
  const rows = (await (
    await rest(`profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  if (!rows[0]) throw new Error(`[feed-tarjetas] no hay perfil con username=${USERNAME}`);
  return rows[0].user_id;
}

async function createUser(opts: { username: string; displayName: string }): Promise<{ id: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email: `${opts.username}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    }),
  });
  if (!res.ok) throw new Error(`admin/users: ${res.status} — ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      username: opts.username,
      display_name: opts.displayName,
      is_public: true,
    }),
  });
  return { id: user.id };
}

async function followFromDevtest(followeeId: string): Promise<void> {
  const dt = await devtestId();
  await rest("follows", {
    method: "POST",
    body: JSON.stringify({ follower_id: dt, followee_id: followeeId, status: "accepted" }),
  });
}

async function sweepDisposableUsers(): Promise<void> {
  const rows = (await (
    await rest(`profiles?username=like.${USER_PREFIX}*&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  }
}

// Limpieza de todo el catálogo/actividad desechable, en orden de FK
// (notes → progress_sessions → passes → books). Se corre ANTES y DESPUÉS.
async function cleanFixtures(): Promise<void> {
  await rest(`notes?id=in.(${PROG_NOTES.join(",")})`, { method: "DELETE" });
  await rest(`progress_sessions?id=in.(${PROG_SESSIONS.join(",")})`, { method: "DELETE" });
  await rest(`passes?id=in.(${ALL_PASSES.join(",")})`, { method: "DELETE" });
  await rest(`books?id=in.(${ALL_BOOKS.join(",")})`, { method: "DELETE" });
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ── A · Colección ────────────────────────────────────────────────────────────
test("un seguido con altas del mismo día se pinta como UNA tarjeta Colección con lista vertical", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const ts = Date.now();
  const followeeName = `E2E Coleccion ${ts}`;
  let followeeId: string | null = null;

  try {
    await sweepDisposableUsers();
    await cleanFixtures();

    const followee = await createUser({
      username: `${USER_PREFIX}c${ts}`.slice(0, 20),
      displayName: followeeName,
    });
    followeeId = followee.id;
    await followFromDevtest(followee.id);
    const viewerId = await devtestId();

    const now = new Date().toISOString();
    // created_at ESCALONADO (3 s entre altas) a propósito. El orden del feed es
    // (día ↓, created_at ↓, id ↓): con las cuatro altas sembradas en el mismo
    // instante empataban en created_at y el desempate caía al id —uuids fijos,
    // sí, pero el test no puede depender de en qué orden alfabético quedaron—,
    // así que "las 2 filas visibles al colapsar" no era una propiedad afirmable.
    // Con el escalón el orden es Colección 4 → 3 → 2 → 1, y la obra que el
    // visitante ya tiene (COL_BOOKS[0] = Colección 1) es la MÁS VIEJA: queda
    // oculta mientras la tarjeta está colapsada.
    const addedAt = (index: number) =>
      new Date(ts - (COL_BOOKS.length - 1 - index) * 3_000).toISOString();
    await rest("books", {
      method: "POST",
      body: JSON.stringify(
        COL_BOOKS.map((id, i) => ({
          id,
          title: `[E2E] Colección ${i + 1} · ${ts}`,
          author: `[E2E] Autor ${i + 1}`,
          cover_url: COVER_URL,
        })),
      ),
    });
    await rest("passes", {
      method: "POST",
      body: JSON.stringify([
        ...COL_PASSES.map((id, index) => ({
          id,
          user_id: followee.id,
          item_type: "book",
          item_id: COL_BOOKS[index],
          status: "planned",
          is_active: true,
          created_at: addedAt(index),
        })),
        {
          id: VIEWER_COL_PASS,
          user_id: viewerId,
          item_type: "book",
          item_id: COL_BOOKS[0],
          status: "planned",
          is_active: true,
          created_at: now,
        },
        {
          id: VIEWER_INACTIVE_COL_PASS,
          user_id: viewerId,
          item_type: "book",
          item_id: COL_BOOKS[1],
          status: "completed",
          is_active: false,
          created_at: now,
        },
      ]),
    });

    await login(page);
    await page.goto("/");

    const card = page.locator("article").filter({ hasText: followeeName }).first();
    await expect(card).toBeVisible();

    // Headline agrupado (NO cuatro tarjetas sueltas de "añadió a su
    // biblioteca"), y con el TOTAL ya estando colapsada: 4, no las 2 visibles.
    await expect(card.getByText(/añadió 4 títulos/i)).toBeVisible();
    // Badge de tipo "Colección".
    await expect(card.getByText(/^colección$/i)).toBeVisible();

    // ── Colapsada ──
    // Cada fila pinta DOS enlaces al mismo libro (portada con alt=título +
    // título), así que las filas se cuentan por el TEXTO del título: el enlace
    // de la portada no tiene texto y no entra en la cuenta.
    const titleRows = card.getByText(/^\[E2E\] Colección \d · \d+$/);
    await expect(titleRows).toHaveCount(2);
    // Las 2 más nuevas por created_at (ver `addedAt`): Colección 4 y 3.
    await expect(card.getByText(`[E2E] Colección 4 · ${ts}`)).toBeVisible();
    await expect(card.getByText(`[E2E] Colección 3 · ${ts}`)).toBeVisible();
    await expect(card.getByText("[E2E] Autor 4")).toBeVisible();
    await expect(card.getByText("[E2E] Autor 3")).toBeVisible();
    await expect(card.getByRole("button", { name: /ver 2 obras más/i })).toHaveCount(1);

    // El pie cuenta TODAS las pendientes del grupo (4 obras − 1 ya en la
    // biblioteca del visitante = 3), no solo las filas pintadas. Se afirma
    // COLAPSADA porque es el estado donde ambos números difieren: si el pie se
    // derivara de lo visible diría "los 2".
    await expect(card.getByRole("button", { name: /guardar los 3/i })).toHaveCount(1);

    // ── Expandida ──
    await card.getByRole("button", { name: /ver 2 obras más/i }).click();
    await expect(titleRows).toHaveCount(4);
    // Lista vertical: por fila, título + autor. Las 2 que estaban ocultas.
    await expect(card.getByText(`[E2E] Colección 1 · ${ts}`)).toBeVisible();
    await expect(card.getByText(`[E2E] Colección 2 · ${ts}`)).toBeVisible();
    await expect(card.getByText("[E2E] Autor 1")).toBeVisible();
    await expect(card.getByText("[E2E] Autor 2")).toBeVisible();

    // Y el botón "Añadir" por fila, según la biblioteca del visitante: la obra
    // con pase ACTIVO (Colección 1) no lo ofrece; la que solo tiene un pase
    // INACTIVO (Colección 2) sí. Ambas filas solo existen ya expandida.
    const ownedRow = card
      .getByRole("link", { name: `[E2E] Colección 1 · ${ts}` })
      .first()
      .locator("..");
    const missingRow = card
      .getByRole("link", { name: `[E2E] Colección 2 · ${ts}` })
      .first()
      .locator("..");
    await expect(ownedRow.getByRole("button", { name: /^añadir$/i })).toHaveCount(0);
    await expect(missingRow.getByRole("button", { name: /^añadir$/i })).toHaveCount(1);

    // El pie no cambia al expandir: sigue siendo el total de pendientes.
    await expect(card.getByRole("button", { name: /guardar los 3/i })).toHaveCount(1);
  } finally {
    await cleanFixtures();
    if (followeeId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${followeeId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    await sweepDisposableUsers();
  }
});

// ── B · Avances timeline + PRIVACIDAD de notas ───────────────────────────────
test("las sesiones del mismo libro forman UNA timeline; la nota privada no se filtra y la pública sí", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const ts = Date.now();
  const followeeName = `E2E Avances ${ts}`;
  const bookTitle = `[E2E] Progreso · ${ts}`;
  // Strings inconfundibles: si aparecen en el DOM es porque el feed los sirvió.
  const PRIVATE_BODY = `NOTA-PRIVADA-NO-DEBE-VERSE-${ts}`;
  const PUBLIC_BODY = `nota-publica-visible-${ts}`;
  const SPOILER_BODY = `spoiler-velado-${ts}`;
  let followeeId: string | null = null;

  try {
    await sweepDisposableUsers();
    await cleanFixtures();

    const followee = await createUser({
      username: `${USER_PREFIX}p${ts}`.slice(0, 20),
      displayName: followeeName,
    });
    followeeId = followee.id;
    await followFromDevtest(followee.id);

    // Libro con total_pages para que la timeline muestre "%".
    await rest("books", {
      method: "POST",
      body: JSON.stringify({
        id: PROG_BOOK,
        title: bookTitle,
        author: "[E2E] Autor Progreso",
        cover_url: COVER_URL,
        total_pages: 300,
      }),
    });
    await rest("passes", {
      method: "POST",
      body: JSON.stringify({
        id: PROG_PASS,
        user_id: followee.id,
        item_type: "book",
        item_id: PROG_BOOK,
        status: "in_progress",
        is_active: true,
        started_on: isoDaysAgo(3).slice(0, 10),
      }),
    });

    const today = new Date().toISOString().slice(0, 10);
    const backdated = isoDaysAgo(3).slice(0, 10); // 3 días < ventana de 7
    // 3 sesiones del mismo libro → un solo sub-grupo (hueco máximo 3 días).
    await rest("progress_sessions", {
      method: "POST",
      body: JSON.stringify([
        { id: PROG_SESSIONS[0], user_id: followee.id, pass_id: PROG_PASS, session_date: backdated, position: { page: 50 }, created_at: isoDaysAgo(3) },
        { id: PROG_SESSIONS[1], user_id: followee.id, pass_id: PROG_PASS, session_date: today, position: { page: 120 }, created_at: isoDaysAgo(0.05) },
        { id: PROG_SESSIONS[2], user_id: followee.id, pass_id: PROG_PASS, session_date: today, position: { page: 200 }, created_at: new Date().toISOString() },
      ]),
    });
    // Una nota por sesión, con is_public/is_spoiler EXPLÍCITOS.
    await rest("notes", {
      method: "POST",
      body: JSON.stringify([
        { id: PROG_NOTES[0], user_id: followee.id, session_id: PROG_SESSIONS[0], pass_id: PROG_PASS, item_type: "book", item_id: PROG_BOOK, kind: "note", body: PRIVATE_BODY, is_public: false, is_spoiler: false },
        { id: PROG_NOTES[1], user_id: followee.id, session_id: PROG_SESSIONS[1], pass_id: PROG_PASS, item_type: "book", item_id: PROG_BOOK, kind: "note", body: PUBLIC_BODY, is_public: true, is_spoiler: false },
        { id: PROG_NOTES[2], user_id: followee.id, session_id: PROG_SESSIONS[2], pass_id: PROG_PASS, item_type: "book", item_id: PROG_BOOK, kind: "note", body: SPOILER_BODY, is_public: true, is_spoiler: true },
      ]),
    });

    await login(page);
    await page.goto("/");

    // La timeline: el <article> con el badge "Avances" del seguido.
    const timeline = page
      .locator("article")
      .filter({ hasText: followeeName })
      .filter({ hasText: /avanzó en/i });
    await expect(timeline).toHaveCount(1);
    await expect(timeline.getByText(/^avances$/i)).toBeVisible();
    await expect(timeline.getByText(bookTitle)).toBeVisible();

    // Un paso por sesión con su página, y al menos un "%".
    await expect(timeline.getByText(/Llegó a la pág\. 50/)).toBeVisible();
    await expect(timeline.getByText(/Llegó a la pág\. 120/)).toBeVisible();
    await expect(timeline.getByText(/Llegó a la pág\. 200/)).toBeVisible();
    // 120/300 = 40 %.
    await expect(timeline.getByText("40%")).toBeVisible();

    // ── PRIVACIDAD (crítico) ──
    // La nota privada no aparece en NINGUNA parte del DOM de la página.
    await expect(page.getByText(PRIVATE_BODY)).toHaveCount(0);
    // La nota pública no-spoiler sí es visible.
    await expect(timeline.getByText(PUBLIC_BODY)).toBeVisible();

    // La nota pública-spoiler está velada: el body no está pintado hasta el clic.
    await expect(timeline.getByText(SPOILER_BODY)).toHaveCount(0);
    await timeline.getByRole("button", { name: /mostrar spoiler/i }).click();
    await expect(timeline.getByText(SPOILER_BODY)).toBeVisible();
  } finally {
    await cleanFixtures();
    if (followeeId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${followeeId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    await sweepDisposableUsers();
  }
});

// ── C · Reseña ───────────────────────────────────────────────────────────────
test("un seguido que terminó y reseñó un libro se pinta como ReviewCard con Finalizado, dots y texto", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const ts = Date.now();
  const followeeName = `E2E Reseña ${ts}`;
  const bookTitle = `[E2E] Reseñado · ${ts}`;
  const reviewText = `resena-visible-en-feed-${ts}`;
  let followeeId: string | null = null;

  try {
    await sweepDisposableUsers();
    await cleanFixtures();

    const followee = await createUser({
      username: `${USER_PREFIX}r${ts}`.slice(0, 20),
      displayName: followeeName,
    });
    followeeId = followee.id;
    await followFromDevtest(followee.id);

    await rest("books", {
      method: "POST",
      body: JSON.stringify({
        id: REV_BOOK,
        title: bookTitle,
        author: "[E2E] Autor Reseña",
        cover_url: COVER_URL,
        total_pages: 210,
      }),
    });
    // El texto de la reseña solo se sirve vía la vista pass_reviews, que exige
    // is_public=true + can_view_profile (seguidor aceptado): por eso is_public.
    await rest("passes", {
      method: "POST",
      body: JSON.stringify({
        id: REV_PASS,
        user_id: followee.id,
        item_type: "book",
        item_id: REV_BOOK,
        status: "completed",
        is_active: false,
        is_public: true,
        started_on: isoDaysAgo(5).slice(0, 10),
        finished_on: new Date().toISOString().slice(0, 10),
        rating: 8, // → dots "4 de 5"
        review: reviewText,
      }),
    });

    await login(page);
    await page.goto("/");

    // La ReviewCard: el <article> del seguido que lleva el badge "Finalizado".
    const review = page
      .locator("article")
      .filter({ hasText: followeeName })
      .filter({ hasText: /finalizado/i });
    await expect(review).toHaveCount(1);
    await expect(review.getByText(bookTitle)).toBeVisible();
    await expect(review.getByText(/^finalizado$/i)).toBeVisible();
    // Dots de valoración (RatingDots, role=img "… de 5").
    await expect(review.getByRole("img", { name: /de 5/i })).toBeVisible();
    // El texto de la reseña.
    await expect(review.getByText(reviewText)).toBeVisible();
  } finally {
    await cleanFixtures();
    if (followeeId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${followeeId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    await sweepDisposableUsers();
  }
});
