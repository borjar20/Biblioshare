"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import type { MediaStatus } from "@/lib/library/types";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { itemHref } from "@/lib/catalog/item-href";

const STATUS_BG: Record<MediaStatus, string> = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
};

// El estado de un alta va teñido de su propio color (frame A), no en muted: el
// punto solo no basta para leerlo de un vistazo. Clases enteras, no
// interpoladas — el JIT de Tailwind no ve `text-status-${x}`.
const STATUS_TEXT: Record<MediaStatus, string> = {
  planned: "text-status-planned",
  in_progress: "text-status-in-progress",
  completed: "text-status-completed",
  dropped: "text-status-dropped",
};

// `hideActor`: variante para "Reseñas recientes" del perfil, donde el autor es
// el propio perfil y repetir avatar+nombre sería ruido — la cabecera queda en
// "reseñó · hace 2 días".
export function FeedCard({
  event,
  viewerLoggedIn,
  hideActor = false,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
}) {
  const t = useTranslations("feed");
  const tLibrary = useTranslations("library");
  const tTime = useTranslations("time");

  const when = (
    <span
      suppressHydrationWarning
      className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground"
    >
      {timeAgo(event.eventDate, tTime)}
    </span>
  );

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {hideActor ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{t(`verbs.${event.verb}`)}</span>
          {when}
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <UserAvatar
            name={event.actorDisplayName || event.actorUsername}
            avatarUrl={event.actorAvatarUrl}
            size={34}
          />
          <p className="min-w-0 text-sm leading-snug text-foreground">
            <Link
              href={`/u/${event.actorUsername}`}
              className="font-semibold hover:underline"
            >
              {event.actorDisplayName || event.actorUsername}
            </Link>{" "}
            <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
          </p>
          {when}
        </div>
      )}

      <div className="flex items-start gap-3">
        <Link
          href={itemHref(event.itemType, event.itemId)}
          className="relative h-[78px] w-[52px] shrink-0 overflow-hidden rounded bg-surface-muted shadow-cover"
        >
          {event.itemCoverUrl && (
            <Image
              src={event.itemCoverUrl}
              alt={event.itemTitle}
              fill
              sizes="52px"
              className="object-cover"
            />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col">
            <Link
              href={itemHref(event.itemType, event.itemId)}
              className="font-serif text-sm leading-tight font-semibold text-foreground hover:underline"
            >
              {event.itemTitle}
            </Link>
            {event.itemSubtitle && (
              <span className="mt-0.5 font-serif text-[11px] italic text-muted-foreground">
                {event.itemSubtitle}
              </span>
            )}
            {event.episode && (
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {`S${event.episode.season}E${event.episode.episode}`}
                {event.episode.title ? ` · ${event.episode.title}` : ""}
              </span>
            )}
            {event.progress?.durationMinutes != null && (
              <span className="mt-0.5 text-xs text-muted-foreground">
                {t("minutesLogged", { count: event.progress.durationMinutes })}
              </span>
            )}
          </div>

          {event.rating !== null && <RatingDots value={event.rating} />}

          {event.verb === "added" && event.entryStatus && (
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${STATUS_TEXT[event.entryStatus]}`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${STATUS_BG[event.entryStatus]}`}
              />
              {tLibrary(`status.${event.entryStatus}`)}
            </span>
          )}

          {event.reviewExcerpt && (
            <p className="text-[12.5px] leading-[1.55] text-foreground-soft">
              {event.reviewExcerpt}
            </p>
          )}
        </div>
      </div>

      {event.interactionTarget && (
        <ReviewInteractions
          targetType={event.interactionTarget.targetType}
          targetId={event.interactionTarget.targetId}
          reactionCount={event.reactionCount}
          viewerReacted={event.viewerReacted}
          commentCount={event.commentCount}
          comments={event.comments}
          viewerLoggedIn={viewerLoggedIn}
        />
      )}
    </article>
  );
}
