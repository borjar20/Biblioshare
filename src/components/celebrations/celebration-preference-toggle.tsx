"use client";

import { useCelebration } from "./celebration-provider";
import type { CelebrationPreference } from "@/lib/celebrations/types";

const OPTIONS: { value: CelebrationPreference; label: string; hint: string }[] = [
  { value: "full", label: "Completas", hint: "Con animación" },
  { value: "reduced", label: "Reducidas", hint: "Solo un aviso, sin movimiento" },
  { value: "disabled", label: "Desactivadas", hint: "No mostrar ninguna" },
];

// Control de la preferencia de celebraciones. Vive donde se editan los ajustes
// (junto al objetivo diario). Lee/escribe vía el provider, que ya persiste en
// localStorage y avisa al overlay en vivo.
export function CelebrationPreferenceToggle() {
  // preference viene de useSyncExternalStore en el provider: hidratación segura
  // (el servidor asume "full" y el cliente reconcilia sin desajuste).
  const { preference: value, setPreference } = useCelebration();

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
      <legend className="label-section mb-1">Celebraciones</legend>
      <div
        role="radiogroup"
        aria-label="Celebraciones"
        className="flex flex-wrap gap-2"
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.hint}
              onClick={() => setPreference(opt.value)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
