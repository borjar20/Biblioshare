"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubFeedEvent } from "@/lib/social/club-feed";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";

// La tarjeta de club del frame A. Comparte el chasis de FeedCard (.fcard) pero
// no su cuerpo: aquí no hay portada ni valoración, porque una actividad no es
// un ítem — puede ser una tierlist o un reto sin obra concreta.
export function ClubFeedCard({ event }: { event: ClubFeedEvent }) {
  const t = useTranslations("feed.club");
  const tActivity = useTranslations("activity");
  const tTime = useTranslations("time");

  const proposer = event.proposerDisplayName || event.proposerUsername;

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={event.clubName} avatarUrl={event.clubCoverUrl} size={34} />
        <p className="min-w-0 text-sm leading-snug text-foreground">
          <Link href={`/club/${event.clubSlug}`} className="font-semibold hover:underline">
            {t("header", { name: event.clubName })}
          </Link>{" "}
          <span className="text-muted-foreground">{t("verb")}</span>
        </p>
        <span
          suppressHydrationWarning
          className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground"
        >
          {timeAgo(event.eventDate, tTime)}
        </span>
      </div>

      <div className="flex flex-col items-start gap-2 text-[13px] leading-[1.5] text-foreground-soft">
        <span className="inline-flex items-center rounded-[5px] bg-green/12 px-2 py-[3px] font-mono text-[9.5px] font-medium tracking-[0.06em] uppercase text-green">
          {tActivity(`kind_${event.kind}`)}
        </span>
        <Link
          href={`/club/${event.clubSlug}/actividad/${event.activityId}`}
          className="hover:underline"
        >
          <span className="font-semibold text-foreground">{event.title}</span>
          {event.description && ` — ${event.description}`}
        </Link>
        {proposer && (
          <span className="text-muted-foreground italic">
            {t("proposedBy", { name: proposer })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-border pt-[11px] text-[11.5px] text-muted-foreground">
        <span>{t("participants", { count: event.participantCount })}</span>
      </div>
    </article>
  );
}
