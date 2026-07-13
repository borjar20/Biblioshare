import { getTranslations } from "next-intl/server";
import type { LibrarySummary } from "@/lib/library/get-library-summary";
import type { MediaStatus } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

const STATUSES: MediaStatus[] = [
  "in_progress",
  "planned",
  "completed",
  "dropped",
];
const TYPES: ItemType[] = ["book", "movie", "series"];

const STATUS_BG: Record<MediaStatus, string> = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
};

// Resumen de la colección: total, barra apilada por estado y recuento por tipo.
export async function CollectionSummary({
  summary,
}: {
  summary: LibrarySummary;
}) {
  const t = await getTranslations();

  if (summary.total === 0) return null;

  const present = STATUSES.filter((s) => summary.byStatus[s] > 0);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-3xl leading-none font-semibold text-foreground">
          {summary.total}
        </span>
        <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          {t("collection.summary.total")}
        </span>
      </div>

      {/* Barra apilada por estado. */}
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
        {present.map((status) => (
          <div
            key={status}
            className={STATUS_BG[status]}
            style={{
              width: `${(summary.byStatus[status] / summary.total) * 100}%`,
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {present.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${STATUS_BG[status]}`}
              aria-hidden
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {t(`library.status.${status}`)} · {summary.byStatus[status]}
            </span>
          </span>
        ))}
      </div>

      {/* Recuento por tipo. */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {TYPES.map((type) => (
          <span
            key={type}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] tracking-wider uppercase ${MEDIA_ACCENT[type].borderSoft} ${MEDIA_ACCENT[type].bgSoft} ${MEDIA_ACCENT[type].text}`}
          >
            {t(`search.types.${type}`)} · {summary.byType[type]}
          </span>
        ))}
      </div>
    </div>
  );
}
