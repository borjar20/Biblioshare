import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ReleaseTmdbInput } from "./types";
import { readAllRows, chunks } from "./data";
import { addDays, madridDay } from "./precision";
import { collectTmdbReleases, type TrackedTmdbWork } from "./tmdb-provider";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
export type ReleaseSyncReport = { attempted: boolean; checkedWorks: number; imported: number; failedWorks: number; discoveryFailed: boolean; failed: boolean; superseded: boolean };

const emptyReport = (): ReleaseSyncReport => ({ attempted: false, checkedWorks: 0, imported: 0, failedWorks: 0, discoveryFailed: false, failed: false, superseded: false });

/** Successful selected work snapshots may advance while source-level failures remain visible. */
export async function syncTmdbReleases(admin: ServiceClient, now = new Date(), force = false): Promise<ReleaseSyncReport> {
  const day = madridDay(now);
  const { data: state, error: stateError } = await admin.from("release_sync_state").select("last_attempt_at, last_success_at")
    .eq("source", "tmdb").maybeSingle();
  if (stateError) throw stateError;
  if (!state) throw new Error("release_source_state_missing");
  if (!force && state?.last_success_at && madridDay(new Date(state.last_success_at)) === day) return emptyReport();
  // Retry a failed source after an hour, while every cron invocation still processes due notices.
  if (!force && state?.last_attempt_at && now.getTime() - Date.parse(state.last_attempt_at) < 3_600_000) return emptyReport();
  const attempt = now.toISOString();
  const claim = admin.from("release_sync_state").update({ last_attempt_at: attempt }).eq("source", "tmdb");
  const { data: acquired, error: attemptError } = await (state.last_attempt_at
    ? claim.eq("last_attempt_at", state.last_attempt_at) : claim.is("last_attempt_at", null)).select("source").maybeSingle();
  if (attemptError) throw attemptError;
  if (!acquired) return emptyReport();
  const report = { ...emptyReport(), attempted: true };
  try {
    const trackedRows = await readAllRows(() => admin.from("cultural_releases").select("id, item_type, tmdb_id, date_precision, date_value")
      .eq("source", "tmdb").eq("status", "published").order("id"));
    const trackedByKey = new Map<string, TrackedTmdbWork>();
    for (const row of trackedRows) {
      if (!row.tmdb_id || row.item_type === "book") continue;
      if (row.date_precision === "day" && row.date_value && row.date_value < day) continue;
      const work = { item_type: row.item_type, tmdb_id: row.tmdb_id } as TrackedTmdbWork;
      trackedByKey.set(`${work.item_type}:${work.tmdb_id}`, work);
    }
    const batch = await collectTmdbReleases(day, addDays(day, 180), [...trackedByKey.values()]);
    report.checkedWorks = batch.checkedWorks.length;
    report.failedWorks = batch.failedWorks;
    report.discoveryFailed = batch.discoveryFailed;
    // Never delete or cancel rows absent from a source response. Empty release_dates is not a cancellation.
    const candidates: ReleaseTmdbInput[] = batch.releases.map((row) => ({
      work_key: row.work_key, source_key: row.source_key, item_type: row.item_type,
      modality: row.channel, season_number: row.season_number, market: row.market,
      language: row.language ?? "und", date_value: row.date_value, date_precision: row.date_precision,
      status: "published", checked_at: now.toISOString(), title: row.title,
      subtitle: row.season_number ? `Temporada ${row.season_number}` : null,
      cover_url: row.cover_url, synopsis: row.synopsis, digital_platform: null,
      source_name: "TMDB", source_url: row.source_url, tmdb_id: Number(row.external_id), movie_id: null, series_id: null,
    }));
    // Bulk rows are bounded to avoid oversized RPC requests; the source input remains server-only.
    for (const group of chunks(candidates, 100)) {
      const { data: current, error: guardError } = await admin.from("release_sync_state").select("source").eq("source", "tmdb")
        .eq("last_attempt_at", attempt).maybeSingle();
      if (guardError) throw guardError;
      if (!current) { report.superseded = true; return report; }
      const { data, error } = await admin.rpc("release_upsert_tmdb", { p_rows: group as unknown as Json, p_expected_attempt: attempt });
      if (error) throw error;
      report.imported += data?.length ?? 0;
    }
    report.failed = batch.discoveryFailed || batch.failedWorks > 0;
    const { data: settled, error } = await admin.from("release_sync_state").update({
      last_error: report.failed ? "tmdb_partial_failure" : null,
      ...(!report.failed ? { last_success_at: now.toISOString() } : {}),
    }).eq("source", "tmdb").eq("last_attempt_at", attempt).select("source").maybeSingle();
    if (error) throw error;
    if (!settled) report.superseded = true;
    return report;
  } catch (error) {
    if (typeof error === "object" && error !== null && "message" in error && error.message === "release_sync_attempt_conflict") {
      report.superseded = true;
      return report;
    }
    report.failed = true;
    const safeCode = error instanceof Error && /^tmdb_(configuration|network|http|malformed)$/.test(error.message) ? error.message : "tmdb_sync_failed";
    const { error: recordError } = await admin.from("release_sync_state").update({ last_error: safeCode }).eq("source", "tmdb").eq("last_attempt_at", attempt);
    if (recordError) throw recordError;
    return report;
  }
}
