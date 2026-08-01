"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { MentionText } from "@/components/social/mention-text";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";

// Variante C de un evento de reseña (finished/rated/reviewed/watchedEpisode):
// hero con lomo + badge "Finalizado" + estrellas + meta (autor · días · pág.),
// extracto de reseña y UNA fila de reacción (el target del propio evento).
// `hideActor`: variante para "Reseñas recientes" del perfil (mismo prop que
// tenía el FeedCard viejo) — el autor es el propio perfil, así que se oculta
// la cabecera y se muestra el timestamp al pie en su lugar.
export function ReviewCard({
  event,
  viewerLoggedIn,
  hideActor = false,
  knownUsernames,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  /** Usernames @mencionados que existen de verdad (extracto + comentarios). */
  knownUsernames: string[];
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = event.actorDisplayName || event.actorUsername;
  const meta = [
    event.itemSubtitle,
    event.reviewMeta?.readingDays != null ? t("review.metaDays", { count: event.reviewMeta.readingDays }) : null,
    event.reviewMeta?.totalPages != null ? t("review.metaPages", { count: event.reviewMeta.totalPages }) : null,
    event.episode ? `S${event.episode.season}E${event.episode.episode}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {!hideActor && (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
            <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
          </p>
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
            {t("kind.review")}
          </span>
        </div>
      )}

      <div className="flex gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <Link href={itemHref(event.itemType, event.itemId)} className="w-[58px] shrink-0">
          <SpineCover coverUrl={event.itemCoverUrl} title={event.itemTitle} className="aspect-[2/3] w-[58px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.06em] uppercase text-green">
            <span className="h-1.5 w-1.5 rounded-full bg-green" />{t("review.finished")}
          </span>
          <Link href={itemHref(event.itemType, event.itemId)} className="mt-1 block font-serif text-[15px] leading-tight font-semibold hover:underline">
            {event.itemTitle}
          </Link>
          {event.rating != null && <div className="mt-2"><RatingDots value={event.rating} /></div>}
          {meta && <p className="mt-1.5 font-mono text-[10px] text-foreground-faint">{meta}</p>}
        </div>
      </div>

      {event.reviewExcerpt && (
        <p className="border-l-2 border-accent pl-3.5 font-serif text-[14px] leading-relaxed">
          <MentionText text={event.reviewExcerpt} knownUsernames={knownUsernames} />
        </p>
      )}

      {event.interactionTarget?.interactionTargetId && (
        <ReviewInteractions
          interactionTargetId={event.interactionTarget.interactionTargetId}
          reactionCount={event.reactionCount}
          viewerReacted={event.viewerReacted}
          commentCount={event.commentCount}
          comments={event.comments}
          viewerLoggedIn={viewerLoggedIn}
          knownUsernames={knownUsernames}
        />
      )}
      {hideActor && (
        <span suppressHydrationWarning className="self-end font-mono text-[10px] text-muted-foreground">{timeAgo(event.eventDate, tTime)}</span>
      )}
    </article>
  );
}
