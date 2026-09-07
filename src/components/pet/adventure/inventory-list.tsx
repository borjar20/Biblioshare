import { useTranslations } from "next-intl";
import { Swords, Shield } from "../training/training-icons";
import type { InventoryEntry } from "@/lib/pet/loot/reward";

export function InventoryList({ inventory }: { inventory: InventoryEntry[] }) {
  const t = useTranslations("pet.adventure");
  if (inventory.length === 0) return <p className="text-sm text-muted-foreground">{t("inventoryEmpty")}</p>;
  return <ul className="grid gap-2 sm:grid-cols-2" data-testid="pet-inventory">
    {inventory.map((e) => <li key={e.itemId} className="flex items-center gap-3 rounded border border-border p-3 text-sm" data-item={e.itemId}>
      {e.slot === "weapon" ? <Swords width={20} height={20} aria-hidden="true" /> : <Shield width={20} height={20} aria-hidden="true" />}
      <span className="flex-1"><strong>{t(`items.${e.itemId}`)}</strong><br /><span className="text-muted-foreground">{t(`slots.${e.slot}`)} · {t("rewardPending")}</span></span>
      {e.count > 1 && <span className="tabular-nums">{t("count", { count: e.count })}</span>}
    </li>)}
  </ul>;
}
