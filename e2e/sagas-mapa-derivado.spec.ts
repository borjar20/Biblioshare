import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 3 (Task 7, Step 1 — brief en .superpowers/sdd/task-7-brief.md,
// spec en docs/superpowers/specs/2026-07-27-sagas-fase-3-retirada-del-grafo-design.md):
// el «Mapa de lectura» deja de leerse de `saga_nodes`/`saga_edges` y se DERIVA
// de lo curado (secuencia, tándems, bloques, ventanas). Cubre exactamente lo
// que esta fase estrena y que ningún test existente comprobaba:
//
//   1) una saga curada y SIN grafo dibujado a mano enseña mapa — antes no
//      enseñaría nada, porque `hasGraph` exigía una fila en `saga_nodes`;
//   2) el generador (`generateRoute`, Task 6) construye un itinerario
//      recorrible a partir de esa misma curación;
//   3) una entrada `libre` con ventana produce la arista que CRUZA en el mapa
//      derivado (`deriveSagaMap`, Task 1) — la ventana pintada como arista.
//
// Matiz que el brief de esta tarea señala y que NO estaba en el plan
// original: desde la Task 4-bis el mapa solo se enseña si el curador enciende
// `sagas.show_map` (el aviso «un moderador configuró el recorrido» se
// retiró). El primer test tiene que ENCENDER el interruptor en su semilla —
// si no, «curada y sin grafo» seguiría sin enseñar nada, por un motivo
// distinto al que el test dice cubrir — y hay un segundo test dedicado a lo
// contrario (apagado, no hay mapa), porque es la garantía que más fácil se
// rompe: alguien podría volver a leer `graph !== null` en vez de `hasGraph`
// en un consumidor nuevo.
//
// Mismo patrón de sesión/limpieza que el resto de specs de sagas
// (sagas-ventanas.spec.ts, sagas-colocacion-bloques.spec.ts): `fetch` nativo
// (NO el fixture `request` de Playwright, que muere con el contexto del test
// y dejaría la limpieza del `finally` sin correr en un timeout a mitad de
// test), comprobando `res.ok` en cada escritura, y dejando la semilla
// EXACTAMENTE como estaba.
//
// Dos universos QA, cada uno el más económico para lo que su test necesita:
//
// - `[QA Itinerarios] Universo` (33d7bb93-…, ver e2e/sagas-itinerarios.spec.ts):
//   verificado contra BD dev (mcp__supabase-dev, 2026-07-27) SIN fila en
//   `saga_nodes` — nunca tuvo grafo dibujado a mano — y con curación real: un
//   miembro directo («Ronda de noche», position 3) y una subsaga («La
//   Guardia», position_in_parent 4, con 2 obras). Ya tiene un itinerario
//   curado a mano (`la-guardia`), lo que lo hace también el mejor candidato
//   para el test 1b: con `show_map` apagado, esta saga YA enseña pestaña
//   Mapa (por `la-guardia`, ruta no sintética) — así que apagar el
//   interruptor no puede comprobarse por "la pestaña desaparece" (no
//   desaparece, y no debe), sino por que la ruta sintética «lectura» deja de
//   ofrecerse y el mapa 2D no se pinta ni para la ruta curada. Es una
//   distinción que un universo sin ninguna ruta curada no dejaría ver.
// - `[QA Sagas v2] Universo` / `Era Uno` (69c07496-…/53118dd4-…, ver
//   e2e/sagas-ventanas.spec.ts): YA tiene `show_map=true` (verificado en BD) y
//   ya es el universo que sagas-ventanas.spec.ts usa para poner una ventana a
//   «Para leer a Isabel Allende» — mismo sujeto, mismo ancla («a partir de
//   Rayuela»), sembrados aquí por REST directo en vez de por la UI de
//   `WindowEditor` (ya cubierta por ese spec): lo que este test comprueba es
//   que esa ventana, una vez guardada, se pinta como arista en el mapa
//   derivado — no cómo se captura en el editor.
const ITINERARIOS_UNIVERSO_ID = "33d7bb93-da3d-4453-a6da-1722beff134d";
const RONDA_DE_NOCHE_ID = "35a3c64b-aff4-430e-b10d-ef8ec5a7341e";
const GUARDIAS_ID = "7f881b7a-8a1f-4762-896a-e18825d460f5";
const PIES_DE_BARRO_ID = "0b49bdac-135e-4b9c-825d-a6f1ce97ca54";

const SAGAS_V2_UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const ISABEL_ID = "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc";
const RAYUELA_ID = "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// ── Interruptor `show_map` (fase 3, Task 4-bis) ─────────────────────────────
async function fetchShowMap(sagaId: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${sagaId}&select=show_map`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(`fetchShowMap: ${res.status} ${res.statusText} — ${await res.text()}`);
  const rows = (await res.json()) as Array<{ show_map: boolean }>;
  if (!rows[0]) throw new Error("fetchShowMap: no se encontró la saga — ¿cambió el seed?");
  return rows[0].show_map;
}

async function patchShowMap(sagaId: string, showMap: boolean) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sagas?id=eq.${sagaId}`, {
    method: "PATCH",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ show_map: showMap }),
  });
  if (!res.ok) throw new Error(`patchShowMap: ${res.status} ${res.statusText} — ${await res.text()}`);
}

// ── Ventana de Isabel Allende (test 4) ──────────────────────────────────────
type ItemRow = { position: number | null; placement: string | null };

async function fetchIsabel(): Promise<ItemRow> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${ISABEL_ID}&select=position,placement`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`fetchIsabel: ${res.status} ${res.statusText} — ${await res.text()}`);
  const rows = (await res.json()) as ItemRow[];
  if (!rows[0]) throw new Error("fetchIsabel: no se encontró la fila en Era Uno — ¿cambió el seed?");
  return rows[0];
}

async function patchIsabel(patch: ItemRow) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${ISABEL_ID}`,
    {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`patchIsabel: ${res.status} ${res.statusText} — ${await res.text()}`);
}

async function insertIsabelWindow() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/saga_placement_windows`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      saga_id: ERA_UNO_ID,
      item_type: "book",
      item_id: ISABEL_ID,
      child_saga_id: null,
      after_item_type: "book",
      after_item_id: RAYUELA_ID,
      after_child_saga_id: null,
      before_item_type: null,
      before_item_id: null,
      before_child_saga_id: null,
    }),
  });
  if (!res.ok) throw new Error(`insertIsabelWindow: ${res.status} ${res.statusText} — ${await res.text()}`);
}

async function deleteIsabelWindow() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_placement_windows?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${ISABEL_ID}`,
    { method: "DELETE", headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`deleteIsabelWindow: ${res.status} ${res.statusText} — ${await res.text()}`);
}

// ── Itinerario generado (test 3) ────────────────────────────────────────────
async function fetchGeneratedRouteId(): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_routes?saga_id=eq.${ITINERARIOS_UNIVERSO_ID}&slug=eq.orden-curado&select=id`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`fetchGeneratedRouteId: ${res.status} ${res.statusText} — ${await res.text()}`);
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function fetchRouteEntries(routeId: string): Promise<Array<{ position: number; item_id: string }>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saga_route_entries?route_id=eq.${routeId}&select=position,item_id&order=position.asc`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`fetchRouteEntries: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res.json();
}

// `saga_route_entries` cuelga de `route_id` con `on delete cascade`
// (route-actions.ts, comentario de `generateRoute`): borrar la fila de
// `saga_routes` basta para dejar la semilla limpia.
async function deleteRoute(routeId: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/saga_routes?id=eq.${routeId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(`deleteRoute: ${res.status} ${res.statusText} — ${await res.text()}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1: una saga curada y SIN grafo dibujado a mano enseña mapa cuando el
// curador enciende `show_map`. Antes de esta fase, `hasGraph` exigía una fila
// en `saga_nodes` — este universo nunca tuvo una, así que hoy este es
// exactamente el caso que no enseñaba nada.
//
// Locator: `.react-flow__node` (clase del propio React Flow, no nuestra —
// mismo criterio que ya usaba sagas-v2-mapa.spec.ts contra el grafo viejo) +
// `[data-testid="rf__node-<id>"]`, que React Flow genera a partir del `id`
// que le pasamos (`saga-graph-view.tsx`: `id: n.id`), y que `deriveSagaMap`
// construye de forma determinista como `i:<tipo>:<uuid>` a partir de las
// claves de dominio (la misma clave que usan el borrador de secuencia y las
// ventanas) — no de un índice de render. Es más estable que el texto visible
// (título, que pasa por next-intl y por el layout) y más preciso que contar
// nodos a secas: identifica CUÁLES aparecen, no solo cuántos.
test("una saga curada y sin grafo dibujado a mano enseña mapa con el interruptor encendido", async ({
  page,
}) => {
  const showMapBefore = await fetchShowMap(ITINERARIOS_UNIVERSO_ID);
  try {
    await patchShowMap(ITINERARIOS_UNIVERSO_ID, true);
    await loginAsDevtest(page);
    await page.goto(`/saga/${ITINERARIOS_UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    // La ruta sintética «lectura» solo se ofrece con `hasGraph` (buildRouteList):
    // que esté en el selector ya demuestra que el interruptor encendido +
    // curación real bastan para que exista.
    await expect(page.getByRole("link", { name: "Orden de lectura", exact: true })).toBeVisible();

    // El mapa 2D: exactamente los 3 nodos de la curación (la obra directa +
    // las 2 de su bloque), ni uno más — un bloque nunca es un nodo (Task 1).
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    await expect(page.locator(`[data-testid="rf__node-i:book:${RONDA_DE_NOCHE_ID}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="rf__node-i:book:${GUARDIAS_ID}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="rf__node-i:book:${PIES_DE_BARRO_ID}"]`)).toBeVisible();
  } finally {
    await patchShowMap(ITINERARIOS_UNIVERSO_ID, showMapBefore);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 1b (el matiz que el brief añade sobre el plan original, "la garantía
// que más fácil se rompe"): con el interruptor APAGADO no hay mapa, aunque la
// saga tenga curación Y un itinerario curado a mano (`la-guardia`) — la
// pestaña Mapa sigue viva (por esa ruta no sintética), pero ni ofrece
// «lectura» ni pinta el grafo 2D para NINGUNA ruta, ni siquiera la curada:
// `resolveSagaGraph` aplica el interruptor en el ORIGEN (`get-saga-detail.ts`),
// así que `detail.graph` es `null` para toda la ficha, no solo para la ruta
// sintética.
// ─────────────────────────────────────────────────────────────────────────
test("con el interruptor apagado no hay mapa, ni para «lectura» ni para una ruta curada", async ({
  page,
}) => {
  const showMapBefore = await fetchShowMap(ITINERARIOS_UNIVERSO_ID);
  try {
    await patchShowMap(ITINERARIOS_UNIVERSO_ID, false);
    await loginAsDevtest(page);
    // `ruta=lectura` explícito: al no estar en `known` (buildRouteList la
    // excluye sin `hasGraph`), page.tsx degrada a la primera ruta real
    // (`la-guardia`) en vez de dar página en blanco — se comprueba esa
    // degradación de paso.
    await page.goto(`/saga/${ITINERARIOS_UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    await expect(page.getByRole("link", { name: "Orden de lectura", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  } finally {
    await patchShowMap(ITINERARIOS_UNIVERSO_ID, showMapBefore);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: el generador (`generateRoute`, Task 6) construye desde el botón
// real «Generar desde la curación» un itinerario que se puede recorrer de
// verdad — no solo que exista una fila en `saga_routes`. La comprobación
// fuerte es contra BD (posiciones 1..N sin huecos, con los `item_id` que la
// curación real produce), y la comprobación de "recorrible" es contra la UI:
// los 3 pasos salen como enlaces navegables en `/saga/[id]?ruta=orden-curado`.
//
// No toca `show_map`: RouteView (la ruta curada) no depende del interruptor
// para pintar su LISTA de pasos — solo el grafo 2D resaltado encima depende
// de él (ver test 1b) — así que este test es independiente del anterior.
// ─────────────────────────────────────────────────────────────────────────
test("el generador crea un itinerario recorrible a partir de la curación", async ({ page }) => {
  // Guarda defensiva: si una pasada anterior no limpió (p. ej. el proceso
  // murió a mitad), no se genera un segundo "Orden curado" que chocaría con
  // el slug ya ocupado (itineraryGenerateSlugTaken) — se limpia antes de
  // empezar en vez de fallar con un mensaje que no tiene que ver con lo que
  // este test comprueba.
  const stale = await fetchGeneratedRouteId();
  if (stale) await deleteRoute(stale);

  let routeId: string | null = null;
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ITINERARIOS_UNIVERSO_ID}/editar`);

    await page.getByRole("button", { name: "Generar desde la curación", exact: true }).click();
    // `router.refresh()` tras el éxito (generate-route-button.tsx): la lista
    // de arriba se repinta con el nuevo itinerario, sin navegación completa.
    await expect(page.getByRole("link", { name: "Orden curado", exact: true })).toBeVisible();

    routeId = await fetchGeneratedRouteId();
    expect(routeId).not.toBeNull();

    // La comprobación de verdad: 3 pasos, posiciones 1..3 sin huecos, en el
    // MISMO orden que createCuratedOrder — el bloque La Guardia primero, por
    // su propio `position` (¡Guardias! ¡Guardias!, Pies de barro), y el
    // directo (Ronda de noche, único miembro directo) AL FINAL. Arreglo de la
    // revisión final de rama (punto 1): hasta ese arreglo el directo iba
    // primero, un orden que discrepaba del mapa y de la ficha (que siempre
    // pintan los directos al final, en el grupo «Nexo») — este test fijaba
    // ese orden divergente como si fuera el correcto.
    const entries = await fetchRouteEntries(routeId!);
    expect(entries.map((e) => e.item_id)).toEqual([GUARDIAS_ID, PIES_DE_BARRO_ID, RONDA_DE_NOCHE_ID]);
    expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);

    // Recorrible: la ficha, en la ruta generada, ofrece los 3 pasos como
    // enlaces a sus obras — no una pantalla vacía ni un itinerario fantasma.
    await page.goto(`/saga/${ITINERARIOS_UNIVERSO_ID}?tab=mapa&ruta=orden-curado`);
    await expect(page.getByRole("heading", { name: "Orden curado" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ronda de noche/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /¡Guardias! ¡Guardias!/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pies de barro/ })).toBeVisible();
  } finally {
    const id = routeId ?? (await fetchGeneratedRouteId());
    if (id) await deleteRoute(id);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3: una entrada `libre` con ventana produce la arista que cruza. Mismo
// sujeto y misma ancla que sagas-ventanas.spec.ts (Isabel Allende, `libre`,
// «a partir de Rayuela»), sembrados aquí por REST directo — este test no
// vuelve a probar `WindowEditor` (ya cubierto ahí), sino que la ventana
// GUARDADA se dibuja como arista en el mapa derivado (`deriveSagaMap`, regla
// 9 del plan: `after` → arista entrante `requisito`).
//
// Locator, y por qué NO es el del grafo 2D (el brief pide mirar los dos antes
// de decidir): se probó primero `[data-testid="rf__edge-<id>"]` — React Flow
// pone ese testid al `<g>` de cada arista a partir del `id` que le pasamos, y
// `deriveSagaMap` lo construye de forma determinista desde las claves de
// dominio (`window:${after}->${subject}`), así que en teoría era el locator
// más estable. En la práctica falló SIEMPRE (dos pasadas, con reintento):
// depurado contra el propio Chromium de Playwright, el `<g>` existe con el
// `data-id`/`aria-label` correctos y su `<path>` trae una `d` válida
// (`M78,58 C309,58 309,58 540,58`), pero `getBoundingClientRect()` da
// `height: 0` — Rayuela e Isabel caen en la MISMA fila del mapa (mismo bloque,
// Era Uno), así que la arista es una línea perfectamente horizontal, y el
// bounding box GEOMÉTRICO de una línea así no tiene alto aunque el trazo
// (`stroke-width: 3`) sí se vea. `toBeVisible()` exige área > 0, así que
// nunca pasaría para NINGUNA arista horizontal — no es un bug del grafo, es
// una cuenta de `getBoundingClientRect()` sobre SVG que no ve el trazo. Y es
// el caso NORMAL aquí: dos anclas de la misma ventana casi siempre viven en
// el mismo bloque.
//
// El timeline móvil (`reading-timeline.tsx`) no tiene ese problema: es HTML
// de servidor, sin geometría de lienzo.
//
// Actualizado en la fase 1 del timeline con estados (2026-07-28): antes esto
// se comprobaba por el chip «Requisito» de la RAMA, porque un sujeto `libre`
// no tenía `orderNo` y acababa colgando de su conexión más temprana. Ahora ese
// sujeto es una fila `window` colocada junto a su ancla, y la fila NOMBRA el
// ancla («después de Rayuela»). La prueba es más fuerte, no más débil: el chip
// solo decía «hay una arista requisito»; el texto dice ADEMÁS con quién, que
// es justo lo que la arista de ventana codifica.
// ─────────────────────────────────────────────────────────────────────────
test("una entrada libre con ventana produce la arista que cruza en el mapa", async ({ page }) => {
  const isabelBefore = await fetchIsabel();
  const showMapBefore = await fetchShowMap(SAGAS_V2_UNIVERSO_ID);
  try {
    // Semilla: Isabel Allende pasa a `libre` con una ventana de una sola
    // ancla («a partir de Rayuela»), igual que sagas-ventanas.spec.ts
    // (Test 2), sin pasar por el editor — aísla la derivación del mapa de la
    // UI de captura de la ventana.
    await patchIsabel({ position: null, placement: "libre" });
    await insertIsabelWindow();
    // El universo [QA Sagas v2] ya tiene `show_map=true` en dev, pero no hay
    // que confiar en un estado incidental: se fija explícitamente y se
    // restaura al valor real leído, no a `true` a ciegas.
    await patchShowMap(SAGAS_V2_UNIVERSO_ID, true);

    // Viewport móvil, mismo que ya usaba sagas-v2-mapa.spec.ts para esta misma
    // pieza. Desde la fase 1 el timeline se monta también al pie del grafo en
    // PC, así que las dos cáscaras están en el DOM y hay que escopar a la
    // VISIBLE (regla de los dos árboles) o el locator encuentra el doble.
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${SAGAS_V2_UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    // La fila de ventana que contiene el enlace a la ficha de Isabel (href
    // estable, de itemHref), y que además nombra el ancla. Que diga «Rayuela»
    // es lo que prueba la arista: sale de `resolveEntry` en derive-map.ts, la
    // MISMA resolución que dibuja la arista del grafo.
    const isabelWindow = page
      .locator('[data-testid="timeline-window"]:visible')
      .filter({ has: page.locator(`a[href="/libro/${ISABEL_ID}"]`) });
    await expect(isabelWindow).toBeVisible();
    await expect(isabelWindow).toContainText("después de Rayuela");
  } finally {
    await patchIsabel(isabelBefore);
    await deleteIsabelWindow();
    await patchShowMap(SAGAS_V2_UNIVERSO_ID, showMapBefore);
  }
});
