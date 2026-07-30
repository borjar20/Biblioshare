"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { SpoilerGate } from "./spoiler-gate";
import { itemHref } from "@/lib/catalog/item-href";
import { splitProgressSteps } from "./progress-collapse";

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
  // Grupos largos se colapsan a las 2 sesiones más recientes; el resto queda
  // tras un "ver N anteriores" (splitProgressSteps decide el umbral).
  const [expanded, setExpanded] = useState(false);
  const { visible, hiddenCount, collapsible } = splitProgressSteps(entry.items, expanded);

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
        {visible.map((step, i) => {
          const noteEl = step.progress?.note && (
            <p className="border-l-2 border-border pl-3 font-serif text-[12.5px] leading-relaxed text-muted-foreground">
              {step.progress.note.body}
            </p>
          );

          return (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-accent/20" />
                {/* La línea baja hasta el siguiente paso o hasta el botón
                    "ver N anteriores / ver menos" cuando el grupo es colapsable. */}
                {(i < visible.length - 1 || collapsible) && <span className="w-0.5 flex-1 bg-border" />}
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

        {collapsible && (
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-border" />
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="min-w-0 flex-1 pb-1 text-left text-[12px] font-medium text-accent hover:underline"
            >
              {expanded ? t("progress.showLess") : t("progress.showOlder", { count: hiddenCount })}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
