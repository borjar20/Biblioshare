"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  activateActivity,
  archiveActivity,
  type ClubActivity,
} from "@/lib/clubs/activities/core";
import { Button } from "@/components/ui/button";
import { ActivityCard } from "./activity-card";

// Propuestas que esperan moderación, con aprobar/rechazar. Vive aquí, y no
// dentro de ActivityList, porque el mockup la enseña en DOS sitios (Actividades
// y Gestión) — y no quiero dos copias de la misma decisión.
export function ProposalModeration({
  proposals,
  clubSlug,
  canModerate,
}: {
  proposals: ClubActivity[];
  clubSlug: string;
  canModerate: boolean;
}) {
  const t = useTranslations("activity");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (proposals.length === 0) return null;

  function moderate(id: string, decision: "approve" | "reject") {
    setPendingId(id);
    startTransition(async () => {
      // Aprobar = activarla. Rechazar = archivarla: no se borra, queda el
      // rastro de que se propuso y se descartó. La propuesta cambia de grupo
      // porque activate/archive revalidan (Fase 1) y el padre deriva de props.
      await (decision === "approve"
        ? activateActivity(id)
        : archiveActivity(id));
      setPendingId(null);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("groupProposed", { count: proposals.length })}
      </h2>

      <div className="flex flex-col gap-2">
        {proposals.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            tint="gold"
            actions={
              canModerate ? (
                <>
                  <Button
                    type="button"
                    variant="green"
                    className="px-3.5 py-1.5 text-xs"
                    disabled={pendingId === activity.id}
                    onClick={() => moderate(activity.id, "approve")}
                  >
                    {t("approve")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3.5 py-1.5 text-xs"
                    disabled={pendingId === activity.id}
                    onClick={() => moderate(activity.id, "reject")}
                  >
                    {t("reject")}
                  </Button>
                </>
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
