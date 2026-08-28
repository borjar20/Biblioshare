import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// `hydrated_at` de una fila del catálogo, leído por REST con service_role: es
// el único sitio donde se ve si la hidratación perezosa corrió de verdad. La
// ficha no sirve de testigo — una obra sin sinopsis en OpenLibrary se pinta
// igual que una que nunca se hidrató (#751).
async function hydratedAt(tabla: string, id: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${tabla}?id=eq.${id}&select=hydrated_at`,
    { headers: adminHeaders() },
  );
  const filas = (await res.json()) as { hydrated_at: string | null }[];
  return filas[0]?.hydrated_at ?? null;
}

async function marcarSinHidratar(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ hydrated_at: null }),
  });
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

    // La tarjeta ya NO lleva contador de ediciones: era el `edition_count` de
    // OpenLibrary, que no coincide con las ediciones identificadas del catálogo
    // propio y por eso se quitó (2026-08-28).
    await expect(page.getByText(/\d+ ediciones/)).toHaveCount(0);

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
    const firstCard = page.getByTestId("search-result-card").first();
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
      .getByTestId("search-result-card")
      .filter({ has: page.getByText("Dune", { exact: true }) })
      .first();
    await expect(dune).toBeVisible({ timeout: 20_000 });
    await dune.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // §7.38: editorial, ISBN y páginas son de la tirada, no de la obra.
    await expect(page.getByText(/^ISBN$/i)).toHaveCount(0);
    await expect(page.getByText(/^Editorial$/i)).toHaveCount(0);
  });

  test("una obra ya cacheada aparece como enlace, sin ocultar a las demás", async ({
    page,
  }) => {
    await login(page);

    // La obra testigo es "Children of Dune", NO "Dune" (issue #228). El test
    // apuntaba a "Dune" de Frank Herbert (`/works/OL893415W`) y llevaba en rojo
    // permanente desde que OpenLibrary dejó de devolverla: hoy `q=dune` no la
    // trae ni entre los 100 primeros (comprobado contra search.json el
    // 2026-07-29; la obra existe, `/works/OL893415W.json` responde 200 — es su
    // buscador).
    //
    // "Children of Dune" es hoy el PRIMER resultado de `q=dune` y está en el
    // catálogo dev con la misma work key (`/works/OL893516W`), que es lo que
    // este test necesita: una obra que esté en las dos fuentes a la vez.
    //
    // (El contador de ediciones que este test también vigilaba dejó de existir:
    // la tarjeta ya no lo pinta — 2026-08-28.)
    await page.goto("/buscar?type=book&q=dune");
    const asButton = page
      .locator('button[data-testid="search-result-card"]')
      .filter({ has: page.getByText("Children of Dune", { exact: true }) })
      .first();
    if (await asButton.isVisible().catch(() => false)) {
      await asButton.click();
      await page.waitForURL(/\/libro\//, { timeout: 30_000 });
      await page.goto("/buscar?type=book&q=dune");
    }

    // Ya cacheada: es un ENLACE a su ficha.
    const cached = page
      .locator('a[data-testid="search-result-card"]')
      .filter({ has: page.getByText("Children of Dune", { exact: true }) })
      .first();
    await expect(cached).toBeVisible({ timeout: 20_000 });

    // Y el resto de obras de la búsqueda siguen presentes: un hit local ya NO
    // cortocircuita la API (lo que antes hacía desaparecer a Dune Messiah).
    await expect(
      page.getByText("Dune Messiah", { exact: true }).first(),
    ).toBeVisible();
    // Además de lo local, la lista sigue trayendo obras que NO están en el
    // catálogo: se reconocen porque son BOTONES, no enlaces (§7.39, la búsqueda
    // no crea filas). Se comprueba la FORMA, no un título concreto — cuál sea
    // depende del ranking de OpenLibrary, que es justo lo que rompió este test.
    await expect(
      page.locator('button[data-testid="search-result-card"]').first(),
    ).toBeVisible();
  });

  test("un libro viejo sin hidratar se cura al abrirlo con sesión", async ({
    page,
  }) => {
    // Más margen que el resto del fichero: este test espera a que OpenLibrary
    // conteste de verdad, reintentando con recargas.
    test.setTimeout(180_000);
    await login(page);

    // "La casa de los espíritus" tiene varias filas antiguas en dev, cacheadas
    // con el flujo viejo (hydrated_at null). Salen como enlaces (ya tienen
    // catalogId). Se abre la primera.
    await page.goto("/buscar?type=book&q=la+casa+de+los+espiritus");
    const cached = page.locator('a[href*="/libro/"]').first();
    await expect(cached).toBeVisible({ timeout: 20_000 });
    await cached.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const bookId = page.url().match(/\/libro\/([0-9a-f-]{36})/)![1];

    // La fila se DEVUELVE a sin hidratar y se reabre la ficha. Sin esto el test
    // dependería de qué fila saliera primera en la búsqueda: si ya venía
    // hidratada, el guard `if (book.hydrated_at !== null) return` corta y no se
    // estaría probando nada.
    await marcarSinHidratar(bookId);
    await page.goto(`/libro/${bookId}`);
    await expect(
      page.getByRole("heading", { name: /casa de los esp/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // EL ASERTO: `hydrated_at` deja de ser null.
    //
    // Antes esto solo comprobaba que la ficha «seguía viva», y por eso pasó en
    // verde durante semanas mientras la hidratación NO CORRÍA (#751): el
    // callback recibía el cliente de la petición, que lee cookies en cada
    // consulta, Next lo rechazaba dentro de `after()` y el `try/catch` de
    // `ensureBookHydrated` se comía la excepción. Un test que solo mira que la
    // página no reviente no distingue «se hidrató» de «se tragó el error».
    //
    // Se comprueba la COLUMNA y no la sinopsis a propósito: si la work key no
    // resuelve, `markHydrated` marca igual la fila (para no reintentar en cada
    // visita) y no habría sinopsis que ver — pero la hidratación sí corrió.
    //
    // Se reintenta RECARGANDO, no solo esperando más: si OpenLibrary falla o
    // tarda, `ensureBookHydrated` NO marca la fila a propósito («la API falló:
    // no marcar, reintentar en la siguiente visita»), así que esperar sentado
    // no cambia nada y lo que el producto hace es curarla en la visita
    // siguiente. Esperar sin recargar convertía este aserto en un dado cargado
    // contra la latencia de una API de terceros.
    await expect
      .poll(
        async () => {
          const marca = await hydratedAt("books", bookId);
          if (marca) return marca;
          await page.reload();
          return null;
        },
        {
          timeout: 60_000,
          intervals: [4000],
          message: "la hidratación en after() no llegó a escribir hydrated_at",
        },
      )
      .not.toBeNull();
  });

  test("el ISBN es un lookup y cae en la obra correcta", async ({ page }) => {
    await page.goto("/buscar?type=book&q=9780451524935");

    await expect(
      page.getByText(/Nineteen Eighty-Four|1984/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
