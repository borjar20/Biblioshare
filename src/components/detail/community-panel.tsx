import { getTranslations, getFormatter } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Community } from "@/lib/community/get-community";
import type { EpisodeReview } from "@/lib/series/get-episode-reviews";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { CommunitySummary } from "@/components/detail/community-summary";
import { ReviewRow } from "@/components/detail/review-row";
import { ReviewInteractions } from "@/components/social/review-interactions";

// "Comunidad" tab body: agregados reales de library_entries (notas) y
// diary_entries (reseñas), calculados en src/lib/community/get-community.ts.
// Para series, las reseñas son por episodio (§7.x): se pasa `episodeReviews` y
// la sección de reseñas muestra esas en vez de las de diary_entries.
//
// Frames 2 (móvil) y 9 (PC). En PC son dos columnas — las reseñas a toda la
// izquierda y el resumen pegado a la derecha —, con el mismo `.desk-cols` que
// el Registro (`1fr 340px`, hueco 44). En móvil el resumen va ARRIBA y las
// reseñas debajo: mismo DOM, reordenado con `order`.
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

  const shortDate = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const chipClass = `inline-block rounded-[5px] px-[7px] py-0.5 font-mono text-[9.5px] tracking-[0.05em] uppercase ${accent.bgSoft} ${accent.text}`;

  const reviewCount =
    episodeReviews !== undefined
      ? episodeReviews.length
      : community.reviews.length;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-11">
      {/* Reseñas. En el DOM van PRIMERO para caer en la columna izquierda en
          PC; en móvil `order-2` las manda debajo del resumen, que es el orden
          del frame 2. */}
      <section className="order-2 flex flex-col lg:order-none">
        {/* `.h5` con el recuento dentro ("Reseñas · 312") como el frame: la
            cifra sale del mismo dato que el rótulo, no es un badge aparte. */}
        <h2 className="mb-[11px] font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase lg:mb-[15px]">
          {t("reviews")}
          {reviewCount > 0 && ` · ${reviewCount}`}
        </h2>

        {reviewCount === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
        ) : episodeReviews !== undefined ? (
          <div className="flex flex-col">
            {episodeReviews.map((review) => (
              <ReviewRow
                key={review.id}
                initials={review.initials}
                author={review.author}
                dateLabel={shortDate(review.watchedOn)}
                rating={review.rating}
                text={review.text}
                chip={
                  <span className={chipClass}>
                    {`S${review.season}E${review.episode}`}
                    {review.episodeTitle ? ` · ${review.episodeTitle}` : ""}
                  </span>
                }
              >
                <ReviewInteractions
                  targetType="episode_watch"
                  targetId={review.id}
                  reactionCount={review.reactionCount}
                  viewerReacted={review.viewerReacted}
                  commentCount={review.commentCount}
                  comments={review.comments}
                  viewerLoggedIn={viewerLoggedIn}
                />
              </ReviewRow>
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {community.reviews.map((review) => (
              <ReviewRow
                key={review.id}
                initials={review.initials}
                author={review.author}
                dateLabel={shortDate(review.finishedOn)}
                rating={review.rating}
                text={review.text}
                chip={
                  review.editionLabel !== null ? (
                    <span className={chipClass}>{review.editionLabel}</span>
                  ) : undefined
                }
              >
                <ReviewInteractions
                  targetType="diary_entry"
                  targetId={review.id}
                  reactionCount={review.reactionCount}
                  viewerReacted={review.viewerReacted}
                  commentCount={review.commentCount}
                  comments={review.comments}
                  viewerLoggedIn={viewerLoggedIn}
                />
              </ReviewRow>
            ))}
          </div>
        )}
      </section>

      {/* Resumen de notas. En PC es la tarjeta pegada de la derecha
          (`.rate-card` del frame 9): se queda quieta mientras suben las
          reseñas, con el mismo `sticky` que el rail — scroll de página, no
          interno (P5). */}
      <aside className="order-1 mb-[22px] lg:sticky lg:order-none lg:mb-0 lg:top-[calc(var(--topbar-h)+34px)]">
        {community.avgRating === null ? (
          <p className="text-sm text-muted-foreground">{t("noRatings")}</p>
        ) : (
          <CommunitySummary
            itemType={itemType}
            avgRating={community.avgRating}
            distribution={community.distribution}
            ratingsLabel={t("ratings", { count: community.ratingCount })}
          />
        )}
      </aside>
    </div>
  );
}
