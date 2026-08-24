"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateHideDropped } from "@/lib/profile/actions";

// Interruptor de «ocultar obras abandonadas». Aspecto del switch de
// PostPreferences, pero SIN su carga asíncrona: /ajustes ya es un server
// component que tiene el perfil, así que el valor inicial llega por props y la
// primera pintura ya es correcta (nada de un frame en "off" que salta a "on").
export function HideDroppedToggle({ hideDropped }: { hideDropped: boolean }) {
  const t = useTranslations("settings");
  const [on, setOn] = useState(hideDropped);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimista
    startTransition(async () => {
      const result = await updateHideDropped(next);
      if (result?.error) setOn(!next); // revertir si falla
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-foreground">{t("hideDroppedLabel")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("hideDroppedLabel")}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${
            on ? "bg-accent" : "bg-surface-muted"
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${
              on ? "bg-accent-foreground" : "bg-muted-foreground"
            } ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">{t("hideDroppedHint")}</p>
    </div>
  );
}
