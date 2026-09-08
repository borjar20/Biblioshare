"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

export function ArchiveActionForm({ action, children, className }: {
  action: (data: FormData) => Promise<void>; children: ReactNode; className?: string;
}) {
  const t = useTranslations("import.archive");
  const [failed, submit, pending] = useActionState(async (_failed: boolean, data: FormData) => {
    try { await action(data); return false; } catch { return true; }
  }, false);
  return <form action={submit} className={className}>
    {failed && <p role="alert">{t("actionFailed")}</p>}
    <fieldset disabled={pending} className="contents">{children}</fieldset>
  </form>;
}
