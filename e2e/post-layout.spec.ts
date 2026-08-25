import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Layout responsive de `/post/[id]` en TRES áreas (OBRA · CONVERSACIÓN · SOCIAL):
// las tres columnas se mantienen hasta ~1000, los raíles se compactan antes de
// desaparecer, y a <1000 la OBRA se oculta (accesible por la tarjeta del post) y
// la página queda en una columna. Además, el bloque "Más de {autor}" prioriza
// posts del autor sobre obras EMPARENTADAS (RPC `related_posts_by_author`) y
// NUNCA incluye el post actual NI un AVANCE (`kind = 'progressed'`) — ni en «Más
// de {autor}» ni en «Más sobre la obra». Patrón de datos desechables por REST
// service-role (thoughts.spec.ts / posts.spec.ts), borrados en el `finally`.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.use({ serviceWorkers: "block" });

function adminHeaders(json = false) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function rest<T>(
  path: string,
  init: { method?: string; body?: unknown; returnRows?: boolean } = {},
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...adminHeaders(init.body !== undefined),
      ...(init.returnRows ? { Prefer: "return=representation" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} — ${text}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function insertOne<T>(table: string, data: unknown): Promise<T> {
  const rows = await rest<T[]>(`${table}?select=*`, { method: "POST", body: data, returnRows: true });
  if (!rows[0]) throw new Error(`insert en ${table} no devolvió fila`);
  return rows[0];
}

async function createUser(request: APIRequestContext, username: string) {
  const email = `${username}@example.com`;
  const password = "TestPassword123!";
  const auth = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  expect(auth.ok()).toBe(true);
  const user = await auth.json();
  const profile = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: adminHeaders(true),
    data: { user_id: user.id, username, is_public: true },
  });
  expect(profile.ok()).toBe(true);
  return { id: user.id as string, username };
}

async function deleteUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  }).catch(() => {});
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Sin scroll horizontal en NINGÚN ancho es un requisito duro del rediseño.
async function expectNoHorizontalOverflow(page: Page, width: number) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `overflow horizontal a ${width}px`).toBeLessThanOrEqual(1);
}

test("la página del post reparte OBRA · CONVERSACIÓN · SOCIAL y degrada por ancho", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);

  const ts = Date.now();
  const author = await createUser(request, `e2elayout${ts}`);
  // Segunda cuenta: «Más sobre la obra» excluye al propio autor, así que hace
  // falta un tercero para poblar (y para probar que su AVANCE no entra).
  const other = await createUser(request, `e2elayoutotro${ts}`);

  // Libros con géneros CONTROLADOS: la obra vista comparte "Fantasía" con la
  // relacionada, no con la neutra — así el ranking del RPC es determinista.
  let viewedBookId: string | null = null;
  let relatedBookId: string | null = null;
  let neutralBookId: string | null = null;
  let viewedPostId: string | null = null;
  let relatedPostId: string | null = null;
  let neutralPostId: string | null = null;
  let authorProgressPostId: string | null = null;
  let otherThoughtPostId: string | null = null;
  let otherProgressPostId: string | null = null;
  let personId: string | null = null;
  const creditName = `Real Autora ${ts}`;

  try {
    const viewed = await insertOne<{ id: string }>("books", {
      title: `E2E Layout Obra Vista ${ts}`,
      author: "E2E Autora",
      published_year: 2021,
      genres: ["Fantasía", "Aventura"],
    });
    viewedBookId = viewed.id;
    const related = await insertOne<{ id: string }>("books", {
      title: `E2E Layout Relacionada ${ts}`,
      author: "E2E Autora",
      published_year: 2019,
      genres: ["Fantasía"],
    });
    relatedBookId = related.id;
    const neutral = await insertOne<{ id: string }>("books", {
      title: `E2E Layout Neutra ${ts}`,
      author: "E2E Autora",
      published_year: 2018,
      genres: ["Documental"],
    });
    neutralBookId = neutral.id;

    // Creador desde `credits` (camino nuevo): `movies.director`/`series.creator`
    // están SIEMPRE a null en catálogo — el creador real vive en `credits`. Se
    // prueba con un libro: un crédito de autor con un nombre DISTINTO del de la
    // fila (`books.author = "E2E Autora"`). Si OBRA muestra el del crédito,
    // `pickCreator` (credits) manda sobre la columna.
    const person = await insertOne<{ id: string }>("people", { name: creditName });
    personId = person.id;
    await insertOne("credits", {
      item_type: "book",
      item_id: viewedBookId,
      person_id: personId,
      role: "author",
      billing_order: 0,
    });
    // Un voto público cerrado → la comunidad tiene 1 nota → histograma en OBRA.
    await insertOne("passes", {
      user_id: author.id,
      item_type: "book",
      item_id: viewedBookId,
      status: "completed",
      rating: 8,
      finished_on: "2026-01-01",
      is_public: true,
      is_active: false,
      position: {},
    });

    // Tres pensamientos del MISMO autor. `created_at` ascendente (viewed→related
    // →neutral) para que, si dependiera solo de recencia, la neutra ganara: así
    // el test prueba que la RELACIÓN (género) manda sobre la recencia.
    const mkPost = (bookId: string, secOffset: number) => ({
      author_id: author.id,
      kind: "thought",
      anchor_type: "book",
      anchor_id: bookId,
      source_kind: null,
      body: `Post e2e ${ts} sobre ${bookId}`,
      is_spoiler: false,
      created_at: new Date(ts - secOffset * 1000).toISOString(),
    });
    viewedPostId = (await insertOne<{ id: string }>("posts", mkPost(viewedBookId, 300))).id;
    relatedPostId = (await insertOne<{ id: string }>("posts", mkPost(relatedBookId, 200))).id;
    neutralPostId = (await insertOne<{ id: string }>("posts", mkPost(neutralBookId, 100))).id;

    // Los AVANCES no son material de descubrimiento. Ambos están sembrados en la
    // posición MÁS favorable posible —misma obra que el post visto (score +2) y
    // los más recientes—, así que si el filtro faltara ganarían el raíl.
    authorProgressPostId = (
      await insertOne<{ id: string }>("posts", {
        ...mkPost(viewedBookId, 50),
        kind: "progressed",
        body: `Avance e2e ${ts} del autor`,
      })
    ).id;
    // Y el control POSITIVO de «Más sobre la obra»: un tercero con un pensamiento
    // (debe salir) y un avance (no debe) sobre la MISMA obra.
    otherThoughtPostId = (
      await insertOne<{ id: string }>("posts", {
        ...mkPost(viewedBookId, 80),
        author_id: other.id,
        body: `Pensamiento e2e ${ts} de otra persona`,
      })
    ).id;
    otherProgressPostId = (
      await insertOne<{ id: string }>("posts", {
        ...mkPost(viewedBookId, 40),
        author_id: other.id,
        kind: "progressed",
        body: `Avance e2e ${ts} de otra persona`,
      })
    ).id;

    await login(page);
    await page.goto(`/post/${viewedPostId}`);

    const conversacion = page.locator('[data-area="conversacion"]');
    const obra = page.locator('[data-area="obra"]');
    const social = page.locator('[data-area="social"]');

    await expect(conversacion).toBeVisible();

    // ── ≥1440: tres columnas, OBRA rica (CTA a ficha + un género), SOCIAL con el
    //    relacionado y SIN el post actual ──
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(obra).toBeVisible();
    await expect(social).toBeVisible();
    await expect(obra.getByRole("link", { name: /Ver ficha completa/i })).toBeVisible();
    await expect(obra.locator(`a[href="/libro/${viewedBookId}"]`).first()).toBeVisible();
    await expect(obra.getByText("Fantasía", { exact: true })).toBeVisible();
    // Creador tomado de `credits` (no de `books.author`): prueba `pickCreator`.
    await expect(obra.getByText(creditName)).toBeVisible();
    // Valoración de la comunidad = histograma (10 barras, una por media estrella).
    await expect(obra.locator('[title*="★ ·"]')).toHaveCount(10);
    // El bloque social lleva a OTRO post del autor (el relacionado) y NUNCA al
    // post actual (requisito #12).
    await expect(social.locator(`a[href="/post/${relatedPostId}"]`).first()).toBeVisible();
    await expect(social.locator(`a[href="/post/${viewedPostId}"]`)).toHaveCount(0);
    // «Más sobre la obra» sí trae el pensamiento del tercero (control positivo)…
    await expect(social.locator(`a[href="/post/${otherThoughtPostId}"]`).first()).toBeVisible();
    // …y NINGUNO de los dos avances entra en el raíl, pese a ser los más
    // recientes y sobre la misma obra.
    await expect(social.locator(`a[href="/post/${authorProgressPostId}"]`)).toHaveCount(0);
    await expect(social.locator(`a[href="/post/${otherProgressPostId}"]`)).toHaveCount(0);
    await expectNoHorizontalOverflow(page, 1600);

    // ── Desktop compacto y muy compacto: las 3 columnas AGUANTAN ──
    for (const width of [1280, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(obra, `OBRA visible a ${width}px`).toBeVisible();
      await expect(social, `SOCIAL visible a ${width}px`).toBeVisible();
      await expect(conversacion).toBeVisible();
      await expectNoHorizontalOverflow(page, width);
    }

    // ── <1000: una columna, OBRA oculta (la obra se alcanza por la tarjeta del
    //    post), la conversación sigue ──
    for (const width of [999, 768, 430, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(obra, `OBRA oculta a ${width}px`).toBeHidden();
      await expect(conversacion, `conversación visible a ${width}px`).toBeVisible();
      await expectNoHorizontalOverflow(page, width);
    }
  } finally {
    await deleteUser(author.id); // cascade: borra sus posts y pases (FK a auth.users)
    await deleteUser(other.id);
    for (const id of [viewedBookId, relatedBookId, neutralBookId]) {
      if (!id) continue;
      await rest(`credits?item_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
      await rest(`passes?item_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
      await rest(`books?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    }
    if (personId) await rest(`people?id=eq.${personId}`, { method: "DELETE" }).catch(() => {});
    void [
      relatedPostId,
      neutralPostId,
      viewedPostId,
      authorProgressPostId,
      otherThoughtPostId,
      otherProgressPostId,
    ];
  }
});
