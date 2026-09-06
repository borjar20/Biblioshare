"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { startBattle, resolveBattle, replayTrainingBattle } from "@/lib/pet/training/actions";
import { RULESET } from "@/lib/pet/battle/content";
import type { BattleEvent } from "@/lib/pet/battle/types";
import { buttonVariants } from "@/components/ui/button";
import { PetSprite } from "../pet-sprite";
import { CombatSprite } from "./combat-sprite";
import { UltiPuzzle } from "./ulti-puzzle";
import { TrainingSession } from "./training-session";
import { trainingEffects } from "./training-effects";
import styles from "./training.module.css";

export function TrainingPanel() {
  const t = useTranslations("pet.training");
  const [session] = useState(() => new TrainingSession({ start: startBattle, resolve: resolveBattle, replay: replayTrainingBattle }, () => crypto.randomUUID()));
  const ultiButton = useRef<HTMLButtonElement>(null);
  const skillButton = useRef<HTMLButtonElement>(null);
  const pauseButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<"ulti" | "skill" | null>(null);
  const sessionRef = useRef(session);
  const [, render] = useState(0);
  const [speed, setSpeed] = useState(1);
  const refresh = () => render(n => n + 1);
  const phase = session.phase;

  useEffect(() => {
    const current = sessionRef.current;
    const visibility = () => { current.hidden = document.hidden; render(n => n + 1); };
    current.hidden = document.hidden;
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  useEffect(() => {
    if (phase !== "playing" && phase !== "replaying") return;
    // One timer callback = one tick. Never accumulate elapsed wall-clock time.
    const timer = window.setInterval(() => { sessionRef.current.tick(); render(n => n + 1); }, RULESET.tickMs / speed);
    return () => window.clearInterval(timer);
  }, [phase, speed]);

  useEffect(() => {
    if (phase !== "resolving") return;
    let mounted = true;
    void sessionRef.current.resolve().then(() => { if (mounted) render(n => n + 1); });
    return () => { mounted = false; };
  }, [phase]);

  useEffect(() => {
    const target = restoreFocus.current === "ulti" ? ultiButton.current : restoreFocus.current === "skill" ? skillButton.current : null;
    if (!target || session.ultiOpen) return;
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
  const button = buttonVariants("secondary");
  const effects = trainingEffects(session.events, v?.tick);
  const moving = effects.strike !== undefined;
  const petHit = effects.petHit !== undefined;
  const enemyHit = effects.enemyHit !== undefined;
  const lastUlti = session.events.findLast(event => event.type === "ULTI_USED");
  const ultiCooldown = v ? Math.max(0, v.ultiReadyAt - v.tick) : 0;
  const lastSkill = session.events.findLast(event => event.type === "SKILL_USED");
  const phaseSeconds = v ? Math.max(0, (v.enemyPhaseUntil - v.tick) * RULESET.tickMs / 1000).toFixed(1) : "0";

  function eventText(event: BattleEvent) {
    if (event.type === "STATUS_APPLIED" && event.status === "vulnerable") return t("events.vulnerableStarted");
    if (event.type === "STATUS_EXPIRED" && event.status === "vulnerable") return t("events.vulnerableEnded");
    if (event.type === "TELEGRAPH_STARTED") return t(`events.${event.kind}`);
    if (event.type === "SKILL_USED") return t(`events.${event.effect}`, { damage: event.damage });
    return t(`events.${event.type}`, { damage: "damage" in event ? event.damage : 0 });
  }

  return <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="training-title" data-testid="pet-training">
    <div><h2 id="training-title" className="font-serif text-xl font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p></div>
    {session.error && <div role="alert" className="text-sm"><p>{t("error")}</p></div>}
    {(phase === "idle" || phase === "starting" || phase === "done") && <label className="space-y-2 text-sm">{t("enemySelect")}<select className="block w-full rounded border border-border bg-surface p-2" disabled={phase === "starting" || (phase === "idle" && !!session.error)} value={session.enemyId} onChange={e => { session.selectEnemy(e.target.value); refresh(); }}>{(["brote", "caparazon"] as const).map(id => <option key={id} value={id}>{t(`enemies.${id}`)}</option>)}</select><span className="block text-muted-foreground">{t("enemyHelp")}</span></label>}
    {(phase === "idle" || phase === "starting") && <button className={buttonVariants()} disabled={phase === "starting"} onClick={() => void run(() => session.start())}>{t(phase === "starting" ? "starting" : session.error ? "retryStart" : "start")}</button>}
    {v && snapshot && <>
      <div className={styles.arena} data-paused={session.paused || session.hidden || session.ultiOpen || !active}>
        <div className="grid grid-cols-2 gap-6">
          <Health label={snapshot.name} value={v.petHp} max={v.petHpMax} />
          <Health label={t(`enemies.${session.battle!.enemyId as "brote" | "caparazon"}`)} value={v.enemyHp} max={v.enemyHpMax} />
        </div>
        <div className="flex h-36 items-end justify-around border-b-2 border-border pb-3" aria-hidden="true">
          <div key={`pet-${effects.petHit ?? effects.strike ?? "rest"}`} className={snapshot.stage === "acorn" ? (v.petHp === 0 ? styles.fallen : petHit ? styles.recoil : moving ? styles.strike : "") : ""}>{snapshot.stage === "acorn" ? <div className="-scale-x-100"><PetSprite stage={snapshot.stage} petClass={snapshot.petClass} mood="neutral" scale={1} label={snapshot.name} /></div> : <CombatSprite speed={speed} paused={session.paused || session.hidden || session.ultiOpen} stage={snapshot.stage} petClass={snapshot.petClass} animation={v.petHp === 0 ? "ko" : petHit ? "hurt" : moving ? "attack" : "idle"} size={112} />}</div>
          <div key={`enemy-${effects.enemyHit ?? effects.enemyStrike ?? "rest"}`}><CombatSprite speed={speed} paused={session.paused || session.hidden || session.ultiOpen} enemy={session.battle!.enemyId as "brote" | "caparazon"} animation={v.enemyHp === 0 ? "ko" : enemyHit ? "hurt" : effects.enemyStrike !== undefined ? "attack" : v.enemyPhase === "windup" ? "charge" : v.enemyPhase === "guard" ? "guard" : v.enemyPhase === "vulnerable" ? "vulnerable" : "idle"} size={112} /></div>
        </div>
        <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-center" data-enemy-phase={v.enemyPhase}>
          <p role="status" className="text-sm font-semibold"><ReservedText text={active ? t(v.enemyPhase === "idle" && session.battle?.enemyId === "caparazon" ? "phases.caparazonIdle" : `phases.${v.enemyPhase}`) : t("finished")} alternatives={[...(["idle", "windup", "guard", "stagger", "vulnerable"] as const).map(p => t(`phases.${p}`)), t("phases.caparazonIdle"), t("finished")]} /></p>
          <p aria-hidden="true" className={`mt-1 text-xs tabular-nums ${active && (v.enemyPhase === "windup" || v.enemyPhase === "guard") ? "" : "invisible"}`}>{t("phaseTime", { seconds: phaseSeconds })}</p>
        </div>
        <p role="status" aria-atomic="true" className="pt-2 text-center text-sm tabular-nums" data-testid="skill-feedback"><ReservedText text={lastSkill ? t(`feedback.${lastSkill.effect}`, { damage: lastSkill.damage }) : ""} alternatives={(["interrupt", "hit", "wasted", "vulnerable"] as const).map(effect => t(`feedback.${effect}`, { damage: v.enemyHpMax }))} /></p>
        <p data-testid="training-tick" className="text-center text-xs text-muted-foreground">{t("time", { seconds: (v.tick / 10).toFixed(1) })}{phase === "replaying" ? ` · ${t("replaying")}` : ""}</p>
      </div>
      {active && <div className="flex flex-col gap-3">
        <p id="training-skill-help" className="text-sm text-muted-foreground">{t("skillHelp", { seconds: RULESET.pet.skillCooldown * RULESET.tickMs / 1000, normal: RULESET.pet.skillIdleMul, interrupt: RULESET.pet.skillInterruptMul })}</p>
        <button ref={skillButton} aria-describedby="training-skill-help" className={buttonVariants("primary", "tabular-nums")} disabled={phase !== "playing" || session.paused || session.hidden || session.ultiOpen || cooldown > 0 || queued} onClick={() => { session.skill(); refresh(); }}><ReservedText text={t(queued ? "queued" : cooldown ? "cooldown" : "skill", { seconds: (cooldown * RULESET.tickMs / 1000).toFixed(1) })} alternatives={[t("skill"), t("queued"), t("cooldown", { seconds: (RULESET.pet.skillCooldown * RULESET.tickMs / 1000).toFixed(1) })]} /></button>
        <progress className="h-2 w-full accent-accent" max={RULESET.pet.skillCooldown} value={RULESET.pet.skillCooldown - cooldown} aria-label={t("recharge")} />
        {Number.isFinite(v.ultiReadyAt) && <>
          <button ref={ultiButton} className={button} disabled={phase !== "playing" || session.hidden || session.ultiOpen || v.ultiUsed || ultiCooldown > 0 || queued} onClick={() => { session.openUlti(); refresh(); }}><ReservedText text={t(v.ultiUsed ? "ulti.used" : ultiCooldown ? "ulti.charging" : "ulti.ready", { seconds: (ultiCooldown / 10).toFixed(1) })} alternatives={[t("ulti.used"),t("ulti.ready"),t("ulti.charging",{seconds:"12.0"})]} /></button>
          <progress className="h-2 w-full accent-accent" max={v.ultiReadyAt} value={v.ultiReadyAt - ultiCooldown} aria-label={t("ulti.recharge")} />
          <p className="text-sm tabular-nums">{t("ulti.shield", { value: v.shield })}</p>
          <p role="status" className="text-sm"><ReservedText text={lastUlti ? t("ulti.feedback", { damage:lastUlti.damage, shield:lastUlti.shield }) : ""} alternatives={[t("ulti.feedback",{damage:v.enemyHpMax,shield:v.petHpMax})]} /></p>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button ref={pauseButton} className={button} aria-pressed={session.paused} disabled={session.ultiOpen} onClick={() => { session.togglePause(); refresh(); }}>{t(session.paused ? "resume" : "pause")}</button>
          <label className="flex items-center gap-2 text-sm">{t("speed")}<select className="rounded border border-border bg-surface px-2 py-2" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.5, 1, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
        </div>
        {(session.paused || session.hidden) && <p role="status" className="text-sm text-muted-foreground">{t("paused")}</p>}
        {session.ultiOpen && session.battle && <UltiPuzzle seed={session.battle.seed} tick={v.tick} onCancel={() => { session.cancelUlti(); restoreFocus.current = "ulti"; refresh(); }} onConfirm={order => { if (session.confirmUlti(order)) restoreFocus.current = "skill"; refresh(); }} />}
      </div>}
    </>}
    {phase === "resolving" && <p role="status">{t("resolving")}</p>}
    {phase === "resolve-error" && <button className={button} onClick={() => void run(() => session.resolve())}>{t("retryResolve")}</button>}
    {result && <div role="status" className="space-y-2"><h3 className="font-serif text-lg font-semibold">{t(`outcomes.${result.outcome}`)}</h3><p className="text-sm">{t("damage", { dealt: result.damageDealt, taken: result.damageTaken })}</p>{result.causes.map(cause => <p key={cause} className="text-sm">{t(`causes.${cause}`)}</p>)}</div>}
    {phase === "done" && <div className="flex flex-wrap gap-2"><button className={button} onClick={() => void run(() => session.replay())}>{t("replay")}</button><button className={buttonVariants()} onClick={() => void run(() => session.start(true))}>{t("repeat")}</button></div>}
    {session.events.length > 0 && <details className="text-sm"><summary className="cursor-pointer py-2">{t("log")}</summary><ol className="max-h-56 space-y-1 overflow-y-auto">{session.events.map(event => <li key={event.seq}><span className="tabular-nums text-muted-foreground">{(event.tick / 10).toFixed(1)} s</span> · {eventText(event)}</li>)}</ol></details>}
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

function Health({ label, value, max }: { label: string; value: number; max: number }) {
  return <div className="min-w-0 space-y-1"><p className="truncate text-sm font-medium">{label}</p><progress className="h-3 w-full accent-accent" aria-label={label} value={value} max={max} /><p className="text-xs tabular-nums text-muted-foreground">{value} / {max}</p></div>;
}

