"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { equipLoot } from "@/lib/pet/loot/actions";
import { LOOT_ITEMS, LOOT_SLOTS, type LootSlot } from "@/lib/pet/loot/catalog";
import { effectValue } from "@/lib/pet/loot/effects";
import { LOOT_ART } from "@/lib/pet/loot/art";
import type { LootCopy, PetLoadout } from "@/lib/pet/loot/types";
import { Shield, Swords } from "../training/training-icons";
import styles from "./equipment-panel.module.css";

/** Silueta de lo que cabe en cada ranura: un rectángulo con «Sin equipar»
 * dentro no decía si esperaba un arma o un amuleto. */
const SLOT_GHOST = { weapon: Swords, amulet: Shield } as const;

function CopyIcon({ copy }: { copy: LootCopy }) {
  // The surrounding control or details supplies the accessible name.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOOT_ART[copy.itemId].icon} width={64} height={64} alt="" className={styles.icon} />;
}

function CopyDetails({ copy }: { copy: LootCopy }) {
  const t = useTranslations("pet.adventure");
  const format = useFormatter();
  return <div className={styles.copyDetails}>
    <CopyIcon copy={copy} />
    <div>
      <strong>{t(`items.${copy.itemId}`)}</strong>
      <span className={styles.potency}>{t("equipment.potency", { value: format.number(copy.qualityBp / 10000, { minimumFractionDigits: 1 }) })}</span>
      <p>{t(`equipment.effects.${copy.itemId}`, { value: format.number(effectValue(copy), { maximumFractionDigits: 2 }) })}</p>
      <p className={styles.date}>{t("equipment.acquired", { date: format.dateTime(new Date(copy.acquiredAt), { dateStyle: "medium" }) })}</p>
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
  return <section className={styles.panel} aria-labelledby="pet-equipment-title" data-testid="pet-equipment" aria-busy={pending}>
    <header>
      <h3 id="pet-equipment-title">{t("equipment.title")}</h3>
      <p className={styles.help}>{t(hasOpenAdventure ? "equipment.openHelp" : "equipment.help")}</p>
    </header>
    <div className={styles.slots}>
      {LOOT_SLOTS.map(slot => {
        const Ghost = SLOT_GHOST[slot];
        const equipped = loadout[slot];
        return <div key={slot} className={styles.slot} data-testid={`equipped-${slot}`} data-filled={equipped ? "true" : "false"}>
          <h4>{t(`slots.${slot}`)}</h4>
          <span className={styles.slotArt}>
            {equipped ? <CopyIcon copy={equipped} /> : <span className={styles.slotGhost} aria-hidden="true"><Ghost /></span>}
          </span>
          {equipped ? <>
            <strong>{t(`items.${equipped.itemId}`)}</strong>
            <span className={styles.potency}>{t("equipment.potency", { value: format.number(equipped.qualityBp / 10000, { minimumFractionDigits: 1 }) })}</span>
            <button type="button" disabled={pending} className={styles.remove} onClick={() => change(slot, null)}>{t("equipment.remove", { slot: t(`slots.${slot}`).toLocaleLowerCase() })}</button>
          </> : <p className={styles.emptySlot}>{t("equipment.empty")}</p>}
        </div>;
      })}
    </div>
    <p role="status" className={styles.status} data-error={error || undefined} aria-live="polite">{error ? t("equipment.error") : pending ? t("equipment.saving") : confirmed ? t("equipment.saved") : ""}</p>
    <div className={styles.inventoryLayout}>
      <div className={styles.inventory}>
        <div><h4>{t("inventory")}</h4><p className={styles.help}>{t("equipment.fixedHelp")}</p></div>
        {copies.length === 0 ? <p className={styles.help}>{t("inventoryEmpty")}</p> : LOOT_SLOTS.map(slot => <div key={slot}>
          <h5 className={styles.slotHeading}>{t(`slots.${slot}`)}</h5>
          <div className={styles.groups} data-testid={`loot-${slot}`}>
            {LOOT_ITEMS.filter(item => item.slot === slot).map(item => {
              const owned = copies.filter(copy => copy.itemId === item.id).sort((a, b) => b.qualityBp - a.qualityBp || a.copyId.localeCompare(b.copyId));
              if (!owned.length) return null;
              return <div key={item.id} data-item={item.id} className={styles.group}>
                <h6>{t(`items.${item.id}`)} <span className={styles.count}>×{owned.length}</span></h6>
                <ul className={styles.grid}>
                  {owned.map(copy => <li key={copy.copyId} data-copy={copy.copyId}>
                    <button type="button" className={styles.copy} disabled={pending} aria-pressed={selectedId === copy.copyId}
                      aria-label={`${t("equipment.compare")} · ${t(`items.${copy.itemId}`)} · ${t("equipment.potency", { value: format.number(copy.qualityBp / 10000, { minimumFractionDigits: 1 }) })} · ${t("equipment.acquired", { date: format.dateTime(new Date(copy.acquiredAt), { dateStyle: "medium" }) })}`}
                      onClick={() => { setSelection({ suggestion: suggestedCopyId, id: copy.copyId }); setError(false); setConfirmed(false); }}>
                      <CopyIcon copy={copy} />
                      <span className={styles.potency}>{t("equipment.potency", { value: format.number(copy.qualityBp / 10000, { minimumFractionDigits: 1 }) })}</span>
                      {/* Esquina cosida: «Equipado» como línea de texto descuadraba
                          la rejilla y hacía celdas de altura distinta. */}
                      {loadout[slot]?.copyId === copy.copyId && <span className={styles.equipped} aria-hidden="true"><span>{t("equipment.equipped")}</span></span>}
                    </button>
                  </li>)}
                </ul>
              </div>;
            })}
          </div>
        </div>)}
      </div>
      {selected && <div ref={comparisonRef} tabIndex={-1} className={styles.comparison} role="region" aria-label={t("equipment.comparison")} data-testid="loot-comparison">
        <div className={styles.candidate}><h4>{t("equipment.candidate")}</h4><CopyDetails copy={selected} /></div>
        <div className={styles.current}><h4>{t("equipment.current")}</h4>{loadout[selected.slot] ? <CopyDetails copy={loadout[selected.slot]!} /> : <p className={styles.help}>{t("equipment.empty")}</p>}</div>
        <button type="button" className={styles.equip} disabled={pending || loadout[selected.slot]?.copyId === selected.copyId} onClick={() => change(selected.slot, selected.copyId)}>{t("equipment.equip")}</button>
      </div>}
    </div>
  </section>;
}
