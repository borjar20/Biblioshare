import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// La vista de actividad dentro del shell del club (spec 2026-07-21). Lo que se
// protege aquí NO es la estética: es que el responsive no se resolviera
// duplicando controles. OJO: Tailwind resuelve `hidden lg:block` / `lg:hidden`
// con `display:none`, y `getByRole` EXCLUYE del árbol de accesibilidad los
// nodos con `display:none` -- si solo contáramos con `getByRole` normal, dos
// botones «Salir» (uno oculto por CSS en cada viewport) seguirían contando 1 y
// el test pasaría en verde con el bug presente. Por eso las aserciones de
// conteo que existen para detectar duplicación usan `{ includeHidden: true }`:
// así SÍ se cuentan los nodos que están en el DOM pero ocultos por CSS.

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

// Un libro que el usuario NO tenga ya en `library_entries`. Coger "el primero del
// catálogo" valdría para lo que este test mira (que la actividad no duplique
// controles), pero rompería la guarda del acta de #782 que hay más abajo: los
// triggers eliminados usaban `on conflict (user_id, item_type, item_id) do
// nothing`, así que sobre un libro que devtest YA tuviera no habrían insertado
// nada ni estando vivos — y la guarda pasaría en verde con el bug presente.
// Comprobado: con el trigger restaurado a mano y `limit=1`, el test pasaba.
async function bookFueraDeLaBiblioteca(userId: string): Promise<string> {
  const yaTiene = new Set(
    (
      (await (
        await fetch(
          `${SUPABASE_URL}/rest/v1/library_entries?user_id=eq.${userId}&item_type=eq.book&select=item_id`,
          { headers: adminHeaders() },
        )
      ).json()) as { item_id: string }[]
    ).map((r) => r.item_id),
  );
  const libros = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/books?select=id&limit=200`, { headers: adminHeaders() })
  ).json()) as { id: string }[];
  if (libros.length === 0) throw new Error("no hay libros en catálogo para el e2e");
  const libre = libros.find((b) => !yaTiene.has(b.id));
  if (!libre) throw new Error("todos los libros del catálogo están ya en library_entries de devtest");
  return libre.id;
}

test("la actividad vive en el shell del club y no duplica controles", async ({ page }) => {
  test.setTimeout(120_000);

  const ts = Date.now();
  const slug = `e2e-pc-${ts}`;
  const owner = await devtestId();
  const bookId = await bookFueraDeLaBiblioteca(owner);

  let clubId: string | null = null;
  let activityId: string | null = null;

  // Guarda del acta de #782 (migración 20260876): unirse a una actividad ya NO
  // escribe en `library_entries`. Hubo dos triggers (`autoadd_library_on_activity_join`
  // y `..._item`, de 20260713_list_challenge.sql) que insertaban ahí una fila
  // 'planned' por cada ítem del pool; se eliminaron porque `library_entries` está
  // congelada y la app no la lee, así que la feature no hacía nada visible.
  //
  // Este test siembra un participante y un ítem con el rol admin, o sea que ejercita
  // exactamente los dos caminos que disparaban los triggers. Por eso es el sitio
  // natural para dejar la guarda: si alguien resucita el auto-añadir (o escribe uno
  // nuevo contra la tabla congelada), esta cuenta deja de ser 0 y el test lo caza.
  //
  // `bookFueraDeLaBiblioteca` garantiza que la cuenta parte de CERO para esta obra
  // (ver el porqué allí), así que aquí basta con exigir que siga en cero: si el
  // auto-añadir resucita, la fila aparece y esto se pone rojo.
  const libraryEntryUrl =
    `${SUPABASE_URL}/rest/v1/library_entries?user_id=eq.${owner}` +
    `&item_type=eq.book&item_id=eq.${bookId}`;
  const countLibraryEntries = async () =>
    ((await (await fetch(libraryEntryUrl, { headers: adminHeaders() })).json()) as unknown[])
      .length;

  try {
    const [club] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({ slug, name: "Shell PC E2E", visibility: "private", owner_id: owner }),
      })
    ).json()) as { id: string }[];
    clubId = club.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ club_id: clubId, user_id: owner, role: "owner", status: "active" }),
    });

    const [activity] = (await (
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
        method: "POST",
        headers: { ...adminJson(), Prefer: "return=representation" },
        body: JSON.stringify({
          club_id: clubId,
          kind: "list_challenge",
          title: `shell pc ${ts}`,
          status: "active",
          created_by: owner,
        }),
      })
    ).json()) as { id: string }[];
    activityId = activity.id;

    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_items`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({
        activity_id: activityId,
        item_type: "book",
        item_id: bookId,
        added_by: owner,
        position: 0,
      }),
    });

    await fetch(`${SUPABASE_URL}/rest/v1/club_activity_participants`, {
      method: "POST",
      headers: adminJson(),
      body: JSON.stringify({ activity_id: activityId, user_id: owner }),
    });

    // Guarda del acta de #782: ni el alta del ítem ni la del participante han
    // podido crear nada en la tabla congelada. Ver el comentario de arriba.
    expect(await countLibraryEntries()).toBe(0);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${slug}/actividad/${activityId}`);

    // 1. El sidebar del club está presente, con «Actividades» como sección activa.
    //    La cabecera de la actividad también enlaza «‹ Actividades» de vuelta
    //    (mismo texto, navegación distinta): acotamos al <aside> del sidebar
    //    para no toparnos con la ambigüedad -- son dos enlaces legítimos, no
    //    un control duplicado.
    //    Esta aserción NO lleva `includeHidden`: a 390 el <aside> entero está
    //    oculto por CSS (`hidden lg:block` en el shell), así que lo correcto
    //    aquí es comprobar que a 1280 el enlace es visible, no contar nodos
    //    ocultos -- no es el caso que este test intenta detectar.
    const sidebar = page.locator("aside");
    const sidebarActividades = sidebar.getByRole("link", { name: "Actividades" });
    await expect(sidebarActividades).toHaveCount(1);
    await expect(sidebarActividades).toBeVisible();

    // 2. Un solo control por acción. `includeHidden: true` es imprescindible:
    //    sin él, un botón duplicado con `hidden lg:block` en uno de los dos
    //    queda fuera del árbol de accesibilidad y `getByRole` seguiría viendo
    //    solo 1 aunque el DOM tenga 2 -- el test sería ciego al bug que dice
    //    proteger.
    await expect(
      page.getByRole("button", { name: "Modificar", includeHidden: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Finalizar", includeHidden: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Archivar", includeHidden: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Salir", includeHidden: true }),
    ).toHaveCount(1);

    // 3. El rail trae la clasificación, y sigue habiendo un solo encabezado.
    //    (Con includeHidden por el mismo motivo que el punto 2: el rail se
    //    oculta por CSS en móvil, no queremos que eso enmascare un duplicado.)
    await expect(
      page.getByRole("heading", { name: "Clasificación del club", includeHidden: true }),
    ).toHaveCount(1);

    // 4. En móvil el orden se conserva y tampoco hay duplicados. NOTA: el
    //    bloque de participantes (avatares + «N participan») SÍ está
    //    duplicado en el DOM a propósito -- se pinta en el mockup y otra vez
    //    en el rail que se oculta en móvil. Es una excepción aprobada porque
    //    son avatares no interactivos que ningún locator busca por rol, así
    //    que no hay que asertar nada sobre ese texto con includeHidden aquí.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Modificar", includeHidden: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Clasificación del club", includeHidden: true }),
    ).toHaveCount(1);

    console.log("ACTIVIDAD PC OK:", slug);
  } finally {
    if (activityId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${activityId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    // Ya no hay nada que limpiar en `library_entries`: los triggers que sembraban
    // filas ahí murieron con la migración 20260876 (acta de #782). La aserción de
    // arriba es justamente lo que garantiza que este `finally` no vuelve a hacer
    // falta -- si algún día vuelve a sobrar basura aquí, el test habrá fallado
    // antes de llegar.
  }
});
