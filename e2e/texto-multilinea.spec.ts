import { test, expect, type Page } from "@playwright/test";

// Párrafos y saltos de línea en el feed y en el hilo de comentarios.
//
// Tres fallos distintos con el mismo síntoma para quien escribe («he dejado una
// línea en blanco y no sale»):
//
//   1. `RichTextView` pintaba una línea por `<span class="block">`. Una línea
//      VACÍA —que es exactamente como se separa un párrafo— no genera caja de
//      línea: altura 0. Los dos párrafos salían pegados.
//   2. Las reseñas (`MentionText`) no tenían `whitespace-pre-line`, así que el
//      HTML colapsaba TODOS sus saltos a un espacio.
//   3. `/post/[id]` reusaba el extracto de 200 caracteres del feed, así que una
//      reseña larga salía cortada con "…" también en su página propia — y no
//      hay "ver más" en ninguna tarjeta.
//
// Las aserciones de 1 y 2 miden GEOMETRÍA (dónde cae cada párrafo), no
// contenido: el texto es idéntico esté el salto pintado o no, así que sin motor
// de layout no hay nada que distinguir — por eso esto es e2e y no unitario.
// La de 3 sí es de contenido (el final de la reseña está o no está).

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El SW ya sirvió payloads RSC obsoletos de caché (#66): se bloquea para que un
// fallo aquí sea del producto, no de una caché de fondo.
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

async function devtestId(): Promise<string> {
  const rows = await rest<{ user_id: string }[]>(
    `profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
  );
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Rectángulo REAL de un trozo de texto: se localiza el nodo de texto que lo
// contiene y se mide con un Range. Hace falta porque los dos párrafos viven en
// el MISMO elemento (los separa un "\n", no una caja), así que no hay dos
// locators de Playwright que comparar.
async function medirParrafos(page: Page, primero: string, segundo: string) {
  return page.evaluate(([a, b]) => {
    function rectOf(needle: string): DOMRect | null {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const i = node.textContent?.indexOf(needle) ?? -1;
        if (i < 0) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + needle.length);
        return range.getBoundingClientRect();
      }
      return null;
    }
    const ra = rectOf(a);
    const rb = rectOf(b);
    if (!ra || !rb) return null;
    return { salto: rb.top - ra.top, alturaLinea: ra.height };
  }, [primero, segundo]);
}

// Con la línea en blanco pintada, el segundo párrafo cae DOS líneas más abajo;
// sin ella, exactamente una. 1,5 separa los dos casos sin depender del
// interlineado exacto de cada tarjeta.
function esperaLineaEnBlanco(medida: { salto: number; alturaLinea: number } | null) {
  expect(medida, "no se encontraron los dos párrafos en la página").not.toBeNull();
  expect(medida!.alturaLinea).toBeGreaterThan(0);
  expect(medida!.salto).toBeGreaterThan(medida!.alturaLinea * 1.5);
}

test("un pensamiento y un comentario conservan la línea en blanco entre párrafos", async ({ page }) => {
  test.setTimeout(150_000);

  const owner = await devtestId();
  const ts = Date.now();
  const bookTitle = `E2E Multilinea ${ts}`;
  const P1 = `Primer parrafo ${ts}`;
  const P2 = `Segundo parrafo ${ts}`;
  // Una "palabra" sin espacios más larga que la tarjeta: si falta `break-words`
  // la tarjeta crece y la página coge scroll lateral.
  const CHURRO = `https://ejemplo.test/${"x".repeat(120)}`;

  let bookId: string | null = null;
  let postId: string | null = null;

  try {
    const book = await insertOne<{ id: string }>("books", { title: bookTitle });
    bookId = book.id;
    // El trigger `posts_sync_interaction_target` materializa el target `post`,
    // que es lo que engancha el hilo de comentarios.
    const post = await insertOne<{ id: string }>("posts", {
      author_id: owner,
      kind: "thought",
      anchor_type: "book",
      anchor_id: bookId,
      body: `${P1}\n\n${P2}\n\n${CHURRO}`,
    });
    postId = post.id;

    await login(page);
    await page.goto(`/post/${postId}`);
    const card = page.locator("article").filter({ hasText: bookTitle }).first();
    await expect(card).toBeVisible();

    // ── 1. El cuerpo del pensamiento conserva el párrafo ──
    esperaLineaEnBlanco(await medirParrafos(page, P1, P2));

    // ── El churro no desborda: la página no coge scroll horizontal ──
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desborde).toBeLessThanOrEqual(1);

    // ── 2. Un comentario de dos párrafos, escrito por la UI, se lee igual ──
    const C1 = `Comento primero ${ts}`;
    const C2 = `Comento segundo ${ts}`;
    await page.getByPlaceholder(/escribe un comentario/i).fill(`${C1}\n\n${C2}`);
    await page.getByRole("button", { name: /^comentar$/i }).click();
    await expect(page.getByText(C2)).toBeVisible();
    esperaLineaEnBlanco(await medirParrafos(page, C1, C2));

    // Y sobrevive a la recarga (lo de arriba podría ser el pintado optimista).
    await page.reload();
    await expect(page.getByText(C2)).toBeVisible();
    esperaLineaEnBlanco(await medirParrafos(page, C1, C2));
  } finally {
    // El trigger `posts_cleanup_social_target` limpia target/comentarios/
    // reacciones al borrar la fila del post.
    if (postId) await rest(`posts?id=eq.${postId}`, { method: "DELETE" }).catch(() => {});
    if (bookId) await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
  }
});

test("una reseña larga se lee ENTERA en /post/[id] (el extracto es solo del feed)", async ({ page }) => {
  test.setTimeout(150_000);

  const owner = await devtestId();
  const ts = Date.now();
  const bookTitle = `E2E Resena Larga ${ts}`;
  const REMATE = `remate de la resena ${ts}`;
  // > 200 caracteres (REVIEW_EXCERPT_LENGTH) y con salto de párrafo dentro.
  const RESENA = `Arranque de la resena.\n\n${"Relleno con suficientes palabras para pasar de los doscientos caracteres. ".repeat(4)}${REMATE}`;

  let bookId: string | null = null;
  let passId: string | null = null;
  let postId: string | null = null;

  try {
    expect(RESENA.length).toBeGreaterThan(200);
    const book = await insertOne<{ id: string }>("books", { title: bookTitle });
    bookId = book.id;
    // La reseña vive en `passes.review`; `pass_reviews` es la VISTA de solo
    // lectura que aplica la privacidad, así que se siembra el pase.
    const pass = await insertOne<{ id: string }>("passes", {
      user_id: owner,
      item_type: "book",
      item_id: bookId,
      status: "completed",
      is_active: true,
      is_public: true,
      started_on: "2026-08-01",
      finished_on: "2026-08-05",
      rating: 5,
      review: RESENA,
      position: {},
    });
    passId = pass.id;
    const post = await insertOne<{ id: string }>("posts", {
      author_id: owner,
      kind: "finished",
      anchor_type: "book",
      anchor_id: bookId,
      source_kind: "pass",
      source_id: passId,
    });
    postId = post.id;

    await login(page);
    await page.goto(`/post/${postId}`);
    await expect(page.locator("article").filter({ hasText: bookTitle }).first()).toBeVisible();

    // El final de la reseña está: no hay corte a 200 caracteres en su ruta.
    await expect(page.getByText(REMATE)).toBeVisible();
    // Y sus párrafos siguen siendo párrafos.
    esperaLineaEnBlanco(await medirParrafos(page, "Arranque de la resena.", REMATE));
  } finally {
    if (postId) await rest(`posts?id=eq.${postId}`, { method: "DELETE" }).catch(() => {});
    if (passId) await rest(`passes?id=eq.${passId}`, { method: "DELETE" }).catch(() => {});
    if (bookId) await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
  }
});
