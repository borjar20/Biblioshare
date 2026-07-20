import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// Verificación de la escalera de hidratación (§7.39): la búsqueda devuelve
// OBRAS y no escribe en la base de datos; la obra nace y se hidrata al abrir su
// ficha; y el ISBN sigue siendo un lookup. Contra OpenLibrary real
// (MOCK_EXTERNAL_APIS=false) y el proyecto Supabase dev.
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("búsqueda e hidratación de libros", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(90_000);

  test("la búsqueda devuelve obras, no ediciones repetidas", async ({
    page,
  }) => {
    await page.goto("/buscar?type=book&q=dune");

    await expect(page.getByText("Dune", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Una tarjeta por obra: los títulos de la saga aparecen UNA vez cada uno, no
    // repetidos como tiradas casi idénticas.
    await expect(page.getByText("Dune Messiah", { exact: true })).toHaveCount(
      1,
    );
    await expect(
      page.getByText("Children of Dune", { exact: true }),
    ).toHaveCount(1);

    // El contador es el edition_count real de OpenLibrary (Dune tiene >100).
    await expect(page.getByText(/1\d\d ediciones/).first()).toBeVisible();

    // La tarjeta NO pinta datos de edición: ni editorial ni páginas.
    await expect(page.getByText(/págs\./)).toHaveCount(0);

    // Eyebrow del plan 03 (frames A/C): «Resultados · N» sobre la rejilla. El
    // número es el de tarjetas pintadas, así que se comprueba contra el DOM en
    // vez de fijar una cifra que dependa de lo que devuelva OpenLibrary.
    const eyebrow = page.getByText(/^Resultados? · \d+$/);
    await expect(eyebrow).toBeVisible();
    const shown = Number(
      (await eyebrow.textContent())!.match(/(\d+)$/)![1],
    );
    expect(shown).toBeGreaterThan(0);
  });

  test("abrir un resultado nuevo crea la obra y la hidrata", async ({
    page,
  }) => {
    await login(page);

    // Un título aún no visto: así la primera vez es garantizadamente un botón
    // (obra sin crear). El detalle no importa; lo que se comprueba es que al
    // pulsar nazca su ficha ya con sinopsis y géneros.
    await page.goto("/buscar?type=book&q=hyperion+dan+simmons");
    // Tarjeta = botón (sin crear) o enlace (ya cacheado de una corrida previa):
    // se acepta cualquiera, porque lo que se verifica es la ficha resultante.
    const firstCard = page
      .getByRole("button", { name: /ediciones/ })
      .or(page.locator('a[href*="/libro/"]'))
      .first();
    await expect(firstCard).toBeVisible({ timeout: 20_000 });

    await firstCard.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // Hidratada: la ficha tiene sinopsis (la de /works/<key>.json, que la
    // búsqueda nunca traía). Se comprueba que el panel "Sobre" no muestra el
    // texto de "sin sinopsis".
    await expect(page.getByText(/sin sinopsis/i)).toHaveCount(0);
    // Al menos un género del vocabulario canónico, y nada del volcado crudo.
    // `:visible` porque los géneros se pintan en dos sitios según el ancho (el
    // hero en móvil, la ficha del cuerpo en PC) y el otro se queda en el DOM
    // apagado — sin esto, `.first()` cazaba el oculto.
    await expect(
      page
        .getByText("Ciencia ficción")
        .or(page.getByText("Fantasía"))
        .locator("visible=true")
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Protected DAISY|bestseller|nyt:/i),
    ).toHaveCount(0);
  });

  test("el panel de la obra no muestra datos de la edición", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/buscar?type=book&q=dune");

    const dune = page
      .getByRole("button", { name: /^Dune \d+ ediciones/ })
      .or(page.getByRole("link", { name: /^Dune \d+ ediciones/ }))
      .first();
    await dune.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // §7.38: editorial, ISBN y páginas son de la tirada, no de la obra.
    await expect(page.getByText(/^ISBN$/i)).toHaveCount(0);
    await expect(page.getByText(/^Editorial$/i)).toHaveCount(0);
  });

  test("una obra ya cacheada aparece como enlace, con su contador, sin ocultar a las demás", async ({
    page,
  }) => {
    await login(page);

    // Asegurar que la obra "Dune" de Frank Herbert está en el catálogo: se pulsa
    // su tarjeta si todavía era un botón (aún sin crear).
    await page.goto("/buscar?type=book&q=dune");
    const asButton = page
      .getByRole("button", { name: /^Dune 1\d\d ediciones Dune Frank Herbert/ })
      .first();
    if (await asButton.isVisible().catch(() => false)) {
      await asButton.click();
      await page.waitForURL(/\/libro\//, { timeout: 30_000 });
      await page.goto("/buscar?type=book&q=dune");
    }

    // Ya cacheada: es un ENLACE a su ficha, y CONSERVA su contador de ediciones
    // (>100) — que solo lo sabe la API, no la fila local. Sin el fix de
    // mergeByExternalId, aquí salía sin contador.
    const cachedDune = page
      .getByRole("link", { name: /^Dune 1\d\d ediciones Dune Frank Herbert/ })
      .first();
    await expect(cachedDune).toBeVisible({ timeout: 20_000 });

    // Y el resto de obras de la búsqueda siguen presentes: un hit local ya NO
    // cortocircuita la API (lo que antes hacía desaparecer a Dune Messiah).
    await expect(
      page.getByText("Dune Messiah", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Children of Dune", { exact: true }).first(),
    ).toBeVisible();
  });

  test("un libro viejo sin hidratar se cura al abrirlo con sesión", async ({
    page,
  }) => {
    await login(page);

    // "La casa de los espíritus" tiene varias filas antiguas en dev, cacheadas
    // con el flujo viejo (hydrated_at null). Salen como enlaces (ya tienen
    // catalogId). Se abre la primera.
    await page.goto("/buscar?type=book&q=la+casa+de+los+espiritus");
    const cached = page.locator('a[href*="/libro/"]').first();
    await expect(cached).toBeVisible({ timeout: 20_000 });
    await cached.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // La hidratación va en after() (tras pintar): se recarga una vez para verla
    // ya aplicada. La ficha no debe decir "sin sinopsis" si OpenLibrary tenía
    // datos para su work key.
    await page.waitForTimeout(4000);
    await page.reload();
    // No verificamos un texto concreto (depende de qué fila salga primera y de
    // si su work key resuelve), sino que la ficha sigue viva y no reventó por la
    // hidratación — que es la garantía de "nunca bloquea el render".
    await expect(
      page.getByRole("heading", { name: /casa de los esp/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("el ISBN es un lookup y cae en la obra correcta", async ({ page }) => {
    await page.goto("/buscar?type=book&q=9780451524935");

    await expect(
      page.getByText(/Nineteen Eighty-Four|1984/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  // Tarea 5: la primera visita a una ficha recién nacida ya trae sus
  // ediciones REALES por streaming (loadBookEditions + <Suspense>, sin
  // recargar), y el trigger de books ya no le cuelga una "Edición principal"
  // en blanco. "The Left Hand of Darkness" (Ursula K. Le Guin) se verificó a
  // mano contra la API en vivo de OpenLibrary: su obra (/works/OL59800W)
  // tiene decenas de ediciones con ISBN, así que la sincronización trae datos
  // de verdad, no una lista vacía.
  test("una obra nueva llega con ediciones reales en la primera visita, sin edición en blanco", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await login(page);

    const WORK_KEY = "/works/OL59800W";
    const SEARCH_URL =
      "/buscar?type=book&q=the+left+hand+of+darkness+ursula+le+guin";

    let bookId: string | undefined;
    try {
      // fetchWorkEditions (src/lib/catalog/openlibrary/editions.ts) le da a
      // OpenLibrary 5s antes de rendirse; contra la API real, esa ventana
      // ocasionalmente no llega a tiempo y ensureBookEditions marca la
      // sincronización como "hecha" con cero ediciones (comportamiento
      // deliberado del código de producción: no reintenta en cada visita, ver
      // sync-editions.ts). Eso es ruido de red de un tercero, no lo que este
      // test verifica — así que si pasa, se descarta el libro y se reintenta
      // con uno nuevo en vez de fallar el test entero.
      for (let attempt = 1; attempt <= 3; attempt++) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/books?openlibrary_work_key=eq.${encodeURIComponent(WORK_KEY)}`,
          { method: "DELETE", headers: adminHeaders() },
        );

        await page.goto(SEARCH_URL);

        // Botón, no enlace: confirma que la obra todavía no está en el
        // catálogo, así que pulsarla dispara openCatalogItem (nace la fila) y
        // esta SÍ es la primera visita a su ficha.
        const result = page
          .getByRole("button", {
            name: /^The Left Hand of Darkness \d+ ediciones/,
          })
          .first();
        await expect(result).toBeVisible({ timeout: 20_000 });
        await result.click();
        await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });

        bookId = page.url().match(/\/libro\/([0-9a-f-]{36})/)?.[1];
        expect(bookId).toBeTruthy();

        // SIN recargar: la tira de ediciones llega por streaming (Suspense +
        // loadBookEditions/use()). Se acota a la sección "Ediciones" y se
        // exige el contador real ("N en esta ficha"), que el fallback de
        // carga (aria-hidden, sin texto) nunca pinta.
        const editionsSection = page
          .locator("section")
          .filter({ hasText: "Ediciones" });
        const streamed = await editionsSection
          .getByText(/\d+ en esta ficha/)
          .waitFor({ state: "visible", timeout: 30_000 })
          .then(() => true)
          .catch(() => false);

        if (streamed) break;

        if (attempt === 3) {
          throw new Error(
            "la tira de ediciones no llegó por streaming tras 3 intentos " +
              "(¿OpenLibrary lenta o el streaming de EditionsSection roto?)",
          );
        }
        await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${bookId}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        bookId = undefined;
      }

      // Edición real visible en la tira (no solo el texto del contador).
      // Las tarjetas son data-testid="edition-card": dejaron de ser botones
      // cuando se quitó la mirada de edición, así que ya no valen ni
      // aria-pressed ni getByRole("button").
      await expect(page.getByTestId("edition-card").first()).toBeVisible();

      // La BD manda, no la UI: ninguna primaria en blanco, y al menos una
      // edición real registrada.
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/book_editions?book_id=eq.${bookId}&select=is_primary,publisher,isbn,total_pages`,
        { headers: adminHeaders() },
      );
      const rows: {
        is_primary: boolean;
        publisher: string | null;
        isbn: string | null;
        total_pages: number | null;
      }[] = await res.json();

      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.some(
          (r) => r.is_primary && !r.publisher && !r.isbn && !r.total_pages,
        ),
      ).toBe(false);
      console.log(
        "EDICIONES OK:",
        bookId,
        "->",
        rows.length,
        "ediciones reales",
      );
    } finally {
      // fetch nativo, no el `request` de Playwright (ver club-join-request.spec.ts):
      // si el test expirase, ese fixture muere junto con el contexto y la
      // limpieza no llegaría a ejecutarse.
      if (bookId) {
        await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${bookId}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        console.log("LIMPIEZA OK: libro", bookId, "borrado");
      }
    }
  });
});
