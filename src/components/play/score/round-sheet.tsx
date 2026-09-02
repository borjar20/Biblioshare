"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayStore } from "@/lib/play/core/store";
import type { RoundEditedEvent, RoundScoredEvent } from "@/lib/play/score/events";
import { applyDelta, QUICK_DELTAS } from "@/lib/play/score/round-draft";
import type { ScoreState } from "@/lib/play/score/types";
import { buttonVariants } from "@/components/ui/button";
import { HoldRepeatButton } from "../ui/hold-repeat-button";
import { SeatToken, initials } from "../ui/seat-token";
import { PlaySheet } from "../play-sheet";

const at = () => Date.now();

/**
 * Hoja de UNA ronda, sin teclado del sistema: chips ±5/±10/±20 que aplican al
 * asiento ACTIVO (el último tocado) y, por fila, ficha + número + −/+ con
 * mantener. Con N `<input>` apilados el teclado tapaba «Apuntar» a partir de
 * seis jugadores, y era el gesto más repetido de la herramienta (critique
 * 2026-09-01). `round === null` es alta (todo a cero); un número es edición.
 */
export function RoundSheet({
  state,
  store,
  round,
  onClose,
}: {
  state: ScoreState;
  store: PlayStore;
  round: number | null;
  onClose: () => void;
}) {
  const t = useTranslations("play");
  const [values, setValues] = useState<number[]>(() =>
    round === null ? state.setup.participants.map(() => 0) : [...state.rounds[round]],
  );
  const [active, setActive] = useState(0);
  // Mantener pulsado acumula en local y se pinta encima del valor hasta soltar.
  const [preview, setPreview] = useState<{ seat: number; delta: number } | null>(null);

  const shown = (seat: number) =>
    values[seat] + (preview && preview.seat === seat ? preview.delta : 0);

  // U+2212 (menos matemático), no el guion ASCII de `String(n)`: mismo signo
  // que ya usan los chips ±5/±10/±20 de esta hoja.
  const formatScore = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

  function bump(seat: number, delta: number) {
    setActive(seat);
    setPreview(null);
    setValues((v) => applyDelta(v, seat, delta));
  }

  function confirm() {
    const applied =
      round === null
        ? store.dispatch(
            makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>(
              "round_scored",
              { scores: values },
              at(),
            ),
          )
        : store.dispatch(
            makeEvent<RoundEditedEvent["type"], RoundEditedEvent["payload"]>(
              "round_edited",
              { round, scores: values },
              at(),
            ),
          );
    if (applied) onClose();
  }

  const activeName = state.setup.participants[active]?.name ?? "";

  return (
    <PlaySheet
      title={round === null ? t("roundSheet.title") : t("roundSheet.edit", { round: round + 1 })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 px-3" role="group" aria-label={t("roundSheet.quickFor", { name: activeName })}>
          {QUICK_DELTAS.map((delta) => (
            <button
              key={delta}
              type="button"
              onClick={() => bump(active, delta)}
              aria-label={t("roundSheet.quick", { n: delta > 0 ? `+${delta}` : String(delta), name: activeName })}
              className="tap-44 h-11 min-w-11 rounded-chip border border-border bg-surface px-3 font-mono text-[14px] tabular-nums"
            >
              {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
            </button>
          ))}
        </div>

        {state.setup.participants.map((participant, seat) => (
          <div
            key={participant.id}
            className={`flex items-center gap-2 rounded-card px-3 py-1 ${seat === active ? "bg-surface-muted" : ""}`}
          >
            <SeatToken
              variant="seat"
              seat={seat}
              caption={participant.name}
              label={t("roundSheet.activate", { name: participant.name })}
              selected={seat === active}
              pressed={seat === active}
              onClick={() => setActive(seat)}
            >
              {initials(participant.name)}
            </SeatToken>
            <span
              className="min-w-0 flex-1 text-right font-serif text-[24px] font-semibold tabular-nums"
              aria-label={t("roundSheet.scoreOf", { name: participant.name })}
            >
              {formatScore(shown(seat))}
            </span>
            <HoldRepeatButton
              direction={-1}
              label={t("roundSheet.minus", { name: participant.name })}
              onPreview={(acc) => setPreview({ seat, delta: acc })}
              onCommit={(delta) => bump(seat, delta)}
            />
            <HoldRepeatButton
              direction={1}
              label={t("roundSheet.plus", { name: participant.name })}
              onPreview={(acc) => setPreview({ seat, delta: acc })}
              onCommit={(delta) => bump(seat, delta)}
            />
          </div>
        ))}

        <div className="sticky bottom-0 bg-surface pt-2">
          <button
            type="button"
            onClick={confirm}
            className={buttonVariants("primary", "w-full justify-center py-2.5 text-[14px]")}
          >
            {t("roundSheet.confirm")}
          </button>
        </div>
      </div>
    </PlaySheet>
  );
}
