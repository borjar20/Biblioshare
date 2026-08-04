import { test, expect } from "@playwright/test";

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

// El turno es (semanas desde clubs.created_at) % nº de miembros activos, sobre
// los miembros ordenados por (joined_at, user_id) -- todo en SQL, ver
// get_club_round_state en 20260803_club_rounds.sql.
//
// Este test usaba antes `test-public-club`, un club compartido con otras
// sesiones (11 miembros activos hoy, con historial real de rondas). Eso traía
// dos problemas de raíz: el setup y el `finally` borraban TODAS sus
// club_rounds -- no solo la del periodo en curso --, así que una ejecución
// normal y en verde se llevaba por delante el histórico de cualquiera que lo
// hubiera sembrado a mano; y dos ejecuciones a la vez (dos sesiones, o dos
// pasadas solapadas) competían por el mismo `created_at` y por la fila única
// (club_id, period_key) del club compartido.
//
// La solución es no compartir nada: un club DESECHABLE, creado por REST con
// service-role y borrado por id en el `finally` (el `on delete cascade` de
// club_members y club_rounds hacia clubs se lleva el resto sin restaurar
// nada). Con un único miembro activo -- el dueño, devtest -- el turno es
// trivial: es el único índice del roster (idx 0), y 0 % 1 = 0 siempre. Y
// `created_at` no se toca: el DEFAULT `now()` de la columna (20260712_clubs.sql)
// ya deja el club nacido en la semana actual, así que weeks=0 sin un PATCH
// aparte.
test("ronda: el titular propone y la ronda queda respondible", async ({ page }) => {
  test.setTimeout(90_000);

  const owner = await devtestId();
  const ts = Date.now();
  const slug = `e2e-ronda-${ts}`; // único por ejecución: dos pasadas seguidas o
  // dos sesiones a la vez no pueden chocar en el índice único de slug.

  let clubId: string | null = null;

  try {
    const [club] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          slug,
          name: `E2E Ronda ${ts}`,
          visibility: "private",
          owner_id: owner,
        }),
      })
    ).json()) as { id: string }[];
    if (!club?.id) throw new Error("no se pudo crear el club desechable");
    clubId = club.id;

    // Insertar el club directo por REST se salta create_club(), que es quien
    // normalmente crea esta fila de forma atómica junto con la del club. Sin
    // ella el roster de get_club_round_state sale vacío y el titular es NULL
    // -- el composer no se pintaría y el test fallaría sin que hubiera bug.
    await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ club_id: clubId, user_id: owner, role: "owner", status: "active" }),
    });

    // El composer solo se pinta para el titular AUTENTICADO (RoundBlock recibe
    // viewerId de getCurrentUser() en la página del club) -- sin login, esMiTurno
    // nunca es true y el test fallaría sin que hubiera ningún bug. El brief no
    // incluía este paso; club-evento.spec.ts sí lo hace y es el patrón real.
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${slug}`);
    // Por rol accesible, más estable que el placeholder: el aria-label es fijo
    // (yourTurnTitle), el placeholder es copia que puede cambiar.
    const composer = page.getByRole("textbox", { name: "Te toca. ¿Qué le preguntas al club?" });
    await expect(composer).toBeVisible();

    // La obra: se persiste (item_type/item_id) desde antes de este fix, pero
    // round-block.tsx no la pintaba nunca -- issue real de la review final.
    // Cualquier ítem de la biblioteca de devtest vale: no importa cuál, solo
    // que el enlace a su ficha aparezca tras enviar. data-testid porque los
    // botones de resultado no tienen nombre accesible fijo (el título es del
    // seed, no de este test).
    await page.getByRole("button", { name: "+ Añadir una obra" }).click();
    const firstResult = page.getByTestId("item-picker-library-result").first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    const pregunta = `¿Ronda de prueba ${ts}?`;
    await composer.fill(pregunta);
    await page.getByRole("button", { name: "Proponer la ronda" }).click();

    // Se comprueba que se GUARDÓ, no solo que se pintara.
    await expect(page.getByText(pregunta)).toBeVisible();
    // Y que la obra adjunta se pinta -- no solo que se guardara en silencio.
    const itemLink = page.getByRole("link", { name: "Ver la obra" });
    await expect(itemLink).toBeVisible();
    await expect(itemLink).toHaveAttribute("href", /^\/(libro|pelicula|serie)\//);

    // La fila persistida, con poll (no un fetch suelto): confirmado a mano
    // contra dev, la REST API de Supabase puede tardar en reflejar una
    // escritura que ya se ve en pantalla (la UI se refresca por
    // revalidatePath sobre la MISMA transacción que la escribió, pero un
    // fetch aparte, a veces MENOS de un segundo después, puede llegar antes
    // de que esa fila sea visible por REST). Un fetch suelto aquí fallaba de
    // forma intermitente con la fila ya confirmada en la base (se vio con SQL
    // directo mientras el fetch de al lado seguía devolviendo []): no es un
    // bug de dominio, es la lag medida en los comentarios de playwright.config.ts.
    let round:
      | { prompt: string; author_id: string | null; item_type: string | null; item_id: string | null }
      | undefined;
    await expect
      .poll(
        async () => {
          const rows = (await (
            await fetch(
              `${SUPABASE_URL}/rest/v1/club_rounds?club_id=eq.${clubId}&select=prompt,author_id,item_type,item_id`,
              { headers: adminHeaders() },
            )
          ).json()) as { prompt: string; author_id: string | null; item_type: string | null; item_id: string | null }[];
          round = rows.find((r) => r.prompt === pregunta);
          return round?.author_id ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();
    expect(round?.prompt).toBe(pregunta);
    // La obra viajó hasta la fila, no solo hasta el enlace en pantalla.
    expect(round?.item_type).not.toBeNull();
    expect(round?.item_id).not.toBeNull();
  } finally {
    // Autolimpieza: el club es desechable y nadie más lo usa, así que basta con
    // borrarlo por id -- el cascade se lleva club_members y club_rounds. No hay
    // nada que restaurar (no se tocó ningún club compartido).
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
