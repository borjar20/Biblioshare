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
  fetchOpenLibraryAuthorByKey,
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
  created_at: string;
};

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
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, author, openlibrary_work_key");
  if (booksError) throw booksError;

  const correctByBook = new Map<string, string[]>(); // bookId -> claves de autor
  let resueltas = 0;
  let sinObra = 0;

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
        // ensureItemEnriched).
        authorKeys = resolved.authorKeys;
        resueltas++;

        // Pero la work key SOLO se persiste si el título coincide tras
        // normalizar. Un acierto fuzzy sin verificar, escrito en una columna
        // que otras features tratan como identidad, colaría el mismo error de
        // origen (nombre suelto = identidad) por otra puerta — y de forma
        // permanente, porque una vez escrita ya no se vuelve a resolver.
        if (resolved.titleMatches) {
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
          log("título no casa", `${book.title} -> ${resolved.workKey} (no se guarda la work key)`);
        }
      }
    }

    if (authorKeys.length === 0) {
      sinObra++;
      log("sin autores", `${book.title} (se quedará sin crédito)`);
    }
    correctByBook.set(book.id, authorKeys);
  }

  // ── Fase 3: casar cada clave con `people`, corrigiendo en vez de duplicar ──
  const { data: peopleRows, error: peopleError } = await supabase
    .from("people")
    .select("id, name, aliases, openlibrary_key, created_at")
    .is("tmdb_id", null);
  if (peopleError) throw peopleError;

  const people = (peopleRows ?? []) as PersonRow[];
  const byKey = new Map<string, PersonRow[]>();
  const byName = new Map<string, PersonRow>();
  for (const p of people) {
    if (p.openlibrary_key) {
      byKey.set(p.openlibrary_key, [...(byKey.get(p.openlibrary_key) ?? []), p]);
    }
    for (const grafia of [p.name, ...(p.aliases ?? [])]) {
      const n = normalize(grafia);
      if (n && !byName.has(n)) byName.set(n, p);
    }
  }

  const personIdByKey = new Map<string, string>();
  const todasLasClaves = [...new Set([...correctByBook.values()].flat())];

  for (const authorKey of todasLasClaves) {
    const yaPorClave = byKey.get(authorKey)?.[0];
    if (yaPorClave) {
      personIdByKey.set(authorKey, yaPorClave.id);
      continue;
    }

    const ol = await fetchOpenLibraryAuthorByKey(authorKey);
    if (!ol) {
      log("descartado", `${authorKey} (sin ficha o sin grafía latina)`);
      continue;
    }

    // ¿Existe ya con otro nombre? Se corrige la fila; no se crea una segunda.
    const porNombre =
      byName.get(normalize(ol.name)) ??
      ol.aliases.map((a) => byName.get(normalize(a))).find(Boolean);

    if (porNombre) {
      log("corregida", `${porNombre.name} -> ${ol.name} (${authorKey})`);
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
    }
  }

  // ── Fase 4: fusionar duplicados con la misma clave ────────────────────────
  // `credits.person_id` es la ÚNICA FK a `people` (verificado en prod el
  // 2026-08-13), así que fusionar = repuntar créditos y borrar la fila.
  for (const [claveDuplicada, filas] of byKey) {
    if (filas.length < 2) continue;
    const [superviviente, ...resto] = [...filas].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    for (const dup of resto) {
      log("fusión", `${dup.name} (${dup.id}) -> ${superviviente.name} [${claveDuplicada}]`);
      if (APPLY) {
        const { error: upErr } = await supabase
          .from("credits")
          .update({ person_id: superviviente.id })
          .eq("person_id", dup.id);
        if (upErr) throw upErr;
        const { error: delErr } = await supabase.from("people").delete().eq("id", dup.id);
        if (delErr) throw delErr;
      }
    }
  }

  // ── Fase 5: reescribir los créditos `author` de cada libro ────────────────
  let creditosBorrados = 0;
  let creditosPuestos = 0;
  let librosIntactos = 0;

  for (const [bookId, authorKeys] of correctByBook) {
    const correctos = authorKeys
      .map((k) => personIdByKey.get(k))
      .filter((id): id is string => !!id);

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
    // un crédito correcto en la BD). Por eso, si no hay nada que poner en su
    // lugar, no se toca lo que ya hay: el borrado solo vale como parte de una
    // sustitución positiva (retirar traductores/ilustradores cuando SÍ se
    // derivó un conjunto de autores real).
    if (correctos.length === 0) {
      librosIntactos++;
      continue;
    }

    const { data: actuales, error } = await supabase
      .from("credits")
      .select("id, person_id")
      .eq("item_type", "book")
      .eq("item_id", bookId)
      .eq("role", "author");
    if (error) throw error;

    for (const credito of actuales ?? []) {
      if (correctos.includes(credito.person_id)) continue;
      creditosBorrados++;
      log("crédito fuera", `libro ${bookId} persona ${credito.person_id}`);
      if (APPLY) {
        const { error: delErr } = await supabase.from("credits").delete().eq("id", credito.id);
        if (delErr) throw delErr;
      }
    }

    const filas = correctos.map((personId, i) => ({
      item_type: "book",
      item_id: bookId,
      person_id: personId,
      role: "author",
      billing_order: i,
    }));
    if (filas.length > 0) {
      creditosPuestos += filas.length;
      if (APPLY) {
        const { error: upErr } = await supabase
          .from("credits")
          .upsert(filas, { onConflict: "item_type,item_id,person_id,role", ignoreDuplicates: true });
        if (upErr) throw upErr;
      }
    }
  }

  // ── Fase 6: barrer personas huérfanas ─────────────────────────────────────
  const { data: huerfanas, error: huerfanasError } = await supabase
    .from("people")
    .select("id, name, credits(id)")
    .is("tmdb_id", null);
  if (huerfanasError) throw huerfanasError;

  let borradas = 0;
  for (const p of (huerfanas ?? []) as Array<{ id: string; name: string; credits: unknown[] }>) {
    if ((p.credits ?? []).length > 0) continue;
    borradas++;
    log("huérfana", `${p.name} (${p.id})`);
    if (APPLY) {
      const { error } = await supabase.from("people").delete().eq("id", p.id);
      if (error) throw error;
    }
  }

  console.log(
    `\nlibros: ${books?.length ?? 0} | work keys resueltas: ${resueltas} | sin obra: ${sinObra}` +
      `\ncréditos retirados: ${creditosBorrados} | créditos asegurados: ${creditosPuestos}` +
      `\nlibros intactos (sin autores derivados): ${librosIntactos}` +
      `\npersonas huérfanas borradas: ${borradas}`
  );
  console.log(
    "\nOJO: esto escribe por fuera de Next, así que las fichas cacheadas seguirán " +
      "enseñando lo viejo hasta que caduque su cacheLife. No es que no haya hecho nada."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
