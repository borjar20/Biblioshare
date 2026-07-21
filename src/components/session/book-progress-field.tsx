"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { clampPage, readProgress } from "@/lib/sessions/page-stepper";
import { SessionTimer } from "./session-timer";

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
  onPageChange,
}: {
  passId: string;
  fromPage: number | null;
  total: number | null;
  initialMinutes?: number | null;
  /** La página que el usuario está marcando AHORA, para que el anclaje del
   *  compositor la siga. No se usa para enviar nada: el input `name="page"`
   *  sigue siendo la única fuente de la posición de la sesión. */
  onPageChange?: (page: number | null) => void;
}) {
  const t = useTranslations("session");
  const [toPage, setToPage] = useState(fromPage !== null ? String(fromPage) : "");
  const toPageNum = toPage.trim() === "" ? null : Number(toPage);
  const { delta, remaining, readPct, sessionPct } = readProgress(fromPage, toPageNum, total);

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

  const [durationMode, setDurationMode] = useState<"manual" | "timer">("manual");
  const [manualMinutes, setManualMinutes] = useState(
    initialMinutes ? String(initialMinutes) : "",
  );
  const minutesRef = useRef<HTMLInputElement>(null);

  // "Otro" no es un valor: vacía el campo y le lleva el foco (petición
  // explícita del diseño). Los chips numéricos son un acelerador del MISMO
  // input, no un control aparte — solo hay un name="durationMinutes" en el DOM.
  function pickDuration(minutes: number | null) {
    setManualMinutes(minutes === null ? "" : String(minutes));
    if (minutes === null) minutesRef.current?.focus();
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
        <div className="flex h-[15px] overflow-hidden rounded-full border border-border bg-surface-muted">
          <div className="bg-type-book/40" style={{ width: `${readPct}%` }} />
          <div className="bg-accent" style={{ width: `${sessionPct}%` }} />
        </div>
        <div className="flex gap-3.5 text-[10.5px] text-muted-foreground">
          <span>{t("legendRead")}</span>
          <span>{t("legendSession")}</span>
          <span>{t("legendLeft")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("finalPage")}
        </span>
        {/* La cifra ES el input (decisión D1 del brief): tocarla abre el
            teclado numérico y escribes 240 de una vez. Los −/+ son solo para
            el ajuste de ±1 (sin aceleración por mantener pulsado — rechazada
            explícitamente); los chips, para el salto grande. */}
        <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface">
          <button
            type="button"
            aria-label={t("stepDown")}
            onClick={() => setPage((toPageNum ?? 0) - 1)}
            className="grid w-[52px] place-items-center bg-surface-muted text-2xl text-accent"
          >
            −
          </button>
          <div className="flex flex-1 flex-col items-center justify-center py-2">
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
              className="w-full border-0 bg-transparent text-center font-mono text-[26px] font-semibold focus:ring-0"
            />
            <span className="text-[10px] text-muted-foreground">{t("currentPage")}</span>
          </div>
          <button
            type="button"
            aria-label={t("stepUp")}
            onClick={() => setPage((toPageNum ?? 0) + 1)}
            className="grid w-[52px] place-items-center bg-surface-muted text-2xl text-accent"
          >
            +
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {JUMPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage((toPageNum ?? fromPage ?? 0) + n)}
              className="rounded-full border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
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
              onClick={() => setDurationMode(mode)}
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
                  className={`rounded-full border px-2.5 py-1.5 font-mono text-[11px] ${
                    manualMinutes === String(n)
                      ? "border-accent bg-accent/7 text-accent"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  {n === 60 ? t("durationHour") : t("durationMinutes", { n })}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickDuration(null)}
                className="rounded-full border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
              >
                {t("durationOther")}
              </button>
            </div>
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
          </div>
        ) : (
          <SessionTimer
            passId={passId}
            onMinutes={(m) => {
              setManualMinutes(String(m));
              setDurationMode("manual");
            }}
          />
        )}
      </div>
    </>
  );
}
