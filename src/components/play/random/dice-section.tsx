"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DICE_MAX_SIDES, rollDice } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";
import { DiceStage } from "./stage/dice-stage";

const QUICK_DICE = [4, 6, 8, 10, 12, 20];
const STEPPER_MAX = 8;

/**
 * Dados: los chips SELECCIONAN el tipo (d? abre caras libres, inválido cae a
 * d6) y el stepper la cantidad; tirar es tocar el escenario. El azar se
 * resuelve AQUÍ (rollDice) y el resultado viaja en el payload.
 */
export function DiceSection({
  lastRoll,
  onEmit,
}: {
  lastRoll: RandomEvent | undefined;
  onEmit: (payload: { count: number; sides: number; results: number[] }) => void;
}) {
  const t = useTranslations("play.random.dice");
  const [sides, setSides] = useState(6);
  const [custom, setCustom] = useState(false);
  const [customSides, setCustomSides] = useState("");
  const [count, setCount] = useState(1);

  const parsedCustom = Number(customSides);
  const customValid =
    Number.isInteger(parsedCustom) && parsedCustom >= 2 && parsedCustom <= DICE_MAX_SIDES;
  const effectiveSides = custom ? (customValid ? parsedCustom : 6) : sides;

  const last = lastRoll && lastRoll.type === "dice_rolled" ? lastRoll : null;
  const resultText = last ? t("result", describeRandomEvent(last).params) : null;

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-4 py-2 text-[14px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <DiceStage
        roll={
          last
            ? { id: last.id, sides: last.payload.sides, results: last.payload.results }
            : null
        }
        idleSides={effectiveSides}
        idleCount={count}
        resultText={resultText}
        onRoll={() => onEmit({ count, sides: effectiveSides, results: rollDice(count, effectiveSides) })}
        label={t("tap")}
        hint={t("hint")}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {QUICK_DICE.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={!custom && sides === d}
            onClick={() => {
              setCustom(false);
              setSides(d);
            }}
            className={chipClass(!custom && sides === d)}
          >
            d{d}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          aria-label={t("customSides")}
          onClick={() => setCustom(true)}
          className={chipClass(custom)}
        >
          d?
        </button>
        {custom ? (
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={DICE_MAX_SIDES}
            aria-label={t("customSides")}
            value={customSides}
            placeholder="6"
            onChange={(e) => setCustomSides(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={t("fewer")}
            disabled={count <= 1}
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="rounded-chip border border-border px-3 py-2 text-[14px] font-semibold disabled:opacity-40"
          >
            −
          </button>
          <span className="w-8 text-center text-[14px] font-semibold tabular-nums">{count}</span>
          <button
            type="button"
            aria-label={t("more")}
            disabled={count >= STEPPER_MAX}
            onClick={() => setCount((c) => Math.min(STEPPER_MAX, c + 1))}
            className="rounded-chip border border-border px-3 py-2 text-[14px] font-semibold disabled:opacity-40"
          >
            +
          </button>
        </span>
      </div>
    </div>
  );
}
