// Rellena de una vez las shells de libro VACÍAS que dejó la ficha de autor
// antes de que `findOrCreateCatalogItemsBulk` hidratara los libros en lote.
//
// EL DATO. En producción el 2026-08-26 había 268 libros en el catálogo y **61
// filas completamente vacías** —`title`, `author`, `published_year`,
// `cover_url` y `hydrated_at` a NULL, todas con `openlibrary_work_key`—, el
// 23% del catálogo, y **todas de una sola visita a la ficha de Brandon
// Sanderson**. La ficha las pinta leyendo `books.title`, así que salían como
// «Sin título» y sin año.
//
// POR QUÉ NO SE ARREGLAN SOLAS. Arreglar `findOrCreateCatalogItemsBulk` arregla
// el futuro, no el pasado: `people.credits_hydrated_at` de Sanderson ya está
// puesto, así que la bibliografía NO se vuelve a pedir nunca, y nadie va a
// abrir 61 fichas de libro a mano para que `ensureBookHydrated` las despierte.
//
// CÓMO CASA. Por `openlibrary_work_key`, que es una IDENTIDAD exacta — nunca
// por título. No hay ninguna comparación de texto en este script, y no debe
// haberla: casar shells vacías por título sería casar por el campo que
// precisamente está vacío.
//
// SEGURIDAD. Este script NO borra nada y solo puede AÑADIR: escribe a través de
// `hydrate_books_bulk`, que es fill-or-upgrade y no puede pisar una curación
// (`repr_meta.*.source = 'manual'`) ni degradar un título de mejor idioma. Y no
// marca `hydrated_at`: los libros que toque siguen pendientes de su hidratación
// completa (sinopsis, géneros, páginas, QID) en la primera visita a su ficha.
//
// La RPC es de `service_role` (ver 20260890_repr_i_hydrate_books_bulk.sql), así
// que este script necesita `SUPABASE_SERVICE_ROLE_KEY`, igual que sus hermanos.
// OJO: el brief original decía «token de usuario, como la ficha (#751)». Eso ya
// no aplica: la RPC dejó de ser de `authenticated` a propósito, porque un
// escritor masivo con el cliente de la petición marcaría `manual` el catálogo
// entero vía `trg_stamp_books_repr_manual`.
//
// USO
//   npx tsx scripts/backfill-book-shells.ts             # DRY-RUN (por defecto)
//   npx tsx scripts/backfill-book-shells.ts --apply     # escribe de verdad
//
// Idempotente: una segunda pasada no debería encontrar shells que rellenar.

import { createClient } from "@supabase/supabase-js";
import { fetchAuthorWorks } from "../src/lib/catalog/openlibrary/author-books";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

// Open Library no tiene aquí ni caché de Next ni rate limit declarado, pero sus
// recortes bajo carga están medidos (39/37/34/33 obras en cuatro llamadas
// idénticas): se va despacio a propósito. `fetchAuthorWorks` hace DOS llamadas.
const THROTTLE_MS = 1000;
const RPC_CHUNK = 50;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decir(real: string, seco: string) {
  return APPLY ? real : seco;
}

type Shell = { id: string; openlibrary_work_key: string };

async function main() {
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno."
    );
  }

  // 1. Las shells vacías. `title is null` es el síntoma que ve el usuario
  //    («Sin título»); sin `openlibrary_work_key` no hay por dónde casarlas.
  const { data: shellsRaw, error: shellsError } = await supabase
    .from("books")
    .select("id, openlibrary_work_key")
    .is("title", null)
    .not("openlibrary_work_key", "is", null);
  if (shellsError) throw shellsError;

  const shells = (shellsRaw ?? []) as Shell[];
  if (shells.length === 0) {
    console.log("No hay ninguna shell de libro vacía con work key. Nada que hacer.");
    return;
  }
  const porWorkKey = new Map(shells.map((s) => [s.openlibrary_work_key, s.id]));
  console.log(`Shells vacías con work key: ${shells.length}`);

  // 2. Los créditos de esas shells, para saber a qué autores hay que preguntar.
  const { data: creditsRaw, error: creditsError } = await supabase
    .from("credits")
    .select("item_id, person_id")
    .eq("item_type", "book")
    .in(
      "item_id",
      shells.map((s) => s.id)
    );
  if (creditsError) throw creditsError;

  const personIds = [...new Set((creditsRaw ?? []).map((c) => c.person_id as string))];
  const { data: peopleRaw, error: peopleError } = await supabase
    .from("people")
    .select("id, name, openlibrary_key")
    .in("id", personIds.length > 0 ? personIds : ["00000000-0000-0000-0000-000000000000"])
    .not("openlibrary_key", "is", null);
  if (peopleError) throw peopleError;
  const people = (peopleRaw ?? []) as Array<{
    id: string;
    name: string;
    openlibrary_key: string;
  }>;

  console.log(
    `Personas con clave de Open Library que sostienen esas shells: ${people.length}`
  );

  const cubiertas = new Set<string>();
  let filasPropuestas = 0;
  let personasFallidas = 0;

  // 3. Por persona: la MISMA llamada que hace la ficha, que devuelve
  //    exactamente los datos que se tiraban — ya con el título ES-preferente y
  //    su `titleLang`.
  for (const [i, person] of people.entries()) {
    if (i > 0) await sleep(THROTTLE_MS);

    const works = await fetchAuthorWorks(person.openlibrary_key);
    if (works.length === 0) {
      // `fetchAuthorWorks` nunca lanza: [] es «no se pudo saber». No se marca
      // nada ni se da por cubierta ninguna shell de esta persona.
      personasFallidas += 1;
      console.log(`  ${person.name}: sin bibliografía (fallo de API o autor sin obra)`);
      continue;
    }

    const rows = works
      .filter((w) => porWorkKey.has(w.workKey))
      .map((w) => ({
        book_id: porWorkKey.get(w.workKey)!,
        title: w.title || null,
        title_lang: w.titleLang,
        author: person.name,
        cover_url: w.coverUrl,
        // La portada del doc de búsqueda es la de la OBRA, no la de una edición
        // de idioma conocido: el fallback que rellena hueco pero no sella.
        cover_lang: "other" as const,
        published_year: w.year,
      }));

    for (const row of rows) cubiertas.add(row.book_id);
    filasPropuestas += rows.length;
    console.log(
      `  ${person.name}: ${works.length} obras, ${rows.length} shells que casan por work key`
    );

    if (!APPLY || rows.length === 0) continue;

    for (let start = 0; start < rows.length; start += RPC_CHUNK) {
      const chunk = rows.slice(start, start + RPC_CHUNK);
      const { error } = await supabase.rpc("hydrate_books_bulk", { p_rows: chunk });
      if (error) {
        console.error(`  ERROR en hydrate_books_bulk (${chunk.length} filas)`, error);
      }
    }
  }

  // 4. Las que no cuelgan de ninguna persona con clave OL: revisión manual.
  const huerfanas = shells.filter((s) => !cubiertas.has(s.id));

  console.log(
    `\nshells vacías: ${shells.length}` +
      `\nfilas ${decir("enviadas", "que se enviarían")} a hydrate_books_bulk: ${filasPropuestas}` +
      `\npersonas sin bibliografía utilizable: ${personasFallidas}` +
      `\nshells sin cubrir (revisión manual): ${huerfanas.length}`
  );
  for (const s of huerfanas) {
    console.log(`  sin cubrir: ${s.id} ${s.openlibrary_work_key}`);
  }

  if (!APPLY) {
    console.log(
      "\nDRY-RUN: NADA de lo de arriba se ha escrito. Vuelve a lanzarlo con --apply."
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
