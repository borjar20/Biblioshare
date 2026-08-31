"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayStore } from "@/lib/play/core/store";
import type { RoundEditedEvent, RoundScoredEvent } from "@/lib/play/score/events";
import type { ScoreState } from "@/lib/play/score/types";
import { buttonVariants } from "@/components/ui/button";
import { PlaySheet } from "../play-sheet";

const at = () => Date.now();

/** Texto de un input -> puntuación entera. Vacío cuenta 0; lo no numérico también
 *  (mismo trato tolerante que `player-sheet.tsx` con las vidas exactas), y el
 *  reducer sigue siendo quien decide si el resultado es válido. */
function parseScore(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Hoja de UNA ronda: un input por jugador, positivo o negativo. `round === null` es
 * alta (todo a cero); un número es edición de esa ronda, precargada con sus valores.
 *
 * Igual que `player-sheet.tsx` con las vidas exactas: el input es texto, no
 * `type="number"` — así el `-` de un negativo se escribe sin que el navegador lo
 * bloquee ni redondee los steppers nativos.
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
  // Alta: campos VACÍOS con el 0 solo de placeholder — un valor físico obliga a
  // borrarlo antes de escribir (refinado 2026-08-31). parseScore ya trata "" como
  // 0, así que confirmar sin tocar un campo sigue puntuando 0. La edición sí
  // precarga los valores reales: ahí son dato, no relleno.
  const [values, setValues] = useState<string[]>(() =>
    round === null
      ? state.setup.participants.map(() => "")
      : state.rounds[round].map((score) => String(score)),
  );

  function confirm() {
    const scores = values.map(parseScore);
    // Si el reducer rechaza la ronda (longitud imposible aquí, pero la regla es la
    // misma que en las hojas de mtg: un `dispatch` fallido NO cierra), la hoja se
    // queda abierta para que se pueda corregir sin perder lo escrito.
    const applied =
      round === null
        ? store.dispatch(
            makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>(
              "round_scored",
              { scores },
              at(),
            ),
          )
        : store.dispatch(
            makeEvent<RoundEditedEvent["type"], RoundEditedEvent["payload"]>(
              "round_edited",
              { round, scores },
              at(),
            ),
          );
    if (applied) onClose();
  }

  return (
    <PlaySheet
      title={round === null ? t("roundSheet.title") : t("roundSheet.edit", { round: round + 1 })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        {state.setup.participants.map((participant, seat) => (
          <div key={participant.id} className="flex items-center gap-2.5 px-3">
            <span className="min-w-0 flex-1 truncate text-[14px]">{participant.name}</span>
            <input
              value={values[seat]}
              onChange={(e) => {
                const next = [...values];
                next[seat] = e.target.value;
                setValues(next);
              }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0"
              inputMode="numeric"
              aria-label={t("roundSheet.scoreOf", { name: participant.name })}
              className="w-20 rounded-chip border border-border bg-background px-2.5 py-2 text-right font-mono tabular-nums"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={confirm}
          className={buttonVariants("primary", "mt-2 w-full justify-center py-2.5 text-[14px]")}
        >
          {t("roundSheet.confirm")}
        </button>
      </div>
    </PlaySheet>
  );
}
