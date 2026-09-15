import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getMovieForHydration } from "@/lib/catalog/tmdb";
import type { ImportCandidate } from "./types";
import type { Json } from "@/lib/supabase/database.types";

/** Caller has checked job ownership; SQL independently requires a confirmed pending row. */
export async function ensureArchiveMovie(jobId: string, ordinal: number, candidate: Pick<ImportCandidate, "catalogId" | "externalId">) {
  const client = createServiceRoleClient();
  let tmdb = Number(candidate.externalId);
  if (candidate.catalogId) {
    const { data, error } = await client.from("movies").select("id,tmdb_id,title,hydrated_at").eq("id", candidate.catalogId).single();
    if (error) throw error;
    if (data.title?.trim() && (data.hydrated_at || !data.tmdb_id)) return data.id;
    tmdb = data.tmdb_id ?? 0;
  }
  if (!Number.isSafeInteger(tmdb) || tmdb <= 0) throw new Error("invalid_metadata");
  const metadata = await getMovieForHydration(tmdb, true);
  if (!metadata?.title?.trim()) throw new Error("provider_unavailable");
  const { data, error } = await client.rpc("archive_register_movie", {
    p_job: jobId, p_ordinal: ordinal, p_tmdb: tmdb, p_data: metadata as unknown as Json,
  });
  if (error) throw error;
  return data;
}
