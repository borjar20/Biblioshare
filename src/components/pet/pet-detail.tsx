"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { changeClass } from "@/lib/pet/actions";
import { CLASS_PRIMARY, PET_ATTRIBUTES, type PetClass } from "@/lib/pet/classes";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { ATTR_COLOR, ATTR_ICON } from "./attribute-art";
import { ClassPicker } from "./class-picker";
import { RenameForm } from "./rename-form";
import { PetSprite } from "./pet-sprite";
import styles from "./game/pet-game.module.css";

/** Character screen only; the game shell owns navigation and celebrations. */
export function PetDetail({ pet, equipment }: { pet: PetSnapshot; equipment?: ReactNode }) {
  const t = useTranslations("pet");
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const primary = CLASS_PRIMARY[pet.petClass];
  const max = Math.max(1, ...PET_ATTRIBUTES.map(a => pet.attributes[a]));
  const c = pet.counts;
  const sources = {
    FUE: t("sources.FUE", { units: c.sessionUnits, episodes: c.episodes }),
    CON: t("sources.CON", { days: c.activeDays, goalDays: c.dailyGoalDays, milestones: c.streakMilestones }),
    INT: t("sources.INT", { passes: c.finishedPasses, sagas: c.completedSagas, genres: c.distinctGenres, historical: c.historicalPasses }),
    SAB: t("sources.SAB", { notes: c.notes, quotes: c.quotes, reviews: c.reviews, ratings: c.ratings }),
    CAR: t("sources.CAR", { posts: c.posts, votes: c.votes, polls: c.polls, events: c.events, follows: c.follows }),
    DES: t("sources.DES", { works: c.newWorks, authors: c.newAuthors, historical: c.historicalWorks }),
  };
  // Raíz cuadrada, no proporción directa: con FUE 861 y CON 28 la barra lineal
  // dejaba cinco de seis atributos visualmente a cero. La raíz conserva el orden
  // y hace legible la diferencia. El número exacto va al lado, siempre.
  const width = (value: number) => `${Math.max(6, Math.round(Math.sqrt(value / max) * 100))}%`;
  const xp = Math.max(0, Math.min(100, (pet.xp - pet.levelFloorXp) / Math.max(1, pet.nextLevelXp - pet.levelFloorXp) * 100));
  function confirmClass(cls: PetClass) {
    if (pending || cls === pet.petClass || !window.confirm(t("changeClass.confirm", { cls: t(`classes.${cls}`) }))) return;
    setError(false);
    startTransition(async () => { try { const result = await changeClass(cls); if (result.error) setError(true); else setPicking(false); } catch { setError(true); } });
  }
  return <div className={styles.character} data-testid="pet-detail">
    {/* Identidad en una tira, no la escena y la placa de madera del Campamento
        otra vez: eran la misma imagen y los mismos cuatro datos dos veces. Una
        ficha necesita decir de quién es; no necesita repetir el escenario. */}
    <header className={styles.sheetIdentity}>
      <span className={styles.portrait} aria-hidden="true"><PetSprite stage={pet.stage} petClass={pet.petClass} mood={pet.mood} direction="south" scale={1} label="" /></span>
      <div className={styles.identity}>
        <strong data-testid="pet-name">{pet.name}</strong>
        <p>{t(`classes.${pet.petClass}`)} · {t("level", { level: pet.level })} · {t(`stages.${pet.stage}`)}</p>
        <div className={styles.xpRow}>
          <div className={styles.xp} role="progressbar" aria-label={t("game.experience")} aria-valuenow={Math.round(xp)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}><span style={{ width: `${xp}%` }} /></div>
          <span className={styles.xpValue} aria-hidden="true">{t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}</span>
        </div>
      </div>
      {pet.stage === "acorn" && <p className={styles.hint}>{t("acornHint")}</p>}
    </header>
    <div className={styles.characterStats}>
      <section className={styles.panel}><h2>{t("game.attributes")}</h2><div className={styles.attributes}>{PET_ATTRIBUTES.map(attr => {
        const Icon = ATTR_ICON[attr];
        return <details key={attr} className={styles.attribute} data-primary={attr === primary} style={{ "--attr": ATTR_COLOR[attr] } as React.CSSProperties}>
          <summary><Icon className={styles.attributeIcon} aria-hidden="true" /><span>{t(`attributes.${attr}`)}</span><span className={styles.attributeBar} aria-hidden="true"><i style={{ width: width(pet.attributes[attr]) }} /></span><strong>{pet.attributes[attr]}</strong><span className={styles.info} aria-hidden="true">i</span></summary>
          <p>{attr === primary && <strong>{t("primary")}. </strong>}{sources[attr]}</p>
        </details>;
      })}</div></section>
      <div className={styles.editActions}><button type="button" className={styles.secondary} aria-expanded={picking} onClick={() => setPicking(!picking)}>{t("changeClass.label")}</button><button type="button" className={styles.secondary} aria-expanded={renaming} onClick={() => setRenaming(!renaming)}>{t("game.rename")}</button></div>
      {picking && <section className={styles.panel}><fieldset disabled={pending}><ClassPicker value={pet.petClass} onChange={confirmClass} stage={pet.stage} name="newClass" /></fieldset>{error && <p role="alert">{t("hatch.errors.generic")}</p>}<button className={styles.textButton} onClick={() => setPicking(false)}>{t("changeClass.cancel")}</button></section>}
      {renaming && <section className={styles.panel}><RenameForm name={pet.name} /></section>}
    </div>
    {/* El equipo vive aquí, no en un destino propio: era una pantalla con dos
        ranuras, 341 px vacíos y un resumen gemelo del que ya había en la ficha. */}
    <div className={styles.characterGear}>{equipment}</div>
  </div>;
}
