"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { changeClass } from "@/lib/pet/actions";
import { CLASS_PRIMARY, PET_ATTRIBUTES, type PetClass } from "@/lib/pet/classes";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { ClassPicker } from "./class-picker";
import { RenameForm } from "./rename-form";
import { PetHud, PetScene } from "./game/pet-hud";
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
  function confirmClass(cls: PetClass) {
    if (pending || cls === pet.petClass || !window.confirm(t("changeClass.confirm", { cls: t(`classes.${cls}`) }))) return;
    setError(false);
    startTransition(async () => { try { const result = await changeClass(cls); if (result.error) setError(true); else setPicking(false); } catch { setError(true); } });
  }
  return <div className={styles.character} data-testid="pet-detail">
    <div className={styles.characterVisual}><PetScene pet={pet} compact /><PetHud pet={pet} />{pet.stage === "acorn" && <p className={styles.hint}>{t("acornHint")}</p>}</div>
    <div className={styles.characterStats}>
      <section className={styles.panel}><h2>{t("game.attributes")}</h2><div className={styles.attributes}>{PET_ATTRIBUTES.map(attr => <details key={attr} className={styles.attribute} data-primary={attr === primary}>
        <summary><span>{t(`attributes.${attr}`)}</span><span className={styles.attributeBar} aria-hidden="true"><i style={{ width: `${pet.attributes[attr] / max * 100}%` }} /></span><strong>{pet.attributes[attr]}</strong><span className={styles.info} aria-hidden="true">i</span></summary>
        <p>{attr === primary && <strong>{t("primary")}. </strong>}{sources[attr]}</p>
      </details>)}</div></section>
      <div className={styles.editActions}><button type="button" className={styles.secondary} aria-expanded={picking} onClick={() => setPicking(!picking)}>{t("changeClass.label")}</button><button type="button" className={styles.secondary} aria-expanded={renaming} onClick={() => setRenaming(!renaming)}>{t("game.rename")}</button></div>
      {picking && <section className={styles.panel}><fieldset disabled={pending}><ClassPicker value={pet.petClass} onChange={confirmClass} stage={pet.stage} name="newClass" /></fieldset>{error && <p role="alert">{t("hatch.errors.generic")}</p>}<button className={styles.textButton} onClick={() => setPicking(false)}>{t("changeClass.cancel")}</button></section>}
      {renaming && <section className={styles.panel}><RenameForm name={pet.name} /></section>}
      {equipment}
    </div>
  </div>;
}
