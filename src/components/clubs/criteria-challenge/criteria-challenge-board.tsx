"use client";

import { useEffect, useState, useTransition } from "react";
import type { ComponentType, ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { getCriteriaChallengeProgress } from "@/lib/clubs/activities/criteria-challenge";
import type { CriteriaChallengeView } from "@/lib/clubs/activities/criteria-challenge-types";
import { ProgressRing } from "@/components/ui/progress-ring";
import { MemberRankRow } from "@/components/clubs/member-rank-row";
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";

// DetailExtension de criteria_challenge (EPIC-05, Bloque H4). Mismo patrón de montaje que
// BuddyReadCheckpoints (H1) y ListChallengeBoard (H3): estado propio con su propio fetch.
//
// Solo para participantes -- coherente con la RPC, que no devuelve nada a un no-participante.
// Sin botón de "marcar": el progreso sale de los pases de diario, no hay nada que pulsar aquí.
//
// Layout del mockup (Paper · Clubes, frame de reto genérico). El "modeseg" del mockup es un
// conmutador; aquí el modo es config congelada de la actividad, así que se pinta como chip
// estático (desviación consciente). "Quedan N días" se fija al resolver el fetch (solo en
// cliente, nunca en la hidratación): un desfase de horas no se ve en un contador de días.
export function CriteriaChallengeBoard({
  activity,
  Layout,
  railExtra,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
  clubSlug: string;
  Layout: ComponentType<ActivityLayoutProps>;
  railExtra: ReactNode;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<CriteriaChallengeView | null>(null);
  const [daysLeft, setDaysLeft] = useState(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const fresh = await getCriteriaChallengeProgress(activity.id);
      setView(fresh);
      // "Quedan N días" se fija al resolver el fetch (Date.now() en render
      // viola la regla de pureza de react-hooks). Clamp a 0: nunca negativo.
      if (fresh) {
        setDaysLeft(
          Math.max(0, Math.ceil((Date.parse(fresh.windowEnd) - Date.now()) / 86400000)),
        );
      }
    });
  }, [activity.id, activity.status]);

  // Ambos early returns con contenido pasan por `Layout`: sin esto, a 1280 el
  // bloque de participantes no aparece en ningún sitio -- el flujo principal
  // lo oculta confiando en que el rail lo repite, pero sin `Layout` ese rail
  // nunca llega a montarse.
  if (!activity.viewerIsParticipant) {
    return (
      <Layout
        railExtra={railExtra}
        body={
          <div className="flex flex-col gap-2">
            <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t("criteriaProgress")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("criteriaJoinToSee")}</p>
          </div>
        }
      />
    );
  }

  if (!view) {
    return (
      <Layout
        railExtra={railExtra}
        body={
          <div className="flex flex-col gap-2">
            <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t("criteriaProgress")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("criteriaNoConfig")}</p>
          </div>
        }
      />
    );
  }

  const { config, participants, clubTotal } = view;
  const viewer = participants.find((p) => p.isViewer);
  const isCooperative = config.mode === "cooperative";
  // participants ya viene ordenado por progreso desde la lib; el índice ES el ranking.
  const viewerRank = participants.findIndex((p) => p.isViewer) + 1;

  const ringPercent =
    config.targetCount > 0
      ? ((isCooperative ? Math.min(clubTotal, config.targetCount) : (viewer?.completed ?? 0)) /
          config.targetCount) *
        100
      : 0;

  return (
    <Layout
      railExtra={railExtra}
      railTop={
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("criteriaProgress")}
          </h2>

          <span className="inline-flex w-fit items-center rounded-chip bg-green/10 px-2 py-0.5 font-mono text-[9px] font-medium tracking-wider text-green uppercase">
            {t(isCooperative ? "criteriaModeChip_cooperative" : "criteriaModeChip_competitive")}
          </span>

          <div className="flex items-center gap-3.5 rounded-card border border-border bg-surface p-3.5 shadow-card">
            <ProgressRing percent={ringPercent} color="green">
              {isCooperative ? clubTotal : (viewer?.rawCompleted ?? 0)}
            </ProgressRing>
            <div className="min-w-0">
              <p className="font-serif text-[15px] font-semibold text-foreground">
                {isCooperative
                  ? t("criteriaClubHeadline", { done: clubTotal, total: config.targetCount })
                  : t("criteriaYourHeadline", {
                      done: viewer?.rawCompleted ?? 0,
                      total: config.targetCount,
                    })}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {isCooperative
                  ? t("criteriaCoopSubline", { days: daysLeft, count: viewer?.rawCompleted ?? 0 })
                  : t("criteriaCompSubline", {
                      position: viewerRank,
                      count: participants.length,
                      days: daysLeft,
                    })}
              </p>
            </div>
          </div>
        </div>
      }
      body={
        <div className="flex flex-col gap-3">
          <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t(isCooperative ? "criteriaWhoContributes" : "criteriaRanking")}
          </h3>
          <div className="flex flex-col">
            {participants.map((p, index) => (
              <MemberRankRow
                key={p.userId}
                position={isCooperative ? undefined : index + 1}
                name={p.displayName || p.username}
                avatarUrl={p.avatarUrl}
                isViewer={p.isViewer}
                percent={config.targetCount > 0 ? (p.completed / config.targetCount) * 100 : 0}
                counter={
                  isCooperative ? String(p.rawCompleted) : `${p.rawCompleted}/${config.targetCount}`
                }
                fill="green"
              />
            ))}
          </div>
        </div>
      }
      railBottom={
        <div className="flex flex-col gap-3">
          {/* Igual que en H3: sin esta línea el tablero es un misterio, porque no hay nada que
              pulsar -- el progreso sale solo de lo que registres en tu diario. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("criteriaRule", { start: view.windowStart, end: view.windowEnd })}
          </p>
        </div>
      }
    />
  );
}
