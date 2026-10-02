"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import { SeatPicker } from "@/components/play/ui/seat-picker";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import {
  CLOCK_INITIAL_MS_MAX,
  CLOCK_INITIAL_MS_MIN,
  CLOCK_MAX_PLAYERS,
} from "@/lib/play/clock/reducer";
import { ClockFace } from "./clock-face";

const TIME_PRESETS_MIN = [1, 3, 5, 10, 15, 30];
const INCREMENT_PRESETS_S = [0, 5, 10, 30];
const MINUTE_MS = 60_000;

function parseInitialSeconds(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  // Separar la parte decimal evita perder un milisegundo por aritmética float.
  const ms = Number(match[1]) * 1_000 + Number((match[2] ?? "").padEnd(3, "0"));
  return Number.isSafeInteger(ms) && ms >= CLOCK_INITIAL_MS_MIN && ms <= CLOCK_INITIAL_MS_MAX
    ? ms
    : null;
}

/**
 * Setup visual del reloj (spec reloj-visual §2): esfera viva que refleja el
 * tiempo elegido, jugadores como fichas de asiento y stepper de minutos con
 * mantener. Conserva el tiempo inicial en milisegundos, también al precargar
 * después de reiniciar; el rango 10 s..2 h viene del motor.
 */
export function ChessSetup({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const [players, setPlayers] = useState<string[]>(state.players.map((p) => p.name));
  const [initialSeconds, setInitialSeconds] = useState(String(state.initialMs / 1_000));
  const [timePreviewMs, setTimePreviewMs] = useState(0);
  const [incrementS, setIncrementS] = useState(Math.round(state.incrementMs / 1000));

  const clampTime = (ms: number) =>
    Math.min(CLOCK_INITIAL_MS_MAX, Math.max(CLOCK_INITIAL_MS_MIN, ms));
  const initialMs = parseInitialSeconds(initialSeconds);
  const shownInitialMs = initialMs === null ? null : clampTime(initialMs + timePreviewMs);
  const shownTime =
    shownInitialMs === null
      ? null
      : shownInitialMs % MINUTE_MS === 0
        ? t("minutes", { n: shownInitialMs / MINUTE_MS })
        : t("seconds", { n: shownInitialMs / 1_000 });
  const commitStep = (total: number) => {
    setInitialSeconds((seconds) => {
      const ms = parseInitialSeconds(seconds);
      return ms === null ? seconds : String(clampTime(ms + total) / 1_000);
    });
    setTimePreviewMs(0);
  };
  const stepUp = useHoldRepeat({ step: MINUTE_MS, onPreview: setTimePreviewMs, onCommit: commitStep });
  const stepDown = useHoldRepeat({ step: -MINUTE_MS, onPreview: setTimePreviewMs, onCommit: commitStep });

  const blockedByCountdown = state.mode === "countdown" && state.countdownRunning;
  const valid = players.length >= 2 && initialMs !== null;
  const expr = shownTime === null
    ? ""
    : incrementS > 0 ? `${shownTime} ${t("plusSeconds", { n: incrementS })}` : shownTime;

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <div className="flex flex-col items-center">
        <ClockFace minutes={(shownInitialMs ?? 0) / MINUTE_MS} />
        <p className="mt-1 font-serif text-[20px] font-semibold tabular-nums">
          {shownTime ?? "—"}
          {incrementS > 0 ? ` · +${incrementS} s` : ""}
        </p>
      </div>

      {/* Fichas centradas bajo la esfera: el mismo selector que el resto de
          acompañantes y la mesa de puntuación (SeatPicker). */}
      <div className="mt-4">
        <SeatPicker
          identity={identity}
          players={players}
          max={CLOCK_MAX_PLAYERS}
          onChange={setPlayers}
          align="center"
          idPrefix="clock"
        />
      </div>
      {players.length < 2 ? (
        <p className="mt-2 text-center text-[13px] text-muted-foreground">{t("playersHint")}</p>
      ) : null}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("initial")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {TIME_PRESETS_MIN.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={shownInitialMs === m * MINUTE_MS}
            onClick={() => {
              setInitialSeconds(String(m * 60));
              setTimePreviewMs(0);
            }}
            className={chipClass(shownInitialMs === m * MINUTE_MS)}
          >
            {t("minutes", { n: m })}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={t("fewerMinutes")}
            disabled={initialMs === null || initialMs <= CLOCK_INITIAL_MS_MIN}
            {...stepDown.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            −
          </button>
          <button
            type="button"
            aria-label={t("moreMinutes")}
            disabled={initialMs === null || initialMs >= CLOCK_INITIAL_MS_MAX}
            {...stepUp.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            +
          </button>
        </span>
      </div>

      <div className="mt-3">
        <label htmlFor="clock-initial-seconds" className="text-[13px] text-muted-foreground">
          {t("initialSeconds")}
        </label>
        <input
          id="clock-initial-seconds"
          type="number"
          inputMode="decimal"
          min={CLOCK_INITIAL_MS_MIN / 1_000}
          max={CLOCK_INITIAL_MS_MAX / 1_000}
          step="0.001"
          value={timePreviewMs === 0 || shownInitialMs === null ? initialSeconds : shownInitialMs / 1_000}
          onChange={(e) => {
            setInitialSeconds(e.target.value);
            setTimePreviewMs(0);
          }}
          aria-invalid={initialMs === null}
          aria-describedby={initialMs === null ? "clock-initial-error" : undefined}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-[14px] tabular-nums"
        />
        {initialMs === null ? (
          <p id="clock-initial-error" role="status" className="mt-1 text-[13px] text-play-danger">
            {t("initialRange")}
          </p>
        ) : null}
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("increment")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {INCREMENT_PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={incrementS === sec}
            onClick={() => setIncrementS(sec)}
            className={chipClass(incrementS === sec)}
          >
            {sec === 0 ? t("noIncrement") : t("plusSeconds", { n: sec })}
          </button>
        ))}
      </div>

      {blockedByCountdown ? (
        <p className="mt-4 text-[13px] text-muted-foreground">{t("blockedByCountdown")}</p>
      ) : null}
      <button
        type="button"
        disabled={!valid || blockedByCountdown}
        onClick={() => {
          if (!valid || blockedByCountdown || initialMs === null) return;
          emit("chess_configured", {
            players,
            initialMs,
            incrementMs: incrementS * 1000,
          });
        }}
        className={buttonVariants("primary", "mt-5 w-full justify-center py-3 text-[15px]")}
      >
        {shownTime === null ? t("start") : t("startExpr", { expr })}
      </button>
    </div>
  );
}
