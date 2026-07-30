import { test, expect, type APIRequestContext } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Issue #313: en `/coleccion?tab=todo`, un usuario con UN solo interés de
// onboarding (p. ej. `['book']`) arranca con la rejilla bloqueada a ese tipo
// cuando NO hay `?type=` en la URL (resolveEffectiveType, effective-type.ts).
// El pill «Todo» (t("library.filters.allTypes")) antes enlazaba a una URL SIN
// `type`, indistinguible de ese arranque por defecto: pulsarlo no escapaba del
// bloqueo. El arreglo añade el centinela `?type=todos` (`ALL_TYPES_PARAM`),
// que `resolveEffectiveType` resuelve a `undefined` (sin filtro de tipo). Este
// spec siembra una biblioteca MIXTA (un libro y una película) para un usuario
// de un solo interés y comprueba que el pill de verdad quita el bloqueo.

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

// Mismo patrón que club-join-request.spec.ts / club-activity-changes.spec.ts:
// usuario desechable con email ya confirmado, perfil propio -- aquí con
// `interests` de un solo tipo, que es justo la precondición del bug (#313).
async function crearUsuario(request: APIRequestContext, username: string) {
  const email = `${username}@example.com`;
  const password = "TestPassword123!";
  const res = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  const user = await res.json();
  await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: adminJson(),
    data: { user_id: user.id, username, interests: ["book"] },
  });
  return { id: user.id as string, username, email, password };
}

async function anyBook(): Promise<{ id: string; title: string }> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/books?select=id,title&limit=1`, {
      headers: adminHeaders(),
    })
  ).json()) as { id: string; title: string }[];
  if (!rows[0]) throw new Error("no hay libros en catálogo para el e2e");
  return rows[0];
}

async function anyMovie(): Promise<{ id: string; title: string }> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/movies?select=id,title&limit=1`, {
      headers: adminHeaders(),
    })
  ).json()) as { id: string; title: string }[];
  if (!rows[0]) throw new Error("no hay películas en catálogo para el e2e");
  return rows[0];
}

// Cambiar de usuario: mismo helper que el resto de specs con usuario
// desechable (entrarComo). El middleware rebota a "/" a quien ya tiene
// sesión, así que hace falta limpiar cookies antes de rellenar el formulario.
async function entrarComo(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test("Todo: el pill 'Todo' (?type=todos) escapa del tipo preferido y mezcla libro+película", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const ts = Date.now();
  const username = `e2etodos${ts}`.slice(0, 20);
  const usuario = await crearUsuario(request, username);
  const book = await anyBook();
  const movie = await anyMovie();

  try {
    // ── Siembra: biblioteca MIXTA (pase activo de un libro y de una
    // película) para un usuario cuyo único interés declarado es "book". ──
    const seedRes = await request.post(`${SUPABASE_URL}/rest/v1/passes`, {
      headers: adminJson(),
      data: [
        { user_id: usuario.id, item_type: "book", item_id: book.id, is_active: true },
        { user_id: usuario.id, item_type: "movie", item_id: movie.id, is_active: true },
      ],
    });
    expect(seedRes.ok(), "sembrar los dos pases activos").toBeTruthy();

    await entrarComo(page, usuario.email, usuario.password);

    const libroHref = `a[href="/libro/${book.id}"]`;
    const peliculaHref = `a[href="/pelicula/${movie.id}"]`;

    // ── 1. Arranque por defecto (sin ?type=): bloqueado al único interés ──
    // `.first()` en las comprobaciones de presencia: cada tarjeta pone el
    // MISMO href en dos <a> (la portada y el título, library-item-card.tsx),
    // así que el locator crudo resuelve a 2 elementos y `toBeVisible()` (modo
    // estricto) revienta sin que haya ninguna tarjeta duplicada de verdad.
    await page.goto("/coleccion?tab=todo");
    await expect(page.locator(libroHref).first()).toBeVisible();
    await expect(page.locator(peliculaHref)).toHaveCount(0);

    // ── 2. Abrir «Filtros» y pulsar el pill «Todo» (tipo) ──
    await page.getByRole("button", { name: /^filtros/i }).click();
    const panel = page.getByRole("menu");
    await expect(panel).toBeVisible();
    await panel.getByRole("link", { name: "Todo", exact: true }).click();
    // El desplegable no se autocierra al pulsar dentro (filters-dropdown.tsx)
    // y la navegación del pill es client-side: el componente NO se remonta,
    // así que su estado `open` sigue siendo `true` tras el clic. Sin cerrarlo
    // aquí, el próximo clic sobre «Filtros» (paso 5) lo estaría CERRANDO en
    // vez de abriéndolo, y el siguiente `getByRole("menu")` se quedaría
    // esperando para siempre (así falló en la primera pasada de este spec).
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // ── 3. La URL lleva el centinela explícito... ──
    await expect
      .poll(() => new URL(page.url()).searchParams.get("type"))
      .toBe("todos");

    // ── 4. ...y la rejilla ahora es MIXTA: libro Y película, no solo el
    // preferido. Esta es la aserción que el bug pre-#313 no podía pasar: el
    // pill viejo enlazaba sin `type`, indistinguible del arranque por
    // defecto, así que la película seguía sin aparecer. ──
    await expect(page.locator(libroHref).first()).toBeVisible();
    await expect(page.locator(peliculaHref).first()).toBeVisible();

    // ── 5. Un pill de tipo concreto sigue acotando (no rompió el resto) ──
    await page.getByRole("button", { name: /^filtros/i }).click();
    const panel2 = page.getByRole("menu");
    await panel2.getByRole("link", { name: "Películas", exact: true }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("type"))
      .toBe("movie");
    await expect(page.locator(peliculaHref).first()).toBeVisible();
    await expect(page.locator(libroHref)).toHaveCount(0);

    console.log("TODOS LOS TIPOS OK:", username);
  } finally {
    // Passes -> por si su FK no cascadea al borrar el usuario, se limpian
    // explícitamente antes de borrar la cuenta (fetch nativo, no el
    // `request` de Playwright: ese fixture muere con el contexto si el test
    // expira, y la limpieza no llegaría a correr).
    await fetch(`${SUPABASE_URL}/rest/v1/passes?user_id=eq.${usuario.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${usuario.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    console.log("LIMPIEZA OK: usuario", username, "borrado");
  }
});
