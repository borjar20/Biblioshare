"use client";

import { useEffect, useState, useTransition } from "react";
import type { ComponentType, ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { getActivityCheckpoints, type ActivityCheckpointsView } from "@/lib/clubs/activities/checkpoints";
import { nextCheckpoint } from "@/lib/clubs/activities/next-checkpoint";
import { formatPosition } from "@/lib/library/position";
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";
import { CheckpointList } from "./checkpoint-list";

// DetailExtension de buddy_read (registro de kinds, EPIC-05 Bloque H1) --
// se monta para cualquier miembro del club, no gateado a isParticipant
// (decisión 7 del diseño: la lista de checkpoints ayuda a decidir si
// unirse). Estado propio con su propio refresh: los cambios de checkpoints
// no requieren refrescar el resto de la ficha de actividad (items/opiniones)
// que gestiona ActivityDetailView. Solo lectura: el alta/edición de hitos vive
// en "Modificar actividad" (BuddyReadCheckpointEditor).
export function BuddyReadCheckpoints({ activity, Layout, railExtra }: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
  clubSlug: string;
  Layout: ComponentType<ActivityLayoutProps>;
  railExtra: ReactNode;
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

  const upcoming = nextCheckpoint(view.checkpoints);

  return (
    <Layout
      railExtra={railExtra}
      railTop={
        activity.viewerIsParticipant && item && total > 0 ? (
          <div className="flex flex-col gap-3">
            {/* Sin encabezado propio: «Hitos» titula el tablero (body) y la
                tarjeta ya dice «Tu progreso». Repetir el h2 aquí lo duplicaría
                en móvil, donde las dos ranuras quedan seguidas. */}
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
                <p className="font-serif text-sm font-semibold text-foreground">
                  {t("yourProgress")}
                </p>
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
          </div>
        ) : undefined
      }
      body={
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("checkpoints")}
          </h2>
          <CheckpointList
            itemType={view.itemType}
            checkpoints={view.checkpoints}
            groupSafeOrder={view.groupSafeOrder}
            onChanged={refresh}
          />
        </div>
      }
      railBottom={
        // El `status` de un checkpoint es POR VIEWER (confirmado/pendiente es
        // relativo a quién mira): igual que "Tu progreso" en `railTop`, "Próximo
        // hito" solo tiene sentido gateado a participante -- si no, un no
        // participante vería "Próximo hito: Hito 1" sin que signifique nada
        // para él.
        activity.viewerIsParticipant && upcoming ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t("nextCheckpoint")}
            </h3>
            <div className="rounded-card border border-border bg-surface p-3 shadow-card">
              <p className="text-[12.5px] font-semibold text-foreground">{upcoming.label}</p>
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
