"use client";

import { useTranslations } from "next-intl";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ListChallengeParticipantProgress } from "@/lib/clubs/activities/list-challenge-types";

// Barra propia + barra del club (EPIC-05 Bloque H3). La del club mide
// completados sobre el total de celdas posibles (ítems x participantes), que es
// la medida honesta de "cuánto lleva el club" en un reto comparativo.
export function ListChallengeSummary({
  itemCount,
  participants,
  viewerCompleted,
}: {
  itemCount: number;
  participants: ListChallengeParticipantProgress[];
  viewerCompleted: number;
}) {
  const t = useTranslations("activity");

  const clubCompleted = participants.reduce((sum, p) => sum + p.completedKeys.length, 0);
  const clubTotal = itemCount * participants.length;

  return (
    <div className="flex flex-col gap-2">
      <ProgressBar
        current={viewerCompleted}
        total={itemCount}
        label={t("listChallengeMyProgress", { done: viewerCompleted, total: itemCount })}
      />
      <ProgressBar
        current={clubCompleted}
        total={clubTotal}
        label={t("listChallengeClubProgress", { done: clubCompleted, total: clubTotal })}
      />
    </div>
  );
}
