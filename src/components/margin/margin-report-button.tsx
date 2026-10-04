"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { reportMarginNote } from "@/lib/margin/report-actions";
import { REPORT_REASONS, type ReportReason } from "@/lib/social/moderation";

// Denuncia de la nota para quien la ha encontrado (el autor no la ve: no se
// denuncia a si mismo). Mismo selector de motivo y textos que la denuncia de comentarios.
export function MarginReportButton({ encounterId }: { encounterId: string }) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFailed(false);
    startTransition(async () => {
      const res = await reportMarginNote(encounterId, reason, details);
      if (res.ok) {
        setSent(true);
        setOpen(false);
      } else setFailed(true);
    });
  }

  if (sent) return <p role="status" className="text-xs text-muted-foreground">{t("reportSent")}</p>;

  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="min-h-11 self-start py-2 text-xs text-muted-foreground underline">
          {t("reportComment")}
        </button>
      ) : (
        <div className="flex max-w-xs flex-col gap-2 rounded-md border border-border bg-surface p-3">
          <label htmlFor={`mr-reason-${encounterId}`} className="text-[11px] font-medium">{t("reportReasonLabel")}</label>
          <select id={`mr-reason-${encounterId}`} value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            {REPORT_REASONS.map((v) => <option key={v} value={v}>{t(`reportReason.${v}`)}</option>)}
          </select>
          <label htmlFor={`mr-details-${encounterId}`} className="text-[11px] font-medium">{t("reportDetailsLabel")}</label>
          <textarea id={`mr-details-${encounterId}`} value={details} maxLength={2000} rows={3}
            onChange={(e) => setDetails(e.target.value)}
            className="resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
              {t("cancel")}
            </button>
            <button type="button" disabled={pending} onClick={submit}
              className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50">
              {t("sendReport")}
            </button>
          </div>
        </div>
      )}
      {failed && <p role="alert" className="text-xs">{t("actionError")}</p>}
    </div>
  );
}
