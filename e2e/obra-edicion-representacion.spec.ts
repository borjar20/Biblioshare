import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Cobertura end-to-end del plan «Obra / Edición / Representación» (Task 17).
// Los tres flujos que la rama estrenó y que ningún spec cubría:
//
//   1. Alta desde /buscar → la obra nace y se hidrata con PROCEDENCIA por
//      campo (`books.repr_meta`), que es lo que distingue la hidratación v3
//      de la v2. El spec viejo (busqueda-hidratacion) solo mira `hydrated_at`,
//      y esa columna se marca igual aunque no se escriba un solo campo.
//   2. Identificar la edición de un pase eligiendo una candidata EN VIVO de
//      OpenLibrary (bloque 3 del selector). El servidor re-deriva por ISBN y
//      persiste UNA sola tirada: es la prueba de que el sync masivo murió sin
//      dejar al usuario sin forma de decir cuál es la suya.
//   3. Importar un CSV con ISBN puebla `passes.edition_id`. Antes de la rama,
//      `match-row.ts` llamaba a `findOrCreateCatalogItem` sin `userId`, así que
//      `register_book_edition` (que exige `auth.uid()`) salía por la puerta de
//      atrás y NINGÚN ISBN de una importación llegaba a `book_editions`.
//
// Contra APIs reales (MOCK_EXTERNAL_APIS=false) y el proyecto Supabase dev: el
// mock de búsqueda cortocircuita en `searchMockData` ANTES del fan-out, así que
// no sirve para ejercitar nada de esto.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Obra de OpenLibrary con 250+ ediciones, casi todas con ISBN: el bloque de
// candidatas del selector nunca sale vacío. Se comprueba que responde 200 antes
// de dar el test por fallado (si OL tira la obra, como ya hizo con `/works/
// OL893415W` — ver la cabecera de busqueda-hidratacion.spec.ts — el rojo es
// suyo, no nuestro).
const WORK_KEY = "/works/OL27448W";

// ISBN13 de las dos filas con ISBN de e2e/fixtures/goodreads-min.csv.
const CSV_ISBNS = ["9780441172719", "9781635575637"];

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(pathname: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
}

async function restJson<T>(pathname: string): Promise<T> {
  return (await (await rest(pathname)).json()) as T;
}

async function userId(): Promise<string> {
  const rows = await restJson<{ user_id: string }[]>(
    `profiles?select=user_id&username=eq.${USERNAME}`,
  );
  return rows[0].user_id;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("obra / edición / representación", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  // ───────────────────────────────────────────────────────────────────────
  // 1. La hidratación v3 deja procedencia por campo
  // ───────────────────────────────────────────────────────────────────────
  test("abrir una obra la hidrata dejando procedencia por campo en repr_meta", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await login(page);

    // Se llega por el camino real (buscar → tarjeta → ficha) para que la obra
    // nazca como nace en producción. Cuál sea el título da igual: lo que se
    // mide es la fila que queda detrás.
    await page.goto("/buscar?type=book&q=hyperion+dan+simmons");
    const card = page
      .getByRole("button", { name: /ediciones/ })
      .or(page.locator('a[href*="/libro/"]'))
      .first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const bookId = page.url().match(/\/libro\/([0-9a-f-]{36})/)![1];

    // La fila se devuelve a virgen y se reabre. Sin esto el test dependería de
    // si la obra ya venía hidratada de una corrida anterior: el guard
    // `if (book.hydrated_at !== null) return` cortaría y no se probaría nada.
    // Con service_role NO se dispara `trg_stamp_books_repr_manual`, que estampa
    // `source:'manual'` solo cuando hay `auth.uid()` — si esta limpieza fuera
    // con el cliente del usuario, dejaría la fila marcada como curada a mano y
    // la hidratación posterior ya no podría tocarla.
    await rest(`books?id=eq.${bookId}`, {
      method: "PATCH",
      body: JSON.stringify({ hydrated_at: null, repr_meta: null }),
    });
    await page.goto(`/libro/${bookId}`);

    // EL ASERTO: `repr_meta` deja de ser null y trae, por CAMPO, de dónde salió
    // el dato y en qué idioma. Es lo que hace posible la política ES→EN→otro:
    // sin rango de idioma guardado, un pase posterior no puede decidir si lo
    // que hay es mejorable o si es una curación intocable.
    //
    // Se recarga entre intentos, no se espera sentado: si OpenLibrary falla,
    // `ensureBookHydrated` NO marca la fila a propósito (para reintentar en la
    // visita siguiente), así que esperar más no cambia nada — lo que el
    // producto hace es curarla en la visita siguiente.
    type ReprMeta = Record<string, { source?: string; lang?: string }>;
    async function leerReprMeta(): Promise<ReprMeta | null> {
      const rows = await restJson<{ repr_meta: ReprMeta | null }[]>(
        `books?id=eq.${bookId}&select=repr_meta`,
      );
      return rows[0]?.repr_meta ?? null;
    }

    await expect
      .poll(
        async () => {
          const actual = await leerReprMeta();
          if (actual) return actual;
          await page.reload();
          return null;
        },
        {
          timeout: 90_000,
          intervals: [4000],
          message: "la hidratación v3 no llegó a escribir repr_meta",
        },
      )
      .not.toBeNull();

    const meta = (await leerReprMeta())!;

    // El título es el único campo de representación que SIEMPRE se escribe (una
    // obra sin título no existe); portada y sinopsis dependen de lo que la API
    // tenga, así que fijarlos convertiría un hueco de OpenLibrary en un rojo
    // nuestro.
    expect(Object.keys(meta)).toContain("title");
    // Procedencia real, del vocabulario cerrado del plan — no un objeto vacío.
    expect(["openlibrary", "google_books", "wikidata", "manual"]).toContain(
      meta.title.source,
    );
    // Y rango de idioma: es lo que decide si una hidratación futura puede
    // mejorar este campo o tiene que dejarlo en paz.
    expect(["es", "en", "other", "unknown"]).toContain(meta.title.lang);
  });

  // ───────────────────────────────────────────────────────────────────────
  // 2. Identificar la edición del pase con una candidata en vivo de OL
  // ───────────────────────────────────────────────────────────────────────
  test("elegir una candidata de OpenLibrary persiste esa ÚNICA edición y la asocia al pase", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // La obra es desechable y de título único por ejecución (misma convención
    // que alta-manual.spec.ts): así se puede borrar entera al final sin tocar
    // el catálogo real, y el bloque «Ediciones de la ficha» nace vacío, que es
    // el caso que importa —el libro recién añadido, donde el selector viejo no
    // se pintaba nunca—.
    const title = `Obra e2e ediciones ${Date.now()}`;
    let bookId: string | null = null;
    const uid = await userId();

    try {
      // `hydrated_at` a una fecha: la ficha no debe re-hidratarse y pisar el
      // título de mentira con el real de la obra de OpenLibrary. La work key SÍ
      // es real: es de donde `fetchEditionCandidates` saca las candidatas.
      const insert = await rest("books?select=id", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          title,
          author: "Autor e2e",
          openlibrary_work_key: WORK_KEY,
          hydrated_at: new Date().toISOString(),
        }),
      });
      expect(insert.ok).toBe(true);
      bookId = ((await insert.json()) as { id: string }[])[0].id;

      // Un pase ABIERTO y SIN edición: es la única situación en la que el panel
      // de progreso hace la pregunta (`shouldAskForEdition`).
      const passRes = await rest("passes?select=id", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: uid,
          item_type: "book",
          item_id: bookId,
          status: "in_progress",
          is_active: true,
          position: {},
          is_public: true,
        }),
      });
      expect(passRes.ok).toBe(true);
      const passId = ((await passRes.json()) as { id: string }[])[0].id;

      await login(page);
      // `?tab=log` es «Mi registro», la pestaña donde vive el panel de progreso
      // (y con él la pregunta de la edición). La ficha abre en «Información».
      await page.goto(`/libro/${bookId}?tab=log`);

      // La pregunta se hace: es el arreglo de `shouldAskForEdition`. Con el
      // umbral viejo (`editions.length > 1`) esto no se pintaba, porque la
      // ficha tiene CERO ediciones.
      await expect(
        page.getByText("¿Qué edición estás leyendo?"),
      ).toBeVisible({ timeout: 30_000 });

      // Y con ella las dos vías nuevas. El CTA del ISBN va ANTES que las
      // candidatas a propósito (es el camino exacto); que exista es parte del
      // contrato de la pieza.
      await expect(
        page.getByRole("link", { name: /Escanea o teclea el ISBN/ }),
      ).toBeVisible();

      // El bloque 3 nace CERRADO y solo llama a OpenLibrary al desplegarlo: si
      // se cargara al abrir el panel, cada apertura sería una llamada a la API.
      const masEdiciones = page.getByText("Más ediciones (OpenLibrary)");
      await expect(masEdiciones).toBeVisible();
      await masEdiciones.click();

      // Las candidatas llegan en vivo. Se localizan por su ISBN pintado, que es
      // lo que el servidor recibirá — no por editorial ni año, que OL puede no
      // traer.
      const candidata = page
        .locator("button", { hasText: /ISBN \d{10,13}/ })
        .first();
      await expect(candidata).toBeVisible({ timeout: 60_000 });
      const isbnMostrado = (await candidata.textContent())!.match(
        /ISBN (\d{10,13})/,
      )![1];

      // NADA se ha escrito todavía: enseñar candidatas no persiste ediciones.
      // Es la promesa central de la muerte del sync masivo.
      expect(
        await restJson<unknown[]>(`book_editions?select=id&book_id=eq.${bookId}`),
      ).toHaveLength(0);

      await candidata.click();

      // La pregunta desaparece sola al contestarla (`onCandidatePicked`).
      await expect(
        page.getByText("¿Qué edición estás leyendo?"),
      ).toHaveCount(0, { timeout: 30_000 });

      // ASERTO 1: se persistió UNA sola edición, no el catálogo entero de la
      // obra. Con el sync viejo aquí habría cientos de filas.
      const ediciones = await restJson<{ id: string; isbn: string | null }[]>(
        `book_editions?select=id,isbn&book_id=eq.${bookId}`,
      );
      expect(ediciones).toHaveLength(1);

      // ASERTO 2: es la que el usuario señaló. El cliente solo mandó el ISBN;
      // el resto de metadatos los re-derivó el servidor contra OpenLibrary, así
      // que este es el único campo que ata lo que se vio con lo que se guardó.
      expect(ediciones[0].isbn).toBe(isbnMostrado);

      // ASERTO 3: y quedó asociada al PASE. Sin esto la edición estaría en el
      // catálogo pero el progreso del usuario seguiría midiéndose contra las
      // páginas orientativas de la obra.
      const pases = await restJson<{ edition_id: string | null }[]>(
        `passes?select=edition_id&id=eq.${passId}`,
      );
      expect(pases[0].edition_id).toBe(ediciones[0].id);
    } finally {
      if (bookId) {
        // Pase primero, obra después: `catalog_item_has_passes` bloquea el
        // orden inverso. Y las ediciones antes que la obra por la FK.
        await rest(`passes?item_id=eq.${bookId}&item_type=eq.book`, {
          method: "DELETE",
        });
        await rest(`book_editions?book_id=eq.${bookId}`, { method: "DELETE" });
        await rest(`books?id=eq.${bookId}`, { method: "DELETE" });
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // 3. El ISBN de una fila del CSV registra su edición y la asocia al pase
  // ───────────────────────────────────────────────────────────────────────
  test.describe("importación con ISBN", () => {
    // Las obras de OpenLibrary que el CSV crea NO se borran (catálogo real,
    // convención de catalogo-server-authoritative.spec.ts); los PASES del
    // usuario de prueba sí, y hay que hacerlo antes y después: si el pase
    // activo ya existe, `ensureActivePass` se topa con el 23505, devuelve el
    // pase de siempre y NO le escribe `edition_id` — el test pasaría a medir
    // la corrida anterior en vez de esta.
    async function limpiarPases() {
      const uid = await userId();
      const ediciones = await restJson<{ book_id: string }[]>(
        `book_editions?select=book_id&isbn=in.(${CSV_ISBNS.join(",")})`,
      );
      const porIsbnSuelto = await restJson<{ id: string }[]>(
        `books?select=id&isbn=in.(${CSV_ISBNS.join(",")})`,
      );
      const bookIds = [
        ...new Set([
          ...ediciones.map((e) => e.book_id),
          ...porIsbnSuelto.map((b) => b.id),
        ]),
      ];
      if (bookIds.length === 0) return;
      await rest(
        `passes?user_id=eq.${uid}&item_type=eq.book&item_id=in.(${bookIds.join(",")})`,
        { method: "DELETE" },
      );
    }

    async function limpiarPendientes() {
      const uid = await userId();
      await rest(
        `pending_import_rows?user_id=eq.${uid}&status=eq.pending`,
        { method: "DELETE" },
      );
    }

    test.beforeEach(limpiarPases);
    test.afterEach(async () => {
      await limpiarPases();
      await limpiarPendientes();
    });

    test("una fila con ISBN deja el pase apuntando a esa edición", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await login(page);
      await page.goto("/importar");

      await page.setInputFiles(
        'input[type="file"]',
        path.join(__dirname, "fixtures", "goodreads-min.csv"),
      );
      await page.getByRole("button", { name: "Subir archivo" }).click();

      // El resumen tarda: cada fila dispara búsquedas contra OpenLibrary.
      // El resumen pinta VARIOS contadores («Importados», «Ya en tu
      // biblioteca», «Sin match»…), así que se espera al primero que aparezca:
      // sin `.first()` el locator casa con dos y Playwright falla por modo
      // estricto en vez de por lo que se quería medir.
      await expect(
        page.getByText(/Importados|Ya en tu biblioteca/).first(),
      ).toBeVisible({ timeout: 180_000 });

      const uid = await userId();

      // EL ASERTO: al menos una de las dos filas con ISBN del CSV dejó su
      // tirada en `book_editions` Y el pase apuntando a ella. No se exigen las
      // dos: si OpenLibrary no resuelve uno de los dos ISBN, la fila degrada a
      // `edition_id` null a propósito (es un estado legítimo, no un error) y
      // clavarlas convertiría un hueco de la API en un rojo nuestro. Lo que NO
      // es legítimo —y es justo lo que fallaba— es que NINGUNA lo consiga.
      const ediciones = await restJson<{ id: string; isbn: string; book_id: string }[]>(
        `book_editions?select=id,isbn,book_id&isbn=in.(${CSV_ISBNS.join(",")})`,
      );
      expect(ediciones.length).toBeGreaterThan(0);

      const pases = await restJson<{ edition_id: string | null; item_id: string }[]>(
        `passes?select=edition_id,item_id&user_id=eq.${uid}&item_type=eq.book` +
          `&item_id=in.(${[...new Set(ediciones.map((e) => e.book_id))].join(",")})`,
      );
      expect(pases.length).toBeGreaterThan(0);

      // El `edition_id` del pase es una de las ediciones que el ISBN del CSV
      // registró — no un id cualquiera y no null.
      const idsDeEdicion = new Set(ediciones.map((e) => e.id));
      const conEdicion = pases.filter(
        (p) => p.edition_id !== null && idsDeEdicion.has(p.edition_id),
      );
      expect(conEdicion.length).toBeGreaterThan(0);
    });
  });
});
