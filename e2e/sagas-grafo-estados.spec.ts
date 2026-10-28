import { expect, test, type Locator, type Page } from "@playwright/test";

// E2E de la fase 6: los cuatro estados (tándem, ventana, rol y lente de rol)
// dibujados en el mapa. Lo que cubre y las unitarias no pueden:
//
//  · que el tándem y la ventana llegan a la PÁGINA con sus anclas nombradas.
//  · que los adornos NO son obras: el plano solo tiene un `[data-work-key]` por
//    obra, y aquí se afirma el recuento a propósito.
//  · que la lente de rol ATENÚA y no filtra: las obras siguen siendo las mismas.
//    Quitar obras parte la cadena (issue #238).
//  · que el atlas PÚBLICO lo enseña entero. No hay `login` en este spec a
//    propósito: es el riesgo 5 de la spec —construirlo mirando solo la vista
//    con sesión— y aquí sale gratis comprobarlo.
//
// Mudado al atlas (Task 11 del atlas, 2026-10-28): el grafo de React Flow
// (`graph-tandem-capsule`, `graph-window-frame`, `graph-node-tag`) se retiró.
// La cápsula y el marco son ahora trazos SVG sin texto; lo que dicen —qué
// tándem, entre qué anclas— se lee en «Ver como lista» (`atlas-list.tsx`), que
// es el sustituto accesible del plano, y el rol en el nombre accesible de cada
// obra. La leyenda condicional («Se leen en tándem») no tiene equivalente: la
// del dock es fija por lente. Ver `.superpowers/sdd/task-11-report.md`.
//
// Mismo patrón de semilla que `sagas-roles.spec.ts` y
// `sagas-ventana-motivo-track.spec.ts`: `fetch` nativo (no el fixture
// `request`, que muere con el contexto y dejaría la semilla desviada), `res.ok`
// comprobado en cada escritura (#180/#182), y la línea base MEDIDA antes de
// tocar nada, no supuesta — dar por buena una puesta a mano fue lo que en la
// fase 4 dejó la semilla desviada.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab";
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // el único universo QA con show_map

// Las tres obras de Era Uno que usa el spec, y por qué cada una:
//  · RAYUELA se manda a `libre` y se le cuelga una ventana: es el ÚNICO sujeto
//    posible que no está duplicado en el mapa (el seed tiene «Para leer a
//    Isabel Allende» en Era Uno Y como miembro directo del Universo).
//  · RARO comparte el hueco 2 con «Libro sin valorar»: ese empate ES el tándem,
//    y por tanto la cápsula. Lleva además el rol, así que la etiqueta tiene que
//    verse DENTRO de la cápsula — la combinación que más fácil se rompe.
//  · ISABEL es el ancla `antes de`.
const RAYUELA = { id: "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a", title: "Rayuela" };
const RARO = { id: "d6d61eab-6ef4-4691-a8f0-b89068508fd4", title: "Libro raro sin match" };
const ISABEL = { id: "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc", title: "Para leer a Isabel Allende" };

// `ruta=lectura` fija la columna a la curación: sin ella la ruta activa sería la
// que el lector tenga adoptada, y el test dependería de un estado que no
// controla.
const MAPA = `/saga/${UNIVERSO_ID}/mapa?ruta=lectura`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

type ItemRow = { item_id: string; position: number | null; placement: string | null; role: string | null };

/** La línea base de Era Uno entera, medida. No basta con la fila que el test
 *  toca: mandar una obra a `libre` cambia la forma del bloque. */
let baseline: ItemRow[] = [];

/** Una obra del plano por su clave de dominio (`i:<tipo>:<uuid>`). */
const obra = (page: Page, itemId: string) => page.locator(`[data-work-key="i:book:${itemId}"]`);

/** Abre el atlas y su «Ver como lista»; devuelve la `ol`. */
async function openList(page: Page) {
  await page.goto(MAPA);
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
  await page.getByRole("button", { name: "Ver como lista" }).click();
  const lista = page.getByRole("list", { name: /^Obras de / });
  await expect(lista).toBeVisible();
  return lista;
}
/** La entrada de una obra por el nombre de SU enlace («N. Título»): filtrar por texto
 *  casaría también con las entradas que la nombran como ancla o compañera de tándem. */
const fila = (lista: Locator, title: string) =>
  lista.getByRole("listitem").filter({
    has: lista.page().getByRole("link", { name: new RegExp(`^(\\d+\\. )?${title}$`) }),
  });

test.beforeAll(async () => {
  baseline = (await (
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement,role`)
  ).json()) as ItemRow[];

  for (const obra of [RAYUELA, RARO, ISABEL]) {
    if (!baseline.some((f) => f.item_id === obra.id)) {
      throw new Error(`beforeAll: ¿cambió el seed de Era Uno? falta ${obra.title}`);
    }
  }

  // 1) El tándem NO existe en la línea base. `restoreQaSeed` (globalSetup de la
  //    fase 0, issue #215) deja Era Uno con las cuatro obras en huecos
  //    distintos —1, 2, 3, 4—, así que el empate hay que construirlo: «Libro
  //    raro sin match» baja al hueco 2, que es el de «Libro sin valorar».
  //    Mismo gesto que `sagas-tandem-metadatos.spec.ts`.
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RARO.id}`, {
    method: "PATCH",
    body: JSON.stringify({ position: 2, placement: "fijo" }),
  });

  // 2) Rayuela sale de la cadena y gana una ventana con sus dos anclas.
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RAYUELA.id}`, {
    method: "PATCH",
    body: JSON.stringify({ position: null, placement: "libre" }),
  });
  await api("saga_placement_windows", {
    method: "POST",
    body: JSON.stringify({
      saga_id: ERA_UNO_ID,
      item_type: "book",
      item_id: RAYUELA.id,
      after_item_type: "book",
      after_item_id: RARO.id,
      before_item_type: "book",
      before_item_id: ISABEL.id,
      motivo: "contexto",
    }),
  });

  // 3) El hueco 2, ya empatado, declara su modo. La cápsula existiría igual sin esta fila —diciendo «sin
  //    declarar»—; con ella se comprueba además que el modo curado llega.
  await api("saga_tandems", {
    method: "POST",
    body: JSON.stringify({ saga_id: ERA_UNO_ID, position: 2, modo: "simultaneo", nota: null }),
  });

  // 4) Un rol dentro del tándem.
  await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RARO.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "relato" }),
  });
});

test.afterAll(async () => {
  await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
  await api(`saga_tandems?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
  for (const r of baseline) {
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${r.item_id}`, {
      method: "PATCH",
      body: JSON.stringify({ position: r.position, placement: r.placement, role: r.role }),
    });
  }
});

test("el tándem dice su modo y sus compañeras, y no cuenta como obra", async ({ page }) => {
  const lista = await openList(page);
  // El hueco 2 empatado, con el modo curado («simultaneo»), en las dos direcciones.
  await expect(fila(lista, RARO.title)).toContainText("A la vez que Libro sin valorar");
  await expect(fila(lista, "Libro sin valorar")).toContainText(`A la vez que ${RARO.title}`);

  // Los adornos NO son obras. El Universo QA tiene 7 obras distintas (Era Uno 4 +
  // Era Dos 2 + la Trilogía directa, que el atlas enseña desde 7c9fd976; «Para leer a
  // Isabel Allende» está en Era Uno y en el universo, y cuenta una vez): si el tándem
  // se colara en este recuento como obra extra, cualquier test que cuente obras
  // pasaría a proteger otra cosa.
  await expect(page.locator("[data-work-key]")).toHaveCount(7);
  await expect(lista.getByRole("listitem")).toHaveCount(7);
});

test("el sujeto de la ventana nombra sus dos anclas", async ({ page }) => {
  const lista = await openList(page);
  // Mismo dato que antes vivía en el `title` de la píldora del marco.
  await expect(fila(lista, RAYUELA.title)).toContainText(`Encaja entre ${RARO.title} y ${ISABEL.title}`);
  // El motivo curado (`contexto`) acompaña al tramo.
  await expect(fila(lista, RAYUELA.title)).toContainText("Dentro de la ventana se entiende mejor");
});

test("el rol curado se lee en la obra, también dentro del tándem", async ({ page }) => {
  await page.goto(MAPA);
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
  await expect(obra(page, RARO.id)).toHaveAttribute("aria-label", /, Relato(,|$)/);
  // Y una obra sin rol ni nada que decir no lo pinta: 361 de las 367 filas de
  // producción son ese caso. Sin sesión y sin itinerario, su nombre es solo el título.
  await expect(obra(page, ISABEL.id)).toHaveAttribute("aria-label", ISABEL.title);
});

test("la lente de rol atenúa, no borra: las obras siguen ahí", async ({ page }) => {
  await page.goto(MAPA);
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
  const antes = await page.locator("[data-work-key]").count();
  expect(antes).toBeGreaterThan(0);

  // `?rol=` viejo: el atlas lo traduce a la lente Rol con ese resaltado.
  await page.goto(`${MAPA}&rol=relato`);
  await expect(page).toHaveURL(/lente=rol/);
  await expect(page.locator("[data-ready='true'] [data-atlas-stage]")).toBeVisible();
  await expect(page.locator("[data-work-key]")).toHaveCount(antes);

  // Lo que sí cambia: la obra que no es de ese rol se atenúa.
  await expect(obra(page, ISABEL.id)).toHaveAttribute("data-dimmed", "true");
  await expect(obra(page, RARO.id)).not.toHaveAttribute("data-dimmed", /.+/);
});
