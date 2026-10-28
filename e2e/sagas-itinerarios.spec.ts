import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

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
// El tercer libro directo da denominadores DISTINTOS entre «Publicación» (3
// obras, 1 leída) y «La Guardia» (2, 0 leídas), de modo que el test del
// contador de la balda (más abajo) detecta uno copiado de la ruta equivocada
// en vez de coincidir por casualidad numérica. (Antes era la red anti-#91 del
// hero, que contaba el universo; ese invariante ya no existe, ver el test.)
//
// Los UUID se sembraron una vez a mano en dev vía `mcp__supabase-dev__execute_sql`
// (ver `.superpowers/sdd/task-10-report.md`) — mismo patrón que el seed QA de
// sagas-v2 (UUID fijos, sin helper de siembra por test: este dominio de e2e no
// escribe en BD desde Playwright, solo hace login + navega + interactúa con la
// UI).
//
// Esta suite NO muta el seed. La adopción de ruta (que sí deja fila en
// `saga_route_choices`) se mudó a sagas-atlas.spec.ts, que la limpia antes y
// después; la historia de por qué esa limpieza no es opcional (#180, #182) está
// allí.
const UNIVERSO_ID = "33d7bb93-da3d-4453-a6da-1722beff134d";

const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";
// Id fijo del mismo usuario de arriba (`borjar20+bibliosharecollab@gmail.com`
// en dev, verificado por SQL 2026-07-27) — mismo patrón que el resto de UUIDs
// de este fichero: fijos, sin resolverlos en cada test. Hace falta para leer
// sus pases por REST (`expectedCounts`), que filtran por `user_id`.
const COLLAB_USER_ID = "4265f51f-c784-4c5b-8153-3ef970800456";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Calcado del helper `loginAs` de sagas-v2-editor.spec.ts/sagas-v2-curacion.spec.ts
// (patrón del repo: no importar entre specs de e2e, cada fichero es autónomo).
async function loginAsCollaborator(page: Page) {
  await page.goto("/login");
  await submitLogin(page, COLLAB_EMAIL, COLLAB_PASSWORD);
  await page.waitForURL("/");
}

// Cuentas esperadas por REST (service role): obras de «La Guardia» (subsaga
// del paso curado) frente a todas las del universo, y cuántas tiene leídas el
// colaborador. Ninguna opcional en este seed.
async function expectedCounts() {
  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const get = async (path: string) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: h });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const subs = (await get(`saga_routes?saga_id=eq.${UNIVERSO_ID}&slug=eq.la-guardia&select=saga_route_entries(child_saga_id)`)) as Array<{
    saga_route_entries: Array<{ child_saga_id: string | null }>;
  }>;
  const childId = subs[0]?.saga_route_entries.find((e) => e.child_saga_id)?.child_saga_id;
  if (!childId) throw new Error("expectedCounts: La Guardia ya no tiene un paso-bloque; ¿cambió el seed?");
  const universo = (await get(`saga_items?saga_id=in.(${UNIVERSO_ID},${childId})&select=saga_id,item_type,item_id`)) as Array<{
    saga_id: string; item_type: string; item_id: string;
  }>;
  const guardia = universo.filter((r) => r.saga_id === childId);
  const ids = [...new Set(universo.map((r) => r.item_id))];
  const pases = (await get(
    `passes?user_id=eq.${COLLAB_USER_ID}&status=eq.completed&item_id=in.(${ids.join(",")})&select=item_id`,
  )) as Array<{ item_id: string }>;
  const leidas = new Set(pases.map((p) => p.item_id));
  const count = (rows: typeof universo) => ({
    total: new Set(rows.map((r) => r.item_id)).size,
    completed: [...new Set(rows.map((r) => r.item_id))].filter((id) => leidas.has(id)).length,
  });
  return { guardia: count(guardia), publicacion: count(universo) };
}

/** Abre la hoja de itinerarios del atlas desde su chip («Itinerario: <nombre>»). */
async function openItineraries(page: Page) {
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
  await page.getByRole("button", { name: /^Itinerario: / }).click();
  return page.getByRole("dialog", { name: "Elige itinerario" });
}

test.describe("itinerarios de lectura", () => {
  // Mudado al atlas (Task 11 del atlas): el selector de rutas de «Cómo leerla» es ahora la hoja
  // del chip de itinerario. Elegir una ruta cambia los datos (?ruta=) y la elegida enseña su
  // resumen y su contador.
  test("la hoja lista las rutas y la elegida muestra su resumen y su contador", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}/mapa`);
    const hoja = await openItineraries(page);

    await hoja.getByRole("radio", { name: "La Guardia", exact: true }).check();
    await expect(page).toHaveURL(/[?&]ruta=la-guardia(&|$)/);
    await expect(page.getByRole("button", { name: "Itinerario: La Guardia" })).toBeVisible();
    await expect(hoja.getByText("Policíaco")).toBeVisible();
    await expect(hoja.getByText(/Llevas \d+ de \d+ de esta ruta/)).toBeVisible();
  });

  // Antes era una red contra el #91 («el progreso del hero NO cambia al cambiar
  // de ruta»): el hero viejo contaba el UNIVERSO entero. Ese invariante es
  // falso a propósito con la ficha nueva: el hero ya no enseña progreso y el
  // «N de M» de la balda cuenta el itinerario ACTIVO. Aquí se prueba justo eso,
  // comparando dos rutas con denominadores DISTINTOS (La Guardia: 2 obras,
  // Publicación: las 3), de modo que un contador copiado de la otra ruta no
  // pase colado por coincidencia numérica. Los números se leen de REST, no se
  // suponen: el seed puede variar.
  test("el contador de la balda cuenta la ruta activa, no el universo", async ({ page }) => {
    await loginAsCollaborator(page);
    const esperado = await expectedCounts();
    expect(esperado.guardia.total).not.toBe(esperado.publicacion.total);

    // La Guardia: su único paso es un bloque-subsaga, que la balda expande a
    // las obras de la subsaga. Balda y chips tienen que estar.
    await page.goto(`/saga/${UNIVERSO_ID}?ruta=la-guardia`);
    const balda = page.getByTestId("saga-shelf");
    await expect(balda).toBeVisible();
    await expect(balda.getByRole("link", { name: "La Guardia", exact: true })).toBeVisible();
    await expect(balda.getByRole("link", { name: "Publicación", exact: true })).toBeVisible();
    const lista = page.getByTestId("shelf-a11y-list");
    await expect(lista.locator("li")).toHaveCount(esperado.guardia.total);
    await expect(lista).toContainText("Guardias! ¡Guardias!");
    await expect(lista).toContainText("Pies de barro");
    const contador = page.getByTestId("shelf-count");
    await expect(contador).toHaveText(`${esperado.guardia.completed} de ${esperado.guardia.total}`);

    // Publicación: las tres obras, con su propia cuenta.
    await page.goto(`/saga/${UNIVERSO_ID}?ruta=publicacion`);
    await expect(contador).toHaveText(`${esperado.publicacion.completed} de ${esperado.publicacion.total}`);

    // Y la hoja de itinerarios del atlas fija el contador propio de la ruta curada.
    await page.goto(`/saga/${UNIVERSO_ID}/mapa?ruta=la-guardia`);
    // La barra superior del atlas cuenta la misma ruta que la balda (#1567), no el universo.
    if (esperado.guardia.completed < esperado.guardia.total) {
      await expect(page.getByText(`Llevas ${esperado.guardia.completed} de ${esperado.guardia.total} · te toca`)).toBeVisible();
    }
    const hoja = await openItineraries(page);
    await expect(
      hoja.getByText(`Llevas ${esperado.guardia.completed} de ${esperado.guardia.total} de esta ruta`),
    ).toBeVisible();
  });

  // «Adoptar una ruta hace que la ficha abra por ella» se mudó a sagas-atlas.spec.ts (test 6),
  // que adopta desde la hoja del atlas y además deja limpia `saga_route_choices` al acabar.

  test("los enlaces viejos con ?orden=publicacion acaban en la lente Publicación", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}/como-leerla?orden=publicacion`);

    // Redirect en streaming (200 + redirect en cliente): se afirma la URL final, no el status.
    await expect(page).toHaveURL(`/saga/${UNIVERSO_ID}/mapa?lente=publicacion`);
    await expect(page.getByRole("button", { name: "Publicación", exact: true })).toHaveAttribute("aria-pressed", "true");
    // En la lente Publicación cada portada lleva su puesto de lectura.
    await expect(page.locator("[data-reading-no]")).toHaveCount(3);
  });

  // Antes de este test, el único enlace a /rutas vivía en RouteView, que solo
  // se monta cuando la ruta ACTIVA ya es una curada. Aterrizar en la ficha sin
  // parámetros (la ficha, sin el atlas) deja la ruta activa
  // fuera de la ecuación: si el enlace de saga-info.tsx no existiera, no
  // habría ningún elemento con este rol/nombre en la página y el test
  // fallaría por timeout. Sin teclear `/rutas` en la barra de direcciones:
  // solo login + goto de la ficha + click.
  test("un colaborador llega a /rutas desde la ficha sin teclear la URL", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}`);

    // Nombre exacto y dentro del diálogo: el título de una de las obras
    // sembradas es literalmente "[QA Itinerarios] Ronda de noche", así que
    // una coincidencia parcial (/Itinerarios/) también engancha su portada y
    // el test se vuelve ambiguo (strict mode violation) tanto en verde como
    // en rojo. El icono «✎» va en un <span aria-hidden>: no forma parte del
    // nombre accesible.
    // El enlace vive en el menú «Opciones de curación» del hero.
    await page.getByRole("button", { name: "Opciones de curación" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Itinerarios", exact: true }).click();

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
