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
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface shadow-card p-4">
      <span className="font-serif text-[15px] font-semibold text-foreground">
        {t("collection.summary.heading")}
      </span>

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

      {/* Leyenda en dos columnas: dot + nombre …… recuento (mono semibold a la
          derecha, mockup `.leg`). */}
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-2">
        {present.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${STATUS_BG[status]}`}
              aria-hidden
            />
            <span className="truncate text-[11px] text-muted-foreground">
              {t(`library.status.${status}`)}
            </span>
            <span className="ml-auto font-mono text-[11px] font-semibold text-foreground">
              {summary.byStatus[status]}
            </span>
          </span>
        ))}
      </div>

      {/* Recuento por tipo: cifra grande serif teñida + label debajo
          (mockup `.tcount`). */}
      <div className="flex justify-around border-t border-border pt-3.5">
        {TYPES.map((type) => (
          <div key={type} className="flex flex-col items-center gap-0.5">
            <span
              className={`font-serif text-[26px] leading-none font-semibold ${MEDIA_ACCENT[type].text}`}
            >
              {summary.byType[type]}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t(`search.types.${type}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
