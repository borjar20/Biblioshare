import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/database.types";
import { fetchWork, fetchFirstEditionDescription } from "./openlibrary/work-detail";
import { fetchOpenLibraryAuthorByKey } from "./openlibrary/work-authors";
import { resolveWorkKey, fetchRepresentationCandidates } from "./openlibrary/editions";
import { searchInventaireEntities, qidFromUri } from "./inventaire/client";
import { findBestVolume, type GoogleVolume } from "./googlebooks/client";
import { mapSubjectsToGenres } from "./genres";
import {
  authorMatches,
  langRank,
  needsRepresentationReview,
  pickField,
  synopsisLang,
  type HydrateFields,
  type ReprMeta,
} from "./representation";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HydratableBook = {
  id: string;
  openlibrary_work_key: string | null;
  isbn: string | null;
  hydrated_at: string | null;
  repr_meta: Json | null;
  wikidata_id: string | null;
  title: string | null;
  author: string | null;
  // Solo para no proponerle a la RPC unas páginas que ya tiene: `total_pages` es
  // fill-only allí, así que mandarlas cuando la fila ya las trae es ruido.
  total_pages: number | null;
};

// Máximo de llamadas a Google Books por evaluación (spec §4): es el
// enriquecedor, no la fuente — dos huecos como mucho (sinopsis y portada) y a
// otra cosa. Sin este tope, una obra sin candidatas españolas gastaría una
// llamada por campo en cada visita.
const MAX_GOOGLE_BOOKS_CALLS = 2;

// PELDAÑO 2 de la escalera de hidratación, versión 3 (spec 2026-08-26): la
// primera vez que se abre la ficha de una obra —y luego, como mucho una vez al
// mes mientras quede algo mejorable— se elige su REPRESENTACIÓN: título,
// portada y sinopsis en el mejor idioma disponible, español → inglés → el que
// haya.
//
// Tres fuentes, por este orden de confianza:
//  1. Ediciones reales de OpenLibrary (fetchRepresentationCandidates): la mejor
//     edición española y la mejor inglesa, en vivo y sin persistir.
//  2. Wikidata vía Inventaire: labels multilingües y el QID, que es el ancla de
//     identidad inter-idioma. Solo se acepta la entidad cuyo AUTOR casa.
//  3. Google Books: solo para los huecos que quedan (sinopsis española, sobre
//     todo), acotado a MAX_GOOGLE_BOOKS_CALLS.
//
// Cada campo se guarda etiquetado con su idioma y su procedencia (`repr_meta`),
// y la RPC es fill-or-upgrade: rellena huecos, mejora idioma, y NUNCA pisa lo
// que un colaborador escribió a mano.
//
// Hermano de ensureItemEnriched (créditos) y ensureBookEditions (tiradas), con
// el mismo contrato: idempotente, guarded, y NUNCA lanza — un fallo de una API
// externa no puede tumbar el render de la ficha.
export async function ensureBookHydrated(
  supabase: SupabaseServerClient,
  book: HydratableBook
): Promise<void> {
  try {
    const meta = (book.repr_meta ?? null) as ReprMeta | null;
    if (!needsRepresentationReview(book.hydrated_at, meta)) return;

    let workKey = book.openlibrary_work_key;

    // Sin work key propia (alta manual, import antiguo): se intenta resolver por
    // ISBN y se guarda, para no repetir la resolución en cada visita.
    //
    // El error del update se ignora a propósito, y desde #730 hay uno más que
    // ignorar: 23505, cuando esa work key ya la tiene otra fila del catálogo
    // (índice único). En los dos casos la hidratación sigue con la key resuelta
    // en memoria; lo único que se pierde es el atajo de no re-resolverla.
    if (!workKey && book.isbn) {
      workKey = await resolveWorkKey(book.isbn);
      if (workKey) {
        await supabase
          .from("books")
          .update({ openlibrary_work_key: workKey })
          .eq("id", book.id);
      }
    }

    // Sin work key ya NO se abandona: la obra puede seguir siendo enriquecible
    // por título (Google Books) o reconciliable por Wikidata. Lo que antes se
    // hacía aquí —marcarla hidratada y punto— la dejaba vacía para siempre.
    const work = workKey ? await fetchWork(workKey) : null;
    // La API falló o tardó: NO se toca nada, se reintenta en la siguiente
    // visita. Mientras tanto, la ficha se pinta con lo que haya.
    if (workKey && !work) return;

    // El nombre del autor NO viene en el work: el work lista claves, y el nombre
    // está en la ficha de cada autor. Se resuelve solo el primero —`books.author`
    // es un texto único, y el reparto completo lo escribe ensureItemEnriched en
    // `credits`— y solo si la obra declara alguno. La llamada la sirve la caché
    // de fetch de Next casi siempre: ensureItemEnriched pide esa misma ficha.
    const authorKey = work?.authorKeys[0];
    const author =
      (authorKey ? (await fetchOpenLibraryAuthorByKey(authorKey))?.name : null) ??
      book.author ??
      null;
    const titleForLookups = work?.title ?? book.title ?? null;

    // Candidatas por idioma, en paralelo (spec §2): ediciones de OL en vivo y
    // entidad de Wikidata. Google Books va DESPUÉS y solo si quedan huecos.
    const [candidates, entities] = await Promise.all([
      workKey
        ? fetchRepresentationCandidates(workKey)
        : Promise.resolve({ es: null, en: null, pagesMedian: null }),
      titleForLookups ? searchInventaireEntities(titleForLookups) : Promise.resolve([]),
    ]);

    // Entidad fiable = con el autor verificado (spec §6). Sin autor conocido no
    // se acepta ninguna: un título puede repetirse entre obras distintas, y de
    // aquí sale el QID, que es identidad — un QID equivocado FUSIONA dos obras.
    const entity =
      entities.find((candidate) =>
        candidate.authorNames.some((name) => authorMatches(name, author))
      ) ?? null;
    const qid = entity ? qidFromUri(entity.uri) : null;

    const fields: HydrateFields = {};
    // El ORDEN de estas listas es la política ES → EN → otro: gana la primera
    // opción que tenga valor (pickField).
    pickField(fields, "title", [
      { value: candidates.es?.title, lang: "es", source: "openlibrary" },
      { value: entity?.labels.es, lang: "es", source: "wikidata" },
      { value: candidates.en?.title, lang: "en", source: "openlibrary" },
      { value: entity?.labels.en, lang: "en", source: "wikidata" },
      { value: work?.title, lang: "other", source: "openlibrary" },
    ]);
    pickField(fields, "cover", [
      { value: candidates.es?.coverUrl, lang: "es", source: "openlibrary" },
      { value: candidates.en?.coverUrl, lang: "en", source: "openlibrary" },
      { value: work?.coverUrl, lang: "other", source: "openlibrary" },
    ]);
    // La obra manda; si no trae sinopsis, se cae a la de alguna de sus ediciones
    // (una llamada extra, y solo en este caso).
    const synopsis =
      work?.description ?? (workKey ? await fetchFirstEditionDescription(workKey) : null);
    pickField(fields, "synopsis", [
      { value: synopsis, lang: synopsisLang(synopsis), source: "openlibrary" },
    ]);

    // Google Books por campo, y solo si el mejor candidato quedó vacío o con
    // rango peor que inglés. La consulta es la misma para los dos campos, así
    // que se memoiza: el tope de MAX_GOOGLE_BOOKS_CALLS sigue valiendo, pero en
    // la práctica se gasta una sola llamada.
    const volumeByLang = new Map<string, GoogleVolume | null>();
    let gbCalls = 0;
    let gbVolumeId: string | null = null;
    for (const [field, wanted] of [
      ["synopsis", "es"],
      ["cover", "es"],
    ] as const) {
      if (!titleForLookups) break;
      const current = fields[field];
      if (current && langRank(current.lang) <= 1) continue;

      let volume = volumeByLang.get(wanted) ?? null;
      if (!volumeByLang.has(wanted)) {
        if (gbCalls >= MAX_GOOGLE_BOOKS_CALLS) break;
        volume = await findBestVolume(titleForLookups, author, wanted);
        gbCalls += 1;
        volumeByLang.set(wanted, volume);
      }
      if (!volume) continue;

      gbVolumeId = gbVolumeId ?? volume.volumeId;
      const value = field === "synopsis" ? volume.synopsis : volume.coverUrl;
      if (value) fields[field] = { value, lang: wanted, source: "google_books" };
    }

    const genres = work ? mapSubjectsToGenres(work.subjects) : [];
    // La mediana de páginas puede caer en .5 (número par de ediciones) y el
    // parámetro de la RPC es `integer`: sin redondear, PostgREST rechaza la
    // llamada entera.
    const pagesMedian =
      book.total_pages == null && candidates.pagesMedian != null
        ? Math.round(candidates.pagesMedian)
        : null;

    // OJO: la RPC es de service_role, NO de `authenticated` (perdió el execute
    // al pasar de fill-only a fill-or-upgrade: con el bypass de `app.hydrating`,
    // cualquier usuario podría haber reescrito el catálogo COMPARTIDO —
    // precedente #725). El cliente de la petición devuelve 42501 aquí, y como el
    // error solo se registra, la hidratación quedaba rota EN SILENCIO (#871).
    // Las lecturas y los updates de columnas técnicas de abajo siguen yendo con
    // el cliente del llamante: son null → valor y están permitidos.
    const { error } = await createServiceRoleClient().rpc("hydrate_book", {
      p_book_id: book.id,
      p_fields: Object.keys(fields).length > 0 ? (fields as Json) : undefined,
      p_genres: genres.length > 0 ? genres : undefined,
      p_published_year: work?.firstPublishYear ?? undefined,
      p_total_pages: pagesMedian ?? undefined,
      p_pages_source: pagesMedian != null ? "openlibrary" : undefined,
      p_wikidata_id: qid ?? undefined,
      // p_author es OBLIGATORIO pasarlo: la RPC marca `hydrated_at` igual, así
      // que un libro hidratado sin autor se queda sin él PARA SIEMPRE (el
      // curador no reintenta lo ya marcado). Es el defecto de #730.
      p_author: author ?? undefined,
    });

    if (error) console.error("hydrate_book rpc failed", { bookId: book.id, error });

    if (gbVolumeId) {
      // null → valor: permitido para el cliente de la petición.
      await supabase
        .from("books")
        .update({ google_books_volume_id: gbVolumeId })
        .eq("id", book.id)
        .is("google_books_volume_id", null);
    }
  } catch (error) {
    console.error("ensureBookHydrated failed", { bookId: book.id, error });
  }
}
