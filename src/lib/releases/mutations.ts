import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import type { SearchResult } from "@/lib/catalog/types";
import { ensureMovieHydrated, ensureSeriesHydrated } from "@/lib/catalog/hydrate-screen";
import { normalizeIsbn } from "@/lib/catalog/isbn";
import { applyTransition } from "@/lib/passes/apply-transition";
import { requireRequestQuota } from "@/lib/rate-limit";
import { revalidateItemPage, revalidateLibrary, revalidateReleases } from "@/lib/reactivity/revalidate";
import type { CulturalRelease, ReleaseEditorialInput } from "./types";
import { authenticatedReleaseClient, requireReleaseAdmin, type ReleaseClient } from "./data";
import { releaseCatalogId } from "./presentation";
import { parseReleaseDate } from "./precision";

export type EditorialReleaseInput = ReleaseEditorialInput;

async function storedRelease(supabase: ReleaseClient, releaseId: string): Promise<CulturalRelease> {
  const { data, error } = await supabase.from("cultural_releases").select("*").eq("id", releaseId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("notFound");
  return data;
}

export async function setReleaseSubscription(userId: string, releaseId: string, enabled: boolean): Promise<void> {
  const supabase = await authenticatedReleaseClient(userId);
  if (typeof enabled !== "boolean") throw new Error("invalid");
  const { error } = await supabase.rpc("release_set_subscription", { p_release_id: releaseId, p_active: enabled });
  if (error) throw error;
  revalidateReleases();
}

/** Browser supplies only an id; the canonical release is always re-read with RLS. */
export async function addReleaseToPending(userId: string, releaseId: string): Promise<{ itemId: string; itemType: CulturalRelease["item_type"] }> {
  const supabase = await authenticatedReleaseClient(userId);
  const release = await storedRelease(supabase, releaseId);
  if (release.status !== "published") throw new Error("invalid");
  let itemId = releaseCatalogId(release);
  if (!itemId && release.source === "tmdb" && release.tmdb_id && release.item_type !== "book") {
    const { data, error } = await supabase.from(release.item_type === "movie" ? "movies" : "series")
      .select("id").eq("tmdb_id", release.tmdb_id).maybeSingle();
    if (error) throw error;
    itemId = data?.id ?? null;
  }
  if (!itemId && release.source === "tmdb" && release.tmdb_id) {
    await requireRequestQuota(supabase, "catalog_request");
    const result: SearchResult = {
      itemType: release.item_type, externalId: String(release.tmdb_id), title: release.title,
      subtitle: release.subtitle, coverUrl: release.cover_url,
      year: release.date_value ? Number(release.date_value.slice(0, 4)) : null,
      synopsis: release.synopsis, genres: null,
    };
    itemId = await findOrCreateCatalogItem(supabase, result, userId);
    if (release.item_type === "movie") await ensureMovieHydrated(supabase, { id: itemId, tmdb_id: release.tmdb_id, hydrated_at: null });
    else if (release.item_type === "series") await ensureSeriesHydrated(supabase, { id: itemId, tmdb_id: release.tmdb_id, hydrated_at: null });
  }
  if (!itemId) throw new Error("invalid");
  // Absence is checked by the canonical writer; its insert handles a concurrent active pass.
  await applyTransition(supabase, userId, release.item_type, itemId, "planned", undefined, { silent: true, requireAbsent: true });
  revalidateItemPage(release.item_type, itemId);
  revalidateLibrary();
  revalidateReleases();
  return { itemId, itemType: release.item_type };
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("invalid");
    return url.toString();
  } catch { throw new Error("invalid"); }
}

function validatedEditorialInput(input: ReleaseEditorialInput): ReleaseEditorialInput {
  const date = parseReleaseDate(input.dateValue);
  const title = input.title?.trim();
  const sourceName = input.sourceName?.trim();
  const sourceUrl = safeHttpUrl(input.sourceUrl);
  if (!title || title.length > 500 || !sourceName || sourceName.length > 150 || !sourceUrl ||
    date.date_precision !== input.datePrecision || !["ES", "INT"].includes(input.market) ||
    !["draft", "published", "cancelled"].includes(input.status) ||
    (input.modality === "book_translation" && !["es", "es-ES"].includes(input.language)) ||
    !["book", "book_translation"].includes(input.modality) || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(input.language)) throw new Error("invalid");
  const isbn = input.isbn?.trim() ? normalizeIsbn(input.isbn) : null;
  if (input.isbn?.trim() && !isbn) throw new Error("invalid");
  return { ...input, title, sourceName, sourceUrl, dateValue: date.date_value, coverUrl: safeHttpUrl(input.coverUrl), isbn };
}

export async function saveEditorialRelease(
  userId: string,
  input: EditorialReleaseInput,
  id?: string,
  expectedRevision?: number,
  expectedUpdatedAt?: string,
): Promise<{ id: string }> {
  const supabase = await authenticatedReleaseClient(userId);
  await requireReleaseAdmin(supabase, userId);
  if (id && (!Number.isInteger(expectedRevision) || !expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt)))) throw new Error("invalid");
  const canonical = validatedEditorialInput(input);
  const { data, error } = await supabase.rpc("release_editorial_save", {
    p_input: canonical as unknown as Json, p_release_id: id,
    p_expected_revision: expectedRevision,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
  const saved = data?.[0];
  if (!saved) throw new Error("notFound");
  revalidateReleases();
  return { id: saved.id };
}

function editorialSnapshot(row: CulturalRelease): ReleaseEditorialInput {
  return { title: row.title, subtitle: row.subtitle, coverUrl: row.cover_url, synopsis: row.synopsis,
    author: row.author, publisher: row.publisher, isbn: row.isbn, modality: row.modality as "book" | "book_translation",
    market: row.market, language: row.language, dateValue: row.date_value, datePrecision: row.date_precision,
    status: row.status, sourceName: row.source_name, sourceUrl: row.source_url,
    bookId: row.book_id, bookEditionId: row.book_edition_id, workKey: row.work_key };
}

async function updateEditorialStatus(userId: string, id: string, status: "published" | "cancelled" | undefined, expectedRevision?: number, expectedUpdatedAt?: string): Promise<void> {
  const supabase = await authenticatedReleaseClient(userId);
  await requireReleaseAdmin(supabase, userId);
  if (!Number.isInteger(expectedRevision) || !expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error("invalid");
  const row = await storedRelease(supabase, id);
  if (row.source !== "editorial" || row.item_type !== "book") throw new Error("forbidden");
  const input = editorialSnapshot(row);
  if (status) input.status = status;
  const { error } = await supabase.rpc("release_editorial_save", {
    p_input: input as unknown as Json, p_release_id: id, p_expected_revision: expectedRevision, p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
  revalidateReleases();
}

export async function publishEditorialRelease(userId: string, id: string, expectedRevision?: number, expectedUpdatedAt?: string): Promise<void> {
  await updateEditorialStatus(userId, id, "published", expectedRevision, expectedUpdatedAt);
}
export async function cancelEditorialRelease(userId: string, id: string, expectedRevision?: number, expectedUpdatedAt?: string): Promise<void> {
  await updateEditorialStatus(userId, id, "cancelled", expectedRevision, expectedUpdatedAt);
}
export async function markEditorialReleaseReviewed(userId: string, id: string, expectedRevision?: number, expectedUpdatedAt?: string): Promise<void> {
  await updateEditorialStatus(userId, id, undefined, expectedRevision, expectedUpdatedAt);
}
