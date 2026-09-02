"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { setCompanionHidden } from "@/lib/pet/actions";

// Mismo interruptor que HideDroppedToggle (optimista, revierte si falla). El
// valor inicial llega por props desde /ajustes. `on` = compañera VISIBLE.
export function PetCompanionToggle({ hidden }: { hidden: boolean }) {
  const t = useTranslations("pet");
  const [on, setOn] = useState(!hidden);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await setCompanionHidden(!next);
      if (result?.error) setOn(!next);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-foreground">{t("companion.label")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("companion.label")}
          data-testid="pet-companion-toggle"
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-muted"}`}
        >
          <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${on ? "bg-accent-foreground" : "bg-muted-foreground"} ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`} />
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t("companion.hint")} <Link href="/mascota" className="text-accent underline">{t("companion.cta")}</Link>
      </p>
    </div>
  );
}
