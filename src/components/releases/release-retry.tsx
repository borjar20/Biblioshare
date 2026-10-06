"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ReleaseRetry() {
  const t = useTranslations("releases");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button variant="secondary" disabled={pending} aria-busy={pending}
    onClick={() => startTransition(() => router.refresh())}>
    {pending ? common("loading") : t("retry")}
  </Button>;
}
