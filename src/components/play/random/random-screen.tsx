"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCompanion } from "@/lib/play/random/use-companion";
import { DiceSection } from "./dice-section";
import { CoinSection } from "./coin-section";
import { PlayersSection } from "./players-section";
import { BagSection } from "./bag-section";
import { ResultFeed } from "./result-feed";

type Tab = "dice" | "coin" | "players" | "bag";
const TABS: Tab[] = ["dice", "coin", "players", "bag"];

/**
 * Pantalla del acompañante «Aleatorio» (spec §4): pestañas-chip, sin setup —
 * entras y usas. Anónimo funciona entero. El feed y deshacer son globales
 * (revierte el último evento, sea de la pestaña que sea).
 */
export function RandomScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.random");
  const companion = useCompanion(identity);
  const [tab, setTab] = useState<Tab>("dice");

  if (!companion.loaded) return null;

  const lastOf = (type: string) => companion.feed.find((e) => e.type === type);

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
        {tab === "dice" ? (
          <DiceSection
            lastRoll={lastOf("dice_rolled")}
            onEmit={(payload) => companion.emit("dice_rolled", payload)}
          />
        ) : null}
        {tab === "coin" ? (
          <CoinSection
            lastFlip={companion.feed.find(
              (e) => e.type === "coins_flipped" || e.type === "coin_flipped",
            )}
            onEmit={(payload) => companion.emit("coins_flipped", payload)}
          />
        ) : null}
        {tab === "players" ? (
          <PlayersSection
            identity={identity}
            players={companion.state.players}
            lastResult={companion.feed.find(
              (e) => e.type === "first_picked" || e.type === "order_drawn" || e.type === "teams_drawn",
            )}
            onSetPlayers={(players) => companion.emit("players_set", { players })}
            onFirst={(players, picked) => companion.emit("first_picked", { players, picked })}
            onOrder={(players, order) => companion.emit("order_drawn", { players, order })}
            onTeams={(players, teams) => companion.emit("teams_drawn", { players, teams })}
          />
        ) : null}
        {tab === "bag" ? (
          <BagSection
            bag={companion.state.bag}
            lastDrawn={lastOf("bag_drawn")}
            onBagSet={(items, withReplacement) =>
              companion.emit("bag_set", { items, withReplacement })
            }
            onDraw={(name) => companion.emit("bag_drawn", { name })}
          />
        ) : null}
      </div>

      <ResultFeed
        feed={companion.feed}
        canUndo={companion.canUndo}
        onUndo={companion.undo}
        onClear={companion.clear}
      />
    </div>
  );
}
