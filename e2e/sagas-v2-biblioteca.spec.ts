import { test, expect, type Locator, type Page } from "@playwright/test";

// e2e de la pestaña «Sagas» de Mi Biblioteca (Sagas v2 fase 5, Task 5):
// seguir/dejar de seguir desde la ficha y ver reflejado el estado en
// /coleccion?tab=sagas, más las tres subpestañas de /coleccion. Contra el
// mismo universo QA que `sagas-v2.spec.ts`/`sagas-v2-curacion.spec.ts`
// (`[QA Sagas v2] Universo`, con grafo real — order_no en sus nodos-saga,
// fase 5 Task 1). No se toca el seed salvo el follow del test 1, que se
// restaura a su estado inicial exacto en un `finally` (incluso si ya había
// un follow residual de una corrida anterior: entonces se deja siguiendo
// otra vez al final).
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SAGA_UNIVERSO = "69c07496-9b1a-4203-b3da-15d22a09c039";
const SAGA_UNIVERSO_NAME = "[QA Sagas v2] Universo";

// Calcado del helper `login`/`loginAs` de `sagas-v2.spec.ts` /
// `sagas-v2-editor.spec.ts` (patrón del repo: no importar entre specs de e2e).
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// `SagaFollowButton` usa `useOptimistic`: el texto del botón cambia AL
// INSTANTE al hacer click, antes de que el server action (`followSaga`/
// `unfollowSaga`) llegue siquiera a ejecutarse — así que esperar a que el
// botón cambie de texto NO es prueba de que la mutación (ni su
// `revalidatePath`) haya terminado. Igual que `clickAndWaitForActionResponse`
// en `sagas-v2-curacion.spec.ts`, se espera la respuesta real del POST del
// server action antes de navegar a otra página a comprobar el efecto —
// navegar antes cancelaría el fetch en vuelo y/o leería el estado viejo.
async function clickAndWaitForActionResponse(page: Page, locator: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST" && res.status() === 200),
    locator.click(),
  ]);
  return response;
}

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

let cachedUserId: string | null = null;
async function devtestId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  cachedUserId = rows[0].user_id;
  return cachedUserId;
}

async function isFollowingInDb(userId: string, sagaId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_follows?user_id=eq.${userId}&saga_id=eq.${sagaId}&select=user_id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

// Red de seguridad de BD (además del propio ciclo de UI del test): deja el
// follow exactamente como se encontró al empezar, pase lo que pase con la UI.
async function restoreFollowState(userId: string, sagaId: string, shouldFollow: boolean) {
  if (shouldFollow) {
    await fetch(`${SUPABASE_URL}/rest/v1/saga_follows`, {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, saga_id: sagaId }),
    });
  } else {
    await fetch(
      `${SUPABASE_URL}/rest/v1/saga_follows?user_id=eq.${userId}&saga_id=eq.${sagaId}`,
      { method: "DELETE", headers: adminHeaders() },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1: seguir → card en /coleccion?tab=sagas → dejar de seguir. Los
// asserts de la card son ESTRUCTURALES (nombre, tag «Grafo», barra de
// progreso presente, bloque siguiente O completada presente) — nunca
// números exactos, porque el progreso depende de la biblioteca real del
// usuario de pruebas.
// ─────────────────────────────────────────────────────────────────────────
test("seguir → card en Mi Biblioteca → dejar de seguir (estado final = inicial)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const userId = await devtestId();
  const wasFollowing = await isFollowingInDb(userId, SAGA_UNIVERSO);

  try {
    await loginAs(page, EMAIL, PASSWORD);
    await page.goto(`/saga/${SAGA_UNIVERSO}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const followButton = page.getByRole("button", { name: "＋ Seguir esta saga" });
    const followingButton = page.getByRole("button", { name: "✓ Siguiendo" });

    // Leer el estado inicial REAL del botón en la página (no solo el de BD)
    // antes de tocar nada.
    if (wasFollowing) {
      await expect(followingButton).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(followButton).toBeVisible({ timeout: 15_000 });
      await clickAndWaitForActionResponse(page, followButton);
      await expect(followingButton).toBeVisible({ timeout: 15_000 });
    }

    // ── Card en /coleccion?tab=sagas: ahora sigue la saga (recién hecho o
    // residuo), así que la card debe existir con forma completa. ──
    await page.goto("/coleccion?tab=sagas");
    await page.waitForLoadState("networkidle").catch(() => {});

    const card = page.locator("article").filter({ hasText: SAGA_UNIVERSO_NAME });
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Nombre (enlace a la ficha; hay dos enlaces con el mismo nombre
    // accesible dentro de la card — abanico + título — de ahí el `.first()`).
    await expect(
      card.getByRole("link", { name: SAGA_UNIVERSO_NAME, exact: true }).first(),
    ).toBeVisible();

    // Tag «◆ Grafo» (la saga QA tiene grafo real, fase 5 Task 1).
    await expect(card.getByText("◆ Grafo")).toBeVisible();

    // Barra de progreso: siempre presente (segmentos o el tramo único de
    // fallback), localizada por sus clases estructurales sin depender de
    // números exactos.
    const progressBar = card.locator('div[class*="rounded-full"][class*="bg-surface-muted"]');
    await expect(progressBar).toBeVisible();
    await expect(progressBar.locator("span").first()).toBeVisible();

    // Bloque «siguiente»: exactamente uno de los dos (reading/next O
    // completada) debe estar presente — nunca ambos, nunca ninguno, dado que
    // el universo QA tiene miembros con orden principal (total > 0).
    const nextOrReading = card.getByText(/^Leyendo ahora$|^Siguiente$/);
    const completedBlock = card.getByText("Saga completada");
    const hasNext = (await nextOrReading.count()) > 0;
    const hasCompleted = (await completedBlock.count()) > 0;
    expect(hasNext || hasCompleted).toBe(true);
    if (hasNext) {
      await expect(nextOrReading.first()).toBeVisible();
    } else {
      await expect(completedBlock).toBeVisible();
    }

    // ── Volver a la ficha: «Siguiendo ✓», luego dejar de seguir. ──
    await page.goto(`/saga/${SAGA_UNIVERSO}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(followingButton).toBeVisible({ timeout: 15_000 });
    await clickAndWaitForActionResponse(page, followingButton);
    await expect(followButton).toBeVisible({ timeout: 15_000 });

    // ── /coleccion?tab=sagas: la saga ya no se sigue. Si el usuario no
    // sigue NINGUNA otra saga, aparece el estado vacío con su CTA; si sigue
    // otras, la card del universo QA simplemente desaparece. ──
    await page.goto("/coleccion?tab=sagas");
    await page.waitForLoadState("networkidle").catch(() => {});

    // `SagaLibraryCard` es el único componente de esta pestaña que pinta
    // `<article>` (EmptyState usa `<div>`), así que contar `article` basta
    // para saber si queda alguna otra saga seguida.
    const remainingCount = await page.locator("article").count();
    if (remainingCount === 0) {
      await expect(page.getByText("Sin sagas seguidas")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: "Explorar sagas" })).toBeVisible();
    } else {
      await expect(
        page.locator("article").filter({ hasText: SAGA_UNIVERSO_NAME }),
      ).toHaveCount(0);
    }

    // ── Si el follow inicial era un residuo (ya seguía antes de este test),
    // restaurarlo por UI para dejar el estado EXACTAMENTE como se encontró. ──
    if (wasFollowing) {
      await page.goto(`/saga/${SAGA_UNIVERSO}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(followButton).toBeVisible({ timeout: 15_000 });
      await clickAndWaitForActionResponse(page, followButton);
      await expect(followingButton).toBeVisible({ timeout: 15_000 });
    }
  } finally {
    // Red de seguridad: sea cual sea el resultado de la UI arriba, el follow
    // en BD queda tal cual estaba al empezar el test.
    await restoreFollowState(userId, SAGA_UNIVERSO, wasFollowing);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: las tres subpestañas de /coleccion (Colecciones | Todo | Sagas) y
// que la de Sagas navega a `?tab=sagas`.
// ─────────────────────────────────────────────────────────────────────────
test("subpestañas de Mi Biblioteca: Colecciones | Todo | Sagas, y Sagas navega", async ({
  page,
}) => {
  test.setTimeout(60_000);
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await loginAs(page, EMAIL, PASSWORD);
  await page.goto("/coleccion");
  await page.waitForLoadState("networkidle").catch(() => {});

  const colecciones = page.getByRole("link", { name: "Colecciones", exact: true });
  const todo = page.getByRole("link", { name: "Todo", exact: true });
  const sagas = page.getByRole("link", { name: "Sagas", exact: true });

  await expect(colecciones).toBeVisible({ timeout: 15_000 });
  await expect(todo).toBeVisible();
  await expect(sagas).toBeVisible();

  await sagas.click();
  await page.waitForURL(/\?tab=sagas/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\?tab=sagas/);
});
