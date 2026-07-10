import { getTranslations, getFormatter } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Community } from "@/lib/community/get-community";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";

// "Comunidad" tab body: agregados reales de library_entries (notas) y
// diary_entries (reseñas), calculados en src/lib/community/get-community.ts.
export async function CommunityPanel({
  itemType,
  community,
}: {
  itemType: ItemType;
  community: Community;
}) {
  const t = await getTranslations("detail");
  const format = await getFormatter();
  const accent = MEDIA_ACCENT[itemType];
  const maxPct = Math.max(...community.distribution, 1);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("communityRatings")}
        </h2>

        {community.avgRating === null ? (
          <p className="text-sm text-muted-foreground">{t("noRatings")}</p>
        ) : (
          <div className="flex max-w-md items-center gap-6 rounded-xl border border-border bg-surface p-6">
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <span className={`font-serif text-4xl leading-none font-bold ${accent.text}`}>
                {community.avgRating.toFixed(1)}
              </span>
              <RatingDots value={community.avgRating / 2} fillClassName={accent.bg} />
              <span className="font-mono text-[10px] text-muted-foreground">
                {community.ratingCount.toLocaleString("es")} {t("ratings")}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {community.distribution.map((pct, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-2 text-right font-mono text-[10px] text-muted-foreground">
                    {5 - i}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={`h-full rounded-full ${accent.bg}`}
                      style={{
                        width: `${(pct / maxPct) * 100}%`,
                        opacity: 0.45 + 0.55 * (pct / maxPct),
                      }}
                    />
                  </div>
                  <span className="w-8 font-mono text-[10px] text-muted-foreground">
                    {pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("reviews")}</h2>
        {community.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {community.reviews.map((review) => (
              <article
                key={review.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent.bgSoft} font-mono text-[11px] font-medium ${accent.text}`}
                  >
                    {review.initials}
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {review.author}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {format.dateTime(new Date(review.finishedOn), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {review.rating !== null && (
                      <RatingDots
                        value={review.rating / 2}
                        fillClassName={accent.bg}
                      />
                    )}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {review.text}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
