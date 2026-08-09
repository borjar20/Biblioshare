"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/social/user-avatar";
import { AlertIcon, ClockIcon } from "@/components/ui/icons";
import type { ClubEventDetail } from "@/lib/clubs/activities/event-detail";
import type { LanzamientoConfig } from "@/lib/clubs/activities/event-types";
import {
  formatEventWhen,
  formatEventTime,
  shouldShowTimezone,
  timezoneLabel,
} from "@/lib/clubs/activities/format-event-when";
import { canFollowEvent } from "@/lib/clubs/activities/event-state";
import { EventStateBadge } from "./event-state-badge";
import { EventFollowButton } from "./event-follow-button";
import { EventReminderPicker } from "./event-reminder-picker";
import { EventFollowers } from "./event-followers";
import { EventModeration } from "./event-moderation";

// La ficha del evento. Cliente porque la zona horaria de quien mira solo se sabe
// en el navegador (Intl.DateTimeFormat().resolvedOptions().timeZone): el servidor
// no puede decidir si hace falta enseñar la zona del evento.
//
// Todo lo demás llega por props desde el server component, que ya derivó el estado
// contra el reloj del servidor. No se re-deriva aquí: dos relojes distintos en la
// misma pantalla es cómo se acaba con una cabecera que dice «en curso» y un botón
// que dice «finalizado».

export function EventDetailView({
  event,
  viewerId,
  viewerIsMember,
  canModerate,
}: {
  event: ClubEventDetail;
  viewerId: string;
  viewerIsMember: boolean;
  canModerate: boolean;
}) {
  const t = useTranslations("activity");

  const viewerTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  // Sin hora concreta (lanzamiento «todo el día» / fecha destacada): solo la
  // fecha, formateada en la zona del evento -- nunca con `new Date().getDate()`,
  // que usaría la zona del navegador y podría bailar un día.
  const cuando =
    event.allDay && event.startsAt
      ? new Intl.DateTimeFormat("es-ES", {
          timeZone: event.timezone,
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(event.startsAt))
      : formatEventWhen(event.startsAt, event.endsAt, event.timezone);
  const mostrarZona = !event.allDay && shouldShowTimezone(event.timezone, viewerTz ?? null);
  const horaEnMiZona =
    mostrarZona && viewerTz && event.startsAt
      ? formatEventTime(event.startsAt, viewerTz)
      : null;

  const lanzamiento = event.eventType === "lanzamiento" ? (event.config as LanzamientoConfig) : null;
  const lanzamientoMeta = lanzamiento
    ? [
        lanzamiento.releaseType ? t(`releaseType_${lanzamiento.releaseType}`) : null,
        lanzamiento.platform ? t(`platform_${lanzamiento.platform}`) : null,
        lanzamiento.region ?? null,
      ]
        .filter((v): v is string => Boolean(v))
        .join(" · ")
    : "";

  const seguible = canFollowEvent(event.state);

  const botonSeguir = (
    <EventFollowButton
      activityId={event.id}
      eventState={event.state}
      followState={{
        following: event.viewerFollows,
        followersCount: event.followersCount,
        remindMinutesBefore: event.viewerRemindMinutesBefore,
      }}
      viewerIsMember={viewerIsMember}
      viewerLoggedIn
      clubSlug={event.clubSlug}
      eventTitle={event.title}
    />
  );

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-7">
      <div className="flex min-w-0 flex-col">
        <p className="text-xs text-muted-foreground">
          <Link href={`/club/${event.clubSlug}`} className="hover:text-foreground">
            {event.clubName}
          </Link>
          {" › "}
          <Link
            href={`/club/${event.clubSlug}/calendario`}
            className="hover:text-foreground"
          >
            {t("calendarTitle")}
          </Link>
        </p>

        {/* Cancelado y pospuesto se anuncian ARRIBA, antes del título: es lo
            primero que alguien necesita saber al abrir la ficha, no una nota al
            pie. */}
        {event.state === "cancelado" && (
          <div
            role="status"
            className="mt-3 flex items-start gap-2.5 rounded-lg border border-status-dropped/40 bg-status-dropped/[0.09] px-3.5 py-3 text-sm"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-status-dropped" aria-hidden />
            <span>
              <strong className="text-foreground">{t("eventCancelledTitle")}</strong>
              <br />
              <span className="text-foreground-soft">{t("eventCancelledBody")}</span>
              {cuando && (
                <>
                  <br />
                  <span className="text-muted-foreground">
                    {t("eventCancelledWasOn", { when: cuando })}
                  </span>
                </>
              )}
            </span>
          </div>
        )}

        {event.state === "pospuesto" && (
          <div
            role="status"
            className="mt-3 flex items-start gap-2.5 rounded-lg border border-border bg-surface-muted px-3.5 py-3 text-sm text-foreground-soft"
          >
            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong className="text-foreground">{t("eventPostponedTitle")}</strong>
              <br />
              {t("eventPostponedBody")}
            </span>
          </div>
        )}

        <div className="mt-3">
          <EventStateBadge state={event.state} />
        </div>

        <h1
          className={`mt-2 font-serif text-[26px] leading-[1.15] font-semibold tracking-tight text-foreground lg:text-[30px] ${
            event.state === "cancelado" ? "text-muted-foreground line-through" : ""
          }`}
        >
          {event.title}
        </h1>

        {cuando && event.state !== "cancelado" && (
          <p className="mt-3.5 font-serif text-[17px] text-foreground">{cuando}</p>
        )}

        {/* La zona solo cuando NO es la de quien mira: enseñarla siempre es ruido,
            y no enseñarla nunca deja a un club repartido leyendo horas distintas. */}
        {mostrarZona && event.startsAt && (
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {timezoneLabel(event.timezone, event.startsAt)}
            {horaEnMiZona && ` · ${viewerTz}: ${horaEnMiZona}`}
          </p>
        )}

        {event.state === "en_curso" && event.onlineUrl && (
          <a
            href={event.onlineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-fit rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            {t("eventInProgressJoin")}
          </a>
        )}

        <dl className="mt-6 flex flex-col gap-3">
          {/* Modalidad/lugar/enlace son propios de Encuentro -- Lanzamiento y
              Fecha destacada tienen su propio bloque justo debajo. */}
          {event.eventType === "encuentro" && (
            <>
              {event.modality && (
                <Field label={t("eventFieldModality")}>{t(`modality_${event.modality}`)}</Field>
              )}
              {event.location && <Field label={t("eventFieldLocation")}>{event.location}</Field>}
              {/* El enlace de acceso solo se sirve a miembros: llegar aquí ya lo exige
                  (RLS + gate de la página), y se comprueba otra vez porque una ficha es
                  justo donde se filtra un enlace por descuido. */}
              {event.onlineUrl && viewerIsMember && (
                <Field label={t("eventFieldOnline")}>
                  <a
                    href={event.onlineUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-accent hover:underline"
                  >
                    {event.onlineUrl}
                  </a>
                </Field>
              )}
            </>
          )}
          <Field label={t("eventFieldOrganizer")}>
            <span className="inline-flex items-center gap-2">
              <UserAvatar
                name={event.organizerName}
                avatarUrl={event.organizerAvatarUrl}
                size={24}
              />
              {event.organizerUsername ? (
                <Link
                  href={`/u/${event.organizerUsername}`}
                  className="hover:text-accent"
                >
                  {event.organizerName}
                </Link>
              ) : (
                event.organizerName
              )}
            </span>
          </Field>
        </dl>

        {event.eventType === "lanzamiento" && event.hydratedItem && (
          <div className="mt-4 flex items-center gap-3">
            <Link
              href={`/${
                event.hydratedItem.itemType === "book"
                  ? "libro"
                  : event.hydratedItem.itemType === "movie"
                    ? "pelicula"
                    : "serie"
              }/${event.hydratedItem.itemId}`}
              className="flex items-center gap-3 hover:opacity-80"
            >
              {event.hydratedItem.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.hydratedItem.coverUrl}
                  alt=""
                  className="h-16 w-11 rounded object-cover"
                />
              )}
              <span className="font-medium text-foreground">{event.hydratedItem.title}</span>
            </Link>
            {lanzamientoMeta && (
              <span className="text-sm text-muted-foreground">{lanzamientoMeta}</span>
            )}
          </div>
        )}

        {event.eventType === "fecha_destacada" && event.hydratedRelations.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {event.hydratedRelations.map((r, i) => (
              <li key={i} className="text-sm">
                {r.kind === "item" ? (
                  <Link
                    href={`/${r.itemType === "book" ? "libro" : r.itemType === "movie" ? "pelicula" : "serie"}/${r.itemId}`}
                    className="text-accent hover:underline"
                  >
                    {r.title}
                  </Link>
                ) : (
                  <Link
                    href={`/club/${r.clubSlug}/actividad/${r.activityId}`}
                    className="text-accent hover:underline"
                  >
                    {r.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        {event.description && (
          <p className="mt-5 max-w-[62ch] text-sm leading-relaxed whitespace-pre-line text-foreground-soft">
            {event.description}
          </p>
        )}

        {event.state === "finalizado" && (
          <p className="mt-5 text-xs text-muted-foreground">{t("eventFinishedNote")}</p>
        )}

        {/* «Última actualización» solo si de verdad se editó: en un evento recién
            creado updated_at es null y una línea que dijera «actualizado» sería
            falsa. */}
        {event.updatedAt && (
          <p className="mt-6 font-mono text-[10.5px] text-foreground-faint">
            {t("eventUpdatedAt", {
              when: formatEventWhen(event.updatedAt, null, event.timezone) ?? "",
            })}
          </p>
        )}

        {canModerate && (
          <div className="mt-7 lg:hidden">
            <EventModeration event={event} />
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-[96px]">
        <div className="rounded-card border border-border bg-surface p-4">{botonSeguir}</div>

        {/* El selector solo aparece si de verdad se puede recibir un aviso: en un
            evento cancelado o finalizado sería un control sin consecuencia. */}
        {event.viewerFollows && seguible && (
          <div className="rounded-card border border-border bg-surface p-4">
            <EventReminderPicker
              activityId={event.id}
              startsAt={event.startsAt}
              timezone={event.timezone}
              current={event.viewerRemindMinutesBefore}
              reminderDueAt={event.viewerReminderDueAt}
            />
          </div>
        )}

        <div className="rounded-card border border-border bg-surface p-4">
          <EventFollowers
            activityId={event.id}
            viewerId={viewerId}
            organizerId={event.organizerId}
            preview={event.followersPreview}
            total={event.followersCount}
            canFollow={viewerIsMember && seguible && !event.viewerFollows}
          />
        </div>

        {canModerate && (
          <div className="hidden lg:block">
            <EventModeration event={event} />
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-3 lg:grid-cols-[108px_minmax(0,1fr)]">
      <dt className="label-section">{label}</dt>
      <dd className="m-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}
