import { expect, test } from "@playwright/test";

// UUIDs del seed QA de dev (ver `.superpowers/sdd/task-6-seed-report.md`,
// fase 2, y `task-7-seed-report.md` de fase 1).
//
// Fase 3 (Task 7, Step 1-bis — brief en `.superpowers/sdd/task-7-brief.md`):
// este spec es PREEXISTENTE (guardaba el grafo dibujado a mano en
// `saga_nodes`/`saga_edges`) y la fase lo dejó desactualizado en dos frentes,
// no en lo que protegía:
//
//   1) el mapa ya NO se lee de esas tablas — se DERIVA de lo curado
//      (`deriveSagaMap`, src/lib/sagas/derive-map.ts). Un nodo es SIEMPRE una
//      obra individual, nunca un bloque/subsaga (los "3 nodos-saga anidados"
//      que este comentario describía ya no existen). Verificado contra BD dev
//      (2026-07-27): el Universo tiene Era Uno (4 obras, position 1-4,
//      encadenadas), Era Dos (2 obras, position 4-5, encadenadas) y 1 obra
//      directa del Universo sin clasificar (position null, "suelta",
//      "Trilogía La casa de los espíritus") = 7 nodos en total, ni uno más
//      (un bloque nunca es un nodo, Task 1).
//   2) el aviso «Orden de lectura disponible. Un moderador configuró el
//      recorrido» se retiró (fase 3, Task 4-bis): el mapa ahora depende del
//      interruptor `show_map` del curador, no de un aviso fijo.
//
// El Universo ya tiene `show_map=true` en dev (verificado por SQL) — mismo
// universo que ya reutiliza `e2e/sagas-mapa-derivado.spec.ts` (test 4) sin
// tocar el interruptor, así que este spec tampoco necesita encenderlo.
const UNIVERSE_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
// "La casa de los espíritus" (segunda edición del seed, position 5 en Era
// Dos — hay dos libros con el mismo título en el seed, así que el chequeo de
// nodo usa el id, no el texto). Confirma que el mapa dibuja la fila de Era
// Dos, no solo la de Era Uno.
const ERA_DOS_ITEM_ID = "7a88b65f-d757-4cc3-a7b6-ddf2417855ce";

test("la ficha del universo muestra la pestaña Mapa y el timeline derivado del grafo", async ({ page }) => {
  // SagaMapTab bifurca por breakpoint `lg` (src/components/saga/saga-map-tab.tsx):
  // el CTA "Grafo de lectura" y el ReadingTimeline solo se montan visibles
  // dentro del `<div className="lg:hidden">` (en PC el grafo va embebido sin
  // CTA/timeline, confirmado en el informe de navegador, paso 5). Este test
  // verifica precisamente esas piezas móviles, así que fija un viewport móvil.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/saga/${UNIVERSE_ID}`);
  const mapTab = page.getByRole("button", { name: /Mapa de lectura/ });
  await expect(mapTab).toBeVisible();
  // La infonote dorada en Info («Orden de lectura disponible. Un moderador
  // configuró el recorrido») se retiró en la fase 3 (Task 4-bis): la pestaña
  // Mapa es ya la única señal de que hay un recorrido que enseñar, así que no
  // hay nada equivalente que comprobar aquí.

  await mapTab.click();
  await expect(page).toHaveURL(new RegExp(`tab=mapa`));
  // Toggle + leyenda + CTA. GraphLegend se monta DOS veces en el DOM (la
  // versión móvil `lg:hidden` y la de escritorio `hidden lg:block`, ambas
  // presentes a la vez — solo una visible por CSS), así que filtramos por el
  // span visible en vez de usar un getByText a secas (que rompería en modo
  // estricto con 2 matches).
  await expect(page.getByRole("link", { name: /Publicación/ })).toBeVisible();
  await expect(page.locator("span:visible", { hasText: "Orden principal" })).toBeVisible();
  await expect(page.getByText("Grafo de lectura")).toBeVisible();
  // Secciones del timeline (los grupos del seed)
  await expect(page.getByRole("heading", { name: "[QA Sagas v2] Era Uno" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "[QA Sagas v2] Era Dos" })).toBeVisible();
  // Issue #167: "Nexo entre tramos" y "Spin-off · opcional" se derogaron — se
  // derivaban de heurísticas que etiquetaban mal (una arista `principal` salía
  // como spin-off). El puente y la rama siguen pintándose; lo que ya no se
  // afirma es un rol que nadie curó. El seed no asigna roles, así que aquí se
  // comprueba la ausencia: si vuelve a aparecer, alguien reintrodujo la
  // heurística.
  await expect(page.getByText("Nexo entre tramos")).toHaveCount(0);
  await expect(page.getByText("Spin-off · opcional")).toHaveCount(0);
});

test("el toggle Publicación muestra la lista lineal por año", async ({ page }) => {
  await page.goto(`/saga/${UNIVERSE_ID}?tab=mapa&orden=publicacion`);
  // La lista numerada sustituye al timeline. `exact: true` es necesario: sin
  // él, "01" hace substring-match también dentro del año "2019" del segundo
  // ítem (mismo dígito "01" en medio de la cadena) y el locator sale en modo
  // estricto con 2 matches.
  await expect(page.getByText("01", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "[QA Sagas v2] Era Uno" })).toHaveCount(0);
});

test("el mapa a pantalla completa renderiza el grafo y navega al tocar un nodo", async ({ page }) => {
  await page.goto(`/saga/${UNIVERSE_ID}/mapa`);
  // React Flow montado con nodos custom: cada nodo es una obra (Task 1, fase
  // 3) — Era Uno (4) + Era Dos (2) + 1 obra directa suelta (1) = 7. Ya no hay
  // nodo-bloque ("nodo-saga") que contar aparte.
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  // Un nodo de la fila de Era Dos, no solo la de Era Uno (mismo criterio de
  // testid que `e2e/sagas-mapa-derivado.spec.ts`: React Flow lo genera desde
  // el `id` determinista de `deriveSagaMap`, `i:<tipo>:<uuid>`).
  await expect(page.locator(`[data-testid="rf__node-i:book:${ERA_DOS_ITEM_ID}"]`)).toBeVisible();
  // Tap en el primer nodo navega a la ficha del ítem
  await page.locator(".react-flow__node").first().click();
  await expect(page).toHaveURL(/\/(libro|pelicula|serie|saga)\//);
});

test("una saga sin grafo no tiene pestaña Mapa y /mapa redirige a su ficha", async ({ page }) => {
  await page.goto(`/saga/${ERA_UNO_ID}`);
  await expect(page.getByRole("button", { name: /Mapa de lectura/ })).toHaveCount(0);
  await page.goto(`/saga/${ERA_UNO_ID}/mapa`);
  await expect(page).toHaveURL(new RegExp(`/saga/${ERA_UNO_ID}$`));
});
