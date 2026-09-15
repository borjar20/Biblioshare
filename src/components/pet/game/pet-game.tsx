"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import type { AdventureBattle, AdventureState } from "@/lib/pet/adventure/types";
import { startAdventure, resolveAdventure, replayAdventure, resumeAdventure } from "@/lib/pet/adventure/actions";
import { petSection, petReturnKey, petViewKey, safePetReturn, type PetSection } from "@/lib/pet/game-navigation";
import { checkCelebrations } from "@/lib/celebrations/preference";
import { REACTION_MS } from "@/lib/pet/manifest";
import { equipLoot } from "@/lib/pet/loot/actions";
import { ArrowLeftIcon, HomeIcon, PawIcon, BookIcon, BurrowArchIcon, ChevronRightIcon, CompassIcon, DumbbellIcon, MedalIcon } from "@/components/ui/icons";
import { TrainingPanel } from "../training/training-panel";
import { EquipmentPanel } from "../loot/equipment-panel";
import { MissionBoard } from "../mission-board";
import { AchievementGrid } from "../achievement-grid";
import { PetDetail } from "../pet-detail";
import type { PetReaction } from "../pet-sprite";
import { PetHud, PetScene } from "./pet-hud";
import styles from "./pet-game.module.css";

// Iconografía del bosque: la bandeja de entrada, la diana y la estrella decían
// «app», y la estrella además ya era Logros. Un glifo, un significado.
const destinations = [["camp", HomeIcon], ["character", PawIcon], ["diary", BookIcon], ["burrow", BurrowArchIcon]] as const;
const subscribe = () => () => {};
const adventureActions = { start: () => startAdventure(), resolve: resolveAdventure, replay: replayAdventure, resume: resumeAdventure };

export function PetGame({ userId, pet, adventure, burrow, hatch }: {
  userId: string; pet: PetSnapshot | null; adventure: AdventureState | null; burrow: ReactNode; hatch?: ReactNode;
}) {
  const t = useTranslations("pet");
  const format = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const section = petSection(params.get("view"));
  const title = useRef<HTMLHeadingElement>(null);
  const previous = useRef(section);
  const [journal, setJournal] = useState<"missions" | "achievements">("missions");
  const [wonCopy, setWonCopy] = useState<AdventureBattle["adventure"]["copy"]>(null);
  const [reaction, setReaction] = useState<PetReaction>(pet?.evolved ? "evolve" : pet?.leveledUp ? "joy" : null);
  const returnHref = useSyncExternalStore(subscribe, () => {
    try { return safePetReturn(sessionStorage.getItem(petReturnKey(userId))); } catch { return "/"; }
  }, () => "/");
  const combat = section === "adventure" || section === "training";

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("view")) {
      try {
        const remembered = sessionStorage.getItem(petViewKey(userId));
        if (remembered) {
          const url = new URL(window.location.href);
          url.searchParams.set("view", petSection(remembered));
          window.history.replaceState(null, "", url.pathname + url.search);
        }
      } catch { /* Navigation works without storage. */ }
    }
  }, [userId]);
  useEffect(() => {
    // Read the live URL: the mount effect may have just restored a stored view.
    try { sessionStorage.setItem(petViewKey(userId), petSection(new URLSearchParams(window.location.search).get("view"))); } catch { /* Optional preference. */ }
    if (previous.current !== section) { previous.current = section; title.current?.focus({ preventScroll: true }); }
  }, [section, userId]);
  useEffect(() => {
    if (pet?.leveledUp || pet?.evolved || pet?.missionsCompletedNow || pet?.achievementsUnlockedNow) checkCelebrations();
  }, [pet?.leveledUp, pet?.evolved, pet?.missionsCompletedNow, pet?.achievementsUnlockedNow]);
  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), reaction === "evolve" ? REACTION_MS.evolve : REACTION_MS.joy);
    return () => window.clearTimeout(timer);
  }, [reaction]);

  function prepareLeave() {
    return window.dispatchEvent(new Event("pet:before-leave", { cancelable: true })) || window.confirm(t("game.leaveWithoutSave"));
  }
  function navigate(next: PetSection) {
    if (next === section || (combat && !prepareLeave())) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.pushState(null, "", url.pathname + url.search);
  }
  const current = adventure?.current;
  const canStart = Boolean(adventure && (adventure.pendingDays.length || current));
  const startLabel = current?.status === "open" ? "resume" : current ? "retry" : "start";
  const inventory = adventure ? wonCopy && !adventure.inventory.some(copy => copy.copyId === wonCopy.copyId) ? [wonCopy, ...adventure.inventory] : adventure.inventory : [];
  // «Aventura del 2026-09-02» era la fecha ISO cruda en mitad de la frase.
  const currentDay = current ? format.dateTime(new Date(current.adventure.day), { day: "numeric", month: "long" }) : "";
  // El panel de equipo ES la sección de equipo de la ficha: ya no hay resumen
  // aparte que enlace a una Mochila, porque la Mochila ya no existe (#1166).
  const gear = adventure
    ? <EquipmentPanel copies={inventory} initialLoadout={adventure.loadout} hasOpenAdventure={current?.status === "open"} suggestedCopyId={wonCopy?.copyId} onEquip={async (slot, copyId) => { const result = await equipLoot(slot, copyId); if (result.ok) router.refresh(); return result; }} />
    : <p role="status">{t("adventure.unavailable")}</p>;

  return <div className={styles.game} data-testid="pet-game" data-view={section}>
    <header className={styles.header}>
      <a href={returnHref} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); if (prepareLeave()) router.push(returnHref); }} className={styles.returnLink}><ArrowLeftIcon />Biblioshare</a>
      <h1 ref={title} tabIndex={-1}>{t(`game.sections.${!pet ? "camp" : section}`)}</h1>
      {/* En combate, la casa vuelve al campamento. Fuera de él no hay adorno: la
          bellota decorativa repetía el glifo de la pestaña Personaje. */}
      {combat && pet ? <button className={styles.headerAction} onClick={() => navigate("camp")} aria-label={t("game.sections.camp")}><HomeIcon /></button> : <span aria-hidden="true" />}
    </header>
    <div className={styles.content}>
      {!pet ? <div className={styles.hatch}>{hatch}<section className={styles.panel}>{burrow}</section></div> : <>
        <div hidden={section !== "camp"} className={styles.camp}>
          <div className={styles.campHero}>
            <div className={styles.campHud}><PetHud pet={pet} /></div>
            <PetScene pet={pet} reaction={reaction} />
            <div className={styles.campActions}>
              <button className={styles.primary} disabled={!adventure} onClick={() => navigate("adventure")}><CompassIcon /><span><strong>{canStart ? startLabel === "start" ? t("game.adventureCta") : t(`adventure.${startLabel}`) : t("game.viewAdventure")}</strong><small>{current ? t(current.status === "open" ? "adventure.inProgress" : "adventure.retryAvailable", { day: currentDay }) : adventure ? t("adventure.pending", { count: adventure.pendingDays.length }) : t("adventure.unavailable")}</small></span></button>
              <button className={styles.secondary} onClick={() => navigate("training")}><DumbbellIcon />{t("game.train")}</button>
              {adventure && !canStart && <p className={styles.hint}>{t("adventure.none")}</p>}
              {pet.stage === "acorn" && <p className={styles.hint}>{t("acornHint")}</p>}
            </div>
          </div>
          <aside className={styles.campMissions}>
            {/* El rótulo y el medidor solo se ven en móvil, donde el tablero
                entero no cabe sin dejar la escena en un sello. El desglose
                completo está en Diario, aquí al lado. */}
            <h2 className={styles.campMissionsTitle}>{t("missions.title")}</h2>
            <div className={styles.panelHeading}><span>{t("game.missionCount", { completed: pet.missions.filter(m => m.completed).length, total: pet.missions.length })}</span><button className={styles.textButton} onClick={() => navigate("diary")}>{t("game.viewDiary")}<ChevronRightIcon /></button></div>
            <ul className={styles.missionMeter} aria-hidden="true">{pet.missions.map(m => <li key={m.slot}><i data-completed={m.completed ? "true" : "false"} style={{ width: `${Math.max(0, Math.min(100, Math.round(m.progress / Math.max(1, m.target) * 100)))}%` }} /></li>)}</ul>
            <MissionBoard missions={pet.missions} />
          </aside>
        </div>
        <div hidden={section !== "character"}><PetDetail pet={pet} equipment={gear} /></div>
        {/* En escritorio Diario enseña las dos colecciones a la vez y las pestañas
            sobran: con una sola, el 39 % del alto quedaba en blanco y «Misiones de
            hoy» se leía dos veces, en la pestaña y en la cabecera del panel. La
            visibilidad la lleva `data-pane`, no el atributo `hidden`: el mismo
            marcado sirve para pestañas en móvil y dos columnas en escritorio. */}
        <div hidden={section !== "diary"} className={styles.diary}>
          <div className={styles.journalTabs} role="group" aria-label={t("game.sections.diary")}><button aria-pressed={journal === "missions"} onClick={() => setJournal("missions")}><BookIcon />{t("missions.title")}</button><button aria-pressed={journal === "achievements"} onClick={() => setJournal("achievements")}><MedalIcon />{t("achievements.title")}</button></div>
          <div className={styles.journalPanes} data-pane={journal}>
            <div className={styles.journalMissions}><MissionBoard missions={pet.missions} /></div>
            <div className={styles.journalAchievements}><AchievementGrid achievements={pet.achievements} /></div>
          </div>
        </div>
        <div hidden={section !== "burrow"} className={styles.burrow}>{burrow}</div>
        <div hidden={section !== "adventure"} className={styles.combat}>
          <h2 id="adventure-section-title" className="sr-only">{t("adventure.title")}</h2>
          {adventure ? <TrainingPanel kind="adventure" userId={userId} active={section === "adventure"} startLabel={startLabel} canStart={canStart} canStartAnother={adventure.pendingDays.length > 0} actions={adventureActions} onEquipNow={() => navigate("character")} onHome={() => navigate("camp")} onDone={battle => { const copy = battle?.adventure?.copy; if (copy) setWonCopy(copy); router.refresh(); }} /> : <p role="status">{t("adventure.unavailable")}</p>}
        </div>
        <div hidden={section !== "training"} className={styles.combat}><TrainingPanel userId={userId} active={section === "training"} onHome={() => navigate("camp")} /></div>
      </>}
    </div>
    {pet && !combat && <nav className={styles.navigation} aria-label={t("game.navigation")}>{destinations.map(([id, Icon]) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => navigate(id)}><Icon aria-hidden="true" /><span>{t(`game.sections.${id}`)}</span></button>)}</nav>}
  </div>;
}
