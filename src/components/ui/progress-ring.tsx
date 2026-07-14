import type { ReactNode } from "react";

// Anillo de progreso cónico de las cards "board-you" (mockup Paper · Clubes,
// frames de reto de lista y reto genérico). El gradiente va inline: el % es
// dinámico y las clases arbitrarias con comas no sobreviven al purge.
const RING_VAR: Record<"accent" | "green", string> = {
  accent: "--accent",
  green: "--green",
};

export function ProgressRing({
  percent,
  color,
  label,
  children,
}: {
  percent: number;
  color: "accent" | "green";
  /** Descripción accesible del anillo (role="img"). */
  label?: string;
  children: ReactNode;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="img"
      aria-label={label}
      className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(${RING_VAR[color]}) 0 ${p}%, var(--surface-muted) ${p}% 100%)`,
      }}
    >
      <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-surface font-serif text-sm font-semibold text-foreground">
        {children}
      </span>
    </div>
  );
}
