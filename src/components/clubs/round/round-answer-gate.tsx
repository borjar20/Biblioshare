"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ensureHouseRound } from "@/lib/clubs/rounds/rounds";
import { buttonVariants } from "@/components/ui/button";

export function RoundAnswerGate({ clubId }: { clubId: string }) {
  const t = useTranslations("club.round");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function answer() {
    setError(null);
    startTransition(async () => {
      try {
        // Materializa la fila y revalida: al repintar, el bloque ya tiene
        // interactionTargetId y muestra el hilo de respuestas de verdad.
        await ensureHouseRound(clubId);
      } catch {
        // ensure_club_round sigue lanzando aquí (sin resultado discriminado:
        // no hay copia de dominio propia para esto, a diferencia de
        // proposeRound). Un fallo transitorio, o una pestaña abierta al
        // cruzar la semana (la RPC responde house_round_too_early si el día
        // real retrocede bajo el botón), reventaba antes en un error
        // boundary en vez de en un mensaje.
        setError(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending} onClick={answer} className={buttonVariants("primary")}>
          {t("answer")}
        </button>
        <span className="text-xs text-muted-foreground">{t("noAnswersYet")}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-dropped">
          {error}
        </p>
      )}
    </div>
  );
}
