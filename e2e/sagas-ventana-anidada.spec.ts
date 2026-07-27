import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 4 (B), «el caso que más protege»: desde el editor del PADRE se
// cura la ventana de una obra de su HIJA, la fila cae bajo la HIJA —porque la
// ventana pertenece a la obra, no al contexto desde el que se cura— y un
// guardado posterior de la hija NO se la lleva por delante.
//
// El paso 3 es el corazón de la fase: con el `delete from
// saga_placement_windows where saga_id = p_saga_id` que el RPC tenía hasta
// ahora, ese guardado la habría borrado en silencio. Es lo que motivó que la
// baja de ventanas pase a ser explícita, por lista de sujetos
// (20260730_save_saga_sequence_subjects.sql).
//
// Fixture: "Libro sin valorar", NO "Para leer a Isabel Allende". Verificado
// contra BD dev (mcp__supabase-dev, 2026-07-28): Isabel tiene DOBLE MEMBRESÍA
// —fila en el Universo con `is_primary = true` y fila en Era Uno— así que su
// ventana pertenece al Universo (manda `is_primary`, windowOwnerFor) y ni
// siquiera aparecería en el cajón, porque `getSagaSequence` excluye de `nested`
// lo que ya es entrada propia del padre. "Libro sin valorar" tiene una sola
// membresía, solo en Era Uno: su dueña es Era Uno, que es justo lo que este
// test necesita poder distinguir.
//
// Mismo patrón que sagas-ventanas.spec.ts: `fetch` nativo y NO el fixture
// `request` de Playwright (muere con el contexto del test, y un timeout a mitad
// dejaría el `finally` sin correr), `res.ok` comprobado en cada escritura
// (issues #180/#182), y la semilla devuelta exactamente a como estaba.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // [QA Sagas v2] Universo (el PADRE)
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno (la HIJA)
const LIBRO_ID = "4c076a65-4888-4715-913e-2157374cd227"; // "Libro sin valorar", solo en Era Uno
const LIBRO_TITLE = "Libro sin valorar";
const RAYUELA_TITLE = "Rayuela";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

type ItemRow = { position: number | null; placement: string | null };
type WindowRow = { saga_id: string; after_item_id: string | null; before_item_id: string | null };

async function fetchLibro(): Promise<ItemRow> {
  const rows = (await (
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${LIBRO_ID}&select=position,placement`)
  ).json()) as ItemRow[];
  if (!rows[0]) throw new Error("fetchLibro: no está en Era Uno — ¿cambió el seed?");
  return rows[0];
}

async function patchLibro(patch: ItemRow) {
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${LIBRO_ID}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function fetchWindows(): Promise<WindowRow[]> {
  return (await (
    await api(`saga_placement_windows?item_id=eq.${LIBRO_ID}&select=saga_id,after_item_id,before_item_id`)
  ).json()) as WindowRow[];
}

async function deleteWindows() {
  await api(`saga_placement_windows?item_id=eq.${LIBRO_ID}`, { method: "DELETE" });
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Guardar secuencia" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
}

test("la ventana curada desde el padre vive bajo la hija, y el guardado de la hija no se la lleva", async ({
  page,
}) => {
  const before = await fetchLibro();

  try {
    // Siembra: solo lo `libre` puede tener ventana, también anidado.
    await patchLibro({ position: null, placement: "libre" });

    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}/editar`);

    // 1) El cajón del bloque «Era Uno». Es un `<details>`, así que se abre por
    // su `<summary>`; escopado a la cáscara visible por la regla de los dos
    // árboles. El recuento entre paréntesis viene del propio borrador, así que
    // afirmarlo antes de actuar confirma que la siembra llegó a la pantalla —
    // si fallara, el resto del test estaría probando otra cosa.
    const drawerSummary = page.getByText("Ventanas de sus obras (1)", { exact: true }).locator("visible=true");
    await expect(drawerSummary).toBeVisible();
    await drawerSummary.click();

    // 2) Una ventana «a partir de Rayuela». El botón de alta lleva `aria-label`
    // propio (window-editor.tsx, `windowAddFor`), que PISA el texto visible
    // como nombre accesible — igual que en sagas-ventanas.spec.ts.
    await page.getByRole("button", { name: `Añadir ventana a ${LIBRO_TITLE}`, exact: true }).click();
    const anchorDialog = page.getByRole("dialog", { name: "+ A partir de…" });
    // Clic en el `<li>`, no en el input: el radio vive `sr-only` dentro del
    // `<label>` (anchor-picker.tsx) y el navegador reenvía el clic.
    await anchorDialog.locator("li").filter({ hasText: RAYUELA_TITLE }).click();
    await anchorDialog.getByRole("button", { name: "+ A partir de…", exact: true }).click();

    await save(page);

    // 3) La aserción que da sentido al test: la fila cayó bajo la HIJA, no bajo
    // el Universo desde el que se curó. Es lo único que distingue «la ventana
    // pertenece a la obra» de «la ventana pertenece a quien la cura».
    const afterSave = await fetchWindows();
    expect(afterSave).toHaveLength(1);
    expect(afterSave[0].saga_id).toBe(ERA_UNO_ID);
    expect(afterSave[0].after_item_id).not.toBeNull();

    // 4) El editor de la HIJA guarda y la ventana sigue ahí, con la misma
    // ancla. La hija tiene que ENSEÑAR esa ventana (la obra es `libre` en ella,
    // así que es una entrada suya de «Cuando quieras») y volver a emitirla al
    // guardar; si no la enseñara, el borrado por sujetos se la llevaría — el
    // sujeto viaja siempre, la ventana solo si el borrador la lleva.
    //
    // Honestidad sobre lo que este paso NO demuestra: como la hija la reemite,
    // una regresión al `delete ... where saga_id = p_saga_id` de la versión
    // vieja tampoco lo tumbaría. El paso que discrimina esa regresión es el 3
    // —bajo el borrado por saga, la fila habría caído bajo el PADRE—, y el caso
    // «el padre guarda y borra una ventana de la hija que su cajón no enseña»
    // se queda sin cubrir aquí por falta de fixture (ver la issue abierta).
    //
    // «Guardar secuencia» está deshabilitado con el borrador limpio
    // (sequence-save-bar.tsx: `disabled` en `idle`), así que no hay forma por UI
    // de «guardar sin tocar nada»: se ensucia con un cambio de SALDO CERO
    // —marcar y desmarcar `opcional`— que deja el payload idéntico al de BD.
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    const optional = page
      .locator(`[data-testid="sequence-row"][data-key="i:book:${LIBRO_ID}"]:visible`)
      .getByRole("checkbox");
    await optional.check();
    await optional.uncheck();
    await save(page);

    const afterChildSave = await fetchWindows();
    expect(afterChildSave).toHaveLength(1);
    expect(afterChildSave[0].saga_id).toBe(ERA_UNO_ID);
    expect(afterChildSave[0].after_item_id).toBe(afterSave[0].after_item_id);
  } finally {
    await deleteWindows();
    await patchLibro({ position: before.position, placement: before.placement });
  }
});
