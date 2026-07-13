"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";

const STATUS_STYLE: Record<ClubActivity["status"], string> = {
  proposed: "bg-surface-muted text-muted-foreground",
  active: "bg-accent/15 text-accent",
  finished: "bg-surface-muted text-muted-foreground",
  archived: "bg-surface-muted text-muted-foreground",
};

export function ActivityCard({ activity, clubSlug }: { activity: ClubActivity; clubSlug: string }) {
  const t = useTranslations("activity");
  return (
    <Link
      href={`/club/${clubSlug}/actividad/${activity.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-muted"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{activity.title}</span>
        <span className="text-xs text-muted-foreground">
          {t(`kind_${activity.kind}`)} · {t("participants", { count: activity.participantCount })}
        </span>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[activity.status]}`}>
        {t(`status_${activity.status}`)}
      </span>
    </Link>
  );
}
