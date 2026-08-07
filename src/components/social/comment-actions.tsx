"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { reportComment } from "@/lib/social/moderation-actions";
import { REPORT_REASONS, type ReportReason } from "@/lib/social/moderation";

// Menú de acciones de un comentario, compacto (un botón ⋯ que abre un
// desplegable). Antes eran 3-4 botones de texto en línea (Editar/Fijar/Borrar/
// Reportar) que en móvil desbordaban y aplastaban el cuerpo del comentario a una
// palabra por línea. El ⋯ ocupa un ancho fijo mínimo y sirve igual al hilo y al
// chat de burbujas.
export function CommentActions({
  commentId,
  canDelete,
  canEdit = false,
  canPin = false,
  pinned = false,
  isOwn,
  isBusy,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  commentId: string;
  canDelete: boolean;
  canEdit?: boolean;
  canPin?: boolean;
  pinned?: boolean;
  isOwn: boolean;
  isBusy: boolean;
  onEdit?: () => void;
  onTogglePin?: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("social");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    setMenuOpen(false);
    setReportOpen(false);
  }

  function confirmDelete() {
    close();
    if (window.confirm(t("deleteCommentConfirm"))) onDelete();
  }

  function submitReport() {
    setFailed(false);
    setSent(false);
    startTransition(async () => {
      try {
        await reportComment(commentId, reason, details);
        setSent(true);
        close();
      } catch {
        setFailed(true);
      }
    });
  }

  // Sin ninguna acción permitida no hay menú que mostrar.
  if (!canEdit && !canPin && !canDelete && isOwn) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("moreActions")}
        aria-expanded={menuOpen}
        disabled={isBusy}
        onClick={() => {
          setReportOpen(false);
          setMenuOpen((open) => !open);
        }}
        className="px-1 leading-none text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        ⋯
      </button>

      {menuOpen && (
        <>
          {/* Cierra al pulsar fuera, sin useEffect (lint set-state-in-effect). */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute top-6 right-0 z-20 flex min-w-[9rem] flex-col overflow-hidden rounded-lg border border-border bg-surface py-1 text-left shadow-card">
            {reportOpen ? (
              <div className="flex w-64 max-w-[80vw] flex-col gap-2 p-3">
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
                    onClick={close}
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
            ) : (
              <>
                {canEdit && onEdit && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      close();
                      onEdit();
                    }}
                    className="px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
                  >
                    {t("editComment")}
                  </button>
                )}
                {canPin && onTogglePin && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      close();
                      onTogglePin();
                    }}
                    className="px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
                  >
                    {pinned ? t("unpin") : t("pin")}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={confirmDelete}
                    className="px-3 py-1.5 text-left text-xs text-status-dropped transition-colors hover:bg-surface-muted disabled:opacity-50"
                  >
                    {t("deleteComment")}
                  </button>
                )}
                {!isOwn && (
                  <button
                    type="button"
                    disabled={isBusy || isPending}
                    onClick={() => setReportOpen(true)}
                    className="px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
                  >
                    {t("reportComment")}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {failed && (
        <span role="alert" className="sr-only">
          {t("actionError")}
        </span>
      )}
      {sent && (
        <span role="status" className="ml-1 text-[11px] text-muted-foreground">
          {t("reportSent")}
        </span>
      )}
    </div>
  );
}
