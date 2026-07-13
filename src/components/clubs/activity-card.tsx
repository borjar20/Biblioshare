"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";

const STATUS_STYLE: Record<ClubActivity["status"], string> = {
  proposed: "bg-surface-muted text-muted-foreground",
  active: "bg-accent/15 text-accent",
  finished: "bg-surface-muted text-muted-foreground",
  archived: "bg-surface-muted text-muted-foreground",
};

export function ActivityCard({
  activity,
  clubSlug,
  actions,
}: {
  activity: ClubActivity;
  clubSlug: string;
  /** Aprobar / rechazar, en las propuestas que esperan moderación. */
  actions?: ReactNode;
}) {
  const t = useTranslations("activity");
  const accent = ACTIVITY_ACCENT[activity.kind];

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <Link
        href={`/club/${clubSlug}/actividad/${activity.id}`}
        className="flex items-center gap-3 hover:opacity-80"
      >
        {/* El tipo se reconoce por su icono y su color, sin tener que leer. */}
        <span
          aria-hidden
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-chip border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
        >
          <accent.Icon className="h-4 w-4" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-serif text-sm font-semibold text-foreground">
            {activity.title}
          </span>
          {/* Sin truncate: en móvil "lectura conjunta · 0 participantes" no cabe
              en una línea, y cortarlo a media palabra no ayuda a nadie. */}
          <span className={`font-mono text-[10px] tracking-wider uppercase ${accent.text}`}>
            {t(`kind_${activity.kind}`)} ·{" "}
            {t("participants", { count: activity.participantCount })}
          </span>
        </span>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${STATUS_STYLE[activity.status]}`}
        >
          {t(`status_${activity.status}`)}
        </span>
      </Link>

      {actions && <div className="flex gap-2 border-t border-border pt-3">{actions}</div>}
    </div>
  );
}
