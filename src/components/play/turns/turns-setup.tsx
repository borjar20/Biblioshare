"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { usePlayers } from "@/lib/play/core/use-players";
import { shuffle } from "@/lib/play/random/draws";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { TurnsEvent } from "@/lib/play/turns/events";
import type { TurnsState } from "@/lib/play/turns/types";
import { TURNS_MAX_PHASES, TURNS_MAX_PLAYERS } from "@/lib/play/turns/reducer";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

// Fases habituales de mesa: se ENCIENDEN en el orden en que se tocan. Solo
// español (única locale); un set custom entra por la píldora «+».
const PHASE_PRESETS = ["Mantenimiento", "Robar", "Acción", "Construir", "Combate", "Final"];

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Setup del tracker (spec turnos §2): cero inputs a la vista — jugadores como
 * fichas de asiento (el orden es el de alta; «Barajar» lo sortea) y fases como
 * píldoras preset que se encienden en orden de toque, con badge numérico. Los
 * dos únicos inputs viven tras fichas/píldoras «+». «Empezar» emite
 * turns_configured. Tras un reset, el estado conserva players/phases y este
 * formulario los precarga.
 */
export function TurnsSetup({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: TurnsState;
  emit: CompanionEmit<TurnsEvent>;
}) {
  const t = useTranslations("play.turns");
  const { players: regulars } = usePlayers(identity);
  const [players, setPlayers] = useState<string[]>(state.players);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [phasesOn, setPhasesOn] = useState<string[]>(state.phases);
  const [phaseName, setPhaseName] = useState("");
  const [addingPhase, setAddingPhase] = useState(false);

  function addPlayer(candidate: string, fromInput = false) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed) || players.length >= TURNS_MAX_PLAYERS) {
      return;
    }
    setPlayers([...players, trimmed]);
    // Solo el alta DESDE el input limpia y cierra (memoria visual-first).
    if (fromInput) {
      setName("");
      setAdding(false);
    }
  }

  function togglePhase(phase: string) {
    setPhasesOn(
      phasesOn.includes(phase)
        ? phasesOn.filter((p) => p !== phase)
        : phasesOn.length < TURNS_MAX_PHASES
          ? [...phasesOn, phase]
          : phasesOn,
    );
  }

  function addPhase(candidate: string) {
    const trimmed = candidate.trim();
    if (
      trimmed === "" ||
      phasesOn.includes(trimmed) ||
      phasesOn.length >= TURNS_MAX_PHASES
    ) {
      return;
    }
    setPhasesOn([...phasesOn, trimmed]);
    setPhaseName("");
    setAddingPhase(false);
  }

  const regularTokens = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);
  const customPhases = phasesOn.filter((p) => !PHASE_PRESETS.includes(p));

  const pillClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("players")}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {players.map((p, i) => (
          <span key={p} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("removeToken", { name: p })}
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
              onClick={() => addPlayer(r.name)}
              aria-label={r.name}
              title={r.name}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[14px] font-semibold text-muted-foreground opacity-70"
            >
              {initials(r.name)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{r.name}</span>
          </span>
        ))}
        {players.length < TURNS_MAX_PLAYERS ? (
          <span className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("addPlayer")}
              aria-expanded={adding}
              aria-controls="turns-add-player"
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
        <div id="turns-add-player" className="mt-2 flex justify-center">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPlayer(name, true);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={players.length < 2}
          onClick={() => setPlayers(shuffle(players))}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("shuffle")}
        </button>
        {players.length < 2 ? (
          <p className="text-[13px] text-muted-foreground">{t("playersHint")}</p>
        ) : null}
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("phases")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {PHASE_PRESETS.map((phase) => {
          const idx = phasesOn.indexOf(phase);
          return (
            <button
              key={phase}
              type="button"
              aria-pressed={idx >= 0}
              onClick={() => togglePhase(phase)}
              className={pillClass(idx >= 0)}
            >
              {idx >= 0 ? `${idx + 1} · ${phase}` : phase}
            </button>
          );
        })}
        {customPhases.map((phase) => (
          <button
            key={phase}
            type="button"
            aria-pressed
            onClick={() => togglePhase(phase)}
            className={pillClass(true)}
          >
            {phasesOn.indexOf(phase) + 1} · {phase}
          </button>
        ))}
        {phasesOn.length < TURNS_MAX_PHASES ? (
          <button
            type="button"
            aria-label={t("addPhase")}
            aria-expanded={addingPhase}
            aria-controls="turns-add-phase"
            onClick={() => setAddingPhase(!addingPhase)}
            className={pillClass(false)}
          >
            +
          </button>
        ) : null}
      </div>
      {addingPhase ? (
        <div id="turns-add-phase" className="mt-2">
          <input
            autoFocus
            value={phaseName}
            placeholder={t("phasePlaceholder")}
            onChange={(e) => setPhaseName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPhase(phaseName);
            }}
            aria-label={t("phaseLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}

      <button
        type="button"
        disabled={players.length < 2}
        onClick={() => emit("turns_configured", { players, phases: phasesOn })}
        className={buttonVariants("primary", "mt-5 w-full justify-center py-3 text-[15px]")}
      >
        {t("start")}
      </button>
    </div>
  );
}
