"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { usePlayers } from "@/lib/play/core/use-players";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { CLOCK_MAX_PLAYERS } from "@/lib/play/clock/reducer";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";
import { ClockFace } from "./clock-face";

const TIME_PRESETS_MIN = [1, 3, 5, 10, 15, 30];
const INCREMENT_PRESETS_S = [0, 5, 10, 30];
const MINUTES_MIN = 1;
const MINUTES_MAX = 120;

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Setup visual del reloj (spec reloj-visual §2): esfera viva que refleja el
 * tiempo elegido, jugadores como fichas de asiento (tocar quita; habituales
 * atenuados se encienden; la ficha «+» despliega el único input que queda) y
 * stepper de minutos con mantener. «Empezar 5+5» emite chess_configured —
 * el motor no cambia. El rango 1..120 min por construcción hace innecesaria
 * la validación de rangos aquí.
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
  const { players: regulars } = usePlayers(identity);
  const [players, setPlayers] = useState<string[]>(state.players.map((p) => p.name));
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [minutes, setMinutes] = useState(() =>
    Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(state.initialMs / 60_000) || 5)),
  );
  const [minutesPreview, setMinutesPreview] = useState(0);
  const [incrementS, setIncrementS] = useState(Math.round(state.incrementMs / 1000));

  const clampMin = (n: number) => Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, n));
  const shownMinutes = clampMin(minutes + minutesPreview);
  const commitStep = (total: number) => {
    setMinutes((m) => clampMin(m + total));
    setMinutesPreview(0);
  };
  const stepUp = useHoldRepeat({ step: 1, onPreview: setMinutesPreview, onCommit: commitStep });
  const stepDown = useHoldRepeat({ step: -1, onPreview: setMinutesPreview, onCommit: commitStep });

  function add(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed) || players.length >= CLOCK_MAX_PLAYERS) return;
    setPlayers([...players, trimmed]);
    setName("");
    setAdding(false);
  }

  const regularTokens = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);
  const blockedByCountdown = state.mode === "countdown" && state.countdownRunning;
  const valid = players.length >= 2;
  const expr = incrementS > 0 ? `${shownMinutes}+${incrementS}` : t("minutes", { n: shownMinutes });

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <div className="flex flex-col items-center">
        <ClockFace minutes={shownMinutes} />
        <p className="mt-1 font-serif text-[20px] font-semibold tabular-nums">
          {t("minutes", { n: shownMinutes })}
          {incrementS > 0 ? ` · +${incrementS} s` : ""}
        </p>
      </div>

      {/* Fichas: jugadores en su color de asiento (tocar quita), habituales
          atenuados (tocar añade) y la ficha «+» que abre el input de nombre. */}
      <div className="mt-4 flex flex-wrap items-start justify-center gap-3">
        {players.map((p, i) => (
          <span key={p} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("remove", { name: p })}
              title={p}
              onClick={() => setPlayers(players.filter((x) => x !== p))}
              className="flex h-11 w-11 select-none items-center justify-center rounded-full text-[14px] font-semibold text-surface"
              style={{ background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})` }}
            >
              {initials(p)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{p}</span>
          </span>
        ))}
        {regularTokens.map((r) => (
          <span key={r.playerId} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => add(r.name)}
              title={r.name}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[14px] font-semibold text-muted-foreground opacity-70"
            >
              {initials(r.name)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{r.name}</span>
          </span>
        ))}
        {players.length < CLOCK_MAX_PLAYERS ? (
          <span className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("addPlayer")}
              aria-expanded={adding}
              onClick={() => setAdding(!adding)}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[18px] font-semibold text-muted-foreground"
            >
              +
            </button>
            <span className="text-[10px] text-muted-foreground">{t("addPlayer")}</span>
          </span>
        ) : null}
      </div>
      {adding ? (
        <div className="mt-2 flex justify-center">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(name);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}
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
            aria-pressed={shownMinutes === m}
            onClick={() => {
              setMinutes(m);
              setMinutesPreview(0);
            }}
            className={chipClass(shownMinutes === m)}
          >
            {t("minutes", { n: m })}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={t("fewerMinutes")}
            disabled={minutes <= MINUTES_MIN}
            {...stepDown.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            −
          </button>
          <button
            type="button"
            aria-label={t("moreMinutes")}
            disabled={minutes >= MINUTES_MAX}
            {...stepUp.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            +
          </button>
        </span>
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
        onClick={() =>
          emit("chess_configured", {
            players,
            initialMs: minutes * 60_000,
            incrementMs: incrementS * 1000,
          })
        }
        className={buttonVariants("primary", "mt-5 w-full justify-center py-3 text-[15px]")}
      >
        {t("startExpr", { expr })}
      </button>
    </div>
  );
}
