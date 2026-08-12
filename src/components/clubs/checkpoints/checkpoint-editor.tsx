"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getActivityCheckpoints, type ActivityCheckpointsView } from "@/lib/clubs/activities/checkpoints";
import type { ActivityStatus } from "@/lib/clubs/activities/core";
import { CheckpointManager } from "./checkpoint-manager";

// Gestión de hitos dentro del tablero de buddy_read (spec 2026-08-12, #597).
// Estado propio, mismo patrón que BuddyReadCheckpoints: al volver al detalle,
// aquel re-fetchea en su mount, así que no hace falta encadenar nada al
// refresh de la actividad. Sin ítem en el pool no hay posiciones que medir ->
// no se pinta el manager, pero sí un aviso (antes era un `null` mudo).
export function BuddyReadCheckpointEditor({
  activityId,
  status,
  onChanged,
}: {
  activityId: string;
  status: ActivityStatus;
  onChanged?: () => void;
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

  function handleChanged() {
    // Refresca la copia propia (el manager la necesita para renderizar) y la
    // del tablero (la lista de arriba): si solo se llama a la propia, las dos
    // vistas del mismo dato divergen en cuanto alguien añade un hito.
    refresh();
    onChanged?.();
  }

  useEffect(() => {
    refresh();
    // refresh se recrea cada render (no memoizada) pero solo debe re-disparar si cambia la actividad
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  if (!view) return null;

  // Sin ítem en el pool no hay posiciones que medir, así que no hay hitos que
  // crear. Antes esto devolvía null sin más: escondido dentro de "Modificar
  // actividad" pasaba desapercibido, pero en el tablero deja un hueco mudo.
  if (!view.itemType) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="label-section">{t("checkpoints")}</h2>
        <p className="text-[12.5px] text-muted-foreground">
          {t("checkpointsPickItemFirst")}
        </p>
      </div>
    );
  }

  const congelado = status !== "active";

  return (
    <div className="flex flex-col gap-2">
      <h2 className="label-section">{t("checkpoints")}</h2>
      {/* La RLS solo permite tocar hitos con la actividad ACTIVE
          (20260713_activity_checkpoints.sql:225-250). Se dice, en vez de dejar
          unos controles apagados sin explicación. */}
      {congelado && (
        <p className="text-[12.5px] text-muted-foreground">
          {t("checkpointsFrozenInProposal")}
        </p>
      )}
      <CheckpointManager
        activityId={activityId}
        itemType={view.itemType}
        checkpoints={view.checkpoints}
        disabled={congelado}
        onChanged={handleChanged}
      />
    </div>
  );
}
