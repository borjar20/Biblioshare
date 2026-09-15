"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ImportCandidate } from "@/lib/import/types";
import type { prepareArchiveCandidates } from "@/lib/import/archive-candidates";
import { loadArchiveCandidates, resolveArchive } from "./archive-actions";
import { ArchiveActionForm } from "./archive-action-form";
import { uniqueArchiveCandidates } from "@/lib/import/archive-candidate-identity";

type Choices = Awaited<ReturnType<typeof prepareArchiveCandidates>>;

export function ArchiveCandidateCards({ jobId, ordinal, candidates }: {
  jobId: string; ordinal: number; candidates: ImportCandidate[];
}) {
  const t = useTranslations("import.archive.candidates");
  const [choices, setChoices] = useState<Choices | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const visible = choices ?? uniqueArchiveCandidates(candidates).map(choice => ({
    ...choice, director: null, runtimeMinutes: null, detailsState: "unloaded",
  }));
  return <div className="flex flex-col gap-3">
    <button type="button" disabled={pending} className="self-start text-accent underline" onClick={() => startTransition(async () => {
      setFailed(false);
      try { setChoices(await loadArchiveCandidates(jobId, ordinal)); } catch { setFailed(true); }
    })}>{pending ? t("loading") : t("loadDetails")}</button>
    {failed && <p role="alert">{t("failed")}</p>}
    {visible.map(({ candidate, index, director, runtimeMinutes, detailsState }) => <div key={index} className="flex gap-3 rounded border border-border p-3">
      <div className="w-16 shrink-0">
        {candidate.coverUrl ? <Image src={candidate.coverUrl} alt="" width={64} height={96} className="rounded object-cover" /> : <span className="text-xs text-muted">{t("noCover")}</span>}
      </div>
      <div className="min-w-0 flex-1 break-words">
        <ArchiveActionForm action={resolveArchive}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="ordinal" value={ordinal} />
          <input type="hidden" name="candidate" value={index} />
          <input type="hidden" name="candidateIdentity" value={candidate.externalId || candidate.catalogId || ""} />
          <button name="decision" value="choose" className="text-left font-semibold text-accent underline">{candidate.title} ({candidate.year ?? "—"})</button>
        </ArchiveActionForm>
        {candidate.genres?.length ? <p className="text-sm">{candidate.genres.join(", ")}</p> : null}
        {detailsState === "failed" ? <p role="status">{t("failed")}</p> : detailsState === "available" ? <>
          <p className="text-sm">{t("director", { value: director ?? t("unavailable") })}</p>
          <p className="text-sm">{runtimeMinutes ? t("runtime", { minutes: runtimeMinutes }) : t("noRuntime")}</p>
        </> : null}
        <details><summary className="cursor-pointer text-sm">{t("synopsis")}</summary><p className="text-sm">{candidate.synopsis || t("unavailable")}</p></details>
      </div>
    </div>)}
  </div>;
}
