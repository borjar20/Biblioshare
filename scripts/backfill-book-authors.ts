// Limpieza de una vez de los autores de libro que escribió la vía vieja
// (buscar el nombre suelto en Open Library y quedarse con docs[0]).
//
// Por qué hace falta además de arreglar la fuente: cambiar `ensureItemEnriched`
// arregla el futuro, no el pasado. En producción al 2026-08-13 había 61 autores
// de libro para 194 libros, con identidades falsas (Frank Herbert nacido en
// 1872), una fila por grafía de idioma, y traductores e ilustradores guardados
// con role="author".
//
// Idempotente: una segunda pasada no debe imprimir ni una acción.
//
// ─────────────────────────────────────────────────────────────────────────────
// LEE ESTO ANTES DE LANZARLO CONTRA PRODUCCIÓN
// ─────────────────────────────────────────────────────────────────────────────
// Este script BORRA. Corre con `service_role` (RLS no le frena), borra filas de
// `credits` y filas de `people`, y `credits_person_id_fkey` es ON DELETE
// CASCADE: borrar una persona se lleva TODOS sus créditos por delante, también
// los de cine. Un borrado equivocado aquí no se deshace solo — peor: deja al
// libro con un crédito "correcto" y `billing_order` no nulo, con lo que
// `hasBilledCast` da por bueno el enriquecido y la app NO vuelve a intentarlo
// nunca.
//
// Por eso el borrado está condicionado a TRES cosas a la vez (fase 5). Se retira
// un crédito solo si:
//
//   1. Se derivó un conjunto de autores NO VACÍO para ese libro. Vacío significa
//      "no se pudo determinar", nunca "no tiene autores".
//   2. La resolución fue COMPLETA: cada clave de autor derivada acabó en un
//      `people.id`, o fue descartada a sabiendas por no tener grafía latina
//      (duplicado en otro alfabeto — descarte determinista). Si una sola clave
//      se quedó sin resolver por un fallo de red/timeout, no se borra nada de
//      ese libro: la API de Open Library no tiene aquí ni rate limit ni caché
//      (el `next: { revalidate }` de la app NO existe fuera de Next) y cuatro
//      pasadas seguidas sobre la MISMA base dieron 39, 37, 34 y 33 libros sin
//      autores. Los fallos son reales y aleatorios.
//   3. La obra del libro está VERIFICADA: o venía ya en `books.openlibrary_work_key`,
//      o la búsqueda por título devolvió un título que casa tras normalizar. Un
//      acierto fuzzy vale para AÑADIR créditos que faltan, nunca para quitar
//      ninguno: si no confiamos en él ni para escribir una columna, mucho menos
//      para borrar una fila.
//
// Añadir es siempre seguro; quitar, no. Esa asimetría es toda la lógica de la
// fase 5.
//
// El DRY-RUN previsualiza también los borrados: los autores que habría que dar
// de alta se registran con un id postizo ("NUEVA:<clave>") que jamás puede
// coincidir con un `person_id` real, para que la comparación de la fase 5 —y por
// tanto el recuento de créditos a retirar— sea la misma que en la pasada real.
// Sin eso, los libros cuyos autores correctos son todos nuevos salían como
// "intactos" y sus borrados no se veían: justo los peligrosos. (En dev, el
// dry-run anunciaba 226 créditos y la pasada real escribió 518.)
//
// NO HAY FASE DE FUSIÓN, y no hace falta: `people_openlibrary_key_key` es un
// índice único parcial sobre `openlibrary_key`, así que dos filas NO pueden
// compartir ya una clave no nula — una fase que buscara ese caso no se
// ejecutaría nunca (era el caso, y se ha quitado; una red de seguridad que no
// puede saltar es peor que no tenerla, porque quien la lee se fía). Los
// duplicados que SÍ salen —dos grafías de idioma del mismo humano, de las que la
// fase 3 corrige una— los limpian las fases 5 y 6 de refilón: la fila vieja
// pierde sus créditos al reescribirlos, y el barrido de huérfanas la borra.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/backfill-book-authors.ts            # dry-run
//   npx tsx --env-file=.env.local scripts/backfill-book-authors.ts --apply    # escribe
//
// (`tsx` NO está en devDependencies a propósito: se baja al vuelo con npx, como
// backfill-sizes.ts y backfill-genres.ts.)
//
// Necesita SUPABASE_SERVICE_ROLE_KEY del entorno que toque — ojo: .env.local
// apunta a DEV; para prod, exporta las suyas. Dev primero, se lee el log, y
// luego prod.
import { createClient } from "@supabase/supabase-js";
import {
  fetchWorkAuthorKeys,
  lookupOpenLibraryAuthorByKey,
} from "../src/lib/catalog/openlibrary/work-authors";
import { resolveWorkByTitleAuthor } from "../src/lib/catalog/openlibrary/work-search";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

function log(action: string, detail: string) {
  console.log(`${APPLY ? "[HECHO]" : "[DRY] "} ${action.padEnd(18)} ${detail}`);
}

type BookRow = { id: string; title: string; author: string | null; openlibrary_work_key: string | null };
type PersonRow = {
  id: string;
  name: string;
  aliases: string[];
  openlibrary_key: string | null;
};

// Techo explícito de cada select. PostgREST tiene su propio `db.max-rows` y
// trunca EN SILENCIO: un `people` recortado rompería el emparejamiento por
// nombre de la fase 3 (crearía duplicados en vez de corregir) sin decir ni pío.
// Por eso cada select pide además el total exacto y se compara: si falta una
// sola fila, el script se para. Hoy son 194 libros y 61 personas; esto es para
// el día que no lo sean.
const LIMITE_FILAS = 5000;

function exigirSelectCompleto(que: string, filas: unknown[], total: number | null): void {
  if (total != null && filas.length < total) {
    throw new Error(
      `Select de "${que}" truncado: llegaron ${filas.length} filas de ${total}. ` +
        `Sube LIMITE_FILAS o pagina; NO sigas, con datos parciales este script borra de más.`
    );
  }
}

// Id postizo del dry-run (ver cabecera). El prefijo lleva ":" a propósito: un
// uuid nunca lo contiene, así que no puede colisionar con un `person_id` real.
const PREFIJO_POSTIZO = "NUEVA:";
function esPostizo(id: string): boolean {
  return id.startsWith(PREFIJO_POSTIZO);
}

// Misma normalización que se usa para reconocer que "Fiódor Dostoyevski" y
// "Fiodor Dostoyevski" son el mismo texto: minúsculas, sin acentos, solo letras.
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento, ya separadas por NFD
    .replace(/[^a-z]/g, "");
}

async function main() {
  if (!APPLY) console.log("*** DRY-RUN: no se escribe nada. Añade --apply para ejecutar. ***\n");

  // ── Fase 1 y 2: work key de cada libro y autores correctos ────────────────
  const { data: books, count: totalBooks, error: booksError } = await supabase
    .from("books")
    .select("id, title, author, openlibrary_work_key", { count: "exact" })
    .limit(LIMITE_FILAS);
  if (booksError) throw booksError;
  exigirSelectCompleto("books", books ?? [], totalBooks);

  const correctByBook = new Map<string, string[]>(); // bookId -> claves de autor

  // Libros cuya obra NO está verificada: la búsqueda por título devolvió algo
  // que no casa, o no devolvió nada. Sus claves de autor sirven para AÑADIR,
  // nunca para justificar un borrado (regla 3 de la cabecera).
  const librosSinObraVerificada = new Set<string>();

  let workKeysGuardadas = 0;
  let workKeysDescartadasPorTitulo = 0;
  let librosSinObra = 0;
  let librosSinAutoresDerivados = 0;

  for (const book of (books ?? []) as BookRow[]) {
    let workKey = book.openlibrary_work_key;
    let authorKeys: string[] = [];

    if (workKey) {
      authorKeys = await fetchWorkAuthorKeys(workKey);
    } else {
      const resolved = await resolveWorkByTitleAuthor(book.title, book.author);
      if (resolved) {
        // Las claves de autor se aprovechan siempre, aunque el título no case
        // exacto: son útiles hasta de un acierto imperfecto (igual que en
        // ensureItemEnriched). PERO allí eso es inocuo porque esa vía solo
        // hace upsert; aquí, sin la marca de abajo, un acierto fuzzy acabaría
        // autorizando un DELETE.
        authorKeys = resolved.authorKeys;

        // La work key SOLO se persiste si el título coincide tras normalizar.
        // Un acierto fuzzy sin verificar, escrito en una columna que otras
        // features tratan como identidad, colaría el mismo error de origen
        // (nombre suelto = identidad) por otra puerta — y de forma permanente,
        // porque una vez escrita ya no se vuelve a resolver.
        if (resolved.titleMatches) {
          workKeysGuardadas++;
          log("work key", `${book.title} -> ${resolved.workKey}`);
          workKey = resolved.workKey;
          if (APPLY) {
            const { error } = await supabase
              .from("books")
              .update({ openlibrary_work_key: workKey })
              .eq("id", book.id);
            if (error) throw error;
          }
        } else {
          workKeysDescartadasPorTitulo++;
          librosSinObraVerificada.add(book.id);
          log(
            "título no casa",
            `${book.title} -> ${resolved.workKey} (no se guarda la work key; ` +
              `este libro SOLO admite altas de crédito, nunca retiradas)`
          );
        }
      } else {
        librosSinObra++;
        librosSinObraVerificada.add(book.id);
        log("sin obra", `${book.title} (la búsqueda por título no devolvió nada)`);
      }
    }

    if (authorKeys.length === 0) {
      librosSinAutoresDerivados++;
      log("sin autores", `${book.title} (no se toca: no se pudo determinar quién lo escribió)`);
    }
    correctByBook.set(book.id, authorKeys);
  }

  // ── Fase 3: casar cada clave con `people`, corrigiendo en vez de duplicar ──
  const { data: peopleRows, count: totalPeople, error: peopleError } = await supabase
    .from("people")
    .select("id, name, aliases, openlibrary_key", { count: "exact" })
    .is("tmdb_id", null)
    .limit(LIMITE_FILAS);
  if (peopleError) throw peopleError;
  exigirSelectCompleto("people", peopleRows ?? [], totalPeople);

  const people = (peopleRows ?? []) as PersonRow[];
  // Una fila por clave: `people_openlibrary_key_key` (único parcial) impide que
  // haya dos con la misma clave no nula.
  const byKey = new Map<string, PersonRow>();
  const byName = new Map<string, PersonRow>();
  for (const p of people) {
    if (p.openlibrary_key && !byKey.has(p.openlibrary_key)) byKey.set(p.openlibrary_key, p);
    for (const grafia of [p.name, ...(p.aliases ?? [])]) {
      const n = normalize(grafia);
      if (n && !byName.has(n)) byName.set(n, p);
    }
  }

  const personIdByKey = new Map<string, string>();
  // Claves descartadas A SABIENDAS: la ficha se trajo y no tiene ninguna grafía
  // latina, o sea que es el stub del mismo humano en otro alfabeto. No cuentan
  // como "sin resolver" para la fase 5: el descarte es correcto y determinista.
  const clavesDescartadas = new Set<string>();
  // Claves que NO se pudieron consultar (HTTP, timeout, red). Estas SÍ dejan la
  // resolución incompleta y bloquean el borrado en sus libros.
  const clavesNoAlcanzables = new Set<string>();

  const todasLasClaves = [...new Set([...correctByBook.values()].flat())];
  let identidadesReemplazadas = 0;

  for (const authorKey of todasLasClaves) {
    const yaPorClave = byKey.get(authorKey);
    if (yaPorClave) {
      personIdByKey.set(authorKey, yaPorClave.id);
      continue;
    }

    const lookup = await lookupOpenLibraryAuthorByKey(authorKey);

    if (lookup.status === "unreachable") {
      // OJO: esto NO es "este autor no cuenta". Es "hoy no se pudo saber".
      clavesNoAlcanzables.add(authorKey);
      log("NO ALCANZABLE", `${authorKey} (fallo de API/red: bloquea el borrado en sus libros)`);
      continue;
    }
    if (lookup.status === "discarded") {
      clavesDescartadas.add(authorKey);
      log("descartado", `${authorKey} (ficha traída, sin grafía latina: duplicado de alfabeto)`);
      continue;
    }
    const ol = lookup.author;

    // ¿Existe ya con otro nombre? Se corrige la fila; no se crea una segunda.
    // Es lo que repara al Frank Herbert falso (el nacido en 1872).
    const porNombre =
      byName.get(normalize(ol.name)) ??
      ol.aliases.map((a) => byName.get(normalize(a))).find(Boolean);

    if (porNombre) {
      // El log lleva SIEMPRE las dos claves. Con solo los nombres, el caso
      // estrella era invisible: "Frank Herbert -> Frank Herbert" no deja ver
      // que por debajo se está sustituyendo la clave OL1758387A por OL79034A,
      // que es un cambio de IDENTIDAD, no un retoque de nombre.
      const etiqueta =
        `${porNombre.name} [${porNombre.openlibrary_key ?? "sin clave"}]` +
        ` -> ${ol.name} [${ol.key}]`;
      if (porNombre.openlibrary_key && porNombre.openlibrary_key !== ol.key) {
        identidadesReemplazadas++;
        log("!! IDENTIDAD", `${etiqueta}  <<< se REEMPLAZA una clave ya existente`);
      } else {
        log("corregida", etiqueta);
      }
      personIdByKey.set(authorKey, porNombre.id);
      if (APPLY) {
        const { error } = await supabase
          .from("people")
          .update({
            name: ol.name,
            aliases: [...new Set([...ol.aliases, porNombre.name])].filter((a) => a !== ol.name),
            openlibrary_key: ol.key,
            photo_url: ol.photoUrl,
            bio: ol.bio,
            birth_date: ol.birthDate,
            death_date: ol.deathDate,
          })
          .eq("id", porNombre.id);
        if (error) throw error;
      }
      continue;
    }

    log("alta", `${ol.name} (${authorKey})`);
    if (APPLY) {
      const { data, error } = await supabase
        .from("people")
        .insert({
          name: ol.name,
          aliases: ol.aliases,
          openlibrary_key: ol.key,
          photo_url: ol.photoUrl,
          bio: ol.bio,
          birth_date: ol.birthDate,
          death_date: ol.deathDate,
        })
        .select("id")
        .single();
      if (error) throw error;
      personIdByKey.set(authorKey, data.id);
    } else {
      // Id postizo SOLO en dry-run: sin él, un libro cuyos autores correctos
      // son todos nuevos caería en "correctos vacíos", se contaría como
      // intacto, y sus borrados NO se previsualizarían. Ver cabecera.
      personIdByKey.set(authorKey, `${PREFIJO_POSTIZO}${authorKey}`);
    }
  }

  // ── Fase 4: (no existe) ───────────────────────────────────────────────────
  // Aquí vivía una fusión de personas con la misma `openlibrary_key`. No podía
  // saltar nunca: el índice único parcial lo impide. La deduplicación real la
  // hacen las fases 5 y 6. Explicado en la cabecera.

  // ── Fase 5: reescribir los créditos `author` de cada libro ────────────────
  let creditosRetirados = 0;
  let creditosEscritos = 0;
  let librosIntactos = 0;
  let librosSoloAdicion = 0;

  // Para que el dry-run pueda prever también las huérfanas de la fase 6: qué
  // créditos se retirarían, agrupados por persona.
  const creditosRetiradosPorPersona = new Map<string, Set<string>>();

  for (const [bookId, authorKeys] of correctByBook) {
    const correctos = authorKeys
      .map((k) => personIdByKey.get(k))
      .filter((id): id is string => !!id);

    // Cinturón: los ids postizos solo existen en dry-run. Si uno llegara a una
    // pasada con --apply sería un bug de este script escribiendo basura en
    // `credits.person_id`; mejor reventar antes de tocar la base.
    if (APPLY && correctos.some(esPostizo)) {
      throw new Error(`Id postizo en pasada --apply (libro ${bookId}): abortado antes de escribir.`);
    }

    // Un conjunto derivado vacío NO significa "este libro no tiene autores":
    // significa "no se pudo determinar" (obra sin autores en Open Library,
    // fallo de red, throttle, o autor descartado en fase 3 por no tener
    // ficha o grafía latina). La prueba de que es real: contra la BD de dev,
    // "Rayuela" salió "sin autores" en un dry-run y resolvió work key en el
    // siguiente — la búsqueda no es determinista entre pasadas. Borrar aquí
    // sería además irrecuperable: `ensureItemEnriched` lee la misma fuente y
    // volvería a derivar el mismo vacío, así que nada restauraría el
    // crédito borrado (caso real: "Dune", /works/OL893415W, la obra
    // legítimamente no lista autores en Open Library pero el libro sí tenía
    // un crédito correcto en la BD). Sin nada que poner en su lugar, no se
    // toca nada de este libro.
    if (correctos.length === 0) {
      librosIntactos++;
      continue;
    }

    // Regla 2: resolución COMPLETA. Cada clave derivada tiene que haber acabado
    // en una persona o en un descarte deliberado. Una sola clave caída por red
    // deja el conjunto "correcto" cojo, y borrar contra un conjunto cojo le
    // quita el crédito a un autor de verdad (y luego la fase 6 se lleva su fila
    // entera, con sus créditos de cine incluidos, por el ON DELETE CASCADE).
    const resolucionCompleta = authorKeys.every(
      (k) => personIdByKey.has(k) || clavesDescartadas.has(k)
    );
    // Regla 3: obra verificada.
    const obraVerificada = !librosSinObraVerificada.has(bookId);
    const puedeRetirar = resolucionCompleta && obraVerificada;

    if (puedeRetirar) {
      const { data: actuales, error } = await supabase
        .from("credits")
        .select("id, person_id")
        .eq("item_type", "book")
        .eq("item_id", bookId)
        .eq("role", "author");
      if (error) throw error;

      for (const credito of actuales ?? []) {
        if (correctos.includes(credito.person_id)) continue;
        creditosRetirados++;
        const yaVistos = creditosRetiradosPorPersona.get(credito.person_id) ?? new Set<string>();
        yaVistos.add(credito.id);
        creditosRetiradosPorPersona.set(credito.person_id, yaVistos);
        log("crédito fuera", `libro ${bookId} persona ${credito.person_id}`);
        if (APPLY) {
          const { error: delErr } = await supabase.from("credits").delete().eq("id", credito.id);
          if (delErr) throw delErr;
        }
      }
    } else {
      librosSoloAdicion++;
      const motivo = !obraVerificada
        ? "obra sin verificar (acierto fuzzy de título)"
        : "resolución incompleta (alguna clave no se pudo consultar)";
      log("solo altas", `libro ${bookId} — ${motivo}: no se retira ningún crédito`);
    }

    const filas = correctos.map((personId, i) => ({
      item_type: "book",
      item_id: bookId,
      person_id: personId,
      role: "author",
      billing_order: i,
    }));
    if (filas.length > 0) {
      creditosEscritos += filas.length;
      if (APPLY) {
        // `ignoreDuplicates: false` A PROPÓSITO, y solo aquí: los créditos que
        // ya existían traen el `billing_order` que les puso la vía vieja (la
        // posición dentro del string de portada), y hay que corregirlo — si no,
        // en un mismo libro conviven órdenes contradictorios y la ficha vuelve
        // a poder pintar al ilustrador delante del autor.
        //
        // En `src/lib/people/enrich-item.ts` sigue siendo `true` y así debe
        // seguir: allí varios renders concurrentes hacen upsert a la vez y la
        // app no debe pelearse consigo misma.
        //
        // Solo se actualizan las columnas del payload; `character` no se toca.
        const { error: upErr } = await supabase
          .from("credits")
          .upsert(filas, {
            onConflict: "item_type,item_id,person_id,role",
            ignoreDuplicates: false,
          });
        if (upErr) throw upErr;
      }
    }
  }

  // ── Fase 6: barrer personas huérfanas ─────────────────────────────────────
  const { data: huerfanas, count: totalHuerfanas, error: huerfanasError } = await supabase
    .from("people")
    .select("id, name, credits(id)", { count: "exact" })
    .is("tmdb_id", null)
    .limit(LIMITE_FILAS);
  if (huerfanasError) throw huerfanasError;
  exigirSelectCompleto("people (huérfanas)", huerfanas ?? [], totalHuerfanas);

  let borradas = 0;
  for (const p of (huerfanas ?? []) as Array<{
    id: string;
    name: string;
    credits: Array<{ id: string }>;
  }>) {
    // En dry-run los créditos de la fase 5 siguen ahí, así que hay que
    // descontarlos a mano para que el recuento de huérfanas sea el que dejaría
    // la pasada real. En --apply ya están borrados y el descuento no cambia
    // nada (el conjunto no intersecta).
    const retirados = creditosRetiradosPorPersona.get(p.id);
    const restantes = (p.credits ?? []).filter((c) => !retirados?.has(c.id));
    if (restantes.length > 0) continue;
    borradas++;
    log("huérfana", `${p.name} (${p.id})`);
    if (APPLY) {
      const { error } = await supabase.from("people").delete().eq("id", p.id);
      if (error) throw error;
    }
  }

  // Los rótulos cambian de tiempo verbal según la pasada: en dry-run,
  // "asegurados: 516" se leía como un trabajo ya hecho cuando no se escribió ni
  // una fila.
  const decir = (hecho: string, futuro: string) => (APPLY ? hecho : futuro);
  console.log(
    `\nlibros mirados: ${books?.length ?? 0}` +
      `\nwork keys resueltas y guardadas: ${workKeysGuardadas}` +
      ` | resueltas pero NO guardadas (título discordante): ${workKeysDescartadasPorTitulo}` +
      ` | sin obra en Open Library: ${librosSinObra}` +
      `\nlibros sin autores derivados (no se tocan): ${librosSinAutoresDerivados}` +
      `\ncréditos ${decir("retirados", "que se retirarían")}: ${creditosRetirados}` +
      ` | créditos ${decir("escritos", "que se escribirían")}: ${creditosEscritos}` +
      `\nlibros intactos (sin autores derivados): ${librosIntactos}` +
      ` | libros solo-altas (obra fuzzy o resolución incompleta): ${librosSoloAdicion}` +
      `\nidentidades de persona ${decir("reemplazadas", "que se reemplazarían")}` +
      ` (clave vieja -> clave nueva): ${identidadesReemplazadas}` +
      `\nclaves de autor no alcanzables (fallo de API): ${clavesNoAlcanzables.size}` +
      ` | descartadas por no tener grafía latina: ${clavesDescartadas.size}` +
      `\npersonas huérfanas ${decir("borradas", "que se borrarían")}: ${borradas}`
  );
  if (!APPLY) {
    console.log(
      "\nDRY-RUN: NADA de lo de arriba se ha escrito. Los recuentos son lo que HARÍA " +
        "la pasada con --apply, borrados incluidos."
    );
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
