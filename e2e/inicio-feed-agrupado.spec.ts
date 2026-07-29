import { test, expect } from "@playwright/test";

// Inicio: feed agrupado e interactivo + ancho PC (branch feat/inicio-feed-agrupado).
//
// Cubre las tres piezas de la feature:
//   1. Tarjeta de grupo: un seguido que dio de alta ≥2 obras el MISMO día se pinta
//      como UNA tarjeta ("añadió N libros") con N ítems, no N tarjetas sueltas
//      (src/lib/social/group-feed-entries.ts → src/components/social/feed-group-card.tsx).
//   2. Alta rápida "＋": pulsar "Añadir" en un ítem del feed lo mete en la cola del
//      visitante; el botón vira a "En tu biblioteca" y la BD gana el pase planned
//      (src/components/library/quick-add-button.tsx → quick-add-actions.ts).
//   3. Sidebar de escritorio (≥1024): "Lectura esta semana", "Tu 2026" y (si hay
//      perfiles públicos sin seguir) "A quién seguir" con su botón "Seguir"
//      (src/components/stats/stats-rail.tsx + who-to-follow-card.tsx).
//
// Convención de datos (docs/TESTING.md): siembra por REST con la service key,
// limpia ANTES (dentro del try) y DESPUÉS (finally), con UUIDs fijos para las
// filas de catálogo/pases y un prefijo de username barrible para los usuarios
// desechables. NO se toca la biblioteca real de devtest: el alta rápida se
// ejerce sobre libros DESECHABLES creados por el test, así que el pase que gana
// devtest es de una obra que solo existe durante la prueba y se borra al acabar.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Prefijo común de los usuarios desechables (≤20 chars con el timestamp): permite
// barrer huérfanos de una pasada que murió a mitad sin tocar los e2e de otros specs.
const USER_PREFIX = "e2ff";

// UUIDs fijos de las filas de catálogo y de los pases del seguido: limpiables
// ANTES y DESPUÉS aunque el usuario que los creó tenga id aleatorio.
const FEED_BOOKS = [
  "e2ffb001-0000-4000-8000-000000000001",
  "e2ffb002-0000-4000-8000-000000000002",
  "e2ffb003-0000-4000-8000-000000000003",
];
const FEED_PASSES = [
  "e2ffa001-0000-4000-8000-000000000001",
  "e2ffa002-0000-4000-8000-000000000002",
  "e2ffa003-0000-4000-8000-000000000003",
];
// Cualquier dominio de portadas ya permitido por next/image sirve; la ASERCIÓN
// cuenta los <img> del DOM (que next/image emite aunque el pixel no cargue), no
// que la imagen se descargue.
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
  if (!rows[0]) throw new Error(`[inicio-feed] no hay perfil con username=${USERNAME}`);
  return rows[0].user_id;
}

// Crea un usuario desechable (auth + profile). Mismo patrón que los specs de club.
async function createUser(opts: {
  username: string;
  displayName: string;
  isPublic: boolean;
}): Promise<{ id: string }> {
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
      is_public: opts.isPublic,
    }),
  });
  return { id: user.id };
}

// Barrido de huérfanos: borra por la API admin cada usuario con nuestro prefijo
// (borrar el auth.user cascada a profiles/follows/passes). Cubre el residuo de una
// pasada que murió antes de su finally. Se corre ANTES y DESPUÉS.
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

// Limpieza de catálogo/pases desechables. Incluye los pases que el alta rápida
// pudo crear en la biblioteca de devtest para estas obras (residuo del test).
async function cleanFeedFixtures(): Promise<void> {
  const dt = await devtestId();
  const inBooks = `(${FEED_BOOKS.join(",")})`;
  const inPasses = `(${FEED_PASSES.join(",")})`;
  await rest(`passes?id=in.${inPasses}`, { method: "DELETE" });
  await rest(`passes?user_id=eq.${dt}&item_id=in.${inBooks}`, { method: "DELETE" });
  await rest(`books?id=in.${inBooks}`, { method: "DELETE" });
}

// ── 1 + 2 · Tarjeta de grupo + alta rápida ──────────────────────────────────
// Se prueban juntas porque el "＋" se pulsa DENTRO de la tarjeta de grupo: sembrar
// dos veces la misma precondición no aportaría nada.
test("un seguido con altas del mismo día se agrupa en una tarjeta y el ＋ mete la obra en tu cola", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const ts = Date.now();
  const followeeName = `E2E Feed ${ts}`;
  let followeeId: string | null = null;

  // Precondición DENTRO del try (docs/TESTING.md): si una pasada sucia muere aquí,
  // el finally sigue limpiando.
  try {
    await sweepDisposableUsers();
    await cleanFeedFixtures();

    const dt = await devtestId();
    const followee = await createUser({
      username: `${USER_PREFIX}${ts}`.slice(0, 20),
      displayName: followeeName,
      isPublic: true,
    });
    followeeId = followee.id;

    // devtest sigue (aceptado) al seguido: la RLS del feed resuelve la
    // visibilidad "seguidor aceptado".
    await rest("follows", {
      method: "POST",
      body: JSON.stringify({ follower_id: dt, followee_id: followee.id, status: "accepted" }),
    });

    // Tres libros desechables + tres pases del seguido con el MISMO created_at:
    // caen en el mismo bucket actor+día → un solo grupo de 3.
    const now = new Date().toISOString();
    await rest("books", {
      method: "POST",
      body: JSON.stringify(
        FEED_BOOKS.map((id, i) => ({
          id,
          title: `[E2E] Feed Agrupado ${i + 1} · ${ts}`,
          author: "[E2E] Autor",
          cover_url: COVER_URL,
        })),
      ),
    });
    await rest("passes", {
      method: "POST",
      body: JSON.stringify(
        FEED_PASSES.map((id, i) => ({
          id,
          user_id: followee.id,
          item_type: "book",
          item_id: FEED_BOOKS[i],
          status: "planned",
          is_active: true,
          created_at: now,
        })),
      ),
    });

    await login(page);
    await page.goto("/");

    // La tarjeta del grupo: el <article> que lleva el nombre único del seguido.
    const card = page.locator("article").filter({ hasText: followeeName });
    await expect(card).toHaveCount(1);

    // Headline agrupado (NO tres tarjetas sueltas de "añadió a su biblioteca").
    await expect(card.getByText(/añadió 3 libros/i)).toBeVisible();

    // N ítems dentro: un botón "Añadir" por obra y una portada (<img>) por obra.
    const addButtons = card.getByRole("button", { name: /^añadir$/i });
    await expect(addButtons).toHaveCount(3);
    await expect(card.locator("img")).toHaveCount(3);

    // ── Alta rápida: pulsar el primer "＋ Añadir" ──
    await addButtons.first().click();

    // El botón vira al estado optimista "En tu biblioteca".
    await expect(card.getByText(/en tu biblioteca/i).first()).toBeVisible();

    // Y el efecto real: devtest gana un pase planned de una de estas obras.
    await expect
      .poll(
        async () => {
          const rows = (await (
            await rest(
              `passes?user_id=eq.${dt}&item_id=in.(${FEED_BOOKS.join(",")})&status=eq.planned&select=id`,
            )
          ).json()) as unknown[];
          return rows.length;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);
  } finally {
    await cleanFeedFixtures();
    if (followeeId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${followeeId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    await sweepDisposableUsers();
  }
});

// ── 3 · Sidebar de escritorio ────────────────────────────────────────────────
test("la sidebar de escritorio muestra los tres bloques (esta semana, tu 2026, a quién seguir)", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const ts = Date.now();
  let suggestionId: string | null = null;

  try {
    await sweepDisposableUsers();

    // Precondición sembrada, no asumida: un perfil público que devtest NO sigue,
    // para garantizar que "A quién seguir" tiene al menos una sugerencia.
    const suggestion = await createUser({
      username: `${USER_PREFIX}s${ts}`.slice(0, 20),
      displayName: `E2E Sugerido ${ts}`,
      isPublic: true,
    });
    suggestionId = suggestion.id;

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/");

    const aside = page.locator("aside");
    // "Lectura esta semana" (WeeklyStrip) — llega por streaming tras su Suspense.
    await expect(aside.getByRole("heading", { name: /esta semana/i })).toBeVisible();
    // "Tu 2026" (bloque de objetivos anuales consolidado).
    await expect(aside.getByText(/^tu 2026$/i)).toBeVisible();
    // "A quién seguir" con su botón "Seguir".
    await expect(aside.getByText(/a quién seguir/i)).toBeVisible();
    await expect(aside.getByRole("button", { name: /^seguir$/i }).first()).toBeVisible();
  } finally {
    if (suggestionId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${suggestionId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    await sweepDisposableUsers();
  }
});
