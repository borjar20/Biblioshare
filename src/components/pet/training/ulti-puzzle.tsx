"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createUltiPuzzle } from "@/lib/pet/battle/ulti";
import { buttonVariants } from "@/components/ui/button";

export function UltiPuzzle({ seed, tick, onConfirm, onCancel }: { seed: string; tick: number; onConfirm: (order: string) => void; onCancel: () => void }) {
 const firstTile = useRef<HTMLButtonElement>(null);
 useEffect(() => { firstTile.current?.focus(); }, []);
 const t = useTranslations("pet.training.ulti");
 const [selected, select] = useState<number | null>(null);
 const [slots, setSlots] = useState<(number | null)[]>([null,null,null,null]);
 const puzzle = createUltiPuzzle(seed, tick);
 function place(index: number) {
  if (selected === null) { select(slots[index]); return; }
  setSlots(current => current.map((value, i) => i === index ? selected : value === selected ? null : value));
  select(null);
 }
 return <section aria-label={t("title")} className="space-y-3 rounded-lg border border-border p-4" data-testid="ulti-puzzle">
  <h3 className="font-semibold">{t("title")}</h3><p className="text-sm">{t("help")}</p>
  <div className="grid gap-2 sm:grid-cols-2">{puzzle.recipes.map(recipe => <div key={recipe.id} className="rounded border border-border p-2"><h4 className="font-semibold">{t(recipe.id)}</h4><p className="font-mono text-lg tracking-widest">{recipe.order.map(n => n+1).join(" · ")}</p><p className="text-sm">{t(`${recipe.id}Help`)}</p></div>)}</div>
  <div className="grid grid-cols-4 gap-2">{[0,1,2,3].map(n => <button key={n} ref={n === 0 ? firstTile : undefined} type="button" className={buttonVariants("secondary", "px-2 min-w-0")} aria-label={t("tile", { n: n+1 })} aria-pressed={selected===n} onClick={() => select(n)}>{n+1}</button>)}</div>
  <div className="grid grid-cols-4 gap-2">{slots.map((n,i) => <button key={i} type="button" className={buttonVariants("secondary", "px-2 min-w-0")} aria-label={t("slot", { n:i+1, value:n===null?t("empty"):String(n+1) })} onClick={() => place(i)}>{n===null?"—":n+1}</button>)}</div>
  <div className="flex flex-wrap gap-2"><button className={buttonVariants()} disabled={slots.some(n=>n===null)} onClick={()=>onConfirm(slots.join(""))}>{t("confirm")}</button><button className={buttonVariants("secondary")} onClick={()=>onConfirm("")}>{t("skip")}</button><button className={buttonVariants("secondary")} onClick={onCancel}>{t("cancel")}</button></div>
 </section>;
}
