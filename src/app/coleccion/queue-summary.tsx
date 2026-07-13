import { getTranslations } from "next-intl/server";
import type { QueueEstimates } from "@/lib/queue/types";

export async function QueueSummary({ estimates }: { estimates: QueueEstimates }) {
  const t = await getTranslations("queue");

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-4">
      <p className="text-sm font-medium text-foreground">{estimates.totalText}</p>
      {estimates.moviePaceText && (
        <p className="text-xs text-muted-foreground">{estimates.moviePaceText}</p>
      )}
      {estimates.unresolvedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("unresolved", { count: estimates.unresolvedCount })}
        </p>
      )}
    </div>
  );
}
