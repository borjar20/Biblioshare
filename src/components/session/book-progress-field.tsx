"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import materials from "@/components/stage/materials.module.css";
import { clampPage, readProgress } from "@/lib/sessions/page-stepper";
import { combineStartedAt } from "@/lib/sessions/combine-started-at";
import { hasTime, useTimerState } from "@/lib/sessions/use-timer-state";
import { SessionTimer } from "./session-timer";
import { BookmarkField } from "./bookmark-field";

const JUMPS = [10, 25, 50] as const;
const DURATION_CHIPS = [15, 30, 45, 60] as const;

// Bloque de progreso de libro (rediseño, sustituye al desde→hasta de
// session-form.tsx): rail de tres tramos + stepper editable + duración.
// `fromPage` es la posición actual del pase (server), solo lectura aquí —
// nunca se envía, el servidor deriva el tramo comparando con la sesión
// anterior (ver comentario en session-sheet.tsx). `passId` es la clave de
// localStorage del cronómetro (SessionTimer/timer.ts), compartida con la
// tarjeta de hoy.
export function BookProgressField({
  passId,
  fromPage,
  total,
  initialMinutes,
  initialStartedAt,
  onPageChange,
  sessionDate,
}: {
  passId: string;
  fromPage: number | null;
  total: number | null;
  initialMinutes?: number | null;
  /** Hora de inicio (ISO) reenviada por el cronómetro de la tarjeta de hoy
   *  (?inicio=). Se envía tal cual salvo que el usuario ponga una hora a mano
   *  abajo, que manda. Se lleva en un input oculto SIN convertir a hora local
   *  en el render: hacerlo daría distinto en servidor (UTC) y cliente y rompería
   *  la hidratación. */
  initialStartedAt?: string | null;
  /** La página que el usuario está marcando AHORA, para que el anclaje del
   *  compositor la siga. No se usa para enviar nada: el input `name="page"`
   *  sigue siendo la única fuente de la posición de la sesión. */
  onPageChange?: (page: number | null) => void;
  /** Valor EN VIVO del campo Fecha del padre (session-sheet.tsx) — se
   *  combina con la hora opcional de abajo en combineStartedAt. */
  sessionDate: string;
}) {
  const t = useTranslations("session");
  const tr = useTranslations("ritual.bookmark");
  const [toPage, setToPage] = useState(fromPage !== null ? String(fromPage) : "");
  const toPageNum = toPage.trim() === "" ? null : Number(toPage);
  const { delta, remaining } = readProgress(fromPage, toPageNum, total);

  function updatePage(next: string) {
    setToPage(next);
    const parsed = next.trim() === "" ? null : Number(next);
    onPageChange?.(parsed !== null && Number.isFinite(parsed) ? parsed : null);
  }

  // El clamp solo se aplica al fijar un valor por botón/chip o al salir del
  // campo (onBlur) — nunca en cada tecla, o le arrancaríamos el "24" de las
  // manos a medio escribir "240".
  function setPage(next: number) {
    updatePage(String(clampPage(next, total)));
  }

  // No fijo en "manual": si ya hay cronómetro con tiempo para este pase
  // (arrancado desde la tarjeta de portada, misma clave de localStorage),
  // la hoja abre directo en pestaña Cronómetro — "sigue en vivo" tiene que
  // VERSE, no solo persistir en el estado. useTimerState, no una lectura
  // directa de localStorage: eso desincroniza servidor/cliente en el
  // primer render (el servidor no tiene localStorage).
  const timerState = useTimerState(passId);
  const [durationModeOverride, setDurationModeOverride] = useState<
    "manual" | "timer" | null
  >(null);
  const durationMode = durationModeOverride ?? (hasTime(timerState) ? "timer" : "manual");
  const [manualMinutes, setManualMinutes] = useState(
    initialMinutes ? String(initialMinutes) : "",
  );
  const minutesRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // Vacío por defecto a propósito (issue #252): nunca se rellena con "ahora".
  const [startedAtTime, setStartedAtTime] = useState("");
  // La hora a mano manda; si no hay, cae a la que reenvió el cronómetro. Así
  // solo viaja UN name="startedAt" en el FormData (el servidor lee el primero).
  const startedAt = combineStartedAt(sessionDate, startedAtTime);
  const effectiveStartedAt = startedAt ?? initialStartedAt ?? null;

  // "Otro" no es un valor: vacía el campo y le lleva el foco (petición
  // explícita del diseño). Los chips numéricos son un acelerador del MISMO
  // input, no un control aparte — solo hay un name="durationMinutes" en el DOM.
  function pickDuration(minutes: number | null) {
    setManualMinutes(minutes === null ? "" : String(minutes));
    if (minutes === null) {
      if (detailsRef.current) detailsRef.current.open = true;
      minutesRef.current?.focus();
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="flex justify-between font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("advance")}
          {total !== null && (
            <span className="normal-case tracking-normal">
              {t("advanceOf", { current: toPageNum ?? fromPage ?? 0, total })}
            </span>
          )}
        </span>
        <BookmarkField fromPage={fromPage} value={toPageNum} total={total} onChange={(p) => setPage(p)} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("finalPage")}
        </span>
        {/* La cifra ES el input (decisión D1 del brief): tocarla abre el
            teclado numérico y escribes 240 de una vez. El ajuste fino lo da
            el teclado del marcapáginas; los chips, el salto grande. */}
        <div className="flex items-baseline justify-center gap-2 font-serif">
          <span className="text-[22px] text-muted-foreground">{fromPage ?? 0} →</span>
          <Input
            name="page"
            type="number"
            min={0}
            max={total ?? undefined}
            inputMode="numeric"
            aria-label={t("finalPage")}
            value={toPage}
            onChange={(e) => updatePage(e.target.value)}
            onBlur={() => toPageNum !== null && setPage(toPageNum)}
            className="w-[5ch] shrink-0 border-0 bg-transparent p-0! text-center font-serif text-[34px]! font-semibold focus:ring-0"
          />
          {delta !== null && delta > 0 && (
            <span className="font-mono text-[12px] text-[var(--st-gold)]">{tr("delta", { delta })}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {JUMPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage((toPageNum ?? fromPage ?? 0) + n)}
              className={materials.brass}
            >
              {t("jump", { n })}
            </button>
          ))}
        </div>

        {fromPage !== null && toPageNum !== null && (
          <p className="text-center text-[11.5px] text-muted-foreground">
            {t("fromMark", { from: fromPage, to: toPageNum })}
          </p>
        )}
        {delta !== null && delta > 0 && remaining !== null && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11.5px] text-green">
            {t("deltaFull", { delta, remaining })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("duration")}
        </span>
        <div className="flex gap-1.5 rounded-[10px] bg-surface-muted p-1">
          {(["manual", "timer"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={durationMode === mode}
              onClick={() => setDurationModeOverride(mode)}
              className={`flex-1 rounded-[7px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                durationMode === mode
                  ? "bg-surface text-foreground shadow-card"
                  : "text-muted-foreground"
              }`}
            >
              {mode === "manual" ? t("durationManual") : t("durationTimer")}
            </button>
          ))}
        </div>

        {durationMode === "manual" ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={manualMinutes === String(n)}
                  onClick={() => pickDuration(n)}
                  className={materials.brass}
                >
                  {n === 60 ? t("durationHour") : t("durationMinutes", { n })}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickDuration(null)}
                className={materials.brass}
              >
                {t("durationOther")}
              </button>
            </div>
            <details ref={detailsRef} className="flex flex-col gap-2">
              <summary className="cursor-pointer font-mono text-[10px] tracking-wider uppercase text-muted-foreground">{tr("more")}</summary>
              <Input
                ref={minutesRef}
                id="session-duration"
                name="durationMinutes"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                aria-label={t("duration")}
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="session-started-at-time"
                  className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground"
                >
                  {t("startedAtTime")}
                </label>
                <Input
                  id="session-started-at-time"
                  type="time"
                  aria-label={t("startedAtTime")}
                  value={startedAtTime}
                  onChange={(e) => setStartedAtTime(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">{t("startedAtTimeHint")}</p>
              </div>
            </details>
            {effectiveStartedAt && (
              <input type="hidden" name="startedAt" value={effectiveStartedAt} />
            )}
          </div>
        ) : (
          <SessionTimer
            passId={passId}
            onMinutes={(m) => {
              setManualMinutes(String(m));
              setDurationModeOverride("manual");
            }}
          />
        )}
      </div>
    </>
  );
}
