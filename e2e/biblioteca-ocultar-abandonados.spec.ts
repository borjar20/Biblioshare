import { expect, test, type Page } from "@playwright/test";

// E2E de la preferencia «ocultar obras abandonadas». Lo que cubre y las
// unitarias no pueden:
//
//  · que el interruptor de /ajustes escribe de verdad en `profiles` y que la
//    rejilla lo respeta en la siguiente navegación;
//  · que `?abandonados=1` devuelve la obra SIN apagar la preferencia — o sea
//    que es una anulación por vista, no un interruptor encubierto;
//  · que filtrar por estado «Abandonado» enseña abandonados aunque la
//    preferencia esté activa. Es el límite duro de la spec (D5) y lo que
//    impide que un futuro «ya que estamos» convierta el filtro en un vacío.
//
// Mismo patrón de sesión y limpieza que `sagas-opcionales-saltables.spec.ts`:
// `fetch` nativo (no el fixture `request`, que muere con el contexto), `res.ok`
// comprobado en cada escritura, y la semilla devuelta a como estaba.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

let userId: string;
let hideBaseline = false;
/** Un pase activo del usuario que este spec pone en `dropped` y devuelve a su
 *  estado original al terminar. Se elige el más recientemente tocado que NO
 *  esté ya abandonado, para no depender de un seed concreto. */
let passId: string;
let passStatusBaseline: string;
/** `finished_on` original del pase. El CHECK `passes_status_dates`
 *  (`20260868_passes_state_dates_invariant.sql`) exige que todo pase
 *  `dropped`/`completed` tenga fecha de fin y que todo pase abierto NO la
 *  tenga — así que abandonar el pase para el test y devolverlo a su estado
 *  requiere fijar y restaurar esta columna junto con `status`, no solo el
 *  estado. Se restauran ambas en un único PATCH para que la fila nunca pase
 *  por un estado intermedio que viole el CHECK. */
let passFinishedOnBaseline: string | null;
let obraTitulo: string;

test.beforeAll(async () => {
  const perfiles = (await (
    await api(`profiles?username=eq.${USERNAME}&select=user_id,hide_dropped`)
  ).json()) as Array<{ user_id: string; hide_dropped: boolean }>;
  if (perfiles.length !== 1) throw new Error(`beforeAll: no encuentro el perfil de ${USERNAME}`);
  userId = perfiles[0].user_id;
  hideBaseline = perfiles[0].hide_dropped;

  const pases = (await (
    await api(
      `passes?user_id=eq.${userId}&is_active=eq.true&item_type=eq.book&status=neq.dropped` +
        `&select=id,item_id,status,finished_on&order=updated_at.desc&limit=1`,
    )
  ).json()) as Array<{ id: string; item_id: string; status: string; finished_on: string | null }>;
  if (pases.length !== 1) throw new Error("beforeAll: el usuario de pruebas no tiene ningún libro activo sin abandonar");
  passId = pases[0].id;
  passStatusBaseline = pases[0].status;
  passFinishedOnBaseline = pases[0].finished_on;

  const libros = (await (
    await api(`books?id=eq.${pases[0].item_id}&select=title`)
  ).json()) as Array<{ title: string }>;
  obraTitulo = libros[0].title;

  // `dropped` exige `finished_on` no nulo (CHECK `passes_status_dates`) y, si
  // `started_on` está presente, que `finished_on >= started_on` (CHECK
  // `passes_started_before_finished`). La fecha de hoy cumple ambas para
  // cualquier pase histórico, así que sirve de cierre sin tener que mirar
  // `started_on`. Estado y fecha van en el MISMO PATCH: dos escrituras
  // separadas dejarían un instante con `dropped` y `finished_on` nulo, que el
  // CHECK rechaza.
  await api(`passes?id=eq.${passId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "dropped", finished_on: new Date().toISOString().slice(0, 10) }),
  });
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: false }),
  });
});

test.afterAll(async () => {
  await api(`passes?id=eq.${passId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: passStatusBaseline, finished_on: passFinishedOnBaseline }),
  });
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: hideBaseline }),
  });
});

test("el interruptor de Ajustes esconde la obra abandonada y deja salida", async ({ page }) => {
  await loginAsDevtest(page);

  // Punto de partida: con la preferencia apagada, la obra se ve.
  await page.goto("/coleccion?tab=todo&type=todos");
  await expect(page.getByText(obraTitulo).first()).toBeVisible();

  // Encender la preferencia.
  await page.goto("/ajustes");
  const interruptor = page.getByRole("switch", { name: "Ocultar obras abandonadas" });
  await expect(interruptor).toHaveAttribute("aria-checked", "false");

  // El interruptor es optimista (hide-dropped-toggle.tsx): `aria-checked` pasa
  // a "true" en el propio click, ANTES de que el server action escriba en
  // `profiles`. Medido contra la BD real: la fila tarda ~1 s en reflejar el
  // cambio (latencia de red hacia el Supabase de dev), así que un `reload()`
  // inmediato gana la carrera y la carga completa repinta el valor viejo — sin
  // reintento que lo corrija, porque no es una vista reactiva. Se espera la
  // respuesta del propio POST del server action (payload `[true]`, el nuevo
  // valor) antes de recargar: si no, el test sería intermitente por una
  // carrera ajena a lo que quiere comprobar, que es la persistencia.
  const escrituraGuardada = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/ajustes") &&
      res.request().postData() === "[true]",
  );
  await interruptor.click();
  await expect(interruptor).toHaveAttribute("aria-checked", "true");
  await escrituraGuardada;

  // Persiste: recargar Ajustes la sigue mostrando encendida.
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Ocultar obras abandonadas" }),
  ).toHaveAttribute("aria-checked", "true");

  // Y la rejilla la respeta, con la nota que explica el hueco.
  await page.goto("/coleccion?tab=todo&type=todos");
  await expect(page.getByText(obraTitulo)).toHaveCount(0);
  const nota = page.getByText(/abandonad[oa]s? ocultos?/);
  await expect(nota).toBeVisible();

  // «Mostrar» la devuelve SIN apagar la preferencia. `exact: true` porque
  // "Mostrar" (sin exact) también casaría por subcadena con el chip "Mostrar
  // abandonados" de LibraryFilters — hoy no falla solo porque FiltersDropdown
  // desmonta su panel cuando está cerrado, pero eso es un detalle de
  // implementación de OTRO componente del que este test no debería depender.
  await page.getByRole("link", { name: "Mostrar", exact: true }).click();
  await expect(page).toHaveURL(/abandonados=1/);
  await expect(page.getByText(obraTitulo).first()).toBeVisible();

  await page.goto("/ajustes");
  await expect(
    page.getByRole("switch", { name: "Ocultar obras abandonadas" }),
  ).toHaveAttribute("aria-checked", "true");

  // Y volver a la vista sin el parámetro la vuelve a esconder.
  await page.goto("/coleccion?tab=todo&type=todos");
  await expect(page.getByText(obraTitulo)).toHaveCount(0);
});

test("filtrar por estado «Abandonado» enseña abandonados aunque la preferencia esté activa", async ({ page }) => {
  await loginAsDevtest(page);
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: true }),
  });

  await page.goto("/coleccion?tab=todo&type=todos&status=dropped");
  await expect(page.getByText(obraTitulo).first()).toBeVisible();
  // Sin nota: no se ha ocultado nada en esta vista.
  await expect(page.getByText(/abandonad[oa]s? ocultos?/)).toHaveCount(0);
});

test("en el detalle de colección, «N títulos» cuenta lo visible y hay salida", async ({ page }) => {
  await loginAsDevtest(page);
  await api(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ hide_dropped: false }),
  });

  // Colección propia y desechable, con la obra abandonada dentro. Se crea aquí
  // en vez de depender del seed: así el recuento esperado es 1, no «lo que
  // hubiera».
  const item = (await (
    await api(`passes?id=eq.${passId}&select=item_type,item_id`)
  ).json()) as Array<{ item_type: string; item_id: string }>;
  const col = (await (
    await api("collections", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, name: "[QA] Ocultar abandonados" }),
    })
  ).json()) as Array<{ id: string }>;
  const collectionId = col[0].id;

  try {
    await api("collection_items", {
      method: "POST",
      body: JSON.stringify({
        collection_id: collectionId,
        item_type: item[0].item_type,
        item_id: item[0].item_id,
      }),
    });

    // Con la preferencia apagada: 1 título, y se ve.
    await page.goto(`/coleccion/c/${collectionId}`);
    await expect(page.getByText(obraTitulo).first()).toBeVisible();
    await expect(page.getByText("1 título")).toBeVisible();

    // Encendida: 0 títulos visibles, estado vacío, y la nota con su salida.
    await api(`profiles?user_id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ hide_dropped: true }),
    });
    await page.goto(`/coleccion/c/${collectionId}`);
    await expect(page.getByText(obraTitulo)).toHaveCount(0);
    await expect(page.getByText(/abandonad[oa]s? ocultos?/)).toBeVisible();

    await page.getByRole("link", { name: "Mostrar", exact: true }).click();
    await expect(page).toHaveURL(/abandonados=1/);
    await expect(page.getByText(obraTitulo).first()).toBeVisible();
  } finally {
    await api(`collection_items?collection_id=eq.${collectionId}`, { method: "DELETE" });
    await api(`collections?id=eq.${collectionId}`, { method: "DELETE" });
  }
});
