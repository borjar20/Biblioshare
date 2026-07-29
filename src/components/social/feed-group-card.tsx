"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { QuickAddButton } from "@/components/library/quick-add-button";
import { quickAddManyToLibrary } from "@/lib/library/quick-add-actions";
import { itemHref } from "@/lib/catalog/item-href";

// Tarjeta de un grupo del feed (altas o sesiones del mismo actor/día). Cada
// ítem lleva SU propia reacción/comentario (target real: pass/progress_session)
// — la tarjeta solo agrupa para pintar (spec D2).
export function FeedGroupCard({
  entry,
  viewerLoggedIn,
}: {
  entry: PersonGroupEntry;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = entry.actor.displayName || entry.actor.username;

  const headline =
    entry.verb === "added"
      ? t("grouped.addedCount", { count: entry.items.length })
      : t("grouped.progressedIn", { title: entry.items[0].itemTitle });

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={actorName} avatarUrl={entry.actor.avatarUrl} size={34} />
        <p className="min-w-0 text-sm leading-snug text-foreground">
          <Link href={`/u/${entry.actor.username}`} className="font-semibold hover:underline">
            {actorName}
          </Link>{" "}
          <span className="text-muted-foreground">{headline}</span>
        </p>
        <span
          suppressHydrationWarning
          className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground"
        >
          {timeAgo(entry.eventDate, tTime)}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {entry.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <Link
                href={itemHref(item.itemType, item.itemId)}
                className="relative h-[78px] w-[52px] shrink-0 overflow-hidden rounded bg-surface-muted shadow-cover"
              >
                {item.itemCoverUrl && (
                  <Image src={item.itemCoverUrl} alt={item.itemTitle} fill sizes="52px" className="object-cover" />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  href={itemHref(item.itemType, item.itemId)}
                  className="font-serif text-sm leading-tight font-semibold text-foreground hover:underline"
                >
                  {item.itemTitle}
                </Link>
                {item.itemSubtitle && (
                  <span className="font-serif text-[11px] italic text-muted-foreground">{item.itemSubtitle}</span>
                )}
                {entry.verb === "added" && (
                  <QuickAddButton itemType={item.itemType} itemId={item.itemId} />
                )}
              </div>
            </div>
            {item.interactionTarget && (
              <ReviewInteractions
                targetType={item.interactionTarget.targetType}
                targetId={item.interactionTarget.targetId}
                reactionCount={item.reactionCount}
                viewerReacted={item.viewerReacted}
                commentCount={item.commentCount}
                comments={item.comments}
                viewerLoggedIn={viewerLoggedIn}
              />
            )}
          </div>
        ))}
      </div>

      {entry.verb === "added" && (
        <form
          action={async () => {
            await quickAddManyToLibrary(entry.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId })));
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg border border-border py-2 text-[12.5px] font-semibold text-accent hover:bg-surface-muted"
          >
            {t("grouped.saveAllToQueue", { count: entry.items.length })}
          </button>
        </form>
      )}
    </article>
  );
}
