"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";

const MIN = 1;
const MAX = 9999;
export const clampTarget = (n: number) => Math.min(MAX, Math.max(MIN, Math.trunc(n)));

/**
 * El N del límite como número grande con −/+ y mantener (spec visual-first §5).
 * Paso 1 para rondas y 5 para puntos: un límite de 100 puntos no se sube de uno
 * en uno. Lo usan el hub y la configuración: un solo control, un solo aspecto.
 */
export function TargetStepper({
  kind,
  value,
  onChange,
}: {
  kind: "rounds" | "points";
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("play.scoreSetup");
  const step = kind === "points" ? 5 : 1;
  const [preview, setPreview] = useState(0);
  const commit = (total: number) => {
    setPreview(0);
    onChange(clampTarget(value + total));
  };
  const up = useHoldRepeat({ step, onPreview: setPreview, onCommit: commit });
  const down = useHoldRepeat({ step: -step, onPreview: setPreview, onCommit: commit });
  const btn =
    "h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={t("fewer")} disabled={value <= MIN} {...down.handlers} className={btn}>
        −
      </button>
      <span
        className="min-w-16 text-center font-serif text-[34px] font-semibold leading-none tabular-nums"
        aria-label={t("targetValue")}
        // Sin aria-live: el e2e del tablero asevera UNA sola región
        // aria-live="polite" en /partida/activa, y con Cache Components el
        // DOM de esta pantalla queda congelado (no desmontado) tras el
        // router.push -- una región aquí se cuela en ese recuento (#1003).
      >
        {clampTarget(value + preview)}
      </span>
      <button type="button" aria-label={t("more")} disabled={value >= MAX} {...up.handlers} className={btn}>
        +
      </button>
      <span className="text-[13px] text-muted-foreground">{t(kind === "rounds" ? "rounds" : "points").toLowerCase()}</span>
    </div>
  );
}
