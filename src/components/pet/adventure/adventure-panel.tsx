"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startAdventure, resolveAdventure, replayAdventure } from "@/lib/pet/adventure/actions";
import type { AdventureState } from "@/lib/pet/adventure/types";
import { TrainingPanel } from "../training/training-panel";
import { InventoryList } from "./inventory-list";

export function AdventurePanel({ initial }: { initial: AdventureState }) {
  const t = useTranslations("pet.adventure");
  const router = useRouter();
  const current = initial.current;
  const startLabel = current?.status === "open" ? "resume" : current ? "retry" : "start";
  const canStart = initial.pendingDays.length > 0 || current !== null;
  return <div className="flex flex-col gap-4">
    <div className="text-sm">
      <p className="font-medium" data-testid="adventure-pending">{t("pending", { count: initial.pendingDays.length })}</p>
      <p className="text-muted-foreground">{t("pendingHelp")}</p>
      {current && <p data-testid="adventure-current">{t(current.status === "open" ? "inProgress" : "retryAvailable", { day: current.adventure.day })}</p>}
      {!canStart && <p>{t("none")}</p>}
    </div>
    {canStart && <TrainingPanel kind="adventure" startLabel={startLabel} onDone={() => router.refresh()} actions={{ start: () => startAdventure(), resolve: (intent, inputs) => resolveAdventure(intent, inputs), replay: (intent) => replayAdventure(intent) }} />}
    <section aria-labelledby="inventory-title"><h3 id="inventory-title" className="font-serif text-lg font-semibold">{t("inventory")}</h3><InventoryList inventory={initial.inventory} /></section>
  </div>;
}
