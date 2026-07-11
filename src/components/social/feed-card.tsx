"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref } from "@/lib/catalog/item-href";

export function FeedCard({
  event,
  viewerLoggedIn,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const format = useFormatter();
  const accent = MEDIA_ACCENT[event.itemType];

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <UserAvatar
          name={event.actorDisplayName || event.actorUsername}
          avatarUrl={event.actorAvatarUrl}
          size={36}
        />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground">
              <Link
                href={`/u/${event.actorUsername}`}
                className="font-medium hover:underline"
              >
                {event.actorDisplayName || event.actorUsername}
              </Link>{" "}
              <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              {format.dateTime(new Date(event.eventDate), {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          <Link
            href={itemHref(event.itemType, event.itemId)}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted p-2 transition-colors hover:border-accent"
          >
            {event.itemCoverUrl && (
              <Image
                src={event.itemCoverUrl}
                alt={event.itemTitle}
                width={40}
                height={56}
                className="rounded object-cover"
              />
            )}
            <div className="flex flex-col">
              <span className={`text-sm font-medium ${accent.text}`}>{event.itemTitle}</span>
              {event.episode && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {`S${event.episode.season}E${event.episode.episode}`}
                  {event.episode.title ? ` · ${event.episode.title}` : ""}
                </span>
              )}
              {event.progress?.durationMinutes != null && (
                <span className="text-xs text-muted-foreground">
                  {t("minutesLogged", { count: event.progress.durationMinutes })}
                </span>
              )}
            </div>
          </Link>

          {event.rating !== null && (
            <RatingDots value={event.rating / 2} fillClassName={accent.bg} />
          )}
          {event.reviewExcerpt && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {event.reviewExcerpt}
            </p>
          )}

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
        </div>
      </div>
    </article>
  );
}
