"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  listClubActivities,
  type ClubActivity,
} from "@/lib/clubs/activities/core";
import { ActivityComposer } from "./activity-composer";
import { ActivityCard } from "./activity-card";
import { ProposalModeration } from "./proposal-moderation";

// Las actividades se agrupan por estado, no en una lista plana: "esperan
// moderación" es lo que un moderador viene a resolver, y "activas" lo que un
// miembro viene a mirar. Mezcladas, ninguna de las dos se encuentra.
export function ActivityList({
  clubId,
  clubSlug,
  initialActivities,
  isModerator,
}: {
  clubId: string;
  clubSlug: string;
  initialActivities: ClubActivity[];
  isModerator: boolean;
}) {
  const t = useTranslations("activity");
  const [activities, setActivities] = useState(initialActivities);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      setActivities(await listClubActivities(clubId));
    });
  }

  const active = activities.filter((a) => a.status === "active");
  const proposed = activities.filter((a) => a.status === "proposed");
  const finished = activities.filter(
    (a) => a.status === "finished" || a.status === "archived",
  );

  return (
    <div className="flex flex-col gap-6">
      <ActivityComposer clubId={clubId} onProposed={refresh} />

      {activities.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}

      <Group title={t("groupActive", { count: active.length })}>
        {active.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
          />
        ))}
      </Group>

      <ProposalModeration
        proposals={proposed}
        clubSlug={clubSlug}
        canModerate={isModerator}
        onChanged={refresh}
      />

      <Group title={t("groupFinished")}>
        {finished.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            muted
          />
        ))}
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode[] }) {
  if (children.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
