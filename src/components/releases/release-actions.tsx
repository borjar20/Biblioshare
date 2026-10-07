"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addNoveltyToPending, chooseReleaseNotice } from "@/app/novedades/actions";
import { loginHref, safeNext } from "@/lib/auth/safe-next";
import { Button, buttonVariants } from "@/components/ui/button";
import { BellIcon, PlusIcon } from "@/components/ui/icons";
import { invokeReleaseAction, type ReleaseActionResult } from "./action-state";

export function PendingReleaseAction({ releaseId, authenticated, inLibrary, returnPath, dense = false }: {
  releaseId: string; authenticated: boolean; inLibrary: boolean; returnPath: string; dense?: boolean;
}) {
  const t = useTranslations("releases");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReleaseActionResult | null>(null);
  const safeReturn = safeNext(returnPath);
  if (inLibrary || result?.ok) return <p role="status" className="text-sm text-muted-foreground">
    {result?.ok ? t("pendingSaved") : t("inLibrary")}
  </p>;
  if (!authenticated) return <Link href={loginHref(safeReturn)} aria-label={t("pending")} className={buttonVariants("secondary", dense ? "min-h-11 px-2 text-xs" : "min-h-11 px-3 text-xs")}>
    <PlusIcon className="h-4 w-4" />{t(dense ? "pendingShort" : "pending")}
  </Link>;
  return <div>
    <Button variant="secondary" className={dense ? "min-h-11 px-2 text-xs" : "min-h-11 px-3 text-xs"} disabled={pending} aria-busy={pending} aria-label={pending ? t("working") : t("pending")}
      onClick={() => startTransition(async () => {
        const response = await invokeReleaseAction(() => addNoveltyToPending(releaseId));
        setResult(response);
        if (!response.ok && response.error === "auth") router.push(loginHref(safeReturn));
      })}>
      <PlusIcon className="h-4 w-4" />{pending ? t("working") : t(dense ? "pendingShort" : "pending")}
    </Button>
    {result && !result.ok && <p role="alert" className="mt-2 text-xs text-status-dropped">{t(`errors.${result.error}`)}</p>}
  </div>;
}

export function ReleaseNoticeAction({ releaseId, authenticated, subscribed, cancelled, returnPath, dense = false }: {
  releaseId: string; authenticated: boolean; subscribed: boolean; cancelled: boolean; returnPath: string; dense?: boolean;
}) {
  const t = useTranslations("releases");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReleaseActionResult | null>(null);
  const [choice, setChoice] = useState<boolean | null>(null);
  const safeReturn = safeNext(returnPath);
  // Consent is read from refreshed server props; it is never copied into
  // component state, so navigation/review cannot resurrect a withdrawn notice.
  if (cancelled && !subscribed && !pending) {
    if (result?.ok && choice === false) return <p role="status" className="text-xs text-muted-foreground">{t("notifyRemoved")}</p>;
    if (result && !result.ok) return <p role="alert" className="text-xs text-status-dropped">{t(`errors.${result.error}`)}</p>;
    return null;
  }
  if (!authenticated) return <Link href={loginHref(safeReturn)} className={buttonVariants("ghost", dense ? "min-h-11 px-2 text-xs" : "min-h-11 px-3 text-xs")}>
    <BellIcon className="h-4 w-4" />{t("notify")}
  </Link>;
  return <div className="flex flex-col items-start">
    <Button variant="ghost" className={dense ? "min-h-11 px-2 text-xs" : "min-h-11 px-3 text-xs"} disabled={pending} aria-busy={pending}
      aria-pressed={subscribed} onClick={() => startTransition(async () => {
        const enabled = !subscribed;
        const response = await invokeReleaseAction(() => chooseReleaseNotice(releaseId, enabled));
        setResult(response);
        if (response.ok) setChoice(enabled);
        if (!response.ok && response.error === "auth") router.push(loginHref(safeReturn));
      })}>
      <BellIcon className="h-4 w-4" />{pending ? t("working") : subscribed ? t("withdraw") : t("notify")}
    </Button>
    {result?.ok && <p role="status" className="text-xs text-muted-foreground">{choice ? t("notifySaved") : t("notifyRemoved")}</p>}
    {result && !result.ok && <p role="alert" className="text-xs text-status-dropped">{t(`errors.${result.error}`)}</p>}
  </div>;
}
