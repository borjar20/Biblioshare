import { expect, test, type Locator, type Page } from "@playwright/test";

// Flujo colaborador del editor del grafo (Sagas v2 fase 3, Task 6). Universo
// QA compartido con `sagas-v2.spec.ts`/`sagas-v2-mapa.spec.ts`
// (seed QA de fase 2, `.superpowers/sdd/task-6-collab-report.md`): 10 nodos /
// 7 aristas.
//
// Usuario dedicado `borjar20+bibliosharecollab@gmail.com`, promovido a
// `collaborator` en `profiles` (BD dev) — ver
// `.superpowers/sdd/task-6-collab-report.md`. NO se usa TEST_USER_* (esa
// cuenta es `bibliosharedev@gmail.com`, que en dev tiene actualmente
// `role='admin'`, así que no sirve para el caso "sin rol"). Credenciales vía
// env con fallback al literal (mismo patrón que fase 1).
const UNIVERSE_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";

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

// Coords LÓGICAS del nodo (pre-zoom): `.react-flow__node` lleva su posición
// de flujo en `style.transform: translate(Xpx, Ypx)`, independiente del
// `fitView` (que solo afecta a `.react-flow__viewport`). Comparar por aquí
// en vez de por `boundingBox()` evita que un `fitView` distinto entre dos
// mounts (p.ej. tras un retry a mitad de drag) se confunda con un desplazamiento
// real del nodo.
async function nodeFlowPos(page: Page, nth = 0) {
  return page.locator(".react-flow__node").nth(nth).evaluate((el) => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec((el as HTMLElement).style.transform ?? "");
    return { x: m ? Number(m[1]) : 0, y: m ? Number(m[2]) : 0 };
  });
}

// Revierte un nodo por un delta EXACTO en coords lógicas usando las flechas
// del teclado (atajo nativo de xyflow: `arrowKeyDiffs`, 5 unidades de flujo
// por pulsación, 20 con Shift — independiente del zoom/pan, así que no hace
// falta convertir por la escala del viewport). Confirmado por prueba directa
// que un solo `page.mouse` drag calculado con la escala del viewport
// (`.react-flow__viewport` → `scale(s)`) NO basta para un revert exacto en
// este editor: React Flow trae `autoPanOnNodeDrag` activado por defecto, así
// que arrastrar un nodo cerca del borde del lienzo (algo que pasa fácilmente
// tras varias corridas, con nodos que van derivando) dispara un paneo
// adicional del viewport EN MITAD del propio arrastre que ninguna conversión
// de escala tomada antes de soltar el ratón puede anticipar — en pruebas
// aisladas esto produjo errores de resto de entre 10 y 75 unidades de flujo,
// sin relación consistente con la escala leída. Las flechas evitan el
// problema por completo: manipulan `position` directamente vía
// `onNodesChange`, sin arrastre ni paneo.
//
// Truco necesario: `SagaGraphEditor.flowNodes` (saga-graph-editor.tsx) no
// devuelve `selected` en los nodos que pasa a `<ReactFlow nodes=...>` (el
// editor solo guarda el id seleccionado en `selectedId`, no en cada nodo), así
// que en modo controlado React Flow "olvida" la selección interna en cuanto
// el propio cambio de posición fuerza un re-render (matemáticamente: aplicar
// una pulsación, mueve el nodo, el padre re-renderiza, `flowNodes` sale sin
// `selected`, y React Flow lo da por deseleccionado) — comprobado
// empíricamente que UNA pulsación sí mueve el nodo pero las siguientes no
// hacen nada si no se re-selecciona. Por eso se hace clic en el nodo antes
// de CADA pulsación.
async function nudgeAxis(page: Page, node: Locator, deltaFlow: number, keyNeg: string, keyPos: string) {
  const key = deltaFlow >= 0 ? keyPos : keyNeg;
  let remaining = Math.abs(Math.round(deltaFlow));
  const bigSteps = Math.floor(remaining / 20); // Shift+flecha = factor 4 => 20 unidades
  for (let i = 0; i < bigSteps; i++) {
    await node.click();
    await page.keyboard.press(`Shift+${key}`);
  }
  remaining -= bigSteps * 20;
  const smallSteps = Math.round(remaining / 5); // flecha sola = 5 unidades
  for (let i = 0; i < smallSteps; i++) {
    await node.click();
    await page.keyboard.press(key);
  }
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
// events reales) y guardar persiste la posición. La comparación de
// posiciones usa coords LÓGICAS (`nodeFlowPos`, pre-zoom) en vez de
// `boundingBox()`: el `fitView` de cada mount puede aplicar un zoom/pan
// distinto, así que comparar en píxeles de pantalla entre dos mounts
// distintos es frágil. El revert usa las flechas del teclado (`nudgeAxis`,
// ver comentario en su definición) en vez de un segundo drag calculado por
// escala: un drag de pantalla no basta para un revert EXACTO en este editor
// (autoPanOnNodeDrag de React Flow), así que se guarda otra vez con el
// delta exacto aplicado por teclado — el seed QA queda restaurado de
// verdad para la siguiente corrida.
// ─────────────────────────────────────────────────────────────────────────
test("colaborador: mover un nodo y guardar persiste la posición", async ({ page }) => {
  await loginAs(page, COLLAB_EMAIL, COLLAB_PASSWORD);
  await page.goto(`/saga/${UNIVERSE_ID}/mapa/editar`);
  await expect(page.locator(".react-flow__node")).toHaveCount(10);

  // `hover()` sitúa el puntero en el CENTRO del nodo (comportamiento por
  // defecto de Playwright) — el arrastre debe partir de ahí, no de la
  // esquina superior izquierda de `boundingBox()`, o el delta realmente
  // aplicado queda desplazado en medio ancho/alto del nodo.
  const p1 = await nodeFlowPos(page);
  const node = page.locator(".react-flow__node").first();
  await node.hover();
  const box1 = await node.boundingBox();
  const center1 = { x: box1!.x + box1!.width / 2, y: box1!.y + box1!.height / 2 };
  await page.mouse.down();
  await page.mouse.move(center1.x + 140, center1.y + 90, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText(/cambio(s)? sin guardar/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar grafo" }).click();
  await page.waitForURL(new RegExp(`/saga/${UNIVERSE_ID}`), { timeout: 20_000 });

  // Reabrir el editor: la posición guardada difiere de la original (coords
  // lógicas del nodo, independientes del fitView de este segundo mount).
  await page.goto(`/saga/${UNIVERSE_ID}/mapa/editar`);
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  const p2 = await nodeFlowPos(page);
  expect(Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y)).toBeGreaterThan(40);

  // Revertir: delta EXACTO en coords lógicas (p1 - p2), aplicado con las
  // flechas del teclado (ver `nudgeAxis`) — no con un segundo drag de mouse.
  const afterNode = page.locator(".react-flow__node").first();
  await nudgeAxis(page, afterNode, p1.x - p2.x, "ArrowLeft", "ArrowRight");
  await nudgeAxis(page, afterNode, p1.y - p2.y, "ArrowUp", "ArrowDown");

  await expect(page.getByText(/cambio(s)? sin guardar/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar grafo" }).click();
  await page.waitForURL(new RegExp(`/saga/${UNIVERSE_ID}`), { timeout: 20_000 });

  // Confirmar que el revert deja el nodo (casi) exactamente donde empezó —
  // tolerancia de 5 unidades de flujo por eje (un paso de flecha) para
  // redondeos del `Math.round` en `nudgeAxis`.
  await page.goto(`/saga/${UNIVERSE_ID}/mapa/editar`);
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  const p3 = await nodeFlowPos(page);
  expect(Math.abs(p3.x - p1.x)).toBeLessThanOrEqual(5);
  expect(Math.abs(p3.y - p1.y)).toBeLessThanOrEqual(5);
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
