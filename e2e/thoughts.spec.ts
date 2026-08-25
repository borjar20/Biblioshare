import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El SW ya causó UI obsoleta sirviendo payloads RSC de caché (issue #66,
// "reactividad-consistente"): lo bloqueamos igual que
// social-interaction-targets.spec.ts para que un fallo aquí sea del producto,
// no de una caché de fondo.
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

// Compositor plegable inline en la cabecera del feed (ya no hay modal): se
// despliega desde su botón, ancla `anchorTitle` (debe devolver un único
// resultado del autocompletar), escribe `body` y publica. Al terminar se pliega
// solo (onDone), así que la señal de éxito es que la región desaparece.
async function publishThought(
  page: Page,
  opts: { anchorTitle: string; body: string; spoiler?: boolean },
) {
  await page.getByRole("button", { name: "Compartir un pensamiento" }).click();
  const composer = page.getByRole("region", { name: "Nuevo pensamiento" });
  await expect(composer).toBeVisible();

  await composer.getByPlaceholder(/busca un libro/i).fill(opts.anchorTitle);
  const result = composer.getByRole("button", { name: opts.anchorTitle });
  await expect(result).toBeVisible();
  await result.click();

  await composer.getByPlaceholder("¿Qué piensas?").fill(opts.body);
  if (opts.spoiler) {
    await composer.getByRole("button", { name: "Contiene spoiler" }).click();
  }
  await composer.getByRole("button", { name: "Publicar" }).click();
  await expect(composer).toBeHidden();
}

// «Pensamiento» (Fase 6, Task 6.1): publicar anclado a una obra de biblioteca,
// spoiler + markdown-lite, comentar y reaccionar con multi-emoji en post y
// comentario. Repite el anclaje (solo el chip) con saga y persona.
// El reparto de superficies es el de posts Spec 2b: la TARJETA del feed se ojea
// (ancla, spoiler, contador) y `/post/[id]` conversa (composer, reacciones).
// Patrón del club desechable (club-ronda.spec.ts): datos propios, creados por
// REST con service-role y borrados en el `finally` -- nada compartido con
// otras sesiones ni con la semilla QA.
test("publicar y comentar un pensamiento: ancla, spoiler, negrita y reacciones multi-emoji", async ({
  page,
}) => {
  test.setTimeout(150_000);

  const owner = await devtestId();
  const ts = Date.now();

  const bookTitle = `E2E Pensamiento Libro ${ts}`;
  const sagaName = `E2E Pensamiento Saga ${ts}`;
  const personName = `E2E Pensamiento Persona ${ts}`;

  let bookId: string | null = null;
  let sagaId: string | null = null;
  let personId: string | null = null;
  let passId: string | null = null;

  try {
    const book = await insertOne<{ id: string }>("books", { title: bookTitle });
    bookId = book.id;
    const saga = await insertOne<{ id: string }>("sagas", { name: sagaName });
    sagaId = saga.id;
    const person = await insertOne<{ id: string }>("people", { name: personName });
    personId = person.id;

    // searchAnchors solo ofrece libros/pelis/series que estén en la
    // BIBLIOTECA activa del viewer (anchor-search.ts) -- sin este pase el
    // autocompletar del libro no encontraría nada y el test fallaría sin que
    // hubiera bug. Sagas y personas son catálogo público, sin este requisito.
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

    // ── Publicar anclado al libro: spoiler + negrita ──
    const bookBody = `Una reflexión con **negrita** sobre esta obra — prueba ${ts}.`;
    await publishThought(page, { anchorTitle: bookTitle, body: bookBody, spoiler: true });

    // La tarjeta se identifica por el chip del ancla (SIEMPRE visible, a
    // diferencia del cuerpo que el spoiler oculta) -- filtrar por el cuerpo
    // fallaría antes de revelarlo.
    const card = page.locator("article").filter({ hasText: bookTitle });
    await expect(card).toBeVisible();
    await expect(card.getByText("Pensamiento", { exact: true })).toBeVisible();
    const anchorLink = card.getByRole("link", { name: bookTitle });
    await expect(anchorLink).toHaveAttribute("href", new RegExp(`^/libro/${bookId}$`));

    // ── Spoiler: cuerpo blurreado hasta pulsar "Mostrar spoiler" ──
    await expect(card.locator("b", { hasText: "negrita" })).toHaveCount(0);
    await card.getByRole("button", { name: "Mostrar spoiler" }).click();
    await expect(card.locator("b", { hasText: "negrita" })).toBeVisible();

    // ── Del feed al hilo: la conversación ya no vive en la tarjeta ──
    // Desde el rediseño de posts (Spec 2b) el pie de la tarjeta es un RESUMEN
    // (`PostSummary`) que enlaza a `/post/[id]`; el hilo interactivo inline
    // desapareció. Este test esperaba un `button "0 comentarios"` que hoy es un
    // `link "0 comentarios · Ver hilo →"`, y se quedaba colgado 150 s (#787).
    // Comentar y reaccionar se hacen ahora donde vive la conversación, y la
    // tarjeta solo debe reflejar el contador al volver.
    const comentario = `comentario e2e ${ts}`;
    await expect(card.getByRole("link", { name: /0 comentarios/i })).toBeVisible();
    await card.getByRole("link", { name: /ver hilo/i }).click();
    await page.waitForURL(/\/post\/[0-9a-f-]{36}$/i);

    // Composer del hilo SIEMPRE visible (PostThread): no hay nada que expandir.
    await page.getByPlaceholder(/escribe un comentario/i).fill(comentario);
    await page.getByRole("button", { name: /^comentar$/i }).click();
    await expect(page.getByText(comentario)).toBeVisible();

    // ── Reaccionar con 🔥 en el post ──
    // El ReactionBar arranca plegado tras el botón "Reaccionar"; elegir un emoji
    // CIERRA el popover (Task 7/8 de "reacciones-emoji-libre"), así que el
    // recuento se lee en el propio disparador, que pasa a mostrar "🔥 1".
    const postReact = page.getByRole("button", { name: "Reaccionar" }).first();
    await postReact.click();
    const postFire = page.getByRole("button", { name: "fuego" }).first();
    await expect(postFire).toHaveAttribute("aria-pressed", "false");
    await postFire.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(postReact).toContainText("1");

    // ── Reaccionar con 🔥 en el comentario (la segunda barra: la del post va
    // primera en el DOM —cabecera del hilo— y la del comentario cuelga del
    // árbol, debajo del composer) ──
    const commentReact = page.getByRole("button", { name: "Reaccionar" }).last();
    await commentReact.click();
    const commentFire = page.getByRole("button", { name: "fuego" }).last();
    await expect(commentFire).toHaveAttribute("aria-pressed", "false");
    await commentFire.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(commentReact).toContainText("1");

    // ── Persiste: recargar el hilo y la verdad del servidor lo confirma ──
    await page.reload();
    await expect(page.getByText(comentario)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reaccionar" }).first()).toContainText("1");
    await expect(page.getByRole("button", { name: "Reaccionar" }).last()).toContainText("1");

    // ── Y de vuelta en el feed: la tarjeta refleja el contador del servidor ──
    await page.goto("/");
    const cardTrasRecarga = page.locator("article").filter({ hasText: bookTitle });
    await expect(cardTrasRecarga).toBeVisible();
    await expect(cardTrasRecarga.getByRole("link", { name: /1 comentario/i })).toBeVisible();
    // El cuerpo vuelve a estar velado tras recargar (SpoilerGate es estado de
    // cliente, no se persiste abierto) -- confirma que el gate es real y no
    // solo un `useState` que sobrevivió por casualidad a la sesión anterior.
    await expect(cardTrasRecarga.locator("b", { hasText: "negrita" })).toHaveCount(0);
    await expect(
      cardTrasRecarga.getByRole("button", { name: "Mostrar spoiler" }),
    ).toBeVisible();

    // ── Repite el anclaje con una saga: solo el chip correcto ──
    await publishThought(page, {
      anchorTitle: sagaName,
      body: `Pensamiento ancla saga ${ts}.`,
    });
    const sagaCard = page.locator("article").filter({ hasText: sagaName });
    await expect(sagaCard).toBeVisible();
    await expect(sagaCard.getByRole("link", { name: sagaName })).toHaveAttribute(
      "href",
      new RegExp(`^/saga/${sagaId}$`),
    );

    // ── Repite el anclaje con una persona: solo el chip correcto ──
    await publishThought(page, {
      anchorTitle: personName,
      body: `Pensamiento ancla persona ${ts}.`,
    });
    const personCard = page.locator("article").filter({ hasText: personName });
    await expect(personCard).toBeVisible();
    await expect(personCard.getByRole("link", { name: personName })).toHaveAttribute(
      "href",
      new RegExp(`^/persona/${personId}$`),
    );
  } finally {
    // El trigger `thoughts_cleanup_social_target` (20260835_thoughts.sql)
    // limpia interaction_targets/comments/reactions/notifications al borrar
    // la fila -- basta con borrar los thoughts por su ancla, luego el pase y
    // el catálogo desechable que creó este test.
    const anchorIds = [bookId, sagaId, personId].filter((id): id is string => !!id);
    if (anchorIds.length > 0) {
      await rest(`thoughts?anchor_id=in.(${anchorIds.join(",")})`, { method: "DELETE" }).catch(
        () => {},
      );
    }
    if (passId) {
      await rest(`passes?id=eq.${passId}`, { method: "DELETE" }).catch(() => {});
    }
    if (bookId) await rest(`books?id=eq.${bookId}`, { method: "DELETE" }).catch(() => {});
    if (sagaId) await rest(`sagas?id=eq.${sagaId}`, { method: "DELETE" }).catch(() => {});
    if (personId) await rest(`people?id=eq.${personId}`, { method: "DELETE" }).catch(() => {});
  }
});
