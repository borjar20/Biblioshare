"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { confirmCheckpoint, type CheckpointViewModel } from "@/lib/clubs/activities/checkpoints";
import { formatPosition } from "@/lib/library/position";
import type { ItemType } from "@/lib/catalog/types";
import { CheckpointChat } from "./checkpoint-chat";
import { Button } from "@/components/ui/button";

// Lista de checkpoints con estado por viewer + chat (EPIC-05, Bloque H1).
// Visible para cualquier miembro del club (decisión 7 del diseño) -- el
// componente padre (BuddyReadCheckpoints) no la gatea a isParticipant; el
// botón "confirmar" y el chat gestionan su propio acceso vía RLS.
// El chat asume viewer logueado -- toda la ruta /club/[slug] requiere auth
// (SD-4, sin lectura anónima de contenido de club), mismo supuesto que
// ActivityOpinions/ActivityItemPool ya hacen en este árbol.
export function CheckpointList({
  itemType,
  checkpoints,
  groupSafeOrder,
  onChanged,
}: {
  itemType: ItemType;
  checkpoints: CheckpointViewModel[];
  groupSafeOrder: number | null;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm(checkpointId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await confirmCheckpoint(checkpointId);
        onChanged();
      } catch {
        setError(t("checkpointNotReachedError"));
      }
    });
  }

  if (checkpoints.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("checkpointsEmpty")}</p>;
  }

  const safeCheckpoint =
    groupSafeOrder != null ? checkpoints.find((c) => c.order === groupSafeOrder) : null;

  return (
    <div className="flex flex-col gap-3">
      {safeCheckpoint && (
        <p className="text-xs text-muted-foreground">
          {t("groupSafeCheckpoint", { label: safeCheckpoint.label })}
        </p>
      )}
      {error && <p className="text-xs text-status-dropped">{error}</p>}
      <div className="flex flex-col gap-2">
        {checkpoints.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{c.label}</span>
                <span className="text-xs text-muted-foreground">
                  {formatPosition(itemType, c.position)} · {t(`checkpointStatus_${c.status}`)} ·{" "}
                  {t("checkpointReachedBy", { reached: c.reachedByCount, total: c.participantCount })}
                </span>
              </div>
              {c.status !== "confirmed" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => handleConfirm(c.id)}
                >
                  {t("confirmCheckpoint")}
                </Button>
              )}
            </div>
            <CheckpointChat checkpointId={c.id} summary={c.chat} viewerLoggedIn />
          </div>
        ))}
      </div>
    </div>
  );
}
