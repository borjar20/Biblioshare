"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClubEvent, updateClubEvent } from "@/lib/clubs/activities/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatEventTime } from "@/lib/clubs/activities/format-event-when";
import type { Database } from "@/lib/supabase/database.types";

type Modality = Database["public"]["Enums"]["event_modality"];

// Zonas ofrecidas. No se lista la base de datos IANA entera (600 nombres en un
// <select> no se usa): son las de los miembros reales del proyecto más el
// respaldo de UTC. La RPC valida contra pg_timezone_names, así que aceptar otra
// por API sigue siendo posible.
const URL_HTTP = /^https?:\/\//i;

const ZONAS = [
  "Europe/Madrid",
  "Atlantic/Canary",
  "Europe/London",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/New_York",
  "UTC",
];

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
    /** El instante (timestamptz) o la fecha suelta de un evento anterior a la
     *  migración. De aquí se derivan la fecha y la hora del formulario. */
    startsOn: string | null;
    endsAt?: string | null;
    timezone?: string;
    location?: string | null;
    modality?: Modality | null;
    onlineUrl?: string | null;
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
  const timeId = `event-time-${uid}`;
  const endTimeId = `event-end-time-${uid}`;
  const tzId = `event-tz-${uid}`;
  const locationId = `event-location-${uid}`;
  const modalityId = `event-modality-${uid}`;
  const urlId = `event-url-${uid}`;

  const zonaInicial = activity?.timezone ?? "Europe/Madrid";

  // `startsOn` puede llegar como instante ISO completo (evento con hora) o como
  // "YYYY-MM-DD" (uno anterior a la migracion). La fecha se recorta a 10
  // caracteres y la hora se formatea EN LA ZONA DEL EVENTO -- nunca con
  // getHours(), que usaria la zona del navegador y bailaria una o dos horas.
  const instanteInicial = activity?.startsOn ?? "";
  const fechaInicial = instanteInicial.slice(0, 10);
  const horaInicial =
    instanteInicial.length > 10 ? (formatEventTime(instanteInicial, zonaInicial) ?? "") : "";
  const horaFinInicial = activity?.endsAt
    ? (formatEventTime(activity.endsAt, zonaInicial) ?? "")
    : "";

  const [title, setTitle] = useState(activity?.title ?? initialTitle ?? "");
  const [description, setDescription] = useState(
    activity?.description ?? initialDescription ?? "",
  );
  const [startsOn, setStartsOn] = useState(fechaInicial);
  const [startsTime, setStartsTime] = useState(horaInicial);
  const [endsTime, setEndsTime] = useState(horaFinInicial);
  const [timezone, setTimezone] = useState(zonaInicial);
  const [location, setLocation] = useState(activity?.location ?? "");
  const [modality, setModality] = useState<Modality | "">(activity?.modality ?? "");
  const [onlineUrl, setOnlineUrl] = useState(activity?.onlineUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!startsOn) {
      setError(t("eventDateRequired"));
      return;
    }
    // Se valida ANTES del viaje lo mismo que valida la RPC, para no pagar el
    // roundtrip entero por un fin anterior al inicio (#133).
    if (startsTime && endsTime && endsTime <= startsTime) {
      setError(t("eventEndsBeforeStarts"));
      return;
    }
    if (onlineUrl && !URL_HTTP.test(onlineUrl)) {
      setError(t("eventInvalidUrl"));
      return;
    }
    if (modality === "online" && location.trim()) {
      setError(t("eventOnlineHasLocation"));
      return;
    }

    const campos = {
      title,
      description: description || undefined,
      startsOn,
      startsTime: startsTime || undefined,
      endsTime: endsTime || undefined,
      timezone,
      location: location.trim() || undefined,
      modality: modality || undefined,
      onlineUrl: onlineUrl.trim() || undefined,
    };

    startTransition(async () => {
      try {
        if (activity) {
          await updateClubEvent({ activityId: activity.id, ...campos });
        } else {
          await createClubEvent({ clubId, ...campos });
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

      {/* `type="time"` nativo en vez de un selector propio: da el teclado correcto
          en movil y respeta el formato horario del sistema, gratis. */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("eventTimeLabel")} htmlFor={timeId}>
          <Input
            id={timeId}
            type="time"
            value={startsTime}
            onChange={(e) => setStartsTime(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("eventEndTimeLabel")} htmlFor={endTimeId}>
          <Input
            id={endTimeId}
            type="time"
            value={endsTime}
            onChange={(e) => setEndsTime(e.target.value)}
            className="w-full"
          />
        </Field>
      </div>

      <Field label={t("eventTimezoneLabel")} htmlFor={tzId}>
        <Select
          id={tzId}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full"
        >
          {ZONAS.map((zona) => (
            <option key={zona} value={zona}>
              {zona}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("eventModalityLabel")} htmlFor={modalityId}>
        <Select
          id={modalityId}
          value={modality}
          onChange={(e) => setModality(e.target.value as Modality | "")}
          className="w-full"
        >
          <option value="">-</option>
          <option value="presencial">{t("modality_presencial")}</option>
          <option value="online">{t("modality_online")}</option>
          <option value="hibrida">{t("modality_hibrida")}</option>
        </Select>
      </Field>

      {/* Un evento online no lleva ubicacion fisica: el campo DESAPARECE en vez de
          quedarse ahi para que alguien lo rellene y la RPC lo rechace. */}
      {modality !== "online" && (
        <Field label={t("eventLocationLabel")} htmlFor={locationId}>
          <Input
            id={locationId}
            value={location}
            maxLength={200}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("eventLocationPlaceholder")}
            className="w-full"
          />
        </Field>
      )}

      {(modality === "online" || modality === "hibrida") && (
        <Field label={t("eventOnlineUrlLabel")} htmlFor={urlId}>
          <Input
            id={urlId}
            type="url"
            value={onlineUrl}
            maxLength={500}
            onChange={(e) => setOnlineUrl(e.target.value)}
            placeholder={t("eventOnlineUrlPlaceholder")}
            className="w-full"
          />
        </Field>
      )}

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
