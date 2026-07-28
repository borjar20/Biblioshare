import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 4: saltar una lectura opcional, deshacerlo, y el interruptor
// que las esconde todas. Lo que cubre y las unitarias no pueden:
//
//  · que el salto llega a `saga_optional_skips` y SOBREVIVE a una recarga —
//    las unitarias prueban `markSkipped`, no que el server action escriba;
//  · que el interruptor persiste en `profiles` y esconde de verdad;
//  · que la barra del interruptor SIGUE en pantalla con las opcionales
//    escondidas, que es lo único que permite volver (y con ellas, deshacer un
//    salto: con el interruptor apagado la fila no está, así que su «Deshacer»
//    tampoco);
//  · que saltar NO mueve el progreso. Es el límite duro de la spec, y es lo
//    que impide que un futuro «ya que estamos» reabra el denominador.
//
// Mismo patrón de sesión y limpieza que `sagas-ventana-motivo-track.spec.ts`:
// `fetch` nativo (no el fixture `request`, que muere con el contexto y dejaría
// filas huérfanas en un timeout), `res.ok` comprobado en cada escritura
// (#180/#182) y la semilla devuelta exactamente a como estaba.
//
// Universo QA: "[QA Sagas v2] Universo" — el único con `show_map = true`, sin
// el cual `resolveSagaGraph` devuelve `graph = null` y no hay timeline que
// mirar. La obra que se marca opcional vive en Era Uno (una subsaga), a
// propósito: así el salto se guarda con `ownerSagaId = ERA_UNO_ID`, que NO es
// la ficha visitada, y el test recorre la distinción que sostiene todo esto.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const OPCIONAL_ID = "4c076a65-4888-4715-913e-2157374cd227"; // «Libro sin valorar», hueco 2 de Era Uno
const OPCIONAL_TITLE = "Libro sin valorar";

// La ficha abre en «Info»; el timeline vive en la pestaña «Mapa de lectura»,
// que se selecciona por `?tab=mapa`. Y `ruta=lectura` fija la columna a la
// curación: sin ella la ruta activa sería la que el lector tenga adoptada, y
// el test dependería de un estado que no controla.
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

let userId: string;
/** `optional` de la obra ANTES del test: el seed QA no tiene ninguna opcional
 *  (verificado contra BD dev el 2026-07-28), así que la marca este spec. */
let optionalBaseline = false;
let showBaseline = true;

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
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

// Los dos árboles (móvil y PC) se montan A LA VEZ y se ocultan por breakpoint,
// así que sin `:visible` toda consulta es ambigua. El proyecto corre en Desktop
// Chrome, o sea que lo visible es el pie del grafo de PC.
const timeline = (page: Page) => page.locator('[data-testid="reading-timeline"]:visible');
const filaOpcional = (page: Page) =>
  timeline(page).locator("div").filter({ hasText: OPCIONAL_TITLE }).last();

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

test("1 · una obra opcional trae su chapa y su píldora «Saltar»", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(MAPA);

  await expect(timeline(page).getByText(OPCIONAL_TITLE)).toBeVisible();
  await expect(filaOpcional(page).getByTestId("optional-tag")).toHaveText("Opcional");
  await expect(filaOpcional(page).getByTestId("skip-optional")).toBeVisible();
  // Y la barra del interruptor, que solo aparece si la saga TIENE opcionales.
  await expect(timeline(page).getByTestId("optional-bar")).toBeVisible();
});

test("2 · saltar tacha la fila y persiste tras recargar; deshacer la devuelve", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(MAPA);
  await filaOpcional(page).getByTestId("skip-optional").click();

  // La recarga es el test de verdad: sin ella esto solo probaría que React
  // repintó algo. El salto tiene que estar en BD.
  await page.reload();
  await expect(filaOpcional(page).getByTestId("optional-tag")).toHaveText("Oculto del recorrido");
  await expect(filaOpcional(page).getByTestId("unskip-optional")).toBeVisible();

  // Y la fila SIGUE ahí: saltar tacha, no esconde — si escondiera, «Deshacer»
  // no tendría dónde vivir.
  await expect(timeline(page).getByText(OPCIONAL_TITLE)).toBeVisible();

  const guardado = (await (
    await api(
      `saga_optional_skips?user_id=eq.${userId}&item_id=eq.${OPCIONAL_ID}&select=saga_id,item_type`,
    )
  ).json()) as Array<{ saga_id: string; item_type: string }>;
  expect(guardado).toHaveLength(1);
  // La saga guardada es la DUEÑA de la fila de saga_items, no la ficha visitada.
  expect(guardado[0].saga_id).toBe(ERA_UNO_ID);

  await filaOpcional(page).getByTestId("unskip-optional").click();
  await page.reload();
  await expect(filaOpcional(page).getByTestId("skip-optional")).toBeVisible();
  expect(
    await (await api(`saga_optional_skips?user_id=eq.${userId}&select=item_id`)).json(),
  ).toHaveLength(0);
});

test("3 · el interruptor esconde las opcionales, y la barra sigue estando para volver", async ({
  page,
}) => {
  await loginAsDevtest(page);
  await page.goto(MAPA);
  await expect(timeline(page).getByText(OPCIONAL_TITLE)).toBeVisible();

  await timeline(page).getByTestId("toggle-optional").click();
  await page.reload();

  // Escondida de verdad, y persistida en el perfil.
  await expect(timeline(page).getByText(OPCIONAL_TITLE)).toHaveCount(0);
  const perfil = (await (
    await api(`profiles?user_id=eq.${userId}&select=show_optional_readings`)
  ).json()) as Array<{ show_optional_readings: boolean }>;
  expect(perfil[0].show_optional_readings).toBe(false);

  // La barra NO desaparece con lo que esconde: si se calculara sobre las filas
  // visibles en vez de sobre el grafo, apagar el interruptor se llevaría por
  // delante el propio interruptor y no habría forma de volver.
  const barra = timeline(page).getByTestId("optional-bar");
  await expect(barra).toBeVisible();
  await expect(barra.getByTestId("toggle-optional")).toHaveText("Ver opcionales");

  await barra.getByTestId("toggle-optional").click();
  await page.reload();
  await expect(timeline(page).getByText(OPCIONAL_TITLE)).toBeVisible();
});

test("4 · saltar NO mueve el progreso", async ({ page }) => {
  // El límite duro de la spec, comprobado donde el lector lo vería. El mockup
  // pide lo contrario en dos sitios («desaparece del cómputo»); se descarta a
  // sabiendas, porque reabrir el denominador es la familia del #91 y el #185.
  await loginAsDevtest(page);
  await page.goto(MAPA);
  const antes = await page.getByTestId("saga-hero-progress").innerText();

  await filaOpcional(page).getByTestId("skip-optional").click();
  await page.reload();
  await expect(filaOpcional(page).getByTestId("unskip-optional")).toBeVisible();

  expect(await page.getByTestId("saga-hero-progress").innerText()).toBe(antes);
});
