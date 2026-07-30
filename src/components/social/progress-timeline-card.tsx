"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { SpoilerGate } from "./spoiler-gate";
import { itemHref } from "@/lib/catalog/item-href";

export function ProgressTimelineCard({
  entry,
  viewerLoggedIn,
}: {
  entry: PersonGroupEntry; // verb === "progressed", items = pasos desc
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = entry.actor.displayName || entry.actor.username;
  const work = entry.items[0];

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={actorName} avatarUrl={entry.actor.avatarUrl} size={30} />
        <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
          <Link href={`/u/${entry.actor.username}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
          <span className="text-muted-foreground">{t("grouped.progressedIn", { title: "" })}</span>{" "}
          <Link href={itemHref(work.itemType, work.itemId)} className="font-serif font-semibold hover:underline">{work.itemTitle}</Link>
        </p>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
          {t("kind.progress")}
        </span>
      </div>

      <div className="flex flex-col">
        {entry.items.map((step, i) => {
          const noteEl = step.progress?.note && (
            <p className="border-l-2 border-border pl-3 font-serif text-[12.5px] leading-relaxed text-muted-foreground">
              {step.progress.note.body}
            </p>
          );

          return (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-accent/20" />
                {i < entry.items.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <p className="text-[12.5px] text-foreground">
                  {step.progress?.page != null
                    ? t("progress.reachedPage", { page: step.progress.page })
                    : step.episode
                      ? `S${step.episode.season}E${step.episode.episode}`
                      : t("minutesLogged", { count: step.progress?.durationMinutes ?? 0 })}
                  {step.progress?.percent != null && (
                    <span className="ml-1.5 font-mono text-accent">{step.progress.percent}%</span>
                  )}
                </p>
                {step.progress?.note && (
                  <div className="mt-1.5">
                    {step.progress.note.isSpoiler ? <SpoilerGate>{noteEl}</SpoilerGate> : noteEl}
                  </div>
                )}
                {step.interactionTarget && (
                  <div className="mt-1.5">
                    <ReviewInteractions
                      targetType={step.interactionTarget.targetType}
                      targetId={step.interactionTarget.targetId}
                      reactionCount={step.reactionCount}
                      viewerReacted={step.viewerReacted}
                      commentCount={step.commentCount}
                      comments={step.comments}
                      viewerLoggedIn={viewerLoggedIn}
                    />
                  </div>
                )}
                <span suppressHydrationWarning className="mt-1 block font-mono text-[9.5px] text-foreground-faint">{timeAgo(step.eventDate, tTime)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
