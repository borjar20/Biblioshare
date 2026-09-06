"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { checkCelebrations } from "@/lib/celebrations/preference";
import { changeClass } from "@/lib/pet/actions";
import { CLASS_PRIMARY, PET_ATTRIBUTES, type PetClass } from "@/lib/pet/classes";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { REACTION_MS } from "@/lib/pet/manifest";
import { buttonVariants } from "@/components/ui/button";
import { AchievementGrid } from "./achievement-grid";
import { ClassPicker } from "./class-picker";
import { MissionBoard } from "./mission-board";
import { PetSprite, type PetReaction } from "./pet-sprite";
import { RenameForm } from "./rename-form";

export function PetDetail({ pet, burrow }: { pet: PetSnapshot; burrow?: ReactNode }) {
  const t = useTranslations("pet");
  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();
  const primary = CLASS_PRIMARY[pet.petClass];
  const max = Math.max(1, ...PET_ATTRIBUTES.map((a) => pet.attributes[a]));
  const span = Math.max(1, pet.nextLevelXp - pet.levelFloorXp);
  const progress = Math.max(0, Math.min(100, Math.round(((pet.xp - pet.levelFloorXp) / span) * 100)));

  // La subida/evolución se gana en el servidor al calcular el snapshot; en una
  // navegación suave el provider no se remonta, así que hay que pedirle el drenado.
  useEffect(() => {
    if (pet.leveledUp || pet.evolved || pet.missionsCompletedNow || pet.achievementsUnlockedNow) checkCelebrations();
  }, [pet.leveledUp, pet.evolved, pet.missionsCompletedNow, pet.achievementsUnlockedNow]);

  // El snapshot es estático (sin timer propio): sin esto la reacción de un solo disparo
  // (joy/evolve) se queda pegada en pantalla el resto de la vida de la página, congelada
  // en el frame 0 de esa fila. Se inicializa desde el snapshot y se apaga sola, como en
  // pet-companion.tsx.
  const initialReaction: PetReaction = pet.evolved ? "evolve" : pet.leveledUp ? "joy" : null;
  const [reaction, setReaction] = useState<PetReaction>(initialReaction);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!initialReaction) return;
    const ms = initialReaction === "evolve" ? REACTION_MS.evolve : REACTION_MS.joy;
    const id = window.setTimeout(() => setReaction(null), ms);
    timers.current.push(id);
    return () => {
      for (const timerId of timers.current) window.clearTimeout(timerId);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr una vez, al montar con la reacción inicial del snapshot.
  }, []);

  function confirmClass(cls: PetClass) {
    if (!window.confirm(t("changeClass.confirm", { cls: t(`classes.${cls}`) }))) return;
    startTransition(async () => {
      await changeClass(cls);
      setPicking(false);
    });
  }

  const c = pet.counts;
  const sources: Record<(typeof PET_ATTRIBUTES)[number], string> = {
    FUE: t("sources.FUE", { units: c.sessionUnits, episodes: c.episodes }),
    CON: t("sources.CON", { days: c.activeDays, goalDays: c.dailyGoalDays, milestones: c.streakMilestones }),
    INT: t("sources.INT", { passes: c.finishedPasses, sagas: c.completedSagas, genres: c.distinctGenres, historical: c.historicalPasses }),
    SAB: t("sources.SAB", { notes: c.notes, quotes: c.quotes, reviews: c.reviews, ratings: c.ratings }),
    CAR: t("sources.CAR", { posts: c.posts, votes: c.votes, polls: c.polls, events: c.events, follows: c.follows }),
    DES: t("sources.DES", { works: c.newWorks, authors: c.newAuthors, historical: c.historicalWorks }),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="pet-detail">
      <section className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
        <PetSprite
          stage={pet.stage}
          petClass={pet.petClass}
          mood={pet.mood}
          scale={2}
          reaction={reaction}
          label={pet.name}
        />
        <h2 className="font-serif text-2xl font-semibold text-foreground" data-testid="pet-name">{pet.name}</h2>
        <p className="text-sm text-muted-foreground">
          {t(`classes.${pet.petClass}`)} · {t(`stages.${pet.stage}`)} · {t(`moods.${pet.mood}`)}
        </p>
        {pet.stage === "acorn" ? <p className="text-sm text-muted-foreground">{t("acornHint")}</p> : null}
        <div className="flex w-full max-w-sm flex-col gap-1">
          <div className="flex justify-between text-[12px] text-muted-foreground">
            <span>{t("level", { level: pet.level })}</span>
            <span>{t("xpToNext", { current: pet.xp, next: pet.nextLevelXp })}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      {burrow}

      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
        <h3 className="font-serif text-lg font-semibold text-foreground">{t("sources.title")}</h3>
        <ul className="flex flex-col gap-3">
          {PET_ATTRIBUTES.map((attr) => (
            <li key={attr} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground">
                  {t(`attributes.${attr}`)}
                  {attr === primary ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">{t("primary")}</span> : null}
                </span>
                <span className="font-mono text-[12.5px] text-muted-foreground">{pet.attributes[attr]}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className={attr === primary ? "h-full bg-accent" : "h-full bg-muted-foreground"} style={{ width: `${Math.round((pet.attributes[attr] / max) * 100)}%` }} />
              </div>
              <p className="text-[12px] text-muted-foreground">{sources[attr]}</p>
            </li>
          ))}
        </ul>
      </section>

      <MissionBoard missions={pet.missions} />
      <AchievementGrid achievements={pet.achievements} />

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card">
        <RenameForm name={pet.name} />
        {picking ? (
          <div className="flex flex-col gap-3">
            <ClassPicker value={pet.petClass} onChange={confirmClass} stage={pet.stage} name="newClass" />
            <button type="button" onClick={() => setPicking(false)} className={buttonVariants("ghost", "self-start px-4")}>
              {t("changeClass.cancel")}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className={buttonVariants("secondary", "self-start px-4")}>
            {t("changeClass.label")}
          </button>
        )}
      </section>
    </div>
  );
}
