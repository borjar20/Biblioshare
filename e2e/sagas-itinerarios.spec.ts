import { expect, test, type Page } from "@playwright/test";

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
// El tercer libro directo es la pieza que hace el test anti-#91 (más abajo)
// capaz de detectar la regresión de verdad: si solo hubiera las 2 obras de La
// Guardia, el denominador del universo (mainOrder del Universo) y el de la
// ruta curada coincidirían (2 = 2) y un hero mal enganchado a la ruta activa
// daría el mismo número por COINCIDENCIA. Con la obra directa, el universo
// tiene denominador 3 (1 completada = 33%) y la ruta "la-guardia" tiene
// denominador 2 (0 completadas = 0%): valores distintos a propósito, así que
// solo el hero CORRECTO (ligado siempre al universo) se queda quieto.
//
// Los UUID se sembraron una vez a mano en dev vía `mcp__supabase-dev__execute_sql`
// (ver `.superpowers/sdd/task-10-report.md`) — mismo patrón que el seed QA de
// sagas-v2 (UUID fijos, sin helper de siembra por test: este dominio de e2e no
// escribe en BD desde Playwright, solo hace login + navega + interactúa con la
// UI). Esta suite NO muta el seed salvo la adopción de ruta del test 3, que es
// idempotente (relanzar la suite vuelve a adoptar la misma ruta).
const UNIVERSO_ID = "33d7bb93-da3d-4453-a6da-1722beff134d";

const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";

// Calcado del helper `loginAs` de sagas-v2-editor.spec.ts/sagas-v2-curacion.spec.ts
// (patrón del repo: no importar entre specs de e2e, cada fichero es autónomo).
async function loginAsCollaborator(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', COLLAB_EMAIL);
  await page.fill('input[name="password"]', COLLAB_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("itinerarios de lectura", () => {
  test("el selector lista las rutas y la elegida muestra su cabecera", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa`);

    await page.getByRole("link", { name: "La Guardia" }).click();

    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
    await expect(page.getByText("Policíaco")).toBeVisible();
    await expect(page.getByText(/Llevas \d+ de \d+ de esta ruta/)).toBeVisible();
  });

  // Red contra el #91: si alguien reimplementa el contador y lo engancha al
  // hero, el número del universo empezaría a bailar según la pestaña. Arranca
  // deliberadamente en «Publicación» (no en la ruta curada, que además es la
  // que cae por defecto sin adopción) para que el clic sí cambie de ruta de
  // verdad, y el seed deja denominadores DISTINTOS entre universo (3) y ruta
  // (2) para que un enganche incorrecto no pase colado por coincidencia
  // numérica — ver comentario de cabecera.
  test("el progreso del hero NO cambia al cambiar de ruta", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&orden=publicacion`);

    const hero = page.getByTestId("saga-hero-progress");
    await expect(hero).toBeVisible();
    const before = await hero.innerText();
    expect(before).toBe("33%"); // 1 de 3 (Ronda de noche completada) — fija el baseline, no solo la igualdad

    await page.getByRole("link", { name: "La Guardia" }).click();
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
    // La ruta SÍ tiene un denominador distinto (0 de 2 = 0%) — si el hero
    // hubiera copiado ese número, esta comparación fallaría.
    await expect(page.getByText("Llevas 0 de 2 de esta ruta")).toBeVisible();

    expect(await hero.innerText()).toBe(before);
  });

  test("adoptar una ruta hace que la ficha abra por ella", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=la-guardia`);

    await page.getByRole("button", { name: "Leer por aquí" }).click();
    await expect(page.getByRole("button", { name: "Leyendo por aquí" })).toBeVisible();

    // Sin searchParams: debe abrir por la adoptada.
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa`);
    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();
  });

  test("los enlaces viejos con ?orden=publicacion siguen funcionando", async ({ page }) => {
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&orden=publicacion`);

    // La lista por año se reconoce por su numeración 01, 02…
    await expect(page.getByText("01", { exact: true })).toBeVisible();
  });
});
