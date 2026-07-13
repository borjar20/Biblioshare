"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  activateActivity,
  archiveActivity,
  finishActivity,
  getActivity,
  joinActivity,
  leaveActivity,
  type ActivityDetail,
} from "@/lib/clubs/activities/core";
import { ActivityItemPool } from "./activity-item-pool";
import { ActivityOpinions } from "./activity-opinions";
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import { Button } from "@/components/ui/button";

export function ActivityDetailView({
  activity: initialActivity,
  viewerId,
  viewerRole,
  clubSlug,
}: {
  activity: ActivityDetail;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const [activity, setActivity] = useState(initialActivity);
  const [status, setStatus] = useState(activity.status);
  const [isParticipant, setIsParticipant] = useState(activity.viewerIsParticipant);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isModerator = viewerRole === "moderator" || viewerRole === "owner";
  const isCreator = activity.createdBy === viewerId;
  const kindDefinition = getActivityKindDefinition(activity.kind);
  const DetailExtension = kindDefinition.DetailExtension;

  function refreshActivity() {
    startTransition(async () => {
      const fresh = await getActivity(activity.id);
      if (fresh) {
        setActivity(fresh);
        setStatus(fresh.status);
        setIsParticipant(fresh.viewerIsParticipant);
      }
    });
  }

  function run(action: () => Promise<void>, onSuccess: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onSuccess();
      } catch {
        setError(t("activateError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/club/${clubSlug}`} className="text-xs text-muted-foreground hover:text-foreground">
        {t("backToClub")}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{activity.title}</h1>
        <span className="text-xs text-muted-foreground">
          {t(`kind_${activity.kind}`)} · {t(`status_${status}`)}
        </span>
        {activity.description && <p className="text-sm text-muted-foreground">{activity.description}</p>}
      </div>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {isModerator && status === "proposed" && (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => activateActivity(activity.id), () => setStatus("active"))}
          >
            {t("activate")}
          </Button>
        )}
        {(isCreator || isModerator) && status === "active" && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => finishActivity(activity.id), () => setStatus("finished"))}
          >
            {t("finish")}
          </Button>
        )}
        {isModerator && (status === "proposed" || status === "active") && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => archiveActivity(activity.id), () => setStatus("archived"))}
          >
            {t("archive")}
          </Button>
        )}
        {status === "active" && !isParticipant && (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => joinActivity(activity.id), refreshActivity)}
          >
            {t("join")}
          </Button>
        )}
        {isParticipant && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => leaveActivity(activity.id), refreshActivity)}
          >
            {t("leave")}
          </Button>
        )}
      </div>

      {/* Aviso antes de unirse (cierra Q5 y Q8 del backlog): unirse añade los
          ítems del pool a tu biblioteca como pendientes y comparte tu progreso
          con los participantes, aunque tu perfil sea privado fuera. */}
      {status === "active" && !isParticipant && activity.items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("joinDisclosure", { count: activity.items.length })}
        </p>
      )}

      {/* criteria_challenge (H4) no tiene pool: su reto se describe por criterio, no se
          enumera -- y sin ítems tampoco hay opiniones por ítem que mostrar. */}
      {kindDefinition.usesItemPool && (
        <>
          <ActivityItemPool
            activityId={activity.id}
            items={activity.items}
            viewerId={viewerId}
            isParticipant={isParticipant}
            isCreator={isCreator}
            canModerate={isModerator}
            allowedItemTypes={kindDefinition.allowedItemTypes}
            maxItems={kindDefinition.maxItems}
            itemCuration={kindDefinition.itemCuration}
            onChanged={refreshActivity}
          />

          <ActivityOpinions
            activity={activity}
            viewerId={viewerId}
            isParticipant={isParticipant}
            onChanged={refreshActivity}
          />
        </>
      )}

      {DetailExtension && (
        <DetailExtension
          activity={activity}
          viewerId={viewerId}
          isModerator={isModerator}
          onChanged={refreshActivity}
        />
      )}
    </div>
  );
}
