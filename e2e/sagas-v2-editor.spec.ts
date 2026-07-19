import { expect, test, type Page } from "@playwright/test";

// Flujo colaborador del editor del grafo (Sagas v2 fase 3, Task 6). Universo
// QA compartido con `sagas-v2.spec.ts`/`sagas-v2-mapa.spec.ts`
// (`.superpowers/sdd/task-7-seed-report.md`): 10 nodos / 7 aristas.
//
// Usuario dedicado `borjar20+bibliosharecollab@gmail.com`, promovido a
// `collaborator` en `profiles` (BD dev) — ver
// `.superpowers/sdd/task-6-tests-report.md`. NO se usa TEST_USER_* (esa
// cuenta es `bibliosharedev@gmail.com`, que en dev tiene actualmente
// `role='admin'`, así que no sirve para el caso "sin rol").
const UNIVERSE_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const COLLAB_EMAIL = "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = "CollabTest1234pass";

// Calcado del helper `login` de `e2e/sagas-v2.spec.ts` (mismos selectores:
// `input[name="email"]`, `input[name="password"]`, `button[type="submit"]`),
// parametrizado para el usuario colaborador.
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1: sin sesión (anónimo) — nunca el devtest normal, que en dev es
// admin y por tanto SÍ vería el botón (ver informe QA, Hallazgo A). El gate
// de `/mapa/editar` sin usuario es `redirect("/login")`
// (`src/app/saga/[id]/mapa/editar/page.tsx:26`), no la ficha.
// ─────────────────────────────────────────────────────────────────────────
test("anónimo: no ve «Editar grafo» y /mapa/editar redirige a /login", async ({ page }) => {
  await page.goto(`/saga/${UNIVERSE_ID}?tab=mapa`);
  await expect(page.getByRole("link", { name: /Editar grafo/ })).toHaveCount(0);
  await page.goto(`/saga/${UNIVERSE_ID}/mapa/editar`);
  await expect(page).toHaveURL(/\/login/);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: colaborador — arrastrar un nodo (con page.mouse, no drag HTML5:
// React Flow no reacciona a dragTo/dragstart-drop, solo a pointer/mouse
// events reales) y guardar persiste la posición. Al final del test se
// mueve el nodo de vuelta ~mismo delta inverso y se guarda otra vez, para
// no dejar el seed QA con deriva.
// ─────────────────────────────────────────────────────────────────────────
test("colaborador: mover un nodo y guardar persiste la posición", async ({ page }) => {
  await loginAs(page, COLLAB_EMAIL, COLLAB_PASSWORD);
  await page.goto(`/saga/${UNIVERSE_ID}/mapa/editar`);
  await expect(page.locator(".react-flow__node")).toHaveCount(10);

  const node = page.locator(".react-flow__node").first();
  const before = await node.boundingBox();
  await node.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x + 140, before!.y + 90, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText(/cambio(s)? sin guardar/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar grafo" }).click();
  await page.waitForURL(new RegExp(`/saga/${UNIVERSE_ID}`), { timeout: 20_000 });

  // Reabrir el editor: la posición guardada difiere de la original.
  await page.goto(`/saga/${UNIVERSE_ID}/mapa/editar`);
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  const afterNode = page.locator(".react-flow__node").first();
  const after = await afterNode.boundingBox();
  expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeGreaterThan(40);

  // Revertir: mismo delta en sentido inverso + guardar, para dejar el grafo
  // QA como estaba (una deriva de pocos píxeles es aceptable).
  await afterNode.hover();
  await page.mouse.down();
  await page.mouse.move(after!.x - 140, after!.y - 90, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText(/cambio(s)? sin guardar/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar grafo" }).click();
  await page.waitForURL(new RegExp(`/saga/${UNIVERSE_ID}`), { timeout: 20_000 });
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3: quitar el nexo («Trilogía») del BORRADOR (sin guardar) y
// descartar. Alcance reducido a propósito respecto al brief original: el
// nexo pierde su arista de requisito al quitarse del grafo, así que
// restaurarlo desde la UI no deja el grafo QA exactamente igual (7 aristas
// se convertirían en 6). En vez de guardar+restaurar, el test verifica
// quitar → contar 9 → Descartar → contar 10, que es un ciclo no
// destructivo (no toca `saga_nodes`/`saga_edges` en BD) y ya prueba que
// «Quitar del grafo» es una operación de borrador reversible. El
// invariante de producto (quitar del grafo NO borra la membresía en
// `saga_items`) quedó verificado en la QA de navegador — ver
// `.superpowers/sdd/task-6-qa-report.md`, paso 7 ("Quitar del grafo" +
// guardar: el título sigue en Info bajo su subsaga).
// ─────────────────────────────────────────────────────────────────────────
test("colaborador: quitar el nexo del grafo (borrador) y descartar restaura el conteo", async ({ page }) => {
  await loginAs(page, COLLAB_EMAIL, COLLAB_PASSWORD);
  await page.goto(`/saga/${UNIVERSE_ID}/mapa/editar`);
  await expect(page.locator(".react-flow__node")).toHaveCount(10);

  await page.locator(".react-flow__node", { hasText: "Trilogía" }).click();
  await page.getByRole("button", { name: "Quitar del grafo" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(9);

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
});
