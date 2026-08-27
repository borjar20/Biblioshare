"use server";

import { createClient, createPublicClient } from "@/lib/supabase/server";
import { fetchLiveWorkEditions } from "@/lib/catalog/openlibrary/editions";
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
  | { ok: false; reason: "unauthenticated" | "invalidIsbn" | "registerFailed" | "generic" };

// Cuántas candidatas se enseñan. Es una lista para ELEGIR de un vistazo, no un
// catálogo: pasadas de aquí el usuario ya no lee, y cada fila cuesta una
// portada. Quien no ve la suya tiene el camino exacto (escanear el ISBN)
// justo encima.
const MAX_CANDIDATES = 30;

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
// Cliente SIN sesión: `books` y `book_editions` son `SELECT USING (true)`, así
// que el resultado no depende de quién mira (regla #437).
//
// Nunca lanza: sin work key, sin red o con OpenLibrary caída, la lista sale
// vacía y el selector enseña su estado vacío.
export async function fetchEditionCandidates(bookId: string): Promise<EditionCandidate[]> {
  const supabase = createPublicClient();

  const { data: book } = await supabase
    .from("books")
    .select("openlibrary_work_key")
    .eq("id", bookId)
    .maybeSingle();

  const workKey = book?.openlibrary_work_key;
  // Sin work key no hay a qué obra de OpenLibrary preguntarle: se sale ANTES
  // de tocar la red, no después de una llamada condenada a fallar.
  if (!workKey) return [];

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
    candidates.push({
      isbn: edition.isbn,
      label: edition.label,
      publisher: edition.publisher,
      year: edition.year,
      pages: edition.totalPages,
      coverUrl: edition.coverUrl,
      language: edition.language,
    });
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
// El `candidate` llega del cliente y por tanto NO es de fiar (una server
// action es un endpoint POST público): el ISBN se revalida aquí, y la RPC lo
// vuelve a validar del lado del servidor con su dígito de control. Editorial,
// año y páginas los sanea la propia RPC (`sane_int`), y `created_by` lo firma
// con `auth.uid()`, no con nada que venga en esta llamada.
export async function chooseEditionCandidate(
  passId: string,
  bookId: string,
  candidate: EditionCandidate
): Promise<ChooseEditionResult> {
  const isbn = normalizeIsbn(String(candidate?.isbn ?? ""));
  if (!isbn || !isValidIsbnCheckDigit(isbn)) return { ok: false, reason: "invalidIsbn" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Sin sesión la RPC haría `raise exception 'auth required'`; se corta antes
  // para devolver un motivo legible en vez de un fallo genérico de Postgres.
  if (!user) return { ok: false, reason: "unauthenticated" };

  const label = candidate.label?.trim().slice(0, 60);

  const { data: registeredId, error } = await supabase.rpc("register_book_edition", {
    p_book_id: bookId,
    p_isbn: isbn,
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
