import { test, expect, type Page } from "@playwright/test";

// Dos arreglos de la columna izquierda de `/persona/[id]`, sembrados a mano para
// que no dependan de qué haya en base:
//
// 1. EL RETRATO NO SE APLASTA AL DESPLEGAR LA BIOGRAFÍA. A ≥1600 la card de la
//    ficha es el contenedor que scrollea, y en un flex column los hijos ENCOGEN
//    antes de desbordar. El retrato es un `aspect-square` sin contenido dentro
//    (la Image va absoluta con `fill`), así que su altura mínima es 0 y era el
//    primero en ceder: la cara se estrujaba al pulsar «Ver más».
// 2. LAS MEDIAS SE PINTAN CON DOTS, no como el texto «4,2 / 5».
//
// La persona se siembra SIN `tmdb_id` ni `openlibrary_key` a propósito: así
// `needsCreditHydration` es false y el test no llama a ninguna API externa ni
// depende de la red.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2pf";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

// Larga a propósito: desplegada tiene que desbordar la altura de la ventana,
// que es la condición en la que aparecía el aplastamiento.
const BIO = Array.from(
  { length: 14 },
  (_, i) =>
    `Párrafo ${i + 1} de una biografía deliberadamente larga para que la columna ` +
    `izquierda tenga que desplazarse por dentro en vez de estirar la página entera. ` +
    `Este texto no describe a nadie real: es relleno de prueba.`,
).join(" ");

test.use({ serviceWorkers: "block" });

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

async function sweepDisposableUsers() {
  const rows = (await (
    await rest(`profiles?username=like.${USER_PREFIX}*&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  }
}

async function createOnboardedUser(username: string): Promise<{ id: string; email: string }> {
  const email = `${username}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin/users: ${res.status} — ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      username,
      display_name: username,
      is_public: false,
      onboarded_at: new Date().toISOString(),
    }),
  });
  return { id: user.id, email };
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

/** Mide el retrato y si la card desborda (que es lo que DEBE pasar, en vez de encoger). */
async function medirFicha(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('[data-area="ficha"]') as HTMLElement | null;
    const card = area?.firstElementChild as HTMLElement | null;
    const retrato = area?.querySelector(".aspect-square") as HTMLElement | null;
    const box = retrato?.getBoundingClientRect();
    return {
      alto: box ? Math.round(box.height) : null,
      ancho: box ? Math.round(box.width) : null,
      cardDesborda: card ? card.scrollHeight > card.clientHeight + 1 : null,
      areaAlto: area ? Math.round(area.getBoundingClientRect().height) : null,
      ventana: window.innerHeight,
    };
  });
}

test.describe("ficha de persona · retrato y medias", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(120_000);

  test("«Ver más» no aplasta el retrato, y las medias van con dots", async ({ page }) => {
    await sweepDisposableUsers();

    const user = await createOnboardedUser(`${USER_PREFIX}${Date.now()}`.slice(0, 20));
    const personId = crypto.randomUUID();
    const movieIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    // 7, 8 y 10 sobre 10 → media 8,33 → «4,2» y cuatro dots.
    const ratings = [7, 8, 10];
    const today = new Date().toISOString().slice(0, 10);

    try {
      await rest("people", {
        method: "POST",
        body: JSON.stringify({
          id: personId,
          name: `[E2E] Persona ${personId.slice(0, 8)}`,
          bio: BIO,
          photo_url: COVER_URL,
        }),
      });

      for (const [i, movieId] of movieIds.entries()) {
        await rest("movies", {
          method: "POST",
          body: JSON.stringify({
            id: movieId,
            title: `[E2E] peli ${i + 1} ${movieId.slice(0, 8)}`,
            cover_url: COVER_URL,
            release_year: 2010 + i,
          }),
        });
        await rest("credits", {
          method: "POST",
          body: JSON.stringify({
            item_type: "movie",
            item_id: movieId,
            person_id: personId,
            role: "director",
          }),
        });
        await rest("passes", {
          method: "POST",
          body: JSON.stringify({
            id: movieId,
            user_id: user.id,
            item_type: "movie",
            item_id: movieId,
            status: "completed",
            is_active: true,
            position: {},
            started_on: today,
            finished_on: today,
            rating: ratings[i],
          }),
        });
      }

      await loginAs(page, user.email);
      await page.setViewportSize({ width: 1700, height: 900 });
      await page.goto(`/persona/${personId}`);
      await expect(page.locator('[data-area="obras"]')).toHaveCount(1);

      // 1. EL RETRATO. Cuadrado antes de desplegar…
      const antes = await medirFicha(page);
      expect(antes.alto).toBe(antes.ancho);

      const verMas = page.locator('[data-area="ficha"] button').filter({ hasText: /ver/i }).first();
      await verMas.click();
      // Una vez desplegada, la biografía es tan larga que la card DEBE desbordar.
      await expect
        .poll(async () => (await medirFicha(page)).cardDesborda, {
          message: "la card de la ficha debería desbordar y scrollear por dentro",
        })
        .toBe(true);

      // …y exactamente igual de alto después. Este es el bug: sin `shrink-0`
      // aquí salía un rectángulo bajo en vez del cuadrado.
      const despues = await medirFicha(page);
      expect(despues.alto, "el retrato se aplastó al desplegar la biografía").toBe(antes.alto);
      expect(despues.alto).toBe(despues.ancho);

      // Y crece hacia dentro: la columna sigue cabiendo en la ventana en vez de
      // estirarse y obligar a recorrer la página entera para leer el final.
      expect(despues.areaAlto!).toBeLessThanOrEqual(despues.ventana);

      // 2. LAS MEDIAS. Dots de verdad (RatingDots pone role="img" con la nota
      //    en el aria-label), y ni rastro del viejo texto «/ 5».
      const ficha = page.locator('[data-area="ficha"]');

      // 3. «En tu biblioteca» habla en PORCENTAJE; el recuento baja al pie de la
      //    barra, que es donde da la escala sin robarle el sitio.
      await expect(ficha.getByText("Has visto el 100% de su obra")).toBeVisible();
      await expect(ficha.getByText("3 de 3 obras")).toBeVisible();

      await expect(ficha.getByRole("img", { name: /de 5$/ })).toHaveCount(1);
      await expect(ficha.getByText("4,2")).toBeVisible();
      await expect(ficha.getByText("/ 5")).toHaveCount(0);

      // El raíl pinta las dos medias (la tuya y la de la comunidad) igual.
      const rail = page.locator('[data-area="rail"]');
      await expect(rail.getByRole("img", { name: /de 5$/ })).toHaveCount(2);
      await expect(rail.getByText("/ 5")).toHaveCount(0);
    } finally {
      for (const movieId of movieIds) {
        await fetch(`${SUPABASE_URL}/rest/v1/passes?item_id=eq.${movieId}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        await fetch(`${SUPABASE_URL}/rest/v1/credits?item_id=eq.${movieId}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        await fetch(`${SUPABASE_URL}/rest/v1/movies?id=eq.${movieId}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/people?id=eq.${personId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      await sweepDisposableUsers();
    }
  });
});
