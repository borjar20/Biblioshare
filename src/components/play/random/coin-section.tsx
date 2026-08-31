"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COIN_MAX_COUNT, flipCoins } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { CoinStage } from "./stage/coin-stage";

/**
 * Monedas: stepper 1..COIN_MAX_COUNT y tocar la moneda lanza. Acepta el
 * coins_flipped nuevo y el coin_flipped viejo (logs persistidos) normalizado
 * a results.
 */
export function CoinSection({
  lastFlip,
  onEmit,
}: {
  lastFlip: RandomEvent | undefined;
  onEmit: (payload: { count: number; results: ("heads" | "tails")[] }) => void;
}) {
  const t = useTranslations("play.random.coin");
  const [count, setCount] = useState(1);

  const results =
    lastFlip && lastFlip.type === "coins_flipped"
      ? lastFlip.payload.results
      : lastFlip && lastFlip.type === "coin_flipped"
        ? [lastFlip.payload.result]
        : null;
  const heads = results ? results.filter((r) => r === "heads").length : 0;
  const resultText = results
    ? results.length === 1
      ? t(results[0])
      : t("result", { heads, tails: results.length - heads })
    : null;

  return (
    <div>
      <CoinStage
        flip={lastFlip && results ? { id: lastFlip.id, results } : null}
        idleCount={count}
        resultText={resultText}
        onFlip={() => onEmit({ count, results: flipCoins(count) })}
        label={t("flip")}
        hint={t("hint")}
      />
      <div className="mt-4 flex items-center justify-center gap-1">
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
          disabled={count >= COIN_MAX_COUNT}
          onClick={() => setCount((c) => Math.min(COIN_MAX_COUNT, c + 1))}
          className="rounded-chip border border-border px-3 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
