"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";

// Tarjeta de "Próximas": densidad media. Lo que se pregunta de algo que aún no
// ha empezado es CUÁNDO empieza, así que la fecha ocupa el sitio de la baldosa
// de tipo y el icono se va al renglón de la meta.
export function ActivityCardUpcoming({
  activity,
  clubSlug,
}: {
  activity: ClubActivity;
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const accent = ACTIVITY_ACCENT[activity.kind];
  const fecha = activity.startsOn ? formatDayMonth(activity.startsOn) : null;

  return (
    <Link
      href={`/club/${clubSlug}/actividad/${activity.id}`}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40"
    >
      {fecha && (
        <span
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-[10px] border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono text-sm font-semibold">{fecha.day}</span>
            <span className="font-mono text-[9px] tracking-wider uppercase">{fecha.month}</span>
          </span>
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-serif text-sm font-semibold text-foreground">
          {activity.title}
        </span>
        <span className="label-section">
          {t(`kind_${activity.kind}`)}
          {` · ${t("participants", { count: activity.participantCount })}`}
        </span>
      </span>

      <span className="shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {t("ctaView")} →
      </span>
    </Link>
  );
}
