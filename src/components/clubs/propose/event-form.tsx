"use client";

import { useId, useState, useTransition } from "react";
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
  initialTitle,
  initialDescription,
  onDone,
  onCancel,
  hasPreviousStep = false,
}: {
  clubId: string;
  activity?: {
    id: string;
    title: string;
    description: string | null;
    startsOn: string | null;
  };
  // Borrador arrastrado del paso 1 del asistente (título/descripción ya
  // escritos antes de elegir "Evento"). Solo se usan al crear: si hay
  // `activity` estamos editando y sus valores mandan.
  initialTitle?: string;
  initialDescription?: string;
  // La fecha guardada se propaga al terminar: el calendario la usa para saltar
  // al mes del evento recién creado (si no, un evento creado fuera del mes
  // visible no da ninguna señal de que ha pasado algo). Los demás
  // consumidores (asistente, tarjeta) ignoran el argumento -- una función que
  // no lo usa sigue siendo asignable a este tipo.
  onDone: (startsOn?: string) => void;
  onCancel: () => void;
  // Determina la copy del botón secundario: "Atrás" solo tiene sentido si
  // quien monta el formulario tiene de verdad un paso anterior al que volver
  // (el asistente, paso 1). `editing` no sirve como discriminador: el
  // calendario también crea (no edita) y no tiene ningún paso previo, así que
  // el contexto que monta el formulario es quien decide, no si se edita o no.
  hasPreviousStep?: boolean;
}) {
  const t = useTranslations("activity");
  const editing = Boolean(activity);

  // Ids por instancia: Task 10 monta este formulario una vez por tarjeta
  // (EventCardActions), con un `editing` independiente por tarjeta -- dos
  // ediciones pueden estar abiertas a la vez. Con ids fijos, cada <label
  // htmlFor> se ligaba siempre al primer formulario del DOM.
  const uid = useId();
  const titleId = `event-title-${uid}`;
  const descriptionId = `event-description-${uid}`;
  const dateId = `event-date-${uid}`;

  const [title, setTitle] = useState(activity?.title ?? initialTitle ?? "");
  const [description, setDescription] = useState(
    activity?.description ?? initialDescription ?? "",
  );
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
        onDone(startsOn);
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
      <Field label={t("titleLabel")} htmlFor={titleId}>
        <Input
          id={titleId}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="w-full"
        />
      </Field>

      <Field label={t("descriptionLabel")} htmlFor={descriptionId}>
        <textarea
          id={descriptionId}
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </Field>

      <Field label={t("eventDateLabel")} htmlFor={dateId}>
        <Input
          id={dateId}
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          className="w-full"
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-status-dropped">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={isPending || !title.trim()}
          onClick={submit}
          className="w-full"
        >
          {isPending
            ? editing
              ? t("eventSaveSubmitting")
              : t("eventSubmitting")
            : editing
              ? t("eventSaveSubmit")
              : t("eventSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {hasPreviousStep ? t("back") : t("cancel")}
        </Button>
      </div>
    </div>
  );
}
