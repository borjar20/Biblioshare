import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

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
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} — ${text}`);
  }
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

// Usuarios frescos y públicos para el flujo multi-cuenta (patrón de
// avisos-por-persona.spec.ts): un aviso cruza de un usuario a otro.
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
  return { id: user.id as string, username, email, password };
}

async function deleteUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  }).catch(() => {});
}

async function loginAs(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Publica un Pensamiento (post kind=thought) desde la cabecera del feed. El
// compositor escribe `posts` (Task 8: repuntado de createThought a createPost)
// y va desplegado inline (ya no en un modal): al terminar se remonta limpio, así
// que el éxito se comprueba con el textarea de nuevo vacío.
async function publishThought(page: Page, opts: { anchorTitle: string; body: string }) {
  const composer = page.getByRole("region", { name: "Compartir un pensamiento" });
  await expect(composer).toBeVisible();

  await composer.getByPlaceholder(/busca un libro/i).fill(opts.anchorTitle);
  const result = composer.getByRole("button", { name: opts.anchorTitle });
  await expect(result).toBeVisible();
  await result.click();

  const bodyField = composer.getByPlaceholder("¿Qué piensas?");
  await bodyField.fill(opts.body);
  await composer.getByRole("button", { name: "Publicar" }).click();
  await expect(bodyField).toHaveValue("");
}

// Ruta propia del post `/post/[id]` (Spec 1, Task 11): el post es la entidad
// social canónica con id estable y página propia donde vive su hilo. Patrón del
// club desechable (thoughts.spec.ts / club-ronda.spec.ts): datos propios por
// REST con service-role, borrados en el `finally`.
test("un post tiene su página /post/[id] con cuerpo y hilo (pensamiento y hito)", async ({ page }) => {
  test.setTimeout(150_000);

  const owner = await devtestId();
  const ts = Date.now();
  const thoughtBookTitle = `E2E Post Pensamiento ${ts}`;
  const finishedBookTitle = `E2E Post Terminado ${ts}`;

  let thoughtBookId: string | null = null;
  let finishedBookId: string | null = null;
  let thoughtPassId: string | null = null;
  let finishedPassId: string | null = null;
  let finishedPostId: string | null = null;

  try {
    // ── Obra + pase para el pensamiento (searchAnchors solo ofrece obras de la
    //    biblioteca activa del viewer) ──
    const tBook = await insertOne<{ id: string }>("books", { title: thoughtBookTitle });
    thoughtBookId = tBook.id;
    const tPass = await insertOne<{ id: string }>("passes", {
      user_id: owner,
      item_type: "book",
      item_id: thoughtBookId,
      status: "planned",
      is_active: true,
      is_public: true,
      position: {},
    });
    thoughtPassId = tPass.id;

    await login(page);
    await page.goto("/");

    // ── Publicar un Pensamiento y localizar su post ──
    const body = `Cuerpo del post — prueba ${ts}.`;
    await publishThought(page, { anchorTitle: thoughtBookTitle, body });
    await expect(page.locator("article").filter({ hasText: thoughtBookTitle })).toBeVisible();

    const [thoughtPost] = await rest<{ id: string }[]>(
      `posts?anchor_id=eq.${thoughtBookId}&kind=eq.thought&select=id`,
    );
    expect(thoughtPost?.id).toBeTruthy();

    // ── /post/[id]: cuerpo + hilo, comentar y reaccionar ──
    await page.goto(`/post/${thoughtPost.id}`);
    const card = page.locator("article").filter({ hasText: thoughtBookTitle });
    await expect(card).toBeVisible();
    await expect(card.getByText(body)).toBeVisible();

    const comentario = `comentario en /post ${ts}`;
    await card.getByRole("button", { name: /0 comentarios/i }).click();
    await card.getByPlaceholder(/escribe un comentario/i).fill(comentario);
    await card.getByRole("button", { name: /^comentar$/i }).click();
    await expect(card.getByText(comentario)).toBeVisible();
    await expect(card.getByRole("button", { name: /1 comentario/i })).toBeVisible();

    // La reacción es un selector desplegable (ReactionBar): hay un "Reaccionar"
    // por barra —el del post va primero en el DOM—; se abre y se pulsa Fuego (🔥).
    await card.getByRole("button", { name: "Reaccionar" }).first().click();
    const fire = card.getByRole("button", { name: "Fuego" }).first();
    await expect(fire).toHaveAttribute("aria-pressed", "false");
    await fire.click();
    await expect(fire).toHaveAttribute("aria-pressed", "true");

    // ── Persiste: recargar /post/[id] y la verdad del servidor lo confirma ──
    await page.reload();
    const reloaded = page.locator("article").filter({ hasText: thoughtBookTitle });
    // El hilo vuelve colapsado tras recargar (estado de cliente): se re-expande.
    await expect(reloaded.getByRole("button", { name: /1 comentario/i })).toBeVisible();
    await reloaded.getByRole("button", { name: /1 comentario/i }).click();
    await expect(reloaded.getByText(comentario)).toBeVisible();
    // Reabrir el selector para leer el estado persistido de la reacción.
    await reloaded.getByRole("button", { name: "Reaccionar" }).first().click();
    await expect(reloaded.getByRole("button", { name: "Fuego" }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // ── Un hito `finished` también tiene su /post/[id] (tarjeta de reseña) ──
    const fBook = await insertOne<{ id: string }>("books", { title: finishedBookTitle });
    finishedBookId = fBook.id;
    const fPass = await insertOne<{ id: string }>("passes", {
      user_id: owner,
      item_type: "book",
      item_id: finishedBookId,
      status: "completed",
      is_active: true,
      is_public: true,
      started_on: "2026-08-01",
      finished_on: "2026-08-05",
      rating: 4,
      position: {},
    });
    finishedPassId = fPass.id;
    // El trigger `posts_sync_interaction_target` materializa el target `post`.
    const fPost = await insertOne<{ id: string }>("posts", {
      author_id: owner,
      kind: "finished",
      anchor_type: "book",
      anchor_id: finishedBookId,
      source_kind: "pass",
      source_id: finishedPassId,
    });
    finishedPostId = fPost.id;

    await page.goto(`/post/${finishedPostId}`);
    const finishedCard = page.locator("article").filter({ hasText: finishedBookTitle });
    await expect(finishedCard).toBeVisible();

    // ── Un post inexistente NO filtra contenido: no se pinta ninguna tarjeta ──
    // Lo IDEAL es un 404, pero bajo Partial Prerender un notFound() del body
    // sirve el shell con 200 (trampa #514, común a TODA ruta gateada por datos de
    // sesión/BD — no específica de posts; `genero` sí da 404 porque gatea por
    // params). Lo crítico —que un post no visible/inexistente no filtre nada— se
    // verifica por CONTENIDO; el status se acepta 200 o 404 hasta que se cierre
    // la migración a Cache Components (#514).
    const missing = await page.goto("/post/00000000-0000-0000-0000-000000000000");
    expect([200, 404]).toContain(missing?.status());
    await expect(page.locator("article")).toHaveCount(0);
  } finally {
    // El trigger `posts_cleanup_social_target` limpia target/comments/reactions/
    // notifications al borrar la fila: basta borrar los posts por su ancla, y
    // luego pases y catálogo desechables.
    const bookIds = [thoughtBookId, finishedBookId].filter((id): id is string => !!id);
    if (bookIds.length > 0) {
      await rest(`posts?anchor_id=in.(${bookIds.join(",")})`, { method: "DELETE" }).catch(() => {});
    }
    for (const passId of [thoughtPassId, finishedPassId]) {
      if (passId) await rest(`passes?id=eq.${passId}`, { method: "DELETE" }).catch(() => {});
    }
    for (const bookId of bookIds) {
      await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    }
  }
});

// Notificación al post (Task 12): un comentario ajeno avisa al autor y el aviso
// deep-linka a /post/[id] — el href del target `post` (que el trigger fijó a
// /post/[id]) lo lee la campana directamente por interaction_target_id.
test("un comentario ajeno notifica al autor y el aviso lleva a /post/[id]", async ({ page, request }) => {
  test.setTimeout(120_000);

  const stamp = Date.now();
  const author = await createUser(request, `postauth${stamp}`.slice(0, 20));
  const commenter = await createUser(request, `postcom${stamp}`.slice(0, 20));
  const bookTitle = `E2E Post Aviso ${stamp}`;

  let bookId: string | null = null;
  let postId: string | null = null;

  try {
    const book = await insertOne<{ id: string }>("books", { title: bookTitle });
    bookId = book.id;
    // El post del autor por REST (service-role): el trigger
    // `posts_sync_interaction_target` materializa su target `post` con
    // href=/post/[id]. El autor es público (createUser), así que el comentador
    // lo ve por la RLS `posts select visible`.
    const post = await insertOne<{ id: string }>("posts", {
      author_id: author.id,
      kind: "thought",
      anchor_type: "book",
      anchor_id: bookId,
      body: `Post para avisar ${stamp}`,
    });
    postId = post.id;

    // ── El comentador ve /post/[id] y comenta (la server action avisa al autor) ──
    await loginAs(page, commenter.email, commenter.password);
    await page.goto(`/post/${postId}`);
    const card = page.locator("article").filter({ hasText: bookTitle });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /0 comentarios/i }).click();
    await card.getByPlaceholder(/escribe un comentario/i).fill(`hola desde el comentador ${stamp}`);
    await card.getByRole("button", { name: /^comentar$/i }).click();
    await expect(card.getByText(`hola desde el comentador ${stamp}`)).toBeVisible();

    // El compositor de comentarios es OPTIMISTA: pinta el comentario en el DOM al
    // instante mientras la server action (addComment → notify) corre en una
    // transición de React. Sin esperar a la verdad del SERVIDOR, A abriría la
    // campana antes de que el aviso exista — carrera (el test salía "flaky", con
    // la BD aún vacía justo tras el render optimista). Se espera al aviso
    // `post_commented` del autor en la BD (service-role) antes de seguir.
    await expect
      .poll(
        async () =>
          (
            await rest<{ id: string }[]>(
              `notifications?user_id=eq.${author.id}&type=eq.post_commented&select=id`,
            )
          ).length,
        { timeout: 15_000, message: "el aviso post_commented del autor debe persistir" },
      )
      .toBeGreaterThan(0);

    // ── El autor abre la campana, ve el aviso y al pulsarlo aterriza en /post/[id] ──
    await loginAs(page, author.email, author.password);
    await page.getByRole("button", { name: "Notificaciones" }).click();
    const aviso = page.getByRole("link").filter({ hasText: /comentó tu publicación/i });
    await expect(aviso).toBeVisible();
    await aviso.click();
    await expect(page).toHaveURL(new RegExp(`/post/${postId}$`));
  } finally {
    if (bookId) {
      await rest(`posts?anchor_id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
      await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    }
    await deleteUser(author.id);
    await deleteUser(commenter.id);
  }
});
