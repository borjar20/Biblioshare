import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

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
// Mudado al atlas (Task 11 del atlas, 2026-10-28). El atlas ya no mira
// `show_map` (spec del atlas §3 y §9: abre para toda saga con obras), así que el
// test 1 deja de encender el interruptor y el 1b («con el interruptor apagado no
// hay mapa») se borró: afirma justo lo contrario de lo que el atlas promete. Su
// sustituto es el test 9 de sagas-atlas.spec.ts. Los recuentos de
// `.react-flow__node` pasan a `[data-work-key]` del plano, y la fila de ventana
// del timeline a la entrada de «Ver como lista». El párrafo de abajo sobre
// `show_map` es historia de la fase 3.
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
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
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

/** Espera a que el atlas haya pintado su primer layout (saga-atlas.tsx, `data-ready`). */
async function atlasReady(page: Page) {
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
}
const obra = (page: Page, itemId: string) => page.locator(`[data-work-key="i:book:${itemId}"]`);

// ─────────────────────────────────────────────────────────────────────────
// Test 1: una saga curada y SIN grafo dibujado a mano enseña mapa. Antes de la
// fase 3, `hasGraph` exigía una fila en `saga_nodes` — este universo nunca tuvo
// una. Con el atlas tampoco depende ya de `show_map`, que en este universo está
// apagado (lo comprueba sagas-atlas.spec.ts, test 9).
//
// Locator: `[data-work-key="i:<tipo>:<uuid>"]`, la clave de dominio que
// `deriveSagaMap` construye de forma determinista (la misma que usan el
// borrador de secuencia y las ventanas) — no un índice de render. Identifica
// CUÁLES aparecen, no solo cuántos.
// ─────────────────────────────────────────────────────────────────────────
test("una saga curada y sin grafo dibujado a mano enseña sus obras en el atlas", async ({ page }) => {
  await loginAsDevtest(page);
  await page.goto(`/saga/${ITINERARIOS_UNIVERSO_ID}/mapa?ruta=lectura`);
  await atlasReady(page);

  // La ruta sintética «lectura» se ofrece sin `hasGraph` (shelfRoutesFor): que
  // esté en la hoja de itinerarios, y marcada, demuestra que la curación real basta.
  await page.getByRole("button", { name: /^Itinerario: / }).click();
  await expect(
    page.getByRole("dialog", { name: "Elige itinerario" }).getByRole("radio", { name: "Orden de lectura", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Escape");

  // Exactamente las 3 obras de la curación (la directa + las 2 de su bloque),
  // ni una más — un bloque nunca es una obra (Task 1).
  await expect(page.locator("[data-work-key]")).toHaveCount(3);
  await expect(obra(page, RONDA_DE_NOCHE_ID)).toHaveCount(1);
  await expect(obra(page, GUARDIAS_ID)).toHaveCount(1);
  await expect(obra(page, PIES_DE_BARRO_ID)).toHaveCount(1);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: el generador (`generateRoute`, Task 6) construye desde el botón
// real «Generar desde la curación» un itinerario que se puede recorrer de
// verdad — no solo que exista una fila en `saga_routes`. La comprobación
// fuerte es contra BD (posiciones 1..N sin huecos, con los `item_id` que la
// curación real produce), y la comprobación de "recorrible" es contra la UI:
// los 3 pasos salen como enlaces navegables en `/saga/[id]?ruta=orden-curado`.
//
// En el atlas, «recorrible» se lee en el plano: cada obra lleva su número de
// paso (`data-step`), en el orden de la BD.
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

    // Recorrible: el atlas, en la ruta generada, numera las 3 obras como pasos
    // 1..3 en ese mismo orden — no una pantalla vacía ni un itinerario fantasma.
    await page.goto(`/saga/${ITINERARIOS_UNIVERSO_ID}/mapa?ruta=orden-curado`);
    await atlasReady(page);
    await expect(page.getByRole("button", { name: "Itinerario: Orden curado" })).toBeVisible();
    await expect(obra(page, GUARDIAS_ID)).toHaveAttribute("data-step", "1");
    await expect(obra(page, PIES_DE_BARRO_ID)).toHaveAttribute("data-step", "2");
    await expect(obra(page, RONDA_DE_NOCHE_ID)).toHaveAttribute("data-step", "3");
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
// GUARDADA llega al mapa derivado (`deriveSagaMap`, regla 9 del plan: `after`
// → arista entrante `requisito`).
//
// Locator: no el trazo SVG del plano (la geometría de una línea no dice con
// quién conecta, y su caja puede tener alto 0 cuando es horizontal: le pasó al
// grafo viejo), sino la entrada de la obra en «Ver como lista», que NOMBRA el
// ancla («después de Rayuela»). Sale de `resolveEntry` en derive-map.ts, la
// MISMA resolución que dibuja la arista.
// ─────────────────────────────────────────────────────────────────────────
test("una entrada libre con ventana nombra su ancla en el atlas", async ({ page }) => {
  const isabelBefore = await fetchIsabel();
  try {
    // Semilla: Isabel Allende pasa a `libre` con una ventana de una sola
    // ancla («a partir de Rayuela»), igual que sagas-ventanas.spec.ts
    // (Test 2), sin pasar por el editor — aísla la derivación del mapa de la
    // UI de captura de la ventana.
    await patchIsabel({ position: null, placement: "libre" });
    await insertIsabelWindow();

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${SAGAS_V2_UNIVERSO_ID}/mapa?ruta=lectura`);
    await atlasReady(page);
    await page.getByRole("button", { name: "Ver como lista" }).click();

    // La entrada que contiene el enlace a la ficha de Isabel (href estable, de
    // itemHref), y que además nombra el ancla.
    const isabel = page
      .getByRole("list", { name: /^Obras de / })
      .getByRole("listitem")
      .filter({ has: page.locator(`a[href="/libro/${ISABEL_ID}"]`) });
    await expect(isabel).toBeVisible();
    await expect(isabel).toContainText("Encaja después de Rayuela");
  } finally {
    await patchIsabel(isabelBefore);
    await deleteIsabelWindow();
  }
});
