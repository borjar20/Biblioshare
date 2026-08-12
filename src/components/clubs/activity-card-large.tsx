"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import type { ActivityProgress } from "@/lib/clubs/activities/progress";
import { describeProgress, type Translate } from "@/lib/clubs/activities/kind-metrics";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { formatEventDate } from "@/lib/clubs/activities/format-date";

// La tarjeta de "En curso" (spec 2026-08-12). La compacta (activity-card.tsx) se
// queda para el historial: la densidad la fija la SECCIÓN, no el estado de la
// fila -- una tarjeta grande por cada actividad terminada convierte el historial
// en un muro.
//
// Toda la tarjeta es clicable con UN solo <Link>, y el CTA es un <span> con
// aspecto de botón: un <button> dentro de un <a> es HTML inválido y un lío para
// el teclado.
export function ActivityCardLarge({
  activity,
  clubSlug,
  progress,
  today,
}: {
  activity: ClubActivity;
  clubSlug: string;
  progress: ActivityProgress | undefined;
  /** "Hoy" del SERVIDOR (#271): los días restantes no pueden depender del reloj
   *  del visitante o contradirían al calendario del club. */
  today: string;
}) {
  const t = useTranslations("activity");
  // El `t` de next-intl solo acepta claves existentes, así que no encaja en
  // Translate (que acepta cualquier string). Se envuelve UNA vez, aquí: las
  // claves que elige describeProgress existen todas en messages/es.json.
  const tr: Translate = (key, values) => t(key as never, values as never);
  const accent = ACTIVITY_ACCENT[activity.kind];
  const labels = describeProgress(activity.kind, progress, tr);
  const participants = progress?.participants ?? activity.participantCount;

  const cta = activity.viewerIsParticipant ? t("ctaContinue") : t("ctaJoin");
  const restantes = activity.endsOn ? diasHasta(today, activity.endsOn) : null;

  return (
    <Link
      href={`/club/${clubSlug}/actividad/${activity.id}`}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
        >
          <accent.Icon className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-serif text-base font-semibold text-foreground">
            {activity.title}
          </span>
          <span className="label-section">{t(`kind_${activity.kind}`)}</span>
        </div>
        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] tracking-wider text-accent uppercase">
          {t("status_active")}
        </span>
      </div>

      {activity.description && (
        <p className="line-clamp-2 text-[13px] text-muted-foreground">
          {activity.description}
        </p>
      )}

      {labels.collectiveLabel && (
        <ProgressRow
          caption={t("progressGroup")}
          label={labels.collectiveLabel}
          percent={labels.collectivePercent}
          bar={accent.bar}
        />
      )}
      {labels.viewerLabel && activity.viewerIsParticipant && (
        <ProgressRow
          caption={t("progressViewer")}
          label={labels.viewerLabel}
          percent={labels.viewerPercent}
          bar={accent.bar}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="label-section">
          {t("participants", { count: participants })}
          {activity.endsOn && ` · ${t("cardEndsOn", { date: formatEventDate(activity.endsOn) })}`}
          {/* Solo a partir de un día: el mismo día que termina, "quedan 0 días"
              es una forma peor de decir lo que la fecha de al lado ya dice. */}
          {restantes !== null && restantes > 0 && ` · ${t("daysLeft", { count: restantes })}`}
        </span>
        {/* La flecha es adorno: sin aria-hidden se cuela en el nombre accesible
            del enlace, que es la tarjeta ENTERA -- quien use lector de pantalla
            oye "Continuar flecha derecha Saltire y Cenizas...". */}
        <span className={buttonLikeClasses}>
          {cta}
          <span aria-hidden> →</span>
        </span>
      </div>
    </Link>
  );
}

const buttonLikeClasses =
  "shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[11px] tracking-wide text-accent uppercase";

function ProgressRow({
  caption,
  label,
  percent,
  bar,
}: {
  caption: string;
  label: string;
  percent: number | null;
  bar: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 label-section">{caption}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={`block h-full rounded-full ${bar}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

// Días entre dos fechas ISO. Se construye desde NÚMEROS (hora local), nunca
// `new Date("2026-08-16")`, que se interpreta como UTC y puede retroceder un día.
function diasHasta(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  const ms = new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
  return Math.round(ms / 86_400_000);
}
