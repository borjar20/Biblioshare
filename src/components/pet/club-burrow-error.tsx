"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";

export function ClubBurrowError() {
  const t = useTranslations("pet.clubBurrow");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5" aria-busy={pending}>
    <p role="status" className="text-sm text-muted-foreground">{t(pending ? "retrying" : "error")}</p>
    <button type="button" disabled={pending} className={buttonVariants("secondary", "self-start px-4")}
      onClick={() => startTransition(() => router.refresh())}>{t("retry")}</button>
  </div>;
}
