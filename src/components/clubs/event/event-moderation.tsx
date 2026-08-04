"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EventForm } from "@/components/clubs/propose/event-form";
import { setClubEventState } from "@/lib/clubs/activities/event-follow-actions";
import type { DeclaredEventState } from "@/lib/clubs/activities/event-state";
import type { ClubEventDetail } from "@/lib/clubs/activities/event-detail";

// Editar, cancelar, posponer y reprogramar. Vive en la ficha porque ahí es donde
// el evento tiene sitio para explicarse; la tarjeta del muro sigue con sus dos
// controles de siempre (EventCardActions), que no se toca.
//
// Cancelar y posponer avisan a quienes lo siguen y apagan sus recordatorios; lo
// primero lo hace la server action y lo segundo el trigger de la BD.
export function EventModeration({ event }: { event: ClubEventDetail }) {
  const t = useTranslations("activity");
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function cambiarEstado(state: DeclaredEventState) {
    setError(false);
    startTransition(async () => {
      const result = await setClubEventState(event.id, state);
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  if (editando) {
    return (
      <div className="rounded-card border border-border bg-surface p-4">
        <EventForm
          clubId={event.clubId}
          activity={{
            id: event.id,
            title: event.title,
            description: event.description,
            startsOn: event.startsAt,
            endsAt: event.endsAt,
            timezone: event.timezone,
            location: event.location,
            modality: event.modality,
            onlineUrl: event.onlineUrl,
          }}
          onDone={() => {
            setEditando(false);
            router.refresh();
          }}
          onCancel={() => setEditando(false)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
      role="group"
      aria-label={t("eventModerationTitle")}
    >
      <h2 className="label-section">{t("eventModerationTitle")}</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => setEditando(true)}
        >
          {t("editEvent")}
        </Button>

        {event.declaredState !== "cancelado" && (
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-1.5 text-xs"
            disabled={isPending}
            onClick={() => cambiarEstado("cancelado")}
          >
            {t("eventCancel")}
          </Button>
        )}

        {event.declaredState === "programado" && (
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-1.5 text-xs"
            disabled={isPending}
            onClick={() => cambiarEstado("pospuesto")}
          >
            {t("eventPostpone")}
          </Button>
        )}

        {event.declaredState !== "programado" && (
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            disabled={isPending}
            onClick={() => cambiarEstado("programado")}
          >
            {t("eventReprogram")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-status-dropped">
          {t("eventStateError")}
        </p>
      )}
    </div>
  );
}
