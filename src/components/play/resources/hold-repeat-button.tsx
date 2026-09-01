"use client";

import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";

/**
 * Botón ±1 con mantener-pulsado: envoltorio fino sobre el hook compartido
 * useHoldRepeat — la máquina del gesto (timers, guard del click sintético,
 * cancelaciones) vive allí con sus arreglos de review (avanza #996). Toque =
 * onCommit(±1); mantener acumula EN LOCAL (onPreview) y al soltar emite UN
 * onCommit con el total — un gesto = un deshacer.
 */
export function HoldRepeatButton({
  direction,
  label,
  onPreview,
  onCommit,
}: {
  direction: 1 | -1;
  label: string;
  onPreview: (accumulated: number) => void;
  onCommit: (delta: number) => void;
}) {
  const { handlers } = useHoldRepeat({ step: direction, onPreview, onCommit });
  return (
    <button
      type="button"
      aria-label={label}
      {...handlers}
      className="h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold [touch-action:manipulation]"
    >
      {direction > 0 ? "+" : "−"}
    </button>
  );
}
