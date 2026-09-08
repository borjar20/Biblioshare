import { getTranslations } from "next-intl/server";
import type { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { confirmArchive, continueArchive, resolveArchive, undoArchive } from "./archive-actions";
import type { ArchiveMovie, ArchiveAnalysis } from "@/lib/import/letterboxd-archive-types";
import type { ImportCandidate } from "@/lib/import/types";
import { ReviewContent } from "@/components/detail/review-content";
import Link from "next/link";
import { ArchiveActionForm } from "./archive-action-form";
import { ArchiveRefresh } from "./archive-refresh";

export async function ArchiveJobs({ client, userId, page = 0 }: { page?: number; client: Awaited<ReturnType<typeof createClient>>; userId: string }) {
  const t = await getTranslations("import.archive");
  const { data: jobs, error } = await client.from("archive_imports").select("id,state,created_at,undo_conflicts,analysis").eq("user_id", userId).order("created_at", { ascending: false }).range(page * 20, page * 20 + 20);
  if (error) return <p role="alert">{t("jobsUnavailable")}</p>;
  const { data: profile } = await client.from("profiles").select("is_public").eq("user_id", userId).single();
  return <section className="flex flex-col gap-4" aria-label={t("jobs")}>
    <h2 className="text-lg font-semibold">{t("jobs")}</h2>
    {jobs.slice(0, 20).map(async (job) => {
      const first = await client.from("archive_import_items").select("ordinal,payload,state,message,candidates,item_id").eq("job_id", job.id).order("ordinal").range(0, 999);
      if (first.error) return <p key={job.id} role="alert">{t("jobsUnavailable")}</p>;
      const rows = [...first.data];
      for (let offset = 1000; rows.length === offset; offset += 1000) {
        const next = await client.from("archive_import_items").select("ordinal,payload,state,message,candidates,item_id").eq("job_id", job.id).order("ordinal").range(offset, offset + 999);
        if (next.error) return <p key={job.id} role="alert">{t("jobsUnavailable")}</p>;
        rows.push(...next.data);
      }
      const analysis = job.analysis as unknown as ArchiveAnalysis;
      const unresolved = rows.filter((r) => ["conflict", "ambiguous", "unmatched", "error"].includes(r.state)).length + rows.reduce((count, r) => count + ((r.payload as unknown as ArchiveMovie).reviewConflicts?.length ?? 0), 0);
      const imported = rows.filter((r) => r.state === "imported").length;
      return <article key={job.id} className="flex flex-col gap-3 rounded-card border border-border p-4">
        <h3 className="font-semibold">{t(`states.${job.state}`)} · {job.created_at.slice(0, 10)}</h3>
        <p>{t("progress", { imported, total: rows.length })}</p>
        <p>{t("jobSummary", { passes: analysis.summary?.passes ?? 0, planned: analysis.summary?.planned ?? 0, unresolved })}</p>
        {(analysis.excludedFiles ?? []).length > 0 && <details><summary>{t("excluded")}</summary><ul>{analysis.excludedFiles.map((name) => <li key={name}>{name}</li>)}</ul></details>}
        {job.undo_conflicts > 0 && <p role="alert">{t("undoConflicts", { count: job.undo_conflicts })}</p>}
        {job.state === "draft" && <ArchiveActionForm action={confirmArchive} className="flex flex-col gap-2">
          <input type="hidden" name="jobId" value={job.id} />
          <label><input type="checkbox" name="isPublic" defaultChecked={profile?.is_public ?? false} /> {t("public")}</label>
          <label><input type="checkbox" name="announce" /> {t("announce")}</label>
          <Button type="submit" className="self-start">{t("confirm")}</Button>
        </ArchiveActionForm>}
        {job.state === "running" && <ArchiveActionForm action={continueArchive}><input type="hidden" name="jobId" value={job.id} /><Button type="submit">{t("continue")}</Button></ArchiveActionForm>}
        {job.state === "running" && rows.some((r) => r.state === "pending") && <><ArchiveRefresh /><p>{t("background")}</p></>}
        {job.state !== "undone" && <details><summary>{t("undo")}</summary><p>{t("undoHelp")}</p><ArchiveActionForm action={undoArchive}><input type="hidden" name="jobId" value={job.id} /><Button type="submit">{t("confirmUndo")}</Button></ArchiveActionForm></details>}
        <details><summary>{t("results")}</summary><ul className="flex flex-col gap-4">{rows.map((row) => {
          const movie = row.payload as unknown as ArchiveMovie;
          const fields = <><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="ordinal" value={row.ordinal} /></>;
          return <li key={row.ordinal} className="flex flex-col gap-2 border-t border-border pt-2">
            <p>{movie.title} — {t(`rowStates.${row.state}`)}</p>
            {job.state !== "draft" && job.state !== "undone" && <>
              {row.state === "ambiguous" && (row.candidates as unknown as ImportCandidate[]).map((candidate, index) => <ArchiveActionForm key={index} action={resolveArchive}>{fields}
                <input type="hidden" name="candidate" value={index} /><button name="decision" value="choose" className="text-accent underline">{candidate.title} ({candidate.year ?? "—"})</button>
              </ArchiveActionForm>)}
              {["unmatched", "ambiguous"].includes(row.state) && <ArchiveActionForm action={resolveArchive} className="flex flex-wrap gap-2">{fields}
                <input name="query" aria-label={t("searchTitle")} defaultValue={movie.title} required maxLength={500} className="rounded border border-border bg-surface p-2" /><Button name="decision" value="search">{t("search")}</Button>
              </ArchiveActionForm>}
              {row.state === "conflict" && row.message !== "undoLocalChanges" && <ArchiveActionForm action={resolveArchive}>{fields}<p>{t("conflictHelp")}</p><Button name="decision" value="accept">{t("useArchive")}</Button> <Button name="decision" value="separate">{t("separate")}</Button></ArchiveActionForm>}
              {row.state === "error" && <ArchiveActionForm action={resolveArchive}>{fields}<Button name="decision" value="retry">{t("retry")}</Button></ArchiveActionForm>}
              {!["imported", "dismissed"].includes(row.state) && <ArchiveActionForm action={resolveArchive}>{fields}<button name="decision" value="dismiss" className="text-accent underline">{t("dismiss")}</button></ArchiveActionForm>}
              {(movie.reviewConflicts ?? []).map((review) => <ArchiveActionForm key={review.sourceKey} action={resolveArchive} className="flex flex-col gap-2">{fields}
                <input type="hidden" name="review" value={review.sourceKey} /><ReviewContent text={review.review} />
                <label>{t("associateReview")}<select name="source" className="rounded border border-border bg-surface p-2">{movie.passes.map((pass, index) => <option key={pass.sourceKey} value={pass.sourceKey}>{index + 1}: {pass.finishedOn ?? t("unknownDate")}</option>)}<option value="new">{t("newReviewPass")}</option></select></label>
                <Button name="decision" value="review" className="self-start">{t("saveReview")}</Button>
              </ArchiveActionForm>)}
            </>}
          </li>;
        })}</ul></details>
      </article>;
    })}
    <nav className="flex gap-4" aria-label={t("jobs")}>
      {page > 0 && <Link href={`/importar?archivePage=${page - 1}`}>{t("newer")}</Link>}
      {jobs.length > 20 && <Link href={`/importar?archivePage=${page + 1}`}>{t("older")}</Link>}
    </nav>
  </section>;
}
