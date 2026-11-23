import type { ReactNode } from "react";
import { getTranslations, getFormatter } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Community } from "@/lib/community/get-community";
import type { EpisodeReview } from "@/lib/series/get-episode-reviews";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { CommunitySummary } from "@/components/detail/community-summary";
import { ReviewRow } from "@/components/detail/review-row";
import { ReviewInteractions } from "@/components/social/review-interactions";

// Las reseñas de pase y de episodio comparten orden cronológico (#713).
export async function CommunityPanel({
  itemType,
  community,
  episodeReviews,
  episodeKnownUsernames,
  viewerLoggedIn,
}: {
  itemType: ItemType;
  community: Community;
  episodeReviews?: EpisodeReview[];
  /** Espejo de `community.knownUsernames` pero para `episodeReviews` (fuente distinta). */
  episodeKnownUsernames?: string[];
  viewerLoggedIn: boolean;
}) {
  const t = await getTranslations("detail");
  const format = await getFormatter();
  const accent = MEDIA_ACCENT[itemType];

  const shortDate = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) : t("unknownDate");

  const chipClass = `inline-block rounded-[5px] px-[7px] py-0.5 font-mono text-[9.5px] tracking-[0.05em] uppercase ${accent.bgSoft} ${accent.text}`;

  // Las dos fuentes se normalizan a la misma forma y se mezclan por fecha
  // descendente. El `chip` es lo que distingue una de otra a la vista: "S3E2 ·
  // título" en las de episodio, la etiqueta de edición en las de pase.
  type PanelReview = {
    key: string;
    initials: string;
    author: string;
    username: string | null;
    avatarUrl: string | null;
    dateIso: string | null;
    rating: number | null;
    text: string;
    isSpoiler: boolean;
    knownUsernames: string[];
    chip: ReactNode;
    interactions: ReactNode;
  };

  const episodeMentions = episodeKnownUsernames ?? [];

  const passRows: PanelReview[] = community.reviews.map((review) => ({
    key: `pass:${review.id}`,
    initials: review.initials,
    author: review.author,
    username: review.username,
    avatarUrl: review.avatarUrl,
    dateIso: review.finishedOn,
    rating: review.rating,
    text: review.text,
    isSpoiler: review.isSpoiler,
    knownUsernames: community.knownUsernames,
    chip:
      review.editionLabel !== null ? (
        <span className={chipClass}>{review.editionLabel}</span>
      ) : undefined,
    // Sin post (reseña de un import no autopublicado) no hay hilo que
    // enganchar: la reseña se muestra sin barra de interacción.
    interactions: review.interactionTargetId ? (
      <ReviewInteractions
        interactionTargetId={review.interactionTargetId}
        reactionCount={review.reactionCount}
        viewerReacted={review.viewerReacted}
        commentCount={review.commentCount}
        comments={review.comments}
        reactions={review.reactions}
        knownUsernames={community.knownUsernames}
        viewerLoggedIn={viewerLoggedIn}
        voiceEnabled
      />
    ) : null,
  }));

  const episodeRows: PanelReview[] = (episodeReviews ?? []).map((review) => ({
    key: `episode:${review.id}`,
    initials: review.initials,
    author: review.author,
    username: review.username,
    avatarUrl: review.avatarUrl,
    dateIso: review.watchedOn,
    rating: review.rating,
    text: review.text,
    isSpoiler: review.isSpoiler,
    knownUsernames: episodeMentions,
    chip: (
      <span className={chipClass}>
        {`S${review.season}E${review.episode}`}
        {review.episodeTitle ? ` · ${review.episodeTitle}` : ""}
      </span>
    ),
    interactions: (
      <ReviewInteractions
        interactionTargetId={review.interactionTargetId}
        reactionCount={review.reactionCount}
        viewerReacted={review.viewerReacted}
        commentCount={review.commentCount}
        comments={review.comments}
        reactions={review.reactions}
        knownUsernames={episodeMentions}
        viewerLoggedIn={viewerLoggedIn}
      />
    ),
  }));

  // Ambas fechas son ISO (`YYYY-MM-DD`), así que ordenan bien como texto.
  const rows = [...passRows, ...episodeRows].sort((a, b) =>
    (b.dateIso ?? "").localeCompare(a.dateIso ?? ""),
  );
  function renderReview(review: PanelReview) {
    return (
      <ReviewRow
        key={review.key}
        initials={review.initials}
        author={review.author}
        username={review.username}
        avatarUrl={review.avatarUrl}
        dateLabel={shortDate(review.dateIso)}
        rating={review.rating}
        itemType={itemType}
        text={review.text}
        isSpoiler={review.isSpoiler}
        knownUsernames={review.knownUsernames}
        chip={review.chip}
      >
        {review.interactions}
      </ReviewRow>
    );
  }

  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 label-section">{t("tabCommunity")}</h2>
      {community.avgRating === null && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("communityEmpty")}</p>
      ) : (
        <>
          {community.avgRating !== null && (
            <CommunitySummary
              itemType={itemType}
              avgRating={community.avgRating}
              distribution={community.distribution}
              ratingsLabel={t("ratings", { count: community.ratingCount })}
            />
          )}
          {rows.length > 0 ? (
            <div className={community.avgRating !== null ? "mt-4 border-t border-border pt-4" : undefined}>
              <h3 className="mb-3 text-sm font-semibold">{t("reviews")} · {rows.length}</h3>
              <div>{renderReview(rows[0])}</div>
              {rows.length > 1 && (
                <details>
                  <summary className="cursor-pointer rounded-sm py-2 text-sm font-medium text-foreground">
                    {t("moreReviews", { count: rows.length - 1 })}
                  </summary>
                  <div>{rows.slice(1).map(renderReview)}</div>
                </details>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t("noReviews")}</p>
          )}
        </>
      )}
    </section>
  );
}
