"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  REMINDER_OPTIONS,
  reminderMoment,
  reminderFiresImmediately,
} from "@/lib/clubs/activities/event-state";
import { formatReminderMoment } from "@/lib/clubs/activities/format-event-when";
import {
  followClubEvent,
  unfollowClubEvent,
} from "@/lib/clubs/activities/event-follow-actions";
import { XIcon } from "@/components/ui/icons";

// Al pulsar la campana de una fila de la agenda se abre ESTO: se pregunta con
// cuánta antelación avisar en vez de seguir el evento en silencio con el
// predeterminado. Es la petición del dueño, y arregla algo real -- antes no
// había forma de elegir el aviso sin entrar a la ficha del evento.
//
// UNA sola acción para los dos casos: `followClubEvent` hace `on conflict do
// update` sobre `remind_minutes_before`, así que la misma llamada sirve para
// «empieza a seguirlo con este aviso» y para «cámbiame el aviso». No se usa
// `setClubEventReminder` porque esa exige seguirlo YA (`not_following`), y aquí
// el caso normal es que todavía no lo siga.
//
// No se cierra sola al elegir: lo que se guarda tiene una consecuencia que hay
// que poder leer -- sobre todo «este aviso ya venció, te avisamos ahora», que
// con el predeterminado de una semana pasa a menudo. Cerrar de golpe escondería
// justo la frase que explica lo que va a ocurrir.
export function AgendaReminderSheet({
  activityId,
  title,
  startsAt,
  timezone,
  following,
  current,
  open,
  onClose,
}: {
  activityId: string;
  title: string;
  startsAt: string | null;
  timezone: string | null;
  following: boolean;
  /** El offset guardado. null = lo sigue sin aviso, o todavía no lo sigue. */
  current: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const name = useId();
  const [elegido, setElegido] = useState<number | null>(current);
  const [sigue, setSigue] = useState(following);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Al REABRIR se parte de lo que dice el servidor, no de lo que quedó en el
  // estado local de la vez anterior: entre medias se puede haber cambiado el
  // aviso desde la ficha del evento.
  //
  // Se ajusta en render (patrón «derivar estado de props») y no en un efecto por
  // dos razones: el efecto disparaba `react-hooks/set-state-in-effect`, y sobre
  // todo porque un efecto con `current` en las dependencias también se
  // ejecutaría cuando `router.refresh()` trae las props nuevas CON LA HOJA
  // ABIERTA -- pisando la opción recién elegida con la que llegara del servidor.
  // Comparando contra `open` solo se reinicia cuando de verdad se reabre.
  const [abiertaAntes, setAbiertaAntes] = useState(open);
  if (open !== abiertaAntes) {
    setAbiertaAntes(open);
    if (open) {
      setElegido(current);
      setSigue(following);
      setError(false);
    }
  }

  function elegir(minutes: number | null) {
    const anterior = elegido;
    const seguiaAntes = sigue;
    setElegido(minutes);
    setSigue(true);
    setError(false);
    startTransition(async () => {
      const result = await followClubEvent(activityId, minutes);
      if (!result.ok) {
        // Se revierte: dejar pintada la opción nueva sería decirle a quien mira
        // que guardamos algo que no guardamos.
        setElegido(anterior);
        setSigue(seguiaAntes);
        setError(true);
        return;
      }
      // La campana de la fila, la de la celda del mes y el filtro «Sigues» los
      // pinta el servidor: sin esto se quedarían con el estado anterior hasta
      // la siguiente navegación.
      router.refresh();
    });
  }

  function dejarDeSeguir() {
    setError(false);
    startTransition(async () => {
      const result = await unfollowClubEvent(activityId);
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  // El instante del aviso se calcula aquí porque la opción puede estar sin
  // guardar todavía. Cuando no hay hora o zona (no debería pasar en un evento)
  // simplemente no se promete ninguna fecha, en vez de inventarse una zona.
  const momento = reminderMoment(startsAt, elegido)?.toISOString() ?? null;
  const cuando = timezone ? formatReminderMoment(momento, timezone) : null;
  const yaVencido = reminderFiresImmediately(startsAt, elegido);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={title}
      // Mismo encuadre que la hoja del día: `m-auto` para recuperar el centrado
      // que el preflight de Tailwind v4 se lleva por delante, respiro lateral y
      // altura topada con scroll interno.
      className="m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-card border border-border bg-surface p-0 text-foreground backdrop:bg-scrim"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-base leading-tight font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("daySheetClose")}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Se dice ANTES de elegir que elegir implica seguir el evento: si no,
            la primera opción parece solo una preferencia y resulta que además
            te suscribe. */}
        {!sigue && (
          <p className="text-xs text-muted-foreground">{t("agendaReminderFollowHint")}</p>
        )}

        {/* Radiogroup de verdad, igual que el de la ficha: una sola parada de
            tabulador y flechas entre opciones. */}
        <fieldset className="flex flex-col gap-0.5" disabled={isPending}>
          <legend className="label-section mb-2">{t("reminderLegend")}</legend>
          {REMINDER_OPTIONS.map((option) => {
            const activa = sigue && option.minutes === elegido;
            return (
              <label
                key={String(option.minutes)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
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
        ) : !sigue ? null : elegido === null ? (
          <p className="text-xs text-muted-foreground">{t("reminderNoneChosen")}</p>
        ) : yaVencido ? (
          // §9.1: se elige un aviso que ya venció. Se dice lo que va a pasar
          // (avisar ya) en vez de guardar en silencio algo que no llegará.
          <p className="text-xs text-muted-foreground">{t("reminderTooLate")}</p>
        ) : cuando ? (
          <p className="text-xs text-muted-foreground">
            {t("reminderWillNotify", { when: cuando })}
          </p>
        ) : null}

        {sigue && (
          <button
            type="button"
            onClick={dejarDeSeguir}
            aria-disabled={isPending}
            className="self-start rounded-md px-2.5 py-1.5 text-xs text-status-dropped underline-offset-2 transition-colors hover:underline aria-disabled:opacity-50"
          >
            {t("eventUnfollow")}
          </button>
        )}
      </div>
    </dialog>
  );
}
