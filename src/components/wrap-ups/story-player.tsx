"use client";
// Reproductor de stories (spec 2026-10-06 §5). <dialog> nativo: Escape, trampa
// de foco y devolución de foco vienen del navegador, como el resto de capas.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { animateHomePanel, type PanelRect } from "@/components/home/panel-motion";
import { useTranslations } from "next-intl";
import type { OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { markWrapUpSeen } from "@/lib/wrap-ups/actions";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";
import type { PosterModel } from "@/lib/wrap-ups/view-models";
import { Poster, POSTER_FIELD } from "./poster";
import { ClosingActions } from "./share-actions";
import { pixelFont } from "./pixel-font";
import styles from "./story-player.module.css";

const STEP_MS = 6000;
const HOLD_MS = 250;

export function StoryPlayer({ wrapUp, models, onClose, originRect }: { wrapUp: OwnWrapUp; models: PosterModel[]; onClose: () => void; originRect?: PanelRect | null }) {
  const t = useTranslations("wrapUps.ui");
  const ref = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Movimiento reducido: sin avance automático; la barra solo marca el índice.
  const reduced = useReducedMotion();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  // Lo que le queda a la story actual: pausar y reanudar no reinicia los 6 s
  // (la barra CSS se congela con animation-play-state y el temporizador igual).
  const remaining = useRef(STEP_MS);
  const story = wrapUp.payload.stories[index];
  const model = models[index];
  const last = models.length - 1;

  useEffect(() => {
    ref.current?.showModal();
    if (ref.current && originRect) void animateHomePanel(ref.current, originRect, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    // showModal enfoca el primer botón (Cerrar) y entonces el espacio CERRARÍA el
    // reproductor en vez de pausarlo: el foco inicial va al escenario.
    stageRef.current?.focus({ preventScroll: true });
    // Marcar visto es secundario: si falla, la story se ve igual (vuelve a intentarlo la próxima vez).
    markWrapUpSeen(wrapUp.kind).catch(() => {});
  }, [wrapUp.kind, originRect]);

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(last, Math.max(0, i + delta)));
  }, [last]);

  // Story nueva → 6 s completos. Va ANTES del efecto del temporizador.
  useEffect(() => { remaining.current = STEP_MS; }, [index]);

  useEffect(() => {
    if (reduced || paused || index >= last) return;
    const startedAt = Date.now();
    const id = setTimeout(() => go(1), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [index, paused, reduced, go, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        // Con el foco en un botón, el espacio es SU activación, no la pausa.
        if (e.target instanceof Element && e.target.closest("button, a, input, textarea, select")) return;
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const clearHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  // Un «mantener» a medias no debe disparar setPaused tras desmontar.
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);
  const onPointerDown = () => {
    held.current = false;
    clearHold();
    holdTimer.current = setTimeout(() => { held.current = true; setPaused(true); }, HOLD_MS);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    clearHold();
    // Soltar tras mantener reanuda; un toque corto navega.
    if (held.current) { held.current = false; setPaused(false); return; }
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width * 0.3 ? -1 : 1);
  };
  const onPointerCancel = () => {
    clearHold();
    if (held.current) { held.current = false; setPaused(false); }
  };

  const cover = models[0];
  const title = cover ? [cover.lines[0], cover.eyebrow].filter(Boolean).join(" · ") : undefined;

  async function closePlayer() {
    if (!ref.current || closing.current) return;
    closing.current = true;
    if (originRect) await animateHomePanel(ref.current, originRect, reduced, true);
    ref.current?.close();
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} onCancel={(event) => { if (originRect) { event.preventDefault(); void closePlayer(); } }}
      className={`${pixelFont.variable} ${styles.dialog}`}
      style={{ "--field": POSTER_FIELD[wrapUp.payload.palette] } as CSSProperties}>
      <div className={styles.column}>
        <div className={styles.chrome}>
          <ol className={styles.progress} aria-label={t("progress", { current: index + 1, total: models.length })}>
            {models.map((_, i) => {
              const state = i < index ? "done" : i > index ? "pending" : reduced ? "static" : "running";
              return (
                <li key={i} className={styles.segment}>
                  <span className={styles.segmentFill} data-state={state}
                    style={state === "running" ? { animationDuration: `${STEP_MS}ms`, animationPlayState: paused ? "paused" : "running" } : undefined} />
                </li>
              );
            })}
          </ol>
          <div className={styles.chromeRow}>
            <span className={styles.badge} aria-hidden="true">
              {paused ? `❚❚ ${t("paused")}` : `${index + 1}/${models.length}`}
            </span>
            <button type="button" className={styles.close} onClick={closePlayer} aria-label={t("close")}>
              ✕
            </button>
          </div>
        </div>

        <div ref={stageRef} tabIndex={-1} className={styles.stage} data-testid="story-tap-zone" aria-live="polite"
          onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onPointerLeave={onPointerCancel}>
          {model && (
            <Poster key={index} model={model} palette={wrapUp.payload.palette} narrator={wrapUp.payload.narrator}
              pet={wrapUp.payload.pet} showPet={story?.id === "cover" || story?.id === "closing" || story?.id === "pet"} />
          )}
        </div>

        {story?.id === "closing" && <ClosingActions wrapUp={wrapUp} />}

        <div className={styles.srNav}>
          <button type="button" className={styles.srButton} onClick={() => go(-1)}>{t("previous")}</button>
          <button type="button" className={styles.srButton} onClick={() => go(1)}>{t("next")}</button>
          <button type="button" className={styles.srButton} onClick={() => setPaused((p) => !p)}>{paused ? t("play") : t("pause")}</button>
        </div>
      </div>
    </dialog>
  );
}
