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
      {/* El número va FUERA de la barra: encima del relleno azul el blanco daba
          1,9:1 y la sombra de texto no cuenta para WCAG. */}
      <div className={styles.xpRow}>
        <div className={styles.xp} role="progressbar" aria-label={t("game.experience")} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}><span style={{ width: `${progress}%` }} /></div>
        <span className={styles.xpValue} aria-hidden="true">{t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}</span>
      </div>
    </div>
  </div>;
}

/** Días completos desde la última actividad; null si nunca hubo ninguna. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function PetScene({ pet, reaction, compact = false }: { pet: PetSnapshot; reaction?: PetReaction; compact?: boolean }) {
  const t = useTranslations("pet");
  const days = daysSince(pet.lastActivityISO);
  // Un humor que no es «contenta» explica su causa y ofrece la palanca. «Triste»
  // a secas en la esquina de la escena no decía por qué ni qué hacer.
  const needsNudge = pet.mood !== "happy" && days !== null && days > 0;
  return <div className={styles.scene} data-compact={compact}>
    <span className={styles.sceneSprite}><PetSprite stage={pet.stage} petClass={pet.petClass} mood={pet.mood} reaction={reaction} scale={2} label={pet.name} /></span>
    {needsNudge
      ? <p className={styles.sceneMood} data-testid="pet-mood"><b>{t(`moodReason.${pet.mood}`, { days })}</b> <span>{t("moodAction")}</span></p>
      : <span className={styles.sceneStatus} data-testid="pet-mood">{t(`stages.${pet.stage}`)} · {t(`moods.${pet.mood}`)}</span>}
  </div>;
}
