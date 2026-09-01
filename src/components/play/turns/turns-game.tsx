"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { TurnsEvent } from "@/lib/play/turns/events";
import type { TurnsState } from "@/lib/play/turns/types";
import { aliveCount } from "@/lib/play/turns/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { initials } from "@/components/play/ui/seat-token";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

const RING = 280; // lado del contenedor en px
const RADIUS = 108; // radio de las fichas desde el centro

/**
 * Juego del tracker (spec turnos §2): anillo de fichas con la activa grande y
 * anillada, flecha de dirección, y el CENTRO como botón de avance (fase si
 * quedan; si no, jugador — buzz solo al cambiar de jugador). Tocar ficha viva
 * arma el confirm de eliminar; tocar eliminada restaura directo.
 */
export function TurnsGame({
  state,
  emit,
  undo,
  canUndo,
}: {
  state: TurnsState;
  emit: CompanionEmit<TurnsEvent>;
  undo: () => void;
  canUndo: boolean;
}) {
  const t = useTranslations("play.turns");
  const [pendingEliminate, setPendingEliminate] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const active = state.active as number;

  // buzz SOLO al cambiar de jugador (no de fase).
  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current !== active) {
      prevActive.current = active;
      buzz();
    }
  }, [active]);

  const hasPhases = state.phases.length > 0;
  const onLastPhase = !hasPhases || state.phase >= state.phases.length - 1;

  function advance() {
    if (hasPhases && !onLastPhase) {
      // Doble toque rapidísimo en la penúltima fase: si el estado ya avanzó y
      // phase_advanced es inválido, cae a turn_advanced — sin rechazo mudo
      // (review final).
      if (!emit("phase_advanced", {})) emit("turn_advanced", {});
    } else {
      emit("turn_advanced", {});
    }
    setPendingEliminate(null);
  }

  const n = state.players.length;

  return (
    <div>
      <div className="relative mx-auto" style={{ width: RING, height: RING }}>
        {state.players.map((p, i) => {
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          const x = RING / 2 + RADIUS * Math.cos(angle);
          const y = RING / 2 + RADIUS * Math.sin(angle);
          const isActive = i === active;
          const eliminated = state.eliminated.includes(p);
          const size = isActive ? 56 : 44;
          return (
            <span
              key={p}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: x, top: y }}
            >
              <button
                type="button"
                data-testid={`turn-token-${i}`}
                data-active={isActive}
                data-eliminated={eliminated}
                aria-label={
                  eliminated ? t("restoreToken", { name: p }) : t("eliminateToken", { name: p })
                }
                title={p}
                onClick={() => {
                  if (eliminated) {
                    emit("player_restored", { name: p });
                    setPendingEliminate(null);
                  } else {
                    setPendingEliminate(p);
                  }
                }}
                className={`flex select-none items-center justify-center rounded-full font-semibold text-surface transition-all ${
                  eliminated ? "opacity-35" : ""
                }`}
                style={{
                  width: size,
                  height: size,
                  fontSize: isActive ? 17 : 14,
                  background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})`,
                  boxShadow: isActive ? "0 0 0 3px var(--accent)" : undefined,
                }}
              >
                {initials(p)}
              </button>
              <span className="max-w-[64px] truncate text-[10px] text-muted-foreground">{p}</span>
            </span>
          );
        })}

        {/* Flecha de dirección, arriba y dentro del anillo. */}
        {/* En la banda libre entre la etiqueta de la ficha de arriba (~y74) y
            el botón central (y92): a top-[52px] pisaba la ficha 0, activa en
            el primer frame de cada partida (review Task 3). */}
        <svg
          viewBox="0 0 60 24"
          className="absolute left-1/2 top-[74px] h-4 w-12 -translate-x-1/2"
          aria-hidden="true"
          style={state.direction === -1 ? { transform: "translateX(-50%) scaleX(-1)" } : undefined}
        >
          <path
            d="M 8 18 Q 30 4 50 14"
            fill="none"
            stroke="var(--accent-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <polygon points="50,14 42,10 45,19" fill="var(--accent-ink)" />
        </svg>

        {/* El centro es el botón de avance. */}
        <button
          type="button"
          data-testid="turn-center"
          aria-label={hasPhases && !onLastPhase ? t("nextPhase") : t("nextPlayer")}
          onClick={advance}
          className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 select-none flex-col items-center justify-center rounded-full border-2 bg-surface-muted [touch-action:manipulation]"
          style={{ borderColor: "var(--accent)" }}
        >
          <span data-testid="turn-round" className="font-serif text-[26px] font-semibold leading-none">
            {t("round", { n: state.round })}
          </span>
          {hasPhases ? (
            <span className="max-w-[80px] truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {state.phases[state.phase]}
            </span>
          ) : null}
        </button>
      </div>

      {hasPhases ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {state.phases.map((phase, i) => (
            <span
              key={phase}
              className={`rounded-chip border px-3 py-1 text-[12px] ${
                i === state.phase
                  ? "border-foreground bg-surface-muted font-semibold"
                  : "border-border text-muted-foreground"
              }`}
            >
              {phase}
            </span>
          ))}
        </div>
      ) : null}

      {pendingEliminate ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={aliveCount(state) <= 2}
            onClick={() => {
              emit("player_eliminated", { name: pendingEliminate });
              setPendingEliminate(null);
            }}
            className="p-2 text-[13px] font-semibold text-play-danger underline disabled:opacity-40"
          >
            {t("eliminateConfirm", { name: pendingEliminate })}
          </button>
          <button
            type="button"
            onClick={() => setPendingEliminate(null)}
            className="p-2 text-[13px] text-muted-foreground underline"
          >
            {t("cancel")}
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          aria-pressed={state.direction === -1}
          onClick={() => emit("direction_toggled", {})}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold"
        >
          {t("invert")}
        </button>
        <button
          type="button"
          onClick={() => {
            emit("turn_skipped", {});
            setPendingEliminate(null);
          }}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold"
        >
          {t("skip")}
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("undo")}
        </button>
        {confirmReset ? (
          <button
            type="button"
            onClick={() => {
              emit("turns_reset", {});
              setConfirmReset(false);
            }}
            className="-my-2 p-2 text-[12px] text-play-danger underline"
          >
            {t("resetConfirm")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="-my-2 p-2 text-[12px] text-muted-foreground underline"
          >
            {t("reset")}
          </button>
        )}
      </div>
    </div>
  );
}
