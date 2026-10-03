"use client";

import { useTranslations } from "next-intl";
import { MOMENT_KINDS, type MomentKind } from "@/lib/experiences/types";
import { ExperienceKindIcon } from "./experience-artwork";

/** Native radios keep arrow-key navigation and a real form value. */
export function ExperienceKindPicker({ value, onChange, legend, name = "kind" }: {
  value: MomentKind;
  onChange: (kind: MomentKind) => void;
  legend: string;
  name?: string;
}) {
  const t = useTranslations("experiences");
  return <fieldset>
    <legend className="mb-3 font-serif text-lg font-semibold">{legend}</legend>
    <div className="grid grid-cols-3 gap-2 sm:gap-3">{MOMENT_KINDS.map(kind => <label key={kind} className="relative min-w-0 cursor-pointer">
      <input className="peer sr-only" type="radio" name={name} value={kind} checked={value === kind} onChange={() => onChange(kind)}/>
      <span className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-2 py-3 text-center text-xs transition-colors hover:bg-surface-muted peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent sm:text-sm">
        <ExperienceKindIcon kind={kind} className="h-7 w-7"/>
        <span>{t(`kinds.${kind}`)}</span>
      </span>
    </label>)}</div>
  </fieldset>;
}
