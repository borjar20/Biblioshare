"use server";

import { createClient, createPublicClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  fetchLiveWorkEditions,
  type OpenLibraryEdition,
  EDITIONS_PAGE_SIZE,
  MAX_REPRESENTATION_PAGES,
} from "@/lib/catalog/openlibrary/editions";
import { isValidIsbnCheckDigit, normalizeIsbn } from "@/lib/catalog/isbn";
import { setPassEdition } from "@/lib/passes/actions";

// Una tirada que OpenLibrary CONOCE pero que en esta base de datos todavía no
// existe: se enseña en el selector y solo se persiste si el usuario la elige.
// No lleva `id` a propósito — no lo tiene, porque no hay fila.
export type EditionCandidate = {
  isbn: string;
  label: string;
  publisher: string | null;
  year: number | null;
  pages: number | null;
  coverUrl: string | null;
  language: string | null;
};

export type ChooseEditionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "invalidIsbn"
        | "unknownCandidate"
        | "registerFailed"
        | "generic";
    };

// Cuántas candidatas se enseñan. Es una lista para ELEGIR de un vistazo, no un
// catálogo: pasadas de aquí el usuario ya no lee, y cada fila cuesta una
// portada. Quien no ve la suya tiene el camino exacto (escanear el ISBN)
// justo encima.
const MAX_CANDIDATES = 30;

// Tope del escaneo con el que el SERVIDOR re-deriva la candidata elegida
// (`chooseEditionCandidate`). Es a propósito mucho mayor que MAX_CANDIDATES:
// tiene que ser un SUPERCONJUNTO de lo que el selector pudo enseñar, porque
// aquel escanea con holgura (el tope más las ya persistidas) y esta búsqueda
// no excluye nada. 200 es lo máximo que `fetchLiveWorkEditions` llega a mirar
// (2 páginas de 100), así que cualquier candidata que se haya pintado cae
// dentro.
// DERIVADO, no fijado a mano: tiene que ser un superconjunto de lo que el picker
// llegó a enseñar, y eso lo decide `fetchRepresentationCandidates`. Escribir 200
// aquí funcionaba hasta que alguien subiera las páginas de aquel lado: entonces
// habría candidatas visibles que la re-derivación no encontraría, y el usuario
// vería `unknownCandidate` al elegirlas. Atarlo al origen quita la trampa.
const MAX_DERIVATION_SCAN = MAX_REPRESENTATION_PAGES * EDITIONS_PAGE_SIZE;

function toCandidate(edition: OpenLibraryEdition): EditionCandidate {
  return {
    isbn: edition.isbn,
    label: edition.label,
    publisher: edition.publisher,
    year: edition.year,
    pages: edition.totalPages,
    coverUrl: edition.coverUrl,
    language: edition.language,
  };
}

// La obra de OpenLibrary a la que pertenece este libro, o `null` si no se le
// conoce ninguna. Cliente SIN sesión: `books` es `SELECT USING (true)`, así
// que el resultado no depende de quién mira (regla #437).
async function workKeyFor(bookId: string): Promise<string | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("books")
    .select("openlibrary_work_key")
    .eq("id", bookId)
    .maybeSingle();
  return data?.openlibrary_work_key ?? null;
}

// Las ediciones que OpenLibrary da para la obra de este libro, EN VIVO y sin
// escribir una sola fila.
//
// Es el reverso del modelo viejo: antes abrir una ficha bajaba cientos de
// ediciones y las persistía todas, y `book_editions` acababa llena de tiradas
// que nadie tenía en la mano. Ahora la ficha solo lee lo que alguien
// identificó, y esto —que sí llama a OpenLibrary— corre únicamente cuando el
// usuario despliega «Más ediciones». De ahí que NO tenga `use cache` y de ahí
// que no escriba: la escritura es `chooseEditionCandidate`, y la dispara un
// clic explícito.
//
// Exige sesión. No es por privacidad —lo que devuelve es público, y por eso lo
// lee un cliente sin sesión (regla #437)— sino por CUOTA: al exportarse de un
// módulo `"use server"` esto es un endpoint POST abierto, y cada llamada
// dispara hasta 2 peticiones a OpenLibrary contra la cuota de nuestra IP. La
// UI solo lo invoca desde un pase abierto, que ya está autenticado.
//
// Nunca lanza: sin sesión, sin work key, sin red o con OpenLibrary caída, la
// lista sale vacía y el selector enseña su estado vacío.
export async function fetchEditionCandidates(bookId: string): Promise<EditionCandidate[]> {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return [];

  const workKey = await workKeyFor(bookId);
  // Sin work key no hay a qué obra de OpenLibrary preguntarle: se sale ANTES
  // de tocar la red, no después de una llamada condenada a fallar.
  if (!workKey) return [];

  const supabase = createPublicClient();

  // Las que ya están en la ficha (bloque 1 del selector). Si no se excluyeran,
  // la misma edición aparecería dos veces en dos bloques distintos y el
  // usuario no sabría cuál de las dos elegir.
  const { data: persistedRows } = await supabase
    .from("book_editions")
    .select("isbn")
    .eq("book_id", bookId)
    .not("isbn", "is", null);

  // Normalizado en los dos lados: lo persistido puede venir con guiones (un
  // colaborador lo tecleó a mano vía `createEdition`, que no normaliza),
  // mientras que lo de OpenLibrary ya sale de `normalizeIsbn`. Comparar en
  // crudo dejaría colar duplicados con distinta puntuación.
  const persisted = new Set(
    (persistedRows ?? [])
      .map((row) => (row.isbn ? normalizeIsbn(row.isbn) : null))
      .filter((isbn): isbn is string => isbn !== null)
  );

  // Se escanea con HOLGURA (el tope más las ya persistidas) porque el corte de
  // MAX_CANDIDATES se aplica DESPUÉS de excluirlas: pedir 30 en crudo dejaría
  // en pantalla 30 menos las repetidas, y justo los libros con más ediciones
  // identificadas —los que más falta hacen— serían los que menos ofrecerían.
  const editions = await fetchLiveWorkEditions(workKey, MAX_CANDIDATES + persisted.size);

  const candidates: EditionCandidate[] = [];
  for (const edition of editions) {
    if (persisted.has(edition.isbn)) continue;
    candidates.push(toCandidate(edition));
    if (candidates.length === MAX_CANDIDATES) break;
  }

  return candidates;
}

// El único punto en el que una candidata se convierte en una fila: el usuario
// ha dicho «esta es la mía». Registra la edición y la deja apuntada en su pase.
//
// Devuelve `{ok:false, reason}` y NO lanza: en producción Next redacta el
// mensaje de un `Error` que cruza la frontera de una server action, así que
// lanzar equivale a enseñar «algo ha ido mal» sin decir qué.
//
// **Del cliente llega SOLO el ISBN.** Una server action es un endpoint POST
// público. Si la editorial, la portada o la etiqueta viajaran desde el
// navegador, cualquier usuario autenticado podría escribir metadatos
// arbitrarios en `book_editions` —el catálogo COMUNITARIO— de cualquier libro,
// y `formatEditionDetails` se los pintaría a todo el mundo. Antes de este
// selector, meter metadatos a mano exigía ser colaborador (`createEdition`).
//
// Por eso el servidor RE-DERIVA la candidata: vuelve a pedirle a OpenLibrary
// las ediciones de esta obra y casa por ISBN normalizado. Cuesta una llamada
// extra a OpenLibrary —iniciada por el usuario y poco frecuente, solo al
// elegir— a cambio de que ni un metadato del navegador toque el catálogo. Si
// el ISBN no aparece entre las ediciones de la obra, se rechaza.
//
// Lo que sí se valida aquí igualmente: el ISBN (formato y dígito de control,
// que la RPC vuelve a comprobar del lado del servidor) y la sesión.
// `created_by` procede del usuario validado aquí; la RPC nueva solo permite
// execute a service_role. El antiguo alta manual exige collaborator/admin.
//
// Ojo con lo que la RPC NO hace, para no confiarle de más: `sane_int` se
// aplica SOLO a `p_year` y `p_pages`; `p_publisher` y `p_cover_url` entran
// crudos. Hoy da igual porque los tres los pone OpenLibrary, no el cliente —
// pero es exactamente la razón por la que no pueden volver a venir del
// navegador.
export async function chooseEditionCandidate(
  passId: string,
  bookId: string,
  candidateIsbn: string
): Promise<ChooseEditionResult> {
  const isbn = typeof candidateIsbn === "string" ? normalizeIsbn(candidateIsbn) : null;
  if (!isbn || !isValidIsbnCheckDigit(isbn)) return { ok: false, reason: "invalidIsbn" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Sin sesión la RPC haría `raise exception 'auth required'`; se corta antes
  // para devolver un motivo legible en vez de un fallo genérico de Postgres.
  if (!user) return { ok: false, reason: "unauthenticated" };

  const workKey = await workKeyFor(bookId);
  const derived = workKey
    ? (await fetchLiveWorkEditions(workKey, MAX_DERIVATION_SCAN)).find(
        (edition) => edition.isbn === isbn
      )
    : undefined;

  // Ni el libro tiene obra conocida, ni OpenLibrary ofrece esa tirada, ni
  // OpenLibrary respondió. En los tres casos no hay metadatos de confianza que
  // escribir, y adivinarlos con lo que mandó el cliente es justo lo que este
  // camino existe para impedir.
  if (!derived) return { ok: false, reason: "unknownCandidate" };

  const candidate = toCandidate(derived);
  // `label` sale de `labelFromFormat`, que ya devuelve una de cuatro cadenas
  // fijas; el recorte es cinturón por si esa lista crece con algo largo.
  const label = candidate.label.trim().slice(0, 60);

  const { data: registeredId, error } = await createServiceRoleClient().rpc("register_verified_book_edition", {
    p_book_id: bookId,
    p_created_by: user.id,
    p_isbn: candidate.isbn,
    p_label: label || undefined,
    p_publisher: candidate.publisher ?? undefined,
    p_year: candidate.year ?? undefined,
    p_pages: candidate.pages ?? undefined,
    p_cover_url: candidate.coverUrl ?? undefined,
  });

  if (error) {
    console.error("chooseEditionCandidate rpc failed", { bookId, isbn, error });
    return { ok: false, reason: "registerFailed" };
  }

  let editionId: string | null = registeredId ?? null;

  // La RPC es idempotente (`on conflict do nothing`) y en el conflicto devuelve
  // NULL. Eso NO es un fallo: significa que otro usuario ya identificó esa
  // misma tirada mientras esta lista estaba abierta. La edición existe, solo
  // hay que encontrarla por el índice único (book_id, isbn) y seguir. Tratarlo
  // como error dejaría al usuario sin poder elegir precisamente la edición más
  // común del libro.
  if (!editionId) {
    const { data: existing } = await supabase
      .from("book_editions")
      .select("id")
      .eq("book_id", bookId)
      .eq("isbn", isbn)
      .maybeSingle();
    editionId = existing?.id ?? null;
  }

  if (!editionId) {
    console.error("chooseEditionCandidate: sin id tras registrar", { bookId, isbn });
    return { ok: false, reason: "registerFailed" };
  }

  try {
    // `setPassEdition` filtra por `user_id`: nadie puede identificar el pase de
    // otro aunque mande un passId ajeno. También revalida la ficha, así que la
    // edición recién creada aparece ya en el bloque de persistidas.
    await setPassEdition(passId, "book", bookId, editionId);
  } catch (setError) {
    console.error("chooseEditionCandidate setPassEdition failed", { passId, setError });
    return { ok: false, reason: "generic" };
  }

  return { ok: true };
}
