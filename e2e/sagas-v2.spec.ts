import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Sagas v2 · fase 1 (jerarquía, multi-membresía, ficha con hero/progreso/seguir).
// Contra el seed QA estable de dev descrito en
// `.superpowers/sdd/task-7-seed-report.md` — NO se borra ni se modifican sus
// membresías; el único estado que este spec crea/borra es el follow del test 2.
//
// Universo
//  ├─ Era Uno (verde, tick)   — 4 miembros: Rayuela(1,primary), Libro sin
//  |                            valorar(2), Libro raro sin match(3), Para leer
//  |                            a Isabel Allende(4, doble membresía)
//  ├─ Era Dos                 — 2 miembros: La casa de los espíritus(4) y su
//  |                            duplicado de catálogo(5)
//  └─ Nexo (directo)          — Trilogía La casa de los espíritus (sin
//                               position); "Para leer a Isabel Allende" TAMBIÉN
//                               está enlazada directo al Universo, pero
//                               getSagaDetail dedupea a favor de la subsaga
//                               (Era Uno), así que en la página solo aparece
//                               una vez.
const SAGA_UNIVERSO = "69c07496-9b1a-4203-b3da-15d22a09c039";
const SAGA_ERA_UNO = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
// "Para leer a Isabel Allende" (seed report §3): doble membresía, Era Uno +
// directo al Universo.
const BOOK_ISABEL_ALLENDE = "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc";

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

async function deleteSagaFollow(sagaId: string) {
  const userId = await devtestId();
  await fetch(
    `${SUPABASE_URL}/rest/v1/saga_follows?user_id=eq.${userId}&saga_id=eq.${sagaId}`,
    { method: "DELETE", headers: adminHeaders() },
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1: ficha de universo, sin sesión — jerarquía visible, sin CTAs de
// usuario, y el ítem de doble membresía no duplicado en la grid.
// ─────────────────────────────────────────────────────────────────────────
test("ficha de universo sin sesión: jerarquía, sin seguir/progreso, sin duplicados", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await page.goto(`/saga/${SAGA_UNIVERSO}`);
  await page.waitForLoadState("networkidle").catch(() => {});

  await expect(
    page.getByRole("heading", { level: 1, name: "[QA Sagas v2] Universo" }),
  ).toBeVisible();

  // Los tres grupos: las dos subsagas y el nexo directo.
  await expect(
    page.getByRole("heading", { level: 3, name: "[QA Sagas v2] Era Uno" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "[QA Sagas v2] Era Dos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Nexo" }),
  ).toBeVisible();

  // Sin sesión: ni botón de seguir ni barra de progreso del usuario.
  await expect(
    page.getByRole("button", { name: /Seguir esta saga|Siguiendo/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Tu progreso")).toHaveCount(0);

  // El ítem con doble membresía (Era Uno + directo al Universo) se dedupea a
  // favor de la subsaga: una sola tarjeta (un solo enlace a su ficha) en toda
  // la página. Contar por texto sería un falso positivo: la tarjeta sin
  // portada pinta el título DOS veces dentro de la MISMA tarjeta (placeholder
  // + leyenda), así que se cuenta el enlace a su ficha en vez del texto.
  await expect(
    page.locator(`a[href="/libro/${BOOK_ISABEL_ALLENDE}"]`),
  ).toHaveCount(1);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: con sesión — barra de progreso visible y ciclo completo de seguir /
// dejar de seguir, con persistencia tras recargar. Deja el follow limpio
// incluso si el test falla a medias.
// ─────────────────────────────────────────────────────────────────────────
test("ficha de universo con sesión: progreso visible y ciclo de seguir persiste", async ({
  page,
}) => {
  test.setTimeout(60_000);
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  try {
    // Por si una corrida anterior dejó el follow a medias.
    await deleteSagaFollow(SAGA_UNIVERSO);

    await login(page);
    await page.goto(`/saga/${SAGA_UNIVERSO}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByText("Tu progreso")).toBeVisible({
      timeout: 15_000,
    });

    const followButton = page.getByRole("button", {
      name: "＋ Seguir esta saga",
    });
    await expect(followButton).toBeVisible({ timeout: 15_000 });
    await followButton.click();

    const followingButton = page.getByRole("button", {
      name: "✓ Siguiendo",
    });
    await expect(followingButton).toBeVisible({ timeout: 15_000 });

    // Persiste tras recargar (leído del servidor, no solo estado optimista).
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(
      page.getByRole("button", { name: "✓ Siguiendo" }),
    ).toBeVisible({ timeout: 15_000 });

    // Dejar de seguir: vuelve al estado inicial.
    await page
      .getByRole("button", { name: "✓ Siguiendo" })
      .click();
    await expect(
      page.getByRole("button", { name: "＋ Seguir esta saga" }),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await deleteSagaFollow(SAGA_UNIVERSO);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3: jerarquía — la subsaga hoja muestra el chip "Parte de" y navega al
// universo; al no tener hijas propias, no pinta cabecera de grupo "Nexo".
// ─────────────────────────────────────────────────────────────────────────
test("ficha de subsaga: chip «Parte de» navega al universo, sin cabecera Nexo", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await page.goto(`/saga/${SAGA_ERA_UNO}`);
  await page.waitForLoadState("networkidle").catch(() => {});

  await expect(
    page.getByRole("heading", { level: 1, name: "[QA Sagas v2] Era Uno" }),
  ).toBeVisible();

  const parentChip = page.getByRole("link", {
    name: "Parte de [QA Sagas v2] Universo",
  });
  await expect(parentChip).toBeVisible();
  await expect(parentChip).toHaveAttribute("href", `/saga/${SAGA_UNIVERSO}`);

  // Saga hoja (sin subsagas propias): un único grupo directo, sin cabecera
  // "Nexo" (group-members.ts / saga-info.tsx: isSoleDirectGroup).
  await expect(
    page.getByRole("heading", { level: 3, name: "Nexo" }),
  ).toHaveCount(0);

  await parentChip.click();
  await page.waitForURL(new RegExp(`/saga/${SAGA_UNIVERSO}`));
  await expect(
    page.getByRole("heading", { level: 1, name: "[QA Sagas v2] Universo" }),
  ).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────
// Test 4: regresión — la ficha de un miembro (Rayuela, alcanzado desde la
// propia saga) sigue mostrando su sección/strip de saga.
// ─────────────────────────────────────────────────────────────────────────
test("ficha de obra miembro sigue mostrando su sección de saga", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await page.goto(`/saga/${SAGA_ERA_UNO}`);
  await page.waitForLoadState("networkidle").catch(() => {});

  const rayuelaLink = page
    .locator('a[href^="/libro/"]')
    .filter({ hasText: "Rayuela" })
    .first();
  await expect(rayuelaLink).toBeVisible();
  await rayuelaLink.click();
  await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // Sección de sagas de la ficha de obra (SagaList/SagaStrip, src/components/detail):
  // el rótulo "Sagas · N" y una fila/tira enlazando de vuelta a Era Uno.
  //
  // Hay DOS enlaces a la misma saga en el DOM: el de SagaStrip (la tira de
  // portadas, envuelta en `lg:hidden`, así que a este ancho de escritorio
  // está en el DOM pero oculta) y el de SagaList (fila de escritorio,
  // `hidden lg:flex`). El primero en orden de documento es el de SagaStrip
  // (SIEMPRE oculto en esta suite, que corre a 1280px), así que un `.first()`
  // a secas coge el oculto — de ahí el filtro `:visible` en vez de `.first()`.
  await expect(page.getByText(/^Sagas ·/)).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator(`a[href="/saga/${SAGA_ERA_UNO}"]:visible`),
  ).toBeVisible({ timeout: 15_000 });
});
