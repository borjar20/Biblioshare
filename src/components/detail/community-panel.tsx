import type { ReactNode } from "react";
import { getTranslations, getFormatter } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Community } from "@/lib/community/get-community";
import type { EpisodeReview } from "@/lib/series/get-episode-reviews";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { CommunitySummary } from "@/components/detail/community-summary";
import { ReviewRow } from "@/components/detail/review-row";
import { ReviewInteractions } from "@/components/social/review-interactions";

// "Comunidad" tab body: agregados reales de passes (estados) y pass_reviews
// (reseñas), calculados en src/lib/community/get-community.ts.
//
// Para series hay DOS fuentes de reseña —la del pase (al cerrar la serie) y las
// de episodio (§7.x)— y aquí se pintan LAS DOS, mezcladas por fecha. Antes la
// rama se elegía por `episodeReviews !== undefined`, y como la ficha de serie
// pasaba siempre el array (aunque viniera vacío), la rama de reseñas de pase
// era código muerto: lo que un usuario escribía al cerrar el pase de una serie
// se guardaba y no aparecía nunca (#713). El discriminante era la presencia del
// prop, que es justo lo que un `?? []` de más rompe sin que nadie se entere.
//
// Frames 2 (móvil) y 9 (PC). En PC son dos columnas — las reseñas a toda la
// izquierda y el resumen pegado a la derecha —, con el mismo `.desk-cols` que
// el Registro (`1fr 340px`, hueco 44). En móvil el resumen va ARRIBA y las
// reseñas debajo: mismo DOM, reordenado con `order`.
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

  const shortDate = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

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
    dateIso: string;
    rating: number | null;
    text: string;
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
    b.dateIso.localeCompare(a.dateIso),
  );
  const reviewCount = rows.length;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-11">
      {/* Reseñas. En el DOM van PRIMERO para caer en la columna izquierda en
          PC; en móvil `order-2` las manda debajo del resumen, que es el orden
          del frame 2. */}
      <section className="order-2 flex flex-col lg:order-none">
        {/* `.h5` con el recuento dentro ("Reseñas · 312") como el frame: la
            cifra sale del mismo dato que el rótulo, no es un badge aparte. */}
        <h2 className="mb-[11px] label-section lg:mb-[15px]">
          {t("reviews")}
          {reviewCount > 0 && ` · ${reviewCount}`}
        </h2>

        {reviewCount === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
        ) : (
          <div className="flex flex-col">
            {rows.map((review) => (
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
                knownUsernames={review.knownUsernames}
                chip={review.chip}
              >
                {review.interactions}
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
