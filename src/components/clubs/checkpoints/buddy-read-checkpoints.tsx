"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { getActivityCheckpoints, type ActivityCheckpointsView } from "@/lib/clubs/activities/checkpoints";
import { formatPosition } from "@/lib/library/position";
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

  // Card "Tu progreso" (mockup frame 4): posición del diario + hitos
  // confirmados. El % de la barra sale de los hitos, no de la página -- es lo
  // único comparable entre libro y serie sin conocer la longitud de la obra.
  const item = activity.items[0];
  const total = view.checkpoints.length;
  const confirmedCount = view.checkpoints.filter((c) => c.status === "confirmed").length;
  const positionLabel = view.viewerPosition
    ? formatPosition(view.itemType, view.viewerPosition)
    : null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("checkpoints")}
      </h2>
      {activity.viewerIsParticipant && item && total > 0 && (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card">
          {item.itemCoverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
            <img
              src={item.itemCoverUrl}
              alt=""
              className="h-[66px] w-[44px] shrink-0 rounded-[5px] object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="font-serif text-sm font-semibold text-foreground">{t("yourProgress")}</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {positionLabel ? `${positionLabel} · ` : ""}
              {confirmedCount > 0
                ? t("yourProgressCheckpoints", { current: confirmedCount, total })
                : t("yourProgressNone")}
            </p>
            <div className="mt-2 h-[5px] w-[150px] overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round((confirmedCount / total) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
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
