"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { getActivityCheckpoints, type ActivityCheckpointsView } from "@/lib/clubs/activities/checkpoints";
import { CheckpointManager } from "./checkpoint-manager";
import { CheckpointList } from "./checkpoint-list";

// DetailExtension de buddy_read (registro de kinds, EPIC-05 Bloque H1) --
// se monta para cualquier miembro del club, no gateado a isParticipant
// (decisión 7 del diseño: la lista de checkpoints ayuda a decidir si
// unirse). Estado propio con su propio refresh: los cambios de checkpoints
// no requieren refrescar el resto de la ficha de actividad (items/opiniones)
// que gestiona ActivityDetailView.
export function BuddyReadCheckpoints({
  activity,
  isModerator,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<ActivityCheckpointsView | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const fresh = await getActivityCheckpoints(activity.id);
      setView(fresh);
    });
  }

  useEffect(() => {
    refresh();
    // refresh se recrea cada render (no memoizada) pero solo debe re-disparar si cambia la actividad
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id]);

  if (!view || !view.itemType) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("checkpoints")}</h2>
      {isModerator && (
        <CheckpointManager
          activityId={activity.id}
          itemType={view.itemType}
          checkpoints={view.checkpoints}
          disabled={activity.status !== "active"}
          onChanged={refresh}
        />
      )}
      <CheckpointList
        itemType={view.itemType}
        checkpoints={view.checkpoints}
        groupSafeOrder={view.groupSafeOrder}
        onChanged={refresh}
      />
    </div>
  );
}
