"use client";

import { useTranslations } from "next-intl";
import type { ReleaseSourceStatus } from "@/lib/releases/types";
import { releaseReviewDate } from "./release-view";

export function ReleaseSources({ sources }: { sources: ReleaseSourceStatus[] | null }) {
  const t = useTranslations("releases");
  return <aside className="min-w-0 rounded-card border border-border bg-surface p-5">
    <h2 className="font-serif text-lg font-semibold">{t("sources")}</h2>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("selectionNote")}</p>
    {sources === null ? <p role="status" className="mt-4 text-sm text-muted-foreground">{t("sourceUnavailable")}</p>
      : <ul className="mt-4 flex flex-col gap-4">
        {(["tmdb", "editorial"] as const).map((name) => {
          const source = sources.find((row) => row.source === name);
          const reviewed = releaseReviewDate(source?.last_success_at ?? null);
          return <li key={name} className="border-t border-border pt-3 text-sm">
            <p className="font-medium">{t(`sourceNames.${name}`)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{reviewed ? t("reviewed", { date: reviewed }) : t("notReviewed")}</p>
            {source?.last_error && <p className="mt-2 text-xs text-status-dropped">{t("sourceFailure")}</p>}
          </li>;
        })}
      </ul>}
    <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{t("notifyHint")}</p>
  </aside>;
}
