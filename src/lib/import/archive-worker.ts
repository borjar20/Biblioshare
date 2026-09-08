import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { processArchive } from "./process-archive";
import { expireArchiveBatch } from "@/lib/reactivity/revalidate";

/** Invoked by the authenticated scheduler, not by a user's browser. */
export async function runArchiveWorker(jobId?: string) {
  const client = createServiceRoleClient();
  const deadline = Date.now() + 35000;
  let query = client.from("archive_imports").select("id").eq("state", "running").order("created_at").limit(10);
  if (jobId) query = query.eq("id", jobId);
  const { data: jobs, error } = await query;
  if (error) throw error;
  let batches = 0;
  // Round-robin ensures a large archive does not starve other accounts.
  const ready = jobs.map((job) => job.id);
  while (ready.length && Date.now() < deadline) {
    const id = ready.shift()!;
    const affected = await processArchive(client, id, deadline);
    if (affected.length) expireArchiveBatch(affected);
    batches++;
    const { count, error: pendingError } = await client.from("archive_import_items").select("ordinal", { count: "exact", head: true }).eq("job_id", id).eq("state", "pending");
    if (pendingError) throw pendingError;
    if (count) ready.push(id);
  }
  return { jobs: jobs.length, batches };
}
