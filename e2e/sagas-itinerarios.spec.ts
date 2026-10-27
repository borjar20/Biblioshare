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
// Esta suite NO muta el seed salvo la adopción de ruta del test 3, que SÍ deja
// fila en `saga_route_choices` y por eso se limpia por REST al empezar ese test
// (`clearRouteChoice`, más abajo). La cabecera decía antes que esa adopción era
// "idempotente"; no lo era, y esa frase costó tiempo dos veces (issues #180 y
// #182): idempotente en BD (el `upsert` no duplica) NO es idempotente en UI —
// con la fila ya puesta, el botón que el test busca ("Leer por aquí") ya no
// existe, porque pasa a decir "Leyendo por aquí".
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
  await submitLogin(page, COLLAB_EMAIL, COLLAB_PASSWORD);
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
    await page.goto(`/saga/${UNIVERSO_ID}/como-leerla`);

    await page.getByRole("link", { name: "La Guardia" }).click();

    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
    await expect(page.getByText("Policíaco")).toBeVisible();
    await expect(page.getByText(/Llevas \d+ de \d+ de esta ruta/)).toBeVisible();
  });

  // Antes era una red contra el #91 («el progreso del hero NO cambia al cambiar
  // de ruta»): el hero viejo contaba el UNIVERSO entero. Ese invariante es
  // falso a propósito con la ficha nueva: el hero ya no enseña progreso y el
  // «N de M» de la balda cuenta el itinerario ACTIVO (igual que antes contaba
  // `RouteView`). Aquí se fija lo que la UI promete para «Publicación» (las 3
  // obras, 1 leída) y que no baila al recargar ni al volver a ella.
  //
  // NO se compara con «La Guardia»: su único paso es un bloque-subsaga, y un
  // paso que nombra un bloque entero no resuelve a ningún nodo
  // (derive-timeline.ts, spine «route»), así que la balda de esa ruta sale
  // vacía —sin contador, sin chips— hasta que se decida qué enseñar. El
  // contraste entre rutas con denominadores distintos se cubre en
  // sagas-ficha-lector.spec.ts (Universo QA: «2 de 6» frente a «2 de 7»).
  test("el contador de la balda enseña el de la ruta activa", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}?ruta=publicacion`);
    const contador = page.getByTestId("shelf-count");
    await expect(contador).toBeVisible();
    await expect(contador).toHaveText("1 de 3"); // Ronda de noche completada — fija el baseline, no solo la igualdad

    await page.reload();
    await expect(contador).toHaveText("1 de 3");
  });

  test("adoptar una ruta hace que la ficha abra por ella", async ({ page }) => {
    await clearRouteChoice(UNIVERSO_ID);
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}/como-leerla?ruta=la-guardia`);

    await page.getByRole("button", { name: "Leer por aquí" }).click();
    await expect(page.getByRole("button", { name: "Leyendo por aquí" })).toBeVisible();

    // Sin searchParams: debe abrir por la adoptada.
    await page.goto(`/saga/${UNIVERSO_ID}/como-leerla`);
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
  });

  test("los enlaces viejos con ?orden=publicacion siguen funcionando", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}/como-leerla?orden=publicacion`);

    // La lista por año se reconoce por su numeración 01, 02…
    await expect(page.getByText("01", { exact: true })).toBeVisible();
  });

  // Antes de este test, el único enlace a /rutas vivía en RouteView, que solo
  // se monta cuando la ruta ACTIVA ya es una curada. Aterrizar en la ficha sin
  // parámetros (la ficha, sin /como-leerla) deja la ruta activa
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
    // El enlace vive ahora en el menú «Opciones de curación» del hero (antes
    // era un enlace suelto en la pestaña Info).
    await page.getByRole("button", { name: "Opciones de curación" }).click();
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
