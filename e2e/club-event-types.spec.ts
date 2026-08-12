import { test, expect, type Page } from "@playwright/test";

// Tipos de evento de club (Task 14, spec 2026-08-09-tipos-de-evento): crea los
// tres -- Encuentro, Lanzamiento y Fecha destacada -- por la UI real (asistente
// -> EventForm -> RPC), no por REST directo, para ejercer el selector de tipo
// añadido en T10-T12 igual que un moderador lo usaría.
//
// Club DESECHABLE por ejecución, patrón de club-evento-seguimiento.spec.ts /
// club-ronda.spec.ts: el `on delete cascade` de club_activities hacia clubs
// limpia solo, sin restaurar nada compartido (a diferencia de club-evento.spec.ts,
// que usa el club público compartido `test-public-club`).
//
// La obra de Lanzamiento y Fecha destacada es el fixture de catálogo "Juego de
// tronos" (serie) que ya usan registrar-sesion-v2.spec.ts / notas-captura.spec.ts:
// devtest tiene un pase ACTIVO sobre ella, así que el picker (fuente biblioteca)
// la encuentra sin sembrar nada nuevo. Se elige por BÚSQUEDA en vez de tomar el
// primer resultado (a diferencia de club-ronda.spec.ts, a quien le daba igual
// cuál): aquí hace falta un tipo concreto (serie, para que la plataforma se
// ofrezca) y un título conocido para poder afirmarlo luego en la ficha.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function devtestId(): Promise<string> {
  const rows = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
      { headers: adminHeaders() },
    )
  ).json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

type Club = { id: string; slug: string };

/** Club privado desechable con devtest como dueño y único miembro activo (mismo
 *  patrón que club-evento-seguimiento.spec.ts / club-ronda.spec.ts). */
async function crearClub(ts: number, owner: string): Promise<Club> {
  const slug = `e2e-tipos-evento-${ts}`;
  const [club] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: `E2E Tipos de evento ${ts}`,
        visibility: "private",
        owner_id: owner,
      }),
    })
  ).json()) as { id: string }[];
  if (!club?.id) throw new Error("no se pudo crear el club desechable");

  // Insertar el club por REST se salta create_club(), que normalmente crea esta
  // fila junto con la del club: sin ella no hay membresía activa y el asistente
  // (isModerator) no vería a devtest como dueño -- la tarjeta "Evento" ni
  // aparecería, y el test fallaría sin que hubiera ningún bug real.
  await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ club_id: club.id, user_id: owner, role: "owner", status: "active" }),
  });

  return { id: club.id, slug };
}

async function borrarClub(clubId: string | null) {
  if (!clubId) return;
  await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

type SerieFixture = { id: string; title: string };

/**
 * El fixture de catálogo "Juego de tronos" (registrar-sesion-v2.spec.ts /
 * notas-captura.spec.ts). Se verifica también el pase ACTIVO de devtest, no solo
 * la fila de catálogo: sin pase activo la biblioteca de devtest no la lista y el
 * picker se quedaría vacío -- mejor fallar aquí con un mensaje claro que con un
 * timeout opaco esperando un resultado que nunca llega.
 */
async function serieFixture(ownerId: string): Promise<SerieFixture> {
  const titulo = "Juego de tronos";
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/series?title=eq.${encodeURIComponent(titulo)}&select=id,title`,
    { headers: adminHeaders() },
  );
  const [serie] = (await res.json()) as SerieFixture[];
  if (!serie) throw new Error(`no se encontró la serie fixture "${titulo}" en catálogo`);

  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${ownerId}&item_type=eq.series&item_id=eq.${serie.id}&is_active=eq.true&select=id`,
    { headers: adminHeaders() },
  );
  const [pass] = (await passRes.json()) as { id: string }[];
  if (!pass) throw new Error(`devtest no tiene pase activo sobre "${titulo}"`);

  return serie;
}

/** Busca en el item-picker (ya abierto) y elige el resultado -- único, gracias a
 *  la búsqueda -- que lleva ese título. */
async function elegirDeLaBiblioteca(page: Page, titulo: string) {
  await page.getByPlaceholder(/buscar en tu biblioteca/i).fill(titulo);
  const resultado = page
    .getByTestId("item-picker-library-result")
    .filter({ hasText: titulo });
  await expect(resultado.first()).toBeVisible({ timeout: 10000 });
  await resultado.first().click();
}

type ActividadRow = {
  id: string;
  event_type: string;
  config: Record<string, unknown> | null;
  starts_at: string | null;
  modality: string | null;
};

/** La fila persistida, con poll (no un fetch suelto): mismo motivo que
 *  club-ronda.spec.ts -- REST puede tardar en reflejar una escritura que ya se
 *  ve en pantalla. */
async function pollActividad(clubId: string, titulo: string): Promise<ActividadRow> {
  let row: ActividadRow | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/club_activities?club_id=eq.${clubId}&title=eq.${encodeURIComponent(titulo)}&select=id,event_type,config,starts_at,modality`,
          { headers: adminHeaders() },
        );
        [row] = (await res.json()) as ActividadRow[];
        return row?.id ?? null;
      },
      { timeout: 15000 },
    )
    .not.toBeNull();
  return row!;
}

/** Paso 1 del asistente: título + tarjeta "Evento" + Continuar. Común a los tres
 *  tipos -- lo que cambia después es el radiogroup de EventForm (paso 2). */
async function abrirEventoEnAsistente(page: Page, titulo: string) {
  await page.getByRole("button", { name: /proponer actividad/i }).first().click();
  await page.getByLabel(/^título$/i).fill(titulo);
  // Mismo ancla que club-evento.spec.ts: la tarjeta lleva nombre + descripción
  // ("Evento Una fecha señalada del club."), así que un /^evento$/ no casaría.
  await page.getByRole("button", { name: /^evento\b/i }).click();
  await page.getByRole("button", { name: /^continuar$/i }).click();
}

// Desde la spec 2026-08-11 un evento ya no aparece en la pestaña Actividades:
// vive en el calendario (marca coloreada por tipo/medio) y en su ficha propia.
// Se ancla por el encabezado "Agenda", nunca con getByRole("complementary"):
// ClubShell pinta su propio <aside> de sidebar, así que ese rol casa DOS veces
// y el modo estricto de Playwright aborta.
const agenda = (page: Page) =>
  page.locator("aside").filter({ has: page.getByRole("heading", { name: "Agenda" }) });

// ---------------------------------------------------------------------------

test.describe("tipos de evento de club", () => {
  test("crea un Encuentro (parity)", async ({ page }) => {
    test.setTimeout(90_000);
    const ts = Date.now();
    const owner = await devtestId();
    let club: Club | null = null;

    try {
      club = await crearClub(ts, owner);
      await login(page);

      await page.goto(`/club/${club.slug}?tab=actividades`);
      const titulo = `E2E Encuentro ${ts}`;
      await abrirEventoEnAsistente(page, titulo);

      // El tipo por defecto ya es "Encuentro" -- no hace falta tocar el
      // radiogroup, pero se comprueba: si el default cambiara, el resto del
      // test (que no lo selecciona) dejaría de tener sentido en silencio.
      await expect(page.getByRole("radio", { name: /^encuentro\b/i })).toBeChecked();

      await page.getByLabel(/^fecha$/i).fill("2027-05-20");
      await page.getByLabel(/^hora de inicio$/i).fill("19:30");
      await page.getByLabel(/^modalidad$/i).selectOption("presencial");
      await page.getByRole("button", { name: /^crear evento$/i }).click();

      // El asistente NAVEGA a la ficha del evento recién creado. Antes solo
      // cerraba el panel, y como el evento ya no aparece en Actividades el
      // moderador se quedaba mirando un listado sin ninguna señal de que su
      // evento existiera. El id todavía no se conoce aquí (pollActividad viene
      // después), así que se ancla por forma de URL.
      await expect(page).toHaveURL(
        new RegExp(`/club/${club.slug}/evento/[0-9a-f-]{36}$`),
        { timeout: 15000 },
      );
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();

      // Y sigue sin aparecer en la pestaña Actividades -- desde la spec
      // 2026-08-11 vive en el calendario y en su ficha propia, no en un grupo
      // "Fechas señaladas". Hay que VOLVER a la pestaña: tras el arreglo de
      // arriba ya no estamos en ella. Se espera PRIMERO algo positivo (que el
      // composer esté pintado) para que la ausencia no sea trivialmente cierta
      // por no haber cargado nada todavía.
      await page.goto(`/club/${club.slug}?tab=actividades`);
      await expect(
        page.getByRole("button", { name: /proponer actividad/i }).first(),
      ).toBeVisible();
      await expect(page.getByText(titulo)).toHaveCount(0);

      // Persistido de verdad, con el TIPO correcto -- no solo pintado. Esta es
      // la aserción que protege contra un submit() que fuerce siempre
      // eventType="encuentro": aquí no lo notaría (es el default), pero si esa
      // regresión existiera, los dos tests siguientes sí quedarían en rojo.
      // Se comprueba ANTES de mirar el calendario: pollActividad reintenta (con
      // timeout) hasta que REST refleja la escritura, y una lectura server-side
      // fresca como la del calendario corre la MISMA carrera de replicación que
      // REST -- comprobarlo primero evita que el goto de abajo llegue antes de
      // que la fila exista de verdad.
      const fila = await pollActividad(club.id, titulo);
      expect(fila.event_type).toBe("encuentro");
      expect(fila.modality).toBe("presencial");
      expect(fila.starts_at).not.toBeNull();

      // Se ve en la agenda del calendario, del mes en que se creó (no basta con
      // que el texto exista en cualquier parte de la página).
      await page.goto(`/club/${club.slug}/calendario?mes=2027-05`);
      await expect(agenda(page).getByText(titulo)).toBeVisible({ timeout: 15000 });

      console.log("ENCUENTRO OK:", fila.id);
    } finally {
      await borrarClub(club?.id ?? null);
    }
  });

  test("crea un Lanzamiento de una serie con plataforma", async ({ page }) => {
    test.setTimeout(120_000);
    const ts = Date.now();
    const owner = await devtestId();
    const serie = await serieFixture(owner);
    let club: Club | null = null;

    try {
      club = await crearClub(ts, owner);
      await login(page);

      await page.goto(`/club/${club.slug}?tab=actividades`);
      const titulo = `E2E Lanzamiento ${ts}`;
      await abrirEventoEnAsistente(page, titulo);

      await page.getByRole("radio", { name: /^lanzamiento\b/i }).click();

      await page.getByRole("button", { name: /^elegir libro, película o serie$/i }).click();
      await elegirDeLaBiblioteca(page, serie.title);

      // Tras elegir la obra aparecen "Tipo de lanzamiento" y, por ser una
      // serie, "Plataforma" (platformAllowed solo excluye libro).
      await page.getByLabel(/^tipo de lanzamiento$/i).selectOption("estreno_temporada");
      await page.getByLabel(/^plataforma$/i).selectOption("netflix");

      // "Todo el día" ya nace marcado (default true): se comprueba en vez de
      // pulsarlo, que lo desmarcaría.
      await expect(page.getByRole("checkbox", { name: /todo el día/i })).toBeChecked();
      // Y, en consecuencia, sin campo de hora.
      await expect(page.getByLabel(/^hora de inicio$/i)).toHaveCount(0);

      await page.getByLabel(/^fecha$/i).fill("2027-06-15");
      await page.getByRole("button", { name: /^crear evento$/i }).click();

      // El asistente navega a la ficha del evento recién creado (ver el test de
      // Encuentro). Se afirma aquí además de allí porque también sirve de
      // barrera: sin ella, el `page.goto` de más abajo podría carrerear con el
      // router.push que dispara el formulario.
      await expect(page).toHaveURL(
        new RegExp(`/club/${club.slug}/evento/[0-9a-f-]{36}$`),
        { timeout: 15000 },
      );

      // Persistido de verdad ANTES de mirar el calendario: pollActividad
      // reintenta (con timeout) hasta que REST refleja la escritura, y una
      // lectura server-side fresca como la del calendario corre la MISMA
      // carrera de replicación que REST -- comprobar el calendario primero
      // deja la comprobación expuesta a esa carrera.
      const fila = await pollActividad(club.id, titulo);
      expect(fila.event_type).toBe("lanzamiento");
      const config = fila.config as {
        item?: { itemType: string; itemId: string };
        releaseType?: string;
        platform?: string;
        allDay?: boolean;
      };
      expect(config.item).toEqual({ itemType: "series", itemId: serie.id });
      expect(config.releaseType).toBe("estreno_temporada");
      expect(config.platform).toBe("netflix");
      expect(config.allDay).toBe(true);

      // El asistente se cierra; el evento vive ahora en el calendario, no en la
      // pestaña Actividades (ver comentario de la agenda arriba).
      await page.goto(`/club/${club.slug}/calendario?mes=2027-06`);
      const filaAgenda = agenda(page).locator("li").filter({ hasText: titulo });
      await expect(filaAgenda).toBeVisible({ timeout: 15000 });
      // El chip dice tipo Y medio: "Lanzamiento · Serie". Se comprueba el
      // TEXTO, no la clase de Tailwind que lo colorea -- la clase es un
      // detalle de implementación, el texto es lo que hace la distinción
      // accesible (un lanzamiento de serie vs. uno de libro/película solo se
      // diferencian por él).
      await expect(filaAgenda.getByText("Lanzamiento · Serie")).toBeVisible();

      // La ficha: la obra enlazada y el tipo (releaseType + plataforma) se
      // ven, y -- por ser «todo el día» -- sin hora.
      await page.goto(`/club/${club.slug}/evento/${fila.id}`);
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
      await expect(
        page.getByRole("link", { name: serie.title }).and(page.locator(`[href="/serie/${serie.id}"]`)),
      ).toBeVisible();
      const contenido = page.getByRole("heading", { name: titulo }).locator("xpath=..");
      await expect(contenido.getByText("Estreno de temporada")).toBeVisible();
      await expect(contenido.getByText("Netflix")).toBeVisible();
      // Fecha sin hora: "15 de junio de 2027" (allDay ancla starts_at a 00:00
      // en Europe/Madrid -- el timezone por defecto de create_club_event -- y
      // se relee en esa misma zona, así que no hay salto de día posible).
      await expect(contenido.getByText(/15 de junio de 2027/)).toBeVisible();
      // Negativo, acotado a la columna de contenido (no a toda la página): sin
      // patrón HH:MM. Con la zona/hora ocultas para un evento de todo el día,
      // nada en esta columna debería llevar reloj.
      await expect(contenido.getByText(/\d{1,2}:\d{2}/)).toHaveCount(0);

      console.log("LANZAMIENTO OK:", fila.id);
    } finally {
      await borrarClub(club?.id ?? null);
    }
  });

  test("crea una Fecha destacada con una relación", async ({ page }) => {
    test.setTimeout(120_000);
    const ts = Date.now();
    const owner = await devtestId();
    const serie = await serieFixture(owner);
    let club: Club | null = null;

    try {
      club = await crearClub(ts, owner);
      await login(page);

      await page.goto(`/club/${club.slug}?tab=actividades`);
      const titulo = `E2E Fecha destacada ${ts}`;
      await abrirEventoEnAsistente(page, titulo);

      await page.getByRole("radio", { name: /^fecha destacada\b/i }).click();

      // Sin `clubActivities` (el asistente no lo pasa todavía, issue abierta)
      // el picker de "Enlaces" se abre YA en Obras -- no hace falta pulsar
      // ningún botón antes de buscar.
      await elegirDeLaBiblioteca(page, serie.title);

      // La relación recién añadida se ve como chip, con el TÍTULO real (no
      // solo la categoría "Serie" -- fix f233e5b).
      await expect(page.getByRole("listitem").filter({ hasText: serie.title })).toBeVisible();

      await page.getByLabel(/^fecha$/i).fill("2027-07-04");
      await page.getByRole("button", { name: /^crear evento$/i }).click();

      // El asistente navega a la ficha del evento recién creado (ver el test de
      // Encuentro). Se afirma aquí además de allí porque también sirve de
      // barrera: sin ella, el `page.goto` de más abajo podría carrerear con el
      // router.push que dispara el formulario.
      await expect(page).toHaveURL(
        new RegExp(`/club/${club.slug}/evento/[0-9a-f-]{36}$`),
        { timeout: 15000 },
      );

      // Persistido de verdad ANTES de mirar el calendario: pollActividad
      // reintenta (con timeout) hasta que REST refleja la escritura, y una
      // lectura server-side fresca como la del calendario corre la MISMA
      // carrera de replicación que REST -- comprobar el calendario primero
      // deja la comprobación expuesta a esa carrera.
      const fila = await pollActividad(club.id, titulo);
      expect(fila.event_type).toBe("fecha_destacada");
      const config = fila.config as {
        relations?: Array<{ kind: string; itemType?: string; itemId?: string }>;
        allDay?: boolean;
      };
      expect(config.relations).toEqual([{ kind: "item", itemType: "series", itemId: serie.id }]);
      expect(config.allDay).toBe(true);

      // El asistente se cierra; el evento vive ahora en el calendario, no en la
      // pestaña Actividades (ver comentario de la agenda arriba).
      await page.goto(`/club/${club.slug}/calendario?mes=2027-07`);
      await expect(agenda(page).getByText(titulo)).toBeVisible({ timeout: 15000 });

      // La ficha muestra el enlace a la obra.
      await page.goto(`/club/${club.slug}/evento/${fila.id}`);
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
      await expect(
        page.getByRole("link", { name: serie.title }).and(page.locator(`[href="/serie/${serie.id}"]`)),
      ).toBeVisible();

      console.log("FECHA DESTACADA OK:", fila.id);
    } finally {
      await borrarClub(club?.id ?? null);
    }
  });
});
