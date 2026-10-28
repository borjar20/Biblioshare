import { expect, test, type Page } from "@playwright/test";

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
// Mudado al atlas (Task 11 del atlas, 2026-10-28): «Cómo leerla», su timeline
// y el grafo de React Flow se retiraron. Las secciones del timeline son ahora
// las islas del plano (una por subsaga), la lista por año es la lente
// Publicación y el nodo del grafo es la obra del atlas, que abre su mini-ficha.
// El atlas tampoco redirige ya una saga sin grafo: abre para toda saga con obras.
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

const ATLAS = `/saga/${UNIVERSE_ID}/mapa`;

/** El atlas ha pintado su primer layout (saga-atlas.tsx marca `data-ready`). */
async function atlasReady(page: Page) {
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
}

test("el atlas del universo muestra sus subsagas como regiones e islas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ATLAS);
  await atlasReady(page);

  await expect(page.getByRole("heading", { level: 1, name: "[QA Sagas v2] Universo" })).toBeVisible();
  // Las dos subsagas del seed, como regiones del plano con su nombre rotulado (las
  // antiguas secciones del timeline). El rótulo es SVG decorativo: la lista y las obras
  // llevan lo accesible.
  const region = (name: string) => page.locator("[data-atlas-stage] svg text").filter({ hasText: name });
  await expect(region("[QA Sagas v2] Era Uno")).toHaveCount(1);
  await expect(region("[QA Sagas v2] Era Dos")).toHaveCount(1);
  // Al alejar del todo, cada región se pliega en una isla: un botón con su nombre.
  await expect(async () => {
    await page.getByRole("button", { name: "Alejar" }).click();
    await expect(page.getByRole("button", { name: /^\[QA Sagas v2\] Era Uno: / })).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^\[QA Sagas v2\] Era Dos: / })).toHaveCount(1);
  // Issue #167: "Nexo entre tramos" y "Spin-off · opcional" se derogaron — se
  // derivaban de heurísticas que etiquetaban mal (una arista `principal` salía
  // como spin-off). El seed no asigna roles, así que aquí se comprueba la
  // ausencia: si vuelve a aparecer, alguien reintrodujo la heurística.
  await expect(page.getByText("Nexo entre tramos")).toHaveCount(0);
  await expect(page.getByText("Spin-off · opcional")).toHaveCount(0);
});

test("el enlace viejo ?orden=publicacion abre la lente Publicación", async ({ page }) => {
  await page.goto(`/saga/${UNIVERSE_ID}/como-leerla?orden=publicacion`);
  // Redirect en streaming (200 + redirect en cliente): se afirma la URL final.
  await expect(page).toHaveURL(`${ATLAS}?lente=publicacion`);
  await atlasReady(page);
  // Cada portada lleva su puesto de lectura, uno por obra del plano.
  const obras = await page.locator("[data-work-key]").count();
  expect(obras).toBeGreaterThan(0);
  await expect(page.locator("[data-reading-no]")).toHaveCount(obras);
});

test("el atlas pinta las obras de las subsagas y una obra abre su ficha", async ({ page }) => {
  await page.goto(ATLAS);
  await atlasReady(page);
  // Una obra de Era Dos, no solo de Era Uno (por clave de dominio `i:<tipo>:<uuid>`: hay
  // dos libros con el mismo título en el seed).
  const obra = page.locator(`[data-work-key="i:book:${ERA_DOS_ITEM_ID}"]`);
  await expect(obra).toHaveCount(1);

  // La obra abre su mini-ficha (Enter = el mismo onClick, sin depender de la cámara) y
  // «Abrir ficha» navega a la ficha de la obra.
  await obra.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("link", { name: "Abrir ficha" }).click();
  await expect(page).toHaveURL(/\/(libro|pelicula|serie|saga)\//);
});

test("una subsaga sin mapa propio abre su atlas, sin redirigir a la ficha", async ({ page }) => {
  // Antes: «Cómo leerla» sin timeline y /mapa redirigía a la ficha. El atlas abre
  // para toda saga con obras (spec del atlas §3), y /como-leerla acaba en él.
  await page.goto(`/saga/${ERA_UNO_ID}/como-leerla`);
  await expect(page).toHaveURL(`/saga/${ERA_UNO_ID}/mapa`);
  await atlasReady(page);
  await expect(page.getByRole("heading", { level: 1, name: "[QA Sagas v2] Era Uno" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver a la saga" })).toHaveAttribute("href", `/saga/${ERA_UNO_ID}`);
  await expect(page.locator("[data-work-key]").first()).toBeAttached();
});
