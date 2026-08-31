"use client";

import { useTranslations } from "next-intl";
import { flipCoin } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";

export function CoinSection({
  lastFlip,
  onEmit,
}: {
  lastFlip: RandomEvent | undefined;
  onEmit: (payload: { result: "heads" | "tails" }) => void;
}) {
  const t = useTranslations("play.random.coin");
  const result = lastFlip && lastFlip.type === "coin_flipped" ? lastFlip.payload.result : null;

  return (
    <div>
      <button
        type="button"
        onClick={() => onEmit({ result: flipCoin() })}
        className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
      >
        {t("flip")}
      </button>
      {result ? (
        <p className="mt-4 font-serif text-[22px] font-semibold" data-testid="coin-result">
          {t(result)}
        </p>
      ) : null}
    </div>
  );
}
