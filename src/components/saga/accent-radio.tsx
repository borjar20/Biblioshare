"use client";

import { SAGA_ACCENT, SAGA_ACCENT_SEQUENCE, type SagaAccentToken } from "@/lib/sagas/accents";
import { useTranslations } from "next-intl";

// Radios de acento para formularios de saga (paleta del editor, sin beige).
// Valor vacío = «automático» (accent_color null → rotación de la secuencia).
// `has-[:checked]:` es el mecanismo de selección visual que ya usa el repo
// para radios ocultos (patrón add-note-form/session-form): Tailwind v4 sí
// soporta el atajo `has-checked:`, pero se mantiene la forma explícita para
// no introducir una segunda convención.
export function AccentRadio({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: SagaAccentToken | null;
}) {
  const t = useTranslations("sagaIndex");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs has-[:checked]:border-accent">
        <input type="radio" name={name} value="" defaultChecked={!defaultValue} className="sr-only" />
        <span>{t("accentAuto")}</span>
      </label>
      {SAGA_ACCENT_SEQUENCE.map((token) => (
        <label
          key={token}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs has-[:checked]:border-accent"
        >
          <input type="radio" name={name} value={token} defaultChecked={defaultValue === token} className="sr-only" />
          <span aria-hidden className={`h-3 w-3 rounded-full ${SAGA_ACCENT[token].bg}`} />
          <span className="capitalize">{token}</span>
        </label>
      ))}
    </div>
  );
}
