"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { reportComment } from "@/lib/social/moderation-actions";
import { REPORT_REASONS, type ReportReason } from "@/lib/social/moderation";

export function CommentActions({
  commentId,
  canDelete,
  isOwn,
  isBusy,
  onDelete,
}: {
  commentId: string;
  canDelete: boolean;
  isOwn: boolean;
  isBusy: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("social");
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    if (window.confirm(t("deleteCommentConfirm"))) onDelete();
  }

  function submitReport() {
    setFailed(false);
    setSent(false);
    startTransition(async () => {
      try {
        await reportComment(commentId, reason, details);
        setSent(true);
        setReportOpen(false);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="relative flex items-center gap-2">
      {canDelete && (
        <button
          type="button"
          disabled={isBusy}
          onClick={confirmDelete}
          className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          {t("deleteComment")}
        </button>
      )}
      {!isOwn && (
        <button
          type="button"
          aria-expanded={reportOpen}
          disabled={isBusy || isPending}
          onClick={() => {
            setFailed(false);
            setSent(false);
            setReportOpen((open) => !open);
          }}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {t("reportComment")}
        </button>
      )}

      {reportOpen && (
        <div className="absolute top-6 right-0 z-20 flex w-64 flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left shadow-card">
          <label htmlFor={`report-reason-${commentId}`} className="text-[11px] font-medium">
            {t("reportReasonLabel")}
          </label>
          <select
            id={`report-reason-${commentId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`reportReason.${value}`)}
              </option>
            ))}
          </select>
          <label htmlFor={`report-details-${commentId}`} className="text-[11px] font-medium">
            {t("reportDetailsLabel")}
          </label>
          <textarea
            id={`report-details-${commentId}`}
            value={details}
            maxLength={2000}
            rows={3}
            onChange={(event) => setDetails(event.target.value)}
            className="resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={submitReport}
              className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
            >
              {t("sendReport")}
            </button>
          </div>
        </div>
      )}

      {failed && (
        <span role="alert" className="sr-only">
          {t("actionError")}
        </span>
      )}
      {sent && (
        <span role="status" className="text-[11px] text-muted-foreground">
          {t("reportSent")}
        </span>
      )}
    </div>
  );
}
