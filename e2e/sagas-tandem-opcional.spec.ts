import { expect, test, type Page } from "@playwright/test";

// E2E de la issue #233: la píldora «Saltar» de una obra opcional DENTRO de un
// tándem (fila de hueco compartido). Antes vivía en dos de las tres filas
// (`timeline-entry-row.tsx`, `timeline-branch.tsx`) pero no en
// `timeline-tandem-row.tsx` — se dejó fuera a propósito en su día porque
// producción no tenía ningún tándem con una obra opcional para probarlo. Este
// spec fabrica ese caso: empareja el hueco 2 de Era Uno (que ya trae
// «Libro sin valorar», la misma obra opcional de
// `sagas-opcionales-saltables.spec.ts`) con «Libro raro sin match», y marca
// SOLO la primera como opcional.
//
// Mismo patrón de sesión/limpieza que `sagas-tandem-metadatos.spec.ts` y
// `sagas-opcionales-saltables.spec.ts`: `fetch` nativo, `res.ok` comprobado en
// cada escritura (#180/#182), semilla devuelta a como estaba.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const OPCIONAL_ID = "4c076a65-4888-4715-913e-2157374cd227"; // «Libro sin valorar», hueco 2
const OPCIONAL_TITLE = "Libro sin valorar";
const PAREJA_ID = "d6d61eab-6ef4-4691-a8f0-b89068508fd4"; // «Libro raro sin match», hueco 3 → se mueve al 2
const PAREJA_TITLE = "Libro raro sin match";

const MAPA = `/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`;

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

let userId: string;

const tandem = (page: Page) => page.locator('[data-testid="timeline-tandem"]:visible').first();

test.beforeAll(async () => {
  const perfiles = (await (
    await api(`profiles?username=eq.${USERNAME}&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  if (perfiles.length !== 1) throw new Error(`beforeAll: no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;

  // Empareja: mueve "Libro raro sin match" (hueco 3) al hueco 2, donde ya
  // vive "Libro sin valorar" — las dos comparten `position` y se funden en
  // una fila `tandem`. Y marca solo la primera como opcional.
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${PAREJA_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ position: 2, placement: "fijo" }),
  });
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${OPCIONAL_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ optional: true }),
  });
});

test.afterAll(async () => {
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${PAREJA_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ position: 3, placement: "fijo" }),
  });
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${OPCIONAL_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ optional: false }),
  });
  await api(`saga_optional_skips?user_id=eq.${userId}`, { method: "DELETE" });
});

test.beforeEach(async () => {
  await api(`saga_optional_skips?user_id=eq.${userId}`, { method: "DELETE" });
});

test("1 · la obra opcional del tándem trae su propia píldora «Saltar», junto a su título", async ({
  page,
}) => {
  await loginAsDevtest(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MAPA);

  const fila = tandem(page);
  await expect(fila).toBeVisible();
  await expect(fila).toContainText(OPCIONAL_TITLE);
  await expect(fila).toContainText(PAREJA_TITLE);

  // La píldora vive junto al ÍTEM opcional, no en el número/corchete
  // compartido: una sola en toda la fila, aunque haya dos obras.
  await expect(fila.getByTestId("skip-optional")).toHaveCount(1);

  // Y no cuelga de la obra no-opcional: el <li> de "Libro raro sin match" no
  // lleva píldora propia.
  const filaPareja = fila.locator("li").filter({ hasText: PAREJA_TITLE });
  await expect(filaPareja.getByTestId("skip-optional")).toHaveCount(0);
});

test("2 · saltarla dentro del tándem persiste tras recargar", async ({ page }) => {
  await loginAsDevtest(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MAPA);

  await tandem(page).getByTestId("skip-optional").click();
  await page.reload();

  await expect(tandem(page).getByTestId("unskip-optional")).toBeVisible();
  // La fila SIGUE mostrando las dos obras: saltar tacha, no esconde.
  await expect(tandem(page)).toContainText(OPCIONAL_TITLE);
  await expect(tandem(page)).toContainText(PAREJA_TITLE);

  const guardado = (await (
    await api(`saga_optional_skips?user_id=eq.${userId}&item_id=eq.${OPCIONAL_ID}&select=saga_id`)
  ).json()) as Array<{ saga_id: string }>;
  expect(guardado).toHaveLength(1);
  expect(guardado[0].saga_id).toBe(ERA_UNO_ID);
});
