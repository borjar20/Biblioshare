"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { archiveActivity } from "@/lib/clubs/activities/core";
import {
  parseEventConfig,
  type LanzamientoConfig,
  type FechaDestacadaConfig,
} from "@/lib/clubs/activities/event-types";
import { EventForm } from "./propose/event-form";
import { Button } from "@/components/ui/button";

// Editar y archivar un evento. Van EN la tarjeta porque un evento no tiene
// página propia donde ponerlos. Archivar reutiliza archive_club_activity tal
// cual: ya es moderador+ y ya acepta el estado 'active'. Un evento archivado
// sale de `groupActivities` del grupo "events" (solo status='active') y cae
// en "finished" -- donde ActivityList no pasa `actions` -- así que estos
// controles desaparecen solos tras archivar, sin lógica extra aquí.
export function EventCardActions({ activity }: { activity: ClubActivity }) {
  const t = useTranslations("activity");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // La tarjeta SÍ tiene `activity.config` (a diferencia del resto de props
  // hidratadas de la ficha): hay que reenviarlo al formulario tal cual, o
  // `submit()` reconstruye un config vacío y `updateClubEvent` lo escribe --
  // editar un lanzamiento/fecha destacada desde la tarjeta borraría su
  // obra/relaciones en silencio. El título de la obra queda vacío a propósito
  // (la tarjeta no la tiene hidratada, solo itemType/itemId) -- issue #547.
  const cfg = parseEventConfig(activity.eventType ?? "encuentro", activity.config);
  const lan = activity.eventType === "lanzamiento" ? (cfg as LanzamientoConfig) : null;

  if (editing) {
    return (
      <div className="w-full">
        <EventForm
          clubId={activity.clubId}
          activity={{
            id: activity.id,
            title: activity.title,
            description: activity.description,
            startsOn: activity.startsOn,
          }}
          activityEventType={activity.eventType ?? "encuentro"}
          activityWork={
            lan?.item
              ? { itemType: lan.item.itemType, itemId: lan.item.itemId, title: "", coverUrl: null }
              : undefined
          }
          activityReleaseType={lan?.releaseType ?? undefined}
          activityPlatform={lan?.platform ?? undefined}
          activityRegion={lan?.region}
          activityAllDay={activity.eventType === "lanzamiento" ? lan?.allDay : undefined}
          activityRelations={
            activity.eventType === "fecha_destacada"
              ? (cfg as FechaDestacadaConfig).relations
              : undefined
          }
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    // role="group": un <div> pelado tiene rol `generic`, que no expone
    // aria-label a los lectores de pantalla -- la etiqueta se perdía.
    <div className="flex w-full flex-col gap-2" role="group" aria-label={t("eventActions")}>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          {t("editEvent")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await archiveActivity(activity.id);
              } catch {
                // Igual que event-form.tsx: el error se MUESTRA, nunca se traga.
                // Next.js redacta el mensaje real de un Server Action en
                // producción (llega un digest opaco), así que no se distingue
                // por texto de error -- solo se enseña la copy i18n fija.
                setError(t("eventError"));
              }
            })
          }
        >
          {t("archive")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-dropped">
          {error}
        </p>
      )}
    </div>
  );
}
