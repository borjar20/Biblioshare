"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClubEvent, updateClubEvent } from "@/lib/clubs/activities/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

// Formulario de evento, compartido por crear (asistente) y editar (menú de la
// tarjeta). Un solo formulario a propósito: son los mismos tres campos, y dos
// copias acabarían validando distinto.
export function EventForm({
  clubId,
  activity,
  onDone,
  onCancel,
}: {
  clubId: string;
  activity?: {
    id: string;
    title: string;
    description: string | null;
    startsOn: string | null;
  };
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("activity");
  const editing = Boolean(activity);

  const [title, setTitle] = useState(activity?.title ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [startsOn, setStartsOn] = useState(activity?.startsOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!startsOn) {
      setError(t("eventDateRequired"));
      return;
    }

    startTransition(async () => {
      try {
        if (activity) {
          await updateClubEvent({
            activityId: activity.id,
            title,
            description: description || undefined,
            startsOn,
          });
        } else {
          await createClubEvent({
            clubId,
            title,
            description: description || undefined,
            startsOn,
          });
        }
        onDone();
      } catch {
        // El error se MUESTRA: SD-8 ya registró "errores de mutación no
        // visibles" como hallazgo Important en este mismo motor. El caso real
        // aquí es dejar de ser moderador entre abrir el formulario y enviarlo.
        setError(t("eventError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("titleLabel")} htmlFor="event-title">
        <Input
          id="event-title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="w-full"
        />
      </Field>

      <Field label={t("descriptionLabel")} htmlFor="event-description">
        <textarea
          id="event-description"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </Field>

      <Field label={t("eventDateLabel")} htmlFor="event-date">
        <Input
          id="event-date"
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          className="w-full"
        />
      </Field>

      {error && <p className="text-sm text-status-dropped">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={isPending || !title.trim()}
          onClick={submit}
          className="w-full"
        >
          {isPending
            ? t("eventSubmitting")
            : editing
              ? t("eventSaveSubmit")
              : t("eventSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
