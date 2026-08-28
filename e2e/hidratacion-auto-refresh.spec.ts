import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function hydratedAt(id: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?id=eq.${id}&select=hydrated_at`,
    { headers: adminHeaders() },
  );
  const filas = (await res.json()) as { hydrated_at: string | null }[];
  return filas[0]?.hydrated_at ?? null;
}

// La ficha de una obra sin hidratar se abre casi siempre antes de que la
// hidratación de after() termine (el presupuesto de openCatalogItem son 1200 ms
// y la cadena de fuentes no suele caber). La isla HydrationWatch sonda
// `books.hydrated_at` desde el navegador y hace router.refresh() cuando la fila
// aparece hidratada — sin ella, la ficha nacía vacía y así se quedaba hasta que
// el usuario recargara a mano.
//
// Este spec verifica el circuito ENTERO con la app y OpenLibrary reales: el
// sondeo sale por la red, el refresh RSC ocurre SIN recarga manual, y la fila
// queda hidratada detrás. Contra el proyecto Supabase dev.
test.describe("auto-refresh de la ficha al terminar la hidratación", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  test("una ficha sin hidratar se refresca sola cuando after() termina", async ({
    page,
  }) => {
    // Espera a OpenLibrary de verdad, como el spec de curación de libros viejos.
    test.setTimeout(180_000);

    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // Una obra que YA se hidrató alguna vez (work key resuelta y marca puesta):
    // así la re-hidratación es un camino conocido y el test no apuesta a que
    // OpenLibrary conozca una obra arbitraria. Se devuelve a sin hidratar, que
    // es exactamente el estado de una fila recién nacida cuando el presupuesto
    // de 1200 ms no llegó.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/books?openlibrary_work_key=not.is.null&hydrated_at=not.is.null&select=id&limit=1`,
      { headers: adminHeaders() },
    );
    const filas = (await res.json()) as { id: string }[];
    test.skip(filas.length === 0, "no hay libros hidratados con work key en dev");
    const bookId = filas[0].id;

    await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${bookId}`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ hydrated_at: null }),
    });

    // Los dos testigos se arman ANTES de abrir la ficha:
    //  - el sondeo de la isla: un GET del navegador a /rest/v1/books pidiendo
    //    hydrated_at (no lo hace nadie más en esta página);
    //  - el refresh: un fetch RSC a la URL de la propia ficha. La carga inicial
    //    es HTML normal (sin cabecera RSC), así que verlo prueba que
    //    router.refresh() corrió — sin ninguna recarga manual de por medio.
    const sondeo = page.waitForRequest(
      (r) =>
        r.url().includes("/rest/v1/books") && r.url().includes("hydrated_at"),
      { timeout: 60_000 },
    );
    const refresh = page.waitForRequest(
      (r) => r.url().includes(`/libro/${bookId}`) && r.headers()["rsc"] === "1",
      { timeout: 120_000 },
    );

    await page.goto(`/libro/${bookId}`);

    await sondeo;
    await refresh;

    // Y detrás del refresh está el motivo del refresh: la fila hidratada.
    expect(await hydratedAt(bookId)).not.toBeNull();
  });
});
