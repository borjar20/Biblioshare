"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listClubActivities, type ClubActivity } from "@/lib/clubs/activities/core";
import { ActivityComposer } from "./activity-composer";
import { ActivityCard } from "./activity-card";

export function ActivityList({
  clubId,
  clubSlug,
  initialActivities,
}: {
  clubId: string;
  clubSlug: string;
  initialActivities: ClubActivity[];
}) {
  const t = useTranslations("activity");
  const [activities, setActivities] = useState(initialActivities);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      setActivities(await listClubActivities(clubId));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t("sectionTitle")}</h2>
        <ActivityComposer clubId={clubId} onProposed={refresh} />
      </div>

      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} clubSlug={clubSlug} />
          ))}
        </div>
      )}
    </div>
  );
}
