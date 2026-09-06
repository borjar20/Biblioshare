"use client";

import { useEffect, useState } from "react";
import type { PetClass, PetStage } from "@/lib/pet/classes";
import { COMBAT_ART, type CombatAnimation } from "@/lib/pet/combat-art.gen";

type Props = {
  stage?: PetStage;
  petClass?: PetClass;
  enemy?: "brote" | "caparazon";
  animation?: CombatAnimation;
  size?: number;
  paused?: boolean;
  speed?: number;
};

/** Native east/west PixelLab frames; independent of the companion's sheet and hitbox. */
export function CombatSprite({ stage = "young", petClass = "fighter", enemy, animation = "idle", size = 144, paused = false, speed = 1 }: Props) {
  const key = enemy ? `enemy/${enemy}` : `${stage === "acorn" ? "young" : stage}/${petClass}`;
  const entry = COMBAT_ART[key];
  const anim = entry?.anims[animation] ?? entry?.anims.idle;
  const [frame, setFrame] = useState(0);
  const identity = `${key}/${animation}`;
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  if (previousIdentity !== identity) {
    setPreviousIdentity(identity);
    setFrame(0);
  }
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const restart = () => {
      clearInterval(timer);
      if (media.matches) setFrame(animation === "ko" && anim ? anim.frames - 1 : 0);
      if (!anim || media.matches || paused) return;
      const loop = animation === "idle" || animation === "guard" || animation === "charge" || animation === "vulnerable";
      timer = setInterval(() => setFrame(current => loop ? (current + 1) % anim.frames : Math.min(current + 1, anim.frames - 1)), (animation === "idle" ? 160 : 85) / speed);
    };
    restart();
    media.addEventListener("change", restart);
    return () => { clearInterval(timer); media.removeEventListener("change", restart); };
  }, [key, animation, anim, paused, speed]);
  if (!entry || !anim) return null;
  const scale = size / entry.cell;
  return <span aria-hidden="true" data-combat-sprite={key} style={{ display: "inline-block", width: size, height: size, flexShrink: 0, imageRendering: "pixelated", backgroundImage: `url(${entry.src}?v=${entry.hash})`, backgroundRepeat: "no-repeat", backgroundSize: `${entry.width * scale}px ${entry.height * scale}px`, backgroundPosition: `${-Math.min(frame, anim.frames - 1) * size}px ${-anim.row * size}px` }} />;
}
