"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { type ClubActivity } from "@/lib/clubs/activities/core";
import type { ActivityProgress } from "@/lib/clubs/activities/progress";
import { groupActivities } from "@/lib/clubs/activities/group-activities";
import { proposeHref } from "@/lib/clubs/activities/propose-url";
import { ActivityComposer, ProposeActivityLink } from "./activity-composer";
import { ActivityCard } from "./activity-card";
import { ActivityCardLarge } from "./activity-card-large";
import { ActivityCardUpcoming } from "./activity-card-upcoming";
import { ActivityEmptyState } from "./activity-empty-state";
import { ActivitySectionNav } from "./activity-section-nav";
import { ProposalModeration } from "./proposal-moderation";

// Las actividades se agrupan por lo que el miembro viene a preguntar --qué toca
// ahora, qué viene, qué hicimos-- no por el `status` crudo de la fila. Y las
// propuestas van en su propio bloque: son una cola de moderación, no una
// actividad programada (spec 2026-08-12).
export function ActivityList({
  clubId,
  clubSlug,
  initialActivities,
  isModerator,
  today,
  progress,
  composerOpen,
  hasAside,
  aside,
}: {
  clubId: string;
  clubSlug: string;
  initialActivities: ClubActivity[];
  isModerator: boolean;
  /** "Hoy" del SERVIDOR (YYYY-MM-DD): decide qué es "en curso" y qué "próxima",
   *  y con el reloj del visitante eso cambiaría según el huso (#271). */
  today: string;
  /** Solo trae las de "En curso": del resto no se pide progreso. */
  progress: Map<string, ActivityProgress>;
  composerOpen: boolean;
  /** Si `aside` va a pintar algo. Decidida por quien llama (con la MISMA
   *  lógica que decide si `aside` es null), porque una pista de grid no
   *  desaparece porque su hijo pinte null -- sin esto la columna de 320px se
   *  queda reservada y en blanco, y la principal no se centra. */
  hasAside: boolean;
  /** El rail, ya resuelto en servidor. null si no tiene nada que decir. */
  aside: ReactNode;
}) {
  const t = useTranslations("activity");
  const tt = useTranslations("club.tabs");
  // Deriva de props: proponer/moderar revalida y la RSC re-ejecuta con las
  // actividades frescas. Sin espejo local ni re-fetch cliente.
  const { enCurso, proximas, proposed, finished } = groupActivities(
    initialActivities,
    today,
  );

  const sinNada =
    enCurso.length === 0 &&
    proximas.length === 0 &&
    proposed.length === 0 &&
    finished.length === 0;

  const sections = [
    enCurso.length > 0 ? { id: "en-curso", label: t("navOngoing") } : null,
    { id: "proximas", label: t("navUpcoming") },
    { id: "historial", label: t("navHistory") },
  ].filter((s): s is { id: string; label: string } => s !== null);

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera propia SOLO en móvil: en escritorio el título y el botón ya
          están en la cabecera sticky del shell, y repetirlos sería dos veces la
          misma acción en la misma pantalla. */}
      <div className="flex flex-col gap-2 lg:hidden">
        <h1 className="font-serif text-[23px] leading-tight font-semibold text-foreground">
          {tt("actividades")}
        </h1>
        <p className="text-[13px] text-muted-foreground">{t("pageSubtitle")}</p>
        {/* Escondido mientras el asistente está abierto: el botón y el
            asistente eran mutuamente excluyentes antes de partirlos, y dos
            entradas vivas a la misma acción a la vez es peor que ninguna. */}
        {!composerOpen && (
          <ProposeActivityLink clubSlug={clubSlug} className="w-full justify-center" />
        )}
      </div>

      <ActivityComposer
        clubId={clubId}
        clubSlug={clubSlug}
        isModerator={isModerator}
        open={composerOpen}
      />

      {sinNada ? (
        <ActivityEmptyState
          title={t("emptyAllTitle")}
          body={t("emptyAllBody")}
          actionHref={proposeHref(clubSlug)}
          actionLabel={t("propose")}
        />
      ) : (
        <>
          {!composerOpen && <ActivitySectionNav sections={sections} />}

          <div
            className={
              hasAside
                ? "flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-7"
                : "flex flex-col gap-6 lg:mx-auto lg:max-w-3xl"
            }
          >
            <div className="flex min-w-0 flex-col gap-6">
              <ProposalModeration
                proposals={proposed}
                clubSlug={clubSlug}
                canModerate={isModerator}
                today={today}
                layout="grid"
              />

              {enCurso.length > 0 && (
                <Section id="en-curso" title={t("groupOngoing", { count: enCurso.length })}>
                  {enCurso.map((activity) => (
                    <ActivityCardLarge
                      key={activity.id}
                      activity={activity}
                      clubSlug={clubSlug}
                      progress={progress.get(activity.id)}
                      today={today}
                    />
                  ))}
                </Section>
              )}

              <Section id="proximas" title={t("groupUpcoming", { count: proximas.length })}>
                {proximas.length > 0 ? (
                  proximas.map((activity) => (
                    <ActivityCardUpcoming
                      key={activity.id}
                      activity={activity}
                      clubSlug={clubSlug}
                    />
                  ))
                ) : (
                  <ActivityEmptyState
                    title={t("emptyUpcomingTitle")}
                    body={t("emptyUpcomingBody")}
                    actionHref={proposeHref(clubSlug)}
                    actionLabel={t("propose")}
                  />
                )}
              </Section>

              <Section id="historial" title={t("groupHistory", { count: finished.length })}>
                {finished.length > 0 ? (
                  <div className="grid gap-2 lg:grid-cols-2">
                    {finished.map((activity) => (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        clubSlug={clubSlug}
                        today={today}
                        muted
                      />
                    ))}
                  </div>
                ) : (
                  <ActivityEmptyState
                    title={t("emptyHistoryTitle")}
                    body={t("emptyHistoryBody")}
                  />
                )}
              </Section>
            </div>

            {aside}
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="label-section">{title}</h2>
      {children}
    </section>
  );
}
