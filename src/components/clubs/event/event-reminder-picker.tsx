"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  REMINDER_OPTIONS,
  reminderMoment,
  reminderFiresImmediately,
} from "@/lib/clubs/activities/event-state";
import { formatReminderMoment } from "@/lib/clubs/activities/format-event-when";
import { setClubEventReminder } from "@/lib/clubs/activities/event-follow-actions";

// Selector de recordatorio (§9.2). Un radiogroup de verdad, no seis botones: así
// las flechas navegan entre opciones y el grupo es UNA sola parada de tabulador,
// que es lo que espera quien usa teclado.
//
// Guarda al elegir, sin botón de confirmar: es una preferencia de una sola
// dimensión y un «Guardar» aquí solo añade un paso que se olvida. En error se
// vuelve a la opción anterior y se dice por qué.
export function EventReminderPicker({
  activityId,
  startsAt,
  timezone,
  current,
  /** El instante que la BD tiene armado. Se muestra tal cual: es la autoridad. */
  reminderDueAt,
}: {
  activityId: string;
  startsAt: string | null;
  timezone: string;
  current: number | null;
  reminderDueAt: string | null;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const name = useId();
  const [elegido, setElegido] = useState<number | null>(current);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function elegir(minutes: number | null) {
    const anterior = elegido;
    setElegido(minutes);
    setError(false);
    startTransition(async () => {
      const result = await setClubEventReminder(activityId, minutes);
      if (!result.ok) {
        // Se revierte a lo que había: dejar pintada la opción nueva sería decirle
        // al usuario que guardamos algo que no guardamos.
        setElegido(anterior);
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  // Lo que la BD tiene armado manda sobre cualquier cálculo local. Solo se calcula
  // cuando aún no hay nada guardado para la opción elegida (acaba de cambiarla).
  const momento =
    elegido === current && reminderDueAt
      ? reminderDueAt
      : (reminderMoment(startsAt, elegido)?.toISOString() ?? null);

  const yaVencido = reminderFiresImmediately(startsAt, elegido);
  const cuando = formatReminderMoment(momento, timezone);

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-0.5" disabled={isPending}>
        <legend className="label-section mb-2">{t("reminderLegend")}</legend>
        {REMINDER_OPTIONS.map((option) => {
          const activa = option.minutes === elegido;
          return (
            <label
              key={String(option.minutes)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                activa
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-foreground hover:bg-surface-muted"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={String(option.minutes)}
                checked={activa}
                onChange={() => elegir(option.minutes)}
                className="accent-accent"
              />
              {t(option.labelKey)}
            </label>
          );
        })}
      </fieldset>

      {error ? (
        <p role="alert" className="text-xs text-status-dropped">
          {t("reminderSaveError")}
        </p>
      ) : elegido === null ? (
        <p className="text-xs text-muted-foreground">{t("reminderNoneChosen")}</p>
      ) : yaVencido ? (
        // El caso de §9.1: se elige un aviso que ya venció. Se dice lo que va a
        // pasar (avisar ya) en vez de guardar en silencio algo que no llegará.
        <p className="text-xs text-muted-foreground">{t("reminderTooLate")}</p>
      ) : cuando ? (
        <p className="text-xs text-muted-foreground">
          {t("reminderWillNotify", { when: cuando })}
        </p>
      ) : null}
    </div>
  );
}
