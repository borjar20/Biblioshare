import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Arranque copiado de e2e/posts.spec.ts (los specs de e2e no se importan entre
// sí: se copian los helpers). Cubre lo que en esta rama no puede cubrir un
// test unitario del ReactionBar: clic, foco, aria-pressed y persistencia
// contra el servidor — no hay runner de componentes aquí.
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

// Usuario desechable para el flujo multi-cuenta (patrón de posts.spec.ts /
// avisos-por-persona.spec.ts): la reacción "ajena" tiene que venir de alguien
// que no sea el viewer, o la fila de ya-reaccionados no se distingue de la
// fila rápida.
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

// Reaccionar con un emoji fuera de la fila rápida, y sumarse a una reacción
// ajena. Cubre lo que en esta rama no puede cubrir un test unitario: clic,
// aria-pressed y persistencia contra el servidor (no hay runner de
// componentes aquí — reaction-display.test.ts prueba solo las funciones
// puras de orden/resumen, no el DOM).
test("reaccionar con un emoji del catálogo, sumarse a una reacción ajena y persistir tras recargar", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const owner = await devtestId();
  const ts = Date.now();
  const bookTitle = `E2E Reacciones ${ts}`;
  const stranger = await createUser(request, `emojiaj${ts}`.slice(0, 20));

  let bookId: string | null = null;
  let postId: string | null = null;

  try {
    // ── Post propio (mismo patrón mínimo que "un comentario ajeno notifica…"
    //    en posts.spec.ts: kind=thought con body, sin necesidad de pase) ──
    const book = await insertOne<{ id: string }>("books", { title: bookTitle });
    bookId = book.id;
    const post = await insertOne<{ id: string }>("posts", {
      author_id: owner,
      kind: "thought",
      anchor_type: "book",
      anchor_id: bookId,
      body: `Post para reaccionar ${ts}`,
    });
    postId = post.id;

    // El trigger posts_sync_interaction_target ya materializó el target `post`.
    const [target] = await rest<{ id: string }[]>(
      `interaction_targets?kind=eq.post&source_id=eq.${postId}&select=id`,
    );
    expect(target?.id).toBeTruthy();

    // Un desconocido ya reaccionó con 🎉 — no está en la fila rápida (❤️ 📖 😱
    // 🔥 😂 👏), así la fila de "ya-reaccionados" no se puede confundir con la
    // fila fija cuando el viewer se sume a ella.
    await insertOne("reactions", {
      interaction_target_id: target.id,
      user_id: stranger.id,
      kind: "🎉",
    });

    await login(page);
    await page.goto(`/post/${postId}`);
    await expect(page.locator("article").filter({ hasText: bookTitle })).toBeVisible();

    // ── Colapsado: el botón de reacciones se llama "Reaccionar" ──
    const collapsed = page.getByRole("button", { name: "Reaccionar" }).first();
    await expect(collapsed).toBeVisible();

    // ── Fila rápida fija: un clic sobre "fuego" (🔥) ──
    await collapsed.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const fuego = page.getByRole("button", { name: "fuego" }).first();
    await expect(fuego).toHaveAttribute("aria-pressed", "false");
    await fuego.click();

    // El popover se cierra al elegir, y el colapsado ya refleja el emoji.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(collapsed).toContainText("🔥");

    // ── "Más emojis" abre el catálogo DENTRO del mismo popover: buscador +
    //    rejilla. Buscamos algo que NO está en la fila rápida (🐙 pulpo). ──
    await collapsed.click();
    await page.getByRole("button", { name: "Más emojis" }).click();
    const buscador = page.getByRole("searchbox", { name: "Buscar emoji" });
    await expect(buscador).toBeVisible();
    await buscador.fill("pulpo");
    await page.getByRole("button", { name: "pulpo" }).first().click();

    // Elegir en el catálogo también cierra el popover y actualiza el colapsado.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(collapsed).toContainText("🐙");

    // ── Persiste tras recargar: es la verdad del servidor, no el optimismo
    //    del cliente ──
    await page.reload();
    await collapsed.click();
    await expect(page.getByRole("button", { name: "fuego" }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // ── Fila de "ya-reaccionados": sumarse de un clic a la reacción del
    //    desconocido (🎉, con recuento). Sus botones no llevan aria-label —el
    //    nombre accesible es el propio emoji más el recuento— así que se casa
    //    por el carácter, que no aparece en ningún aria-label de la fila
    //    rápida (esos usan el nombre CLDR, p. ej. "fuego"). ──
    const ajena = page.getByRole("button", { name: "🎉" }).first();
    await expect(ajena).toBeVisible();
    await expect(ajena).toHaveAttribute("aria-pressed", "false");
    await ajena.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Verdad del servidor: la reacción propia con 🎉 se guardó (dos personas
    // reaccionando con el mismo emoji, no solo lo que pinta el DOM).
    await expect
      .poll(
        async () =>
          (
            await rest<{ id: string }[]>(
              `reactions?interaction_target_id=eq.${target.id}&user_id=eq.${owner}&kind=eq.🎉&select=id`,
            )
          ).length,
        { timeout: 15_000, message: "la reacción propia con 🎉 debe persistir" },
      )
      .toBeGreaterThan(0);

    // ── Quitar una reacción propia: el mismo botón de la fila rápida
    //    conmuta, y aria-pressed vuelve a "false" ──
    await collapsed.click();
    await expect(page.getByRole("button", { name: "fuego" }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "fuego" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await collapsed.click();
    await expect(page.getByRole("button", { name: "fuego" }).first()).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  } finally {
    // El trigger `posts_cleanup_social_target` limpia target/comments/
    // reactions/notifications al borrar la fila del post — incluida la
    // reacción del desconocido.
    if (bookId) {
      await rest(`posts?anchor_id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
      await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    }
    await deleteUser(stranger.id);
  }
});
