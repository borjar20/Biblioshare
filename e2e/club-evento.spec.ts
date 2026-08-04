import { test, expect, type APIRequestContext } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es su dueño (moderador+)

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function clubIdBySlug(slug: string): Promise<string> {
  const rows = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/clubs?slug=eq.${encodeURIComponent(slug)}&select=id`,
      { headers: adminHeaders() },
    )
  ).json()) as { id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el club ${slug}`);
  return rows[0].id;
}

// Crea un usuario desechable con email ya confirmado y su perfil (mismo patrón
// que club-activity-changes.spec.ts / club-join-request.spec.ts).
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
    data: { user_id: user.id, username },
  });
  return { id: user.id as string, username, email, password };
}

// Un moderador marca una fecha en el club. Se comprueba que se crea de verdad
// (no solo que se pinte), que NO navega a ninguna ficha, que su URL de detalle
// devuelve 404 (con control positivo), y que EDITAR/ARCHIVAR desde la tarjeta
// -- controles solo de moderador+ -- funcionan de verdad contra la RPC con un
// auth.uid() real. Se autolimpia.
test("evento: se crea, se edita, se archiva y su tarjeta no enlaza a /actividad", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 420, height: 1100 });
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  const headers = adminHeaders();
  let eventoId: string | null = null;

  try {
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
    await page.getByRole("button", { name: /proponer actividad/i }).first().click();

    const titulo = `e2e evento ${Date.now()}`;
    await page.getByLabel(/^título$/i).fill(titulo);
    // OJO con el ancla: la tarjeta de kind contiene el nombre Y su descripción, así
    // que su nombre accesible es "Evento Una fecha señalada del club". Un
    // /^evento$/ no casaría y el test fallaría sin que nada estuviera roto.
    await page.getByRole("button", { name: /^evento\b/i }).click();
    await page.getByRole("button", { name: /^continuar$/i }).click();

    // Paso 2 de un evento: SOLO la fecha. Se espera PRIMERO algo positivo (que el
    // campo Fecha esté pintado) y solo entonces se afirma la ausencia del pool de
    // ítems -- afirmar un 0 como primera acción tras el click es trivialmente
    // cierto si el paso 2 todavía no ha pintado nada (propose-wizard.spec.ts:38-47).
    await expect(page.getByLabel(/^fecha$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^añadir ítem$/i })).toHaveCount(0);
    await page.getByLabel(/^fecha$/i).fill("2027-03-15");
    await page.getByRole("button", { name: /^crear evento$/i }).click();

    // Existe en la BD. Se comprueba antes que la pantalla: la UI puede pintar el
    // título desde su propio estado aunque el submit falle (falso verde ya visto
    // en propose-wizard.spec.ts).
    let creado: { id: string; status: string; kind: string; starts_on: string } | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(titulo)}&select=id,status,kind,starts_on`,
            { headers },
          );
          [creado] = await res.json();
          return creado?.id ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();
    eventoId = creado!.id;

    expect(creado!.kind).toBe("evento");
    expect(creado!.status).toBe("active"); // nace activo, no propuesto
    expect(creado!.starts_on).toBe("2027-03-15");

    // La tarjeta se ve DENTRO de su grupo, no en cualquier parte de la página: si
    // una regresión la colara en "Activas", este test seguiría en verde con
    // getByText sueltos mientras exista cualquier otro evento en el DOM.
    const seccionEventos = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Fechas señaladas" }) });
    await expect(seccionEventos.getByText(titulo)).toBeVisible({ timeout: 15000 });

    // ...y también en el resumen del club, ahora en la tira unificada
    // "Próximo" (el calendario fundió "Próximos hitos" y "Próximas fechas").
    //
    // OJO, este assert es más frágil de lo que parece: antes miraba un bloque
    // que SOLO contenía eventos, con cupo de 4. Ahora la tira mezcla hitos y
    // eventos con cupo de 3 -- cualquier hito futuro del club de pruebas con
    // fecha anterior a "2027-03-15" compite por ese sitio y puede desplazar a
    // este evento fuera de la tira. Si este assert falla, la sospecha NO es
    // necesariamente una regresión del feature: puede ser que el club de
    // pruebas haya acumulado hitos con fecha entre hoy y esa, y ya no quepan
    // los 3 huecos. Revisa el contenido de la tira antes de asumir lo peor.
    //
    // Además, `getByRole(..., { name: "Próximo" })` empareja por SUBCADENA: el
    // encabezado real es "Próximo Ver calendario ›" (el enlace forma parte del
    // texto accesible del heading). Si alguien lo "endurece" a `exact: true` o
    // a un regex anclado (^Próximo$), este assert se rompe aunque nada más
    // haya cambiado -- ya pasó exactamente este fallo con otra tarjeta.
    await page.goto(`/club/${CLUB_SLUG}`);
    const seccionProximo = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Próximo" }) });
    await expect(seccionProximo.getByText(titulo)).toBeVisible({ timeout: 15000 });
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);

    // ...y su TARJETA no enlaza a /actividad/[id].
    //
    // Ojo con leer esto como «un evento no tiene ficha»: desde la spec 2026-08-04
    // SÍ la tiene, en /club/[slug]/evento/[id] (ver club-evento-seguimiento.spec.ts).
    // Lo que sigue siendo cierto, y es lo que protege este bloque, es que la ruta
    // GENÉRICA de actividad no sirve eventos: hasDetailView sigue en false porque
    // ActivityDetailView está montado sobre el pool de ítems, los participantes y
    // las opiniones, y un evento no tiene ninguna de las tres.
    //
    // Se comprueba que la URL no cambia, no solo que falte un <a>: lo que rompería
    // de verdad es que el envoltorio condicional se invierta y la tarjeta vuelva a
    // ser un Link a /actividad/.
    await expect(
      page.locator(`a[href*="/actividad/"]`).filter({ hasText: titulo }),
    ).toHaveCount(0);
    const urlAntes = page.url();
    await page.getByText(titulo).first().click();
    // Comprobación determinista de que no navegó: en vez de un sleep a ciegas, se
    // espera (con el auto-reintento normal de Playwright) a que un control que
    // SOLO existe en la vista de actividades siga presente.
    await expect(
      page.getByRole("button", { name: /proponer actividad/i }).first(),
    ).toBeVisible();
    expect(page.url()).toBe(urlAntes);

    // Y la ruta genérica de actividad, pedida a mano, sigue dando 404 para un
    // evento (su ficha propia vive en otra ruta).
    const respuesta = await page.goto(`/club/${CLUB_SLUG}/actividad/${eventoId}`);
    expect(respuesta?.status()).toBe(404);

    // Control positivo: la ficha de una actividad NO-evento del mismo club sí
    // responde 200. Sin esto, un `getActivity` roto que devolviera null para
    // CUALQUIER id pasaría igual de verde -- el 404 de arriba probaría un fallo
    // general, no específicamente la rama `hasDetailView` de un evento.
    const clubId = await clubIdBySlug(CLUB_SLUG);
    const [otraActividad] = (await (
      await request.get(
        `${SUPABASE_URL}/rest/v1/club_activities?club_id=eq.${clubId}&kind=neq.evento&status=eq.active&select=id&limit=1`,
        { headers },
      )
    ).json()) as { id: string }[];
    expect(
      otraActividad,
      "hace falta una actividad NO-evento activa en el club para el control positivo",
    ).toBeTruthy();
    const respuestaControl = await page.goto(
      `/club/${CLUB_SLUG}/actividad/${otraActividad.id}`,
    );
    expect(respuestaControl?.status()).toBe(200);

    // ── Editar (Gap 1): updateClubEvent/update_club_event nunca había corrido
    // con un moderador autenticado de verdad -- solo por conexión directa a la
    // BD, donde auth.uid() es NULL y has_min_club_role nunca se evaluó de
    // verdad. Aquí se ejerce el camino real: UI -> Server Action -> RPC. ──
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
    const seccionEventosEdit = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Fechas señaladas" }) });
    await seccionEventosEdit.getByRole("button", { name: /^editar evento$/i }).click();

    const tituloEditado = `e2e evento editado ${Date.now()}`;
    await page.getByLabel(/^título$/i).fill(tituloEditado);
    await page.getByLabel(/^fecha$/i).fill("2027-04-20");
    await page.getByRole("button", { name: /^guardar cambios$/i }).click();

    // La fila persistida primero.
    let editado: { title: string; starts_on: string; status: string } | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}&select=title,starts_on,status`,
            { headers },
          );
          [editado] = await res.json();
          return editado?.title ?? null;
        },
        { timeout: 15000 },
      )
      .toBe(tituloEditado);
    expect(editado!.starts_on).toBe("2027-04-20");
    expect(editado!.status).toBe("active"); // editar no cambia el estado

    // Y en pantalla, dentro del mismo grupo: el título viejo ya no está, el
    // nuevo sí.
    await expect(seccionEventosEdit.getByText(tituloEditado)).toBeVisible({
      timeout: 15000,
    });
    await expect(seccionEventosEdit.getByText(titulo, { exact: true })).toHaveCount(0);

    // ── Archivar (Gap 1): mismo motivo -- archiveActivity/archive_club_activity
    // gateado por has_min_club_role, ejercido aquí con un auth.uid() real. ──
    await seccionEventosEdit.getByRole("button", { name: /^archivar$/i }).click();

    let archivado: { status: string } | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}&select=status`,
            { headers },
          );
          [archivado] = await res.json();
          return archivado?.status ?? null;
        },
        { timeout: 15000 },
      )
      .toBe("archived");

    // La tarjeta cae en "Finalizadas", donde ya no lleva acciones de edición.
    // Se espera PRIMERO lo positivo (misma regla que en :78-82): afirmar la
    // ausencia de "Fechas señaladas" antes de comprobar que la tarjeta aterrizó
    // en "Finalizadas" sería trivialmente cierto si la página aún no ha
    // repintado nada.
    const seccionFinalizadas = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Finalizadas" }) });
    await expect(seccionFinalizadas.getByText(tituloEditado)).toBeVisible();
    // La comprobación que de verdad importa es que ESTE evento ya no está en
    // "Fechas señaladas" -- no que la sección entera haya desaparecido: el club
    // acumula eventos huérfanos de otras specs, así que asumir que este era el
    // único evento (toHaveCount(0) sobre el heading) convertiría un huérfano
    // ajeno en un fallo permanente de este test.
    await expect(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Fechas señaladas" }) })
        .getByText(tituloEditado),
    ).toHaveCount(0);

    console.log("EVENTO OK: creado, editado y archivado con moderador real", eventoId);
  } finally {
    if (eventoId) {
      // fetch nativo, NO el `request` de Playwright: ese fixture muere junto con
      // el contexto del navegador, así que si el test expira por timeout la
      // limpieza no llega a ejecutarse y deja filas sueltas en la base (mismo
      // motivo que club-join-request.spec.ts:114-117; ya pasó -- 8 filas
      // huérfanas motivaron este try/finally).
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}`, {
        method: "DELETE",
        headers,
      });
      console.log("LIMPIEZA OK: evento", eventoId, "borrado");
    }
  }
});

// Gap 2: la tarjeta "Evento" del asistente está gateada por `isModerator`
// (ProposeWizard -> visibleKindOptions). Un miembro raso del club NO debe
// verla. Esto se saltó antes con la excusa de "solo existe una cuenta de
// prueba sembrada" -- falso: club-activity-changes.spec.ts, club-join-request.spec.ts
// y club-member-directory.spec.ts ya crean usuarios desechables por API admin.
// Se reutiliza esa misma máquina aquí, añadiendo al usuario como `member` raso
// del club de pruebas (no dueño, no moderador).
test("evento: un miembro raso no ve la tarjeta 'Evento' en el asistente", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const ts = Date.now();
  const username = `e2eeventomem${ts}`.slice(0, 20);
  const miembro = await crearUsuario(request, username);

  let clubId: string | null = null;
  let membershipAdded = false;

  try {
    clubId = await clubIdBySlug(CLUB_SLUG);

    const addRes = await request.post(`${SUPABASE_URL}/rest/v1/club_members`, {
      headers: adminJson(),
      data: { club_id: clubId, user_id: miembro.id, role: "member", status: "active" },
    });
    expect(addRes.ok(), "el miembro raso debe poder añadirse al club").toBeTruthy();
    membershipAdded = true;

    await page.goto("/login");
    await page.fill('input[name="email"]', miembro.email);
    await page.fill('input[name="password"]', miembro.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
    await page.getByRole("button", { name: /proponer actividad/i }).first().click();

    // Prueba positiva de que el asistente pintó de verdad su paso 1 (si no
    // pintara nada, la ausencia de la tarjeta "Evento" sería un falso verde).
    await expect(page.getByLabel(/^título$/i)).toBeVisible();
    // Las tarjetas de un moderador+ SÍ están (lectura conjunta, por ejemplo);
    // la de evento, gateada por isModerator, no.
    await expect(page.getByRole("button", { name: /lectura conjunta/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^evento\b/i })).toHaveCount(0);

    console.log("MIEMBRO RASO OK: no ve 'Evento'", username);
  } finally {
    if (membershipAdded && clubId) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/club_members?club_id=eq.${clubId}&user_id=eq.${miembro.id}`,
        { method: "DELETE", headers: adminHeaders() },
      );
    }
    // fetch nativo, NO el `request` de Playwright: ese fixture muere junto con el
    // contexto del navegador (mismo motivo que club-join-request.spec.ts).
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${miembro.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    console.log("LIMPIEZA OK: usuario", username, "borrado");
  }
});
