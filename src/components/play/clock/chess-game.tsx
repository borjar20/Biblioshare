"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { flaggedAt, formatMs, remainingAt } from "@/lib/play/clock/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";
import { useNow } from "./use-now";

/**
 * Juego del reloj de ajedrez: una zona grande por jugador; tocar la ACTIVA
 * pasa el turno. El tiempo visible se deriva por remainingAt con un tick de
 * 250 ms — pausar apaga el tick. Bandera + buzz al cruzar 0; el banco sigue
 * en negativo (agotarse no detiene la partida, spec reloj brainstorm).
 */
export function ChessGame({
  state,
  emit,
}: {
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const running = state.active !== null && !state.paused;
  const now = useNow(running);
  const [confirming, setConfirming] = useState(false);
  // Buzz al cruzar 0: una vez por jugador y configuración.
  const buzzed = useRef<Set<number>>(new Set());
  useEffect(() => {
    state.players.forEach((_, i) => {
      if (flaggedAt(state, now, i) && !buzzed.current.has(i)) {
        buzzed.current.add(i);
        buzz();
      }
    });
  }, [state, now]);

  return (
    <div>
      <div className={`grid gap-3 ${state.players.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {state.players.map((p, i) => {
          const active = state.active === i;
          const flagged = flaggedAt(state, now, i);
          const seat = SEAT_ACCENT[i % SEAT_ACCENT.length];
          return (
            <button
              key={p.name}
              type="button"
              data-testid={`clock-zone-${i}`}
              data-active={active}
              onClick={() => {
                if (active && !state.paused) emit("turn_passed", {});
              }}
              className={`flex flex-col items-center gap-1 rounded-card border p-5 text-center transition-colors ${
                active ? "bg-surface-muted" : "border-border bg-surface"
              }`}
              style={active ? { borderColor: `var(${seat.varName})`, borderWidth: 2 } : undefined}
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: `var(${seat.varName})` }}
                />
                {p.name}
                {flagged ? <span aria-label={t("flag")}>⚑</span> : null}
              </span>
              <span
                data-testid={`clock-time-${i}`}
                className={`font-serif text-[38px] font-semibold leading-none tabular-nums ${
                  flagged ? "text-play-danger" : ""
                }`}
              >
                {formatMs(remainingAt(state, now, i))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        {state.paused ? (
          <button
            type="button"
            onClick={() => emit("clock_resumed", {})}
            className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
          >
            {t("resume")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => emit("clock_paused", {})}
            className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
          >
            {t("pause")}
          </button>
        )}
        {confirming ? (
          <button
            type="button"
            onClick={() => {
              emit("clock_reset", {});
              setConfirming(false);
            }}
            className="p-2 text-[12px] text-play-danger underline"
          >
            {t("resetConfirm")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="p-2 text-[12px] text-muted-foreground underline"
          >
            {t("reset")}
          </button>
        )}
      </div>
    </div>
  );
}
