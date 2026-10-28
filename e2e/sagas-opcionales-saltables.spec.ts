import { expect, test, type Locator, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

// E2E de la fase 4: saltar una lectura opcional y deshacerlo. Lo que cubre y
// las unitarias no pueden:
//
//  · que el salto llega a `saga_optional_skips` y SOBREVIVE a una recarga —
//    las unitarias prueban `markSkipped`, no que el server action escriba;
//  · que saltar NO mueve el progreso. Es el límite duro de la spec, y es lo
//    que impide que un futuro «ya que estamos» reabra el denominador.
//
// Mudado al atlas (Task 11 del atlas, 2026-10-28): el timeline de «Cómo leerla»
// se retiró y sus filas viven ahora en «Ver como lista» del atlas, que pinta la
// misma píldora «Saltar»/«Deshacer» (`atlas/skip-optional-button.tsx`). La
// mini-ficha del plano la cubre sagas-atlas.spec.ts (test 7). El interruptor
// «Ver/ocultar opcionales» es ahora la píldora del dock (`atlas/optional-toggle.tsx`).
//
// Mismo patrón de sesión y limpieza que `sagas-ventana-motivo-track.spec.ts`:
// `fetch` nativo (no el fixture `request`, que muere con el contexto y dejaría
// filas huérfanas en un timeout), `res.ok` comprobado en cada escritura
// (#180/#182) y la semilla devuelta exactamente a como estaba.
//
// Universo QA: "[QA Sagas v2] Universo". La obra que se marca opcional vive en
// Era Uno (una subsaga), a propósito: así el salto se guarda con
// `ownerSagaId = ERA_UNO_ID`, que NO es la ficha visitada, y el test recorre la
// distinción que sostiene todo esto.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const OPCIONAL_ID = "4c076a65-4888-4715-913e-2157374cd227"; // «Libro sin valorar», hueco 2 de Era Uno
const OPCIONAL_TITLE = "Libro sin valorar";

// `ruta=lectura` fija el atlas a la curación: sin ella la ruta activa sería la
// que el lector tenga adoptada, y el test dependería de un estado que no
// controla.
const MAPA = `/saga/${UNIVERSO_ID}/mapa?ruta=lectura`;

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

let userId: string;
/** `optional` de la obra ANTES del test: el seed QA no tiene ninguna opcional
 *  (verificado contra BD dev el 2026-07-28), así que la marca este spec. */
let optionalBaseline = false;
let showBaseline = true;

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

/** Deja al lector sin saltos y con las opcionales visibles: el estado de
 *  partida de CADA test, para que no dependan del orden en que corran. */
async function resetLector() {
  await api(`saga_optional_skips?user_id=eq.${userId}`, { method: "DELETE" });
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ show_optional_readings: true }),
  });
}

/** El atlas ha pintado su primer layout (saga-atlas.tsx marca `data-ready`). */
async function atlasReadyHere(page: Page) {
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
}

/** Abre «Ver como lista» del atlas y devuelve la `ol` de obras. */
async function openList(page: Page) {
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
  await page.getByRole("button", { name: "Ver como lista" }).click();
  const lista = page.getByRole("list", { name: /^Obras de / });
  await expect(lista).toBeVisible();
  return lista;
}
const filaOpcional = (lista: Locator) => lista.getByRole("listitem").filter({ hasText: OPCIONAL_TITLE });

test.beforeAll(async () => {
  const perfiles = (await (
    await api(`profiles?username=eq.${USERNAME}&select=user_id,show_optional_readings`)
  ).json()) as Array<{ user_id: string; show_optional_readings: boolean }>;
  if (perfiles.length !== 1) throw new Error(`beforeAll: no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  showBaseline = perfiles[0].show_optional_readings;

  const items = (await (
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${OPCIONAL_ID}&select=optional,position`)
  ).json()) as Array<{ optional: boolean; position: number | null }>;
  if (items.length !== 1) throw new Error("beforeAll: ¿cambió el seed de Era Uno?");
  optionalBaseline = items[0].optional;
  // Con hueco fijo A PROPÓSITO: la opcional vive en la COLUMNA, no como rama.
  // Es el caso que existe en producción (Saga de los Huesos Verdes, huecos 1 y
  // 2 de 5) y el que se olvida si uno trata «opcional» como sinónimo de «rama».
  if (items[0].position === null) throw new Error("beforeAll: la obra elegida debería tener hueco");

  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${OPCIONAL_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ optional: true }),
  });
});

test.afterAll(async () => {
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${OPCIONAL_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ optional: optionalBaseline }),
  });
  await api(`saga_optional_skips?user_id=eq.${userId}`, { method: "DELETE" });
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ show_optional_readings: showBaseline }),
  });
});

test.beforeEach(async () => {
  await resetLector();
});

test("1 · una obra opcional trae su píldora «Saltar», y una que no lo es no", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(MAPA);
  const lista = await openList(page);

  await expect(filaOpcional(lista)).toHaveCount(1);
  await expect(filaOpcional(lista).getByTestId("skip-optional")).toBeVisible();
  await expect(filaOpcional(lista).getByTestId("skip-optional")).toHaveAccessibleName(`Saltar «${OPCIONAL_TITLE}»`);
  // Una sola píldora en toda la lista: el resto de obras del seed no son opcionales.
  await expect(lista.getByTestId("skip-optional")).toHaveCount(1);
});

test("2 · saltar persiste tras recargar; deshacer la devuelve", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(MAPA);
  await filaOpcional(await openList(page)).getByTestId("skip-optional").click();
  await expect(filaOpcional(page.getByRole("list", { name: /^Obras de / })).getByTestId("unskip-optional")).toBeVisible();

  // La recarga es el test de verdad: sin ella esto solo probaría que React
  // repintó algo. El salto tiene que estar en BD.
  await page.reload();
  let lista = await openList(page);
  await expect(filaOpcional(lista).getByTestId("unskip-optional")).toBeVisible();
  // Y la obra SIGUE ahí: saltar tacha, no esconde — si escondiera, «Deshacer»
  // no tendría dónde vivir. El plano la marca como saltada.
  await expect(filaOpcional(lista)).toHaveCount(1);
  await expect(page.locator(`[data-work-key="i:book:${OPCIONAL_ID}"]`)).toHaveAttribute("data-skipped", "true");

  const guardado = (await (
    await api(
      `saga_optional_skips?user_id=eq.${userId}&item_id=eq.${OPCIONAL_ID}&select=saga_id,item_type`,
    )
  ).json()) as Array<{ saga_id: string; item_type: string }>;
  expect(guardado).toHaveLength(1);
  // La saga guardada es la DUEÑA de la fila de saga_items, no la ficha visitada.
  expect(guardado[0].saga_id).toBe(ERA_UNO_ID);

  await filaOpcional(lista).getByTestId("unskip-optional").click();
  await expect(filaOpcional(lista).getByTestId("skip-optional")).toBeVisible();
  await page.reload();
  lista = await openList(page);
  await expect(filaOpcional(lista).getByTestId("skip-optional")).toBeVisible();
  expect(
    await (await api(`saga_optional_skips?user_id=eq.${userId}&select=item_id`)).json(),
  ).toHaveLength(0);
});

test("3 · el interruptor esconde las opcionales, y sigue estando para volver", async ({ page }) => {
  // El interruptor del atlas (`atlas-optional-toggle`, junto a la leyenda del dock)
  // escribe `profiles.show_optional_readings`. La preferencia la deja como estaba el
  // `afterAll` (y `beforeEach` la pone a `true`), así que el test puede apagarla.
  await loginAsDevtest(page);
  await page.goto(MAPA);
  await atlasReadyHere(page);
  const obra = page.locator(`[data-work-key="i:book:${OPCIONAL_ID}"]`);
  const toggle = page.getByTestId("atlas-optional-toggle");
  await expect(obra).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toContainText("visibles");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // La recarga es la prueba: escondida de verdad y persistida en el perfil.
  await page.reload();
  await atlasReadyHere(page);
  await expect(obra).toHaveCount(0);
  const perfil = (await (
    await api(`profiles?user_id=eq.${userId}&select=show_optional_readings`)
  ).json()) as Array<{ show_optional_readings: boolean }>;
  expect(perfil[0].show_optional_readings).toBe(false);

  // El interruptor NO desaparece con lo que esconde: si contara las opcionales sobre lo
  // visible en vez de sobre toda la saga, apagarlo se llevaría por delante la vuelta.
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toContainText("ocultas");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await atlasReadyHere(page);
  await expect(obra).toHaveCount(1);
});

// El contador «N de M» de la balda de la ficha (`shelf-count`): el progreso del
// itinerario ACTIVO. Sustituye a `saga-hero-progress`, que contaba el universo
// entero; ese invariante («no cambia al cambiar de ruta») ya no existe, así que
// aquí se compara siempre sobre la MISMA ruta.
async function shelfCountText(page: Page): Promise<string> {
  const count = page.getByTestId("shelf-count");
  await expect(count).toBeVisible();
  return (await count.innerText()).trim();
}

test("4 · saltar NO mueve el progreso", async ({ page }) => {
  // El límite duro de la spec, comprobado donde el lector lo vería. El mockup
  // pide lo contrario en dos sitios («desaparece del cómputo»); se descarta a
  // sabiendas, porque reabrir el denominador es la familia del #91 y el #185.
  await loginAsDevtest(page);
  // El contador vive en la balda de la ficha, no en el atlas: se lee allí
  // antes y después, en la MISMA ruta (`lectura`, la de MAPA).
  await page.goto(`/saga/${UNIVERSO_ID}?ruta=lectura`);
  const antes = await shelfCountText(page);

  await page.goto(MAPA);
  await filaOpcional(await openList(page)).getByTestId("skip-optional").click();
  await page.reload();
  await expect(filaOpcional(await openList(page)).getByTestId("unskip-optional")).toBeVisible();

  await page.goto(`/saga/${UNIVERSO_ID}?ruta=lectura`);
  expect(await shelfCountText(page)).toBe(antes);
});
