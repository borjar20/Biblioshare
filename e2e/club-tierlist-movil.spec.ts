import { test, expect, type Page } from "@playwright/test";

// Geometría del tablero de TIERLIST en móvil (360 px). Dos fallos reportados
// mirando la app, no un test:
//
//   1. La etiqueta del nivel vivía en una columna de color de 44px de ancho
//      FIJA. Con niveles con nombre ("Perezón histórico", "Ni fu ni fa (como
//      dirían los entendidos)") el texto se salía de esa caja y lo cortaba el
//      `overflow-hidden` de la fila: se leía media palabra, sin forma de saber
//      qué nivel era. Ahora, si alguna etiqueta no cabe, TODAS las filas pasan
//      a banda superior a lo ancho (`layoutForTiers`).
//   2. Las portadas medían 34×51 y no se distinguía una de otra. Ahora son
//      44×66 y la seleccionada crece (~70×106) para poder verla.
//
// Ninguna aserción mira colores: miran RECTÁNGULOS. Es lo único que distingue
// "el layout creció" de "el contenido se salió", que en una captura se parecen
// mucho.
//
// Club DESECHABLE por ejecución (patrón de club-calendario-movil.spec.ts): dos
// tierlists con ocho ítems no pueden quedarse sembradas en `test-public-club`,
// que comparten otras sesiones y otros specs.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const LARGA = "Ni fu ni fa (como dirían los entendidos)";

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

async function crearClub(ts: number, owner: string): Promise<{ id: string; slug: string }> {
  const slug = `e2e-tiermovil-${ts}`;
  const [club] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: `E2E Tier Móvil ${ts}`,
        visibility: "private",
        owner_id: owner,
      }),
    })
  ).json()) as { id: string }[];
  if (!club?.id) throw new Error("no se pudo crear el club desechable");

  // Insertar por REST se salta create_club(), que es quien normalmente crea
  // esta fila. Sin ella devtest no es miembro activo y el tablero ni se monta.
  const miembro = await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ club_id: club.id, user_id: owner, role: "owner", status: "active" }),
  });
  if (!miembro.ok) throw new Error(`no se pudo añadir a devtest al club: ${await miembro.text()}`);

  return { id: club.id, slug };
}

/**
 * Tierlist por REST, no por el asistente: aquí se mide GEOMETRÍA, y montar el
 * pool desde el formulario convierte el test en un guion de cien clics.
 *
 * `club_activity_participants` es imprescindible: `activity-detail` solo monta
 * el tablero para participantes, así que sin esa fila el test mediría el aviso
 * de "únete para ver" y saldría verde sin haber medido nada.
 */
async function crearTierlist(
  clubId: string,
  owner: string,
  titulo: string,
  labels: string[],
  pool: string[],
): Promise<string> {
  const [row] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        club_id: clubId,
        kind: "tierlist",
        title: titulo,
        status: "active",
        created_by: owner,
        config: { tiers: labels.map((label) => ({ label, color: null })) },
      }),
    })
  ).json()) as { id: string }[];
  if (!row?.id) throw new Error(`no se pudo crear la tierlist ${titulo}`);

  const participa = await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ activity_id: row.id, user_id: owner }),
  });
  if (!participa.ok) throw new Error(`no se pudo apuntar a devtest: ${await participa.text()}`);

  const items = await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify(
      pool.map((id, i) => ({
        activity_id: row.id,
        item_type: "book",
        item_id: id,
        added_by: owner,
        position: i + 1,
      })),
    ),
  });
  if (!items.ok) throw new Error(`no se pudieron sembrar los ítems: ${await items.text()}`);

  return row.id;
}

async function libros(cuantos: number): Promise<string[]> {
  const rows = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/books?select=id&cover_url=not.is.null&limit=${cuantos}`, {
      headers: adminHeaders(),
    })
  ).json()) as { id: string }[];
  if (rows.length < cuantos) throw new Error("no hay suficientes libros con portada en catálogo");
  return rows.map((r) => r.id);
}

// Mide, para cada elemento que DIBUJA la etiqueta de un nivel, si su contenido
// cabe dentro de su propia caja. `scrollWidth > clientWidth` es exactamente el
// síntoma que tenía la columna de 44px: el texto seguía ahí, pero fuera de la
// caja y recortado por el contenedor.
async function etiquetasRecortadas(page: Page, textos: string[]) {
  return page.evaluate((esperados) => {
    const fuera: string[] = [];
    for (const texto of esperados) {
      const caja = [...document.querySelectorAll("div, span")]
        .reverse()
        .find((el) => el.textContent?.trim() === texto && el.children.length === 0);
      if (!caja) {
        fuera.push(`no se encontró la etiqueta "${texto}"`);
        continue;
      }
      const el = caja as HTMLElement;
      if (el.scrollWidth - el.clientWidth > 1) {
        fuera.push(`"${texto}" se sale a lo ancho: ${el.scrollWidth}>${el.clientWidth}`);
      }
      if (el.scrollHeight - el.clientHeight > 1) {
        fuera.push(`"${texto}" se sale a lo alto: ${el.scrollHeight}>${el.clientHeight}`);
      }
      // Y no basta con que quepa en su propia caja: esa caja tiene que caber en
      // la fila. La columna de 44px "cabía" en sí misma y aun así el texto
      // pintado se salía por los lados de la fila.
      const fila = el.closest("div")?.parentElement?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (fila && (r.left < fila.left - 1 || r.right > fila.right + 1)) {
        fuera.push(`"${texto}" se sale de su fila`);
      }
    }
    return fuera;
  }, textos);
}

test("tierlist en móvil: la etiqueta del nivel se lee entera y la portada se puede ampliar", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });

  const ts = Date.now();
  let clubId: string | null = null;

  try {
    const owner = await devtestId();
    const club = await crearClub(ts, owner);
    clubId = club.id;
    const pool = await libros(8);

    // Niveles CON NOMBRE: es el caso que se rompía. Con "S/A/B" el texto cabía
    // en los 44px y el test pasaría sin probar nada.
    const conNombre = await crearTierlist(
      clubId,
      owner,
      `Tierlist etiquetas largas ${ts}`,
      ["PEC", LARGA, "Perezón histórico"],
      pool,
    );
    // Y una clásica, para que el otro camino (la columna de color del mockup)
    // siga cubierto: el arreglo no puede haberla convertido también en banda.
    const clasica = await crearTierlist(
      clubId,
      owner,
      `Tierlist clásica ${ts}`,
      ["S", "A", "B"],
      pool.slice(0, 4),
    );

    await login(page);
    await page.goto(`/club/${club.slug}/actividad/${conNombre}`);

    // Positivo primero: si el tablero no se montó, todo lo que sigue mediría
    // una página vacía y saldría verde. Se espera al rótulo de la bandeja, no a
    // una portada: mientras `getTierlists` está en vuelo el componente pinta
    // "esta tierlist todavía no tiene tiers definidos" (no tiene estado de
    // carga propio), y ese cartel comparte pantalla con el resto de la ficha.
    await expect(page.getByText(/Sin clasificar/)).toBeVisible();
    await expect(page.getByText(LARGA).first()).toBeVisible();
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();

    // ── 1. Ninguna etiqueta de nivel queda recortada ──
    expect(
      await etiquetasRecortadas(page, ["PEC", LARGA, "Perezón histórico"]),
      "la etiqueta del nivel debe caber entera en su caja y en su fila",
    ).toEqual([]);

    // ── 2. La página no gana scroll lateral ──
    const lateral = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(lateral, "el tablero no puede añadir scroll horizontal a 360px").toBeLessThanOrEqual(1);

    // ── 3. La portada mide lo que se decidió, y crece al seleccionarla ──
    //
    // El zoom es la respuesta a "a este tamaño no distingo una portada de
    // otra": sin él hay que elegir entre ver la portada y ver el tablero. Se
    // mide el rectángulo REAL porque crece con la propiedad `scale`, que no
    // cambia la caja de layout -- un test que mirase `offsetWidth` no vería nada.
    const portada = page.locator("button[aria-pressed]").first();
    const antes = (await portada.boundingBox())!;
    expect(Math.round(antes.width)).toBe(44);
    expect(Math.round(antes.height)).toBe(66);

    await portada.click();
    await expect(portada).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(300); // la transición de `scale`
    const despues = (await portada.boundingBox())!;
    expect(
      despues.width,
      "la portada seleccionada tiene que verse más grande que sin seleccionar",
    ).toBeGreaterThan(antes.width * 1.4);

    // ── 4. La tierlist clásica conserva la columna de color ──
    //
    // El arreglo cambia el layout SOLO cuando hace falta. Si "S/A/B" acabara
    // también en banda, el dibujo del mockup se habría perdido por el camino.
    await page.goto(`/club/${club.slug}/actividad/${clasica}`);
    await expect(page.getByText(/Sin clasificar/)).toBeVisible();
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();
    expect(await etiquetasRecortadas(page, ["S", "A", "B"]), "S/A/B caben de sobra").toEqual([]);

    const columna = await page.evaluate(() => {
      const texto = [...document.querySelectorAll("div, span")]
        .reverse()
        .find((n) => n.textContent?.trim() === "S" && n.children.length === 0);
      if (!texto) return null;
      // La caja de color es el ancestro de ancho fijo; el <span> del texto va
      // dentro. Se sube hasta encontrar el que mide 44.
      let n: HTMLElement | null = texto as HTMLElement;
      while (n && Math.round(n.getBoundingClientRect().width) !== 44) n = n.parentElement;
      if (!n?.parentElement) return null;
      return {
        ancho: Math.round(n.getBoundingClientRect().width),
        anchoFila: Math.round(n.parentElement.getBoundingClientRect().width),
      };
    });
    expect(columna, "el nivel 'S' debe seguir en su columna de 44px").not.toBeNull();
    expect(
      columna!.anchoFila,
      "la fila tiene que ser mucho más ancha que la columna: eso es que NO es una banda",
    ).toBeGreaterThan(columna!.ancho * 2);
  } finally {
    // fetch nativo, NO el fixture `request`: ese muere con el contexto del
    // navegador, así que un timeout dejaría el club y sus dos tierlists
    // sembradas. El `on delete cascade` hacia clubs se lo lleva todo.
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
