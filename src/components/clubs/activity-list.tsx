"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { type ClubActivity } from "@/lib/clubs/activities/core";
import { groupActivities } from "@/lib/clubs/activities/group-activities";
import { ActivityComposer } from "./activity-composer";
import { ActivityCard } from "./activity-card";
import { ProposalModeration } from "./proposal-moderation";

// Las actividades se agrupan por estado, no en una lista plana: "esperan
// moderación" es lo que un moderador viene a resolver, y "activas" lo que un
// miembro viene a mirar. Mezcladas, ninguna de las dos se encuentra.
export function ActivityList({
  clubId,
  clubSlug,
  initialActivities,
  isModerator,
  today,
}: {
  clubId: string;
  clubSlug: string;
  initialActivities: ClubActivity[];
  isModerator: boolean;
  /** "Hoy" del SERVIDOR (YYYY-MM-DD). Antes se calculaba con `todayISO()` en el
   *  navegador, así que el "pasado" del agrupado y de la píldora "Ya pasó"
   *  respondía al huso del visitante y podía contradecir al calendario del club,
   *  que lo lee del servidor (#271). Ahora viaja como prop desde la página. */
  today: string;
}) {
  const t = useTranslations("activity");
  // Deriva de props: proponer/moderar revalida (Fase 1) y la RSC re-ejecuta con
  // las actividades frescas. Sin espejo local ni re-fetch cliente.
  const activities = initialActivities;

  const { active, proposed, finished } = groupActivities(activities);

  // El vacío se gatea por los TRES grupos ya filtrados, nunca por
  // `activities.length`: la lista cruda SIGUE trayendo los eventos (es
  // groupActivities quien los descarta, spec 2026-08-11), así que en un club
  // cuyas únicas actividades son eventos `activities.length` es > 0, los tres
  // <Group> devuelven null por vacíos y el mensaje no se pintaba -- se veía el
  // botón "Proponer actividad" sobre un hueco, sin ninguna explicación.
  const sinActividades =
    active.length === 0 && proposed.length === 0 && finished.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <ActivityComposer
        clubId={clubId}
        clubSlug={clubSlug}
        isModerator={isModerator}
      />

      {sinActividades && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}

      <Group title={t("groupActive", { count: active.length })}>
        {active.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            today={today}
          />
        ))}
      </Group>

      <ProposalModeration
        proposals={proposed}
        clubSlug={clubSlug}
        canModerate={isModerator}
        today={today}
        layout="grid"
      />

      <Group title={t("groupFinished")}>
        {finished.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            today={today}
            muted
          />
        ))}
      </Group>
    </div>
  );
}

// En escritorio (frame 12) las actividades van en rejilla de 2 columnas por
// estado; en móvil, una sola columna.
function Group({ title, children }: { title: string; children: ReactNode[] }) {
  if (children.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-section">
        {title}
      </h2>
      <div className="grid gap-2 lg:grid-cols-2">{children}</div>
    </section>
  );
}
