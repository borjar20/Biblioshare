import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es su dueño, y por serlo, joined_at
// más antiguo del roster -> idx 0. Ver el informe de esta tarea: se comprobó
// contra dev que sigue siendo así (10 miembros activos, devtest el más antiguo).

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function clubBySlug(slug: string): Promise<{ id: string; created_at: string }> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs?slug=eq.${slug}&select=id,created_at`, {
      headers: adminHeaders(),
    })
  ).json()) as { id: string; created_at: string }[];
  if (!rows[0]) throw new Error(`no se encontró el club ${slug}`);
  return rows[0];
}

// El turno es (semanas desde clubs.created_at) % nº de miembros activos, sobre
// los miembros ordenados por (joined_at, user_id) -- todo en SQL, ver
// get_club_round_state en 20260803_club_rounds.sql. devtest es el dueño del
// club de pruebas y por tanto su joined_at es el más antiguo del roster ->
// idx 0, verificado contra dev antes de escribir este test (ver informe).
// Con created_at = ahora, weeks=0 y 0 % n = 0 para cualquier n -- no hace
// falta conocer el tamaño del roster, solo que devtest siga siendo idx 0.
test("ronda: el titular propone y la ronda queda respondible", async ({ page }) => {
  const club = await clubBySlug(CLUB_SLUG);

  const original = club.created_at;
  await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${club.id}`, {
    method: "PATCH",
    headers: adminJson(),
    body: JSON.stringify({ created_at: new Date().toISOString() }),
  });
  // Y no puede haber ya una ronda de este periodo, o se pinta el estado 03.
  await fetch(`${SUPABASE_URL}/rest/v1/club_rounds?club_id=eq.${club.id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });

  try {
    // El composer solo se pinta para el titular AUTENTICADO (RoundBlock recibe
    // viewerId de getCurrentUser() en la página del club) -- sin login, esMiTurno
    // nunca es true y el test fallaría sin que hubiera ningún bug. El brief no
    // incluía este paso; club-evento.spec.ts sí lo hace y es el patrón real.
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${CLUB_SLUG}`);
    // Por rol accesible, más estable que el placeholder: el aria-label es fijo
    // (yourTurnTitle), el placeholder es copia que puede cambiar.
    const composer = page.getByRole("textbox", { name: "Te toca. ¿Qué le preguntas al club?" });
    await expect(composer).toBeVisible();

    const pregunta = `¿Ronda de prueba ${Date.now()}?`;
    await composer.fill(pregunta);
    await page.getByRole("button", { name: "Proponer la ronda" }).click();

    // Se comprueba que se GUARDÓ, no solo que se pintara.
    await expect(page.getByText(pregunta)).toBeVisible();

    // La fila persistida, con poll (no un fetch suelto): el mismo motivo que
    // club-evento.spec.ts -- confirmado a mano contra dev, la REST API de
    // Supabase puede tardar en reflejar una escritura que ya se ve en pantalla
    // (la UI se refresca por revalidatePath sobre la MISMA transacción que la
    // escribió, pero un fetch aparte segundos -- a veces MENOS de un segundo --
    // después puede llegar antes de que esa fila sea visible por REST). Un
    // fetch suelto aquí fallaba de forma intermitente con la fila ya
    // confirmada en la base (se vio con SQL directo mientras el fetch de al
    // lado seguía devolviendo []): no es un bug de dominio, es la lag medida
    // en los comentarios de playwright.config.ts.
    let round: { prompt: string; author_id: string | null } | undefined;
    await expect
      .poll(
        async () => {
          const rows = (await (
            await fetch(
              `${SUPABASE_URL}/rest/v1/club_rounds?club_id=eq.${club.id}&select=prompt,author_id`,
              { headers: adminHeaders() },
            )
          ).json()) as { prompt: string; author_id: string | null }[];
          round = rows.find((r) => r.prompt === pregunta);
          return round?.author_id ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();
    expect(round?.prompt).toBe(pregunta);
  } finally {
    // Autolimpieza: deja el club como estaba, o el siguiente test (y las
    // demás sesiones que comparten dev) heredan basura.
    await fetch(`${SUPABASE_URL}/rest/v1/club_rounds?club_id=eq.${club.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${club.id}`, {
      method: "PATCH",
      headers: adminJson(),
      body: JSON.stringify({ created_at: original }),
    });
  }
});
