import { test, expect, type Request } from "@playwright/test";
import { formatMonthYear } from "@/lib/clubs/activities/format-date";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es su dueño (moderador+)
// Privado, y devtest NO es miembro (mismo club que usa club-join-request.spec.ts).
const PRIVATE_CLUB_SLUG = "test-private-club";

// "YYYY-MM" del mes en curso, para comparar contra formatMonthYear en vez de
// afirmar solo el año (un fallback erróneo a enero pasaría un assert que solo
// mirara el año) o negar un mes fijo (que sería una bomba de relojería si la
// suite corriera ese mes exacto).
function mesActualISO(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

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
  let tituloEvento: string | null = null;

  try {
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=${MES}`);

    // Prueba positiva de que el calendario pintó su mes ANTES de afirmar nada
    // más: si no, los asserts siguientes serían trivialmente ciertos.
    await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");

    // Contador de peticiones RSC del App Router (llevan el parámetro `_rsc`),
    // acotado a la propia ruta del calendario: los prefetches de <Link> de la
    // agenda apuntan a /actividad/... y no deben contarse aquí -- si algún día
    // el club de pruebas siembra una lectura conjunta en estos meses, la
    // agenda pintará esos enlaces y un filtro sin acotar contaría sus
    // prefetches, dando el diagnóstico CONTRARIO al real más abajo.
    //
    // Se engancha ANTES de crear el evento (no solo antes de cambiar de mes):
    // ClubCalendar llama a router.refresh() justo tras crear, y eso sí debe
    // generar una petición RSC de verdad. Es el control positivo del propio
    // contador -- sin él, un Next que renombrara `_rsc` o una errata en el
    // filtro dejarían esto en 0 para siempre y el assert de "0 tras cambiar de
    // mes", más abajo, sería trivialmente cierto.
    let peticionesRsc = 0;
    const contarRsc = (req: Request) => {
      if (req.url().includes("_rsc=") && req.url().includes("/calendario")) {
        peticionesRsc++;
      }
    };
    page.on("request", contarRsc);

    const titulo = `e2e cal ${Date.now()}`;
    // Se asigna YA, antes de crear el evento (no tras el poll de más abajo):
    // así el `finally` siempre puede localizar la fila por título aunque el
    // poll expire y `eventoId` nunca llegue a asignarse -- ese es justo el
    // hueco que dejó 8 filas huérfanas, por otra puerta, en este mismo repo.
    tituloEvento = titulo;
    await page.getByRole("button", { name: /^nuevo evento$/i }).click();
    await page.getByLabel(/^título$/i).fill(titulo);
    await page.getByLabel(/^fecha$/i).fill(FECHA);
    // Encuentro (el tipo por defecto, y el único que monta este botón) exige
    // hora desde el selector de tipo (T10-T12, spec 2026-08-09-tipos-de-evento):
    // sin esto el submit se queda en el formulario con "eventStartsTimeRequired".
    await page.getByLabel(/^hora de inicio$/i).fill("18:00");
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

    // Control positivo del contador `_rsc`: crear el evento dispara
    // router.refresh(), que SÍ debe pedir al servidor. Si esto da 0, el
    // contador no está midiendo nada y el assert "=== 0" de más abajo no
    // prueba absolutamente nada tampoco.
    expect(
      peticionesRsc,
      "router.refresh() tras crear el evento debe generar al menos una petición RSC -- si esto da 0, el contador de _rsc no está midiendo nada",
    ).toBeGreaterThan(0);
    peticionesRsc = 0;

    // ── Navegación de mes ──
    //
    // ESTA ES LA ASERCIÓN QUE PROTEGE LA ARQUITECTURA DE LA FEATURE. Todas las
    // marcas del club se cargan de una vez precisamente para que cambiar de mes
    // NO cueste un viaje al servidor. Si alguien sustituyera pushState por
    // router.push/replace, la pantalla se vería idéntica -- solo más lenta -- y
    // ninguna otra prueba lo notaría. Contamos las peticiones RSC del App Router
    // (llevan el parámetro _rsc) y exigimos que no suban.
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

    // "Hoy" vuelve al mes actual. Assert en positivo (el mes actual de
    // verdad), no por negación de "Septiembre 2027": una negación así es una
    // bomba de relojería que fallaría sin que nada esté roto si la suite
    // corriera durante ese mes exacto.
    await page.getByRole("button", { name: /^hoy$/i }).click();
    await expect(page.getByTestId("calendar-month")).toHaveText(
      formatMonthYear(mesActualISO()),
    );

    console.log("CALENDARIO OK:", eventoId);
  } finally {
    if (tituloEvento) {
      // Se borra por TÍTULO (único: lleva un timestamp), no por `eventoId`:
      // ese id no se asigna hasta después del expect.poll de arriba (15 s de
      // timeout). Si el poll expirase, `eventoId` seguiría en null y este
      // finally no borraría nada -- con `retries: 1` en la config, un solo
      // fallo así deja DOS filas huérfanas. fetch nativo, NO el `request` de
      // Playwright: ese fixture muere junto con el contexto del navegador, así
      // que si el test expira por timeout la limpieza no llega a ejecutarse
      // (ya pasó: 8 filas huérfanas motivaron esta regla).
      await fetch(
        `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(tituloEvento)}`,
        { method: "DELETE", headers: adminHeaders() },
      );
      console.log("LIMPIEZA OK: evento con título", tituloEvento, "borrado");
    }
  }
});

// Un ?mes= con basura no debe romper: cae al mes actual, sin 404 ni error de
// página. Es entrada controlada por el usuario, porque la URL es compartible.
test("calendario: un ?mes= inválido cae al mes actual", async ({ page }) => {
  await login(page, EMAIL, PASSWORD);

  // El listener se engancha DESPUÉS del login, no antes: si estuviera antes,
  // un error ajeno en /login o en "/" haría fallar este test con un mensaje
  // que acusa al ?mes= inválido sin tener nada que ver.
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));

  const mesActual = mesActualISO();

  for (const basura of ["pepe", "2026-13", "0050-03"]) {
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=${basura}`);
    // Se afirma algo POSITIVO (que pintó el mes actual, exacto) antes que la
    // ausencia de errores: si la página no hubiera pintado nada, "sin
    // errores" sería trivialmente cierto. Y se compara el mes EXACTO, no solo
    // el año: un fallback erróneo a enero pasaría un assert que solo mirara
    // el año.
    await expect(page.getByTestId("calendar-month")).toHaveText(
      formatMonthYear(mesActual),
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
    const profileRes = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      data: { user_id: userId, username },
    });
    expect(profileRes.ok(), "el perfil del usuario desechable debe crearse").toBeTruthy();

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
//
// El gate real es `if (!club || !club.viewerRole) notFound();` (calendario/page.tsx).
// Pedir un slug inexistente solo ejercita la mitad `!club`: si alguien
// simplificara el gate a `if (!club) notFound();`, las fechas de un club
// privado podrían quedar expuestas y este test seguiría en verde.
//
// OJO: un extraño con CERO filas en `club_members` no sirve para ejercitar la
// mitad `!club.viewerRole` -- la RLS de `clubs` ("visibility = public OR
// club_member_row_exists(id)") ya le niega la fila entera, así que `club`
// sale null y ese caso cae en la MISMA rama que el slug inexistente de
// arriba (se comprobó rompiendo el gate a mano: con cero filas, el test
// seguía en verde). La única situación real en la que `club` es no-nulo pero
// `club.viewerRole` sí lo es es la de alguien con una fila en
// `club_members` que NO está activa -- típicamente una solicitud pendiente
// (`status: 'requested'`, el mismo estado que deja requestJoinClub() en
// club-join-request.spec.ts): esa fila hace que club_member_row_exists()
// sea true (ve la identidad del club, como el "forastero" de ese spec), pero
// su `viewerRole` es null porque su status no es 'active'.
test("calendario: un no-miembro recibe 404", async ({ page, request }) => {
  test.setTimeout(60_000);

  await login(page, EMAIL, PASSWORD);

  // Control positivo primero: el club del que SÍ es miembro responde 200. Sin
  // esto, un 404 general (ruta mal registrada) pasaría por gate correcto.
  const propio = await page.goto(`/club/${CLUB_SLUG}/calendario`);
  expect(propio?.status()).toBe(200);

  // Barato de conservar, pero NO basta por sí solo (ver comentario de arriba):
  // solo ejercita la rama `!club`, igual que la solicitud pendiente de abajo
  // -- pero esta, al no tener ninguna fila en `club_members`, no distingue
  // `!club` de `!club.viewerRole`.
  const inexistente = await page.goto("/club/club-que-no-existe-xyz/calendario");
  expect(inexistente?.status()).toBe(404);

  // La comprobación que de verdad protege el gate: un usuario desechable con
  // una solicitud PENDIENTE en test-private-club (privado). Mismo patrón para
  // fabricar el usuario que "un miembro raso no ve el botón de crear evento",
  // más arriba en este fichero.
  const username = `e2ecalpriv${Date.now()}`.slice(0, 20);
  const email = `${username}@example.com`;
  const password = "TestPassword123!";
  let userId: string | null = null;
  let privateClubId: string | null = null;

  try {
    const res = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: adminHeaders(),
      data: { email, password, email_confirm: true },
    });
    userId = (await res.json()).id as string;
    const profileRes = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      data: { user_id: userId, username },
    });
    expect(profileRes.ok(), "el perfil del usuario ajeno debe crearse").toBeTruthy();

    const privateClubRows = (await (
      await request.get(
        `${SUPABASE_URL}/rest/v1/clubs?slug=eq.${PRIVATE_CLUB_SLUG}&select=id`,
        { headers: adminHeaders() },
      )
    ).json()) as { id: string }[];
    privateClubId = privateClubRows[0].id;

    const requestRes = await request.post(`${SUPABASE_URL}/rest/v1/club_members`, {
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      data: { club_id: privateClubId, user_id: userId, status: "requested" },
    });
    expect(
      requestRes.ok(),
      "la solicitud pendiente del usuario ajeno debe crearse",
    ).toBeTruthy();

    // Cambiar de usuario NO es solo ir a /login: el middleware rebota a "/" a
    // quien ya tiene sesión, así que hay que tirar la del propietario primero
    // (mismo motivo que entrarComo en club-join-request.spec.ts).
    await page.context().clearCookies();
    await login(page, email, password);

    const ajeno = await page.goto(`/club/${PRIVATE_CLUB_SLUG}/calendario`);
    expect(ajeno?.status()).toBe(404);
  } finally {
    // fetch nativo, NO el `request` de Playwright: ese fixture muere junto con
    // el contexto del navegador, así que un timeout dejaría filas sueltas (ya
    // pasó: 8 filas huérfanas motivaron esta regla).
    if (privateClubId && userId) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${privateClubId}&user_id=eq.${userId}`,
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
