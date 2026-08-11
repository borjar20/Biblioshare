"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getActivityCheckpoints, type ActivityCheckpointsView } from "@/lib/clubs/activities/checkpoints";
import type { ActivityStatus } from "@/lib/clubs/activities/core";
import { CheckpointManager } from "./checkpoint-manager";

// Gestión de hitos dentro de "Modificar actividad" (antes vivía en el board de
// buddy_read). Estado propio, mismo patrón que BuddyReadCheckpoints: al volver
// al detalle, aquel re-fetchea en su mount, así que no hace falta encadenar
// nada al refresh de la actividad. Sin ítem en el pool no hay posiciones que
// medir -> no se pinta.
export function BuddyReadCheckpointEditor({
  activityId,
  status,
}: {
  activityId: string;
  status: ActivityStatus;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<ActivityCheckpointsView | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const fresh = await getActivityCheckpoints(activityId);
      setView(fresh);
    });
  }

  useEffect(() => {
    refresh();
    // refresh se recrea cada render (no memoizada) pero solo debe re-disparar si cambia la actividad
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  if (!view || !view.itemType) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="label-section">
        {t("checkpoints")}
      </h2>
      <CheckpointManager
        activityId={activityId}
        itemType={view.itemType}
        checkpoints={view.checkpoints}
        disabled={status !== "active"}
        onChanged={refresh}
      />
    </div>
  );
}
