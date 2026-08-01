"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { QuickAddButton } from "@/components/library/quick-add-button";
import { quickAddManyToLibrary } from "@/lib/library/quick-add-actions";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";
import { itemsMissingFromLibrary } from "./collection-card-items";

// Variante A de "añadió N títulos": lista vertical con lomo + autor + reacción
// por ítem (target real: pass) y alta rápida por fila. Frente a FeedGroupCard,
// aquí cada fila es su propia línea (no una minicard) y hay badge "Colección".
export function CollectionCard({
  entry,
  viewerLoggedIn,
  knownUsernames,
}: {
  entry: PersonGroupEntry; // verb === "added"
  viewerLoggedIn: boolean;
  /** Usernames @mencionados que existen de verdad (comentarios), resueltos server-side. */
  knownUsernames: string[];
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = entry.actor.displayName || entry.actor.username;
  const missingItems = itemsMissingFromLibrary(entry.items);

  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={actorName} avatarUrl={entry.actor.avatarUrl} size={30} />
        <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
          <Link href={`/u/${entry.actor.username}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
          <span className="text-muted-foreground">{t("grouped.addedCount", { count: entry.items.length })}</span>
        </p>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
          {t("kind.collection")}
        </span>
      </div>

      <div className="flex flex-col">
        {entry.items.map((item) => (
          <div key={item.id} className="flex gap-3 border-t border-border py-3 first:border-t-0">
            <Link href={itemHref(item.itemType, item.itemId)} className="w-[46px] shrink-0">
              <SpineCover coverUrl={item.itemCoverUrl} title={item.itemTitle} className="aspect-[2/3] w-[46px]" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={itemHref(item.itemType, item.itemId)} className="font-serif text-[13.5px] leading-tight font-semibold hover:underline">
                {item.itemTitle}
              </Link>
              {item.itemSubtitle && <span className="text-[11px] text-foreground-faint">{item.itemSubtitle}</span>}
              {item.interactionTarget && (
                <ReviewInteractions
                  targetType={item.interactionTarget.targetType}
                  targetId={item.interactionTarget.targetId}
                  reactionCount={item.reactionCount}
                  viewerReacted={item.viewerReacted}
                  commentCount={item.commentCount}
                  comments={item.comments}
                  viewerLoggedIn={viewerLoggedIn}
                  knownUsernames={knownUsernames}
                />
              )}
            </div>
            {!item.viewerHasActivePass && (
              <div className="shrink-0 self-start">
                <QuickAddButton itemType={item.itemType} itemId={item.itemId} />
              </div>
            )}
          </div>
        ))}
      </div>

      {missingItems.length > 1 && (
        <form
          action={async () => {
            await quickAddManyToLibrary(
              missingItems.map((item) => ({
                itemType: item.itemType,
                itemId: item.itemId,
              })),
            );
          }}
        >
          <button type="submit" className="w-full rounded-lg border border-border py-2 text-[12.5px] font-semibold text-accent hover:bg-surface-muted">
            {t("grouped.saveAllToQueue", { count: missingItems.length })}
          </button>
        </form>
      )}
      <span suppressHydrationWarning className="self-end font-mono text-[10px] text-muted-foreground">{timeAgo(entry.eventDate, tTime)}</span>
    </article>
  );
}
