"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./celebration-overlay.module.css";
import { CELEBRATIONS } from "@/lib/celebrations/registry";
import { logCelebration } from "@/lib/celebrations/analytics";
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
  payload,
  preference,
  onDone,
}: {
  payload: CelebrationPayload | null;
  preference: CelebrationPreference;
  onDone: () => void;
}) {
  const systemReduce = useSyncExternalStore(
    subscribeReduceMotion,
    getReduceMotion,
    () => false,
  );
  const reduce = preference === "reduced" || systemReduce;

  useEffect(() => {
    if (!payload) return;
    const config = CELEBRATIONS[payload.event];
    logCelebration("celebration_displayed", {
      event: payload.event,
      reducedMotion: reduce,
    });
    // El fallback estático se mantiene un poco menos; el completo dura lo que
    // diga su config (600–1800 ms) + un respiro para que cierre la animación.
    const ms = reduce ? 1200 : config.durationMs + 200;
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [payload, reduce, onDone]);

  if (!payload || typeof document === "undefined") return null;

  const config = CELEBRATIONS[payload.event];

  return createPortal(
    <div className={styles.overlay} data-reduce={reduce}>
      {/* role=status + aria-live: nada se comunica solo por movimiento. */}
      <div
        className={styles.card}
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
