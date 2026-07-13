"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { getCriteriaChallengeProgress } from "@/lib/clubs/activities/criteria-challenge";
import type { CriteriaChallengeView } from "@/lib/clubs/activities/criteria-challenge-types";
import { ProgressBar } from "@/components/ui/progress-bar";

// DetailExtension de criteria_challenge (EPIC-05, Bloque H4). Mismo patrón de montaje que
// BuddyReadCheckpoints (H1) y ListChallengeBoard (H3): estado propio con su propio fetch.
//
// Solo para participantes -- coherente con la RPC, que no devuelve nada a un no-participante.
// Sin botón de "marcar": el progreso sale de los pases de diario, no hay nada que pulsar aquí.
export function CriteriaChallengeBoard({
  activity,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<CriteriaChallengeView | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const fresh = await getCriteriaChallengeProgress(activity.id);
      setView(fresh);
    });
  }, [activity.id, activity.status]);

  if (!activity.viewerIsParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("criteriaProgress")}</h2>
        <p className="text-xs text-muted-foreground">{t("criteriaJoinToSee")}</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("criteriaProgress")}</h2>
        <p className="text-xs text-muted-foreground">{t("criteriaNoConfig")}</p>
      </div>
    );
  }

  const { config, participants, clubTotal } = view;
  const viewer = participants.find((p) => p.isViewer);
  const isCooperative = config.mode === "cooperative";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("criteriaProgress")}</h2>

      {isCooperative ? (
        // Meta colectiva: una sola barra, la suma de todos contra el objetivo del club.
        <ProgressBar
          current={Math.min(clubTotal, config.targetCount)}
          total={config.targetCount}
          label={t("criteriaClubProgress", { done: clubTotal, total: config.targetCount })}
        />
      ) : (
        viewer && (
          <ProgressBar
            current={viewer.completed}
            total={config.targetCount}
            label={t("criteriaMyProgress", {
              done: viewer.rawCompleted,
              total: config.targetCount,
            })}
          />
        )
      )}

      <div className="flex flex-col gap-2">
        {participants.map((p, index) => {
          const percent =
            config.targetCount > 0
              ? Math.min(100, Math.round((p.rawCompleted / config.targetCount) * 100))
              : 0;
          return (
            <div
              key={p.userId}
              className={`flex items-center gap-3 rounded-md border border-border p-2 ${
                p.isViewer ? "bg-accent/5" : ""
              }`}
            >
              {/* La posición solo significa ranking en modo competitivo. */}
              {!isCooperative && (
                <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {p.displayName || p.username}
              </span>
              <div className="w-24 shrink-0">
                <ProgressBar current={p.completed} total={config.targetCount} />
              </div>
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {p.rawCompleted}/{config.targetCount}
                {!isCooperative && ` · ${percent}%`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Igual que en H3: sin esta línea el tablero es un misterio, porque no hay nada que
          pulsar -- el progreso sale solo de lo que registres en tu diario. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("criteriaRule", { start: view.windowStart, end: view.windowEnd })}
      </p>
    </div>
  );
}
