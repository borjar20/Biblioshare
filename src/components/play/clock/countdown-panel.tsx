"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { flaggedAt, formatMs, remainingAt } from "@/lib/play/clock/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { useNow } from "./use-now";

const PRESETS_S = [30, 60, 120, 300, 600];

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Cuenta atrás compartida: presets + custom, aro de progreso SVG y CTA de
 * estado (Empezar/Pausar/Reanudar). Al llegar a 0 el motor la clava (no hay
 * negativo): buzz una vez y el aro queda completo en danger.
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
  const now = useNow(running);
  const [customSeconds, setCustomSeconds] = useState("");

  const left = configured ? remainingAt(state, now) : state.durationMs;
  const done = configured && flaggedAt(state, now);
  const buzzedFor = useRef<number | null>(null);
  useEffect(() => {
    if (done && buzzedFor.current !== state.lastEventAt) {
      buzzedFor.current = state.lastEventAt;
      buzz();
    }
    if (!done) buzzedFor.current = null;
  }, [done, state.lastEventAt]);

  const progress = configured && state.durationMs > 0 ? left / state.durationMs : 1;

  function configure(durationMs: number) {
    emit("countdown_configured", { durationMs });
  }

  const parsedCustom = Number(customSeconds);
  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={configured && state.durationMs === sec * 1000}
            disabled={running}
            onClick={() => configure(sec * 1000)}
            className={chipClass(configured && state.durationMs === sec * 1000)}
          >
            {sec < 60 ? t("seconds", { n: sec }) : t("minutes", { n: sec / 60 })}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={5}
          max={7200}
          value={customSeconds}
          placeholder="s"
          disabled={running}
          onChange={(e) => setCustomSeconds(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && Number.isInteger(parsedCustom)) configure(parsedCustom * 1000);
          }}
          onBlur={() => {
            if (customSeconds !== "" && Number.isInteger(parsedCustom)) {
              configure(parsedCustom * 1000);
            }
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("customSeconds")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <div className="mt-5 flex justify-center">
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
            {formatMs(left)}
          </text>
        </svg>
      </div>

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
          className="p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
