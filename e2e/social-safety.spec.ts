import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
// Importado, no copiado: el nombre accesible del emoji es un contrato del
// catálogo y copiarlo a mano ya dejó specs en rojo dos veces (#750, #801).
import { QUICK_REACTION_NAMES } from "@/lib/social/reaction-constants";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CLUB_SLUG = "test-public-club";

function adminHeaders(json = false) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
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
  return { id: user.id as string, username, email, password };
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function deleteUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

test("bloquear corta follows y desbloquear no los restaura", async ({ page, request }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const a = await createUser(request, `safea${stamp}`.slice(0, 20));
  const b = await createUser(request, `safeb${stamp}`.slice(0, 20));

  try {
    await login(page, a.email, a.password);
    await page.goto(`/u/${b.username}`);
    await page.getByRole("button", { name: /^seguir$/i }).click();
    const following = page.getByRole("button", { name: /^siguiendo$/i });
    await expect(following).toBeVisible();
    await expect(following).toBeEnabled();

    const notification = await request.get(
      `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${b.id}&actor_id=eq.${a.id}&type=eq.new_follower&select=id`,
      { headers: adminHeaders() },
    );
    expect((await notification.json()) as unknown[]).toHaveLength(1);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^bloquear$/i }).click();
    await expect(page.getByRole("button", { name: /^desbloquear$/i })).toBeVisible();

    const cut = await request.get(
      `${SUPABASE_URL}/rest/v1/follows?or=(and(follower_id.eq.${a.id},followee_id.eq.${b.id}),and(follower_id.eq.${b.id},followee_id.eq.${a.id}))&select=follower_id`,
      { headers: adminHeaders() },
    );
    expect(await cut.json()).toEqual([]);

    await page.getByRole("button", { name: /^desbloquear$/i }).click();
    await expect(page.getByRole("button", { name: /^bloquear$/i })).toBeVisible();

    const notRestored = await request.get(
      `${SUPABASE_URL}/rest/v1/follows?or=(and(follower_id.eq.${a.id},followee_id.eq.${b.id}),and(follower_id.eq.${b.id},followee_id.eq.${a.id}))&select=follower_id`,
      { headers: adminHeaders() },
    );
    expect(await notRestored.json()).toEqual([]);
  } finally {
    await deleteUser(a.id);
    await deleteUser(b.id);
  }
});

test("el dueño del contenido puede reportar y moderar un comentario ajeno", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const owner = await createUser(request, `reporta${stamp}`.slice(0, 20));
  const author = await createUser(request, `reportb${stamp}`.slice(0, 20));
  const postBody = `post moderación ${stamp}`;
  const commentBody = `comentario denunciable ${stamp}`;

  try {
    const clubs = await request.get(
      `${SUPABASE_URL}/rest/v1/clubs?slug=eq.${CLUB_SLUG}&select=id`,
      { headers: adminHeaders() },
    );
    const [{ id: clubId }] = (await clubs.json()) as Array<{ id: string }>;
    for (const user of [owner, author]) {
      const member = await request.post(`${SUPABASE_URL}/rest/v1/club_members`, {
        headers: adminHeaders(true),
        data: { club_id: clubId, user_id: user.id, role: "member", status: "active" },
      });
      expect(member.ok()).toBe(true);
    }

    const post = await request.post(`${SUPABASE_URL}/rest/v1/club_posts?select=id`, {
      headers: { ...adminHeaders(true), Prefer: "return=representation" },
      data: { club_id: clubId, author_id: owner.id, kind: "text", body: postBody },
    });
    const [{ id: postId }] = (await post.json()) as Array<{ id: string }>;
    // Un comentario se cuelga del target canónico del post: el par polimórfico
    // ya no existe en `comments`.
    const postTarget = await request.get(
      `${SUPABASE_URL}/rest/v1/interaction_targets?kind=eq.club_post&source_id=eq.${postId}&select=id`,
      { headers: adminHeaders() },
    );
    const [{ id: postTargetId }] = (await postTarget.json()) as Array<{ id: string }>;
    const comment = await request.post(`${SUPABASE_URL}/rest/v1/comments`, {
      headers: adminHeaders(true),
      data: {
        interaction_target_id: postTargetId,
        author_id: author.id,
        body: commentBody,
      },
    });
    expect(comment.ok()).toBe(true);

    await login(page, owner.email, owner.password);
    await page.goto(`/club/${CLUB_SLUG}`);
    const card = page.locator("div.shadow-card").filter({ hasText: postBody }).last();
    await card.getByRole("button", { name: /comentario/i }).click();
    await expect(card.getByText(commentBody)).toBeVisible();

    // Reportar y borrar viven detrás del «···» del comentario desde F3-012 (la
    // acción 7 de la auditoría 2026-08): en el DOM no existen con el menú
    // cerrado. El disparador es el ⋯ de `comment-actions.tsx`, con aria-label
    // «Más acciones» — distinto del ⋯ del POST del club («Acciones de la
    // publicación»), así que no hay ambigüedad dentro de la tarjeta.
    await card.getByRole("button", { name: "Más acciones" }).click();
    await card.getByRole("button", { name: /^reportar$/i }).click();
    await card.getByLabel(/motivo/i).selectOption("spam");
    await card.getByRole("button", { name: /^enviar reporte$/i }).click();
    // El envío cierra el menú, pero el acuse («Reporte enviado») se queda al
    // lado del ⋯: por eso sigue siendo visible con el desplegable cerrado.
    await expect(card.getByRole("status")).toContainText(/reporte enviado/i);

    await card.getByRole("button", { name: "Más acciones" }).click();
    // El `confirm()` nativo sigue ahí, y salta al pulsar el ítem, no al abrir
    // el menú: el handler se arma justo antes del clic que lo dispara.
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: /^borrar$/i }).click();
    await expect(card.getByText(commentBody)).toHaveCount(0);
  } finally {
    await deleteUser(owner.id);
    await deleteUser(author.id);
  }
});

test("un fallo de Server Action se anuncia y revierte", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL!;
  const password = process.env.TEST_USER_PASSWORD!;
  await login(page, email, password);
  await page.goto(`/club/${CLUB_SLUG}`);
  // «Me gusta» ya no es un botón de la tarjeta: es una reacción rápida dentro
  // del desplegable de «Reaccionar» (#801). Abrir el desplegable es puro
  // cliente —ninguna server action—, así que se abre ANTES de cortar el tráfico
  // y lo único que aborta la ruta es el toggle de la reacción.
  const trigger = page.getByRole("button", { name: "Reaccionar" }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const reaccion = page.getByRole("button", { name: QUICK_REACTION_NAMES["❤️"] }).first();
  await expect(reaccion).toBeVisible();

  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await reaccion.click();
  await expect(
    page.getByRole("alert").filter({ hasText: /no se pudo guardar/i }),
  ).toBeVisible();
});
