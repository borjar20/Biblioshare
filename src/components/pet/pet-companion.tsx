"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { onCelebrationsShown } from "@/lib/celebrations/preference";
import type { CelebrationPayload } from "@/lib/celebrations/types";
import type { CSSProperties } from "react";
import type { CompanionState } from "@/lib/pet/get-companion-state";
import { REACTION_MS, spriteBox } from "@/lib/pet/manifest";
import { PetSprite, type PetReaction } from "./pet-sprite";

const BUBBLE_MS = 2200;

// Compañera flotante (spec §6). Cero ruido: solo reacciona a lo que acabas de
// hacer (una celebración recién encolada) y enseña el humor pasivo. Tap → /mascota.
export function PetCompanion({ state }: { state: CompanionState }) {
  const t = useTranslations("nav");
  const [reaction, setReaction] = useState<PetReaction>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const off = onCelebrationsShown((items: CelebrationPayload[]) => {
      const last = items.at(-1);
      if (!last) return;
      // Un evento nuevo reinicia la reacción: los temporizadores del anterior no deben cortarla antes de tiempo.
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
      setReaction("joy");
      setBubble(t(`pet.bubble.${last.event}`, { milestone: last.milestone ?? "" }));
      timers.current.push(window.setTimeout(() => setReaction(null), REACTION_MS.joy));
      timers.current.push(window.setTimeout(() => setBubble(null), BUBBLE_MS));
    });
    return () => {
      off();
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, [t]);

  // Zona táctil = el personaje, no la celda (#1074). El enlace mide `box` (la caja real del
  // personaje dentro de la celda, sheets.gen.ts); el sprite entero se desplaza dentro con
  // `pointer-events: none`, así que su relleno transparente deja pasar los taps a lo que haya
  // debajo (compositor del hilo, barra de voz). El relleno derecho e inferior de la celda se suma
  // al desplazamiento (--pet-pad-r/--pet-pad-b) para que el personaje quede EXACTAMENTE donde
  // estaba antes en pantalla: solo cambia dónde se puede tocar.
  const { cell, box } = spriteBox(state.stage, state.petClass);
  const linkStyle = {
    width: box.w,
    height: box.h,
    "--pet-pad-r": `${cell - box.x - box.w}px`,
    "--pet-pad-b": `${cell - box.y - box.h}px`,
  } as CSSProperties;

  return (
    <Link
      href="/mascota"
      aria-label={t("pet.companionLabel", { name: state.name })}
      data-testid="pet-companion"
      className="fixed z-30 block right-[calc(0.75rem+var(--pet-pad-r))] bottom-[calc(4.75rem+env(safe-area-inset-bottom)+var(--pet-pad-b))] sm:bottom-[calc(1rem+var(--pet-pad-b))]"
      style={linkStyle}
    >
      {bubble ? (
        <span
          role="status"
          className="absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-foreground shadow-card"
        >
          {bubble}
        </span>
      ) : null}
      <div className="absolute" style={{ left: -box.x, top: -box.y, pointerEvents: "none" }}>
        <PetSprite stage={state.stage} petClass={state.petClass} mood={state.mood} scale={1} reaction={reaction} label={state.name} />
      </div>
    </Link>
  );
}
