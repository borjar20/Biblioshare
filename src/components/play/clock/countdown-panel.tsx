"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { CLOCK_DURATION_MS_MAX, CLOCK_DURATION_MS_MIN } from "@/lib/play/clock/reducer";
import { flaggedAt, formatMs, remainingAt } from "@/lib/play/clock/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { useNow } from "./use-now";

const PRESETS_S = [30, 60, 120, 300, 600];
const RING_STEP_MS = 30_000;

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Cuenta atrás compartida: el ARO es el selector (spec reloj-visual §3) — con
 * la cuenta parada, tocarlo suma 30 s (mantener repite en local y al soltar
 * emite UN countdown_configured con el total, clavado al rango del motor).
 * Presets absolutos debajo; CTA de estado; al llegar a 0 el motor la clava,
 * buzz una vez y el tiempo central pasa a danger.
 */
export function CountdownPanel({
  state,
  emit,
}: {
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const configured = state.mode === "countdown";
  const running = configured && state.countdownRunning && !state.paused;
  const blockedByChess = state.mode === "chess";
  const now = useNow(running);
  // Acumulado del gesto sobre el aro: se suma en pantalla y se emite al soltar.
  const [ringPreview, setRingPreview] = useState(0);

  const left = configured ? remainingAt(state, now) : state.durationMs;
  const done = configured && flaggedAt(state, now);
  // El aro solo es selector con la cuenta QUIETA (ni corriendo ni en pausa) y
  // sin reloj de ajedrez configurado.
  const ringTappable = !running && !state.paused && !blockedByChess && !done;

  const clampDuration = (ms: number) =>
    Math.min(Math.max(ms, CLOCK_DURATION_MS_MIN), CLOCK_DURATION_MS_MAX);
  const ring = useHoldRepeat({
    step: RING_STEP_MS,
    onPreview: setRingPreview,
    onCommit: (total) => {
      // Guard extra al disabled: si el estado cambió a mitad de gesto (otra
      // pestaña arrancó la cuenta), no se emite nada (review final).
      if (!ringTappable) {
        setRingPreview(0);
        return;
      }
      setRingPreview(0);
      emit("countdown_configured", { durationMs: clampDuration(state.durationMs + total) });
    },
  });

  // Sembrado con el evento vigente si YA está agotada al montar: remontar
  // (cambiar de pestaña y volver) no re-vibra (misma lección que chess-game).
  const buzzedFor = useRef<number | null>(done ? state.lastEventAt : null);
  useEffect(() => {
    if (done && buzzedFor.current !== state.lastEventAt) {
      buzzedFor.current = state.lastEventAt;
      buzz();
    }
    if (!done) buzzedFor.current = null;
  }, [done, state.lastEventAt]);

  // Clavado también EN PREVIEW: sin esto, mantener desde 1:00:00 pasea el
  // número por encima de 2 h y da un latigazo al soltar (review final).
  const shownLeft = ringTappable ? clampDuration(left + ringPreview) : left;
  const progress =
    configured && state.durationMs > 0 ? Math.min(1, left / state.durationMs) : 1;

  function configure(durationMs: number) {
    emit("countdown_configured", { durationMs });
  }

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("duration")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={configured && state.durationMs === sec * 1000}
            disabled={running || blockedByChess}
            onClick={() => configure(sec * 1000)}
            className={chipClass(configured && state.durationMs === sec * 1000)}
          >
            {sec < 60 ? t("seconds", { n: sec }) : t("minutes", { n: sec / 60 })}
          </button>
        ))}
      </div>
      {blockedByChess ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("blockedByChess")}</p>
      ) : null}

      <div className="mt-5 flex justify-center">
        <button
          type="button"
          aria-label={t("addThirty")}
          disabled={!ringTappable}
          {...ring.handlers}
          className="select-none rounded-full disabled:cursor-default [touch-action:manipulation]"
        >
          <svg viewBox="0 0 200 200" className="h-56 w-56" aria-hidden="true">
            <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={done ? "var(--play-danger)" : "var(--accent-ink)"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              transform="rotate(-90 100 100)"
            />
            <text
              x="100"
              y="100"
              textAnchor="middle"
              dominantBaseline="central"
              className="font-serif"
              fontSize="40"
              fontWeight="600"
              fill={done ? "var(--play-danger)" : "var(--foreground)"}
              style={{ fontVariantNumeric: "tabular-nums" }}
              data-testid="countdown-time"
            >
              {formatMs(shownLeft)}
            </text>
          </svg>
        </button>
      </div>
      <p className="sr-only">{formatMs(shownLeft)}</p>

      {/* `|| done`: en vivo (sin evento posterior) el estado aún dice
          countdownRunning=true con left=0 — el CTA honesto es «Empezar», que
          recarga primero. */}
      {!configured || (!state.countdownRunning && !state.paused) || done ? (
        <button
          type="button"
          disabled={!configured}
          onClick={() => emit("countdown_started", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("start")}
        </button>
      ) : state.paused ? (
        <button
          type="button"
          onClick={() => emit("clock_resumed", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("resume")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => emit("clock_paused", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("pause")}
        </button>
      )}
      <div className="mt-2 text-center">
        <button
          type="button"
          disabled={!configured}
          onClick={() => emit("countdown_reset", {})}
          className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
