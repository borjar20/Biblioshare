"use client";
import { useTranslations } from "next-intl";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { PetSprite, type PetReaction } from "../pet-sprite";
import styles from "./pet-game.module.css";

export function PetHud({ pet }: { pet: PetSnapshot }) {
  const t = useTranslations("pet");
  const progress = Math.max(0, Math.min(100, (pet.xp - pet.levelFloorXp) / Math.max(1, pet.nextLevelXp - pet.levelFloorXp) * 100));
  return <div className={styles.hud}>
    <div className={styles.portrait} aria-hidden="true"><PetSprite stage={pet.stage} petClass={pet.petClass} mood={pet.mood} direction="south" scale={1} label="" /></div>
    <div className={styles.identity}><strong data-testid="pet-name">{pet.name}</strong><p>{t(`classes.${pet.petClass}`)} · {t("level", { level: pet.level })}</p>
      <div className={styles.xp} role="progressbar" aria-label={t("game.experience")} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}><span style={{ width: `${progress}%` }} /><small>{t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}</small></div>
    </div>
  </div>;
}
export function PetScene({ pet, reaction, compact = false }: { pet: PetSnapshot; reaction?: PetReaction; compact?: boolean }) {
  const t = useTranslations("pet");
  return <div className={styles.scene} data-compact={compact}><span className={styles.sceneSprite}><PetSprite stage={pet.stage} petClass={pet.petClass} mood={pet.mood} reaction={reaction} scale={2} label={pet.name} /></span><span className={styles.sceneStatus}>{t(`stages.${pet.stage}`)} · {t(`moods.${pet.mood}`)}</span></div>;
}
