"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";

// Tarjeta de HITO (post kind = started | dropped): «actor empezó / abandonó una
// obra». Sin nota ni reseña —esos son atributos del post `finished`— y con la
// misma barra de interacción estándar. Los alimenta el writer de hito (autopost,
// Task 9); su UI de preferencias (activar started/dropped) es Spec 2, y como el
// default es OFF rara vez aparecen aún — pero un post `started` NO debe pintarse
// como «Finalizado» (por eso no reutiliza ReviewCard).
export function MilestoneCard({
  event,
  viewerLoggedIn,
  hideActor = false,
  knownUsernames,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  /** Usernames @mencionados que existen de verdad (comentarios del hilo). */
  knownUsernames: string[];
}) {
  const t = useTranslations("feed");
  const actorName = event.actorDisplayName || event.actorUsername;

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {!hideActor && (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">
              {actorName}
            </Link>{" "}
            <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
          </p>
        </div>
      )}

      <div className="flex gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <Link href={itemHref(event.itemType, event.itemId)} className="w-[58px] shrink-0">
          <SpineCover coverUrl={event.itemCoverUrl} title={event.itemTitle} className="aspect-[2/3] w-[58px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={itemHref(event.itemType, event.itemId)}
            className="block font-serif text-[15px] leading-tight font-semibold hover:underline"
          >
            {event.itemTitle}
          </Link>
          {event.itemSubtitle && (
            <p className="mt-1 font-mono text-[10px] text-foreground-faint">{event.itemSubtitle}</p>
          )}
        </div>
      </div>

      {event.interactionTarget?.interactionTargetId && (
        <ReviewInteractions
          interactionTargetId={event.interactionTarget.interactionTargetId}
          reactionCount={event.reactionCount}
          viewerReacted={event.viewerReacted}
          commentCount={event.commentCount}
          comments={event.comments}
          reactions={event.reactions}
          viewerLoggedIn={viewerLoggedIn}
          knownUsernames={knownUsernames}
        />
      )}
      <TimeAgo iso={event.eventDate} className="self-end font-mono text-[10px] text-muted-foreground" />
    </article>
  );
}
