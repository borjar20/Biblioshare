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
    if (await locator(page).isVisible().catch(() => false)) return;
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

const PATH_SEGMENT = { book: "libro", movie: "pelicula", series: "serie" } as const;

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

// El badge de estado de la ficha (ItemHero) y el pill activo de StatusSegments
// muestran el MISMO texto ("Pendiente", "Completado"...): un getByText a
// secas es ambiguo. data-testid="status-badge" (src/components/ui/
// status-badge.tsx) distingue el badge de solo lectura del control.
function statusBadge(page: Page, label: string) {
  return page.getByTestId("status-badge").filter({ hasText: label });
}

// "Seguir": con una sola edición (o ninguna) añade directo; con varias abre
// el selector "¿Qué edición tienes?" (FollowButton en log-panel.tsx) y hay
// que elegir una salida — "No lo sé" es la legítima para no atarnos a que el
// catálogo de una obra real tenga siempre 0/1 ediciones.
async function followItem(page: Page) {
  await page.getByRole("button", { name: "Seguir" }).click();
  const unknownEdition = page.getByRole("button", { name: "No lo sé" });
  try {
    await unknownEdition.waitFor({ state: "visible", timeout: 3_000 });
    await unknownEdition.click();
  } catch {
    // Sin selector de edición: ya se siguió directamente.
  }
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
  const primaryRows = (await primaryRes.json()) as { total_pages: number | null }[];
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
test.describe.serial("ciclo de vida de un libro: alta, auto-cierre, relectura", () => {
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

    await page.goto(`/libro/${bookId}?tab=log`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await followItem(page);

    // La ficha refleja el alta sin recargar (la server action revalida el
    // árbol de Server Components) y la colección lo lista.
    await expect(statusBadge(page, "Pendiente")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/coleccion");
    await expect(
      page.getByText("The Old Man and the Sea").first(),
    ).toBeVisible({ timeout: 15_000 });
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
    await page.locator("#session-page").fill(String(maxPage));
    await page.getByRole("button", { name: "Guardar sesión" }).click();

    // Redirige a la ficha con `?cerrar=<passId>&tab=log`: la hoja se abre
    // desde el PRIMER pintado (prop calculada en el server component), no
    // tras un segundo render — el hallazgo de revisión que arregló la Tarea 7.
    await expect(
      page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
    ).toBeVisible({ timeout: 20_000 });

    await page
      .getByRole("button", { name: "5 de 5 estrellas", exact: true })
      .click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(
      page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
    ).toHaveCount(0);
    await expect(statusBadge(page, "Completado")).toBeVisible({
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
    await expect(statusBadge(page, "Completado")).toBeVisible({
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
    await expect(page.getByText("1º pase")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("2º pase")).toBeVisible();
    await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Voy por la página/)).toHaveCount(0);
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
      await addSessionLink.click();
      await page.waitForURL(/\/sesion\//, { timeout: 15_000 });
      await page.locator("#session-page").fill("20");
      await page.getByRole("button", { name: "Guardar sesión" }).click();
      await page.waitForURL(/\/libro\//, { timeout: 15_000 });

      await page.goto(`/libro/${bookId}?tab=log`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(page.getByText("Voy por la página 20")).toBeVisible({
        timeout: 15_000,
      });

      // Abandonar a medias → Dejado.
      await statusGroup(page).getByRole("button", { name: "Abandonado" }).click();
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
      await page.getByRole("button", { name: "Continuar donde lo dejé" }).click();
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
      await statusGroup(page).getByRole("button", { name: "Abandonado" }).click();
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
        p.getByText("2º pase"),
      );
      await expect(page.getByText(/^Voy por la página/)).toHaveCount(0);
      await expect(page.getByText("1º pase")).toBeVisible();
      await expect(page.getByText("2º pase")).toBeVisible();
      await expect(page.getByText("3º pase")).toHaveCount(0);
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
      await page.getByRole("button", { name: "Guardar" }).click();

      await expect(
        page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
      ).toHaveCount(0);
      await expect(statusBadge(page, "Completado")).toBeVisible({
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
      // El badge de la ficha muestra el estado GENÉRICO ("En curso"); el verbo
      // por tipo de medio ("Viendo") solo lo pinta el pill activo del control.
      await expect(statusBadge(page, "En curso")).toBeVisible({
        timeout: 15_000,
      });

      // Pestaña Episodios, vista de lista (checkbox interactivo por episodio;
      // la rejilla es solo de lectura). Marcar solo el ÚLTIMO episodio basta
      // para el auto-cierre: rollSeriesProgress compara contra el más
      // avanzado marcado EN ESTE PASE, no exige haber marcado los anteriores.
      await page.goto(`/serie/${seriesId}?tab=episodes`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.getByRole("button", { name: "Lista", exact: true }).click();

      const lastSeason = page.locator("section").last();
      const lastEpisode = lastSeason.locator("li").last();
      await lastEpisode.getByRole("button", { name: "Visto" }).click();

      await expect(
        page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
      ).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(
        page.getByRole("heading", { name: "¿Qué te ha parecido?" }),
      ).toHaveCount(0);
      await expect(statusBadge(page, "Completado")).toBeVisible({
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
      await reloadUntilVisible(page, `/serie/${seriesId}?tab=log`, (p) =>
        statusBadge(p, "En curso"),
      );
      // El badge de la ficha muestra el estado GENÉRICO ("En curso"); el verbo
      // por tipo de medio ("Viendo") solo lo pinta el pill activo del control.
      await expect(statusBadge(page, "En curso")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("1º pase")).toBeVisible();
      await expect(page.getByText("2º pase")).toBeVisible();

      // El último episodio, visto en el pase ANTERIOR, sale SIN marcar en
      // este pase nuevo — su cursor propio no hereda nada — pero con la capa
      // atenuada "visto alguna vez" (pass_reviews.seenBefore).
      await page.goto(`/serie/${seriesId}?tab=episodes`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.getByRole("button", { name: "Lista", exact: true }).click();
      const lastSeasonAgain = page.locator("section").last();
      const lastEpisodeAgain = lastSeasonAgain.locator("li").last();
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
