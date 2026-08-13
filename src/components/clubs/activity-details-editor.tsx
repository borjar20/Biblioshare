"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { updateActivityDetails } from "@/lib/clubs/activities/core";
import type { ActivityDetailsError } from "@/lib/clubs/activities/activity-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

// Panel de "Modificar actividad" para la cabecera: título, descripción y las dos
// fechas. Hasta ahora esos cuatro campos solo eran editables en un evento.
//
// Los kinds cuyo PROGRESO depende de la ventana temporal llevan un aviso; los
// demás no. Un aviso que no aplica enseña a ignorar los avisos.
const AVISA_VENTANA = new Set(["list_challenge", "criteria_challenge"]);

export function ActivityDetailsEditor({
  activity,
  onChanged,
}: {
  activity: ClubActivity;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [title, setTitle] = useState(activity.title);
  const [description, setDescription] = useState(activity.description ?? "");
  const [startsOn, setStartsOn] = useState(activity.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(activity.endsOn ?? "");
  const [error, setError] = useState<ActivityDetailsError | null>(null);
  const [isPending, startTransition] = useTransition();

  // Solo si el progreso YA está corriendo: en una propuesta no hay nada que
  // recalcular todavía.
  const avisaVentana = AVISA_VENTANA.has(activity.kind) && activity.status === "active";

  function guardar() {
    setError(null);
    startTransition(async () => {
      const result = await updateActivityDetails(activity.id, {
        title,
        description,
        startsOn,
        endsOn,
      });
      if (result.ok) onChanged();
      else setError(result.code);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="label-section">{t("detailsTitle")}</h2>

      <Field label={t("titleLabel")} htmlFor="details-title" required>
        <Input
          id="details-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full"
        />
      </Field>

      <Field label={t("descriptionLabel")} htmlFor="details-description">
        <textarea
          id="details-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </Field>

      <div className="flex gap-2">
        <Field label={t("startsOn")} htmlFor="details-starts">
          <Input
            id="details-starts"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("endsOn")} htmlFor="details-ends">
          <Input
            id="details-ends"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="w-full"
          />
        </Field>
      </div>

      {avisaVentana && (
        <p className="rounded-card border border-gold/40 bg-gold/5 px-3 py-2 text-[12.5px] text-muted-foreground">
          {t("detailsWindowWarning")}
        </p>
      )}

      {error && (
        <p className="text-sm text-status-dropped">{t(`detailsError_${error}`)}</p>
      )}

      <Button
        type="button"
        className="self-start px-3.5 py-2 text-xs"
        disabled={isPending}
        onClick={guardar}
      >
        {isPending ? t("detailsSaving") : t("detailsSave")}
      </Button>
    </div>
  );
}
