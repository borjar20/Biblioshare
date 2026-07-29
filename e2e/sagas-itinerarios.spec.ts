import { expect, test, type Page } from "@playwright/test";

// E2E de itinerarios de lectura (spec 2026-07-22-sagas-itinerarios-design.md,
// Task 10). Contra un seed QA dedicado y AISLADO en dev (no comparte nada con
// el universo QA de sagas-v2.spec.ts/sagas-v2-mapa.spec.ts/sagas-v2-editor.spec.ts):
//
//   [QA Itinerarios] Universo (sin grafo — hasGraph=false)
//     ├─ obra directa "[QA Itinerarios] Ronda de noche" (position 3, COMPLETADA
//     │   por el colaborador de pruebas)
//     └─ subsaga "[QA Itinerarios] La Guardia" (accent verde)
//          ├─ "[QA Itinerarios] ¡Guardias! ¡Guardias!" (position 1)
//          └─ "[QA Itinerarios] Pies de barro" (position 2)
//
// Itinerario curado `la-guardia` ("La Guardia" / "Policíaco"): UN paso, el
// bloque-subsaga de La Guardia (2 obras). Sin grafo, `buildRouteList` no
// ofrece la ruta sintética "lectura", así que el selector queda en exactamente
// DOS rutas (la-guardia + publicacion) — el caso "toggle" de `RouteSelector`.
//
// El tercer libro directo es la pieza que hace el test anti-#91 (más abajo)
// capaz de detectar la regresión de verdad: si solo hubiera las 2 obras de La
// Guardia, el denominador del universo (countedKeys del Universo, spec
// 2026-07-25 — pertenencia del subárbol, ya no `mainOrder`) y el de la ruta
// curada coincidirían (2 = 2) y un hero mal enganchado a la ruta activa daría
// el mismo número por COINCIDENCIA. Con la obra directa, el universo tiene
// denominador 3 (1 completada = 33%) y la ruta "la-guardia" tiene denominador
// 2 (0 completadas = 0%): valores distintos a propósito, así que solo el
// hero CORRECTO (ligado siempre al universo) se queda quieto.
//
// Los UUID se sembraron una vez a mano en dev vía `mcp__supabase-dev__execute_sql`
// (ver `.superpowers/sdd/task-10-report.md`) — mismo patrón que el seed QA de
// sagas-v2 (UUID fijos, sin helper de siembra por test: este dominio de e2e no
// escribe en BD desde Playwright, solo hace login + navega + interactúa con la
// UI). Esta suite NO muta el seed salvo la adopción de ruta del test 3, que es
// idempotente (relanzar la suite vuelve a adoptar la misma ruta).
const UNIVERSO_ID = "33d7bb93-da3d-4453-a6da-1722beff134d";

const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";
// Id fijo del mismo usuario de arriba (`borjar20+bibliosharecollab@gmail.com`
// en dev, verificado por SQL 2026-07-27) — mismo patrón que el resto de UUIDs
// de este fichero: fijos, sin resolverlos en cada test. Solo hace falta para
// limpiar `saga_route_choices` por REST (más abajo, test "adoptar una ruta"),
// que filtra por `user_id`, no por email.
const COLLAB_USER_ID = "4265f51f-c784-4c5b-8153-3ef970800456";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// Calcado del helper `loginAs` de sagas-v2-editor.spec.ts/sagas-v2-curacion.spec.ts
// (patrón del repo: no importar entre specs de e2e, cada fichero es autónomo).
async function loginAsCollaborator(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', COLLAB_EMAIL);
  await page.fill('input[name="password"]', COLLAB_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Hallazgo (2026-07-27, al correr la suite entera de sagas tras la fase 3):
// esta ruta llevaba adoptada por `bibliosharecollab` desde el 2026-07-23
// (verificado por SQL) — de una pasada de este mismo test que nunca limpió,
// pese a que el comentario original del test la llamaba "idempotente". No lo
// es: `AdoptRouteButton` pinta "Leyendo por aquí" en vez de "Leer por aquí"
// en cuanto `detail.routeChoice === slug`, así que con la ruta YA adoptada el
// `getByRole("button", { name: "Leer por aquí" })` de la línea de abajo nunca
// resuelve y el test cuelga hasta el timeout — no es un fallo de fase 3 (este
// fichero no lo tocó) ni del producto (el botón hace justo lo que su nombre
// dice). Se limpia por REST antes de cada pasada para que la precondición del
// test ("Leer por aquí" visible) se cumpla siempre, sin depender de qué dejó
// la pasada anterior — el propio test ya deja la ruta adoptada al acabar
// (diseño original), así que no hace falta un `finally` que la desadopte.
async function clearRouteChoice(sagaId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_route_choices?user_id=eq.${COLLAB_USER_ID}&saga_id=eq.${sagaId}`,
    { method: "DELETE", headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`clearRouteChoice: ${res.status} ${res.statusText} — ${await res.text()}`);
}

test.describe("itinerarios de lectura", () => {
  test("el selector lista las rutas y la elegida muestra su cabecera", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa`);

    await page.getByRole("link", { name: "La Guardia" }).click();

    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
    await expect(page.getByText("Policíaco")).toBeVisible();
    await expect(page.getByText(/Llevas \d+ de \d+ de esta ruta/)).toBeVisible();
  });

  // Red contra el #91: si alguien reimplementa el contador y lo engancha al
  // hero, el número del universo empezaría a bailar según la pestaña. Arranca
  // deliberadamente en «Publicación» (no en la ruta curada, que además es la
  // que cae por defecto sin adopción) para que el clic sí cambie de ruta de
  // verdad, y el seed deja denominadores DISTINTOS entre universo (3) y ruta
  // (2) para que un enganche incorrecto no pase colado por coincidencia
  // numérica — ver comentario de cabecera.
  test("el progreso del hero NO cambia al cambiar de ruta", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&orden=publicacion`);

    const hero = page.getByTestId("saga-hero-progress");
    await expect(hero).toBeVisible();
    const before = await hero.innerText();
    expect(before).toBe("33%"); // 1 de 3 (Ronda de noche completada) — fija el baseline, no solo la igualdad

    await page.getByRole("link", { name: "La Guardia" }).click();
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
    // La ruta SÍ tiene un denominador distinto (0 de 2 = 0%) — si el hero
    // hubiera copiado ese número, esta comparación fallaría.
    await expect(page.getByText("Llevas 0 de 2 de esta ruta")).toBeVisible();

    expect(await hero.innerText()).toBe(before);
  });

  test("adoptar una ruta hace que la ficha abra por ella", async ({ page }) => {
    await clearRouteChoice(UNIVERSO_ID);
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=la-guardia`);

    await page.getByRole("button", { name: "Leer por aquí" }).click();
    await expect(page.getByRole("button", { name: "Leyendo por aquí" })).toBeVisible();

    // Sin searchParams: debe abrir por la adoptada.
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa`);
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
  });

  test("los enlaces viejos con ?orden=publicacion siguen funcionando", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&orden=publicacion`);

    // La lista por año se reconoce por su numeración 01, 02…
    await expect(page.getByText("01", { exact: true })).toBeVisible();
  });

  // Antes de este test, el único enlace a /rutas vivía en RouteView, que solo
  // se monta cuando la ruta ACTIVA ya es una curada. Aterrizar en la ficha sin
  // parámetros (pestaña Info, la que carga por defecto) deja la ruta activa
  // fuera de la ecuación: si el enlace de saga-info.tsx no existiera, no
  // habría ningún elemento con este rol/nombre en la página y el test
  // fallaría por timeout. Sin teclear `/rutas` en la barra de direcciones:
  // solo login + goto de la ficha + click.
  test("un colaborador llega a /rutas desde la ficha sin teclear la URL", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}`);

    // Nombre exacto (con el icono "✎"): el título de una de las obras
    // sembradas es literalmente "[QA Itinerarios] Ronda de noche", así que
    // una coincidencia parcial (/Itinerarios/) también engancha su portada y
    // el test se vuelve ambiguo (strict mode violation) tanto en verde como
    // en rojo.
    await page.getByRole("link", { name: "✎ Itinerarios", exact: true }).click();

    await expect(page).toHaveURL(`/saga/${UNIVERSO_ID}/rutas`);
    await expect(page.getByRole("heading", { name: "Itinerarios de lectura" })).toBeVisible();
  });

  // Editor de PASOS (issue #261, rediseño M5-M7+D2). El viewport por defecto
  // de Playwright (Desktop Chrome) cae en la cáscara de escritorio: el
  // buscador de añadir vive directo en el raíl, sin hoja que abrir. Usa el
  // mismo seed que el resto del fichero: la subsaga "[QA Itinerarios] La
  // Guardia" (2 obras) es hoy el único paso de "la-guardia"; añadir "[QA
  // Itinerarios] Ronda de noche" y quitarla dentro del mismo test deja el
  // seed intacto para la próxima pasada.
  test("anadir un paso desde el buscador y quitarlo deja el borrador limpio", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}/rutas/la-guardia/editar`);

    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();

    await page.getByPlaceholder("Buscar en la saga…").fill("Ronda de noche");
    await page.getByRole("button", { name: /Ronda de noche/ }).click();

    // `:visible`/`locator("visible=true")`: las dos cáscaras se montan a la
    // vez y se ocultan por breakpoint (regla de los dos árboles, ya
    // documentada en sagas-colocacion-opcionalidad.spec.ts) — sin esto el
    // locator encuentra dos elementos, uno por cáscara.
    await expect(page.getByText("1 añadido").locator("visible=true")).toBeVisible();

    await page
      .locator("li:visible")
      .filter({ hasText: "Ronda de noche" })
      .getByRole("button", { name: "Quitar" })
      .click();

    await expect(page.getByText("Sin cambios").locator("visible=true")).toBeVisible();
  });
});
