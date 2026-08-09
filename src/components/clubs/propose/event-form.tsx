"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClubEvent, updateClubEvent, type EventFormError } from "@/lib/clubs/activities/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatEventTime } from "@/lib/clubs/activities/format-event-when";
import { type EventType, type EventConfig, type EventRelation } from "@/lib/clubs/activities/event-types";
import { RELEASE_TYPES, PLATFORMS, platformAllowed } from "@/lib/clubs/activities/event-release-types";
import { ItemPicker, type PickedItem } from "@/components/clubs/item-picker";
import type { Database } from "@/lib/supabase/database.types";

type Modality = Database["public"]["Enums"]["event_modality"];

// Borrador de relación en pantalla: la config guardada solo necesita
// `EventRelation` (kind + ids), pero el chip quiere mostrar el título real
// elegido en el picker, no solo su categoría ("Libro"). `relation.itemType`
// ya viaja dentro de `EventRelation` cuando kind==="item", así que no hace
// falta duplicarlo aquí -- solo el label es dato nuevo, y solo lo tienen las
// relaciones añadidas EN ESTA sesión (las hidratadas al editar no traen
// título y caen al fallback de categoría, limitación conocida de Task 13).
type RelationDraft = { relation: EventRelation; label?: string };

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
// tarjeta). Un solo formulario a propósito: son los mismos campos base (título,
// descripción, fecha) más el grupo específico de cada tipo de evento, y dos
// copias acabarían validando distinto.
export function EventForm({
  clubId,
  activity,
  initialTitle,
  initialDescription,
  initialEventType,
  activityEventType,
  activityWork,
  activityReleaseType,
  activityPlatform,
  activityRegion,
  activityAllDay,
  activityRelations,
  clubActivities,
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
  /** Tipo con el que se crea (el selector puede cambiarlo mientras no se edite). */
  initialEventType?: EventType;
  /** Al editar, el tipo REAL del evento (fijo, no se puede cambiar). */
  activityEventType?: EventType;
  /** Al editar un lanzamiento/fecha destacada: config ya hidratado por el consumidor. */
  activityWork?: PickedItem | null;
  activityReleaseType?: string;
  activityPlatform?: string;
  activityRegion?: string;
  activityAllDay?: boolean;
  activityRelations?: EventRelation[];
  /** Actividades del club (id + título) para enlazar desde una fecha destacada. */
  clubActivities?: Array<{ id: string; title: string }>;
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
  const [eventType, setEventType] = useState<EventType>(
    activityEventType ?? initialEventType ?? "encuentro",
  );
  // Lanzamiento
  const [work, setWork] = useState<PickedItem | null>(activityWork ?? null);
  const [releaseType, setReleaseType] = useState(activityReleaseType ?? "");
  const [platform, setPlatform] = useState(activityPlatform ?? "");
  const [region, setRegion] = useState(activityRegion ?? "");
  const [allDay, setAllDay] = useState(activityAllDay ?? true);
  const [pickingWork, setPickingWork] = useState(false);
  // Fecha destacada
  const [relations, setRelations] = useState<RelationDraft[]>(
    (activityRelations ?? []).map((r) => ({ relation: r })),
  );
  const [pickingRelation, setPickingRelation] = useState<null | "item" | "activity">(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!startsOn) {
      setError(t("eventDateRequired"));
      return;
    }
    if (eventType === "encuentro") {
      // Se valida ANTES del viaje lo mismo que valida la RPC, para no pagar el
      // roundtrip entero por un fin anterior al inicio (#133).
      if (!startsTime) {
        setError(t("eventStartsTimeRequired"));
        return;
      }
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
    }
    if (eventType === "lanzamiento") {
      if (!work) {
        setError(t("eventItemRequired"));
        return;
      }
      if (!releaseType) {
        setError(t("eventReleaseTypeRequired"));
        return;
      }
    }

    const config: EventConfig =
      eventType === "lanzamiento"
        ? {
            item: work ? { itemType: work.itemType, itemId: work.itemId } : null,
            releaseType: releaseType || null,
            ...(work && platformAllowed(work.itemType) && platform ? { platform } : {}),
            ...(region.trim() ? { region: region.trim() } : {}),
            allDay,
          }
        : eventType === "fecha_destacada"
          ? { relations: relations.map((d) => d.relation), allDay: true as const }
          : {};

    const esEncuentro = eventType === "encuentro";
    const campos = {
      eventType,
      title,
      description: description || undefined,
      startsOn,
      // Sin hora en lanzamiento «todo el día» y en fecha destacada.
      startsTime: esEncuentro
        ? startsTime || undefined
        : eventType === "lanzamiento" && !allDay
          ? startsTime || undefined
          : undefined,
      endsTime: esEncuentro ? endsTime || undefined : undefined,
      timezone: esEncuentro ? timezone : undefined,
      location: esEncuentro ? location.trim() || undefined : undefined,
      modality: esEncuentro ? modality || undefined : undefined,
      onlineUrl: esEncuentro ? onlineUrl.trim() || undefined : undefined,
      config,
    };

    startTransition(async () => {
      const result = activity
        ? await updateClubEvent({ activityId: activity.id, ...campos })
        : await createClubEvent({ clubId, ...campos });
      if (result.ok) {
        onDone(startsOn);
      } else {
        setError(errorLabel(result.code));
      }
    });
  }

  // Traduce el código a copy; los que valga la pena distinguir tienen clave propia.
  function errorLabel(code: EventFormError): string {
    switch (code) {
      case "item_required":
        return t("eventItemRequired");
      case "release_type_required":
        return t("eventReleaseTypeRequired");
      case "relation_not_in_club":
        return t("eventRelationNotInClub");
      case "starts_time_required":
        return t("eventStartsTimeRequired");
      case "ends_before_starts":
        return t("eventEndsBeforeStarts");
      case "invalid_online_url":
        return t("eventInvalidUrl");
      case "online_event_has_location":
        return t("eventOnlineHasLocation");
      case "starts_on_required":
        return t("eventDateRequired");
      default:
        return t("eventError");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("eventTypeLabel")} htmlFor={`event-type-${uid}`}>
        {editing ? (
          <p id={`event-type-${uid}`} className="text-sm text-muted-foreground">
            {t(`eventType_${eventType}`)} · {t("eventTypeFixedOnEdit")}
          </p>
        ) : (
          <div
            id={`event-type-${uid}`}
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label={t("eventTypeLabel")}
          >
            {(["encuentro", "lanzamiento", "fecha_destacada"] as EventType[]).map((tp) => (
              <button
                key={tp}
                type="button"
                role="radio"
                aria-checked={eventType === tp}
                onClick={() => setEventType(tp)}
                className={`rounded-card border p-3 text-left ${eventType === tp ? "border-accent" : "border-border"}`}
              >
                <span className="block text-sm font-medium">{t(`eventType_${tp}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`eventTypeHint_${tp}`)}</span>
              </button>
            ))}
          </div>
        )}
      </Field>

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

      {eventType === "encuentro" && (
        <>
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
        </>
      )}

      {eventType === "lanzamiento" && (
        <>
          <Field label={t("eventWorkLabel")} htmlFor={`event-work-${uid}`}>
            {/* Contenedor siempre presente: htmlFor necesita un id que exista en
                CUALQUIER combinación de work/pickingWork (incluida la de "sin obra
                y eligiendo", donde ni el resumen ni el botón se pintan). */}
            <div id={`event-work-${uid}`} className="flex flex-col gap-2">
              {work ? (
                <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-2">
                  {work.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que otras tarjetas de catálogo
                    <img src={work.coverUrl} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">{work.title}</span>
                  <button type="button" className="text-xs text-accent" onClick={() => setPickingWork(true)}>
                    {t("eventChangeWork")}
                  </button>
                </div>
              ) : pickingWork ? null : (
                <Button type="button" variant="secondary" onClick={() => setPickingWork(true)}>
                  {t("eventPickWork")}
                </Button>
              )}
              {pickingWork && (
                <ItemPicker
                  allowedItemTypes="all"
                  onPick={(item) => {
                    setWork(item);
                    setReleaseType("");
                    setPlatform("");
                    setPickingWork(false);
                    if (!title.trim()) setTitle(item.title);
                  }}
                  onCancel={() => setPickingWork(false)}
                />
              )}
            </div>
          </Field>

          {work && (
            <>
              <Field label={t("eventReleaseTypeLabel")} htmlFor={`event-release-${uid}`}>
                <Select
                  id={`event-release-${uid}`}
                  value={releaseType}
                  onChange={(e) => setReleaseType(e.target.value)}
                  className="w-full"
                >
                  <option value="">{t("eventReleaseTypePlaceholder")}</option>
                  {RELEASE_TYPES[work.itemType].map((r) => (
                    <option key={r.value} value={r.value}>
                      {t(r.labelKey)}
                    </option>
                  ))}
                </Select>
              </Field>

              {platformAllowed(work.itemType) && (
                <Field label={t("eventPlatformLabel")} htmlFor={`event-platform-${uid}`}>
                  <Select
                    id={`event-platform-${uid}`}
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full"
                  >
                    <option value="">{t("eventPlatformNone")}</option>
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {t(p.labelKey)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span>
              {t("eventAllDayLabel")} <span className="text-muted-foreground">· {t("eventAllDayHint")}</span>
            </span>
          </label>
          {!allDay && (
            <Field label={t("eventTimeLabel")} htmlFor={`event-launch-time-${uid}`}>
              <Input
                id={`event-launch-time-${uid}`}
                type="time"
                value={startsTime}
                onChange={(e) => setStartsTime(e.target.value)}
                className="w-full"
              />
            </Field>
          )}

          <Field label={t("eventRegionLabel")} htmlFor={`event-region-${uid}`}>
            <Input
              id={`event-region-${uid}`}
              value={region}
              maxLength={120}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={t("eventRegionPlaceholder")}
              className="w-full"
            />
          </Field>
        </>
      )}

      {eventType === "fecha_destacada" && (
        <Field label={t("eventRelationsLabel")} htmlFor={`event-relations-${uid}`}>
          <p className="text-xs text-muted-foreground">{t("eventRelationsHint")}</p>
          <ul id={`event-relations-${uid}`} className="flex flex-col gap-1">
            {relations.map((d, i) => (
              <li key={i} className="flex items-center gap-2 rounded-card border border-border p-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {d.label ??
                    (d.relation.kind === "item"
                      ? t(`itemType_${d.relation.itemType}`)
                      : t("eventRelationActivities"))}
                </span>
                <button
                  type="button"
                  className="text-xs text-status-dropped"
                  aria-label={t("eventRelationRemove")}
                  onClick={() => setRelations(relations.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {pickingRelation === "item" ? (
            <ItemPicker
              allowedItemTypes="all"
              onPick={(item) => {
                setRelations([
                  ...relations,
                  {
                    relation: { kind: "item", itemType: item.itemType, itemId: item.itemId },
                    label: item.title,
                  },
                ]);
                setPickingRelation(null);
              }}
              onCancel={() => setPickingRelation(null)}
            />
          ) : pickingRelation === "activity" ? (
            <div className="flex flex-col gap-1 rounded-card border border-border p-2">
              {(clubActivities ?? []).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="truncate rounded p-1 text-left text-sm hover:bg-surface-muted"
                  onClick={() => {
                    setRelations([...relations, { relation: { kind: "activity", activityId: a.id }, label: a.title }]);
                    setPickingRelation(null);
                  }}
                >
                  {a.title}
                </button>
              ))}
              <button
                type="button"
                className="self-start text-xs text-muted-foreground"
                onClick={() => setPickingRelation(null)}
              >
                {t("cancel")}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setPickingRelation("item")}>
                {t("eventRelationItems")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPickingRelation("activity")}>
                {t("eventRelationActivities")}
              </Button>
            </div>
          )}
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
