"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DICE_MAX_COUNT, DICE_MAX_SIDES, rollDice } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";

const QUICK_DICE = [4, 6, 8, 10, 12, 20];

/**
 * Dados: botones rápidos d4–d20 (un toque = 1dX) y tirada libre NdX. El azar
 * se resuelve AQUÍ (rollDice) y el resultado viaja en el payload (spec §2).
 * Inputs numéricos con placeholder visual y select-on-focus, como los del score.
 */
export function DiceSection({
  lastRoll,
  onEmit,
}: {
  lastRoll: RandomEvent | undefined;
  onEmit: (payload: { count: number; sides: number; results: number[] }) => void;
}) {
  const t = useTranslations("play.random.dice");
  const [count, setCount] = useState("");
  const [sides, setSides] = useState("");

  function roll(countValue: number, sidesValue: number) {
    const results = rollDice(countValue, sidesValue);
    onEmit({ count: countValue, sides: sidesValue, results });
  }

  const parsedCount = Number(count || "1");
  const parsedSides = Number(sides || "6");
  const customValid =
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= DICE_MAX_COUNT &&
    Number.isInteger(parsedSides) &&
    parsedSides >= 2 &&
    parsedSides <= DICE_MAX_SIDES;

  const last = lastRoll && lastRoll.type === "dice_rolled" ? describeRandomEvent(lastRoll) : null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {QUICK_DICE.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => roll(1, d)}
            className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
          >
            d{d}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {t("countLabel")}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={DICE_MAX_COUNT}
            value={count}
            placeholder="1"
            onChange={(e) => setCount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {t("sidesLabel")}
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={DICE_MAX_SIDES}
            value={sides}
            placeholder="6"
            onChange={(e) => setSides(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={!customValid}
          onClick={() => roll(parsedCount, parsedSides)}
          className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          {t("roll")}
        </button>
      </div>
      {last ? (
        <p className="mt-4 font-serif text-[22px] font-semibold" data-testid="dice-result">
          {t("result", last.params)}
        </p>
      ) : null}
    </div>
  );
}
