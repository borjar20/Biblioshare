import { expect, test } from "@playwright/test";

// UUIDs del seed QA de dev (ver `.superpowers/sdd/task-6-seed-report.md`,
// fase 2, y `task-7-seed-report.md` de fase 1). El grafo bajo el Universo
// tiene 10 nodos / 7 aristas: columna Era Uno (1-3) + columna Era Dos (4-5) +
// 1 spin-off (medallón, doble membresía de "Para leer a Isabel Allende") +
// 1 nexo puro (Trilogía) + 3 nodos-saga anidados (Era Dos, Nieta, Era Vacía).
const UNIVERSE_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";

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
  // Infonote dorada en Info
  await expect(page.getByText("Orden de lectura disponible.")).toBeVisible();

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
  // El puente del nexo
  await expect(page.getByText("Nexo entre tramos", { exact: false })).toBeVisible();
  // La rama del spin-off (doble membresía) colgando del nodo Nº1
  await expect(page.getByText("Spin-off · opcional")).toBeVisible();
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
  // React Flow montado con nodos custom (columna + spin-off + nexo + 3 nodos-saga)
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  // La tarjeta del nodo-saga
  await expect(page.locator(".react-flow__node", { hasText: "[QA Sagas v2] Era Dos" })).toBeVisible();
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
