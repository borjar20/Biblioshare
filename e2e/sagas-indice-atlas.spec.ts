import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

// E2E del atlas de /sagas (spec 2026-10-28 índice, Task 10). El índice es un atlas por
// territorios: zonas del lector (En curso → Sigues → Terminadas → Por descubrir) o, sin sesión,
// zonas por tipo; mini-ficha, seguir, buscador, filtros que atenúan y «Ver como lista».
//
// Va contra build de producción (`next start`). El estado de un lector NO se supone: la zona
// esperada de cada saga se calcula por REST con las mismas reglas que `deriveIndexAtlas`
// (precedente: `expectedCounts` en sagas-itinerarios.spec.ts), porque el seed de dev varía.
//
// Limpieza: `fetch` nativo con service role (no el fixture `request`, que muere con el contexto
// y dejaría filas huérfanas en un timeout), `res.ok` comprobado en cada escritura (#180/#182) y
// todo seguimiento que un test siembre o pulse se borra en `finally`.
const V2_UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";

// Calcado de sagas-atlas.spec.ts (patrón del repo: no se importa entre specs).
const COLLAB_EMAIL = process.env.COLLAB_USER_EMAIL ?? "borjar20+bibliosharecollab@gmail.com";
const COLLAB_PASSWORD = process.env.COLLAB_USER_PASSWORD ?? "CollabTest1234pass";
const COLLAB_USER_ID = "4265f51f-c784-4c5b-8153-3ef970800456";
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
const getJson = async <T>(path: string): Promise<T> => (await api(path)).json();

async function loginAsCollaborator(page: Page) {
  await page.goto("/login");
  await submitLogin(page, COLLAB_EMAIL, COLLAB_PASSWORD);
  await page.waitForURL("/");
}

/** El atlas está listo cuando la raíz marca `data-ready` (ha medido el viewport y pintado el
 *  primer layout con su orientación real). Antes, un clic o un foco pueden perderse. */
async function gotoIndex(page: Page, url = "/sagas") {
  await page.goto(url);
  await expect(page.locator("[data-sagas-atlas][data-ready='true'] [data-atlas-stage]")).toBeVisible();
}

/** Una saga raíz del plano (botón). En la lista, el `li` también lleva `data-saga-id`: `.first()`
 *  basta porque el plano va antes en el DOM. */
const saga = (page: Page, id: string) => page.locator(`[data-saga-id="${id}"]`).first();
const searchBox = (page: Page) => page.getByRole("combobox", { name: "Buscar sagas" });
const dock = (page: Page) => page.locator('[data-atlas-chrome="dock"]');

// ── Estado del lector por REST ──────────────────────────────────────────────────────────────
// Réplica de `countedKeys` (src/lib/sagas/progress.ts) y de `readerZone` (index-atlas/model.ts).
type SagaRow = { id: string; parent_saga_id: string | null; optional_in_parent: boolean };
type PassRow = { item_type: string; item_id: string; status: string };
const MAX_DEPTH = 4; // mismo cinturón anti-ciclos que progress.ts

async function readerState() {
  const [sagas, passes, follows] = await Promise.all([
    getJson<SagaRow[]>("sagas?select=id,parent_saga_id,optional_in_parent&limit=5000"),
    getJson<PassRow[]>(`passes?user_id=eq.${COLLAB_USER_ID}&is_active=eq.true&select=item_type,item_id,status&limit=5000`),
    getJson<{ saga_id: string }[]>(`saga_follows?user_id=eq.${COLLAB_USER_ID}&select=saga_id`),
  ]);
  return { sagas, passes, followed: new Set(follows.map((f) => f.saga_id)) };
}
type ReaderState = Awaited<ReturnType<typeof readerState>>;

/** Sagas cuyas obras cuentan para el progreso de `rootId`: la raíz y sus descendientes, sin
 *  descender a un bloque `optional_in_parent` (la raíz nunca se excluye a sí misma). */
function countedSagaIds(rootId: string, sagas: SagaRow[]): string[] {
  const out: string[] = [];
  const visited = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (depth > MAX_DEPTH || visited.has(id)) return;
    visited.add(id);
    out.push(id);
    for (const c of sagas) if (c.parent_saga_id === id && !c.optional_in_parent) walk(c.id, depth + 1);
  };
  walk(rootId, 0);
  return out;
}

/** Zona esperada de una saga raíz para el colaborador: obras contadas del subárbol (no opcionales,
 *  deduplicadas), pases activos y seguimiento. started && !done → en-curso; follows && !started →
 *  sigues; done → terminadas; si no, por-descubrir. */
async function expectedZone(sagaId: string, state?: ReaderState): Promise<string> {
  const { sagas, passes, followed } = state ?? (await readerState());
  const ids = countedSagaIds(sagaId, sagas);
  const items = await getJson<{ item_type: string; item_id: string }[]>(
    `saga_items?select=item_type,item_id&saga_id=in.(${ids.join(",")})&optional=eq.false&limit=5000`,
  );
  const counted = [...new Set(items.map((i) => `${i.item_type}:${i.item_id}`))];
  const statusOf = new Map<string, Set<string>>();
  for (const p of passes) {
    const k = `${p.item_type}:${p.item_id}`;
    statusOf.set(k, (statusOf.get(k) ?? new Set()).add(p.status));
  }
  const has = (k: string, s: string) => statusOf.get(k)?.has(s) ?? false;
  const started = counted.some((k) => has(k, "in_progress") || has(k, "completed"));
  const completed = counted.filter((k) => has(k, "completed")).length;
  const done = counted.length > 0 && completed >= counted.length;
  if (started && !done) return "en-curso";
  if (followed.has(sagaId) && !started) return "sigues";
  if (done) return "terminadas";
  return "por-descubrir";
}

async function rootIds(limit: number): Promise<string[]> {
  const rows = await getJson<{ id: string }[]>(`sagas?select=id&parent_saga_id=is.null&order=name&limit=${limit}`);
  return rows.map((r) => r.id);
}

/** Una raíz que el colaborador no sigue ni ha empezado (zona esperada «por-descubrir»). */
async function pickDiscoverable(): Promise<string> {
  const state = await readerState();
  for (const id of await rootIds(40)) {
    if ((await expectedZone(id, state)) === "por-descubrir") return id;
  }
  throw new Error("el seed no tiene ninguna raíz sin seguir y sin empezar para el colaborador");
}

/** Una raíz con obras solo de libros (para comprobar que «Películas» la atenúa). */
async function pickBooksOnlyRoot(): Promise<string> {
  const sagas = await getJson<SagaRow[]>("sagas?select=id,parent_saga_id,optional_in_parent&limit=5000");
  for (const id of await rootIds(40)) {
    // Mismo universo de obras que `typeBreakdown`: todo el subárbol, opcionales incluidas.
    const tree = new Set<string>([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of sagas) if (s.parent_saga_id && tree.has(s.parent_saga_id) && !tree.has(s.id)) { tree.add(s.id); grew = true; }
    }
    const items = await getJson<{ item_type: string }[]>(`saga_items?select=item_type&saga_id=in.(${[...tree].join(",")})&limit=5000`);
    const types = new Set(items.map((i) => i.item_type));
    if (types.size === 1 && types.has("book")) return id;
  }
  throw new Error("el seed no tiene ninguna raíz solo de libros");
}

async function seedFollow(sagaId: string) {
  await api("saga_follows", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: COLLAB_USER_ID, saga_id: sagaId }),
  });
}
async function clearFollow(sagaId: string) {
  await api(`saga_follows?user_id=eq.${COLLAB_USER_ID}&saga_id=eq.${sagaId}`, { method: "DELETE" });
}

// ── Interacción ─────────────────────────────────────────────────────────────────────────────
/** Una saga en nivel de zonas (k < 0.5) está `visibility: hidden` y no admite foco: se acerca
 *  la cámara hasta que las portadas aparecen. Enfocarla fuera del viewport sí vale (es el mismo
 *  camino que el clic y no depende de dónde cayó la cámara). */
async function reveal(page: Page, id: string) {
  for (let i = 0; i < 8; i++) {
    const visibility = await saga(page, id).evaluate((el) => getComputedStyle(el).visibility);
    if (visibility !== "hidden") return;
    await page.getByRole("button", { name: "Acercar", exact: true }).click();
    await page.waitForTimeout(350);
  }
}

/** Abre la mini-ficha de una saga con el teclado (Enter sobre su botón). */
async function openSheet(page: Page, id: string) {
  await reveal(page, id);
  await saga(page, id).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Pasos de zona en el orden del atlas del lector. */
const READER_ORDER = ["en-curso", "sigues", "terminadas", "por-descubrir"];

const VIEWPORTS = [
  { name: "escritorio", viewport: null },
  { name: "móvil", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, viewport } of VIEWPORTS) {
  test.describe(`atlas del índice · ${name}`, () => {
    if (viewport) test.use({ viewport });

    test("mini-ficha y ficha", async ({ page }) => {
      await gotoIndex(page);
      const dialog = await openSheet(page, V2_UNIVERSO_ID);
      const abrir = dialog.getByRole("link", { name: "Abrir ficha" });
      await expect(abrir).toBeVisible();

      if (viewport) {
        // En móvil la mini-ficha es una hoja inferior: su borde de abajo es el del viewport.
        await expect
          .poll(async () => {
            const box = await dialog.boundingBox();
            return box ? Math.abs(box.y + box.height - viewport.height) : Infinity;
          })
          .toBeLessThanOrEqual(8);
      }

      await abrir.click();
      await expect(page).toHaveURL(new RegExp(`/saga/${V2_UNIVERSO_ID}`));
    });

    test("lista y teclado", async ({ page }) => {
      await gotoIndex(page);
      await page.getByRole("button", { name: "Ver como lista" }).click();
      // El mismo botón cambia de nombre a «Ver el mapa» y queda pulsado.
      await expect(page.getByRole("button", { name: "Ver el mapa" })).toHaveAttribute("aria-pressed", "true");

      // Un h2 por zona (el plano sigue en el DOM, `inert`, y tiene una sección por zona) y los
      // enlaces normales de cada saga.
      const lista = page.getByRole("region", { name: "Sagas en lista" });
      const zonas = await page.locator("[data-zone]").count();
      expect(zonas).toBeGreaterThan(0);
      await expect(lista.locator("h2")).toHaveCount(zonas);
      await expect(lista.locator(`a[href="/saga/${V2_UNIVERSO_ID}"]`).first()).toBeVisible();

      // Vuelta al mapa: Tab desde el buscador llega a una saga; Enter abre la ficha; Escape la
      // cierra y el foco vuelve a esa saga.
      await page.getByRole("button", { name: "Ver el mapa" }).click();
      await expect(lista).toHaveCount(0);
      // En nivel de zonas las sagas están `visibility: hidden` y no entran en el orden de Tab.
      await reveal(page, V2_UNIVERSO_ID);
      await searchBox(page).focus();
      let focusedId: string | null = null;
      for (let i = 0; i < 10 && !focusedId; i++) {
        await page.keyboard.press("Tab");
        focusedId = await page.evaluate(() => document.activeElement?.getAttribute("data-saga-id") ?? null);
      }
      expect(focusedId, "Tab desde el buscador debe llegar a una saga del plano").not.toBeNull();

      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(":focus")).toHaveAttribute("data-saga-id", focusedId!);
    });
  });
}

test.describe("atlas del índice · escritorio", () => {
  test("con sesión: cada saga en su zona", async ({ page }) => {
    await loginAsCollaborator(page);
    await gotoIndex(page);

    const state = await readerState();
    const ids = [...new Set([V2_UNIVERSO_ID, ...(await rootIds(2))])];
    for (const id of ids) {
      await expect(saga(page, id)).toHaveAttribute("data-zone-of", await expectedZone(id, state));
    }

    // Las zonas visibles van en orden En curso → Sigues → Terminadas → Por descubrir, saltando
    // las que falten.
    const zones = await page.locator("[data-zone]").evaluateAll((els) => els.map((el) => el.getAttribute("data-zone")!));
    expect(zones.length).toBeGreaterThan(0);
    const ranks = zones.map((z) => READER_ORDER.indexOf(z));
    expect(ranks.every((r) => r >= 0), `zonas inesperadas: ${zones.join(", ")}`).toBe(true);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test("sin sesión: zonas por tipo", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await gotoIndex(page);
      for (const z of READER_ORDER) await expect(page.locator(`[data-zone="${z}"]`)).toHaveCount(0);
      await expect(page.locator('[data-zone="libros"]')).toHaveCount(1);
      await expect(page.locator('header[data-atlas-chrome="top"]')).toContainText(/universo/i);
    } finally {
      await context.close();
    }
  });

  test("buscar y volar", async ({ page }) => {
    const [child] = await getJson<{ name: string }[]>(`sagas?select=name&parent_saga_id=eq.${V2_UNIVERSO_ID}&order=name&limit=1`);
    const [universe] = await getJson<{ name: string }[]>(`sagas?select=name&id=eq.${V2_UNIVERSO_ID}`);
    expect(child, "el universo QA debe tener al menos una subsaga").toBeTruthy();

    await gotoIndex(page);
    const box = searchBox(page);
    await box.fill(child.name);
    await expect(page.getByRole("option", { name: child.name }).first()).toBeVisible();
    await box.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: universe.name })).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.search)).toContain("q=");
  });

  test("el buscador no pierde lo escrito", async ({ page }) => {
    // Regresión: cada tecla escribía la URL con el `replaceState` de Next, lo que cambiaba la
    // clave del segmento y re-montaba el atlas (se perdían el texto y el foco).
    await loginAsCollaborator(page);
    await gotoIndex(page);
    const box = searchBox(page);
    await box.click();
    await box.pressSequentially("guard", { delay: 50 });

    await expect(box).toHaveValue("guard");
    await expect(box).toBeFocused();
    await expect.poll(() => page.evaluate(() => location.search)).toContain("q=guard");
  });

  test("seguir mueve a Sigues", async ({ page }) => {
    const id = await pickDiscoverable();
    try {
      await loginAsCollaborator(page);
      await gotoIndex(page);
      await expect(saga(page, id)).toHaveAttribute("data-zone-of", "por-descubrir");

      const dialog = await openSheet(page, id);
      await dialog.getByRole("button", { name: "Seguir", exact: true }).click();
      // Optimista: cambia de zona sin recargar.
      await expect(saga(page, id)).toHaveAttribute("data-zone-of", "sigues");
      await expect(dialog.getByRole("button", { name: "Sigues", exact: true })).toHaveAttribute("aria-pressed", "true");

      // Y es de verdad: tras recargar sigue en Sigues.
      await expect
        .poll(async () => (await getJson<unknown[]>(`saga_follows?user_id=eq.${COLLAB_USER_ID}&saga_id=eq.${id}&select=saga_id`)).length)
        .toBe(1);
      await gotoIndex(page);
      await expect(saga(page, id)).toHaveAttribute("data-zone-of", "sigues");
    } finally {
      await clearFollow(id);
    }
  });

  test("filtro por tipo atenúa", async ({ page }) => {
    const booksOnly = await pickBooksOnlyRoot();
    await gotoIndex(page);
    await expect(saga(page, booksOnly)).not.toHaveAttribute("data-dimmed", /.*/);

    const peliculas = dock(page).getByRole("button", { name: "Películas", exact: true });
    await peliculas.click();
    await expect(peliculas).toHaveAttribute("aria-pressed", "true");
    await expect(saga(page, booksOnly)).toHaveAttribute("data-dimmed", "true");
    await expect.poll(() => page.evaluate(() => location.search)).toContain("tipo=pelicula");

    await dock(page).getByRole("button", { name: "Quitar filtros" }).click();
    await expect(saga(page, booksOnly)).not.toHaveAttribute("data-dimmed", /.*/);
    await expect.poll(() => page.evaluate(() => location.search)).not.toContain("tipo=");
  });

  test("enlace viejo ?vista=sigo", async ({ page }) => {
    const id = await pickDiscoverable();
    try {
      await seedFollow(id);
      await loginAsCollaborator(page);
      await gotoIndex(page, "/sagas?vista=sigo");

      const zona = page.locator('[data-zone="sigues"]');
      await expect(zona).toHaveCount(1);
      // La cámara inicial enfoca Sigues: el centro de la zona cae dentro del viewport.
      const vp = page.viewportSize()!;
      await expect
        .poll(async () => {
          const b = await zona.boundingBox();
          if (!b) return false;
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          return cx >= 0 && cx <= vp.width && cy >= 0 && cy <= vp.height;
        })
        .toBe(true);
    } finally {
      await clearFollow(id);
    }
  });
});
