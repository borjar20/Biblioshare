"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRequestQuota } from "@/lib/rate-limit";
import { analyzeLetterboxdArchive } from "@/lib/import/letterboxd-archive";
import { MAX_ARCHIVE_BYTES } from "@/lib/import/read-zip";
import type { ArchiveAnalysis } from "@/lib/import/letterboxd-archive-types";
import type { Json } from "@/lib/supabase/database.types";
import { revalidateArchiveImports, revalidateImportBatch } from "@/lib/reactivity/revalidate";
import { processArchive } from "@/lib/import/process-archive";
import { catalogIdForCandidate } from "@/lib/import/commit-row";
import { searchMoviesForImport } from "@/lib/catalog/tmdb";
import type { ImportCandidate } from "@/lib/import/types";
import { after } from "next/server";
import { runArchiveWorker } from "@/lib/import/archive-worker";

export type ArchivePreviewState = { analysis?: ArchiveAnalysis; jobId?: string; error?: "invalidArchive" | "archiveTooLarge" | "signIn" | "generic" };

export async function previewArchive(_previous: ArchivePreviewState, data: FormData): Promise<ArchivePreviewState> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: "signIn" };
  const file = data.get("archive");
  if (!(file instanceof File) || !file.size) return { error: "invalidArchive" };
  if (file.size > MAX_ARCHIVE_BYTES) return { error: "archiveTooLarge" };
  try {
    await requireRequestQuota(client, "import_parse");
    const analysis = analyzeLetterboxdArchive(new Uint8Array(await file.arrayBuffer()));
    const { data: jobId, error } = await client.rpc("archive_create", { p_analysis: analysis as unknown as Json });
    if (error) return { error: "generic" };
    revalidateArchiveImports();
    return { analysis, jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "generic";
    return { error: message === "archiveTooLarge" ? message : "invalidArchive" };
  }
}

export async function confirmArchive(data: FormData): Promise<void> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("signIn");
  const jobId = String(data.get("jobId"));
  const confirmed = await client.rpc("archive_confirm", { p_job: jobId, p_public: data.get("isPublic") === "on", p_announce: data.get("announce") === "on" });
  if (confirmed.error) throw confirmed.error;
  after(async () => { await runArchiveWorker(jobId); });
  revalidateArchiveImports();
}

export async function undoArchive(data: FormData): Promise<void> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("signIn");
  const job = String(data.get("jobId"));
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: rows, error: rowsError } = await client.from("archive_import_items").select("item_id").eq("job_id", job).eq("user_id", user.id).order("ordinal").range(offset, offset + 999);
    if (rowsError) throw rowsError;
    ids.push(...rows.flatMap((r) => r.item_id ? [r.item_id] : []));
    if (rows.length < 1000) break;
  }
  const result = await client.rpc("archive_undo", { p_job: job });
  if (result.error) throw result.error;
  revalidateImportBatch("movie", ids);
  revalidateArchiveImports();
}

export async function continueArchive(data: FormData): Promise<void> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("signIn");
  const affected = await processArchive(client, String(data.get("jobId")));
  revalidateImportBatch("movie", affected);
  revalidateArchiveImports();
}

export async function resolveArchive(data: FormData): Promise<void> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("signIn");
  const job = String(data.get("jobId"));
  const ordinal = Number(data.get("ordinal"));
  const decision = String(data.get("decision"));
  const { data: row, error } = await client.from("archive_import_items").select("candidates").eq("job_id", job).eq("ordinal", ordinal).eq("user_id", user.id).single();
  if (error) throw error;
  if (decision === "search") {
    await requireRequestQuota(client, "catalog_request");
    const query = String(data.get("query") ?? "").trim();
    if (!query || query.length > 500) throw new Error("invalid_query");
    const candidates = await searchMoviesForImport(query);
    const retry = await client.rpc("archive_resolve", { p_job: job, p_ordinal: ordinal, p_decision: "retry" });
    if (retry.error) throw retry.error;
    const result = await client.rpc("archive_result", { p_job: job, p_ordinal: ordinal, p_state: candidates.length ? "ambiguous" : "unmatched", p_candidates: candidates as unknown as Json });
    if (result.error) throw result.error;
  } else {
    let movie: string | undefined;
    if (decision === "choose") {
      await requireRequestQuota(client, "catalog_request");
      const candidate = (row.candidates as unknown as ImportCandidate[])[Number(data.get("candidate"))];
      if (!candidate) throw new Error("missing_candidate");
      movie = await catalogIdForCandidate(client, "movie", candidate, user.id);
    }
    const result = await client.rpc("archive_resolve", { p_job: job, p_ordinal: ordinal, p_decision: decision,
      ...(movie ? { p_movie: movie } : {}), ...(data.get("source") ? { p_source: String(data.get("source")) } : {}),
      ...(data.get("review") ? { p_review: String(data.get("review")) } : {}) });
    if (result.error) throw result.error;
    revalidateImportBatch("movie", await processArchive(client, job));
  }
  revalidateArchiveImports();
}
