"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  REACTION_KINDS,
  type ReactionKind,
  type ReactionsByKind,
} from "@/lib/social/interactions";

const REACTION_EMOJI: Record<ReactionKind, string> = {
  like: "♡",
  read: "📖",
  shock: "😱",
  fire: "🔥",
};

// Fallback estático, fuera de React: el repo no tiene runner de componentes
// (.test.tsx), así que esto es lo único testeable sin infraestructura nueva
// (ver reaction-bar.test.ts). El componente usa t(`reaction.${kind}`) de
// messages/es.json como aria-label real (fuente única de las etiquetas,
// convención del repo) — si tocas un label, toca el otro.
const REACTION_LABEL: Record<ReactionKind, string> = {
  like: "Me gusta",
  read: "Leído",
  shock: "Impacto",
  fire: "Fuego",
};

export function reactionMeta(kind: ReactionKind): { emoji: string; label: string } {
  return { emoji: REACTION_EMOJI[kind], label: REACTION_LABEL[kind] };
}

// Reacciones AGRUPADAS: un solo botón resumen que despliega el selector al
// clicar (antes eran 4 píldoras siempre visibles que comían todo el ancho en
// móvil). Colapsado muestra los emojis con recuento >0 agrupados + el total (o
// 🙂 si aún no hay ninguna); al abrir, un popover con las 4 opciones que se
// alternan (`onToggle`, mismo contrato optimista que antes). Cierra al pulsar
// fuera con un backdrop, sin useEffect (lint set-state-in-effect).
export function ReactionBar({
  reactions,
  disabled,
  onToggle,
}: {
  reactions: ReactionsByKind;
  disabled?: boolean;
  onToggle: (kind: ReactionKind) => void;
}) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);

  const total = REACTION_KINDS.reduce((n, k) => n + reactions[k].count, 0);
  const viewerReacted = REACTION_KINDS.some((k) => reactions[k].viewerReacted);
  const activeKinds = REACTION_KINDS.filter((k) => reactions[k].count > 0);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("react")}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
          viewerReacted
            ? "border-accent text-accent"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {activeKinds.length > 0 ? (
          <>
            <span aria-hidden="true">{activeKinds.map((k) => REACTION_EMOJI[k]).join(" ")}</span>
            <span>{total}</span>
          </>
        ) : (
          <span aria-hidden="true">🙂</span>
        )}
      </button>

      {open && (
        <>
          {/* Cierra al pulsar fuera, sin useEffect. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute top-full left-0 z-20 mt-1 flex items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-card">
            {REACTION_KINDS.map((kind) => {
              const tally = reactions[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={disabled}
                  aria-pressed={tally.viewerReacted}
                  aria-label={t(`reaction.${kind}`)}
                  onClick={() => onToggle(kind)}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                    tally.viewerReacted
                      ? "bg-accent/15 text-accent"
                      : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  <span aria-hidden="true">{REACTION_EMOJI[kind]}</span>
                  {tally.count > 0 && <span>{tally.count}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
