import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

// Precondición del sorteo (issue #228). La tarjeta «Sacar un lomo» solo existe
// si el pool tiene algo: con cero pendientes, `SpineDraw` pinta el estado vacío
// («Tu estantería de pendientes está vacía») y NO hay botón que pulsar
// (spine-draw.tsx:44). Y el pool no son los pases `planned` a secas:
// `getSorteoPool` descarta los que no tienen fila en catálogo
// (get-sorteo-pool.ts:103, «Ítems sin obra en catálogo se descartan»).
//
// Eso es justo lo que dejó este test en rojo permanente: devtest tenía 3 pases
// `planned` activos cuyos `item_id` ya no existían en `books` (no hay FK: la
// referencia es polimórfica `item_type`/`item_id`), así que la cuenta de
// pendientes decía 3 y el pool salía vacío. Depender de ese dato ambiente es lo
// que hace que el test mienta; ahora se siembra su propia precondición.
//
// UUID fijos —como el resto de semillas QA del repo— para poder limpiar ANTES y
// DESPUÉS (docs/TESTING.md): si una pasada muere a mitad, la siguiente arranca
// limpia igual.
const SORTEO_BOOK_ID = "12b43d1b-60d4-4ce6-bd38-1bdf729d4193"; // "The Dispossessed" en el catálogo dev
const SORTEO_PASS_ID = "f0e2e501-0000-4000-8000-000000000001";

async function seedPendingPass(): Promise<void> {
  // Guarda de dato (mismo patrón que `assertQaUniverse` en e2e/support/qa-seed.ts):
  // esto escribe con la service key, así que antes comprueba que el libro sigue
  // existiendo en vez de sembrar un pase huérfano — el fallo que arregla.
  const rows = (await (await rest(`books?id=eq.${SORTEO_BOOK_ID}&select=id`)).json()) as unknown[];
  if (rows.length === 0) {
    throw new Error(
      `[happy-path] el libro ${SORTEO_BOOK_ID} ya no está en \`books\`: elige otro para SORTEO_BOOK_ID ` +
        "(cualquier fila de `books` vale; solo tiene que existir).",
    );
  }

  const profiles = (await (
    await rest(`profiles?username=eq.${USERNAME}&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  const userId = profiles[0]?.user_id;
  if (!userId) throw new Error(`[happy-path] no hay perfil con username=${USERNAME}`);

  await clearPendingPass();
  await rest("passes", {
    method: "POST",
    body: JSON.stringify({
      id: SORTEO_PASS_ID,
      user_id: userId,
      item_type: "book",
      item_id: SORTEO_BOOK_ID,
      status: "planned",
      is_active: true,
    }),
  });
}

async function clearPendingPass(): Promise<void> {
  await rest(`passes?id=eq.${SORTEO_PASS_ID}`, { method: "DELETE" });
}

// Happy path de lectura (no mutación): login → home → buscar → ficha →
// perfil. Cubre auth, middleware, RLS de lectura y el enrutado principal.
// Requiere el usuario de prueba sembrado en el proyecto Supabase dev.
test("recorrido principal del usuario autenticado", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  // Login
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // Home autenticada: el feed (el dashboard se mudó a Perfil › Panel). La
  // cabecera tiene un árbol por breakpoint (plan 01, frames A y B): "Novedades"
  // en móvil y el saludo en escritorio, y el otro queda en el DOM oculto. La
  // suite corre a 1280, así que el locator SIEMPRE lleva :visible — el mismo
  // cuidado que en la ficha.
  await expect(page.locator("h1:visible")).toHaveText(/hola,|novedades/i);

  // La nav lleva a las 5 secciones.
  await expect(page.getByRole("link", { name: /^colección$/i }).first()).toBeVisible();

  // Buscar un libro y ver resultados. Una tarjeta de resultado es un ENLACE si
  // la obra ya está en el catálogo, y un BOTÓN si todavía no (§7.39: la búsqueda
  // no crea filas; la obra nace al pulsarla). Hay que aceptar las dos formas.
  await page.goto("/buscar?q=rayuela&type=book");
  const firstResult = page
    .locator('a[href*="/libro/"]')
    .or(page.getByRole("button", { name: /rayuela/i }))
    .first();
  await expect(firstResult).toBeVisible({ timeout: 15_000 });

  // Abrir la ficha del primer resultado
  await firstResult.click();
  await page.waitForURL(/\/libro\//, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: /comunidad/i }).or(page.getByText(/comunidad/i)).first()).toBeVisible();

  // Perfil propio
  await page.goto(`/u/${USERNAME}`);
  await expect(page.getByText(`@${USERNAME}`).first()).toBeVisible();
});

// Colecciones sorteables (§7.28): marcar una colección como pool del sorteo la
// hace aparecer en el filtro por colección, y desmarcarla la retira. Sustituye
// al test de colas nombradas (§7.22), retiradas el 2026-07-20. Auto-limpiante
// (nombre único por ejecución) para no dejar residuo en el proyecto dev.
test("marcar una colección como sorteable la ofrece en el filtro del sorteo", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  // Precondición sembrada por REST, no asumida del entorno — ver comentario de
  // `seedPendingPass`. Va ANTES del login: la hoja del sorteo se pinta en el
  // servidor con lo que haya en ese momento.
  await seedPendingPass();

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  const collectionName = `e2e-${Date.now()}`;

  try {
    // La pestaña hay que pedirla: `/coleccion` a secas abre en `Todo`, donde no
    // hay ningún control de crear colección. Este test llevaba roto por eso.
    await page.goto("/coleccion?tab=colecciones");
    await page.getByRole("button", { name: /nueva colección/i }).click();
    await page.getByLabel(/^nombre$/i).fill(collectionName);
    await page.getByRole("button", { name: /^crear$/i }).click();

    // Crear navega al detalle de la colección nueva.
    await page.waitForURL(/\/coleccion\/c\//);
    await expect(page.getByRole("heading", { name: collectionName })).toBeVisible();

    // Marcarla como sorteable desde el menú «⋯».
    await page.getByRole("button", { name: /acciones de la colección/i }).click();
    await page.getByRole("menuitem", { name: /usar en el sorteo/i }).click();
    // El menú refleja el estado nuevo: ahora ofrece quitarla.
    await page.getByRole("button", { name: /acciones de la colección/i }).click();
    await expect(page.getByRole("menuitem", { name: /quitar del sorteo/i })).toBeVisible();
    await page.keyboard.press("Escape");

    // Lo que de verdad importa: la colección se ofrece ya en el filtro del
    // sorteo, que vive en el Rincón del perfil detrás del panel «⚙ Filtros».
    await page.goto(`/u/${USERNAME}?tab=rincon`);
    // El botón se pinta en el servidor pero abre la hoja desde estado de
    // cliente: un clic anterior a la hidratación no hace nada y el test se
    // quedaba esperando. Reintentar hasta que la hoja aparezca de verdad.
    await expect(async () => {
      await page.getByRole("button", { name: /sacar un lomo/i }).click();
      await expect(
        page.getByRole("heading", { name: /deja que decida la estantería/i }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await page.getByRole("button", { name: /filtros/i }).click();
    await expect(page.getByRole("button", { name: collectionName })).toBeVisible();
    await page.keyboard.press("Escape");

    // Limpieza: borrar la colección (confirm() nativo).
    await page.goto("/coleccion?tab=colecciones");
    await page.getByRole("link", { name: new RegExp(collectionName) }).click();
    await page.waitForURL(/\/coleccion\/c\//);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /acciones de la colección/i }).click();
    await page.getByRole("menuitem", { name: /^borrar$/i }).click();
    await page.waitForURL(/\/coleccion$/);
  } finally {
    // El pase sembrado se va SIEMPRE: es biblioteca del usuario de pruebas, no
    // catálogo, y dejarlo puesto cambiaría el estado de partida de otros specs.
    await clearPendingPass();
  }
});

// Retos (§7.10): crear un reto con criterio de tipo y verificar que rinde
// progreso. Auto-limpiante.
test("crear y borrar un reto", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  const name = `e2e reto ${Date.now()}`;

  // Los retos viven en Perfil › Rincón desde el mockup Perfil v2 (plan 05, P2).
  await page.goto(`/u/${USERNAME}?tab=rincon`);
  await page.getByRole("button", { name: /nuevo reto/i }).click();
  // La hoja de "Editar perfil" (un <dialog> cerrado) también tiene un campo
  // "Nombre" en el DOM: se apunta al del reto por su id para no cazar el oculto
  // (regla de los dos árboles del README).
  await page.locator("#challenge-name").fill(name);
  await page.getByLabel(/objetivo \(número/i).fill("9999");
  await page.getByLabel(/desde/i).fill("2026-01-01");
  await page.getByLabel(/hasta/i).fill("2026-12-31");
  await page.getByRole("button", { name: /crear reto/i }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  const card = page
    .getByTestId("challenge-card")
    .filter({ hasText: name });
  // Muestra "N de 9999". El objetivo es deliberadamente inalcanzable: con un
  // objetivo bajo (10) el reto nace ya cumplido en cuanto la cuenta de prueba
  // acumula ítems completados en el año, y la tarjeta pasa a decir
  // "¡Completado!" en vez del progreso.
  await expect(card.getByText(/de 9999/)).toBeVisible();

  // Limpieza. Eliminar ya no es un text-link de la tarjeta: vive tras el «···»
  // y pregunta (F3-012). Playwright descarta los diálogos por defecto, así que
  // sin el handler el reto se quedaría sin borrar.
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Acciones del reto" }).click();
  await page.getByRole("menuitem", { name: /eliminar/i }).click();
  await expect(page.getByRole("heading", { name })).toHaveCount(0);
});
