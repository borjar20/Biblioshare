"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import type { ContentRow, ModerationAction, ModerationResult } from "@/lib/moderation/contracts";
import { moderateContent, reviewReport } from "./moderation-actions";

const fieldClass = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";

function ActionForm({ action, expected, onCancel, onSubmit }: {
  action: ModerationAction | "actioned" | "dismissed";
  expected?: string;
  onCancel: () => void;
  onSubmit: (reason: string, confirmation: string) => Promise<ModerationResult>;
}) {
  const t = useTranslations("adminModeration");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleting = action === "delete";
  return (
    <form className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface-muted p-4" aria-label={t(`actions.${action}`)}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            const result = await onSubmit(reason, confirmation);
            if (result.ok) onCancel();
            else setError(t(`errors.${result.error}`));
          } catch { setError(t("errors.unknown")); }
        });
      }}>
      <h3 className="font-semibold">{t(`actions.${action}`)}</h3>
      <p className="text-sm text-muted-foreground">{t(`explanation.${action}`)}</p>
      <label htmlFor={`${id}-reason`} className="text-sm font-medium">{t("reason")}</label>
      <textarea id={`${id}-reason`} className={fieldClass} required maxLength={2000} rows={3}
        value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} autoFocus />
      {deleting && <>
        <label htmlFor={`${id}-confirmation`} className="text-sm">{t("confirmation", { expected: expected ?? "ELIMINAR" })}</label>
        <input id={`${id}-confirmation`} className={fieldClass} value={confirmation} required autoComplete="off"
          onChange={(event) => setConfirmation(event.target.value)} disabled={pending} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={acknowledged} required disabled={pending}
            onChange={(event) => setAcknowledged(event.target.checked)} />
          {t("deleteAcknowledgement")}
        </label>
      </>}
      {error && <p role="alert" className="text-sm text-status-dropped">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={deleting ? "danger" : "primary"}
          disabled={pending || !reason.trim() || (deleting && (!acknowledged || confirmation !== (expected ?? "ELIMINAR")))}>
          {pending ? t("saving") : t(`actions.${action}`)}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </form>
  );
}

export function ContentControls({ item }: { item: ContentRow }) {
  const t = useTranslations("adminModeration");
  const [action, setAction] = useState<ModerationAction | null>(null);
  if (item.deleted_at) return null;
  return <>
    <ActionMenu label={t("contentActions")} items={[
      !item.removed_at && { key: "remove", label: t("actions.remove"), onSelect: () => setAction("remove") },
      Boolean(item.removed_at) && { key: "restore", label: t("actions.restore"), onSelect: () => setAction("restore") },
      { key: "delete", label: t("actions.delete"), danger: true, onSelect: () => setAction("delete") },
    ]} />
    {action && <ActionForm key={action} action={action} expected={item.kind === "club" ? item.title : "ELIMINAR"}
      onCancel={() => setAction(null)}
      onSubmit={(reason, confirmation) => moderateContent({ id: item.id, kind: item.kind, action, reason, confirmation })} />}
  </>;
}

export function ReportControls({ id }: { id: string }) {
  const t = useTranslations("adminModeration");
  const [action, setAction] = useState<"actioned" | "dismissed" | null>(null);
  return <>
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setAction("actioned")}>{t("actions.actioned")}</Button>
      <Button variant="ghost" onClick={() => setAction("dismissed")}>{t("actions.dismissed")}</Button>
    </div>
    {action && <ActionForm key={action} action={action} onCancel={() => setAction(null)}
      onSubmit={(reason) => reviewReport(id, action, reason)} />}
  </>;
}
