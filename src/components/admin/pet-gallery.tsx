"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PET_CLASSES, type PetMood } from "@/lib/pet/classes";
import { DRAWN_STAGES, REACTION_MS, type PetDirection } from "@/lib/pet/manifest";
import { PetSprite, type PetReaction } from "@/components/pet/pet-sprite";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

type GalleryAnim = "idle" | "sleepy" | "sad" | "joy";
const ANIMS: GalleryAnim[] = ["idle", "sleepy", "sad", "joy"];
const DIRECTIONS: PetDirection[] = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];
// idle→happy, sleepy→sleepy, sad→sad; joy no es humor, es reacción.
const MOOD_BY_ANIM: Record<Exclude<GalleryAnim, "joy">, PetMood> = { idle: "happy", sleepy: "sleepy", sad: "sad" };

// Visor de admin (spec bellota-visor §3): todas las combinaciones con el PetSprite de producción.
// Pausa y paso frame a frame con la Web Animations API sobre los elementos del contenedor: no
// añade props al componente, así lo que se ve aquí es exactamente lo que ve el usuario.
export function PetGallery() {
  const t = useTranslations("admin");
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [anim, setAnim] = useState<GalleryAnim>("idle");
  const [direction, setDirection] = useState<PetDirection>("south");
  const [ready, setReady] = useState(false);
  const [evolve, setEvolve] = useState(false);
  const [paused, setPaused] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // jsdom no implementa `getAnimations`: sin esta guarda el useEffect de abajo rompería
  // el test bajo @vitest-environment jsdom.
  const animations = () =>
    grid.current
      ? [...grid.current.querySelectorAll('[role="img"]')].flatMap((el) =>
          typeof (el as Element).getAnimations === "function" ? (el as Element).getAnimations() : [],
        )
      : [];

  // Sin array de dependencias a propósito: cambiar `animationName` (p. ej. al cambiar de
  // animación o dirección) destruye y recrea la animación CSS, que nace en marcha. Este efecto
  // reaplica `paused` a las animaciones que existan en ESTE render; con `[paused]` como
  // dependencia, un cambio de animación dejaría el sprite corriendo aunque el botón mostrara
  // «Reproducir».
  useEffect(() => {
    for (const a of animations()) {
      if (paused) a.pause();
      else a.play();
    }
  });

  const step = (dir: 1 | -1) => {
    setPaused(true);
    for (const a of animations()) {
      const el = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
      const frames = Number(el?.getAttribute("data-frames") ?? 1);
      const duration = Number(a.effect?.getComputedTiming().duration ?? 0);
      if (!frames || !duration) continue;
      const frameMs = duration / frames;
      const now = Number(a.currentTime ?? 0);
      a.pause();
      a.currentTime = (((now + dir * frameMs) % duration) + duration) % duration;
    }
  };

  const triggerEvolve = () => {
    setEvolve(true);
    window.setTimeout(() => setEvolve(false), REACTION_MS.evolve);
  };

  const replay = () => {
    for (const a of animations()) {
      a.currentTime = 0;
      a.play();
    }
    setPaused(false);
  };

  const reaction: PetReaction = evolve ? "evolve" : anim === "joy" ? "joy" : null;
  const mood: PetMood = anim === "joy" ? "happy" : MOOD_BY_ANIM[anim];

  return (
    <div className="flex flex-col gap-4" data-testid="pet-gallery">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3 text-sm shadow-card">
        <label className="flex items-center gap-1">{t("pet.scale")}
          <select data-testid="pet-gallery-scale" value={scale} onChange={(e) => setScale(Number(e.target.value) as 1 | 2 | 3)} className="rounded-md border border-border bg-surface px-2 py-1">
            <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
          </select>
        </label>
        <label className="flex items-center gap-1">{t("pet.anim")}
          <select data-testid="pet-gallery-anim" value={anim} onChange={(e) => setAnim(e.target.value as GalleryAnim)} className="rounded-md border border-border bg-surface px-2 py-1">
            {ANIMS.map((a) => <option key={a} value={a}>{t(`pet.anims.${a}`)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">{t("pet.direction")}
          <select data-testid="pet-gallery-direction" value={direction} onChange={(e) => setDirection(e.target.value as PetDirection)} className="rounded-md border border-border bg-surface px-2 py-1">
            {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" data-testid="pet-gallery-ready" checked={ready} onChange={(e) => setReady(e.target.checked)} /> {t("pet.acornReady")}
        </label>
        <button type="button" data-testid="pet-gallery-evolve" onClick={triggerEvolve} className="rounded-md border border-border px-2 py-1">{t("pet.evolve")}</button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" data-testid="pet-gallery-prev" onClick={() => step(-1)} disabled={reducedMotion} aria-label={t("pet.prevFrame")} className="rounded-md border border-border px-2 py-1 disabled:opacity-50">⏮</button>
          <button type="button" data-testid="pet-gallery-play" onClick={() => setPaused((p) => !p)} disabled={reducedMotion} className="rounded-md border border-border px-2 py-1 disabled:opacity-50">{paused ? t("pet.play") : t("pet.pause")}</button>
          <button type="button" data-testid="pet-gallery-next" onClick={() => step(1)} disabled={reducedMotion} aria-label={t("pet.nextFrame")} className="rounded-md border border-border px-2 py-1 disabled:opacity-50">⏭</button>
          <button type="button" data-testid="pet-gallery-replay" onClick={replay} className="rounded-md border border-border px-2 py-1">{t("pet.replay")}</button>
        </span>
      </div>

      <div ref={grid} className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        {DRAWN_STAGES.map((stage) => PET_CLASSES.map((cls) => (
          <figure key={`${stage}-${cls}`} className="flex flex-col items-center gap-1 rounded-card border border-border bg-surface p-2">
            <PetSprite stage={stage} petClass={cls} mood={mood} scale={scale} reaction={reaction} direction={direction} label={`${stage} ${cls}`} />
            <figcaption className="text-[11px] text-muted-foreground">{stage} · {cls}</figcaption>
          </figure>
        )))}
        <figure className="flex flex-col items-center gap-1 rounded-card border border-border bg-surface p-2">
          <PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={scale} hatchReady={ready} label="acorn" />
          <figcaption className="text-[11px] text-muted-foreground">acorn · {ready ? "ready" : "idle"}</figcaption>
        </figure>
      </div>
    </div>
  );
}
