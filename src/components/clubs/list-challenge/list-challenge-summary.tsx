"use client";

import { useTranslations } from "next-intl";
import { ProgressRing } from "@/components/ui/progress-ring";

// Card "board-you" del mockup (Paper · Clubes, frame de reto de lista): anillo
// con tu avance y tu puesto en el club. La medida colectiva ya no va en barra:
// vive en la clasificación por miembro que pinta el board debajo.
export function ListChallengeSummary({
  itemCount,
  viewerCompleted,
  position,
  participantCount,
}: {
  itemCount: number;
  viewerCompleted: number;
  position: number;
  participantCount: number;
}) {
  const t = useTranslations("activity");
  const percent = itemCount > 0 ? (viewerCompleted / itemCount) * 100 : 0;

  return (
    <div className="flex items-center gap-3.5 rounded-card border border-border bg-surface p-3.5 shadow-card">
      <ProgressRing
        percent={percent}
        color="accent"
        label={t("listChallengeYourAdvance", { done: viewerCompleted, total: itemCount })}
      >
        {viewerCompleted}
      </ProgressRing>
      <div className="min-w-0">
        <p className="font-serif text-[15px] font-semibold text-foreground">
          {t("listChallengeYourAdvance", { done: viewerCompleted, total: itemCount })}
        </p>
        {position > 0 && participantCount > 1 && (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {t("listChallengeRank", { position, count: participantCount })}
          </p>
        )}
      </div>
    </div>
  );
}
