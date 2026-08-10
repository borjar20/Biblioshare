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
// compositor escribe `posts` (Task 8: repuntado de createThought a createPost).
async function publishThought(page: Page, opts: { anchorTitle: string; body: string }) {
  await page.getByRole("button", { name: "Compartir un pensamiento" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo pensamiento" });
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder(/busca un libro/i).fill(opts.anchorTitle);
  const result = dialog.getByRole("button", { name: opts.anchorTitle });
  await expect(result).toBeVisible();
  await result.click();

  await dialog.getByPlaceholder("¿Qué piensas?").fill(opts.body);
  await dialog.getByRole("button", { name: "Publicar" }).click();
  await expect(dialog).toBeHidden();
}

// ── Fixtures reales de devtest para conducir la hoja de sesión (Spec 2). Mismo
//    patrón que registrar-sesion-v2.spec.ts: se RESUELVEN por título, nunca por
//    UUID fijo, para sobrevivir a un reset de dev; preparar datos por la UI es
//    frágil (docs/TRAMPAS §15). Los specs de e2e no se importan entre sí: se
//    copian los helpers. ──
async function resolveBookFixture(userId: string): Promise<{ itemId: string; passId: string }> {
  const [book] = await rest<{ id: string }[]>(
    `books?title=eq.${encodeURIComponent("The Final Empire")}&select=id`,
  );
  if (!book) throw new Error('no se encontró el libro fixture "The Final Empire" en catálogo');
  const [pass] = await rest<{ id: string }[]>(
    `passes?user_id=eq.${userId}&item_type=eq.book&item_id=eq.${book.id}&is_active=eq.true&select=id`,
  );
  if (!pass) throw new Error('devtest no tiene pase activo sobre "The Final Empire"');
  return { itemId: book.id, passId: pass.id };
}

type PassSnapshot = Record<string, unknown>;
async function snapshotPass(passId: string): Promise<PassSnapshot> {
  const [row] = await rest<PassSnapshot[]>(
    `passes?id=eq.${passId}&select=status,position,started_on,finished_on,rating,review,is_public`,
  );
  if (!row) throw new Error(`no se pudo fotografiar el pase ${passId}`);
  return row;
}
async function restorePass(passId: string, snapshot: PassSnapshot) {
  await rest(`passes?id=eq.${passId}`, { method: "PATCH", body: snapshot }).catch(() => {});
}
async function sessionIds(passId: string): Promise<Set<string>> {
  const rows = await rest<{ id: string }[]>(`progress_sessions?pass_id=eq.${passId}&select=id`);
  return new Set(rows.map((r) => r.id));
}

// El bloque "Sesiones" de la ficha ancla el CTA "Registrar sesión" (funciona
// igual para libro y serie, no depende de cuántos enlaces compartan el href).
function sessionLink(page: Page, passId: string) {
  return page
    .getByRole("heading", { name: "Sesiones", level: 3 })
    .locator("xpath=..")
    .getByRole("link", { name: /registrar sesión/i })
    .and(page.locator(`[href="/sesion/${passId}"]`));
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

    // ── /post/[id]: cabecera-post + hilo (PostThread, Spec 2b). El composer va
    //    SIEMPRE visible (sin expandir) y el hilo se pinta abierto. ──
    await page.goto(`/post/${thoughtPost.id}`);
    await expect(page.locator("article").filter({ hasText: thoughtBookTitle })).toBeVisible();
    await expect(page.getByText(body)).toBeVisible();

    const comentario = `comentario en /post ${ts}`;
    await page.getByPlaceholder(/escribe un comentario/i).fill(comentario);
    await page.getByRole("button", { name: /^comentar$/i }).click();
    await expect(page.getByText(comentario)).toBeVisible();

    // Reacción al post: barra de acciones del hilo. El selector desplegable
    // (ReactionBar) se abre y se pulsa Fuego (🔥); la del post va primera.
    await page.getByRole("button", { name: "Reaccionar" }).first().click();
    const fire = page.getByRole("button", { name: "Fuego" }).first();
    await expect(fire).toHaveAttribute("aria-pressed", "false");
    await fire.click();
    await expect(fire).toHaveAttribute("aria-pressed", "true");

    // ── Persiste: recargar /post/[id] y la verdad del servidor lo confirma
    //    (el hilo se pinta abierto, el comentario sigue ahí). ──
    await page.reload();
    await expect(page.getByText(comentario)).toBeVisible();
    await page.getByRole("button", { name: "Reaccionar" }).first().click();
    await expect(page.getByRole("button", { name: "Fuego" }).first()).toHaveAttribute(
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
    await expect(page.locator("article").filter({ hasText: bookTitle })).toBeVisible();
    // Composer del hilo siempre visible (PostThread): sin expandir.
    await page.getByPlaceholder(/escribe un comentario/i).fill(`hola desde el comentador ${stamp}`);
    await page.getByRole("button", { name: /^comentar$/i }).click();
    await expect(page.getByText(`hola desde el comentador ${stamp}`)).toBeVisible();

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

// Spec 2b — /post/[id] con hilo anidado (PostThread) + deep-link al subhilo: una
// RESPUESTA a un comentario avisa a su autor, y ese aviso lleva a `/post/[id]#c-<id>`
// (target del comentario con ancla, migración 20260848) — no a la cabecera genérica.
// Tres usuarios: el aviso de respuesta solo salta si quien responde ≠ autor del
// comentario ≠ dueño del post (si coincidieran, lo cubre el aviso al dueño, sin ancla).
test("el hilo de /post/[id] anida una respuesta y el aviso deep-linka al subhilo", async ({ page, request }) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const owner = await createUser(request, `hilon${stamp}`.slice(0, 20));
  const commenter = await createUser(request, `hiloc${stamp}`.slice(0, 20));
  const replier = await createUser(request, `hilor${stamp}`.slice(0, 20));
  const bookTitle = `E2E Hilo Post ${stamp}`;

  let bookId: string | null = null;
  let postId: string | null = null;

  try {
    const book = await insertOne<{ id: string }>("books", { title: bookTitle });
    bookId = book.id;
    const post = await insertOne<{ id: string }>("posts", {
      author_id: owner.id,
      kind: "thought",
      anchor_type: "book",
      anchor_id: bookId,
      body: `Post con hilo ${stamp}`,
    });
    postId = post.id;
    const [postTarget] = await rest<{ id: string }[]>(
      `interaction_targets?kind=eq.post&source_id=eq.${postId}&select=id`,
    );
    expect(postTarget?.id).toBeTruthy();
    // Comentario raíz del `commenter` (autor distinto del dueño del post).
    await insertOne<{ id: string }>("comments", {
      interaction_target_id: postTarget.id,
      author_id: commenter.id,
      body: `Comentario raíz ${stamp}`,
    });

    // ── `replier` abre el post, ve el hilo y responde al comentario raíz ──
    await loginAs(page, replier.email, replier.password);
    await page.goto(`/post/${postId}`);
    await expect(page.getByText(`Comentario raíz ${stamp}`)).toBeVisible();

    await page.getByRole("button", { name: /^responder$/i }).first().click();
    await page.getByPlaceholder(/escribe una respuesta/i).fill(`Respuesta anidada ${stamp}`);
    await page.getByRole("button", { name: /^comentar$/i }).click();
    // La respuesta se pinta anidada en el hilo (optimista).
    await expect(page.getByText(`Respuesta anidada ${stamp}`)).toBeVisible();

    // ── El aviso de respuesta del `commenter` deep-linka a `#c-<id>` (verdad del
    //    servidor: la server action addComment lo crea apuntando al target del
    //    comentario, con ancla). ──
    await expect
      .poll(
        async () => {
          const rows = await rest<{ interaction_target_id: string | null }[]>(
            `notifications?user_id=eq.${commenter.id}&select=interaction_target_id&order=created_at.desc&limit=1`,
          );
          const targetId = rows[0]?.interaction_target_id;
          if (!targetId) return "";
          const [tgt] = await rest<{ href: string }[]>(
            `interaction_targets?id=eq.${targetId}&select=href`,
          );
          return tgt?.href ?? "";
        },
        { timeout: 15_000, message: "el aviso de respuesta debe deep-linkar a /post/[id]#c-" },
      )
      .toContain(`/post/${postId}#c-`);

    // ── El `commenter` abre la campana y el aviso le lleva al subhilo (#c-) ──
    await loginAs(page, commenter.email, commenter.password);
    await page.getByRole("button", { name: "Notificaciones" }).click();
    const aviso = page.getByRole("link").filter({ hasText: /comentó|respondió/i }).first();
    await expect(aviso).toBeVisible();
    await aviso.click();
    await expect(page).toHaveURL(new RegExp(`/post/${postId}#c-`));
  } finally {
    if (bookId) {
      await rest(`posts?anchor_id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
      await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    }
    await deleteUser(owner.id);
    await deleteUser(commenter.id);
    await deleteUser(replier.id);
  }
});

// Spec 2 — Compartir desde el formulario: el toggle «Compartir en mi perfil» de
// la hoja de sesión publica un post `progressed` con el texto opcional como
// cuerpo social; sin marcar, la sesión queda privada (comportamiento previo).
test("compartir una sesión desde el formulario publica un post 'progressed'", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const owner = await devtestId();
  const { itemId, passId } = await resolveBookFixture(owner);

  const stamp = Date.now();
  const shareBody = `Sesión compartida e2e ${stamp}`;
  const bodyFilter = encodeURIComponent(shareBody);
  const passSnapshot = await snapshotPass(passId);
  const sessionsBefore = await sessionIds(passId);

  try {
    await page.goto(`/libro/${itemId}?tab=log`);
    const dialog = page.getByRole("dialog");
    await sessionLink(page, passId).click();
    await expect(dialog).toBeVisible();

    // Página 5: lejísimos del total, nunca dispara el auto-cierre.
    await dialog.locator('input[name="page"]').fill("5");
    // El checkbox despliega el texto social opcional (default oculto).
    await dialog.getByRole("checkbox", { name: "Compartir en mi perfil" }).check();
    await dialog.getByPlaceholder(/algo que contar/i).fill(shareBody);
    await dialog.getByRole("button", { name: "Guardar sesión" }).click();
    await expect(dialog).toBeHidden();

    // La sesión (fuente de verdad) se guardó Y además existe un post
    // 'progressed' con el cuerpo social — se espera a la verdad del SERVIDOR
    // (createPost corre en la server action; el `body` único evita chocar con
    // posts 'progressed' viejos de esta obra en el backfill). Ver #558.
    await expect
      .poll(
        async () =>
          (await rest<{ id: string }[]>(`posts?kind=eq.progressed&body=eq.${bodyFilter}&select=id`))
            .length,
        { timeout: 15_000, message: "el post progressed de la sesión compartida debe persistir" },
      )
      .toBeGreaterThan(0);

    const [fresh] = await rest<{ id: string }[]>(
      `posts?kind=eq.progressed&body=eq.${bodyFilter}&select=id`,
    );

    // Tiene su /post/[id] con el cuerpo social visible.
    await page.goto(`/post/${fresh.id}`);
    await expect(page.locator("article").filter({ hasText: shareBody })).toBeVisible();
  } finally {
    // El post 'progressed' cuelga de la sesión NUEVA: borra ambos y restaura el
    // pase (devtest es persistente y compartido — dejar la página movida o un
    // post suelto envenena corridas futuras).
    const rows = await rest<{ id: string }[]>(`progress_sessions?pass_id=eq.${passId}&select=id`).catch(
      () => [] as { id: string }[],
    );
    const newIds = rows.map((r) => r.id).filter((id) => !sessionsBefore.has(id));
    if (newIds.length > 0) {
      await rest(`posts?source_id=in.(${newIds.join(",")})&kind=eq.progressed`, {
        method: "DELETE",
      }).catch(() => {});
      await rest(`progress_sessions?id=in.(${newIds.join(",")})`, { method: "DELETE" }).catch(
        () => {},
      );
    }
    await restorePass(passId, passSnapshot);
  }
});

// Spec 2 — UI de post_preferences: la hoja de ajustes del perfil escribe la
// tabla que hoy solo se leía (sin esta pantalla, started/dropped nunca podían
// activarse). Cubre también la trampa #375: un upsert con una columna sin grant
// rompería la escritura entera de la tabla.
test("la UI de ajustes escribe post_preferences (autopublicar hitos)", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const owner = await devtestId();

  // Snapshot de la fila (puede no existir): al final se restaura o se borra,
  // para no dejar la preferencia de devtest cambiada entre corridas.
  const before =
    (
      await rest<{ autopost_started: boolean; autopost_finished: boolean; autopost_dropped: boolean }[]>(
        `post_preferences?user_id=eq.${owner}&select=autopost_started,autopost_finished,autopost_dropped`,
      )
    )[0] ?? null;
  const wasOn = before?.autopost_started ?? false;

  try {
    await page.goto(`/u/${USERNAME}`);
    await page.getByRole("button", { name: "Ajustes" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const started = dialog.getByRole("switch", { name: "Al empezar una obra" });
    // El interruptor arranca deshabilitado hasta cargar; esperar a que refleje
    // el estado real antes de leerlo y pulsarlo.
    await expect(started).toBeEnabled();
    await expect(started).toHaveAttribute("aria-checked", wasOn ? "true" : "false");
    await started.click();

    // La verdad del servidor: post_preferences.autopost_started cambió (upsert
    // sin updated_at — si el grant por columna estuviera mal, aquí reventaría).
    await expect
      .poll(
        async () =>
          (
            await rest<{ autopost_started: boolean }[]>(
              `post_preferences?user_id=eq.${owner}&select=autopost_started`,
            )
          )[0]?.autopost_started ?? null,
        { timeout: 15_000, message: "el toggle debe persistir en post_preferences" },
      )
      .toBe(!wasOn);

    // Persiste tras recargar: reabrir ajustes y el interruptor sigue en su sitio.
    await page.reload();
    await page.getByRole("button", { name: "Ajustes" }).click();
    const reopened = page.getByRole("dialog").getByRole("switch", { name: "Al empezar una obra" });
    await expect(reopened).toBeEnabled();
    await expect(reopened).toHaveAttribute("aria-checked", (!wasOn).toString());
  } finally {
    if (before) {
      await rest(`post_preferences?user_id=eq.${owner}`, { method: "PATCH", body: before }).catch(
        () => {},
      );
    } else {
      await rest(`post_preferences?user_id=eq.${owner}`, { method: "DELETE" }).catch(() => {});
    }
  }
});
