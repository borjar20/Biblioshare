"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./celebration-overlay.module.css";
import { CELEBRATIONS } from "@/lib/celebrations/registry";
import { readCelebrationPreference } from "@/lib/celebrations/preference";
import type { DisplayReceipt, QueueEntry } from "@/lib/celebrations/protocol";
import type {
  CelebrationPayload,
  CelebrationPreference,
} from "@/lib/celebrations/types";

function messageFor(p: CelebrationPayload): string {
  if (p.message) return p.message;
  switch (p.event) {
    case "first_activity_of_day":
      return "Has abierto el día. ¡Primera actividad registrada!";
    case "daily_goal_completed":
      return "Objetivo diario completado.";
    case "streak_milestone":
      return `¡Racha de ${p.milestone ?? ""} días!`;
    case "first_club_participation":
      return "Ya formas parte de la conversación del club.";
    case "pet_level_up":
      return `Tu mascota sube a nivel ${p.milestone ?? ""}.`;
    case "pet_evolved":
      return "¡Tu mascota ha evolucionado!";
    case "pet_mission_done":
      return "Misión cumplida.";
    case "pet_achievement":
      return "Logro desbloqueado.";
    case "pet_adventure_won":
      return "¡Aventura superada!";
  }
}

function staticGlyph(p: CelebrationPayload): string {
  switch (p.event) {
    case "first_activity_of_day":
      return "📖";
    case "daily_goal_completed":
      return "✓";
    case "streak_milestone":
      return String(p.milestone ?? "★");
    case "first_club_participation":
      return "👥";
    case "pet_level_up":
      return String(p.milestone ?? "↑");
    case "pet_evolved":
      return "✦";
    case "pet_mission_done":
      return "✓";
    case "pet_achievement":
      return "🏆";
    case "pet_adventure_won":
      return "⚔";
  }
}

function Visual({ payload }: { payload: CelebrationPayload }) {
  switch (payload.event) {
    case "first_activity_of_day":
      return (
        <div className={styles.shelf} aria-hidden="true">
          <div className={`${styles.book} ${styles.s1}`} />
          <div className={`${styles.book} ${styles.s2}`} />
          <div className={`${styles.book} ${styles.s3}`} />
          <div className={`${styles.book} ${styles.arriving}`} />
        </div>
      );
    case "daily_goal_completed":
      return (
        <div className={styles.ringWrap} aria-hidden="true">
          <svg className={styles.ring} viewBox="0 0 120 120">
            <circle className={styles.ringTrack} cx="60" cy="60" r="54" />
            <circle className={styles.ringValue} cx="60" cy="60" r="54" />
          </svg>
          <div className={styles.ringCheck}>✓</div>
        </div>
      );
    case "streak_milestone":
      return (
        <div className={styles.stack} aria-hidden="true">
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.stackNum}>{payload.milestone}</div>
        </div>
      );
    case "first_club_participation":
      return (
        <div className={styles.club} aria-hidden="true">
          <div className={`${styles.avatar} ${styles.a}`}>A</div>
          <div className={`${styles.avatar} ${styles.b}`}>M</div>
          <div className={`${styles.avatar} ${styles.c}`}>L</div>
          <div className={styles.core}>♣</div>
        </div>
      );
    case "pet_level_up":
    case "pet_evolved":
    case "pet_mission_done":
    case "pet_adventure_won":
    case "pet_achievement":
      return (
        <div className={styles.stack} aria-hidden="true">
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.spine} />
          <div className={styles.stackNum}>{staticGlyph(payload)}</div>
        </div>
      );
  }
}

// prefers-reduced-motion del sistema por store externo: sin useEffect+setState,
// e hidratación segura (el servidor asume "sin reducir").
function subscribeReduceMotion(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getReduceMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CelebrationOverlay({
  entry,
  generation,
  preference,
  onShown,
  onDone,
}: {
  entry: QueueEntry | null;
  generation: number;
  preference: CelebrationPreference;
  onShown: (receipt: DisplayReceipt) => void;
  onDone: (key: string) => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const presented = useRef<{ key: string; shownAt: number } | null>(null);
  const visible = useSyncExternalStore(subscribeVisibility, getVisibility, () => false);
  const systemReduce = useSyncExternalStore(
    subscribeReduceMotion,
    getReduceMotion,
    () => false,
  );
  const reduce = preference === "reduced" || systemReduce;
  const payload = entry ? entry.source === "local" ? entry.payload : entry.reservation.payload : null;
  const key = entry?.key ?? null;
  const safeDeadline = entry?.source === "remote" ? entry.safeDeadline : Infinity;
  const enabled = preference !== "disabled";
  const withinBudget = useDisplayBudget(safeDeadline);

  useEffect(() => {
    if (!payload || !key || !enabled || !visible || !withinBudget) return;
    const config = CELEBRATIONS[payload.event];
    let cancelled = false;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const valid = () => !cancelled && card.current?.isConnected && document.visibilityState === "visible" && readCelebrationPreference() !== "disabled" && performance.now() < safeDeadline;
    const finishAfterPresentation = () => {
      const shownAt = presented.current?.shownAt;
      if (shownAt === undefined) return;
      const duration = reduce ? 1200 : config.durationMs + 200;
      timer = setTimeout(() => { if (!cancelled) onDone(key); }, Math.max(0, shownAt + duration - performance.now()));
    };
    if (presented.current?.key === key) finishAfterPresentation();
    else {
      // A connected portal alone is not a presentation receipt. Both frames
      // must remain visible, enabled and within this reservation's budget.
      frame = requestAnimationFrame(() => {
        if (!valid()) return;
        frame = requestAnimationFrame(() => {
          if (!valid()) return;
          presented.current = { key, shownAt: performance.now() };
          onShown({ key, generation });
          finishAfterPresentation();
        });
      });
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [payload, key, generation, enabled, visible, withinBudget, safeDeadline, reduce, onShown, onDone]);

  if (!payload || !enabled || !visible || !withinBudget || typeof document === "undefined") return null;

  const config = CELEBRATIONS[payload.event];

  return createPortal(
    <div className={styles.overlay} data-reduce={reduce}>
      {/* role=status + aria-live: nada se comunica solo por movimiento. */}
      <div
        className={styles.card}
        ref={card}
        data-intensity={config.intensity}
        role="status"
        aria-live="polite"
      >
        <div className={styles.visual}>
          {reduce ? (
            <div className={styles.staticIcon} aria-hidden="true">
              {staticGlyph(payload)}
            </div>
          ) : (
            <Visual payload={payload} />
          )}
        </div>
        {payload.title ? <strong>{payload.title}</strong> : null}
        <p className={styles.msg}>{messageFor(payload)}</p>
      </div>
    </div>,
    document.body,
  );
}

function subscribeVisibility(callback: () => void): () => void {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
function getVisibility(): boolean { return document.visibilityState === "visible"; }

// Time is an external store with one transition at this deadline, rather than
// an impure clock read in the component's render. Frames still recheck the live
// budget to cover a suspension before React commits the store notification.
function useDisplayBudget(deadline: number): boolean {
  const subscribe = useCallback((changed: () => void) => {
    if (!Number.isFinite(deadline)) return () => {};
    const timer = setTimeout(changed, Math.max(0, deadline - performance.now()));
    return () => clearTimeout(timer);
  }, [deadline]);
  const snapshot = useCallback(() => performance.now() < deadline, [deadline]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
