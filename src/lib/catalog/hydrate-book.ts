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
  langRank,
  needsRepresentationReview,
  pickField,
  synopsisLang,
  toReprLang,
  type HydrateFields,
  type ReprMeta,
} from "./representation";
import { resolveQid } from "./wikidata-reconcile";
import { isVolumeOnlyResult, type SearchResult } from "./types";

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

// I-2: el shell con el que nace una fila de libro creada desde un resultado de
// búsqueda. Vive AQUÍ y no en `buscar/actions.ts` (que es "use server", donde
// cada export se convierte en un endpoint público) para que el invariante de
// C1 tenga un test: `title` y `author` van a `null` a propósito, NUNCA al
// `result` que llega del navegador.
//
// `openCatalogItem` y `addToLibrary` son server actions: el `SearchResult`
// que reciben lo deserializa el servidor de lo que manda EL NAVEGADOR, así que
// ninguno de sus campos de texto libre es un dato de proveedor fiable — son
// entrada de usuario con forma de resultado de búsqueda (envenenamiento de
// catálogo de #674). `findOrCreateCatalogItem` ya se queda solo con
// `p_external_id` por la misma razón (ver su cabecera).
//
// Los dos que SÍ se leen de `result`, y por qué son seguros:
//  - `openlibrary_work_key: result.externalId` es la identidad con la que
//    `findOrCreateCatalogItem` creó o localizó esta misma fila: el cliente
//    solo puede dirigir la hidratación a la obra que él mismo pidió abrir.
//    Se normaliza a `null` cuando viene vacío, que es lo que de verdad tiene
//    la fila en el camino GB-only — un `""` aquí sería mentir sobre el estado.
//  - `isbn: result.matchedIsbn` solo se propaga cuando el resultado NO es
//    GB-only (`isVolumeOnlyResult`). No es un adorno: ese ISBN es lo único que
//    lee `ensureBookHydrated` en la rama `if (!workKey && book.isbn)`, que
//    RESUELVE UNA WORK KEY Y LA ESTAMPA en la fila.
//
//    C2 (esta misma rama): el comentario que había aquí declaraba esa rama
//    «inalcanzable mientras `externalId` no venga vacío» — y el alta GB-only
//    de `search.ts` devuelve `externalId: ""` POR CONSTRUCCIÓN, así que la
//    precondición era literalmente falsa desde el mismo commit que la escribió.
//    Con ella falsa, el navegador controlaba a la vez `googleVolumeId` (que
//    elige la FILA) y `matchedIsbn` (que elige la OBRA), sin que el servidor
//    cruzase los dos: work key equivocada ⇒ título, autor, portada, sinopsis,
//    géneros y **QID** re-derivados de otra obra, y el barrido de
//    reconciliación agrupa por QID y llama a `merge_book_into`, que BORRA
//    filas. Clase #674, P0 reabierto dos veces — las dos porque un comentario
//    daba el problema por imposible.
//
//    No se pierde nada real: si estamos en GB-only es precisamente porque Open
//    Library NO conoce ese ISBN, así que `resolveWorkKey` habría devuelto null.
//
// `title`/`author` no tienen ese blindaje (se usan directos: `author` acaba en
// `p_author`, fill-only sobre una fila recién nacida sin autor, así que
// SIEMPRE se aceptaría; `title` es la consulta que resuelve el QID de
// Wikidata, y un QID equivocado FUSIONA dos obras) — por eso van a `null` y no
// al dato del navegador. No se pierde nada real: aquí se conoce el
// `openlibrary_work_key`, así que `fetchWork` trae título y autor de VERDAD
// dentro de la propia `ensureBookHydrated`.
export function bookShellFromSearchResult(itemId: string, result: SearchResult): HydratableBook {
  return {
    id: itemId,
    openlibrary_work_key: result.externalId || null,
    isbn: isVolumeOnlyResult(result) ? null : (result.matchedIsbn ?? null),
    hydrated_at: null,
    // La fila acaba de nacer vacía (#674): no tiene representación previa que
    // mejorar ni QID.
    repr_meta: null,
    wikidata_id: null,
    title: null,
    author: null,
    total_pages: null,
  };
}

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
//     identidad inter-idioma. Solo se acepta la entidad cuyo AUTOR **y** cuyo
//     TÍTULO casan, vía `resolveQid` (#914).
//  3. Google Books: solo para los huecos que quedan (sinopsis española, sobre
//     todo), acotado a MAX_GOOGLE_BOOKS_CALLS.
//
// Cada campo se guarda etiquetado con su idioma y su procedencia (`repr_meta`),
// y la RPC es fill-or-upgrade: rellena huecos, mejora idioma, y NUNCA pisa lo
// que un colaborador escribió a mano.
//
// Hermano de ensureItemEnriched (créditos), con el mismo contrato:
// idempotente, guarded, y NUNCA lanza — un fallo de una API externa no puede
// tumbar el render de la ficha.
export async function ensureBookHydrated(
  supabase: SupabaseServerClient,
  book: HydratableBook
): Promise<void> {
  try {
    const meta = (book.repr_meta ?? null) as ReprMeta | null;
    if (!needsRepresentationReview(book.hydrated_at, meta, book.wikidata_id)) return;

    let workKey = book.openlibrary_work_key;

    // Sin work key propia (alta manual, import antiguo): se intenta resolver por
    // ISBN y se guarda, para no repetir la resolución en cada visita.
    //
    // El error del update se ignora a propósito, y desde #730 hay uno más que
    // ignorar: 23505, cuando esa work key ya la tiene otra fila del catálogo
    // (índice único). En los dos casos la hidratación sigue con la key resuelta
    // en memoria; lo único que se pierde es el atajo de no re-resolverla.
    //
    // El `.is("openlibrary_work_key", null)` es la SEGUNDA mitad de C2, y es la
    // que no depende de que el llamante nos pase un shell honesto: el trigger
    // `enforce_catalog_edit_collaborator_only` solo protege esta columna cuando
    // `old.openlibrary_work_key is not null`, así que la transición null→valor
    // está abierta a cualquier `authenticated` (verificado en dev). Sin este
    // filtro bastaba con que el shell viniera con la key en null —o con `""`—
    // para reasignarle la obra a una fila que YA tenía la suya. Con él, la
    // condición la evalúa la BASE sobre la fila real, no la memoria del proceso.
    if (!workKey && book.isbn) {
      workKey = await resolveWorkKey(book.isbn);
      if (workKey) {
        await supabase
          .from("books")
          .update({ openlibrary_work_key: workKey })
          .eq("id", book.id)
          .is("openlibrary_work_key", null);
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

    // Entidad fiable = autor verificado **Y título corroborado** (spec §6). De
    // aquí sale el QID, que es IDENTIDAD: `wikidata-collapse` lo respeta por
    // encima del match de título de hoy, y `scripts/reconcile-wikidata.ts`
    // agrupa por él y llama a `merge_book_into`, que BORRA filas de `books`. Un
    // QID equivocado escrito aquí es la semilla con la que un barrido posterior
    // destruye la obra correcta.
    //
    // #914: hasta aquí la regla era «la primera entidad cuyo autor case», sin
    // mirar el título — que es EXACTAMENTE la regla que se midió y se descartó
    // en el barrido (ver la cabecera de `resolveQid`). Como
    // `searchInventaireEntities` busca en difuso, para «Shadows Beneath»
    // devuelve también «Shadows of Self»: mismo autor, otra obra, y `find` se
    // quedaba con la primera. Contra dev daba 2 identidades erróneas de 13.
    //
    // Se REUSA `resolveQid` en vez de escribir una tercera variante de la
    // comparación (ya hay dos `authorMatches` en este directorio, y confundirlos
    // fue justo lo que dejó pasar este fallo). Exige las tres cosas: autor,
    // título contra los labels multilingües (por conjunto de palabras) y QID no
    // ambiguo.
    //
    // ORDEN: primero el QID y de ahí la entidad, no al revés — `entity` se sigue
    // usando abajo para `labels.es` / `labels.en` en `pickField`, y esos labels
    // solo valen si vienen de la entidad que de verdad identifica a esta obra.
    //
    // La regla es más estricta, así que algunas obras se quedan sin QID donde
    // antes recibían uno (equivocado). Es el lado correcto por el que fallar
    // —«ante la duda, no fusionar»— y no es un estado terminal:
    // `needsRepresentationReview` trata la ausencia de QID como hueco
    // reevaluable, así que se reintenta pasado el cooldown.
    const qid = resolveQid({ title: titleForLookups, author }, entities);
    const entity = qid ? (entities.find((e) => qidFromUri(e.uri) === qid) ?? null) : null;

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

    // Google Books por campo, y solo si el mejor candidato NO es ya español.
    //
    // #886: el gate era `langRank(current.lang) <= 1`, o sea que saltaba
    // también con el campo en INGLÉS — y ahí cae justo la sinopsis inglesa, que
    // es el caso COMÚN (`synopsisLang` etiqueta `en` toda sinopsis de OL, y OL
    // sí suele traer descripción). Consecuencia: Google Books no llegaba nunca
    // al único campo para el que la spec lo contrata («OL casi nunca tiene
    // sinopsis en español; GB con langRestrict=es es el proveedor realista»), y
    // la reevaluación de cada 30 días era un NO-OP demostrable —
    // `needsRepresentationReview` marcaba mejorable todo lo que no fuera
    // español (rango > 0), se gastaban ~10 peticiones externas por libro y mes,
    // y por construcción no podía cambiar nada. La base ya aceptaba la mejora:
    // para en→es la RPC evalúa `0 >= 1` = falso, o sea que ESCRIBE. Era solo
    // este gate el que se negaba a pedirlo.
    //
    // La consulta es la misma para los dos campos, así que se memoiza. OJO
    // (m5): con las dos entradas del bucle pidiendo `wanted: "es"` hay UNA sola
    // clave en el Map, así que `gbCalls` nunca pasa de 1 y el tope de
    // MAX_GOOGLE_BOOKS_CALLS es hoy INALCANZABLE. No es un bug —el tope es la
    // red de seguridad, no el mecanismo—, pero quien añada un idioma al bucle o
    // "arregle" el memo estará duplicando el presupuesto de llamadas sin
    // enterarse. Ese tope es lo único que lo frena.
    const volumeByLang = new Map<string, GoogleVolume | null>();
    let gbCalls = 0;
    let gbVolumeId: string | null = null;
    for (const [field, wanted] of [
      ["synopsis", "es"],
      ["cover", "es"],
    ] as const) {
      if (!titleForLookups) break;
      const current = fields[field];
      if (current && langRank(current.lang) === 0) continue;

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
      if (!value) continue;

      // I3: `langRestrict` es una PISTA, no una garantía — Google Books cuela
      // volúmenes en otro idioma. Se etiqueta con el idioma REAL que declara el
      // volumen, no con el pedido. Etiquetar de `es` una sinopsis inglesa la
      // sella en rango 0, que es un estado TERMINAL (la RPC solo acepta mejora
      // ESTRICTA): no se corregiría nunca, y `needsRepresentationReview`
      // dejaría además de marcarla mejorable. Es el modo de congelación de #730
      // por una puerta nueva.
      //
      // Se ETIQUETA en vez de DESCARTAR el volumen: un volumen inglés sigue
      // sirviendo para rellenar un hueco vacío, y con su idioma real declarado
      // la RPC ya sabe que se puede mejorar más adelante. Lo que no vale es
      // mentir sobre el idioma.
      //
      // I-1: sin `language` declarado NO se asume `wanted` ("es") — eso es
      // justo la mentira de arriba, solo que con el idioma PEDIDO en vez del
      // real. `toReprLang(null)` cae a "other" (rango 2, el que NO pisa nada):
      // rellena un hueco vacío pero nunca sella rango 0. `es` es TERMINAL (la
      // RPC solo acepta mejora estricta), así que etiquetar aquí un volumen sin
      // idioma declarado como español congelaría PARA SIEMPRE una sinopsis que
      // bien podría ser inglesa — la propia mapVolume de Google Books deja
      // `language: null` con relativa frecuencia. En un estado terminal se
      // falla hacia el lado recuperable.
      const lang = toReprLang(volume.language);
      // Y solo se propone si MEJORA de verdad: cambiar una sinopsis inglesa de
      // OL por otra inglesa de GB no es una mejora (la RPC la rechazaría por no
      // ser estricta) y de paso perdería la procedencia mejor.
      if (current && langRank(lang) >= langRank(current.lang)) continue;
      fields[field] = { value, lang, source: "google_books" };
    }

    const genres = work ? mapSubjectsToGenres(work.subjects) : [];
    // La mediana de páginas puede caer en .5 (número par de ediciones) y el
    // parámetro de la RPC es `integer`: sin redondear, PostgREST rechaza la
    // llamada entera.
    //
    // m9, y NO se arregla a propósito: si la fila ya trae `total_pages` pero
    // `repr_meta` no tiene entrada `pages`, esa procedencia se queda vacía para
    // siempre (la RPC solo estampa `pages` dentro de la rama `total_pages is
    // null`). Rellenarla exigiría estampar `openlibrary` sobre un número cuyo
    // origen NO conocemos —pudo venir de la edición que identificó el usuario,
    // de un import o de una curación—, o sea INVENTAR la procedencia, que es
    // peor que dejar el hueco: la procedencia es un hecho verificable, no una
    // heurística (mismo criterio que la lista blanca de `source` en la RPC).
    const pagesMedian =
      book.total_pages == null && candidates.pagesMedian != null
        ? Math.round(candidates.pagesMedian)
        : null;

    // OJO: la RPC es de service_role, NO de `authenticated` (perdió el execute
    // al pasar de fill-only a fill-or-upgrade: con el bypass de `app.hydrating`,
    // cualquier usuario podría haber reescrito el catálogo COMPARTIDO —
    // precedente #725). El cliente de la petición devuelve 42501 aquí, y como el
    // error solo se registra, la hidratación quedaba rota EN SILENCIO (#871).
    //
    // El privilegio se acota a las escrituras del CATÁLOGO COMPARTIDO: esta RPC
    // y el sello de `google_books_volume_id` de abajo. Las lecturas y el update
    // de `openlibrary_work_key` (null → valor, con grant de `authenticated`)
    // siguen yendo con el cliente del llamante, que es quien lleva la identidad
    // del usuario y a quien le aplica RLS.
    const admin = createServiceRoleClient();

    const { error } = await admin.rpc("hydrate_book", {
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
      // C1: NO es "null → valor y por tanto permitido". `authenticated` no
      // tiene grant de UPDATE sobre esta columna —nace sin él a propósito
      // (`20260882`), y así lo dice la superficie 6 de docs/DRIFT-CHECK.md—,
      // así que con el cliente de la petición esto devolvía **42501 permission
      // denied for table books** SIEMPRE. Y el `await` no destructuraba
      // `error`: fallaba sin una sola línea de log, que es exactamente el modo
      // de fallo de #871 repetido dos líneas más abajo del arreglo de #871.
      // Medido en dev: 397 filas en `books`, 397 con la columna a null.
      //
      // Por qué NO se arregla concediendo el grant: esta columna es el único
      // ancla entre una obra nacida en OpenLibrary y su volumen de Google
      // Books. Si se queda vacía, un ISBN que OL no conoce y que no esté en
      // `book_editions` no encuentra la obra existente y
      // `register_catalog_item_by_volume` ACUÑA UNA OBRA DUPLICADA — justo lo
      // que esta rama existe para eliminar. Darle el grant al cliente sería
      // además abrir a cualquier autenticado un identificador del catálogo
      // compartido con índice único, en contra de todo el endurecimiento de la
      // rama. Se escribe con service_role, como la RPC.
      const { error: volumeIdError } = await admin
        .from("books")
        .update({ google_books_volume_id: gbVolumeId })
        .eq("id", book.id)
        .is("google_books_volume_id", null);

      if (volumeIdError) {
        console.error("google_books_volume_id update failed", {
          bookId: book.id,
          error: volumeIdError,
        });
      }
    }
  } catch (error) {
    console.error("ensureBookHydrated failed", { bookId: book.id, error });
  }
}
