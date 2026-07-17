"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setEpisodeWatched } from "@/lib/series/episode-actions";
import { clearTimer, elapsedMs, pause, start, toMinutes, writeTimer } from "@/lib/sessions/timer";
import { hasTime, useTimerState } from "@/lib/sessions/use-timer-state";
import { ClockIcon, PencilIcon, CheckIcon } from "@/components/ui/icons";

// Las acciones de la tarjeta de hoy. Cambian por tipo, porque "una sesión" no
// significa lo mismo en cada uno:
//
//   · Libro    → cronómetro AQUÍ mismo. Empezar a leer no debería costar una
//                navegación: pulsas y el reloj corre en la propia tarjeta.
//   · Serie    → no hay cronómetro: una serie se mide en episodios (§7.14), así
//                que la acción es marcar el siguiente.
//   · Película → ni sesión ni episodios: solo Registrar.
//
// "Registrar" se queda como estaba en los tres: lleva a la pestaña Registro de
// la ficha. El que va a la vista de sesión es el del cronómetro, y con el
// tiempo puesto.
//
// Es cliente por el cronómetro; los textos llegan traducidos porque `t` no
// cruza la frontera servidor→cliente.
export type TodayActionsLabels = {
  session: string;
  log: string;
  cancel: string;
  register: string;
  timerLabel: string;
  nextEpisode: string | null;
};

export function TodayActions({
  passId,
  itemType,
  seriesId,
  nextEpisode,
  sessionHref,
  logHref,
  labels,
}: {
  /** null en datos huérfanos: sin pase activo no hay sesión que abrir. */
  passId: string | null;
  itemType: "book" | "movie" | "series";
  seriesId: string;
  nextEpisode: { season: number; episode: number } | null;
  /** La vista de añadir sesión, destino del cronómetro. */
  sessionHref: string | null;
  /** La pestaña Registro de la ficha. */
  logHref: string;
  labels: TodayActionsLabels;
}) {
  const canTime = itemType === "book" && passId !== null && sessionHref !== null;
  const canMark = itemType === "series" && nextEpisode !== null;

  // El hook va incondicional (regla de los hooks); sin pase, readTimer devuelve
  // el reloj a cero y nadie lo mira.
  const timer = useTimerState(passId ?? "");
  const timing = canTime && hasTime(timer);

  // Con el cronómetro abierto, la fila es suya: si no, se verían DOS
  // "Registrar" a la vez con destinos distintos (el del reloj va a la vista de
  // sesión con el tiempo; el otro, a la pestaña Registro). Misma palabra y
  // distinto sitio es una trampa, no una opción.
  return (
    <div className="flex border-t border-border">
      {canTime && <BookTimer passId={passId} sessionHref={sessionHref} labels={labels} />}
      {canMark && (
        <MarkNextEpisode
          seriesId={seriesId}
          nextEpisode={nextEpisode}
          label={labels.nextEpisode}
        />
      )}

      {!timing && (
        <Link
          href={logHref}
          className={`flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold transition-colors hover:bg-surface-muted ${
            canTime || canMark ? "border-l border-border text-muted-foreground" : "text-[var(--acc)]"
          }`}
        >
          <PencilIcon className="h-4 w-4" />
          {labels.log}
        </Link>
      )}
    </div>
  );
}

function MarkNextEpisode({
  seriesId,
  nextEpisode,
  label,
}: {
  seriesId: string;
  nextEpisode: { season: number; episode: number };
  label: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        // La acción revalida "/" ella sola, así que la tarjeta se repinta con el
        // episodio siguiente ya movido. Y si era el último, cierra el pase y
        // redirige a la hoja de cierre — por eso no se toca nada aquí después.
        startTransition(async () => {
          await setEpisodeWatched(seriesId, nextEpisode.season, nextEpisode.episode, true);
        })
      }
      className="flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold text-[var(--acc)] transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <CheckIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// El cronómetro de la tarjeta. Es EL MISMO reloj que el de la vista de sesión:
// misma librería y misma clave, así que arrancarlo aquí y abrir la vista de
// sesión no pierde un segundo, y sobrevive a recargar (el estado guarda el
// INSTANTE de arranque, no un contador corriendo).
function BookTimer({
  passId,
  sessionHref,
  labels,
}: {
  passId: string;
  sessionHref: string;
  labels: TodayActionsLabels;
}) {
  const router = useRouter();
  const state = useTimerState(passId);
  const running = state.startedAt !== null;
  // `now` solo fuerza el repintado una vez por segundo; el tiempo SIEMPRE sale
  // de la fórmula pura elapsedMs(state, now), nunca de sumar ticks. Leerlo en
  // el inicializador (y no en el cuerpo) mantiene puro el render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!hasTime(state)) {
    return (
      <button
        type="button"
        onClick={() => {
          const clickedAt = Date.now();
          setNow(clickedAt);
          writeTimer(passId, start(state, clickedAt));
        }}
        className="flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold text-[var(--acc)] transition-colors hover:bg-surface-muted"
      >
        <ClockIcon className="h-4 w-4" />
        {labels.session}
      </button>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 p-3">
      <div className="flex items-center justify-center gap-2">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-[var(--acc)]" : "bg-foreground-faint"}`}
        />
        <p
          className="font-mono text-2xl leading-none font-medium tabular-nums text-foreground"
          aria-label={labels.timerLabel}
        >
          {formatClock(elapsedMs(state, now))}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => clearTimer(passId)}
          className="flex-1 rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          onClick={() => {
            // Se para, se lleva el número a la vista de sesión y se limpia: el
            // reloj ya hizo su trabajo. Si no se limpiara, al volver a la
            // portada seguiría contando una sesión que ya has registrado.
            const stoppedAt = Date.now();
            const minutes = toMinutes(elapsedMs(pause(state, stoppedAt), stoppedAt));
            clearTimer(passId);
            // Menos de medio minuto redondea a 0, y "0 minutos" no es un dato:
            // se va sin el parámetro y el campo queda vacío, como cualquier
            // sesión que se abre a mano.
            router.push(minutes > 0 ? `${sessionHref}?minutos=${minutes}` : sessionHref);
          }}
          className="flex-[2] rounded-[8px] bg-[var(--acc)] px-3 py-1.5 text-[12px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          {labels.register}
        </button>
      </div>
    </div>
  );
}
