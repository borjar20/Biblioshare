"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** Entre nosotros without saving a group (#1484). Shown only with an accepted follow. */
export function CompareWithLink({ userId }: { userId: string }) {
  const t = useTranslations("profile");
  return (
    <Link
      href={`/comunidad/entre-nosotros?con=${userId}`}
      title={t("compareWithHint")}
      className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm font-medium text-foreground hover:bg-surface-muted"
    >
      {t("compareWith")}
    </Link>
  );
}
