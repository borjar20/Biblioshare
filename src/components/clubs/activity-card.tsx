"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import { formatEventDate } from "@/lib/clubs/activities/format-date";
import { isPastEvent } from "@/lib/clubs/activities/group-activities";

const STATUS_STYLE: Record<ClubActivity["status"], string> = {
  proposed: "bg-surface-muted text-muted-foreground",
  active: "bg-accent/15 text-accent",
  finished: "bg-surface-muted text-muted-foreground",
  archived: "bg-surface-muted text-muted-foreground",
};

export function ActivityCard({
  activity,
  clubSlug,
  today,
  actions,
  muted = false,
  tint,
}: {
  activity: ClubActivity;
  clubSlug: string;
  /** "Hoy" del SERVIDOR (YYYY-MM-DD), no `new Date()` del navegador: así la
   *  píldora "Ya pasó" responde a `starts_on` en el MISMO huso que el calendario
   *  del club (`getClubCalendarMarks`), y no se contradice con la tira "Próximo"
   *  en la misma pantalla cuando el reloj del visitante va en otro huso (#271). */
  today: string;
  /** Aprobar / rechazar, en las propuestas que esperan moderación. */
  actions?: ReactNode;
  /** Atenúa la tarjeta (finalizadas/archivadas). */
  muted?: boolean;
  /** Tinte dorado del handoff para las propuestas pendientes. */
  tint?: "gold";
}) {
  const t = useTranslations("activity");
  const accent = ACTIVITY_ACCENT[activity.kind];
  const definition = getActivityKindDefinition(activity.kind);
  // Sin página propia no hay a dónde enlazar: el mismo marcado va en un <div>.
  // Se elige el ENVOLTORIO, no se duplica la tarjeta -- dos copias del mismo
  // marcado divergen en cuanto alguien toca una sola.
  const linked = definition.hasDetailView;

  // La línea meta de un evento dice su fecha; "0 participantes" en algo a lo que
  // nadie se apunta no informa de nada.
  const meta = linked
    ? t("participants", { count: activity.participantCount })
    : activity.startsOn
      ? activity.eventType && activity.eventType !== "encuentro"
        ? `${t(`eventType_${activity.eventType}`)} · ${formatEventDate(activity.startsOn)}`
        : formatEventDate(activity.startsOn)
      : "";
  // Gateado también a status="active": un evento archivado o finalizado ya
  // enseña su propia píldora de estado (STATUS_STYLE), y sin este gate
  // "Ya pasó" la tapaba -- un evento archivado en "Finalizadas" se veía
  // idéntico a uno vivo y pasado en "Fechas señaladas".
  const past =
    !linked && activity.status === "active" && isPastEvent(activity.startsOn, today);

  const inner = (
    <>
      {/* El tipo se reconoce por su icono y su color, sin tener que leer.
          Baldosa 40px teñida por tipo, como el .ic del frame 3. */}
      <span
        aria-hidden
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
      >
        <accent.Icon className="h-4 w-4" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-serif text-sm font-semibold text-foreground">
          {activity.title}
        </span>
        {/* Sin truncate: en móvil "lectura conjunta · 0 participantes" no cabe
            en una línea, y cortarlo a media palabra no ayuda a nadie. La meta
            va en muted (.mm del frame 3): el color de tipo lo lleva la baldosa,
            no el texto. */}
        <span className="label-section">
          {t(`kind_${activity.kind}`)}
          {meta && ` · ${meta}`}
        </span>
      </span>

      <span
        className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${
          past ? "bg-surface-muted text-muted-foreground" : STATUS_STYLE[activity.status]
        }`}
      >
        {past ? t("eventPast") : t(`status_${activity.status}`)}
      </span>
    </>
  );

  return (
    <div
      className={`flex flex-col gap-3 rounded-card border p-4 shadow-card ${
        tint === "gold" ? "border-gold/40 bg-gold/5" : "border-border bg-surface"
      } ${muted ? "opacity-75" : ""}`}
    >
      {linked ? (
        <Link
          href={`/club/${clubSlug}/actividad/${activity.id}`}
          className="flex items-center gap-3 hover:opacity-80"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-3">{inner}</div>
      )}

      {actions && <div className="flex gap-2 border-t border-border pt-3">{actions}</div>}
    </div>
  );
}
