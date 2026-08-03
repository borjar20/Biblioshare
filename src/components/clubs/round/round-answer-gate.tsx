"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ensureHouseRound } from "@/lib/clubs/rounds/rounds";
import { buttonVariants } from "@/components/ui/button";

export function RoundAnswerGate({ clubId }: { clubId: string }) {
  const t = useTranslations("club.round");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        // Materializa la fila y revalida: al repintar, el bloque ya tiene
        // interactionTargetId y muestra el hilo de respuestas de verdad.
        onClick={() => startTransition(() => ensureHouseRound(clubId).then(() => undefined))}
        className={buttonVariants("primary")}
      >
        {t("answer")}
      </button>
      <span className="text-xs text-muted-foreground">{t("noAnswersYet")}</span>
    </div>
  );
}
