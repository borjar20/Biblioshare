import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { ArchiveMovie } from "./letterboxd-archive-types";
import { matchImportRow } from "./match-row";
import type { ImportRow } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

export function archiveMatchRow(movie: ArchiveMovie): ImportRow {
  return { rowNumber: 0, title: movie.title, year: movie.year, author: null, isbn: null, publisher: null,
    pageCount: null, status: "completed", rating: null, bookFormat: null, diaryDates: [], unknownStatusLabel: null };
}

/** Processes a bounded portion; database RPCs serialize effects across retries. */
export async function processArchive(client: Client, jobId: string, deadline = Date.now() + 35000): Promise<string[]> {
  const { data: job, error: jobError } = await client.from("archive_imports").select("id,user_id,state").eq("id", jobId).single();
  if (jobError) throw jobError;
  if (job.state !== "running") return [];
  const { data: items, error } = await client.from("archive_import_items").select("ordinal,payload,item_id")
    .eq("job_id", jobId).eq("state", "pending").order("ordinal").limit(5);
  if (error) throw error;
  const affected: string[] = [];
  for (const item of items) {
    if (Date.now() >= deadline) break;
    try {
      const movie = item.payload as unknown as ArchiveMovie;
      const match = item.item_id ? { kind: "matched" as const, catalogId: item.item_id } : await matchImportRow(client, "movie", archiveMatchRow(movie), job.user_id);
      if (match.kind !== "matched") {
        const result = await client.rpc("archive_result", { p_job: jobId, p_ordinal: item.ordinal, p_state: match.kind,
          p_candidates: (match.kind === "ambiguous" ? match.candidates : []) as unknown as Json });
        if (result.error) throw result.error;
        continue;
      }
      const result = await client.rpc("archive_apply", { p_job: jobId, p_ordinal: item.ordinal, p_movie: match.catalogId });
      if (result.error) throw result.error;
      affected.push(match.catalogId);
    } catch {
      const result = await client.rpc("archive_result", { p_job: jobId, p_ordinal: item.ordinal, p_state: "error" });
      if (result.error) throw result.error;
    }
  }
  const finished = await client.rpc("archive_finish", { p_job: jobId });
  if (finished.error) throw finished.error;
  return affected;
}
