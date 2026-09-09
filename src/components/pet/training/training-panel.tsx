"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { SparklesIcon as Sparkles, HeartIcon as Heart, PauseIcon as Pause, PlayIcon as Play, AlertIcon, CheckIcon, EyeIcon } from "@/components/ui/icons";
import { Swords, Shield } from "./training-icons";
import { startBattle, resolveBattle, replayTrainingBattle } from "@/lib/pet/training/actions";
import { RULESET } from "@/lib/pet/battle/content";
import type { BattleEvent, BattleInput } from "@/lib/pet/battle/types";
import type { TrainingBattle, TrainingResponse } from "@/lib/pet/training/types";
import { PetSprite } from "../pet-sprite";
import { CombatSprite } from "./combat-sprite";
import { UltiPuzzle } from "./ulti-puzzle";
import { TrainingSession } from "./training-session";
import { trainingEffects } from "./training-effects";
import { lootEffectsForTick, lootFeedbackForTick, type LootEffect } from "../loot/loot-effects";
import { LOOT_ART, LOOT_FX } from "@/lib/pet/loot/art";
import styles from "./training.module.css";

interface PanelActions {
  resume?: (intent: string) => Promise<TrainingResponse>;
  start: (intent: string, enemyId?: string) => Promise<TrainingResponse>;
  resolve: (intent: string, inputs: BattleInput[]) => Promise<TrainingResponse>;
  replay: (intent: string) => Promise<TrainingResponse>;
}
interface Props {
  userId?: string;
  active?: boolean;
  kind?: "training" | "adventure";
  actions?: PanelActions;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  startLabel?: "start" | "resume" | "retry";
  onDone?: (battle: TrainingBattle | null) => void;
  /** Aventura (R4a): no hay nada que empezar (ni día pendiente ni intento en curso). El botón se
   *  queda deshabilitado con su explicación; el panel NO se desmonta (spec §8). */
  canStart?: boolean;
  /** Aventura (R4a): hay más tramos pendientes tras ganar, así que puede lanzarse otra aventura sin salir del panel. */
  canStartAnother?: boolean;
  /** Lleva a la Mochila desde el resultado, con el botín recién ganado sugerido. */
  onEquipNow?: () => void;
  /** Vuelve al Campamento desde el resultado. */
  onHome?: () => void;
}

function availableLocalStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    // El navegador puede denegar incluso el getter: se juega sin log local.
    return undefined;
  }
}

export function TrainingPanel({ kind = "training", actions, storage, startLabel = "start", onDone, canStart = true, canStartAnother = false, userId, active: panelActive = true, onEquipNow, onHome }: Props = {}) {
  const format = useFormatter();
  const t = useTranslations("pet.training");
  const ta = useTranslations("pet.adventure");
  const tg = useTranslations("pet.game");
  const adventure = kind === "adventure";
  const [session] = useState(() => new TrainingSession(
    actions ?? { start: startBattle, resolve: resolveBattle, replay: replayTrainingBattle },
    () => crypto.randomUUID(),
    { storage: storage ?? availableLocalStorage(), userId, kind },
  ));
  const ultiButton = useRef<HTMLButtonElement>(null);
  const skillButton = useRef<HTMLButtonElement>(null);
  const pauseButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<"ulti" | "skill" | null>(null);
  const sessionRef = useRef(session);
  const [, render] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [savedSession, setSavedSession] = useState(false);
  const refresh = () => render(n => n + 1);
  const phase = session.phase;

  useEffect(() => {
    setSavedSession(sessionRef.current.hasSavedSession());
    sessionRef.current.setActive(panelActive);
    if (!panelActive) restoreFocus.current = null;
    render(n => n + 1);
  }, [panelActive]);

  useEffect(() => {
    const prepare = (event: Event) => {
      if (!sessionRef.current.prepareLeave()) event.preventDefault();
      restoreFocus.current = null;
      render(n => n + 1);
    };
    const checkpoint = () => { sessionRef.current.prepareLeave(); };
    window.addEventListener("pet:before-leave", prepare);
    window.addEventListener("pagehide", checkpoint);
    return () => {
      checkpoint();
      window.removeEventListener("pet:before-leave", prepare);
      window.removeEventListener("pagehide", checkpoint);
    };
  }, []);

  useEffect(() => {
    const current = sessionRef.current;
    const visibility = () => { current.hidden = document.hidden; render(n => n + 1); };
    current.hidden = document.hidden;
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  useEffect(() => {
    if (!panelActive || (phase !== "playing" && phase !== "replaying")) return;
    // One timer callback = one tick. Never accumulate elapsed wall-clock time.
    const timer = window.setInterval(() => { sessionRef.current.tick(); render(n => n + 1); }, RULESET.tickMs / speed);
    return () => window.clearInterval(timer);
  }, [phase, speed, panelActive]);

  useEffect(() => {
    if (phase !== "resolving") return;
    let mounted = true;
    void sessionRef.current.resolve().then(() => { if (mounted) render(n => n + 1); });
    return () => { mounted = false; };
  }, [phase]);

  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (phase !== "done") { notifiedRef.current = false; return; }
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    onDoneRef.current?.(sessionRef.current.battle);
  }, [phase]);

  useEffect(() => {
    if (phase === "done" && panelActive && !session.hidden) sessionRef.current.acknowledgeResult();
  }, [phase, panelActive, session.hidden]);

  useEffect(() => {
    const target = restoreFocus.current === "ulti" ? ultiButton.current : restoreFocus.current === "skill" ? skillButton.current : null;
    if (!panelActive || !target || session.ultiOpen) return;
    if (target.disabled) {
      if (document.activeElement !== pauseButton.current) pauseButton.current?.focus({ preventScroll: true });
      if (session.paused || session.hidden || (session.view && session.view.tick < session.view.skillReadyAt)) restoreFocus.current = null;
    } else {
      target.focus({ preventScroll: true }); restoreFocus.current = null;
    }
  });

  async function run(action: () => Promise<void>) { const promise = action(); refresh(); await promise; refresh(); }
  const v = session.view;
  const snapshot = session.battle?.snapshot;
  const active = phase === "playing" || phase === "replaying";
  const cooldown = v ? Math.max(0, v.skillReadyAt - v.tick) : 0;
  const queued = session.inputs.at(-1)?.tick === v?.tick;
  const result = phase === "done" ? session.battle?.result : null;
  const effects = trainingEffects(session.events, v?.tick);
  const lootEffects = lootEffectsForTick(session.events, v?.tick, session.visualFromTick);
  const lootFeedback = lootFeedbackForTick(session.events, v?.tick ?? 0, session.visualFromTick);
  const moving = effects.strike !== undefined;
  const petHit = effects.petHit !== undefined;
  const enemyHit = effects.enemyHit !== undefined;
  const lastUlti = session.events.findLast(event => event.type === "ULTI_USED");
  const ultiCooldown = v ? Math.max(0, v.ultiReadyAt - v.tick) : 0;
  const lastSkill = session.events.findLast(event => event.type === "SKILL_USED");
  const phaseSeconds = v ? Math.max(0, (v.enemyPhaseUntil - v.tick) * RULESET.tickMs / 1000).toFixed(1) : "0";
  // En aventura, `battle.enemyId` es la cadena completa del tramo (R4a); el rival mostrado es el del tramo actual.
  const currentEnemyId = session.battle ? (adventure ? session.battle.enemyId.split(",")[(v?.fight ?? 1) - 1] ?? session.battle.enemyId : session.battle.enemyId) : undefined;
  const reward = adventure ? session.battle?.adventure?.reward : null;
  const wonCopy = adventure ? session.battle?.adventure?.copy : null;

  function eventText(event: BattleEvent | LootEffect) {
    if (event.type === "LOOT_EFFECT") return ta("equipment.feedback", { name:ta(`items.${event.itemId}`), effect:ta(`equipment.applied.${event.effect}`, { amount:format.number(event.effect === "cooldown" || event.effect === "vulnerability" ? event.amount / 10 : event.amount) }) });
    if (event.type === "STATUS_APPLIED" && event.status === "vulnerable") return t("events.vulnerableStarted");
    if (event.type === "STATUS_EXPIRED" && event.status === "vulnerable") return t("events.vulnerableEnded");
    if (event.type === "TELEGRAPH_STARTED") return t(`events.${event.kind}`);
    if (event.type === "SKILL_USED") return t(`events.${event.effect}`, { damage: event.damage });
    return t(`events.${event.type}`, { damage: "damage" in event ? event.damage : 0 });
  }

  // Una sola línea bajo la arena. Antes eran cuatro apiladas (habilidad, tick,
  // botín, pausa) y empujaban los botones fuera de la pantalla en 390 px.
  // Terminado ya lo dice el banner: repetirlo aquí era la misma frase dos veces.
  const statusText = !active ? ""
    : session.paused || session.hidden ? t("paused")
    : lootFeedback.length ? lootFeedback.map(eventText).join(" · ")
    : lastSkill ? t(`feedback.${lastSkill.effect}`, { damage: lastSkill.damage })
    : "";

  return <section className={styles.panel} aria-labelledby={adventure ? "adventure-section-title" : `${kind}-title`} data-testid={adventure ? "pet-adventure" : "pet-training"}>
    {!adventure && <div><h2 id={`${kind}-title`} className="text-xl font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p></div>}
    {session.error && <div role="alert" className="text-sm"><p>{t(session.error === "LOCAL_RECOVERY" && session.battle ? "recoveryError" : "error")}</p></div>}
    {!adventure && (phase === "idle" || phase === "starting" || phase === "done") && <fieldset className={styles.enemyPicker} disabled={phase === "starting" || (phase === "idle" && (!!session.error || savedSession))}>
      <legend>{t("enemySelect")}</legend><div className={styles.enemyChoices}>{(["brote", "caparazon"] as const).map(id => <label key={id} data-selected={session.enemyId === id}>
        <input type="radio" name={`${kind}-enemy`} value={id} checked={session.enemyId === id} onChange={() => {session.selectEnemy(id); refresh();}} />
        <span aria-hidden="true"><CombatSprite enemy={id} animation="idle" paused size={72} /></span><strong>{t(`enemies.${id}`)}</strong>
      </label>)}</div><p>{t("enemyHelp")}</p>
    </fieldset>}
    {(phase === "idle" || phase === "starting") && <>
      <button className={styles.startButton} disabled={phase === "starting" || (adventure && !canStart && !savedSession)} onClick={() => void run(() => session.start())}>{adventure ? ta(phase === "starting" ? "starting" : savedSession ? "resume" : startLabel) : t(phase === "starting" ? "starting" : session.error ? "retryStart" : savedSession ? "resume" : "start")}</button>
      {adventure && !canStart && !savedSession && <p className="text-sm text-muted-foreground">{ta("none")}</p>}
    </>}
    {v && snapshot && <>
      <div className={styles.arena} data-paused={session.paused || session.hidden || session.ultiOpen || !active}>
        {/* Tramos: tres puntos y, al lado, el mismo texto de siempre — el gráfico
            cuenta el avance y el texto lo dice para quien no lo ve. */}
        {adventure && v && <p className={styles.fights} data-testid="fight-marker" role="status">
          {Array.from({ length: v.fights }, (_, i) => <i key={i} aria-hidden="true" data-state={i + 1 < v.fight ? "done" : i + 1 === v.fight ? "current" : "pending"} />)}
          <span>{ta("fight", { n: v.fight, total: v.fights })}</span>
        </p>}
        <div className="grid grid-cols-2 gap-4">
          {/* Retratos con `CombatSprite`, que sí acepta un tamaño: `PetSprite`
              se dimensiona por celda del sheet y a 40 px quedaba recortado. */}
          <Health label={snapshot.name} value={v.petHp} max={v.petHpMax} portrait={<CombatSprite stage={snapshot.stage} petClass={snapshot.petClass} animation="idle" paused size={40} />} />
          <Health label={t(`enemies.${currentEnemyId as "brote" | "caparazon"}`)} value={v.enemyHp} max={v.enemyHpMax} rival portrait={<CombatSprite enemy={currentEnemyId as "brote" | "caparazon"} animation="idle" paused size={40} />} />
        </div>
        <div className={styles.stage} data-testid="combat-stage" aria-hidden="true">
          {lootEffects.map(event => <span key={`loot-${event.seq}`} className={styles.lootBurst} data-target={event.effect === "damage" || event.effect === "vulnerability" ? "enemy" : "pet"} style={{backgroundImage:`url(${LOOT_FX[event.effect]})`}} />)}
          <div key={`pet-${effects.petHit ?? effects.strike ?? "rest"}`} className={snapshot.stage === "acorn" ? (v.petHp === 0 ? styles.fallen : petHit ? styles.recoil : moving ? styles.strike : "") : ""}>{snapshot.stage === "acorn" ? <div className="-scale-x-100"><PetSprite stage={snapshot.stage} petClass={snapshot.petClass} mood="neutral" scale={1} label={snapshot.name} /></div> : <CombatSprite speed={speed} paused={session.paused || session.hidden || session.ultiOpen} stage={snapshot.stage} petClass={snapshot.petClass} animation={v.petHp === 0 ? "ko" : petHit ? "hurt" : moving ? "attack" : "idle"} size={112} />}</div>
          <div key={`enemy-${effects.enemyHit ?? effects.enemyStrike ?? "rest"}`}><CombatSprite speed={speed} paused={session.paused || session.hidden || session.ultiOpen} enemy={currentEnemyId as "brote" | "caparazon"} animation={v.enemyHp === 0 ? "ko" : enemyHit ? "hurt" : effects.enemyStrike !== undefined ? "attack" : v.enemyPhase === "windup" ? "charge" : v.enemyPhase === "guard" ? "guard" : v.enemyPhase === "vulnerable" ? "vulnerable" : "idle"} size={112} /></div>
        </div>
        {/* Aviso de seis palabras con icono: la frase larga reservaba tres líneas
            en móvil. El detalle completo sigue en «Cómo funcionan los ataques». */}
        {/* Altura reservada con las alternativas: a 320 px «¡Carga! Interrumpe
            ahora» ocupa dos líneas y, sin reservar, el banner crecía y empujaba
            los botones (el e2e mide que no se mueven ni un píxel). */}
        {/* El icono y el contador se pintan SIEMPRE y solo se ocultan a la vista:
            si aparecen y desaparecen, el ancho libre del texto cambia y la frase
            reflota. La altura del banner la fija el CSS. */}
        <p className={styles.telegraph} data-enemy-phase={v.enemyPhase} role="status" data-warning={active && (v.enemyPhase === "windup" || v.enemyPhase === "guard") ? "true" : "false"}>
          <AlertIcon aria-hidden="true" />
          <span>{active ? t(v.enemyPhase === "idle" && currentEnemyId === "caparazon" ? "phasesShort.caparazonIdle" : `phasesShort.${v.enemyPhase}`) : t("finished")}</span>
          <time aria-hidden="true">{phaseSeconds} s</time>
        </p>
        {/* Una sola línea, recortada si hace falta: el detalle íntegro sigue en el
            registro y en el aviso `aria-live` de abajo. */}
        <p className={styles.statusLine} role="status" aria-atomic="true" data-testid="skill-feedback">
          <b>{statusText}</b>
          <time data-testid="training-tick">{t("time", { seconds: (v.tick / 10).toFixed(1) })}{phase === "replaying" ? ` · ${t("replaying")}` : ""}</time>
        </p>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="loot-feedback">{lootFeedback.map(eventText).join(" · ")}</p>
      </div>
      {active && <div className={styles.controls}>
        <div className={styles.actions}>
          <div className={styles.action}>
            <button ref={skillButton} aria-label={t(queued ? "queued" : cooldown ? "cooldown" : "skill", { seconds: (cooldown * RULESET.tickMs / 1000).toFixed(1) })} aria-describedby={`${kind}-skill-summary`} className={styles.actionButton} disabled={phase !== "playing" || session.paused || session.hidden || session.ultiOpen || session.awaitingContinue || cooldown > 0 || queued} onClick={() => { session.skill(); refresh(); }}>
              <Swords width={23} height={23} aria-hidden="true" /><strong>{t("skillTitle")}</strong><ReservedText text={t(queued ? "actionQueued" : cooldown ? "actionCooldown" : "actionReady", { seconds: (cooldown / 10).toFixed(1) })} alternatives={[t("actionReady"), t("actionQueued"), t("actionCooldown", { seconds: "6.0" })]} />
            </button>
            <progress className={styles.actionProgress} max={RULESET.pet.skillCooldown} value={RULESET.pet.skillCooldown - cooldown} aria-label={t("recharge")} />
          </div>
          {Number.isFinite(v.ultiReadyAt) && <div className={styles.action} data-ultimate="true" data-ready={!v.ultiUsed && ultiCooldown === 0}>
            <button ref={ultiButton} aria-label={t(v.ultiUsed ? "ulti.used" : ultiCooldown ? "ulti.charging" : "ulti.ready", { seconds: (ultiCooldown / 10).toFixed(1) })} aria-describedby={`${kind}-ulti-summary`} className={styles.actionButton} disabled={phase !== "playing" || session.hidden || session.ultiOpen || session.awaitingContinue || v.ultiUsed || ultiCooldown > 0 || queued} onClick={() => { session.openUlti(); refresh(); }}>
              <Sparkles width={23} height={23} aria-hidden="true" /><strong>{t("ulti.shortTitle")}</strong><ReservedText text={t(v.ultiUsed ? "ulti.shortUsed" : ultiCooldown ? "actionCooldown" : "ulti.shortReady", { seconds: (ultiCooldown / 10).toFixed(1) })} alternatives={[t("ulti.shortUsed"), t("ulti.shortReady"), t("actionCooldown", { seconds: "12.0" })]} />
            </button>
            <progress className={styles.actionProgress} max={v.ultiReadyAt} value={v.ultiReadyAt - ultiCooldown} aria-label={t("ulti.recharge")} />
          </div>}
        </div>
        {Number.isFinite(v.ultiReadyAt) && <div className={styles.ultiOutcome}>
          <span className={styles.shield}><Shield width={15} height={15} aria-hidden="true" />{t("ulti.shield", { value: v.shield })}</span>
          <p role="status"><ReservedText text={lastUlti ? t("ulti.feedback", { damage:lastUlti.damage, shield:lastUlti.shield }) : t("ulti.awaiting")} alternatives={[t("ulti.feedback",{damage:v.enemyHpMax,shield:v.petHpMax}), t("ulti.awaiting")]} /></p>
        </div>}
        <div className={styles.playback}>
          <button ref={pauseButton} aria-pressed={session.paused} disabled={session.ultiOpen || session.awaitingContinue} onClick={() => { session.togglePause(); refresh(); }}>{session.paused ? <Play width={14} height={14} aria-hidden="true" /> : <Pause width={14} height={14} aria-hidden="true" />}{t(session.paused ? "resume" : "pause")}</button>
          <label className="flex items-center gap-2 text-sm">{t("speed")}<select className="min-h-11 rounded border border-border bg-surface-muted px-2 py-2" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.5, 1, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
        </div>
        {adventure && session.awaitingContinue && v && <div role="status" className="space-y-2 rounded-card border border-border p-3 text-sm"><p>{ta("interlude", { n: v.fight - 1, hp: v.petHp, max: v.petHpMax })}</p><button className={styles.startButton} onClick={() => { session.continueFight(); if (session.paused) session.togglePause(); refresh(); }}>{ta("continue")}</button></div>}
        {session.ultiOpen && session.battle && <UltiPuzzle seed={session.battle.seed} tick={v.tick} version={session.battle.rulesetVersion} equipment={"equipment" in session.battle.snapshot ? session.battle.snapshot.equipment : undefined} onCancel={() => { session.cancelUlti(); restoreFocus.current = "ulti"; refresh(); }} onConfirm={order => { if (session.confirmUlti(order)) restoreFocus.current = "skill"; refresh(); }} />}
        {/* La descripción de cada acción sigue existiendo para lectores de
            pantalla (`aria-describedby` no alcanza lo que un `details` cerrado
            oculta), pero deja de ocupar dos líneas fijas entre los botones. La
            explicación larga sí vive dentro de la ayuda. */}
        <p id={`${kind}-skill-summary`} className="sr-only">{t("skillSummary")}</p>
        {Number.isFinite(v.ultiReadyAt) && <p id={`${kind}-ulti-summary`} className="sr-only">{t("ulti.summary")}</p>}
        <details className={styles.help}><summary>{t("helpTitle")}</summary>
          <p>{t("skillHelp", { seconds: RULESET.pet.skillCooldown * RULESET.tickMs / 1000, normal: RULESET.pet.skillIdleMul, interrupt: RULESET.pet.skillInterruptMul })}</p>
          <p>{t("skillSummary")}</p>
          {Number.isFinite(v.ultiReadyAt) && <><p>{t("ulti.help")}</p><p>{t("ulti.summary")}</p></>}
        </details>
      </div>}
    </>}
    {phase === "resolving" && <p role="status">{t("resolving")}</p>}
    {phase === "resolve-error" && <button className={styles.startButton} onClick={() => void run(() => session.resolve())}>{t("retryResolve")}</button>}
    {/* El resultado es el pico del juego: el botín se revela, no se enumera. */}
    {result && <div role="status" className={styles.result}>
      <h3>{adventure && result.outcome === "win" ? ta("won") : t(`outcomes.${result.outcome}`)}</h3>
      {reward && <div className={styles.lootReveal}>
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel art: next/image reescalaría con filtro bilineal */}
        <img src={LOOT_ART[reward.itemId].icon} alt="" width={96} height={96} />
        <span className={styles.lootNew}>{ta("lootNew")}</span>
        <strong>{ta(`items.${reward.itemId}`)}</strong>
        <span className={styles.lootPotency}>{ta("equipment.potency", { value: format.number((reward.qualityBp ?? 10000) / 10000, { minimumFractionDigits: 1 }) })}</span>
      </div>}
      <p>{t("damage", { dealt: result.damageDealt, taken: result.damageTaken })}</p>
      {result.causes.map(cause => <p key={cause} className={styles.resultCauses}>{t(`causes.${cause}`)}</p>)}
      {adventure && result.outcome !== "win" && <p className={styles.resultCauses}>{ta("loseHint")}</p>}
    </div>}
    {phase === "done" && <div className={styles.resultActions}>
      {adventure && wonCopy && onEquipNow && <button data-primary="true" onClick={onEquipNow}><CheckIcon width={16} height={16} aria-hidden="true" />{tg("viewBag")}</button>}
      {adventure ? (
        result?.outcome !== "win"
          ? <button data-primary="true" onClick={() => void run(() => session.start(true))}>{ta("retry")}</button>
          : canStartAnother && <button data-primary="true" onClick={() => void run(() => session.start(true))}>{ta("start")}</button>
      ) : <button data-primary="true" onClick={() => void run(() => session.start(true))}>{t("repeat")}</button>}
      <button onClick={() => void run(() => session.replay())}><EyeIcon width={16} height={16} aria-hidden="true" />{t("replay")}</button>
      {onHome && <button onClick={onHome}>{tg("sections.camp")}</button>}
    </div>}
    {session.events.length > 0 && <details className={styles.help}><summary>{t("log")}</summary><ol className="max-h-56 space-y-1 overflow-y-auto">{session.events.map(event => <li key={event.seq}><span className="tabular-nums text-muted-foreground">{(event.tick / 10).toFixed(1)} s</span> · {eventText(event)}</li>)}</ol></details>}
  </section>;
}

/** Overlapping alternatives reserve their natural wrapped height, including at
 * larger font sizes. Only the current message is visible or accessible. */
function ReservedText({ text, alternatives }: { text: string; alternatives: string[] }) {
  return <span className="grid">
    {alternatives.map((alternative, index) => <span key={index} aria-hidden="true" className="invisible col-start-1 row-start-1">{alternative}</span>)}
    <span className="col-start-1 row-start-1">{text}</span>
  </span>;
}

function Health({ label, value, max, rival = false, portrait }: { label: string; value: number; max: number; rival?: boolean; portrait?: React.ReactNode }) {
  return <div className={styles.health} data-rival={rival}>
    <span className={styles.healthPortrait} aria-hidden="true">{portrait}</span>
    <div className={styles.healthBody}>
      <p className="truncate text-sm font-medium">{label}</p>
      <progress aria-label={label} value={value} max={max} />
      <p className={styles.healthValue}><Heart width={11} height={11} aria-hidden="true" />{value}<span>/ {max}</span></p>
    </div>
  </div>;
}
