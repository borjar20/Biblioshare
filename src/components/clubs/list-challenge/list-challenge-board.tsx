"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { getListChallengeProgress } from "@/lib/clubs/activities/list-challenge";
import type { ListChallengeProgressView } from "@/lib/clubs/activities/list-challenge-types";
import { ListChallengeSummary } from "./list-challenge-summary";
import { ListChallengeGrid } from "./list-challenge-grid";

// DetailExtension de list_challenge (registro de kinds, EPIC-05 Bloque H3).
// Mismo patrón de montaje que BuddyReadCheckpoints (H1): estado propio + su
// propio refresh, sin arrastrar al resto de la ficha de actividad.
//
// A diferencia de los checkpoints de H1 (visibles a todo el club para decidir
// si unirse), el tablero es SOLO PARA PARTICIPANTES -- coherente con la RPC,
// que no devuelve nada a un no-participante, y con las opiniones, que ya son
// solo-participantes desde SD-8.
export function ListChallengeBoard({
  activity,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<ListChallengeProgressView | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const fresh = await getListChallengeProgress(activity.id);
      setView(fresh);
    });
    // Recarga también cuando cambia el pool (un curador añadió/quitó un ítem):
    // la rejilla se materializa cruzando el pool con el roster.
  }, [activity.id, activity.items.length]);

  if (activity.items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("listChallengeProgress")}</h2>
        <p className="text-xs text-muted-foreground">{t("listChallengeEmptyList")}</p>
      </div>
    );
  }

  if (!activity.viewerIsParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("listChallengeProgress")}</h2>
        <p className="text-xs text-muted-foreground">{t("listChallengeJoinToSee")}</p>
      </div>
    );
  }

  if (!view) return null;

  const viewer = view.participants.find((p) => p.isViewer);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("listChallengeProgress")}</h2>

      <ListChallengeSummary
        itemCount={activity.items.length}
        participants={view.participants}
        viewerCompleted={viewer?.completedKeys.length ?? 0}
      />

      <ListChallengeGrid items={activity.items} participants={view.participants} />

      {/* Esta línea es lo que hace legible la regla del reto: el progreso es
          DERIVADO, no se marca a mano. Sin ella, la rejilla es un misterio. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("listChallengeRule", { start: view.windowStart, end: view.windowEnd })}
      </p>
    </div>
  );
}
