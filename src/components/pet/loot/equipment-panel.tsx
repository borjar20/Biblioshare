"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { equipLoot } from "@/lib/pet/loot/actions";
import { LOOT_ITEMS, LOOT_SLOTS, type LootSlot } from "@/lib/pet/loot/catalog";
import { effectValue } from "@/lib/pet/loot/effects";
import { LOOT_ART } from "@/lib/pet/loot/art";
import type { LootCopy, PetLoadout } from "@/lib/pet/loot/types";

function CopyDetails({ copy }: { copy: LootCopy }) {
  const t = useTranslations("pet.adventure");
  const format = useFormatter();
  return <div className="flex items-start gap-3">
    {/* Pixel art stays at its native resolution; the adjacent name supplies the label. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={LOOT_ART[copy.itemId].icon} width={64} height={64} alt="" className="shrink-0 [image-rendering:pixelated]" />
    <div className="min-w-0">
    <strong className="block">{t(`items.${copy.itemId}`)}</strong>
    <span className="block tabular-nums text-accent">{t("equipment.potency", { value: format.number(copy.qualityBp / 10000, { minimumFractionDigits: 1 }) })}</span>
    <p className="mt-1 text-sm text-muted-foreground">{t(`equipment.effects.${copy.itemId}`, { value: format.number(effectValue(copy), { maximumFractionDigits: 2 }) })}</p>
    </div>
  </div>;
}

export function EquipmentPanel({ copies, initialLoadout, hasOpenAdventure, suggestedCopyId, onEquip = equipLoot }: {
  copies: LootCopy[]; initialLoadout: PetLoadout; hasOpenAdventure: boolean; suggestedCopyId?: string; onEquip?: typeof equipLoot;
}) {
  const t = useTranslations("pet.adventure");
  const format = useFormatter();
  const [selection, setSelection] = useState<{ suggestion: string | undefined; id: string } | null>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selection) comparisonRef.current?.focus(); }, [selection]);
  const selectedId = selection?.suggestion === suggestedCopyId ? selection?.id : suggestedCopyId;
  const [saved, setSaved] = useState<{ base: PetLoadout; value: PetLoadout } | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const loadout = saved?.base === initialLoadout ? saved.value : initialLoadout;
  const selected = copies.find(copy => copy.copyId === selectedId) ?? null;
  async function change(slot: LootSlot, copyId: string | null) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false); setConfirmed(false);
    try {
      const response = await onEquip(slot, copyId);
      if (response.ok) { setSaved({ base: initialLoadout, value: response.loadout }); setConfirmed(true); }
      else setError(true);
    } catch { setError(true); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="flex flex-col gap-4" aria-labelledby="pet-equipment-title" data-testid="pet-equipment" aria-busy={pending}>
    <div>
      <h3 id="pet-equipment-title" className="font-serif text-lg font-semibold">{t("equipment.title")}</h3>
      <p className="text-sm text-muted-foreground">{t(hasOpenAdventure ? "equipment.openHelp" : "equipment.help")}</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {LOOT_SLOTS.map(slot => <div key={slot} className="rounded border border-border bg-background p-4" data-testid={`equipped-${slot}`}>
        <h4 className="mb-2 text-sm font-medium">{t(`slots.${slot}`)}</h4>
        {loadout[slot] ? <><CopyDetails copy={loadout[slot]} /><Button variant="ghost" disabled={pending} className="mt-2" onClick={() => change(slot, null)}>{t("equipment.remove", { slot: t(`slots.${slot}`).toLocaleLowerCase() })}</Button></>
          : <p className="text-sm text-muted-foreground">{t("equipment.empty")}</p>}
      </div>)}
    </div>
    <p role="status" className="text-sm" aria-live="polite">{error ? t("equipment.error") : pending ? t("equipment.saving") : confirmed ? t("equipment.saved") : ""}</p>
    <div><h4 className="font-serif text-lg font-semibold">{t("inventory")}</h4><p className="text-sm text-muted-foreground">{t("equipment.fixedHelp")}</p></div>
    {copies.length === 0 ? <p className="text-sm text-muted-foreground">{t("inventoryEmpty")}</p> : LOOT_SLOTS.map(slot => <div key={slot}>
      <h5 className="mb-2 font-medium">{t(`slots.${slot}`)}</h5>
      <div className="grid gap-2" data-testid={`loot-${slot}`}>
        {LOOT_ITEMS.filter(item => item.slot === slot).map(item => {
          const owned = copies.filter(copy => copy.itemId === item.id).sort((a, b) => b.qualityBp - a.qualityBp || a.copyId.localeCompare(b.copyId));
          if (!owned.length) return null;
          return <details key={item.id} className="rounded border border-border p-3" data-item={item.id}>
          <summary className="cursor-pointer font-medium">{t(`items.${item.id}`)} <span className="text-sm text-muted-foreground">({owned.length})</span></summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {owned.map(copy => <li key={copy.copyId} data-copy={copy.copyId} className="rounded border border-border p-3 text-sm">
          <CopyDetails copy={copy} />
          <p className="mt-2 text-xs text-muted-foreground">{t("equipment.acquired", { date: format.dateTime(new Date(copy.acquiredAt), { dateStyle: "medium" }) })}</p>
          <Button variant="secondary" className="mt-2" disabled={pending} aria-pressed={selectedId === copy.copyId} onClick={() => { setSelection({ suggestion: suggestedCopyId, id: copy.copyId }); setError(false); }}>
            {loadout[slot]?.copyId === copy.copyId ? t("equipment.equipped") : t("equipment.compare")}
          </Button>
        </li>)}
          </ul></details>;
        })}
      </div>
    </div>)}
    {selected && <div ref={comparisonRef} tabIndex={-1} className="rounded border border-accent p-4" role="region" aria-label={t("equipment.comparison")} data-testid="loot-comparison">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h4 className="mb-2 font-medium">{t("equipment.current")}</h4>{loadout[selected.slot] ? <CopyDetails copy={loadout[selected.slot]!} /> : <p>{t("equipment.empty")}</p>}</div>
        <div><h4 className="mb-2 font-medium">{t("equipment.candidate")}</h4><CopyDetails copy={selected} /></div>
      </div>
      <Button variant="secondary" className="mt-4" disabled={pending || loadout[selected.slot]?.copyId === selected.copyId} onClick={() => change(selected.slot, selected.copyId)}>{t("equipment.equip")}</Button>
    </div>}
  </section>;
}
