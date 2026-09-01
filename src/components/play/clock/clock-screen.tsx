"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useClock } from "@/lib/play/clock/use-clock";
import { ChessSetup } from "./chess-setup";
import { ChessGame } from "./chess-game";

type Tab = "chess" | "countdown";
const TABS: Tab[] = ["chess", "countdown"];

/**
 * Pantalla del acompañante «Reloj» (spec reloj §2): pestañas-chip como el
 * Aleatorio. En ajedrez, setup o juego según haya chess_configured vigente.
 * La pestaña de cuenta atrás entra en la tarea siguiente.
 */
export function ClockScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.clock");
  const clock = useClock(identity);
  const [tab, setTab] = useState<Tab>("chess");

  if (!clock.loaded) return null;

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <div role="tablist" aria-label={t("title")} className="mt-4 flex flex-wrap gap-2">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-chip border px-3 py-1.5 text-[13px] ${
              tab === id ? "border-foreground bg-surface-muted font-semibold" : "border-border"
            }`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "chess" ? (
          clock.state.mode === "chess" ? (
            <ChessGame state={clock.state} emit={clock.emit} />
          ) : (
            <ChessSetup identity={identity} state={clock.state} emit={clock.emit} />
          )
        ) : null}
        {/* countdown: Task 5 */}
      </div>
    </div>
  );
}
