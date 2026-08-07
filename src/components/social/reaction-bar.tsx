"use client";

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

// Paleta de reacciones (Fase 1 de «Pensamiento»): sustituye el corazón único
// por 4 píldoras -- una por kind, contador si >0, borde/acento cuando el
// viewer ya reaccionó. Misma superficie que el botón heart que reemplaza:
// mismo `run(...)` optimista en el caller, solo cambia qué kind se manda.
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
  return (
    <div className="flex items-center gap-1">
      {REACTION_KINDS.map((kind) => {
        const tally = reactions[kind];
        const { emoji } = reactionMeta(kind);
        return (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            aria-pressed={tally.viewerReacted}
            aria-label={t(`reaction.${kind}`)}
            onClick={() => onToggle(kind)}
            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              tally.viewerReacted
                ? "border-accent text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
            {tally.count > 0 && <span>{tally.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
