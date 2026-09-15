"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createUltiPuzzle } from "@/lib/pet/battle/ulti";
import { createUltiPuzzle as createR3Puzzle } from "@/lib/pet/battle/versions/r3.1/ulti";
import { createUltiPuzzle as createR4Puzzle } from "@/lib/pet/battle/versions/r4.1/ulti";
import type { BattleSnapshot } from "@/lib/pet/battle/types";
import { RULESET } from "@/lib/pet/battle/content";
import { BookIcon, AcornIcon, StarIcon, HeartIcon, SparklesIcon as Sparkles, PauseIcon as Pause } from "@/components/ui/icons";
import { Swords, Shield } from "./training-icons";
import styles from "./training.module.css";

const symbols = [BookIcon, AcornIcon, StarIcon, HeartIcon];
function Rune({ value }: { value: number }) {
 const Icon = symbols[value];
 return <span className={styles.rune} data-rune={value} aria-hidden="true"><Icon width={20} height={20} strokeWidth={1.8} /><small>{value + 1}</small></span>;
}

export function UltiPuzzle({ seed, tick, version = RULESET.version, equipment, onConfirm, onCancel }: { seed: string; tick: number; version?: string; equipment?: BattleSnapshot["equipment"]; onConfirm: (order: string) => void; onCancel: () => void }) {
 const instructionsId = useId();
 const firstTile = useRef<HTMLButtonElement>(null);
 useEffect(() => { firstTile.current?.focus(); }, []);
 const t = useTranslations("pet.training.ulti");
 const [selected, select] = useState<number | null>(null);
 const [slots, setSlots] = useState<(number | null)[]>([null,null,null,null]);
 const puzzle = (version === "r3.1" ? createR3Puzzle : version === "r4.1" ? createR4Puzzle : createUltiPuzzle)(seed, tick);
 const quill = equipment?.weapon?.itemId === "heavy_ink_quill" ? equipment.weapon : null;
 const amulet = equipment?.amulet?.itemId === "last_page_amulet" ? equipment.amulet : null;
 function place(index: number) {
  if (selected === null) { select(slots[index]); return; }
  setSlots(current => current.map((value, i) => i === index ? selected : value === selected ? null : value));
  select(null);
 }
 return <section aria-label={t("title")} aria-describedby={instructionsId} className={styles.puzzle} data-testid="ulti-puzzle">
  <header className={styles.puzzleHeading}><Sparkles aria-hidden="true" width={24} height={24} /><h3>{t("title")}</h3><span><Pause width={12} height={12} aria-hidden="true" />{t("paused")}</span></header>
  <p id={instructionsId} className={styles.puzzleHelp}>{t("instructions")}</p>
  <div className={styles.recipes}>{puzzle.recipes.map(recipe => <div key={recipe.id} className={styles.recipe} data-recipe={recipe.id}>
   <h4>{recipe.id === "power" ? <Swords width={17} height={17} aria-hidden="true" /> : <Shield width={17} height={17} aria-hidden="true" />}{t(recipe.id)}</h4>
   <div className={styles.recipeRunes} role="img" aria-label={t("recipeOrder", { order: recipe.order.map(n => n+1).join(", ") })}>{recipe.order.map(n => <Rune key={n} value={n} />)}</div>
   <p>{t(`${recipe.id}Help`)}</p>
   {recipe.id === "power" && quill && <p>{t("quillHelp", { value: RULESET.loot.powerPct * quill.qualityBp / 10000 })}</p>}
  </div>)}</div>
  <div className={styles.tileBoard}>
   <p className={styles.boardLabel}>{t("chooseTile")}</p>
   <div className={styles.runeRow}>{[0,1,2,3].map(n => <button key={n} ref={n === 0 ? firstTile : undefined} type="button" className={styles.tile} data-placed={slots.includes(n)} aria-label={t("tile", { n: n+1 })} aria-pressed={selected===n} onClick={() => select(n)}><Rune value={n} /></button>)}</div>
   <p className={styles.boardLabel}>{t("yourRecipe")}<span aria-live="polite">{slots.filter(n => n !== null).length}/4</span></p>
   <div className={styles.runeRow}>{slots.map((n,i) => <button key={i} type="button" className={styles.slot} data-filled={n !== null} aria-label={t("slot", { n:i+1, value:n===null?t("empty"):String(n+1) })} onClick={() => place(i)}>{n===null?<span aria-hidden="true">{i+1}</span>:<Rune value={n} />}</button>)}</div>
  </div>
  <p className={styles.baseEffect}>{t("baseEffect")}</p>
  {amulet && <p className={styles.baseEffect}>{t("amuletHelp", { value: RULESET.loot.ultiShieldPct * amulet.qualityBp / 10000 })}</p>}
  <button className={`${styles.startButton} ${styles.launch}`} disabled={slots.some(n=>n===null)} onClick={()=>onConfirm(slots.join(""))}><Sparkles width={17} height={17} aria-hidden="true" />{t("confirm")}</button>
  <div className={styles.puzzleSecondary}><button onClick={()=>onConfirm("")}>{t("skip")}</button><button onClick={onCancel}>{t("cancel")}</button></div>
 </section>;
}
