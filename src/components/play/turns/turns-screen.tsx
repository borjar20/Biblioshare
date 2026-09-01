"use client";

import { useTranslations } from "next-intl";
import { useTurns } from "@/lib/play/turns/use-turns";
import { TurnsSetup } from "./turns-setup";

/**
 * Pantalla del acompañante «Turnos» (spec turnos §2): setup o juego según
 * haya turns_configured vigente. El juego entra en la tarea siguiente.
 */
export function TurnsScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.turns");
  const turns = useTurns(identity);

  if (!turns.loaded) return null;

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-5">
        {turns.state.active === null ? (
          <TurnsSetup identity={identity} state={turns.state} emit={turns.emit} />
        ) : null}
        {/* juego: Task 3 */}
      </div>
    </div>
  );
}
