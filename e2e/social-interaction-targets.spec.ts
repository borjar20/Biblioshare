import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "TestPassword123!";

type TestUser = { id: string; username: string; email: string };

test.use({ serviceWorkers: "block" });

function adminHeaders(json = false) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function rest<T>(
  request: APIRequestContext,
  path: string,
  init: { method?: string; data?: unknown; returnRows?: boolean } = {},
): Promise<T> {
  const response = await request.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...adminHeaders(init.data !== undefined),
      ...(init.returnRows ? { Prefer: "return=representation" } : {}),
    },
    data: init.data,
  });
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status()} — ${body}`);
  }
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

async function insertOne<T>(request: APIRequestContext, table: string, data: unknown): Promise<T> {
  const rows = await rest<T[]>(request, `${table}?select=*`, {
    method: "POST",
    data,
    returnRows: true,
  });
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function createUser(
  request: APIRequestContext,
  username: string,
  displayName: string,
  onAuthCreated: (userId: string) => void,
): Promise<TestUser> {
  const email = `${username}@example.com`;
  const auth = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(true),
    data: { email, password: PASSWORD, email_confirm: true },
  });
  expect(auth.ok(), await auth.text()).toBe(true);
  const user = (await auth.json()) as { id: string };
  onAuthCreated(user.id);
  await insertOne(request, "profiles", {
    user_id: user.id,
    username,
    display_name: displayName,
    is_public: true,
  });
  return { id: user.id, username, email };
}

async function deleteAuthUser(request: APIRequestContext, userId: string): Promise<void> {
  const response = await request.delete(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: adminHeaders(),
  });
  if (!response.ok()) {
    throw new Error(`DELETE auth user ${userId}: ${response.status()} — ${await response.text()}`);
  }
}

function cleanupFailures(results: PromiseSettledResult<unknown>[]): unknown[] {
  return results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
}

async function login(page: Page, user: TestUser) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function comment(locator: Locator, body: string) {
  await locator.getByRole("button", { name: /comentario/i }).click();
  await locator.getByPlaceholder(/escribe un comentario/i).fill(body);
  await locator.getByRole("button", { name: /^comentar$/i }).click();
  await expect(locator.getByText(body)).toBeVisible();
}

// Reacciona con 🔥 sobre la barra de una tarjeta. El botón «Me gusta» de un solo
// corazón ya no existe en ninguna superficie del repo: lo sustituyó el
// `ReactionBar` de emoji libre, que arranca PLEGADO tras un disparador
// «Reaccionar» y abre un popover que se CIERRA al elegir. Por eso hay que
// reabrirlo para releer `aria-pressed` sobre el mismo botón de la fila rápida,
// y por eso se cierra al final: el fondo del popover tapa la tarjeta y se
// comería el clic siguiente.
async function react(card: Locator) {
  const trigger = card.getByRole("button", { name: "Reaccionar" }).first();
  await trigger.click();
  const fuego = card.getByRole("button", { name: "fuego" }).first();
  await expect(fuego).toHaveAttribute("aria-pressed", "false");
  await fuego.click();
  await expect(card.getByRole("dialog")).toHaveCount(0);
  await trigger.click();
  await expect(card.getByRole("button", { name: "fuego" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Para cerrar hay que pulsar LA CAPA que cierra (`fixed inset-0`, así se
  // cierra sin useEffect — ver `reaction-bar.tsx`), no el disparador: mientras
  // el popover está abierto esa capa ocupa la pantalla entera e intercepta
  // cualquier otro clic. Mismo remedio que `cerrarPicker` en
  // `social-optimista.spec.ts`.
  await card.locator('button[aria-hidden="true"]').first().click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

test("los targets canónicos conectan pase, checkpoint, agrupación y cascada", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const prefix = `it${stamp}`.slice(-13);
  const authUserIds: string[] = [];
  const browserErrors: string[] = [];
  let clubId: string | null = null;
  let passId: string | null = null;
  let originalError: unknown;

  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console.error: ${message.text()}`);
  });

  try {
    const [a, b, c] = await Promise.all([
      createUser(request, `${prefix}a`, "Target A", (id) => authUserIds.push(id)),
      createUser(request, `${prefix}b`, "Target B", (id) => authUserIds.push(id)),
      createUser(request, `${prefix}c`, "Target C", (id) => authUserIds.push(id)),
    ]);

    const [book] = await rest<Array<{ id: string; title: string }>>(
      request,
      "books?select=id,title&order=created_at.asc&limit=1",
    );
    expect(book).toBeTruthy();

    await insertOne(request, "follows", {
      follower_id: a.id,
      followee_id: b.id,
      status: "accepted",
    });
    const pass = await insertOne<{ id: string }>(request, "passes", {
      user_id: b.id,
      item_type: "book",
      item_id: book.id,
      status: "in_progress",
      started_on: new Date().toISOString().slice(0, 10),
      is_active: true,
      is_public: true,
      position: {},
    });
    passId = pass.id;
    // El hito que el pase habría autopublicado (`maybeAutopostMilestone` con
    // `started`), insertado por REST para no depender de las preferencias del
    // usuario. Es lo que hace visible la actividad de `b` en el feed de `a`:
    // desde que el feed lee `posts` (#557) un target `pass` SIN post promovido
    // no aparece en ninguna superficie —límite asumido para v1 en #558—, y este
    // spec seguía esperando la visibilidad antigua, por lo que salía rojo
    // (#788). El trigger `posts_sync_interaction_target` materializa su target
    // canónico `post` con href=/post/[id].
    const milestonePost = await insertOne<{ id: string }>(request, "posts", {
      author_id: b.id,
      kind: "started",
      anchor_type: "book",
      anchor_id: book.id,
      source_kind: "pass",
      source_id: pass.id,
    });
    const [milestoneTarget] = await rest<Array<{ id: string }>>(
      request,
      `interaction_targets?kind=eq.post&source_id=eq.${milestonePost.id}&select=id`,
    );
    expect(milestoneTarget?.id).toBeTruthy();

    const slug = `${prefix}-club`;
    const club = await insertOne<{ id: string }>(request, "clubs", {
      slug,
      name: `Club ${prefix}`,
      owner_id: b.id,
      visibility: "public",
    });
    clubId = club.id;
    await rest(request, "club_members", {
      method: "POST",
      data: [
        { club_id: club.id, user_id: b.id, role: "owner", status: "active" },
        { club_id: club.id, user_id: a.id, role: "member", status: "active" },
        { club_id: club.id, user_id: c.id, role: "member", status: "active" },
      ],
    });

    const activity = await insertOne<{ id: string }>(request, "club_activities", {
      club_id: club.id,
      kind: "buddy_read",
      title: `Lectura ${prefix}`,
      status: "active",
      created_by: b.id,
      config: {},
    });
    await insertOne(request, "club_activity_items", {
      activity_id: activity.id,
      item_type: "book",
      item_id: book.id,
      added_by: b.id,
      position: 0,
    });
    await rest(request, "club_activity_participants", {
      method: "POST",
      data: [a, b, c].map((user) => ({ activity_id: activity.id, user_id: user.id })),
    });
    const checkpoint = await insertOne<{ id: string }>(request, "club_activity_checkpoints", {
      activity_id: activity.id,
      label: `Hito ${prefix}`,
      position: { page: 1 },
      order: 0,
      created_by: b.id,
    });
    const [checkpointTarget] = await rest<Array<{ id: string }>>(
      request,
      `interaction_targets?kind=eq.activity_checkpoint&source_id=eq.${checkpoint.id}&select=id`,
    );
    expect(checkpointTarget?.id).toBeTruthy();
    await rest(request, "club_activity_checkpoint_reads", {
      method: "POST",
      data: [a, b].map((user) => ({ checkpoint_id: checkpoint.id, user_id: user.id })),
    });

    const postBody = `Post target ${prefix}`;
    const post = await insertOne<{ id: string }>(request, "club_posts", {
      club_id: club.id,
      author_id: b.id,
      kind: "text",
      body: postBody,
    });
    const [postTarget] = await rest<Array<{ id: string }>>(
      request,
      `interaction_targets?kind=eq.club_post&source_id=eq.${post.id}&select=id`,
    );
    expect(postTarget?.id).toBeTruthy();
    const report = await insertOne<{ id: string; snapshot: unknown }>(request, "content_reports", {
      reporter_id: a.id,
      target_type: "club_post",
      target_id: post.id,
      reason: "spam",
      snapshot: {},
    });

    // `a` sigue a `b`: su hito sale en el feed. La tarjeta ya no lleva el hilo
    // dentro (posts Spec 2b): su pie es un resumen que enlaza a `/post/[id]`,
    // que es donde se conversa — y donde debe aterrizar el comentario, sobre el
    // target canónico del post.
    const passComment = `Pase ${prefix}`;
    await login(page, a);
    await page.goto("/");
    const milestoneCard = page
      .locator("article")
      .filter({ hasText: book.title })
      .filter({ has: page.getByRole("link", { name: /ver hilo/i }) })
      .first();
    await expect(milestoneCard).toBeVisible();
    await milestoneCard.getByRole("link", { name: /ver hilo/i }).click();
    await page.waitForURL(new RegExp(`/post/${milestonePost.id}$`));
    await page.getByPlaceholder(/escribe un comentario/i).fill(passComment);
    await page.getByRole("button", { name: /^comentar$/i }).click();
    await expect(page.getByText(passComment)).toBeVisible();
    await expect
      .poll(async () => {
        const rows = await rest<unknown[]>(
          request,
          `comments?interaction_target_id=eq.${milestoneTarget.id}&body=eq.${encodeURIComponent(passComment)}&select=id`,
        );
        return rows.length;
      })
      .toBe(1);

    const checkpointComment = `Checkpoint ${prefix}`;
    await page.goto(`/club/${slug}/actividad/${activity.id}`);
    const checkpointCard = page
      .locator("div.rounded-card")
      .filter({ hasText: `Hito ${prefix}` })
      .filter({ has: page.getByRole("button", { name: /comentario/i }) })
      .last();
    await expect(checkpointCard).toBeVisible();
    await comment(checkpointCard, checkpointComment);
    await expect
      .poll(async () => {
        const rows = await rest<unknown[]>(
          request,
          `comments?interaction_target_id=eq.${checkpointTarget.id}&body=eq.${encodeURIComponent(checkpointComment)}&select=id`,
        );
        return rows.length;
      })
      .toBe(1);

    // Recarga la página y comprueba que el comentario RENDERIZA. Hasta aquí el
    // spec publicaba y se iba a otra ruta, así que no veía el fallo más grave
    // posible: si el target canónico del comentario no es visible para quien sí
    // ve la fila del comentario, `getInteractionSummary` lo trata como corrupción
    // y lanza («Interaction target missing for comment:<id>»), dejando
    // /club/<slug>/actividad/<id> en 500 permanente para TODOS los participantes
    // y sin auto-curación. Se expande el hilo porque la lista de comentarios va
    // plegada por defecto (los datos vienen prefetcheados, el DOM no).
    await page.goto(`/club/${slug}/actividad/${activity.id}`);
    const reloadedCheckpointCard = page
      .locator("div.rounded-card")
      .filter({ hasText: `Hito ${prefix}` })
      .filter({ has: page.getByRole("button", { name: /comentario/i }) })
      .last();
    await expect(reloadedCheckpointCard).toBeVisible();
    await reloadedCheckpointCard.getByRole("button", { name: /comentario/i }).click();
    await expect(reloadedCheckpointCard.getByText(checkpointComment)).toBeVisible();

    await page.goto(`/club/${slug}`);
    let postCard = page.locator("div.shadow-card").filter({ hasText: postBody }).last();
    await expect(postCard).toBeVisible();
    await react(postCard);
    await comment(postCard, `Comentario post ${prefix}`);
    await expect
      .poll(async () => {
        const [reactions, comments] = await Promise.all([
          rest<unknown[]>(
            request,
            `reactions?interaction_target_id=eq.${postTarget.id}&user_id=eq.${a.id}&select=id`,
          ),
          rest<unknown[]>(
            request,
            `comments?interaction_target_id=eq.${postTarget.id}&author_id=eq.${a.id}&select=id`,
          ),
        ]);
        return [reactions.length, comments.length];
      })
      .toEqual([1, 1]);

    await login(page, c);
    await page.goto(`/club/${slug}`);
    postCard = page.locator("div.shadow-card").filter({ hasText: postBody }).last();
    await react(postCard);
    await expect
      .poll(async () => {
        const rows = await rest<unknown[]>(
          request,
          `reactions?interaction_target_id=eq.${postTarget.id}&user_id=eq.${c.id}&select=id`,
        );
        return rows.length;
      })
      .toBe(1);

    await login(page, b);
    await page.getByRole("button", { name: /notificaciones/i }).click();
    // Los avisos de comentario viajan con contexto desde «notificaciones con
    // contexto» (#799): con un solo actor la campana pinta la variante
    // enriquecida —«{name} en tu publicación: «{extracto}»»— en vez de la copia
    // genérica. Se afirma sobre el EXTRACTO, que además ata el aviso a ESTE
    // comentario y no a cualquier otro del mismo tipo.
    const passNotice = page.locator(`a[href="/post/${milestonePost.id}"]`).filter({
      hasText: passComment,
    });
    await expect(passNotice).toHaveCount(1);
    await expect(
      page.locator(`a[href="/club/${slug}/actividad/${activity.id}"]`).filter({
        hasText: checkpointComment,
      }),
    ).toHaveCount(1);
    await expect(
      page.locator(`a[href="/club/${slug}"]`).filter({ hasText: /y 1 persona más/i }),
    ).toHaveCount(1);

    await page.goto(`/club/${slug}`);
    postCard = page.locator("div.shadow-card").filter({ hasText: postBody }).last();
    // Borrar dejó de ser un botón suelto en la tarjeta: vive detrás del «···»
    // (F3-012, acción 7 de la auditoría 2026-08) como `role="menuitem"`. La
    // confirmación sigue siendo el `confirm()` nativo, así que el `once(dialog)`
    // se mantiene — pero hay que armarlo ANTES de pulsar el ítem, no antes de
    // abrir el menú.
    await postCard.getByRole("button", { name: "Acciones de la publicación" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await postCard.getByRole("menuitem", { name: /^borrar$/i }).click();
    await expect(page.getByText(postBody)).toHaveCount(0);

    await expect
      .poll(async () => {
        const [targets, comments, reactions, notices] = await Promise.all([
          rest<unknown[]>(request, `interaction_targets?id=eq.${postTarget.id}&select=id`),
          rest<unknown[]>(request, `comments?interaction_target_id=eq.${postTarget.id}&select=id`),
          rest<unknown[]>(request, `reactions?interaction_target_id=eq.${postTarget.id}&select=id`),
          rest<unknown[]>(request, `notifications?interaction_target_id=eq.${postTarget.id}&select=id`),
        ]);
        return [targets.length, comments.length, reactions.length, notices.length];
      })
      .toEqual([0, 0, 0, 0]);

    const [preservedReport] = await rest<Array<{ snapshot: unknown; target_deleted_at: string | null }>>(
      request,
      `content_reports?id=eq.${report.id}&select=snapshot,target_deleted_at`,
    );
    expect(preservedReport.target_deleted_at).not.toBeNull();
    expect(preservedReport.snapshot).toEqual(report.snapshot);
    expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    const entityCleanup = await Promise.allSettled([
      ...(clubId ? [rest(request, `clubs?id=eq.${clubId}`, { method: "DELETE" })] : []),
      ...(passId ? [rest(request, `passes?id=eq.${passId}`, { method: "DELETE" })] : []),
    ]);
    const userCleanup = await Promise.allSettled(
      authUserIds.map((userId) => deleteAuthUser(request, userId)),
    );
    const failures = cleanupFailures([...entityCleanup, ...userCleanup]);
    if (failures.length > 0) {
      const cleanupError = new AggregateError(failures, "Falló el cleanup del E2E de interaction targets");
      if (originalError) {
        await testInfo.attach("cleanup-error.txt", {
          body: Buffer.from(cleanupError.stack ?? cleanupError.message),
          contentType: "text/plain",
        });
      } else {
        throw cleanupError;
      }
    }
  }
});
