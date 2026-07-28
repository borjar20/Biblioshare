import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 6: los cuatro estados dibujados en el grafo 2D. Lo que cubre y
// las unitarias no pueden:
//
//  · que la cápsula y el marco llegan al LIENZO. `map-overlays.test.ts` prueba
//    la geometría; que se pinten depende del `ViewportPortal`, del z-index y de
//    que la vista los monte, y eso no lo ve ninguna unitaria.
//  · que los adornos NO son nodos. Dos e2e (`sagas-v2-mapa`,
//    `sagas-mapa-derivado`) cuentan las obras del mapa con `.react-flow__node`;
//    si un adorno entrara en ese recuento, esos tests seguirían pasando pero
//    protegiendo otra cosa. Aquí se afirma el recuento a propósito.
//  · que la lente de rol ATENÚA y no filtra: los nodos y las aristas siguen
//    siendo los mismos. Quitar nodos deja aristas huérfanas y parte la cadena
//    (issue #238).
//  · que la ficha PÚBLICA lo enseña entero. No hay `login` en este spec a
//    propósito: es el riesgo 5 de la spec —construirlo mirando solo la vista
//    con sesión— y aquí sale gratis comprobarlo.
//
// Mismo patrón de semilla que `sagas-roles.spec.ts` y
// `sagas-ventana-motivo-track.spec.ts`: `fetch` nativo (no el fixture
// `request`, que muere con el contexto y dejaría la semilla desviada), `res.ok`
// comprobado en cada escritura (#180/#182), y la línea base MEDIDA antes de
// tocar nada, no supuesta — dar por buena una puesta a mano fue lo que en la
// fase 4 dejó la semilla desviada.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // el único universo QA con show_map

// Las tres obras de Era Uno que usa el spec, y por qué cada una:
//  · RAYUELA se manda a `libre` y se le cuelga una ventana: es el ÚNICO sujeto
//    posible que no está duplicado en el mapa (el seed tiene «Para leer a
//    Isabel Allende» en Era Uno Y como miembro directo del Universo).
//  · RARO comparte el hueco 2 con «Libro sin valorar»: ese empate ES el tándem,
//    y por tanto la cápsula. Lleva además el rol, así que la etiqueta tiene que
//    verse DENTRO de la cápsula — la combinación que más fácil se rompe.
//  · ISABEL es el ancla `antes de`.
const RAYUELA = { id: "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a", title: "Rayuela" };
const RARO = { id: "d6d61eab-6ef4-4691-a8f0-b89068508fd4", title: "Libro raro sin match" };
const ISABEL = { id: "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc", title: "Para leer a Isabel Allende" };

// `ruta=lectura` fija la columna a la curación: sin ella la ruta activa sería la
// que el lector tenga adoptada, y el test dependería de un estado que no
// controla.
const MAPA = `/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`;

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

type ItemRow = { item_id: string; position: number | null; placement: string | null; role: string | null };

/** La línea base de Era Uno entera, medida. No basta con la fila que el test
 *  toca: mandar una obra a `libre` cambia la forma del bloque. */
let baseline: ItemRow[] = [];

const nodo = (page: Page, itemId: string) => page.locator(`[data-testid="rf__node-i:book:${itemId}"]`);
const capsula = (page: Page) => page.getByTestId("graph-tandem-capsule");
const marco = (page: Page) => page.getByTestId("graph-window-frame");

test.beforeAll(async () => {
  baseline = (await (
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement,role`)
  ).json()) as ItemRow[];

  for (const obra of [RAYUELA, RARO, ISABEL]) {
    if (!baseline.some((f) => f.item_id === obra.id)) {
      throw new Error(`beforeAll: ¿cambió el seed de Era Uno? falta ${obra.title}`);
    }
  }

  // 1) El tándem NO existe en la línea base. `restoreQaSeed` (globalSetup de la
  //    fase 0, issue #215) deja Era Uno con las cuatro obras en huecos
  //    distintos —1, 2, 3, 4—, así que el empate hay que construirlo: «Libro
  //    raro sin match» baja al hueco 2, que es el de «Libro sin valorar».
  //    Mismo gesto que `sagas-tandem-metadatos.spec.ts`.
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RARO.id}`, {
    method: "PATCH",
    body: JSON.stringify({ position: 2, placement: "fijo" }),
  });

  // 2) Rayuela sale de la cadena y gana una ventana con sus dos anclas.
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RAYUELA.id}`, {
    method: "PATCH",
    body: JSON.stringify({ position: null, placement: "libre" }),
  });
  await api("saga_placement_windows", {
    method: "POST",
    body: JSON.stringify({
      saga_id: ERA_UNO_ID,
      item_type: "book",
      item_id: RAYUELA.id,
      after_item_type: "book",
      after_item_id: RARO.id,
      before_item_type: "book",
      before_item_id: ISABEL.id,
      motivo: "contexto",
    }),
  });

  // 3) El hueco 2, ya empatado, declara su modo. La cápsula existiría igual sin esta fila —diciendo «sin
  //    declarar»—; con ella se comprueba además que el modo curado llega.
  await api("saga_tandems", {
    method: "POST",
    body: JSON.stringify({ saga_id: ERA_UNO_ID, position: 2, modo: "simultaneo", nota: null }),
  });

  // 4) Un rol dentro del tándem.
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RARO.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "relato" }),
  });
});

test.afterAll(async () => {
  await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
  await api(`saga_tandems?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
  for (const r of baseline) {
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${r.item_id}`, {
      method: "PATCH",
      body: JSON.stringify({ position: r.position, placement: r.placement, role: r.role }),
    });
  }
});

test("la cápsula envuelve el tándem, dice su modo y no cuenta como nodo", async ({ page }) => {
  await page.goto(MAPA);
  await expect(nodo(page, RARO.id)).toBeVisible();

  await expect(capsula(page)).toHaveCount(1);
  await expect(capsula(page)).toContainText("A la vez");

  // Envuelve a sus DOS miembros: más alta que el nodo que contiene. Se compara
  // contra el nodo real y no contra un número fijo porque el lienzo aplica
  // `fitView`, así que las dos medidas están escaladas por el mismo zoom y solo
  // la proporción es estable.
  const cajaCapsula = (await capsula(page).boundingBox())!;
  const cajaNodo = (await nodo(page, RARO.id).boundingBox())!;
  expect(cajaCapsula.height).toBeGreaterThan(cajaNodo.height * 2);

  // Los adornos NO son nodos. El Universo QA tiene 7 obras (Era Uno 4 + Era Dos
  // 2 + 1 directa suelta), el mismo número que afirma `sagas-v2-mapa.spec.ts`:
  // si la cápsula se colara en este recuento, ese test pasaría a proteger otra
  // cosa sin que nadie se enterara.
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
});

test("el sujeto de la ventana lleva marco, con sus dos anclas nombradas", async ({ page }) => {
  await page.goto(MAPA);
  await expect(marco(page)).toHaveCount(1);
  await expect(marco(page)).toContainText("Ventana recomendada");
  // Los dos títulos NO van en el rótulo visible —serían cuatro veces el ancho
  // del marco, y las dos aristas ya dibujan el tramo—, pero sí tienen que
  // llegar: viven en el `title` de la píldora.
  await expect(marco(page).locator("span[title]")).toHaveAttribute(
    "title",
    new RegExp(`después de ${RARO.title}.*antes de ${ISABEL.title}`),
  );
});

test("el rol curado se lee bajo el nodo, también dentro del tándem", async ({ page }) => {
  await page.goto(MAPA);
  const etiqueta = nodo(page, RARO.id).getByTestId("graph-node-tag");
  await expect(etiqueta).toContainText("Relato");
  // Y una obra sin rol ni nada que decir no pinta etiqueta: 361 de las 367
  // filas de producción son ese caso, y una tira vacía bajo cada nodo sería el
  // ruido que la fase evita.
  await expect(nodo(page, ISABEL.id).getByTestId("graph-node-tag")).toHaveCount(0);
});

test("la lente de rol atenúa, no borra: los nodos y las aristas siguen ahí", async ({ page }) => {
  await page.goto(MAPA);
  await expect(nodo(page, RARO.id)).toBeVisible();
  const nodosAntes = await page.locator(".react-flow__node").count();
  const aristasAntes = await page.locator(".react-flow__edge").count();
  expect(aristasAntes).toBeGreaterThan(0);

  await page.goto(`${MAPA}&rol=relato`);
  await expect(nodo(page, RARO.id)).toBeVisible();

  expect(await page.locator(".react-flow__node").count()).toBe(nodosAntes);
  expect(await page.locator(".react-flow__edge").count()).toBe(aristasAntes);

  // Lo que sí cambia: la obra que no es de ese rol se atenúa.
  await expect(nodo(page, ISABEL.id).locator("> div").first()).toHaveClass(/opacity-30/);
  await expect(nodo(page, RARO.id).locator("> div").first()).not.toHaveClass(/opacity-30/);
});

test("la leyenda nombra las dos formas nuevas, y solo cuando el mapa las dibuja", async ({ page }) => {
  await page.goto(MAPA);
  // `visible=true` no es adorno: la leyenda se monta DOS veces —una por
  // breakpoint, la regla de los dos árboles de este proyecto— y en Desktop
  // Chrome la primera del DOM es la del móvil, que está oculta.
  await expect(page.getByText("Se leen en tándem").locator("visible=true")).toBeVisible();
  await expect(page.getByText("Se leen en tándem").locator("visible=true")).toHaveCount(1);
});
