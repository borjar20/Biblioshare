import { test, expect, type Page } from "@playwright/test";

// Alta manual de catálogo (/buscar/manual). Cubre el cabo suelto de #674: la
// parte F revocó el INSERT directo sobre books/movies/series y este call site se
// quedó atrás, así que el formulario moría con 42501 ("permission denied for
// table books") y solo pintaba el error genérico. Desde la migración
// 20260878_manual_catalog_item.sql el alta pasa por
// `register_manual_catalog_item` (SECURITY DEFINER).
//
// No había NINGÚN test de este camino — de ahí que la regresión sobreviviera a
// #674 sin que nada se pusiera rojo.
//
// Convención de datos (docs/TESTING.md): la cuenta `devtest` tiene role='admin'
// en dev, que cumple collaborator+ (ROLE_RANK, src/lib/auth/roles.ts). A
// diferencia del catálogo REAL —que no se borra nunca, ver
// catalogo-server-authoritative.spec.ts— la obra que crea este test es
// desechable y de título único por ejecución, así que SÍ se limpia (pase
// primero, obra después: `catalog_item_has_passes` bloquea el orden inverso).

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ISBN-13 real y con dígito de control válido (1984, Signet Classics):
// normalizeIsbn lo valida de verdad, un número inventado daría "invalidIsbn" y
// el test fallaría por el motivo equivocado.
const ISBN = "9780451524935";

async function rest(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test("alta manual de libro crea la obra y su pase en planned", async ({ page }) => {
  const title = `Libro manual e2e ${Date.now()}`;
  let bookId: string | null = null;

  try {
    await login(page);
    await page.goto("/buscar/manual?type=book");

    // El guard de página redirige a /buscar si la cuenta no es collaborator+:
    // si eso pasa, el fallo es de entorno y conviene que se lea así.
    await expect(page).toHaveURL(/\/buscar\/manual/);

    await page.fill('input[name="title"]', title);
    await page.fill('input[name="creator"]', "George Orwell");
    await page.fill('input[name="year"]', "1949");
    await page.fill('input[name="pageCount"]', "328");
    await page.fill('input[name="publisher"]', "Signet Classics");
    await page.fill('input[name="isbn"]', ISBN);

    await page.click('button[type="submit"]');

    // El alta redirige al perfil. Antes del arreglo se quedaba en el formulario
    // pintando el error, así que esta espera es la aserción de verdad.
    await page.waitForURL(`/u/${USERNAME}`, { timeout: 30_000 });

    const res = await rest(
      `books?title=eq.${encodeURIComponent(title)}&select=id,author,published_year,publisher,total_pages,isbn`
    );
    expect(res.ok).toBe(true);
    const rows = (await res.json()) as Array<{
      id: string;
      author: string | null;
      published_year: number | null;
      publisher: string | null;
      total_pages: number | null;
      isbn: string | null;
    }>;
    expect(rows).toHaveLength(1);

    bookId = rows[0].id;
    // Los canónicos los escribe la RPC, no el cliente: si alguno llega null, el
    // mapeo de argumentos se rompió aunque la fila naciera.
    expect(rows[0].author).toBe("George Orwell");
    expect(rows[0].published_year).toBe(1949);
    expect(rows[0].publisher).toBe("Signet Classics");
    expect(rows[0].total_pages).toBe(328);
    expect(rows[0].isbn).toBe(ISBN);

    const passRes = await rest(
      `passes?item_id=eq.${bookId}&item_type=eq.book&select=status,is_active`
    );
    const passes = (await passRes.json()) as Array<{ status: string; is_active: boolean }>;
    expect(passes).toHaveLength(1);
    expect(passes[0].status).toBe("planned");
    expect(passes[0].is_active).toBe(true);
  } finally {
    if (bookId) {
      await rest(`passes?item_id=eq.${bookId}&item_type=eq.book`, { method: "DELETE" });
      await rest(`books?id=eq.${bookId}`, { method: "DELETE" });
    }
  }
});
