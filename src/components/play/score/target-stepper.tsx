"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HoldRepeatButton } from "@/components/play/ui/hold-repeat-button";

const MIN = 1;
const MAX = 9999;
const clampTarget = (n: number) => Math.min(MAX, Math.max(MIN, Math.trunc(n)));

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
  return (
    <div className="flex items-center gap-2">
      <HoldRepeatButton
        direction={-1}
        label={t("fewer")}
        disabled={value <= MIN}
        onPreview={(acc) => setPreview(acc * step)}
        onCommit={(delta) => commit(delta * step)}
      />
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
      <HoldRepeatButton
        direction={1}
        label={t("more")}
        disabled={value >= MAX}
        onPreview={(acc) => setPreview(acc * step)}
        onCommit={(delta) => commit(delta * step)}
      />
      <span className="text-[13px] text-muted-foreground">{t(kind === "rounds" ? "rounds" : "points").toLowerCase()}</span>
    </div>
  );
}
