"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cancelBookAnnouncement, publishBookAnnouncement, reviewBookAnnouncement } from "@/app/admin/novedades/actions";
import { loginHref } from "@/lib/auth/safe-next";
import type { ReleaseStatus } from "@/lib/releases/types";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { invokeReleaseAction, type ReleaseActionResult } from "./action-state";

export function EditorialControls({ id, status, revision, updatedAt, disabled = false }: {
  id: string; status: ReleaseStatus; revision: number; updatedAt: string; disabled?: boolean;
}) {
  const t = useTranslations("releaseAdmin");
  const r = useTranslations("releases");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReleaseActionResult | null>(null);
  const [success, setSuccess] = useState<"published" | "reviewed" | "cancelled">("reviewed");
  function run(action: "publish" | "review" | "cancel") {
    startTransition(async () => {
      const response = await invokeReleaseAction(() => (action === "publish" ? publishBookAnnouncement : action === "review" ? reviewBookAnnouncement : cancelBookAnnouncement)(id, revision, updatedAt));
      setResult(response);
      if (response.ok) setSuccess(action === "publish" ? "published" : action === "review" ? "reviewed" : "cancelled");
      else if (response.error === "auth") router.push(loginHref(`/admin/novedades/${id}`));
    });
  }
  return <div className="rounded-card border border-border bg-surface p-5">
    <p className="mb-3 text-sm font-medium">{t(`status.${status}`)}</p>
    <div className="flex flex-wrap items-center gap-2">
      {status !== "published" && <Button disabled={pending || disabled} aria-busy={pending} className="min-h-11" onClick={() => run("publish")}>{t("publish")}</Button>}
      <Button variant="secondary" disabled={pending || disabled} aria-busy={pending} className="min-h-11" onClick={() => run("review")}>{t("review")}</Button>
      {status !== "cancelled" && <ActionMenu label={t("actions")} items={[{ key: "cancel", label: t("cancel"), danger: true, disabled: pending || disabled, onSelect: () => run("cancel") }]} />}
    </div>
    {disabled && <p className="mt-3 text-sm text-muted-foreground">{t("saveBeforeActions")}</p>}
    {result?.ok && <p role="status" className="mt-3 text-sm text-muted-foreground">{t(success)}</p>}
    {result && !result.ok && <p role="alert" className="mt-3 text-sm text-status-dropped">{r(`errors.${result.error}`)}</p>}
  </div>;
}
