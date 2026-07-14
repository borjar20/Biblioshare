import { getTranslations, getFormatter } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Community } from "@/lib/community/get-community";
import type { EpisodeReview } from "@/lib/series/get-episode-reviews";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";
import { ReviewInteractions } from "@/components/social/review-interactions";

// "Comunidad" tab body: agregados reales de library_entries (notas) y
// diary_entries (reseñas), calculados en src/lib/community/get-community.ts.
// Para series, las reseñas son por episodio (§7.x): se pasa `episodeReviews` y
// la sección de reseñas muestra esas en vez de las de diary_entries.
export async function CommunityPanel({
  itemType,
  community,
  episodeReviews,
  viewerLoggedIn,
}: {
  itemType: ItemType;
  community: Community;
  episodeReviews?: EpisodeReview[];
  viewerLoggedIn: boolean;
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
          <div className="flex max-w-md items-center gap-6 rounded-card border border-border bg-surface shadow-card p-6">
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <span className={`font-serif text-4xl leading-none font-bold ${accent.text}`}>
                {community.avgRating.toFixed(1)}
              </span>
              <RatingDots value={community.avgRating / 2} />
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
                      className="h-full rounded-full bg-gold"
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
        {episodeReviews !== undefined ? (
          episodeReviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {episodeReviews.map((review) => (
                <article
                  key={review.id}
                  className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4"
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
                          {format.dateTime(new Date(review.watchedOn), {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <span className={`font-mono text-[10px] ${accent.text}`}>
                        {`S${review.season}E${review.episode}`}
                        {review.episodeTitle ? ` · ${review.episodeTitle}` : ""}
                      </span>
                      {review.rating !== null && (
                        <RatingDots
                          value={review.rating / 2}
                         
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {review.text}
                  </p>
                  <ReviewInteractions
                    targetType="episode_watch"
                    targetId={review.id}
                    reactionCount={review.reactionCount}
                    viewerReacted={review.viewerReacted}
                    commentCount={review.commentCount}
                    comments={review.comments}
                    viewerLoggedIn={viewerLoggedIn}
                  />
                </article>
              ))}
            </div>
          )
        ) : community.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {community.reviews.map((review) => (
              <article
                key={review.id}
                className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4"
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
                      <div className="flex items-center gap-2">
                        {review.editionLabel !== null && (
                          <span
                            className={`rounded-chip px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
                          >
                            {review.editionLabel}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {format.dateTime(new Date(review.finishedOn), {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    {review.rating !== null && (
                      <RatingDots
                        value={review.rating / 2}
                       
                      />
                    )}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {review.text}
                </p>
                <ReviewInteractions
                  targetType="diary_entry"
                  targetId={review.id}
                  reactionCount={review.reactionCount}
                  viewerReacted={review.viewerReacted}
                  commentCount={review.commentCount}
                  comments={review.comments}
                  viewerLoggedIn={viewerLoggedIn}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
