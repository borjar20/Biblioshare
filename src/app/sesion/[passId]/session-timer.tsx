"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import {
  clearTimer,
  elapsedMs,
  isStale,
  pause,
  readTimer,
  reset,
  start,
  toMinutes,
  writeTimer,
  type TimerState,
} from "@/lib/sessions/timer";

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Cronómetro persistente (mockup "Paper - Registrar sesión", pantalla 3): el
// tiempo SIEMPRE se calcula con la fórmula pura elapsedMs(state, now) — el
// setInterval de abajo solo refresca `now` una vez por segundo para forzar el
// repintado, nunca acumula el tiempo él mismo. Así el reloj sigue siendo
// correcto si el usuario recarga la página o vuelve horas después con la
// pestaña dormida.
export function SessionTimer({
  passId,
  onMinutes,
}: {
  passId: string;
  /** Se llama cuando el usuario decide pasar de cronómetro a "a mano" tras
   * el aviso de olvido, para trasladar los minutos ya acumulados. */
  onMinutes: (minutes: number) => void;
}) {
  const t = useTranslations("session");
  const [state, setState] = useState<TimerState>(() => readTimer(passId));
  // Momento en el que se evalúa si el cronómetro estaba "olvidado" al
  // aterrizar en la página. Fijo tras el primer render: si el usuario decide
  // seguir usándolo, no queremos que isStale se vuelva true a mitad de sesión
  // solo porque han pasado más de 4h desde el montaje original.
  const [mountedAt] = useState(() => Date.now());
  // `now` es el reloj que usa el render para calcular elapsedMs. Llamar a
  // Date.now() directamente en el cuerpo del componente viola la regla de
  // pureza de React (ver el mismo patrón en criteria-challenge-board.tsx):
  // aquí se lee una vez al montar y se refresca solo desde el setInterval
  // (efecto) y los manejadores de clic (start/pause), nunca durante el render.
  const [now, setNow] = useState(mountedAt);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const stale = !staleDismissed && isStale(state, mountedAt);
  const running = state.startedAt !== null;

  // El setInterval es una suscripción legítima (no una derivación de estado):
  // solo refresca `now` una vez por segundo para forzar el repintado mientras
  // el cronómetro corre. El tiempo mostrado sigue calculándose con la fórmula
  // pura elapsedMs(state, now), nunca sumando estos ticks.
  useEffect(() => {
    if (!running || stale) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, stale]);

  const elapsed = elapsedMs(state, now);
  const minutes = toMinutes(elapsed);

  function handleStart() {
    const clickedAt = Date.now();
    const next = start(state, clickedAt);
    setState(next);
    setNow(clickedAt);
    writeTimer(passId, next);
  }

  function handlePause() {
    const clickedAt = Date.now();
    const next = pause(state, clickedAt);
    setState(next);
    setNow(clickedAt);
    writeTimer(passId, next);
  }

  function handleReset() {
    const next = reset();
    setState(next);
    clearTimer(passId);
  }

  function handleWriteManually() {
    onMinutes(toMinutes(elapsedMs(state, mountedAt)));
    handleReset();
  }

  function handleDiscard() {
    handleReset();
    setStaleDismissed(true);
  }

  if (stale) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-status-dropped/30 bg-status-dropped/10 p-3.5 text-center">
        <div className="flex items-center justify-center gap-1.5 text-status-dropped">
          <AlertIcon className="h-4 w-4" />
          <p className="text-xs">{t("timerStale")}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="secondary" onClick={handleWriteManually}>
            {t("durationManual")}
          </Button>
          <Button type="button" variant="ghost" onClick={handleDiscard}>
            {t("timerDiscard")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-center">
      {/* Este input es el que de verdad viaja en el FormData del formulario
          padre: no hace falta subir el valor por estado en cada tick, se
          recalcula aquí mismo en cada render. */}
      <input type="hidden" name="durationMinutes" value={minutes} />

      <p className="font-mono text-[34px] leading-none font-medium tracking-wide text-foreground">
        {formatClock(elapsed)}
      </p>

      {running && (
        <p className="mt-1.5 flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-wider text-accent uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          {t("timerRunning")}
        </p>
      )}

      <div className="mt-3.5 flex justify-center gap-2.5">
        <Button
          type="button"
          variant="primary"
          onClick={running ? handlePause : handleStart}
          className="flex-[2]"
        >
          {running ? t("timerPause") : t("timerResume")}
        </Button>
        <Button type="button" variant="secondary" onClick={handleReset} className="flex-1">
          {t("timerReset")}
        </Button>
      </div>

      <p className="mt-2.5 text-[11px] text-muted-foreground">{t("timerHint")}</p>
    </div>
  );
}
