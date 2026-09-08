"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { startAdventure, resolveAdventure, replayAdventure } from "@/lib/pet/adventure/actions";
import type { AdventureState } from "@/lib/pet/adventure/types";
import { TrainingPanel } from "../training/training-panel";
import { EquipmentPanel } from "../loot/equipment-panel";
import type { AdventureBattle } from "@/lib/pet/adventure/types";

export function AdventurePanel({ initial }: { initial: AdventureState }) {
  const t = useTranslations("pet.adventure");
  const router = useRouter();
  const [wonCopy, setWonCopy] = useState<AdventureBattle["adventure"]["copy"]>(null);
  const current = initial.current;
  const startLabel = current?.status === "open" ? "resume" : current ? "retry" : "start";
  const canStart = initial.pendingDays.length > 0 || current !== null;
  return <div className="flex flex-col gap-4">
    <div className="text-sm">
      <p className="font-medium" data-testid="adventure-pending">{t("pending", { count: initial.pendingDays.length })}</p>
      <p className="text-muted-foreground">{t("pendingHelp")}</p>
      {current && <p data-testid="adventure-current">{t(current.status === "open" ? "inProgress" : "retryAvailable", { day: current.adventure.day })}</p>}
    </div>
    {/* Siempre montado: si se desmontara al quedarse sin días pendientes, el `router.refresh()`
        posterior a ganar se llevaría por delante la pantalla de victoria (spec §8). */}
    <TrainingPanel kind="adventure" startLabel={startLabel} onDone={battle => { const copy = (battle as AdventureBattle | null)?.adventure?.copy; if (copy) setWonCopy(copy); router.refresh(); }} canStart={canStart} canStartAnother={initial.pendingDays.length > 0} actions={{ start: () => startAdventure(), resolve: (intent, inputs) => resolveAdventure(intent, inputs), replay: (intent) => replayAdventure(intent) }} />
    <EquipmentPanel copies={wonCopy && !initial.inventory.some(copy => copy.copyId === wonCopy.copyId) ? [wonCopy, ...initial.inventory] : initial.inventory} initialLoadout={initial.loadout} hasOpenAdventure={current?.status === "open"} suggestedCopyId={wonCopy?.copyId} />
  </div>;
}
