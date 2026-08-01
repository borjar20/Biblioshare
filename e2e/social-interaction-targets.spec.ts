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
      status: "planned",
      is_active: true,
      is_public: true,
      position: {},
    });
    passId = pass.id;
    const [passTarget] = await rest<Array<{ id: string }>>(
      request,
      `interaction_targets?kind=eq.pass&source_id=eq.${pass.id}&select=id`,
    );
    expect(passTarget?.id).toBeTruthy();

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

    const passComment = `Pase ${prefix}`;
    await login(page, a);
    await page.goto("/");
    const passCard = page
      .locator("article")
      .filter({ hasText: book.title })
      .filter({ has: page.getByRole("button", { name: /comentario/i }) })
      .first();
    await expect(passCard).toBeVisible();
    await comment(passCard, passComment);
    await expect
      .poll(async () => {
        const rows = await rest<unknown[]>(
          request,
          `comments?interaction_target_id=eq.${passTarget.id}&body=eq.${encodeURIComponent(passComment)}&select=id`,
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

    await page.goto(`/club/${slug}`);
    let postCard = page.locator("div.shadow-card").filter({ hasText: postBody }).last();
    await expect(postCard).toBeVisible();
    await postCard.getByRole("button", { name: "Me gusta" }).click();
    await expect(postCard.getByRole("button", { name: "Me gusta" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
    await postCard.getByRole("button", { name: "Me gusta" }).click();
    await expect(postCard.getByRole("button", { name: "Me gusta" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
    const passNotice = page.locator(`a[href="/libro/${book.id}"]`).filter({
      hasText: /comentó tu actividad/i,
    });
    await expect(passNotice).toHaveCount(1);
    await expect(
      page.locator(`a[href="/club/${slug}/actividad/${activity.id}"]`).filter({
        hasText: /comentó tu punto de control/i,
      }),
    ).toHaveCount(1);
    await expect(
      page.locator(`a[href="/club/${slug}"]`).filter({ hasText: /y 1 persona más/i }),
    ).toHaveCount(1);

    await page.goto(`/club/${slug}`);
    postCard = page.locator("div.shadow-card").filter({ hasText: postBody }).last();
    page.once("dialog", (dialog) => dialog.accept());
    await postCard.getByRole("button", { name: /^borrar$/i }).click();
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
