import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

// E2E del atlas de la saga (spec 2026-10-28, plan 2026-10-28-sagas-atlas.md, Task 11). El atlas
// sustituye al grafo de React Flow y a «Cómo leerla»: un plano con lentes (Orden, Rol,
// Publicación), una mini-ficha por obra, «Ver como lista» y el chip de itinerario.
//
// Va contra build de producción (`next start`): los redirects de `/como-leerla` y de
// `?tab=mapa` ocurren dentro de un <Suspense>, así que llegan como redirect en streaming
// (HTTP 200 + redirect en cliente). Por eso se afirma la URL final con `toHaveURL`, nunca el
// status de la respuesta.
//
// Dos semillas QA, las mismas que ya usaban las specs a las que este atlas sustituye:
//
// - `[QA Itinerarios] Universo` (sagas-itinerarios.spec.ts): «Ronda de noche» directa y la
//   subsaga «La Guardia» con «¡Guardias! ¡Guardias!» y «Pies de barro». Tiene `show_map = false`
//   (se comprueba en el test 9) y un itinerario curado `la-guardia` cuyo único paso es el
//   bloque de la subsaga. El colaborador de pruebas tiene «Ronda de noche» terminada.
// - `[QA Sagas v2] Universo` (sagas-opcionales-saltables.spec.ts): para saltar una opcional,
//   que se marca aquí en Era Uno y se devuelve a su valor al acabar.
//
// Limpieza: `fetch` nativo con service role (no el fixture `request`, que muere con el
// contexto y dejaría filas huérfanas en un timeout), `res.ok` comprobado en cada escritura
// (#180/#182) y la semilla devuelta a como estaba: ni elección de ruta ni saltos quedan
// puestos al acabar.
const UNIVERSO_ID = "33d7bb93-da3d-4453-a6da-1722beff134d";
const UNIVERSO_NAME = "[QA Itinerarios] Universo";
const GUARDIAS = { key: "i:book:7f881b7a-8a1f-4762-896a-e18825d460f5", title: "[QA Itinerarios] ¡Guardias! ¡Guardias!" };
const PIES = { key: "i:book:0b49bdac-135e-4b9c-825d-a6f1ce97ca54", title: "[QA Itinerarios] Pies de barro" };
const RONDA = { key: "i:book:35a3c64b-aff4-430e-b10d-ef8ec5a7341e", title: "[QA Itinerarios] Ronda de noche" };
const ATLAS = `/saga/${UNIVERSO_ID}/mapa`;

const V2_UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const OPCIONAL_ID = "4c076a65-4888-4715-913e-2157374cd227"; // «Libro sin valorar», hueco 2 de Era Uno
const OPCIONAL_TITLE = "Libro sin valorar";

const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";
// Id fijo del colaborador en dev (mismo que sagas-itinerarios.spec.ts): solo para limpiar
// `saga_route_choices`, que filtra por `user_id`.
const COLLAB_USER_ID = "4265f51f-c784-4c5b-8153-3ef970800456";

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

// Calcado de sagas-itinerarios.spec.ts (patrón del repo: no se importa entre specs).
async function loginAsCollaborator(page: Page) {
  await page.goto("/login");
  await submitLogin(page, COLLAB_EMAIL, COLLAB_PASSWORD);
  await page.waitForURL("/");
}

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

/** Quita la ruta adoptada por el colaborador. Con ella puesta el botón ya no dice «Leer por
 *  aquí» sino «Leyendo por aquí», y el test 6 colgaría buscándolo (#180, #182). */
async function clearRouteChoice() {
  await api(`saga_route_choices?user_id=eq.${COLLAB_USER_ID}&saga_id=eq.${UNIVERSO_ID}`, { method: "DELETE" });
}

/** La barra superior del atlas (título y resumen de una línea de la lente). */
const topBar = (page: Page) => page.locator('header[data-atlas-chrome="top"]');

/** Una obra del plano por su clave de dominio (`i:<tipo>:<uuid>`), estable frente al título. */
const work = (page: Page, key: string) => page.locator(`[data-work-key="${key}"]`);

/** Abre la mini-ficha de una obra con el teclado: el plano es un lienzo con cámara y el clic
 *  por coordenadas puede caer bajo la barra superior o el dock. Enter sobre el botón de la obra
 *  es el mismo camino que el clic (onClick) y no depende de dónde cayó la cámara. */
async function openSheet(page: Page, key: string) {
  const w = work(page, key);
  await w.focus();
  await page.keyboard.press("Enter");
  return page.getByRole("dialog");
}

/** El atlas está listo cuando la raíz marca `data-ready`: ha medido el viewport y pintado el
 *  primer layout con su orientación real (saga-atlas.tsx). Antes, un clic puede perderse. */
async function gotoAtlas(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
}

test.describe("atlas de la saga · escritorio", () => {
  test("1 · sin sesión: tres lentes, «Empieza por…» y sin interruptor de Progreso", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await gotoAtlas(page, ATLAS);

      const lentes = page.getByRole("group", { name: "Lente", exact: true });
      await expect(lentes.getByRole("button")).toHaveCount(3);
      await expect(lentes.getByRole("button", { name: "Orden", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(lentes.getByRole("button", { name: "Rol", exact: true })).toBeVisible();
      await expect(lentes.getByRole("button", { name: "Publicación", exact: true })).toBeVisible();

      await expect(topBar(page).getByText(/^Empieza por /)).toBeVisible();
      // Sin sesión no hay estado del lector que enseñar: ni el interruptor ni marcas de estado.
      await expect(page.getByRole("button", { name: /Progreso/ })).toHaveCount(0);
      await expect(page.locator("[data-progress='off']")).toHaveCount(1);
      await expect(page.locator("[data-now-label], [data-done-mark]")).toHaveCount(0);
      // Las tres obras de la saga están en el plano.
      for (const w of [GUARDIAS, PIES, RONDA]) await expect(work(page, w.key)).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test("2 · con sesión: la obra «ahora» cae dentro del viewport", async ({ page }) => {
    await loginAsCollaborator(page);
    await gotoAtlas(page, `${ATLAS}?ruta=lectura`);

    // La capa Progreso viene encendida con sesión; el nombre accesible de la obra dice su estado.
    await expect(page.getByRole("button", { name: /Progreso/ })).toHaveAttribute("aria-pressed", "true");
    const ahora = page.locator("[data-work-key][data-state='now']");
    await expect(ahora).toHaveCount(1);
    await expect(ahora).toHaveAttribute("aria-label", /, ahora/);
    await expect(ahora).toBeVisible();

    // La cámara inicial enfoca la obra «ahora»: su caja entera cae en la ventana.
    const vp = page.viewportSize()!;
    await expect
      .poll(async () => {
        const box = await ahora.boundingBox();
        return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;
      })
      .toBe(true);
  });

  test("3 · lentes: Rol cambia la URL a lente=rol y Publicación resume «De … a …»", async ({ page }) => {
    await gotoAtlas(page, ATLAS);
    const lentes = page.getByRole("group", { name: "Lente", exact: true });

    await lentes.getByRole("button", { name: "Rol", exact: true }).click();
    await expect(page).toHaveURL(/[?&]lente=rol(&|$)/);
    await expect(lentes.getByRole("button", { name: "Rol", exact: true })).toHaveAttribute("aria-pressed", "true");

    await lentes.getByRole("button", { name: "Publicación", exact: true }).click();
    await expect(page).toHaveURL(/[?&]lente=publicacion(&|$)/);
    await expect(topBar(page).getByText(/^De \d{4} a \d{4}/)).toBeVisible();
    // En Publicación cada portada lleva su puesto de lectura.
    await expect(page.locator("[data-reading-no]")).toHaveCount(3);

    // Volver a Orden limpia el parámetro: es la lente por defecto.
    await lentes.getByRole("button", { name: "Orden", exact: true }).click();
    await expect(page).not.toHaveURL(/lente=/);
  });

  test("4 · «Ver como lista» enseña una lista ordenada con las obras de la saga", async ({ page }) => {
    await gotoAtlas(page, ATLAS);

    const toggle = page.getByRole("button", { name: "Ver como lista" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    const lista = page.getByRole("list", { name: `Obras de ${UNIVERSO_NAME}` });
    await expect(lista).toBeVisible();
    expect(await lista.evaluate((el) => el.tagName)).toBe("OL");
    await expect(lista.getByRole("listitem")).toHaveCount(3);
    for (const w of [GUARDIAS, PIES, RONDA]) {
      await expect(lista.getByRole("link", { name: new RegExp(escape(w.title)) })).toBeVisible();
    }
    // Con la lista puesta, el plano sale del árbol accesible y del orden de tabulación.
    await expect(page.locator("[data-atlas-stage]")).toHaveAttribute("aria-hidden", "true");

    await toggle.click();
    await expect(lista).toHaveCount(0);
  });

  test("5 · ?ruta=la-guardia numera sus obras como pasos 1 y 2 (#1541)", async ({ page }) => {
    await gotoAtlas(page, `${ATLAS}?ruta=la-guardia`);

    // El único paso del itinerario es un bloque-subsaga: se expande a sus obras, cada una con su
    // número de paso (no todas con el 1 del bloque, que era el #1541).
    await expect(work(page, GUARDIAS.key)).toHaveAttribute("data-step", "1");
    await expect(work(page, PIES.key)).toHaveAttribute("data-step", "2");
    await expect(work(page, GUARDIAS.key)).toHaveAttribute("aria-label", /Paso 1 del itinerario/);
    await expect(work(page, PIES.key)).toHaveAttribute("aria-label", /Paso 2 del itinerario/);
    // Lo que queda fuera del itinerario no tiene paso y se atenúa como filtro.
    await expect(work(page, RONDA.key)).not.toHaveAttribute("data-step", /.+/);
    await expect(work(page, RONDA.key)).toHaveAttribute("data-dimmed", "true");
    await expect(page.getByRole("button", { name: "Itinerario: La Guardia" })).toBeVisible();
  });

  test("6 · adoptar un itinerario desde la hoja hace que el atlas abra por él", async ({ page }) => {
    await clearRouteChoice();
    try {
      await loginAsCollaborator(page);
      await gotoAtlas(page, `${ATLAS}?ruta=lectura`);

      // Elegir la ruta en la hoja cambia los datos (router.replace con ?ruta=).
      await page.getByRole("button", { name: /^Itinerario: / }).click();
      const hoja = page.getByRole("dialog", { name: "Elige itinerario" });
      await hoja.getByRole("radio", { name: "La Guardia", exact: true }).check();
      await expect(page).toHaveURL(/[?&]ruta=la-guardia(&|$)/);
      await expect(hoja.getByText("Policíaco")).toBeVisible();
      await expect(hoja.getByText(/^Llevas \d+ de \d+ de esta ruta$/)).toBeVisible();

      await hoja.getByRole("button", { name: "Leer por aquí" }).click();
      await expect(hoja.getByRole("button", { name: "Leyendo por aquí" })).toBeVisible();

      // Sin ?ruta= manda la adoptada.
      await gotoAtlas(page, ATLAS);
      await expect(page.getByRole("button", { name: "Itinerario: La Guardia" })).toBeVisible();
      await expect(work(page, GUARDIAS.key)).toHaveAttribute("data-step", "1");
    } finally {
      await clearRouteChoice();
    }
  });

  test.describe("7 · saltar una opcional desde la mini-ficha", () => {
    let userId: string;
    let optionalBaseline = false;
    let showBaseline = true;

    test.beforeAll(async () => {
      const perfiles = (await (
        await api(`profiles?username=eq.${USERNAME}&select=user_id,show_optional_readings`)
      ).json()) as Array<{ user_id: string; show_optional_readings: boolean }>;
      if (perfiles.length !== 1) throw new Error(`beforeAll: no encuentro el perfil de ${USERNAME}`);
      userId = perfiles[0].user_id;
      showBaseline = perfiles[0].show_optional_readings;

      const items = (await (
        await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${OPCIONAL_ID}&select=optional`)
      ).json()) as Array<{ optional: boolean }>;
      if (items.length !== 1) throw new Error("beforeAll: ¿cambió el seed de Era Uno?");
      optionalBaseline = items[0].optional;

      await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${OPCIONAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ optional: true }),
      });
      // Sin saltos y con las opcionales visibles: si el perfil las escondiera, la obra no
      // estaría en el plano.
      await api(`saga_optional_skips?user_id=eq.${userId}`, { method: "DELETE" });
      await api(`profiles?user_id=eq.${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ show_optional_readings: true }),
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

    test("saltar persiste tras recargar y deshacer lo devuelve", async ({ page }) => {
      const key = `i:book:${OPCIONAL_ID}`;
      await loginAsDevtest(page);
      await gotoAtlas(page, `/saga/${V2_UNIVERSO_ID}/mapa?ruta=lectura`);

      let ficha = await openSheet(page, key);
      await expect(ficha.getByRole("heading", { name: OPCIONAL_TITLE })).toBeVisible();
      await ficha.getByTestId("skip-optional").click();
      // El servidor revalida y la misma ficha pasa a ofrecer «Deshacer».
      await expect(ficha.getByTestId("unskip-optional")).toBeVisible();

      // La recarga es la prueba de verdad: el salto está en BD, guardado con la saga DUEÑA de
      // la fila (Era Uno), no con la ficha visitada.
      await page.reload();
      await expect(work(page, key)).toHaveAttribute("data-skipped", "true");
      await expect(work(page, key)).toHaveAttribute("aria-label", /, saltada/);
      const guardado = (await (
        await api(`saga_optional_skips?user_id=eq.${userId}&item_id=eq.${OPCIONAL_ID}&select=saga_id`)
      ).json()) as Array<{ saga_id: string }>;
      expect(guardado).toHaveLength(1);
      expect(guardado[0].saga_id).toBe(ERA_UNO_ID);

      ficha = await openSheet(page, key);
      await ficha.getByTestId("unskip-optional").click();
      await expect(ficha.getByTestId("skip-optional")).toBeVisible();
      await page.reload();
      await expect(work(page, key)).not.toHaveAttribute("data-skipped", /.+/);
      expect(await (await api(`saga_optional_skips?user_id=eq.${userId}&select=item_id`)).json()).toHaveLength(0);
    });
  });

  test("8 · los enlaces viejos acaban en el atlas con su lente", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}/como-leerla?ruta=publicacion`);
    await expect(page).toHaveURL(`${ATLAS}?lente=publicacion`);
    await expect(page.getByRole("button", { name: "Publicación", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&rol=relato`);
    await expect(page).toHaveURL(`${ATLAS}?lente=rol&rol=relato`);
    await expect(page.getByRole("button", { name: "Rol", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("9 · una saga con show_map = false abre el atlas sin redirigir", async ({ page }) => {
    // Precondición medida, no supuesta: si alguien enciende el interruptor del seed, este test
    // dejaría de probar lo que dice.
    const rows = (await (await api(`sagas?id=eq.${UNIVERSO_ID}&select=show_map`)).json()) as Array<{ show_map: boolean }>;
    expect(rows[0]?.show_map).toBe(false);

    await gotoAtlas(page, ATLAS);
    await expect(page).toHaveURL(ATLAS);
    await expect(page.getByRole("heading", { level: 1, name: UNIVERSO_NAME })).toBeVisible();
    for (const w of [GUARDIAS, PIES, RONDA]) await expect(work(page, w.key)).toHaveCount(1);
  });
});

test.describe("atlas de la saga · móvil", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("la mini-ficha sale como hoja inferior y se cierra con ✕", async ({ page }) => {
    await gotoAtlas(page, ATLAS);
    // En vertical, el plano y el dock caben sin desbordar la página.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole("group", { name: "Lente", exact: true })).toBeVisible();

    const w = work(page, GUARDIAS.key);
    await expect(w).toBeVisible();
    await w.tap();
    const ficha = page.getByRole("dialog");
    await expect(ficha.getByRole("heading", { name: GUARDIAS.title })).toBeVisible();
    await expect(ficha.getByRole("link", { name: "Abrir ficha" })).toBeVisible();
    // Hoja inferior: pegada al borde de abajo y a todo lo ancho (con su margen).
    const box = (await ficha.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(844 - 40);
    expect(box.width).toBeGreaterThan(390 * 0.8);

    await ficha.getByRole("button", { name: "Cerrar" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("«Ver como lista» también funciona en móvil", async ({ page }) => {
    await gotoAtlas(page, ATLAS);
    await page.getByRole("button", { name: "Ver como lista" }).tap();
    const lista = page.getByRole("list", { name: `Obras de ${UNIVERSO_NAME}` });
    await expect(lista.getByRole("listitem")).toHaveCount(3);
  });
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
