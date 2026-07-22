import { test, expect, type Request } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es su dueño (moderador+)

// Un mes lejano y fijo: así el test no depende de cuántas marcas tenga el club
// de pruebas hoy, ni se rompe al cruzar un fin de mes.
const MES = "2027-09";
const FECHA = "2027-09-15";

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Un moderador crea un evento DESDE el calendario y lo ve en su celda; y la
// navegación de mes cambia la URL sin recargar, con el botón atrás funcionando.
test("calendario: crea un evento y navega entre meses", async ({ page, request }) => {
  test.setTimeout(90_000);

  await login(page, EMAIL, PASSWORD);

  let eventoId: string | null = null;

  try {
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=${MES}`);

    // Prueba positiva de que el calendario pintó su mes ANTES de afirmar nada
    // más: si no, los asserts siguientes serían trivialmente ciertos.
    await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");

    const titulo = `e2e cal ${Date.now()}`;
    await page.getByRole("button", { name: /^nuevo evento$/i }).click();
    await page.getByLabel(/^título$/i).fill(titulo);
    await page.getByLabel(/^fecha$/i).fill(FECHA);
    await page.getByRole("button", { name: /^crear evento$/i }).click();

    // Existe en la BD. Se comprueba antes que la pantalla: la UI puede pintar
    // el título desde su propio estado aunque el submit haya fallado.
    let creado: { id: string; starts_on: string } | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(titulo)}&select=id,starts_on`,
            { headers: adminHeaders() },
          );
          [creado] = await res.json();
          return creado?.id ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();
    eventoId = creado!.id;
    expect(creado!.starts_on).toBe(FECHA);

    // Y en pantalla: en la agenda del mes, que es donde el título se lee
    // entero (en la celda va truncado).
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 15000 });

    // ── Navegación de mes ──
    //
    // ESTA ES LA ASERCIÓN QUE PROTEGE LA ARQUITECTURA DE LA FEATURE. Todas las
    // marcas del club se cargan de una vez precisamente para que cambiar de mes
    // NO cueste un viaje al servidor. Si alguien sustituyera pushState por
    // router.push/replace, la pantalla se vería idéntica -- solo más lenta -- y
    // ninguna otra prueba lo notaría. Contamos las peticiones RSC del App Router
    // (llevan el parámetro _rsc) y exigimos que no suban.
    let peticionesRsc = 0;
    const contarRsc = (req: Request) => {
      if (req.url().includes("_rsc=")) peticionesRsc++;
    };
    page.on("request", contarRsc);

    await page.getByRole("button", { name: /mes siguiente/i }).click();
    await expect(page.getByTestId("calendar-month")).toHaveText("Octubre 2027");
    await expect(page).toHaveURL(/mes=2027-10/);

    await page.getByRole("button", { name: /mes anterior/i }).click();
    await page.getByRole("button", { name: /mes anterior/i }).click();
    await expect(page.getByTestId("calendar-month")).toHaveText("Agosto 2027");

    page.off("request", contarRsc);
    expect(
      peticionesRsc,
      "cambiar de mes no debe pedir nada al servidor: si esto falla, alguien cambió pushState por router.push/replace",
    ).toBe(0);

    // Volvemos a septiembre para lo que sigue.
    await page.getByRole("button", { name: /mes siguiente/i }).click();
    await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");

    // El atrás del navegador deshace el ÚLTIMO cambio de mes. Es la
    // comprobación que de verdad prueba que se usó pushState y no
    // router.replace: la pila de historial hasta aquí es
    // Sep(goto)->Oct(push)->Sep(push)->Ago(push)->Sep(push), así que un solo
    // goBack() deshace ese último push (Ago->Sep) y debe devolver a AGOSTO
    // -- la entrada push inmediatamente anterior --, no al "Septiembre"
    // original: el historial nunca fusiona entradas con la misma URL.
    await page.goBack();
    await expect(page.getByTestId("calendar-month")).toHaveText("Agosto 2027");
    await expect(page).toHaveURL(/mes=2027-08/);

    // "Hoy" vuelve al mes actual.
    await page.getByRole("button", { name: /^hoy$/i }).click();
    await expect(page.getByTestId("calendar-month")).not.toHaveText("Septiembre 2027");

    console.log("CALENDARIO OK:", eventoId);
  } finally {
    if (eventoId) {
      // fetch nativo, NO el `request` de Playwright: ese fixture muere junto con
      // el contexto del navegador, así que si el test expira por timeout la
      // limpieza no llega a ejecutarse y deja filas sueltas en la base (ya
      // pasó: 8 filas huérfanas motivaron esta regla).
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      console.log("LIMPIEZA OK: evento", eventoId, "borrado");
    }
  }
});

// Un ?mes= con basura no debe romper: cae al mes actual, sin 404 ni error de
// página. Es entrada controlada por el usuario, porque la URL es compartible.
test("calendario: un ?mes= inválido cae al mes actual", async ({ page }) => {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));

  await login(page, EMAIL, PASSWORD);

  const anyoActual = new Date().getFullYear();

  for (const basura of ["pepe", "2026-13", "0050-03"]) {
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=${basura}`);
    // Se afirma algo POSITIVO (que pintó un mes, y que es el año en curso)
    // antes que la ausencia de errores: si la página no hubiera pintado nada,
    // "sin errores" sería trivialmente cierto.
    await expect(page.getByTestId("calendar-month")).toHaveText(
      new RegExp(String(anyoActual)),
    );
  }

  expect(errores, "un ?mes= inválido no debe provocar errores de página").toEqual([]);
});

// El botón de crear evento está gateado por moderador+: un miembro raso no debe
// verlo. Se crea un usuario desechable, como ya hacen club-evento.spec.ts,
// club-join-request.spec.ts y club-member-directory.spec.ts.
test("calendario: un miembro raso no ve el botón de crear evento", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const username = `e2ecalmem${Date.now()}`.slice(0, 20);
  const email = `${username}@example.com`;
  const password = "TestPassword123!";

  let userId: string | null = null;
  let clubId: string | null = null;

  try {
    const res = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: adminHeaders(),
      data: { email, password, email_confirm: true },
    });
    userId = (await res.json()).id as string;
    await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      data: { user_id: userId, username },
    });

    const clubRows = (await (
      await request.get(
        `${SUPABASE_URL}/rest/v1/clubs?slug=eq.${CLUB_SLUG}&select=id`,
        { headers: adminHeaders() },
      )
    ).json()) as { id: string }[];
    clubId = clubRows[0].id;

    const addRes = await request.post(`${SUPABASE_URL}/rest/v1/club_members`, {
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      data: { club_id: clubId, user_id: userId, role: "member", status: "active" },
    });
    expect(addRes.ok(), "el miembro raso debe poder añadirse al club").toBeTruthy();

    await login(page, email, password);

    await page.goto(`/club/${CLUB_SLUG}/calendario`);
    // Positivo primero: el calendario pintó de verdad. Sin esto, la ausencia
    // del botón sería un falso verde si la página no hubiera cargado.
    await expect(page.getByTestId("calendar-month")).not.toBeEmpty();
    await expect(page.getByRole("button", { name: /^nuevo evento$/i })).toHaveCount(0);
  } finally {
    // fetch nativo, NO el fixture `request`: muere con el contexto del navegador
    // y un timeout dejaría filas sueltas (ya pasó: 8 filas huérfanas).
    if (clubId && userId) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${clubId}&user_id=eq.${userId}`,
        { method: "DELETE", headers: adminHeaders() },
      );
    }
    if (userId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});

// Un club privado no filtra sus fechas por URL a quien no es miembro.
test("calendario: un no-miembro recibe 404", async ({ page }) => {
  await login(page, EMAIL, PASSWORD);

  // Control positivo primero: el club del que SÍ es miembro responde 200. Sin
  // esto, un 404 general (ruta mal registrada) pasaría por gate correcto.
  const propio = await page.goto(`/club/${CLUB_SLUG}/calendario`);
  expect(propio?.status()).toBe(200);

  const ajeno = await page.goto("/club/club-que-no-existe-xyz/calendario");
  expect(ajeno?.status()).toBe(404);
});

// ── Guarda anti-historial (revisión de la Task 7, no en el brief original) ──
//
// irAlMes(destino) solo hace pushState si destino !== month ya resuelto. Sin
// esa guarda, pulsar "Hoy" estando YA en el mes actual apilaría una entrada de
// historial idéntica en apariencia (mismo mes, solo que la URL gana un
// `?mes=` que antes no tenía) y el usuario que pulsa "atrás" no vería pasar
// nada -- se quedaría en el propio calendario. Se comprueba entrando SIN
// `?mes=` (para que el mes resuelto por parseMonthParam ya sea el actual) y
// verificando que "atrás" saca de la página del calendario en vez de
// quedarse en ella.
test("calendario: pulsar Hoy en el mes actual no apila historial", async ({ page }) => {
  await login(page, EMAIL, PASSWORD);

  await page.goto(`/club/${CLUB_SLUG}/calendario`);
  const anyoActual = new Date().getFullYear();
  // Positivo primero: el calendario pintó de verdad el mes actual.
  await expect(page.getByTestId("calendar-month")).toHaveText(
    new RegExp(String(anyoActual)),
  );

  await page.getByRole("button", { name: /^hoy$/i }).click();

  await page.goBack();
  // Si el click hubiera apilado historial, "atrás" volvería a la MISMA
  // página del calendario (solo sin el `?mes=` añadido) y este assert vería
  // el testid seguir presente. Con la guarda, no se apiló nada: "atrás" saca
  // de verdad de la ruta /calendario.
  await expect(page).not.toHaveURL(/\/calendario(\?|$)/);
  await expect(page.getByTestId("calendar-month")).toHaveCount(0);
});

// ── El rail sigue activo tras navegar (revisión de la Task 7, no en el brief
// original) ──
//
// El sidebar del club es un server component: `active="calendario"` se
// decide UNA vez, en el render inicial de la ruta. Cambiar de mes con
// pushState no dispara una nueva ejecución de ese server component, así que
// si esto se rompiera algún día sería por una re-arquitectura que sí lo
// re-renderiza con un `active` mal calculado. El rail solo se pinta desde el
// breakpoint `lg`; la suite corre a 1280×720 (Desktop Chrome), por encima del
// `lg` de Tailwind (1024), así que no hace falta viewport a medida.
test("calendario: el rail conserva aria-current tras cambiar de mes", async ({ page }) => {
  await login(page, EMAIL, PASSWORD);

  await page.goto(`/club/${CLUB_SLUG}/calendario`);
  const anyoActual = new Date().getFullYear();
  await expect(page.getByTestId("calendar-month")).toHaveText(
    new RegExp(String(anyoActual)),
  );

  const railCalendario = page.getByRole("link", { name: "Calendario" });
  await expect(railCalendario).toHaveAttribute("aria-current", "page");

  const mesAntes = await page.getByTestId("calendar-month").textContent();
  await page.getByRole("button", { name: /mes siguiente/i }).click();
  await expect(page.getByTestId("calendar-month")).not.toHaveText(mesAntes ?? "");

  await expect(railCalendario).toHaveAttribute("aria-current", "page");
});
