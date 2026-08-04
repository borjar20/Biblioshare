import { test, expect, type Page } from "@playwright/test";

// Seguimiento de eventos de club (spec 2026-08-04).
//
// Club DESECHABLE por ejecución, el patrón de club-ronda.spec.ts: los eventos y
// los seguimientos que crea este spec no pueden aparecer en el calendario de
// `test-public-club`, que comparten otras sesiones. El `on delete cascade` de
// club_activities y club_event_followers hacia clubs se lo lleva todo en el
// `finally`, sin restaurar nada a mano.

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

/** Club privado desechable con devtest como dueño y único miembro activo. */
async function crearClub(ts: number): Promise<Club> {
  const owner = await devtestId();
  const slug = `e2e-evento-${ts}`;
  const [club] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: `E2E Evento ${ts}`,
        visibility: "private",
        owner_id: owner,
      }),
    })
  ).json()) as { id: string }[];
  if (!club?.id) throw new Error("no se pudo crear el club desechable");

  // Insertar el club por REST se salta create_club(), que es quien normalmente
  // crea esta fila. Sin ella no hay membresía activa y todas las RPC de
  // seguimiento responderían not_a_member: el test fallaría sin que haya bug.
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

/**
 * Evento creado por REST con service-role, no por la UI: este spec prueba el
 * SEGUIMIENTO, y montar el evento por el formulario metería el asistente de
 * creación en el camino crítico de todos los casos.
 *
 * `starts_at` en horas relativas para que el estado derivado sea el que toca sin
 * depender de la fecha en que se ejecute.
 */
async function crearEvento(
  clubId: string,
  campos: {
    title: string;
    horasDesdeAhora: number;
    duracionHoras?: number;
    eventState?: "programado" | "cancelado" | "pospuesto";
    location?: string | null;
    modality?: "presencial" | "online" | "hibrida";
  },
): Promise<string> {
  const owner = await devtestId();
  const starts = new Date(Date.now() + campos.horasDesdeAhora * 3_600_000);
  const ends =
    campos.duracionHoras != null
      ? new Date(starts.getTime() + campos.duracionHoras * 3_600_000)
      : null;

  const [row] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        club_id: clubId,
        kind: "evento",
        title: campos.title,
        status: "active",
        created_by: owner,
        starts_at: starts.toISOString(),
        ends_at: ends?.toISOString() ?? null,
        event_timezone: "Europe/Madrid",
        location: campos.location ?? null,
        modality: campos.modality ?? "presencial",
        event_state: campos.eventState ?? "programado",
      }),
    })
  ).json()) as { id: string }[];
  if (!row?.id) throw new Error("no se pudo crear el evento");
  return row.id;
}

async function contarSeguidores(activityId: string): Promise<number> {
  const rows = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/club_event_followers?activity_id=eq.${activityId}&select=user_id`,
      { headers: adminHeaders() },
    )
  ).json()) as unknown[];
  return rows.length;
}

// ---------------------------------------------------------------------------

test("evento: seguir desde la agenda, persistir, cambiar recordatorio y dejar de seguir", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  let club: Club | null = null;

  try {
    club = await crearClub(ts);
    const titulo = `E2E Evento seguible ${ts}`;
    // A 72 h: bastante lejos para que «24 horas antes» caiga en el futuro, así
    // que el aviso queda ARMADO y no se entrega de inmediato.
    const eventoId = await crearEvento(club.id, {
      title: titulo,
      horasDesdeAhora: 72,
      duracionHoras: 2,
      location: "Sala E2E",
      modality: "presencial",
    });

    await login(page);

    // 1. El calendario del club, y el detalle desde la AGENDA (la leyenda del
    //    encargo): la fila entera es el enlace.
    await page.goto(`/club/${club.slug}/calendario`);
    const filaAgenda = page.getByRole("link", { name: new RegExp(titulo) });
    await expect(filaAgenda).toBeVisible();
    await filaAgenda.click();

    // 2. La ficha, con su URL estable.
    await expect(page).toHaveURL(new RegExp(`/club/${club.slug}/evento/${eventoId}$`));
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    // Cero seguidores al empezar.
    await expect(page.getByText("Nadie lo sigue todavía")).toBeVisible();

    // 3. Seguir.
    await page.getByRole("button", { name: "Seguir evento" }).click();

    // 4. Aparece como seguidor: el contador Y la lista, que tienen que decir lo
    //    mismo (§21).
    await expect(page.getByText("Una persona sigue este evento")).toBeVisible();
    await page.getByRole("button", { name: "Ver todos" }).click();
    const panel = page.getByRole("dialog", { name: "Quién sigue este evento" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Tú")).toBeVisible();
    // Esc cierra y devuelve el foco: es la gestión de foco que pide el encargo.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Y persistido de verdad, no solo pintado.
    expect(await contarSeguidores(eventoId)).toBe(1);

    // 5-6. Recargar: el estado SIGUE.
    await page.reload();
    await expect(page.getByRole("button", { name: "Siguiendo" })).toBeVisible();
    await expect(page.getByText("Una persona sigue este evento")).toBeVisible();

    // 7. Cambiar la preferencia de recordatorio.
    const radio1h = page.getByRole("radio", { name: "1 hora antes" });
    await radio1h.check();
    await expect(radio1h).toBeChecked();
    // Se comprueba que se GUARDÓ, releyendo tras recargar.
    await page.reload();
    await expect(page.getByRole("radio", { name: "1 hora antes" })).toBeChecked();

    // 8. Dejar de seguir.
    await page.getByRole("button", { name: "Siguiendo" }).click();

    // 9. Desaparece de la lista y el contador vuelve a cero.
    await expect(page.getByText("Nadie lo sigue todavía")).toBeVisible();
    await expect(page.getByRole("button", { name: "Seguir evento" })).toBeVisible();
    expect(await contarSeguidores(eventoId)).toBe(0);
  } finally {
    await borrarClub(club?.id ?? null);
  }
});

test("evento: la marca de «seguido» y el filtro «Sigues» de la agenda", async ({ page }) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  let club: Club | null = null;

  try {
    club = await crearClub(ts);
    const seguido = `E2E Seguido ${ts}`;
    const noSeguido = `E2E Sin seguir ${ts}`;
    await crearEvento(club.id, { title: seguido, horasDesdeAhora: 48, duracionHoras: 2 });
    await crearEvento(club.id, { title: noSeguido, horasDesdeAhora: 50, duracionHoras: 2 });

    await login(page);
    await page.goto(`/club/${club.slug}/calendario`);

    // Seguir desde la propia fila, sin abrir la ficha: el control es hermano del
    // enlace, así que pulsarlo NO navega.
    await page.getByRole("button", { name: `Seguir evento: ${seguido}` }).click();
    await expect(
      page.getByRole("button", { name: `Dejar de seguir: ${seguido}` }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/club/${club.slug}/calendario`));

    // El texto accesible equivalente a «Evento seguido» aparece (§17): es lo que
    // hace que la marca no dependa solo del color.
    await expect(page.getByText("Evento seguido").first()).toBeVisible();

    // El filtro «Sigues» deja solo el evento seguido.
    await page.getByRole("tab", { name: /Sigues/ }).click();
    await expect(page.getByRole("link", { name: new RegExp(seguido) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(noSeguido) })).toBeHidden();

    // Y «Todo» los devuelve los dos.
    await page.getByRole("tab", { name: "Todo" }).click();
    await expect(page.getByRole("link", { name: new RegExp(noSeguido) })).toBeVisible();
  } finally {
    await borrarClub(club?.id ?? null);
  }
});

test("evento: cancelado y finalizado no se pueden seguir, y lo dicen", async ({ page }) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  let club: Club | null = null;

  try {
    club = await crearClub(ts);
    const cancelado = await crearEvento(club.id, {
      title: `E2E Cancelado ${ts}`,
      horasDesdeAhora: 24,
      duracionHoras: 2,
      eventState: "cancelado",
    });
    const finalizado = await crearEvento(club.id, {
      title: `E2E Finalizado ${ts}`,
      horasDesdeAhora: -48,
      duracionHoras: 2,
    });

    await login(page);

    await page.goto(`/club/${club.slug}/evento/${cancelado}`);
    await expect(page.getByText("Este evento ha sido cancelado.").first()).toBeVisible();
    // Deshabilitado, no ausente: y el motivo se dice con palabras, no solo con
    // opacidad.
    await expect(page.getByRole("button", { name: "Seguir evento" })).toBeDisabled();

    await page.goto(`/club/${club.slug}/evento/${finalizado}`);
    await expect(page.getByText("Este evento ya ha finalizado.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Seguir evento" })).toBeDisabled();

    // Y ninguno de los dos ofrece el selector de recordatorio: sería un control
    // sin consecuencia.
    await expect(page.getByRole("radiogroup", { name: "Cuándo avisarte" })).toBeHidden();
  } finally {
    await borrarClub(club?.id ?? null);
  }
});

test("evento: sin permisos no se llega a la ficha ni por URL directa", async ({ page }) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  let club: Club | null = null;

  try {
    club = await crearClub(ts);
    const eventoId = await crearEvento(club.id, {
      title: `E2E Privado ${ts}`,
      horasDesdeAhora: 24,
      duracionHoras: 2,
    });

    // Quitar la membresía deja a devtest FUERA de su propio club de pruebas: es
    // la forma de comprobar el gate sin necesitar una segunda cuenta.
    await fetch(
      `${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${club.id}&user_id=eq.${await devtestId()}`,
      { method: "DELETE", headers: adminHeaders() },
    );

    await login(page);
    const respuesta = await page.goto(`/club/${club.slug}/evento/${eventoId}`);
    // 404 de verdad, no una ficha vacía: un club privado no filtra sus fechas
    // por URL.
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: new RegExp(`E2E Privado ${ts}`) })).toBeHidden();
  } finally {
    await borrarClub(club?.id ?? null);
  }
});

test("evento: la ficha y el seguimiento funcionan en móvil", async ({ page }) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  let club: Club | null = null;

  try {
    // 390x844 = el viewport de las maquetas móviles del proyecto.
    await page.setViewportSize({ width: 390, height: 844 });

    club = await crearClub(ts);
    const titulo = `E2E Movil ${ts}`;
    const eventoId = await crearEvento(club.id, {
      title: titulo,
      horasDesdeAhora: 36,
      duracionHoras: 2,
      location: "Sala móvil",
    });

    await login(page);
    await page.goto(`/club/${club.slug}/evento/${eventoId}`);

    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    const seguir = page.getByRole("button", { name: "Seguir evento" });
    await expect(seguir).toBeVisible();

    // Que sea visible no basta: en móvil el riesgo es que la tabbar inferior o un
    // rail sticky lo tapen. Se comprueba que se puede PULSAR de verdad.
    await seguir.click();
    await expect(page.getByRole("button", { name: "Siguiendo" })).toBeVisible();
    expect(await contarSeguidores(eventoId)).toBe(1);

    // La lista completa en móvil sale como hoja inferior; tiene que abrirse y
    // cerrarse igual.
    await page.getByRole("button", { name: "Ver todos" }).click();
    const panel = page.getByRole("dialog", { name: "Quién sigue este evento" });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  } finally {
    await borrarClub(club?.id ?? null);
  }
});

test("evento: el teclado llega al detalle y al control de seguir por separado", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  let club: Club | null = null;

  try {
    club = await crearClub(ts);
    const titulo = `E2E Teclado ${ts}`;
    await crearEvento(club.id, { title: titulo, horasDesdeAhora: 60, duracionHoras: 2 });

    await login(page);
    await page.goto(`/club/${club.slug}/calendario`);

    const enlace = page.getByRole("link", { name: new RegExp(titulo) });
    const boton = page.getByRole("button", { name: `Seguir evento: ${titulo}` });

    // Lo que ESTE test protege, comprobado con mutaciones deliberadas:
    //   - Que el botón sigue siendo alcanzable y accionable con teclado, y que al
    //     accionarlo NO se pierde el foco. Esto último cazó un bug real: con el
    //     atributo `disabled` durante el guardado, el navegador blurea el botón
    //     enfocado y quien navega con teclado se queda en el body, perdiendo su
    //     sitio en la lista. Se arregló con aria-disabled.
    //
    // Lo que NO protege, y conviene saberlo para no confiarse: anidar el botón
    // dentro del <a>. Se probó metiéndolo dentro a mano y este test siguió pasando
    // -- Chrome mantiene enfocable un botón anidado aunque el HTML sea inválido.
    // De ese caso se encarga el test «la marca de seguido y el filtro Sigues», que
    // sí falla con el botón anidado (el clic navega y la marca nunca aparece);
    // también verificado con la misma mutación.
    await enlace.focus();
    await expect(enlace).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(boton).toBeFocused();

    // Enter sobre el botón: sigue el evento y NO navega.
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: `Dejar de seguir: ${titulo}` }),
    ).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/club/${club.slug}/calendario`));

    // Y Enter sobre el enlace sí abre la ficha.
    await enlace.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
  } finally {
    await borrarClub(club?.id ?? null);
  }
});
