import { getTranslations } from "next-intl/server";
import type { StatusDistribution } from "@/lib/stats/get-status-distribution";
import type { MediaStatus } from "@/lib/library/types";

const STATUS_CLASS: Record<MediaStatus, string> = {
  completed: "bg-status-completed",
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  dropped: "bg-status-dropped",
};

const STATUS_KEY: Record<MediaStatus, string> = {
  completed: "statusCompleted",
  planned: "statusPlanned",
  in_progress: "statusInProgress",
  dropped: "statusDropped",
};

// Estados de la biblioteca (frame J): barra apilada + leyenda con porcentaje.
// Es una foto del ahora, no depende del período. El wrapper card lo pone la página.
export async function StatusBarCard({ dist }: { dist: StatusDistribution }) {
  const t = await getTranslations("stats");

  if (dist.total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("statusTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("statusEmpty")}</p>
      </div>
    );
  }

  const withPct = dist.buckets
    .filter((b) => b.count > 0)
    .map((b) => ({ ...b, pct: Math.round((b.count / dist.total) * 100) }));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("statusTitle")}
      </h3>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted">
        {withPct.map((b) => (
          <div
            key={b.status}
            className={STATUS_CLASS[b.status]}
            style={{ width: `${b.pct}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {withPct.map((b) => (
          <span key={b.status} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_CLASS[b.status]}`} />
            {t(STATUS_KEY[b.status])} {b.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}
