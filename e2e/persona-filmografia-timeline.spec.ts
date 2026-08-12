import { test, expect, type Page } from "@playwright/test";

// La filmografía de `/persona/[id]` como timeline cronológico: una sola columna
// vertical, canal de año con línea continua, fila clicable, y el control
// contextual de estado que sustituyó al enlace «Valorar».
//
// Siembra su propio caso —persona SIN ids externos, para no llamar a ninguna API
// ni depender de la red— con un estado distinto en cada obra, que es justo lo
// que el control tiene que saber distinguir.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2tl";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

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

async function del(path: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "DELETE", headers: adminHeaders() });
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

test.describe("ficha de persona · filmografía", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(180_000);

  test("timeline cronológico, fila clicable y control de estado por obra", async ({ page }) => {
    await sweepDisposableUsers();

    const user = await createOnboardedUser(`${USER_PREFIX}${Date.now()}`.slice(0, 20));
    const personId = crypto.randomUUID();
    // Un estado distinto por obra: sin registro, terminada con nota, pendiente,
    // y un libro EN CURSO por la página 120 de 400 (el único medio donde el
    // porcentaje se puede calcular de verdad).
    const sinRegistro = crypto.randomUUID();
    const terminada = crypto.randomUUID();
    const pendiente = crypto.randomUUID();
    const libro = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    try {
      await rest("people", {
        method: "POST",
        body: JSON.stringify({ id: personId, name: `[E2E] Cineasta ${personId.slice(0, 8)}` }),
      });

      const movies: Array<{ id: string; year: number; role: string }> = [
        { id: sinRegistro, year: 2021, role: "director" },
        { id: terminada, year: 2015, role: "director" },
        { id: pendiente, year: 2009, role: "cast" },
      ];
      for (const m of movies) {
        await rest("movies", {
          method: "POST",
          body: JSON.stringify({
            id: m.id,
            title: `[E2E] peli ${m.id.slice(0, 8)}`,
            cover_url: COVER_URL,
            release_year: m.year,
            duration_minutes: 100,
          }),
        });
        await rest("credits", {
          method: "POST",
          body: JSON.stringify({
            item_type: "movie",
            item_id: m.id,
            person_id: personId,
            role: m.role,
            character: m.role === "cast" ? "Un personaje" : null,
          }),
        });
      }

      await rest("books", {
        method: "POST",
        body: JSON.stringify({
          id: libro,
          title: `[E2E] libro ${libro.slice(0, 8)}`,
          author: "[E2E]",
          cover_url: COVER_URL,
          published_year: 2018,
          total_pages: 400,
        }),
      });
      await rest("credits", {
        method: "POST",
        body: JSON.stringify({
          item_type: "book",
          item_id: libro,
          person_id: personId,
          role: "author",
        }),
      });

      await rest("passes", {
        method: "POST",
        body: JSON.stringify({
          id: terminada,
          user_id: user.id,
          item_type: "movie",
          item_id: terminada,
          status: "completed",
          is_active: true,
          position: {},
          started_on: today,
          finished_on: today,
          rating: 8,
        }),
      });
      await rest("passes", {
        method: "POST",
        body: JSON.stringify({
          id: pendiente,
          user_id: user.id,
          item_type: "movie",
          item_id: pendiente,
          status: "planned",
          is_active: true,
          position: {},
        }),
      });
      await rest("passes", {
        method: "POST",
        body: JSON.stringify({
          id: libro,
          user_id: user.id,
          item_type: "book",
          item_id: libro,
          status: "in_progress",
          is_active: true,
          position: { page: 120 },
          started_on: today,
        }),
      });

      await loginAs(page, user.email);
      await page.setViewportSize({ width: 1700, height: 1000 });
      await page.goto(`/persona/${personId}`);

      const timeline = page.getByTestId("person-rest");
      await expect(timeline).toBeVisible();

      // 1. UNA LISTA, no una rejilla, y con tope de ancho: sin él la fila se
      //    estiraba a 1700px y el título quedaba a medio metro del estado.
      const listWidth = await timeline.evaluate((el) => Math.round(el.getBoundingClientRect().width));
      expect(listWidth).toBeLessThanOrEqual(860);

      // 2. EL CANAL DEL TIMELINE: cada año abre tramo y la línea es continua
      //    (el `border-l` de cada fila, que se suelda con el de la siguiente).
      await expect(timeline.getByText("2021", { exact: true })).toBeVisible();
      await expect(timeline.getByText("2009", { exact: true })).toBeVisible();
      const bordes = await timeline.evaluate(
        (el) =>
          [...el.querySelectorAll("div")].filter(
            (d) => getComputedStyle(d).borderLeftWidth === "1px"
          ).length
      );
      expect(bordes, "cada obra aporta su tramo de línea").toBeGreaterThanOrEqual(4);

      // 3. LAS CUATRO ZONAS de la fila, con los roles pegados al título.
      const filaTerminada = timeline
        .getByTestId("work-row")
        .filter({ hasText: `[E2E] peli ${terminada.slice(0, 8)}` });
      await expect(filaTerminada.getByText("Dirección")).toBeVisible();
      await expect(filaTerminada.getByTestId("status-badge")).toHaveText(/Terminada/);
      // «Terminada + valoración»: la nota se pinta con dots, no con un enlace
      // «Valorar» que desaparecía justo al puntuar.
      await expect(filaTerminada.getByRole("img", { name: /de 5$/ })).toBeVisible();

      // 4. EL CONTROL CONTEXTUAL dice en qué estás, obra por obra.
      const filaPendiente = timeline
        .getByTestId("work-row")
        .filter({ hasText: `[E2E] peli ${pendiente.slice(0, 8)}` });
      await expect(filaPendiente.getByTestId("status-badge")).toHaveText(/Pendiente/);

      // El libro en curso dice POR DÓNDE VAS: página 120 de 400 = 30%.
      const filaLibro = timeline
        .getByTestId("work-row")
        .filter({ hasText: `[E2E] libro ${libro.slice(0, 8)}` });
      await expect(filaLibro.getByText("Pág. 120 · 30%")).toBeVisible();

      // 5. «+ Pendiente» sobre la obra sin registro la mete en la cola.
      const filaSinRegistro = timeline
        .getByTestId("work-row")
        .filter({ hasText: `[E2E] peli ${sinRegistro.slice(0, 8)}` });
      await expect(filaSinRegistro.getByTestId("status-badge")).toHaveCount(0);
      await filaSinRegistro.getByRole("button", { name: "Pendiente" }).click();
      await expect(filaSinRegistro.getByTestId("status-badge")).toHaveText(/Pendiente/);

      // 6. LA FILA ENTERA ES CLICABLE (enlace en overlay), no solo el título.
      await filaSinRegistro.click({ position: { x: 200, y: 20 } });
      await expect(page).toHaveURL(new RegExp(`/pelicula/${sinRegistro}`));
    } finally {
      for (const id of [sinRegistro, terminada, pendiente, libro]) {
        await del(`passes?item_id=eq.${id}`);
        await del(`credits?item_id=eq.${id}`);
        await del(`movies?id=eq.${id}`);
        await del(`books?id=eq.${id}`);
      }
      await del(`people?id=eq.${personId}`);
      await sweepDisposableUsers();
    }
  });

  test("se puede ordenar por categoría sin perder ninguna obra", async ({ page }) => {
    await sweepDisposableUsers();

    const user = await createOnboardedUser(`${USER_PREFIX}o${Date.now()}`.slice(0, 20));
    const personId = crypto.randomUUID();
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const roles = ["director", "writer", "cast"];

    try {
      await rest("people", {
        method: "POST",
        body: JSON.stringify({ id: personId, name: `[E2E] Mixta ${personId.slice(0, 8)}` }),
      });
      for (const [i, id] of ids.entries()) {
        await rest("movies", {
          method: "POST",
          body: JSON.stringify({
            id,
            title: `[E2E] obra ${id.slice(0, 8)}`,
            cover_url: COVER_URL,
            release_year: 2000 + i,
          }),
        });
        await rest("credits", {
          method: "POST",
          body: JSON.stringify({
            item_type: "movie",
            item_id: id,
            person_id: personId,
            role: roles[i],
          }),
        });
      }

      await loginAs(page, user.email);
      await page.setViewportSize({ width: 1700, height: 1000 });
      await page.goto(`/persona/${personId}`);

      const timeline = page.getByTestId("person-rest");
      await expect(timeline).toBeVisible();
      const titulosCronologia = (await timeline.locator("span.font-serif").allInnerTexts()).sort();
      expect(titulosCronologia).toHaveLength(3);

      // El orden vive en la URL, como los filtros: es un enlace compartible y
      // el botón «atrás» funciona.
      await page.getByRole("link", { name: "Por categoría" }).click();
      await expect(page).toHaveURL(/orden=rol/);

      // Las tres categorías, en el orden de peso: dirección, guion, reparto.
      // `innerText` devuelve el texto RENDERIZADO, y las etiquetas van en
      // versalitas por CSS (`uppercase`): se compara en minúsculas.
      const encabezados = await timeline.locator("h4").allInnerTexts();
      expect(encabezados.map((s) => s.trim().toLowerCase())).toEqual([
        "dirección",
        "guion",
        "reparto",
      ]);

      // Y NO se pierde ni se duplica ninguna obra al cambiar de orden.
      const titulosPorRol = (await timeline.locator("span.font-serif").allInnerTexts()).sort();
      expect(titulosPorRol).toEqual(titulosCronologia);

      await page.goBack();
      await expect(page).not.toHaveURL(/orden=rol/);
    } finally {
      for (const id of ids) {
        await del(`credits?item_id=eq.${id}`);
        await del(`movies?id=eq.${id}`);
      }
      await del(`people?id=eq.${personId}`);
      await sweepDisposableUsers();
    }
  });
});
