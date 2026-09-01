"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { SeatPicker } from "@/components/play/ui/seat-picker";
import { shuffle } from "@/lib/play/random/draws";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { TurnsEvent } from "@/lib/play/turns/events";
import type { TurnsState } from "@/lib/play/turns/types";
import { TURNS_MAX_PHASES, TURNS_MAX_PLAYERS } from "@/lib/play/turns/reducer";

// Fases habituales de mesa: se ENCIENDEN en el orden en que se tocan. Solo
// español (única locale); un set custom entra por la píldora «+».
const PHASE_PRESETS = ["Mantenimiento", "Robar", "Acción", "Construir", "Combate", "Final"];

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
  const [players, setPlayers] = useState<string[]>(state.players);
  const [phasesOn, setPhasesOn] = useState<string[]>(state.phases);
  const [phaseName, setPhaseName] = useState("");
  const [addingPhase, setAddingPhase] = useState(false);

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
      {/* El ORDEN de las fichas es el orden de turno; «Barajar» lo sortea. */}
      <div className="mt-2">
        <SeatPicker
          identity={identity}
          players={players}
          max={TURNS_MAX_PLAYERS}
          onChange={setPlayers}
          idPrefix="turns"
        />
      </div>
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
