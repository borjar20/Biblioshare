"use client";

import { useTranslations } from "next-intl";
import { PET_CLASSES, type PetClass, type PetStage } from "@/lib/pet/classes";
import { PetSprite } from "./pet-sprite";

// Seis fichas con la ardilla vestida de cada clase. Radio nativo oculto tras la
// ficha: el formulario lo envía como `class` sin JS extra.
export function ClassPicker({
  value,
  onChange,
  suggested,
  stage = "adult",
  name = "class",
}: {
  value: PetClass | null;
  onChange: (cls: PetClass) => void;
  suggested?: PetClass | null;
  stage?: PetStage;
  name?: string;
}) {
  const t = useTranslations("pet");
  return (
    <div role="radiogroup" aria-label={t("hatch.classLabel")} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PET_CLASSES.map((cls) => {
        const active = value === cls;
        return (
          <label
            key={cls}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border p-3 text-center transition-colors ${
              active ? "border-accent bg-surface-muted" : "border-border bg-surface hover:bg-surface-muted"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={cls}
              checked={active}
              onChange={() => onChange(cls)}
              className="sr-only"
            />
            <PetSprite stage={stage === "acorn" ? "adult" : stage} petClass={cls} mood="happy" scale={1} label={t(`classes.${cls}`)} />
            <span className="text-sm font-semibold text-foreground">{t(`classes.${cls}`)}</span>
            <span className="text-[12px] text-muted-foreground">{t(`classHints.${cls}`)}</span>
            {suggested === cls ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">{t("hatch.suggested")}</span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
