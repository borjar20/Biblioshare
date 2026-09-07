import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { fetchLiveWorkEditions, EDITIONS_PAGE_SIZE, MAX_REPRESENTATION_PAGES } from "@/lib/catalog/openlibrary/editions";
import { normalizeIsbn, isValidIsbnCheckDigit } from "@/lib/catalog/isbn";

/** Server-only: actorId must come from the caller's authenticated session. */
export async function registerVerifiedBookEdition(bookId: string, requestedIsbn: string, actorId: string) {
  const isbn = normalizeIsbn(requestedIsbn);
  if (!isbn || !isValidIsbnCheckDigit(isbn)) return null;
  const { data: book, error } = await createPublicClient()
    .from("books").select("openlibrary_work_key").eq("id", bookId).maybeSingle();
  if (error) throw error;
  if (!book?.openlibrary_work_key) return null;
  const edition = (await fetchLiveWorkEditions(book.openlibrary_work_key,
    EDITIONS_PAGE_SIZE * MAX_REPRESENTATION_PAGES)).find((candidate) => candidate.isbn === isbn);
  if (!edition) return null;
  const { data, error: registrationError } = await createServiceRoleClient().rpc("register_verified_book_edition", {
    p_book_id: bookId,
    p_created_by: actorId,
    p_isbn: isbn,
    p_label: edition.label.trim().slice(0, 60) || undefined,
    p_publisher: edition.publisher ?? undefined,
    p_year: edition.year ?? undefined,
    p_pages: edition.totalPages ?? undefined,
    p_cover_url: edition.coverUrl ?? undefined,
  });
  if (registrationError) throw registrationError;
  return data;
}
