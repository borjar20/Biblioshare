import { test, expect, type Page, type Locator } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E del ciclo de vida completo del pase (Tarea 11, hub): las 7 reglas del
// esquema de flujo (alta, auto-cierre, abandonar/retomar en sus dos ramas,
// gesto único de película, relectura y revisionado de serie), tras la
// migración literal de las Tareas 1-10 (`passes` sustituye a `diary_entries`,
// library_entries queda congelada). Sigue el patrón de login/limpieza de los
// specs vecinos (busqueda-hidratacion.spec.ts, social-optimista.spec.ts):
// cuenta persistente `devtest`, contra OpenLibrary/TMDB reales
// (MOCK_EXTERNAL_APIS=false) y el proyecto Supabase dev, con teardown por
// REST usando la service-role key.

// Cota defensiva: sin esto, un `.click()` sin timeout explícito espera
// indefinidamente si el elemento nunca llega a ser accionable (p. ej. si un
// paso anterior falló en silencio y el flujo queda en un estado inesperado),
// consumiendo TODO el timeout del test antes de que el try/finally de
// limpieza tenga ocasión de correr — así es como una corrida anterior dejó
// filas huérfanas en dev. Con esta cota, ese click falla en 20s con un error
// claro y deja margen de sobra para la limpieza.
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000);
  // La navegación puede tardar más que una acción normal contra el servidor
  // de producción bajo carga sostenida (7 escenarios reales contra
  // OpenLibrary/TMDB seguidos); separada de la cota de arriba para no
  // cortarla en corto.
  page.setDefaultNavigationTimeout(60_000);
});

// El estado optimista local se resincroniza con la prop `entry` del servidor
// en cuanto cambia de referencia (mismo patrón "ajuste durante el render" en
// varios componentes de src/components/detail/): una lectura todavía no
// asentada tras escrituras seguidas sobre el MISMO pase (abandonar→retomar,
// revisionado justo después de completar) puede revertir brevemente el pill
// a lo que había antes. Reintenta la recarga unas pocas veces en vez de
// fiarse de la primera — mucho más barato que perseguir la causa exacta de
// una carrera de revalidación, y no esconde un fallo real: si el estado
// nunca llega, la view el `expect` de después sigue fallando con su mensaje
// habitual.
async function reloadUntilVisible(
  page: Page,
  url: string,
  locator: (page: Page) => Locator,
  attempts = 4,
) {
  for (let i = 0; i < attempts; i++) {
    await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => {});
    if (
      await locator(page)
        .isVisible()
        .catch(() => false)
    )
      return;
  }
}

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

// El id de devtest se resuelve una sola vez (memoizado a nivel de módulo):
// todas las limpiezas lo necesitan para no tocar pases de otro usuario.
let cachedUserId: string | null = null;
async function devtestId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: adminHeaders() },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  cachedUserId = rows[0].user_id;
  return cachedUserId;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

const PATH_SEGMENT = {
  book: "libro",
  movie: "pelicula",
  series: "serie",
} as const;

// Busca en el catálogo real y abre el primer resultado cuyo texto contiene
// `titleText` (acepta tarjeta-botón si la obra aún no existe en catálogo, o
// tarjeta-enlace si ya está cacheada de una corrida anterior — mismo patrón
// que busqueda-hidratacion.spec.ts). Devuelve el id de catálogo recién nacido
// o ya existente.
async function openSearchResult(
  page: Page,
  itemType: "book" | "movie" | "series",
  query: string,
  titleText: string,
): Promise<string> {
  const segment = PATH_SEGMENT[itemType];
  await page.goto(`/buscar?type=${itemType}&q=${encodeURIComponent(query)}`);
  const card = page
    .locator(`a[href*="/${segment}/"]`)
    .or(page.getByRole("button"))
    .filter({ hasText: titleText })
    .first();
  await expect(card).toBeVisible({ timeout: 25_000 });
  await card.click();
  await page.waitForURL(new RegExp(`/${segment}/[0-9a-f-]{36}`), {
    timeout: 30_000,
  });
  const match = page.url().match(new RegExp(`/${segment}/([0-9a-f-]{36})`));
  if (!match) throw new Error(`no se pudo extraer el id de ${page.url()}`);
  return match[1];
}

function statusGroup(page: Page) {
  return page.getByRole("group", { name: "Tu estado" });
}

// La píldora de estado del hero (ItemHero) y el pill activo de StatusSegments
// contienen el MISMO texto ("Pendiente", "Leyendo"...): un getByText a secas
// es ambiguo. data-testid="status-badge" (src/components/ui/status-badge.tsx)
// distingue la píldora de solo lectura del control. El filtro es por
// SUBcadena, así que casa con la etiqueta larga del hero ("En tu biblioteca ·
// Leyendo").
//
// Ojo con el verbo: "en curso" y "completado" cambian por tipo de medio
// (Leyendo/Viendo, Leído/Vista), como en el control. Los genéricos "En curso"
// y "Completado" NO aparecen en la píldora; "Pendiente" y "Abandonado" sí,
// que no tienen verbo propio.
// `:visible` porque el estado se pinta en DOS sitios según el ancho y el otro
// se queda en el DOM apagado: la píldora del hero en móvil, la pastilla del
// rail en PC (item-rail-actions.tsx). La suite corre a 1280 —o sea, la del
// rail—, pero así el helper no depende de eso.
function statusBadge(page: Page, label: string) {
  return page
    .locator('[data-testid="status-badge"]:visible')
    .filter({ hasText: label });
}

// Una tarjeta del diario de pases por su ordinal. El ordinal va por tipo de
// medio ("2.ª lectura" / "2.º visionado", passes.nth) y lo dice TAMBIÉN la
// cabecera del pase activo: sin acotar al data-testid, un getByText casaría
// con las dos y fallaría por modo estricto.
function diaryEntry(page: Page, itemType: "book" | "series", n: number) {
  const ordinal = itemType === "book" ? `${n}.ª lectura` : `${n}.º visionado`;
  return page.getByTestId("diary-entry").filter({ hasText: ordinal });
}

// "Seguir" ahora vive en el HERO (visible desde cualquier pestaña), no dentro
// de la pestaña Mi registro. Ya no abre el selector de edición: la edición se
// difiere a cuando se empieza a leer (panel Progreso). Tras seguir, la app
// revela "Mi registro" y salta a ella.
async function followItem(page: Page) {
  await page.getByRole("button", { name: "Seguir" }).click();
  // El badge "Pendiente" es OPTIMISTA: lo publica el cliente en el mismo tick
  // en que dispara la acción, cuando todavía NO hay fila en `passes`. Verlo no
  // prueba nada (docs/TRAMPAS.md §16). `aria-busy` baja a false cuando la
  // escritura ha aterrizado de verdad — issue #106.
  //
  // Sin esta espera el test corría contra el servidor: la consulta de
  // /coleccion caía ENTRE la entrada de la acción y su insert, y la obra no
  // salía en la rejilla.
  const badge = page.locator('[data-testid="status-badge"]:visible').first();
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await expect(badge).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
}

// El botón de guardar de la HOJA DE CIERRE. Acotado al diálogo y con
// `exact`: "Guardar" a secas casa por subcadena y desde el ciclo de notas hay
// más de un botón que empieza así en la ficha ("Guardar sesión y cita", el
// "Guardar" del compositor de notas), lo que rompía el modo estricto de
// Playwright. No se veía porque estos tests llevaban tiempo sin ejecutarse:
// «Regla 1» fallaba antes y, al ser serial, saltaba los demás.
function closeSheetSave(page: Page) {
  return page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true });
}

// applyTransition marca `closed` tanto para "completed" como para "dropped"
// (src/lib/passes/apply-transition.ts): marcar Abandonado TAMBIÉN encadena
// la hoja de cierre (ClosePassSheet), igual que completar. El modal nativo
// (<dialog>) tapa el resto de la página mientras está abierto, así que hay
// que descartarlo ("Ahora no") antes de poder pulsar cualquier otra cosa.
async function dismissCloseSheetIfOpen(page: Page) {
  const heading = page.getByRole("heading", { name: "¿Qué te ha parecido?" });
  try {
    await heading.waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("button", { name: "Ahora no" }).click();
    await expect(heading).toHaveCount(0);
  } catch {
    // No se abrió (p. ej. ya estaba cerrado por otra vía): nada que descartar.
  }
}

// Máximo contra el que valida addSession (src/lib/sessions/actions.ts): la
// edición PRIMARIA del pase si tiene páginas, si no `books.total_pages`. Se
// consulta justo antes de usarlo (no al crear el libro) para no competir con
// la sincronización de ediciones en segundo plano (after()) de la ficha.
async function maxBookPosition(itemId: string): Promise<number> {
  const primaryRes = await fetch(
    `${SUPABASE_URL}/rest/v1/book_editions?book_id=eq.${itemId}&is_primary=eq.true&select=total_pages&limit=1`,
    { headers: adminHeaders() },
  );
  const primaryRows = (await primaryRes.json()) as {
    total_pages: number | null;
  }[];
  if (primaryRows[0]?.total_pages) return primaryRows[0].total_pages;

  const bookRes = await fetch(
    `${SUPABASE_URL}/rest/v1/books?id=eq.${itemId}&select=total_pages`,
    { headers: adminHeaders() },
  );
  const bookRows = (await bookRes.json()) as { total_pages: number | null }[];
  const total = bookRows[0]?.total_pages;
  if (!total) throw new Error(`sin total_pages para el libro ${itemId}`);
  return total;
}

async function deletePasses(
  itemType: "book" | "movie" | "series",
  itemId: string,
  userId: string,
) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/passes?item_type=eq.${itemType}&item_id=eq.${itemId}&user_id=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() },
  );
}

// La pestaña Episodios ya no apila todas las temporadas: enseña una, elegida en
// el raíl (PC, donde corre la suite) o en el índice (móvil). Para llegar al
// último episodio de la serie hay que entrar antes en la última temporada.
// Devuelve la fila del último episodio de esa temporada.
async function openLastSeason(page: Page) {
  const rail = page.getByRole("button", { name: /^Temporada \d+$/ });
  const count = await rail.count();
  if (count > 0) await rail.nth(count - 1).click();
  return page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: "Visto" }) })
    .last();
}

async function deleteEpisodeWatches(seriesId: string, userId: string) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/episode_watches?series_id=eq.${seriesId}&user_id=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() },
  );
}

async function deleteCatalogRow(
  itemType: "book" | "movie" | "series",
  itemId: string,
) {
  const table = { book: "books", movie: "movies", series: "series" }[itemType];
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${itemId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

async function cleanupBook(bookId: string) {
  if (!bookId) return;
  const userId = await devtestId();
  await deletePasses("book", bookId, userId);
  await deleteCatalogRow("book", bookId);
}

// ─────────────────────────────────────────────────────────────────────────
// Regla 1 + 2 + 5 del esquema: alta → Pendiente, auto-cierre con hoja al
// llegar a la última página, y relectura. Encadenadas sobre el MISMO libro
// (serial: si un paso falla, Playwright se salta los siguientes en vez de
// arrastrar un estado a medias) porque las tres reglas describen tramos
// sucesivos del ciclo de vida de una obra real, no casos independientes.
// ─────────────────────────────────────────────────────────────────────────
test.describe
  .serial("ciclo de vida de un libro: alta, auto-cierre, relectura", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  let bookId = "";

  test.afterAll(async () => {
    await cleanupBook(bookId);
  });

  test("Regla 1 — Alta: buscar y añadir un libro deja el pase en Pendiente", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page);

    bookId = await openSearchResult(
      page,
      "book",
      "the old man and the sea hemingway",
      "The Old Man and the Sea",
    );

    // Deep link a ?tab=log de un ítem AÚN no seguido: la pestaña "Mi registro"
    // no existe todavía, así que la ficha cae en "Información".
    await page.goto(`/libro/${bookId}?tab=log`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(
      page.getByRole("button", { name: "Mi registro" }),
    ).toHaveCount(0);

    // "Seguir" es accesible en el hero. Al seguir, la obra pasa a Pendiente y
    // aparece la pestaña "Mi registro".
    await followItem(page);
    await expect(statusBadge(page, "Pendiente")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "Mi registro" }),
    ).toBeVisible({ timeout: 15_000 });

    // La biblioteca completa vive en la pestaña «Todo» (Colección v2); `/coleccion`
    // a secas abre en «Colecciones» (grid de colecciones), no en la rejilla de ítems.
    await page.goto("/coleccion?tab=todo");
    await expect(page.getByText("The Old Man and the Sea").first()).toBeVisible(
      { timeout: 15_000 },
    );
  });

  test("Regla 2 — Auto-cierre: una sesión hasta la última página abre la hoja de cierre sola", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page);
    await page.goto(`/libro/${bookId}?tab=log`);
    await page.waitForLoadState("networkidle").catch(() => {});

    await statusGroup(page).getByRole("button", { name: "Leyendo" }).click();
    const addSessionLink = page
      .getByRole("link", { name: /registrar sesión/i })
      .first();
    await expect(addSessionLink).toBeVisible({ timeout: 15_000 });

    const maxPage = await maxBookPosition(bookId);

    await addSessionLink.click();
    await page.waitForURL(/\/sesion\//, { timeout: 15_000 });
    // `#session-page` ya no existe (Tarea 5 de registrar-sesion-v2 sustituyó
    // el input por uno sin id, expuesto solo por name/aria-label — ver
    // book-progress-field.tsx). `input[name="page"]` es el nuevo selector
    // estable.
    await page.locator('input[name="page"]').fill(String(maxPage));
    await page.getByRole("button", { name: "Guardar sesión" }).click();

    // Redirige a la ficha con `?cerrar=<passId>&tab=log`: la hoja se abre
    // desde el PRIMER pintado (prop calculada en el server component), no
    // tras un segundo render — el hallazgo de revisión que arregló la Tarea 7.
    await expect(
      page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
    ).toBeVisible({ timeout: 20_000 });

    // La nota máxima. Las mitades de cada dot se anuncian por su valor real
    // 1-10 (RatingDots), no en estrellas: la app ya no tiene ninguna.
    await page.getByRole("button", { name: "10/10", exact: true }).click();
    await closeSheetSave(page).click();

    await expect(
      page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
    ).toHaveCount(0);

    // REGRESIÓN issue #117: cerrar la hoja tiene que dejarnos EN LA FICHA.
    // Se comprueba la URL ANTES que el badge a propósito. Cuando esto se
    // rompió, la salida del modal acababa en el inicio y el único síntoma era
    // "no aparece el badge Leído" — un mensaje que apunta al estado del pase
    // (lectura, escritura, revalidación) cuando el fallo real era de
    // navegación, y que costó una investigación entera desmontar. Con esta
    // aserción delante, la misma rotura dice directamente dónde acabamos.
    await expect(page).toHaveURL(new RegExp(`/libro/${bookId}`), {
      timeout: 15_000,
    });
    await expect(statusBadge(page, "Leído")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Regla 5 — Relectura: Leyendo de nuevo sobre un Completado abre un segundo pase a cursor 0", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page);
    await page.goto(`/libro/${bookId}?tab=log`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(statusBadge(page, "Leído")).toBeVisible({
      timeout: 15_000,
    });

    await statusGroup(page).getByRole("button", { name: "Leyendo" }).click();

    // completed → in_progress no es "retomar" (eso solo aplica a dropped):
    // la máquina archiva el pase cerrado y crea uno nuevo directo, sin
    // preguntar continuar/de cero.
    await expect(
      page.getByRole("heading", { name: "¿Retomar donde lo dejaste?" }),
    ).toHaveCount(0);

    // Diario con los dos pases; el nuevo panel de Progreso existe (el pase
    // recién creado tiene posición vacía) pero SIN página registrada todavía.
    await expect(diaryEntry(page, "book", 1)).toBeVisible({ timeout: 15_000 });
    await expect(diaryEntry(page, "book", 2)).toBeVisible();
    await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Voy por la página/)).toHaveCount(0);
  });

  test("Regla 6 — Borrar el pase activo reactiva el anterior en vez de esfumar la obra", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page);
    await page.goto(`/libro/${bookId}?tab=log`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Estado heredado de la Regla 5: dos pases, el 2.º (relectura) abierto y
    // ACTIVO sobre el 1.º ya cerrado (Leído).
    await expect(statusBadge(page, "Leyendo")).toBeVisible({ timeout: 15_000 });
    await expect(diaryEntry(page, "book", 2)).toBeVisible();

    // Borrar el pase ACTIVO: la tarjeta de arriba (2.ª lectura).
    await diaryEntry(page, "book", 2)
      .getByRole("button", { name: "Borrar pase" })
      .click();

    // La regresión: la obra desaparecía por completo (se quedaba sin pase
    // activo). El fix promueve el pase anterior, así que la obra SIGUE en la
    // biblioteca, vuelve a estar Leído (el 1.º pase) y el diario se queda con un
    // solo pase. Recarga explícita (con reintento) como el resto de la suite.
    await reloadUntilVisible(page, `/libro/${bookId}?tab=log`, (p) =>
      statusBadge(p, "Leído"),
    );
    await expect(statusBadge(page, "Leído")).toBeVisible({ timeout: 15_000 });
    await expect(diaryEntry(page, "book", 1)).toBeVisible();
    await expect(diaryEntry(page, "book", 2)).toHaveCount(0);

    // Y sigue listada en la biblioteca (la regresión era que se esfumaba).
    await page.goto("/coleccion?tab=todo");
    await expect(
      page.getByText("The Old Man and the Sea").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regla 3 del esquema: abandonar a medias y retomar, en sus DOS ramas
// ("continuar" conserva la página; "de cero" la resetea y abre un pase
// nuevo). Libro propio para no interferir con el ciclo de vida de arriba.
// ─────────────────────────────────────────────────────────────────────────
test.describe("abandonar y retomar (ambas ramas)", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  test("dejar a medias, retomar continuando, dejar de nuevo y retomar de cero", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    let bookId = "";

    try {
      await login(page);
      bookId = await openSearchResult(
        page,
        "book",
        "the metamorphosis kafka",
        "The Metamorphosis",
      );

      await page.goto(`/libro/${bookId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await followItem(page);
      await expect(statusBadge(page, "Pendiente")).toBeVisible({
        timeout: 15_000,
      });

      await statusGroup(page).getByRole("button", { name: "Leyendo" }).click();
      const addSessionLink = page
        .getByRole("link", { name: /registrar sesión/i })
        .first();
      await expect(addSessionLink).toBeVisible({ timeout: 15_000 });

      // Sesión a medias: página 20 (muy lejos del total de una novela corta,
      // así que jamás dispara el auto-cierre de la Regla 2 por accidente).
      const sheet = page.getByRole("dialog");
      await addSessionLink.click();
      await page.waitForURL(/\/sesion\//, { timeout: 15_000 });
      // `#session-page` ya no existe (ver comentario equivalente en Regla 2,
      // arriba): `input[name="page"]` es el selector estable tras la Tarea 5.
      await page.locator('input[name="page"]').fill("20");
      await page.getByRole("button", { name: "Guardar sesión" }).click();
      // NO esperar la navegación con waitForURL: el servidor ya no redirige
      // (Tarea 1-7 de registrar-sesion-v2) — el modal cierra navegando en el
      // cliente, y esa navegación puede completarse ANTES de que este
      // waitForURL se registre, dejándolo esperando un evento que ya pasó
      // (flaky: falló una vez y pasó al reintentar en una corrida completa).
      // La condición real de "la sesión se guardó y el modal se fue" es que
      // el <dialog> deje de estar visible.
      await expect(sheet).toBeHidden({ timeout: 15_000 });

      // REGRESIÓN issue #117, rama "sesión que NO cierra el pase": la otra
      // salida del modal. La Regla 2 cubre la que pasa por la hoja de cierre;
      // esta es la salida directa, y también tiene que dejarnos en la ficha.
      // Va antes del goto de abajo, que la enmascararía por completo.
      await expect(page).toHaveURL(new RegExp(`/libro/${bookId}`), {
        timeout: 15_000,
      });

      await page.goto(`/libro/${bookId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(page.getByText("Voy por la página 20")).toBeVisible({
        timeout: 15_000,
      });

      // Abandonar a medias → Dejado.
      await statusGroup(page)
        .getByRole("button", { name: "Abandonado" })
        .click();
      await dismissCloseSheetIfOpen(page);
      await reloadUntilVisible(page, `/libro/${bookId}?tab=log`, (p) =>
        statusBadge(p, "Abandonado"),
      );
      await expect(statusBadge(page, "Abandonado")).toBeVisible({
        timeout: 15_000,
      });

      // Retomar: la máquina pregunta (dropped → in_progress sin `resume`).
      await statusGroup(page).getByRole("button", { name: "Leyendo" }).click();
      await expect(
        page.getByRole("heading", { name: "¿Retomar donde lo dejaste?" }),
      ).toBeVisible({ timeout: 15_000 });
      await page
        .getByRole("button", { name: "Continuar donde lo dejé" })
        .click();
      await expect(
        page.getByRole("heading", { name: "¿Retomar donde lo dejaste?" }),
      ).toHaveCount(0);

      // "Continuar" es el MISMO pase: la página se conserva. Recarga explícita
      // (con reintento) en vez de fiar el refresco automático: el cierre del
      // <dialog> dispara router.refresh() casi al instante tras el POST, y esa
      // carrera es más lenta y menos determinista en el servidor de
      // producción que una navegación completa (que siempre trae la verdad
      // servida de nuevo).
      await reloadUntilVisible(page, `/libro/${bookId}?tab=log`, (p) =>
        p.getByText("Voy por la página 20"),
      );
      await expect(page.getByText("Voy por la página 20")).toBeVisible({
        timeout: 15_000,
      });

      // Abandonar de nuevo, y esta vez "de cero".
      await statusGroup(page)
        .getByRole("button", { name: "Abandonado" })
        .click();
      await dismissCloseSheetIfOpen(page);
      await reloadUntilVisible(page, `/libro/${bookId}?tab=log`, (p) =>
        statusBadge(p, "Abandonado"),
      );
      await expect(statusBadge(page, "Abandonado")).toBeVisible({
        timeout: 15_000,
      });

      await statusGroup(page).getByRole("button", { name: "Leyendo" }).click();
      await expect(
        page.getByRole("heading", { name: "¿Retomar donde lo dejaste?" }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Empezar de cero" }).click();
      await expect(
        page.getByRole("heading", { name: "¿Retomar donde lo dejaste?" }),
      ).toHaveCount(0);

      // "De cero" archiva el pase dejado y crea uno nuevo: cursor a 0 y dos
      // pases distintos en el diario (el dejado + el nuevo abierto). Misma
      // recarga explícita (con reintento) que arriba, por la misma razón.
      await reloadUntilVisible(page, `/libro/${bookId}?tab=log`, (p) =>
        diaryEntry(p, "book", 2),
      );
      await expect(page.getByText(/^Voy por la página/)).toHaveCount(0);
      await expect(diaryEntry(page, "book", 1)).toBeVisible();
      await expect(diaryEntry(page, "book", 2)).toBeVisible();
      await expect(diaryEntry(page, "book", 3)).toHaveCount(0);
    } finally {
      await cleanupBook(bookId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regla 4 del esquema: gesto único de película — marcar "Vista" directo
// desde Pendiente, sin pasar por "Viendo", encadena la hoja de cierre igual
// que el auto-cierre de sesión.
// ─────────────────────────────────────────────────────────────────────────
test.describe("película de un gesto", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  test("marcar Vista abre la hoja de cierre directamente, sin pasar por Viendo", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    let movieId = "";

    try {
      await login(page);
      movieId = await openSearchResult(page, "movie", "whiplash", "Whiplash");

      await page.goto(`/pelicula/${movieId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await followItem(page);
      await expect(statusBadge(page, "Pendiente")).toBeVisible({
        timeout: 15_000,
      });

      // Un solo gesto: "Vista" sin haber pasado nunca por "Viendo".
      await statusGroup(page).getByRole("button", { name: "Vista" }).click();

      await expect(
        page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
      ).toBeVisible({ timeout: 15_000 });
      await closeSheetSave(page).click();

      await expect(
        page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
      ).toHaveCount(0);
      await expect(statusBadge(page, "Vista")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      if (movieId) {
        const userId = await devtestId();
        await deletePasses("movie", movieId, userId);
        await deleteCatalogRow("movie", movieId);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regla 6 del esquema: serie con revisionado — completar marcando episodios
// (auto-cierre con solo alcanzar el último, sin marcar los anteriores, ver
// rollSeriesProgress en src/lib/series/episode-watch-store.ts), y comprobar
// que un revisionado nuevo separa su propio cursor de la capa "visto alguna
// vez" (§Tarea 8).
// ─────────────────────────────────────────────────────────────────────────
test.describe("serie con revisionado", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  test("completar por episodios auto-cierra, y el revisionado atenúa lo ya visto", async ({
    page,
  }) => {
    // El más pesado de los seis: cada navegación a la ficha de serie
    // sincroniza episodios reales de TMDB (ensureSeriesEpisodes, síncrono).
    // Presupuesto amplio para no confundir latencia de API externa con un
    // fallo real.
    test.setTimeout(150_000);
    let seriesId = "";

    try {
      await login(page);
      seriesId = await openSearchResult(
        page,
        "series",
        "chernobyl",
        "Chernobyl",
      );

      await page.goto(`/serie/${seriesId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await followItem(page);
      await expect(statusBadge(page, "Pendiente")).toBeVisible({
        timeout: 15_000,
      });

      await statusGroup(page).getByRole("button", { name: "Viendo" }).click();
      // La píldora del hero usa el MISMO verbo por tipo de medio que el pill
      // del control ("Viendo"), no el genérico "En curso": así lo escribe la
      // maqueta de la ficha (.hero-status, "En tu biblioteca · Viendo").
      await expect(statusBadge(page, "Viendo")).toBeVisible({
        timeout: 15_000,
      });

      // Pestaña Episodios, vista de lista (checkbox interactivo por episodio;
      // la rejilla es solo de lectura). Marcar solo el ÚLTIMO episodio basta
      // para el auto-cierre: rollSeriesProgress compara contra el más
      // avanzado marcado EN ESTE PASE, no exige haber marcado los anteriores.
      await page.goto(`/serie/${seriesId}?tab=episodes`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.getByRole("button", { name: "Lista", exact: true }).click();

      const lastEpisode = await openLastSeason(page);
      await lastEpisode.getByRole("button", { name: "Visto" }).click();

      await expect(
        page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
      ).toBeVisible({ timeout: 20_000 });
      await closeSheetSave(page).click();
      await expect(
        page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
      ).toHaveCount(0);
      await expect(statusBadge(page, "Vista")).toBeVisible({
        timeout: 15_000,
      });

      // Revisionado: "Viendo" de nuevo abre un SEGUNDO pase.
      await page.goto(`/serie/${seriesId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await statusGroup(page).getByRole("button", { name: "Viendo" }).click();
      // Recarga con reintento antes de comprobar (misma cautela que en el
      // spec del libro): el estado optimista local se resincroniza con la
      // prop `entry` del servidor en cuanto cambia de referencia, y una
      // lectura aún no asentada puede revertir brevemente lo que se acaba de
      // pintar.
      // La píldora del hero usa el MISMO verbo por tipo de medio que el pill
      // del control ("Viendo"), no el genérico "En curso": así lo escribe la
      // maqueta de la ficha (.hero-status, "En tu biblioteca · Viendo").
      await reloadUntilVisible(page, `/serie/${seriesId}?tab=log`, (p) =>
        statusBadge(p, "Viendo"),
      );
      await expect(diaryEntry(page, "series", 1)).toBeVisible();
      await expect(diaryEntry(page, "series", 2)).toBeVisible();

      // El último episodio, visto en el pase ANTERIOR, sale SIN marcar en
      // este pase nuevo — su cursor propio no hereda nada — pero con la capa
      // atenuada "visto alguna vez" (pass_reviews.seenBefore).
      await page.goto(`/serie/${seriesId}?tab=episodes`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.getByRole("button", { name: "Lista", exact: true }).click();
      const lastEpisodeAgain = await openLastSeason(page);
      await expect(
        lastEpisodeAgain.getByText("Visto en otro pase"),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      if (seriesId) {
        const userId = await devtestId();
        await deletePasses("series", seriesId, userId);
        await deleteEpisodeWatches(seriesId, userId);
        await deleteCatalogRow("series", seriesId);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// "Nuevo pase" (plan 06 T4, §2.13): cerrar el pase actual y empezar otro de
// cero en un gesto. Sobre un pase ABIERTO no puede decidir solo cómo termina
// el que archiva —o se completó, o se abandonó— así que pregunta; sobre uno
// ya cerrado actúa directo. Libro propio, para no interferir con los ciclos
// de vida de arriba.
// ─────────────────────────────────────────────────────────────────────────
test.describe("nuevo pase", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  test("sobre un pase abierto pregunta cómo cerrarlo y abre otro a cursor 0", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    let bookId = "";

    try {
      await login(page);
      bookId = await openSearchResult(
        page,
        "book",
        "the trial kafka",
        "The Trial",
      );

      await page.goto(`/libro/${bookId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await followItem(page);
      await expect(statusBadge(page, "Pendiente")).toBeVisible({
        timeout: 15_000,
      });

      // Sobre un PENDIENTE el botón no se pinta: el pase no ha empezado, así
      // que no hay nada que cerrar ni pregunta con respuesta honesta.
      await expect(
        page.getByRole("button", { name: "Nuevo pase" }),
      ).toHaveCount(0);

      await statusGroup(page).getByRole("button", { name: "Leyendo" }).click();
      const addSessionLink = page
        .getByRole("link", { name: /registrar sesión/i })
        .first();
      await expect(addSessionLink).toBeVisible({ timeout: 15_000 });

      // Sesión a medias (página 20, lejísimos del total): deja el pase
      // ABIERTO y con cursor, que es la rama que pregunta.
      const sessionDialog = page.getByRole("dialog");
      await addSessionLink.click();
      await page.waitForURL(/\/sesion\//, { timeout: 15_000 });
      // `#session-page` ya no existe (ver comentario en Regla 2, arriba):
      // `input[name="page"]` es el selector estable tras la Tarea 5.
      await page.locator('input[name="page"]').fill("20");
      await page.getByRole("button", { name: "Guardar sesión" }).click();
      // Mismo motivo que en el spec de abandonar/retomar: sin redirect de
      // servidor, esperar una waitForURL tras el guardado es una carrera con
      // el router.back() del cliente. Se espera a que el <dialog> se oculte.
      await expect(sessionDialog).toBeHidden({ timeout: 15_000 });

      await page.goto(`/libro/${bookId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(page.getByText("Voy por la página 20")).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: "Nuevo pase" }).click();
      const sheet = page.getByRole("heading", {
        name: "¿Cómo cierras el pase actual?",
      });
      await expect(sheet).toBeVisible({ timeout: 15_000 });

      // Acotado al <dialog>: "Leído" es TAMBIÉN una pastilla de
      // StatusSegments, así que a secas el locator sería ambiguo.
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Leído" })
        .click();
      await expect(sheet).toHaveCount(0);

      // El viejo queda archivado en el diario con su cierre, y el nuevo nace
      // a cursor 0 y leyendo. Misma recarga con reintento que los vecinos: el
      // router.refresh() tras el POST es una carrera menos determinista que
      // una navegación completa.
      await reloadUntilVisible(page, `/libro/${bookId}?tab=log`, (p) =>
        diaryEntry(p, "book", 2),
      );
      await expect(diaryEntry(page, "book", 1)).toBeVisible();
      await expect(diaryEntry(page, "book", 2)).toBeVisible();
      await expect(diaryEntry(page, "book", 3)).toHaveCount(0);
      await expect(page.getByText(/^Voy por la página/)).toHaveCount(0);
      await expect(statusBadge(page, "Leyendo")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanupBook(bookId);
    }
  });
});
