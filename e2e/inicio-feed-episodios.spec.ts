import { test, expect } from "@playwright/test";

// Inicio: valoraciones de varios episodios de una serie, agrupadas en UNA
// tarjeta (mismo patrón que "añadió"/"avanzó"). Un seguido que valora ≥2
// episodios de la misma serie en días contiguos se pinta como una tarjeta
// "valoró N episodios de {serie}" con una fila POR episodio —cada una con su
// estado (Visto), su nota y su fila de reacción— y no como N reseñas sueltas.
//   src/lib/social/group-feed-entries.ts (clave `episodes:${actor}:${serie}`,
//   troceo por hueco) → src/components/social/episode-ratings-card.tsx,
//   despachada por src/components/social/feed-item.tsx.
//
// Convención de datos (docs/TESTING.md, igual que inicio-feed-agrupado): siembra
// por REST con la service key, limpia ANTES (dentro del try) y DESPUÉS (finally),
// UUIDs fijos para catálogo/watches y prefijo de username barrible. No toca la
// biblioteca real de devtest.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Prefijo propio (distinto del "e2ff" de inicio-feed-agrupado) para barrer solo
// los huérfanos de ESTE spec.
const USER_PREFIX = "e2fe";

const SERIES_ID = "e2fe5e01-0000-4000-8000-000000000001";
const WATCH_IDS = [
  "e2fe0001-0000-4000-8000-000000000001",
  "e2fe0002-0000-4000-8000-000000000002",
  "e2fe0003-0000-4000-8000-000000000003",
  "e2fe0004-0000-4000-8000-000000000004",
];
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

// Cuatro episodios en días contiguos (hueco de 1 día ≤ ventana) → un solo grupo
// de 4. Notas variadas y una reseña para ejercer los estados de cada fila.
const EPISODES = [
  { id: WATCH_IDS[0], season: 1, episode: 5, rating: 8, review: "El giro final no lo vi venir; el mejor de la temporada.", off: 0 },
  { id: WATCH_IDS[1], season: 1, episode: 4, rating: 9, review: null, off: 1 },
  { id: WATCH_IDS[2], season: 1, episode: 3, rating: 6, review: null, off: 2 },
  { id: WATCH_IDS[3], season: 1, episode: 2, rating: 7, review: null, off: 3 },
];

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
  if (!rows[0]) throw new Error(`[inicio-feed-episodios] no hay perfil con username=${USERNAME}`);
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

async function cleanFixtures(): Promise<void> {
  await rest(`episode_watches?id=in.(${WATCH_IDS.join(",")})`, { method: "DELETE" });
  await rest(`series?id=eq.${SERIES_ID}`, { method: "DELETE" });
}

test("un seguido que valora varios episodios de una serie se agrupa en una tarjeta con fila por episodio", async ({
  page,
}, testInfo) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const ts = Date.now();
  const followeeName = `E2E Episodios ${ts}`;
  let followeeId: string | null = null;

  try {
    await sweepDisposableUsers();
    await cleanFixtures();

    const dt = await devtestId();
    const followee = await createUser({
      username: `${USER_PREFIX}${ts}`.slice(0, 20),
      displayName: followeeName,
    });
    followeeId = followee.id;

    await rest("follows", {
      method: "POST",
      body: JSON.stringify({ follower_id: dt, followee_id: followee.id, status: "accepted" }),
    });

    await rest("series", {
      method: "POST",
      body: JSON.stringify({ id: SERIES_ID, title: `[E2E] Loki · ${ts}`, cover_url: COVER_URL }),
    });

    await rest("episode_watches", {
      method: "POST",
      body: JSON.stringify(
        EPISODES.map((e) => {
          const at = new Date(ts - e.off * 86_400_000).toISOString();
          return {
            id: e.id,
            user_id: followee.id,
            series_id: SERIES_ID,
            season_number: e.season,
            episode_number: e.episode,
            rating: e.rating,
            review: e.review,
            watched_on: at.slice(0, 10),
            created_at: at,
            updated_at: at,
          };
        }),
      ),
    });

    await login(page);
    await page.goto("/");

    // La tarjeta del grupo: el <article> con el nombre único del seguido.
    const card = page.locator("article").filter({ hasText: followeeName });
    await expect(card).toHaveCount(1);

    // Titular agrupado (NO cuatro reseñas sueltas).
    await expect(card.getByText(/valoró 4 episodios de/i)).toBeVisible();
    await expect(card.getByText(/RESEÑAS/i)).toBeVisible();

    // Colapsada: 4 episodios → se ven los 2 más recientes + "ver 2 episodios más".
    await expect(card.getByText("S1E5")).toBeVisible();
    await expect(card.getByText("S1E4")).toBeVisible();
    const showMore = card.getByRole("button", { name: /ver 2 episodios más/i });
    await expect(showMore).toBeVisible();
    // Estado por episodio (el «tweak» de la maqueta): cada fila marca "Visto".
    await expect(card.getByText(/^visto$/i).first()).toBeVisible();

    await card.screenshot({ path: testInfo.outputPath("episodios-agrupados-colapsada.png") });

    // Expandir → aparecen las 4 filas.
    await showMore.click();
    await expect(card.getByText("S1E5")).toBeVisible();
    await expect(card.getByText("S1E4")).toBeVisible();
    await expect(card.getByText("S1E3")).toBeVisible();
    await expect(card.getByText("S1E2")).toBeVisible();

    await card.screenshot({ path: testInfo.outputPath("episodios-agrupados-expandida.png") });
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
