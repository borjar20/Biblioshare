"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { usePlayers } from "@/lib/play/core/use-players";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import {
  CLOCK_INCREMENT_MS_MAX,
  CLOCK_INITIAL_MS_MAX,
  CLOCK_INITIAL_MS_MIN,
  CLOCK_MAX_PLAYERS,
} from "@/lib/play/clock/reducer";

const TIME_PRESETS_MIN = [1, 3, 5, 10, 15, 30];
const INCREMENT_PRESETS_S = [0, 5, 10, 30];

/**
 * Setup del reloj de ajedrez: lista propia de jugadores (habituales a un
 * toque), tiempo inicial e incremento Fischer. «Empezar» emite
 * chess_configured. Tras un reset, el estado conserva la config anterior y
 * este formulario la precarga.
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
  const [minutes, setMinutes] = useState(Math.round(state.initialMs / 60_000) || 5);
  const [customMinutes, setCustomMinutes] = useState("");
  const [incrementS, setIncrementS] = useState(Math.round(state.incrementMs / 1000));
  const [customIncrement, setCustomIncrement] = useState("");

  function add(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed) || players.length >= CLOCK_MAX_PLAYERS) return;
    setPlayers([...players, trimmed]);
    setName("");
  }

  const chips = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);

  const parsedCustomMin = Number(customMinutes);
  const initialMs =
    customMinutes !== "" && Number.isFinite(parsedCustomMin)
      ? Math.round(parsedCustomMin * 60_000)
      : minutes * 60_000;
  const parsedCustomInc = Number(customIncrement);
  const incrementMs =
    customIncrement !== "" && Number.isFinite(parsedCustomInc)
      ? Math.round(parsedCustomInc * 1000)
      : incrementS * 1000;

  const valid =
    players.length >= 2 &&
    Number.isInteger(initialMs) &&
    initialMs >= CLOCK_INITIAL_MS_MIN &&
    initialMs <= CLOCK_INITIAL_MS_MAX &&
    Number.isInteger(incrementMs) &&
    incrementMs >= 0 &&
    incrementMs <= CLOCK_INCREMENT_MS_MAX;

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={t("regulars")}>
          {chips.map((r) => (
            <button
              key={r.playerId}
              type="button"
              onClick={() => add(r.name)}
              className="rounded-chip border border-border px-3 py-1 text-[13px]"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(name);
          }}
          aria-label={t("nameLabel")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          onClick={() => add(name)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px]"
        >
          {t("add")}
        </button>
      </div>

      {players.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {players.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => setPlayers(players.filter((x) => x !== p))}
                aria-label={t("remove", { name: p })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {p} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("playersHint")}</p>
      )}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("initial")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {TIME_PRESETS_MIN.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={customMinutes === "" && minutes === m}
            onClick={() => {
              setCustomMinutes("");
              setMinutes(m);
            }}
            className={chipClass(customMinutes === "" && minutes === m)}
          >
            {t("minutes", { n: m })}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          value={customMinutes}
          placeholder="min"
          onChange={(e) => setCustomMinutes(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("customMinutes")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("increment")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {INCREMENT_PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={customIncrement === "" && incrementS === sec}
            onClick={() => {
              setCustomIncrement("");
              setIncrementS(sec);
            }}
            className={chipClass(customIncrement === "" && incrementS === sec)}
          >
            {sec === 0 ? t("noIncrement") : t("plusSeconds", { n: sec })}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          value={customIncrement}
          placeholder="s"
          onChange={(e) => setCustomIncrement(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("customIncrement")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <button
        type="button"
        disabled={!valid}
        onClick={() => emit("chess_configured", { players, initialMs, incrementMs })}
        className={buttonVariants("primary", "mt-5 w-full justify-center py-3 text-[15px]")}
      >
        {t("start")}
      </button>
    </div>
  );
}
