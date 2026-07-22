"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { archiveActivity } from "@/lib/clubs/activities/core";
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
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2" aria-label={t("eventActions")}>
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
