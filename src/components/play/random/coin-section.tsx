"use client";

import { useTranslations } from "next-intl";
import { flipCoin } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { CoinStage } from "./stage/coin-stage";

// La moneda no tiene configuración: el escenario ES la sección entera.
export function CoinSection({
  lastFlip,
  onEmit,
}: {
  lastFlip: RandomEvent | undefined;
  onEmit: (payload: { result: "heads" | "tails" }) => void;
}) {
  const t = useTranslations("play.random.coin");
  const last = lastFlip && lastFlip.type === "coin_flipped" ? lastFlip : null;

  return (
    <CoinStage
      flip={last ? { id: last.id, result: last.payload.result } : null}
      resultText={last ? t(last.payload.result) : null}
      onFlip={() => onEmit({ result: flipCoin() })}
      label={t("flip")}
    />
  );
}
