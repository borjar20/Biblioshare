import { test, expect, type Page } from "@playwright/test";

// Geometría del tablero de TIERLIST en móvil (360 px). Dos fallos reportados
// mirando la app, no un test:
//
//   1. La etiqueta del nivel vivía en una columna de color de 44px de ancho
//      FIJA. Con niveles con nombre ("Perezón histórico", "Ni fu ni fa (como
//      dirían los entendidos)") el texto se salía de esa caja y lo cortaba el
//      `overflow-hidden` de la fila: se leía media palabra, sin forma de saber
//      qué nivel era. Ahora la columna tiene dos anchos y lo elige
//      `tierColumnWidth`: 44px para S/A/B, 84px con rótulo pequeño y envuelto
//      en cuanto un nivel tiene nombre. El ancho es del TABLERO, no de la fila.
//   2. Las portadas medían 34×51 y no se distinguía una de otra. Ahora la
//      retícula es un grid de columnas FLUIDAS (las que caben se reparten el
//      ancho exacto, sin el hueco muerto que dejaba el `flex-wrap`) y tocar una
//      abre una HOJA con la portada grande, el tipo, el título y los botones de
//      tier -- que antes vivían en una fila al pie del tablero, lejos de lo que
//      colocaban.
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

/** Ancho de la caja de color de cada etiqueta, en el orden pedido. */
async function anchosDeColumna(page: Page, textos: string[]) {
  return page.evaluate((esperados) => {
    return esperados.map((texto) => {
      const span = [...document.querySelectorAll("span")]
        .reverse()
        .find((el) => el.textContent?.trim() === texto && el.children.length === 0);
      // La caja de color es el padre del <span> del rótulo.
      const caja = span?.parentElement;
      return caja ? Math.round(caja.getBoundingClientRect().width) : -1;
    });
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
    await expect(page.getByTestId("tierlist-cover").first()).toBeVisible();

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

    // ── 3. La retícula reparte TODO el ancho: ni un hueco muerto al final ──
    //
    // Con las portadas de ancho fijo y `flex-wrap`, el sobrante de cada línea se
    // quedaba a la derecha como hueco vacío. Con el grid de columnas fluidas las
    // que caben se reparten el ancho exacto, así que la última portada de una
    // línea completa tiene que morir en el borde interior de su caja.
    const hueco = await page.evaluate(() => {
      const primera = document.querySelector('[data-testid="tierlist-cover"]');
      const caja = primera?.parentElement;
      if (!caja) return "no hay retícula que medir";
      const r = caja.getBoundingClientRect();
      const padding = parseFloat(getComputedStyle(caja).paddingRight);
      const portadas = [...caja.children].map((c) => c.getBoundingClientRect());
      // Solo la primera línea del grid: las de abajo pueden ir a medias.
      const linea = portadas.filter((p) => Math.abs(p.top - portadas[0].top) < 1);
      if (linea.length < 2) return `solo ${linea.length} portada(s) por línea`;
      const sobra = r.right - padding - linea[linea.length - 1].right;
      return Math.abs(sobra) <= 1 ? "" : `sobran ${Math.round(sobra)}px a la derecha`;
    });
    expect(hueco, "la última portada de la línea llega al borde de su caja").toBe("");

    // Y siguen siendo portadas (2:3), no cuadrados estirados por el grid.
    const portada = page.getByTestId("tierlist-cover").first();
    const mini = (await portada.boundingBox())!;
    expect(mini.width, "el grid no puede exprimirlas por debajo de su mínimo").toBeGreaterThanOrEqual(
      48,
    );
    expect(mini.height / mini.width, "proporción de portada").toBeCloseTo(1.5, 1);

    // ── 3b. La hoja es donde se ve la obra ──
    //
    // La otra mitad de la misma decisión: la portada del tablero puede seguir
    // siendo miniatura PORQUE tocarla abre una hoja donde se ve grande y con el
    // título escrito. Medir solo una de las dos dejaría pasar la regresión que
    // importa (portada diminuta y nada que la explique).

    await portada.click();
    const hoja = page.locator("dialog[open]");
    await expect(hoja).toBeVisible();
    // El título de la obra está escrito en la hoja: es lo que faltaba para
    // saber qué se estaba colocando.
    const titulo = await hoja.locator("b").first().textContent();
    expect(titulo?.trim().length, "la hoja tiene que decir de qué obra es").toBeGreaterThan(0);
    const grande = (await hoja.locator("img").first().boundingBox())!;
    expect(
      grande.height,
      "la portada de la hoja tiene que ser MUCHO mayor que la miniatura",
    ).toBeGreaterThan(mini.height * 2);

    // ── 4. Se coloca desde la hoja, y al colocar se cierra ──
    //
    // Antes había que mirar arriba (qué seleccioné) y tocar abajo (dónde va).
    // Si los botones de tier volvieran a salir de la hoja, esto se pone rojo.
    await hoja.getByRole("button", { name: "Perezón histórico" }).click();
    await expect(hoja).toBeHidden();
    await expect(
      page.getByText(/Sin clasificar · 7/),
      "el ítem colocado sale de la bandeja",
    ).toBeVisible();

    // ── 5. Se puede deseleccionar sin colocar nada ──
    //
    // Cerrar la hoja NO puede dejar el ítem colocado ni el tablero en un estado
    // "a medias": abrir y cerrar es una operación sin efecto.
    await page.getByTestId("tierlist-cover").first().click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toBeHidden();
    await expect(page.getByText(/Sin clasificar · 7/)).toBeVisible();

    // ── 6. El ancho de la columna se elige, y es el mismo en todas las filas ──
    //
    // Con nombres largos la columna va a 84px; con S/A/B se queda en los 44 del
    // mockup. Y en un tablero dado TODAS las filas comparten ancho: si cada
    // fila eligiera el suyo, las portadas de cada tier arrancarían en una
    // vertical distinta y la retícula dejaría de leerse como una tabla.
    expect(
      await anchosDeColumna(page, [LARGA, "Perezón histórico", "PEC"]),
      "con un nombre largo, las tres columnas miden 84",
    ).toEqual([84, 84, 84]);

    await page.goto(`/club/${club.slug}/actividad/${clasica}`);
    await expect(page.getByText(/Sin clasificar/)).toBeVisible();
    await expect(page.getByTestId("tierlist-cover").first()).toBeVisible();
    expect(await etiquetasRecortadas(page, ["S", "A", "B"]), "S/A/B caben de sobra").toEqual([]);
    expect(
      await anchosDeColumna(page, ["S", "A", "B"]),
      "S/A/B se quedan en la columna estrecha del mockup",
    ).toEqual([44, 44, 44]);
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
