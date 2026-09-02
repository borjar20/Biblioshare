"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { onCelebrationsShown } from "@/lib/celebrations/preference";
import type { CelebrationPayload } from "@/lib/celebrations/types";
import type { CompanionState } from "@/lib/pet/get-companion-state";
import { PetSprite, type PetReaction } from "./pet-sprite";

const JOY_MS = 900;
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
      setReaction("joy");
      setBubble(t(`pet.bubble.${last.event}`, { milestone: last.milestone ?? "" }));
      timers.current.push(window.setTimeout(() => setReaction(null), JOY_MS));
      timers.current.push(window.setTimeout(() => setBubble(null), BUBBLE_MS));
    });
    return () => {
      off();
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, [t]);

  return (
    <Link
      href="/mascota"
      aria-label={t("pet.companionLabel", { name: state.name })}
      data-testid="pet-companion"
      className="fixed right-3 z-30 flex flex-col items-end gap-1 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-4"
    >
      {bubble ? (
        <span role="status" className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-foreground shadow-card">
          {bubble}
        </span>
      ) : null}
      <PetSprite stage={state.stage} petClass={state.petClass} mood={state.mood} scale={1} reaction={reaction} label={state.name} />
    </Link>
  );
}
