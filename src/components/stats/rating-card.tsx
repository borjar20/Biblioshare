import { getTranslations } from "next-intl/server";
import type { RatingDistribution } from "@/lib/stats/get-rating-distribution";

// Valoración media (frames B/G): número serif en /5 + 5 puntos dorados + el
// histograma 5★→1★. El wrapper card lo pone la pestaña.
export async function RatingCard({ dist }: { dist: RatingDistribution }) {
  const t = await getTranslations("stats");

  if (dist.count === 0 || dist.average === null) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("ratingTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("ratingEmpty")}</p>
      </div>
    );
  }

  const filledDots = Math.round(dist.average);
  const maxBucket = Math.max(1, ...dist.buckets.map((b) => b.count));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("ratingTitle")}
      </h3>
      <div className="flex items-center gap-5">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <span className="font-serif text-[40px] leading-none font-semibold text-foreground">
            {dist.average.toFixed(1).replace(".", ",")}
          </span>
          <div className="flex gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                aria-hidden
                className={`h-2 w-2 rounded-full ${
                  i < filledDots ? "bg-gold" : "bg-surface-3"
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {t("ratingCount", { count: dist.count })}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          {dist.buckets.map((b) => (
            <div key={b.star} className="flex items-center gap-2">
              <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                {b.star}★
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-gold/70"
                  style={{ width: `${(b.count / maxBucket) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {b.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
