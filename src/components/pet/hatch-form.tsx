"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { hatchPet, type PetActionState } from "@/lib/pet/actions";
import { NAME_MAX, type PetClass } from "@/lib/pet/classes";
import { buttonVariants } from "@/components/ui/button";
import { ClassPicker } from "./class-picker";
import { PetSprite } from "./pet-sprite";

export function HatchForm({ suggested }: { suggested: PetClass | null }) {
  const t = useTranslations("pet");
  const [cls, setCls] = useState<PetClass | null>(suggested);
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState<PetActionState, FormData>(hatchPet, {});

  const trimmed = name.trim();
  // La bellota enseña la fila «a punto de eclosionar» en cuanto el formulario tiene nombre
  // y clase válidos, aunque todavía no se haya enviado (feedback inmediato, spec bellota-visor §2).
  const hatchReady = trimmed.length >= 1 && trimmed.length <= NAME_MAX && cls !== null;

  return (
    <form action={action} className="flex flex-col gap-6" data-testid="hatch-form">
      <div className="flex flex-col items-center gap-3">
        <PetSprite stage="acorn" petClass={cls ?? "wizard"} mood="neutral" scale={2} hatchReady={hatchReady} label={t("stages.acorn")} />
        <h2 className="font-serif text-xl font-semibold text-foreground">{t("hatch.title")}</h2>
        <p className="max-w-prose text-center text-sm text-muted-foreground">{t("hatch.intro")}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t("hatch.nameLabel")}</span>
        <input
          name="name"
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("hatch.namePlaceholder")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </label>

      <ClassPicker value={cls} onChange={setCls} suggested={suggested} />

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">{t(`hatch.errors.${state.error}`)}</p>
      ) : null}

      <button type="submit" disabled={pending || !cls} className={buttonVariants("primary", "self-center px-6")}>
        {t("hatch.submit")}
      </button>
    </form>
  );
}
