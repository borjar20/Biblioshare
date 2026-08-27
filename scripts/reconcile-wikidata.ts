// Barrido ÚNICO de reconciliación de identidad Wikidata (spec 2026-08-26 §6,
// Task 15 del plan «obra/edición/representación»).
//
// QUÉ ARREGLA. El catálogo ya arrastra duplicados materializados: OpenLibrary
// cataloga cada traducción como un `work` distinto, así que «Words of Radiance»
// y «Palabras Radiantes» entraron como DOS filas de `books`, y las altas
// manuales y las de Google Books entraron sin `openlibrary_work_key` con el que
// casarlas. `wikidata-collapse.ts` evita que sigan naciendo; esto limpia los que
// ya están. A cada obra se le asigna su QID de Wikidata (vía Inventaire) y las
// que resulten ser la misma se fusionan con `merge_book_into`.
//
// CÓMO CASA, Y POR QUÉ ES CONSERVADOR. La decisión está en
// `src/lib/catalog/wikidata-reconcile.ts`, que es PURO y está probado: sin
// verificación de autor no hay match, y ante ambigüedad no se elige. Aquí solo
// vive la E/S. La regla no es paranoia: dev tiene tres filas tituladas «Dune»
// —Frank Herbert, «Brian Herbert, Kevin J. Anderson» (las precuelas, otra obra)
// y una con `author` a NULL—, y fundirlas sería destruir datos.
//
// SEGURIDAD. `merge_book_into` es una fusión COBARDE: aborta sin escribir nada,
// nombrando la tabla, si repuntar un dato de USUARIO chocara con un único. Este
// script recoge esos abortos, sigue con el resto y los lista al final para
// revisión manual: un grupo problemático no puede dejar el barrido a medias.
//
// SERVICE ROLE, no token de usuario: `merge_book_into` es solo `service_role`
// (`20260889_repr_h_merge_books_href.sql`) y `books.wikidata_id` no tiene grants
// de cliente. Igual que `backfill-book-shells.ts`.
//
// USO
//   npx tsx --env-file=.env.local scripts/reconcile-wikidata.ts
//       DRY-RUN (por defecto). Imprime la tabla de acciones y NO escribe nada.
//   npx tsx --env-file=.env.local scripts/reconcile-wikidata.ts --apply
//       Escribe: fusiona y asigna QID.
//
//       ⚠ ANTES DE `--apply`: HAZ EL BACKUP. Lo exige la Fase 0 del spec y el
//       script NO lo comprueba ni puede — no hay forma de preguntarle a
//       Supabase «¿tengo un backup reciente?» desde aquí. Se dice en voz alta
//       porque el precedente engaña: `backfill-book-shells.ts` tampoco lo pide,
//       pero aquél solo AÑADE filas y este las BORRA (`merge_book_into` hace
//       `delete from books`). Una fusión errónea no se deshace con otra
//       ejecución: se deshace con el backup o no se deshace.
//
//       `--dry-run` NO es un flag: el dry-run es el comportamiento por defecto
//       (la ausencia de `--apply`). Escribirlo junto a `--apply` es un error
//       ABORTA — ver el guard de `main`.
//   … --max=60
//       Corta la tanda a 60 libros. OBLIGATORIO en la práctica para un catálogo
//       grande: ver «tandas» abajo.
//   … --only=<uuid>[,<uuid>…]
//       Limita el barrido a esos libros. Para reintentar un caso suelto sin
//       gastar el presupuesto de la ventana.
//
// TANDAS: EL CATÁLOGO NO CABE EN UNA PASADA. Inventaire corta con `429` y
// `retry-after: 1800` alrededor de las ~200 peticiones —unos ~65 libros, a 3
// peticiones cada uno—, y no lo documenta: está medido contra la API real. Con
// los 397 libros de dev hacen falta ~6 ventanas de media hora. La forma de
// hacerlo es repetir `--max=60` cada media hora: como solo se pregunta por los
// libros que siguen SIN QID, cada tanda avanza sola y no hay que llevar cuenta
// de por dónde iba. Un `--apply` a medias no rompe nada por lo mismo.
//
// `--env-file` es obligatorio: este script corre FUERA de Next, que es quien
// carga `.env.local` sola. Sin él, el guard de entorno para la ejecución.
//
// IDEMPOTENTE, y por partida doble: solo pregunta a Inventaire por los libros
// SIN `wikidata_id`, y un libro que ya tiene su QID sin nadie que se lo dispute
// no genera acción. Un `sin-match` por fallo de red (Inventaire caído, timeout)
// no se marca de ninguna forma, así que la siguiente pasada lo reintenta solo.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { searchInventaireEntities } from "../src/lib/catalog/inventaire/client";
import {
  planReconciliation,
  resolveQid,
  type BookRow,
  type PlanEntry,
} from "../src/lib/catalog/wikidata-reconcile";

const APPLY = process.argv.includes("--apply");
// `--dry-run` NO se reconoce: el dry-run es la ausencia de `--apply`. Sin este
// guard, `--dry-run --apply` ESCRIBE —el flag que parecía protegerte se ignora
// en silencio y el otro manda—, y lo que escribe son borrados de filas de
// `books`. Dos líneas por si alguien lo teclea creyendo que se anulan.
const DRY_RUN_EXPLICITO = process.argv.includes("--dry-run");
const ONLY = new Set(
  (process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const MAX = Number(process.argv.find((a) => a.startsWith("--max="))?.slice("--max=".length) ?? 0) || 0;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inventaire es una API PÚBLICA Y GRATUITA, y `searchInventaireEntities` hace
// hasta TRES peticiones por libro (búsqueda, obras por URI, autores por URI).
// El plan pedía «1 req/s contra Inventaire»: eso son TRES segundos por libro,
// no uno. La primera versión de este script usaba 1000 ms y se ganó un bloqueo
// medido: a partir del libro ~60 la API empezó a devolver 0 resultados para
// TODO —incluido «Palabras Radiantes», que había resuelto Q8034469 diez minutos
// antes—, y 333 de 397 libros salieron como «sin-match» por rate limit
// disfrazado de «no existe». No se baja de 3000.
const THROTTLE_MS = 3000;
// Cortafuegos contra ese mismo bloqueo. `searchInventaireEntities` degrada a []
// tanto si no hay resultados como si la API se cae, expira o nos corta, así que
// una racha larga de respuestas vacías es indistinguible de un catálogo que no
// está en Wikidata… salvo por la longitud de la racha. Cuando se cruza, el
// barrido PARA: seguir es inútil (todo saldría sin-match), es maleducado con una
// API gratuita, y sobre todo evita el desenlace peor —un `--apply` que asigna
// QID a los pocos afortunados del principio y deja el resto sin tocar, con
// pinta de barrido terminado.
const RACHA_VACIA_MAX = 25;
// PRESUPUESTO POR VENTANA, medido a golpes contra la API real (2026-08-27):
// Inventaire corta con `429` y `retry-after: 1800` (media hora) alrededor de las
// ~200 peticiones, o sea unos ~65 libros a 3 peticiones cada uno. No está
// documentado en `api.inventaire.io`; es empírico. Por eso existe `--max`: el
// catálogo entero NO cabe en una sola pasada y hay que barrerlo en tandas.
// Como el barrido es idempotente —solo pregunta por los libros que siguen sin
// QID—, repetirlo cada media hora converge sin llevar la cuenta de nada.
const MAX_POR_TANDA_SUGERIDO = 60;
// PostgREST corta en 1000 filas por respuesta: las tablas de rastro se leen
// paginadas o el recuento saldría mal en silencio.
const PAGE = 1000;

/**
 * EL RASTRO DE USUARIO, tabla por tabla. Tiene que ser LA MISMA lista que
 * repunta `merge_book_into` (`20260889_repr_h_merge_books_href.sql`), porque de
 * este recuento sale el ganador de la fusión: **una referencia que no se cuenta
 * aquí sí se repunta allí, así que no se pierde el dato — pero la fila que la
 * llevaba puntúa como si estuviera vacía y PIERDE contra una que lo está de
 * verdad.** La primera versión contaba 6 de 17 y ese era exactamente el fallo:
 * una obra que solo llevara la opinión de un club sacaba 0 y moría.
 *
 * `merge_book_into` repunta 17 referencias polimórficas. Aquí están las 16 que
 * son rastro de PERSONA; `passes` va aparte porque es el desempate fuerte.
 *
 * LA QUE FALTA A PROPÓSITO — `credits` (autoría/rol de la obra). Es la
 * decimoséptima y NO se cuenta, porque no es rastro de usuario: es metadato de
 * CATÁLOGO que escribe la hidratación desde OpenLibrary, no una persona.
 * Contarlo invertiría el criterio justo en el caso que importa —una fila
 * hidratada dos veces, con más `credits` automáticos, le ganaría a la fila donde
 * alguien escribió una nota a mano—, y el criterio del repo (migración
 * `20260870`) es explícito: gana el rastro de usuario, no lo completo del
 * catálogo. Un dato de catálogo se vuelve a bajar; una nota, no. `book_editions`
 * queda fuera por lo mismo (además es FK real, no referencia polimórfica).
 *
 * La cuarta columna es la CLAVE PRIMARIA, para que la paginación tenga un orden
 * total. Ver `countByBook`: cuatro de estas tablas no tienen columna `id`.
 */
const RASTRO_RESTANTE = [
  // Lo que la persona escribe y se ve en el feed o en su ficha.
  ["posts", "anchor_id", "anchor_type", ["id"]],
  ["notes", "item_id", "item_type", ["id"]],
  ["collection_items", "item_id", "item_type", ["collection_id", "item_type", "item_id"]],
  ["library_entries", "item_id", "item_type", ["id"]],
  // Sagas: el orden de lectura que alguien curó a mano.
  ["saga_items", "item_id", "item_type", ["id"]],
  ["saga_route_entries", "item_id", "item_type", ["id"]],
  ["saga_optional_skips", "item_id", "item_type", ["user_id", "saga_id", "item_type", "item_id"]],
  // Las TRES columnas de la ventana de colocación: el sujeto y sus dos extremos
  // («este libro va DESPUÉS de X y ANTES de Y»). Son tres referencias distintas
  // a libro en la misma tabla, y `merge_book_into` repunta las tres.
  ["saga_placement_windows", "item_id", "item_type", ["id"]],
  ["saga_placement_windows", "after_item_id", "after_item_type", ["id"]],
  ["saga_placement_windows", "before_item_id", "before_item_type", ["id"]],
  // Clubes: la lectura de un grupo entero de gente.
  ["club_activity_items", "item_id", "item_type", ["id"]],
  ["club_activity_opinions", "item_id", "item_type", ["activity_id", "user_id", "item_type", "item_id"]],
  [
    "club_activity_placements",
    "item_id",
    "item_type",
    ["activity_id", "user_id", "item_type", "item_id"],
  ],
  ["club_rounds", "item_id", "item_type", ["id"]],
  ["club_activities", "spawned_from_item_id", "spawned_from_item_type", ["id"]],
] as const satisfies ReadonlyArray<readonly [string, string, string, readonly string[]]>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sondeo previo, con `fetch` pelado a propósito. `searchInventaireEntities`
 * degrada a `[]` pase lo que pase —es una dependencia BLANDA y así tiene que
 * ser para la búsqueda de la app—, así que desde dentro del cliente un `429` es
 * indistinguible de «esta obra no está en Wikidata». Para un barrido que decide
 * QUÉ FILAS SE BORRAN esa confusión es cara: media hora larga produciendo una
 * tabla en la que todo dice «sin-match». Aquí se mira el código HTTP de verdad,
 * **una sola vez**, antes de empezar.
 *
 * «Una sola vez» va en negrita porque está medido: el `retry-after` es de 1800 s
 * pero **sondear durante el bloqueo lo reinicia**. Con un sondeo cada minuto
 * esperando a que levantara, seguía dando 429 a los 45 minutos; con silencio de
 * verdad, levanta. Si este sondeo dice que nos cortan, la respuesta es callarse
 * y volver luego — NO montar un bucle de espera contra la API.
 */
async function inventaireCortando(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://inventaire.io/api/search?types=works&search=test&limit=1&lang=es",
      { signal: AbortSignal.timeout(10000) }
    );
    if (res.status !== 429) return null;
    return Number(res.headers.get("retry-after") ?? 0) || 0;
  } catch {
    // Sin respuesta no se puede afirmar que nos estén cortando: que siga y que
    // decida el cortafuegos de la racha.
    return null;
  }
}

/**
 * Cuenta filas por libro en una tabla polimórfica, paginando.
 *
 * `orderBy` NO es decorativo y NO puede ser siempre `"id"`. `range` es
 * `offset/limit`, y en Postgres un `offset/limit` SIN orden explícito puede
 * REPETIR o SALTARSE filas entre páginas: el planificador no garantiza que dos
 * ejecuciones de la misma consulta devuelvan las filas en el mismo orden.
 * Repetir infla el rastro de un libro, saltarse lo desinfla — y de este recuento
 * sale el GANADOR de la fusión, o sea QUÉ FILA SE BORRA. Con las tablas de hoy
 * (ninguna llega a 1000 filas) el bucle da una sola vuelta y no muerde; muerde
 * el día que crezcan, y en silencio.
 *
 * El orden tiene que ser TOTAL, así que se ordena por la CLAVE PRIMARIA. Y no
 * vale `"id"` a secas: cuatro de estas tablas no tienen columna `id` —
 * `collection_items`, `saga_optional_skips`, `club_activity_opinions` y
 * `club_activity_placements` tienen PK compuesta (verificado contra `pg_constraint`
 * en dev, 2026-08-28)—, así que `.order("id")` reventaría con un 400 de PostgREST.
 * Por eso la clave viaja en la tabla de abajo en vez de estar cableada aquí.
 */
async function countByBook(
  supabase: SupabaseClient,
  table: string,
  idColumn: string,
  typeColumn: string,
  orderBy: readonly string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from(table)
      .select(idColumn)
      .eq(typeColumn, "book")
      .not(idColumn, "is", null);
    for (const column of orderBy) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
    for (const row of rows) {
      const id = row[idColumn];
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (rows.length < PAGE) return counts;
  }
}

function corto(text: string | null, width: number): string {
  const t = text ?? "(sin título)";
  return t.length <= width ? t.padEnd(width) : `${t.slice(0, width - 1)}…`;
}

function describe(entry: PlanEntry): string {
  switch (entry.action.kind) {
    case "sin-match":
      return "sin-match";
    case "set-qid":
      return "set-qid";
    case "merge-into":
      return `merge-into:${entry.action.winnerId}`;
    case "conserva":
      return `conserva (+${entry.action.loserIds.length})`;
  }
}

// Las fusiones primero (es lo que hay que revisar a mano), luego las
// asignaciones y al final el ruido de fondo.
const ORDEN: Record<PlanEntry["action"]["kind"], number> = {
  conserva: 0,
  "merge-into": 0,
  "set-qid": 1,
  "sin-match": 2,
};

function printTable(plan: PlanEntry[]) {
  const filas = [...plan].sort((a, b) => {
    const byKind = ORDEN[a.action.kind] - ORDEN[b.action.kind];
    if (byKind !== 0) return byKind;
    const byQid = (a.qid ?? "").localeCompare(b.qid ?? "");
    if (byQid !== 0) return byQid;
    return (a.book.title ?? "").localeCompare(b.book.title ?? "");
  });
  const head = `${"book_id".padEnd(36)} | ${"title".padEnd(44)} | ${"qid".padEnd(10)} | acción`;
  console.log(`\n${head}\n${"-".repeat(head.length + 20)}`);
  for (const entry of filas) {
    console.log(
      `${entry.book.id} | ${corto(entry.book.title, 44)} | ${(entry.qid ?? "—").padEnd(10)} | ${describe(entry)}`
    );
  }
}

async function main() {
  // El guard va ANTES de `createClient`, y el cliente se crea dentro de `main`:
  // `createClient(url, key)` lanza `supabaseUrl is required` en el import, y ese
  // error en inglés —de una librería que nadie ha llamado— tapaba este mensaje.
  // Misma trampa que se arregló en `backfill-book-shells.ts`.
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.\n" +
        "Este script corre fuera de Next: lánzalo con `npx tsx --env-file=.env.local …`."
    );
  }
  if (DRY_RUN_EXPLICITO && APPLY) {
    throw new Error(
      "`--dry-run` y `--apply` a la vez: no se ejecuta nada.\n" +
        "`--dry-run` no es un flag de este script — el dry-run es lo que pasa SIN `--apply`.\n" +
        "Si querías simular, quita `--apply`. Si querías escribir, quita `--dry-run`."
    );
  }
  const supabase = createClient(url, key);
  console.log(`Proyecto: ${url}`);
  console.log(APPLY ? "MODO: --apply (ESCRIBE)" : "MODO: dry-run (no escribe nada)");

  // 1. El catálogo entero. También los que YA tienen QID: no se les pregunta a
  //    Inventaire, pero tienen que poder entrar en un grupo de colisión — y
  //    perderlo, si la fila nueva pesa más en rastro de usuario.
  const libros: Array<{
    id: string;
    title: string | null;
    author: string | null;
    created_at: string;
    wikidata_id: string | null;
  }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, created_at, wikidata_id")
      .order("id") // Mismo motivo que en `countByBook`: sin orden, `offset/limit` puede saltarse libros.
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as typeof libros;
    libros.push(...rows);
    if (rows.length < PAGE) break;
  }

  // 2. Rastro de usuario por libro. Decide el GANADOR de cada fusión: la fila
  //    con más rastro, no la más completa (precedente de `20260870`). Un dato de
  //    catálogo se vuelve a bajar de OpenLibrary; un pase, no. Las tablas y por
  //    qué son ESAS y no otras, en `RASTRO_RESTANTE`.
  const pases = await countByBook(supabase, "passes", "item_id", "item_type", ["id"]);
  const otros = new Map<string, number>();
  for (const [tabla, idCol, tipoCol, orden] of RASTRO_RESTANTE) {
    for (const [id, n] of await countByBook(supabase, tabla, idCol, tipoCol, orden)) {
      otros.set(id, (otros.get(id) ?? 0) + n);
    }
  }

  const filas: BookRow[] = libros.map((b) => ({
    ...b,
    passCount: pases.get(b.id) ?? 0,
    otherTraceCount: otros.get(b.id) ?? 0,
  }));
  const porId = new Map(filas.map((f) => [f.id, f]));

  // 3. Resolución. Solo se pregunta por los que no tienen QID y tienen título;
  //    los demás entran con el QID que ya llevan.
  const sinQidEnCatalogo = filas.filter((f) => !f.wikidata_id && f.title);
  // Con `--only`, `pendientes` es un SUBCONJUNTO: se informa de los dos números
  // por separado. La versión anterior imprimía solo este como «sin QID: N», y
  // con `--only=<un uuid>` decía «sin QID: 1» de un catálogo con 397 sin QID —
  // que es justo el número que uno mira para saber cuántas tandas quedan.
  const pendientes = filas.filter(
    (f) => !f.wikidata_id && f.title && (ONLY.size === 0 || ONLY.has(f.id))
  );
  const aResolver = MAX > 0 ? pendientes.slice(0, MAX) : pendientes;
  const yaConQid = filas.filter((f) => f.wikidata_id);
  console.log(
    `Libros en el catálogo: ${filas.length} · con QID: ${yaConQid.length}` +
      ` · sin QID: ${sinQidEnCatalogo.length}` +
      (ONLY.size > 0 ? ` (de ellos ${pendientes.length} en este --only de ${ONLY.size})` : "") +
      ` · a consultar en Inventaire ahora: ${aResolver.length}` +
      (MAX > 0 && pendientes.length > aResolver.length
        ? `\n  TANDA: quedan ${pendientes.length - aResolver.length} para la siguiente pasada (~30 min).`
        : "")
  );
  if (MAX === 0 && aResolver.length > MAX_POR_TANDA_SUGERIDO) {
    console.warn(
      `  AVISO: ${aResolver.length} libros no caben en una ventana de Inventaire (~${MAX_POR_TANDA_SUGERIDO}).\n` +
        `  Se cortará por 429 a media tabla. Bárrelo en tandas: --max=${MAX_POR_TANDA_SUGERIDO}`
    );
  }

  const cortando = aResolver.length > 0 ? await inventaireCortando() : null;
  if (cortando !== null) {
    throw new Error(
      `Inventaire nos está cortando (429). Vuelve en ${Math.ceil(cortando / 60)} min.\n` +
        "No se ha consultado ni escrito nada: un barrido lanzado ahora daría «sin-match» en todo."
    );
  }

  const resolved: Array<{ book: BookRow; qid: string | null }> = yaConQid.map((book) => ({
    book,
    qid: book.wikidata_id,
  }));
  let vacias = 0;
  let racha = 0;
  let cortado = false;
  for (const [i, book] of aResolver.entries()) {
    if (i > 0) await sleep(THROTTLE_MS);
    const entities = await searchInventaireEntities(book.title!);
    // `searchInventaireEntities` NUNCA lanza: [] es «Inventaire no dijo nada»,
    // y no distingue «no hay resultados» de «se cayó, expiró el timeout o nos
    // está cortando». Se cuenta aparte para que el informe no venda como «no
    // existe en Wikidata» lo que a lo mejor fue un bloqueo.
    if (entities.length === 0) {
      vacias += 1;
      racha += 1;
    } else {
      racha = 0;
    }
    resolved.push({ book, qid: resolveQid(book, entities) });
    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${aResolver.length}`);
    if (racha >= RACHA_VACIA_MAX) {
      cortado = true;
      console.error(
        `\nCORTADO: ${racha} libros seguidos sin una sola entidad de Inventaire.\n` +
          "Eso no es un catálogo ausente de Wikidata, es la API cortándonos o caída.\n" +
          `Quedaban ${aResolver.length - i - 1} libros por consultar. Espera un rato y repite:\n` +
          "el barrido es idempotente y solo pregunta por los que siguen sin QID."
      );
      break;
    }
  }

  const plan = planReconciliation(resolved);
  printTable(plan);

  const grupos = plan.filter((p) => p.action.kind === "conserva");
  const merges = plan.filter((p) => p.action.kind === "merge-into");
  const setQid = plan.filter((p) => p.action.kind === "set-qid");
  const sinMatch = plan.filter((p) => p.action.kind === "sin-match");
  console.log(
    `\nRESUMEN` +
      `\n  grupos con duplicado: ${grupos.length}` +
      `\n  fusiones: ${merges.length}` +
      `\n  set-qid: ${setQid.length}` +
      `\n  sin-match: ${sinMatch.length} (de ellos ${vacias} porque Inventaire no devolvió nada)`
  );

  if (!APPLY) {
    console.log("\nDRY-RUN: NADA de lo de arriba se ha escrito. Vuelve a lanzarlo con --apply.");
    return;
  }
  if (cortado) {
    // Un barrido cortado a medias tiene un plan PARCIAL. Aplicarlo dejaría el
    // catálogo medio reconciliado con aspecto de terminado, que es peor que no
    // haber empezado: nadie vuelve a mirar un barrido que ya «se hizo».
    console.error("\nNO SE APLICA NADA: el barrido se cortó por bloqueo de Inventaire.");
    process.exitCode = 1;
    return;
  }

  // 4. Aplicar. Por grupo y en este orden: primero las fusiones (que BORRAN al
  //    perdedor, y con él su `wikidata_id`), y solo después el `update` del
  //    ganador. Al revés, el único de `books.wikidata_id` reventaría cuando el
  //    perdedor es el dueño preexistente del QID.
  const abortadas: string[] = [];
  const fallosQid: string[] = [];
  let fusionadas = 0;
  let asignadas = 0;

  for (const entry of grupos) {
    if (entry.action.kind !== "conserva") continue;
    const winner = entry.book;
    let abortadasDelGrupo = 0;
    for (const loserId of entry.action.loserIds) {
      const { error } = await supabase.rpc("merge_book_into", {
        p_loser: loserId,
        p_winner: winner.id,
      });
      if (error) {
        // El caso previsto: `merge_book_into` aborta sin escribir nada porque
        // repuntar un dato de USUARIO chocaría con un único (y nombra la tabla).
        // No se muere el barrido: se anota y se sigue.
        abortadasDelGrupo += 1;
        const loser = porId.get(loserId);
        abortadas.push(
          `${loserId} («${loser?.title ?? "?"}») → ${winner.id} («${winner.title ?? "?"}») [${entry.qid}]: ${error.message}`
        );
        console.error(`  ABORTADA ${loserId} → ${winner.id}: ${error.message}`);
        continue;
      }
      fusionadas += 1;
      console.log(`  fusionada ${loserId} → ${winner.id} (${entry.qid})`);
    }
    if (winner.wikidata_id === entry.qid) continue;
    if (abortadasDelGrupo > 0) {
      // Si un perdedor sobrevivió puede seguir siendo el dueño del QID, y el
      // update chocaría con el único. Se deja el grupo entero para revisión.
      fallosQid.push(
        `${winner.id}: ${entry.qid} no asignado, ${abortadasDelGrupo} fusión(es) abortada(s)`
      );
      continue;
    }
    const { error } = await supabase
      .from("books")
      .update({ wikidata_id: entry.qid })
      .eq("id", winner.id);
    if (error) fallosQid.push(`${winner.id} (${entry.qid}): ${error.message}`);
    else asignadas += 1;
  }

  for (const entry of setQid) {
    const { error } = await supabase
      .from("books")
      .update({ wikidata_id: entry.qid })
      .eq("id", entry.book.id);
    if (error) fallosQid.push(`${entry.book.id} (${entry.qid}): ${error.message}`);
    else asignadas += 1;
  }

  console.log(`\nAPLICADO\n  fusiones hechas: ${fusionadas}\n  QID asignados: ${asignadas}`);
  if (abortadas.length > 0) {
    console.log(
      `\nFUSIONES ABORTADAS (${abortadas.length}) — REVISIÓN MANUAL.\n` +
        "merge_book_into no escribió NADA en estas: hay un dato de usuario que\n" +
        "chocaría y nadie elige por el usuario qué fila suya sobrevive.\n"
    );
    for (const linea of abortadas) console.log(`  ${linea}`);
  }
  if (fallosQid.length > 0) {
    console.log(`\nQID NO ASIGNADOS (${fallosQid.length}):`);
    for (const linea of fallosQid) console.log(`  ${linea}`);
  }
  console.log(
    "\nOJO: esto escribe por fuera de Next, así que las fichas cacheadas seguirán " +
      "enseñando lo viejo hasta que caduque su cacheLife. No es que no haya hecho nada."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
