import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El SW ya sirvió payloads RSC obsoletos de caché (#66): se bloquea para que un
// fallo aquí sea del producto, no de una caché de fondo. Mismo patrón que
// posts.spec.ts — los specs de e2e no se importan entre sí, se copian los
// helpers (docs/TRAMPAS §15).
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

// Publica un Pensamiento (post kind=thought) desde la cabecera del feed. El
// compositor escribe `posts` y es plegable inline: se despliega desde su botón
// y al terminar se pliega solo, así que el éxito se comprueba con la región
// oculta. Copiado de posts.spec.ts.
async function publishThought(page: Page, opts: { anchorTitle: string; body: string }) {
  await page.getByRole("button", { name: "Compartir un pensamiento" }).click();
  const composer = page.getByRole("region", { name: "Nuevo pensamiento" });
  await expect(composer).toBeVisible();

  await composer.getByPlaceholder(/busca un libro/i).fill(opts.anchorTitle);
  const result = composer.getByRole("button", { name: opts.anchorTitle });
  await expect(result).toBeVisible();
  await result.click();

  await composer.getByPlaceholder("¿Qué piensas?").fill(opts.body);
  await composer.getByRole("button", { name: "Publicar" }).click();
  await expect(composer).toBeHidden();
}

// Notas de voz en el hilo de un post (Task 14): el micro falso de chromium
// (playwright.config.ts) entrega un tono sin diálogo de permiso, así que
// grabar/parar/publicar corre sin intervención humana. Serial porque el
// segundo test depende del freno "consecutivo" (spec §4): necesita que el
// ÚLTIMO comentario del hilo sea el audio propio que publicó el primero — se
// comparte el mismo post a propósito, no aislamiento por test.
test.describe.serial("notas de voz en un post", () => {
  let bookId: string | null = null;
  let passId: string | null = null;
  let postId: string | null = null;

  test.afterAll(async () => {
    // El trigger `posts_cleanup_social_target` limpia target/comments/
    // reactions/notifications (incluidas las filas de voice_notes) al borrar
    // el post — basta borrar por su ancla, y luego pase y catálogo desechables.
    if (bookId) {
      await rest(`posts?anchor_id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    }
    if (passId) {
      await rest(`passes?id=eq.${passId}`, { method: "DELETE" }).catch(() => {});
    }
    if (bookId) {
      await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    }
  });

  test("grabar, previsualizar y publicar una nota de voz en un post", async ({ page }) => {
    test.setTimeout(120_000);

    const owner = await devtestId();
    const ts = Date.now();
    const bookTitle = `E2E Voz ${ts}`;

    // Obra + pase para el pensamiento (searchAnchors solo ofrece obras de la
    // biblioteca activa del viewer).
    const book = await insertOne<{ id: string }>("books", { title: bookTitle });
    bookId = book.id;
    const pass = await insertOne<{ id: string }>("passes", {
      user_id: owner,
      item_type: "book",
      item_id: bookId,
      status: "planned",
      is_active: true,
      is_public: true,
      position: {},
    });
    passId = pass.id;

    await login(page);
    await page.goto("/");
    await publishThought(page, { anchorTitle: bookTitle, body: `Pensamiento para audio ${ts}` });

    const [post] = await rest<{ id: string }[]>(
      `posts?anchor_id=eq.${bookId}&kind=eq.thought&select=id`,
    );
    expect(post?.id).toBeTruthy();
    postId = post!.id;

    await page.goto(`/post/${postId}`);
    await expect(page.locator("article").filter({ hasText: bookTitle })).toBeVisible();
    // El hilo (PostThread, con el composer y su mic) llega por streaming tras
    // su <Suspense> (shell estático primero — mismo patrón que pase-hub.spec.ts
    // y movil-desbordes.spec.ts): sin esto, el clic cae sobre una instancia que
    // el streaming reemplaza justo después y el estado se pierde.
    await page.waitForLoadState("networkidle").catch(() => {});

    // Grabar: el mic está donde estaría «Enviar» con el campo vacío.
    await page.getByTestId("voice-mic").click();
    await expect(page.getByTestId("voice-recorder")).toBeVisible();
    await page.waitForTimeout(3000); // >2 s de mínimo, el micro falso emite un tono
    await page.getByTestId("voice-stop").click();

    // Previsualización obligatoria: nada se publica sin pasar por aquí.
    await expect(page.getByTestId("voice-preview")).toBeVisible();
    await page.getByTestId("voice-publish").click();

    // El chip aparece (optimista) y sobrevive a la recarga (fila real + URL firmada).
    await expect(page.getByTestId("voice-note-chip")).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId("voice-note-chip")).toBeVisible();

    // Y reproduce: el tiempo restante cambia al darle a play.
    const chip = page.getByTestId("voice-note-chip");
    const before = await chip.locator("span.font-mono").innerText();
    await chip.getByRole("button").first().click();
    await expect(async () => {
      expect(await chip.locator("span.font-mono").innerText()).not.toBe(before);
    }).toPass({ timeout: 5000 });
  });

  test("tras publicar, el mic queda atenuado hasta que alguien responda (freno consecutivo)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    expect(postId, "el post del test anterior debe existir").toBeTruthy();

    await login(page);
    await page.goto(`/post/${postId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // El último comentario del hilo es mi audio del test anterior: el mic se
    // atenúa (voiceGate → reason "consecutive").
    await expect(page.getByTestId("voice-mic")).toBeDisabled();

    // El texto sigue funcionando con el mic atenuado.
    const comentario = `freno consecutivo ${Date.now()}`;
    await page.getByPlaceholder(/escribe un comentario/i).fill(comentario);
    await page.getByRole("button", { name: /^comentar$/i }).click();
    await expect(page.getByText(comentario)).toBeVisible();

    // Tras el comentario de texto propio, el último comentario ya no es audio:
    // el mic se reactiva.
    await expect(page.getByTestId("voice-mic")).toBeEnabled();
  });
});
