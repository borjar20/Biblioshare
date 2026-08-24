"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  EMOJI_GROUPS,
  emojisByGroup,
  searchEmojis,
  type EmojiEntry,
} from "@/lib/social/emoji-catalog";

// Selector completo. Se carga con next/dynamic desde el ReactionBar para que el
// catálogo (~95 KB de datos) no viaje en el bundle del feed.
//
// Sin virtualización a propósito: se pinta SOLO la categoría activa (la mayor,
// Caras, ronda 180 entradas) y la búsqueda corta en 100. Una ventana virtual
// para 1.900 botones es complejidad que este caso no paga.
export function EmojiPicker({
  onPick,
  onBack,
  atCap = false,
  isDisabled,
}: {
  onPick: (emoji: string) => void;
  onBack: () => void;
  /** Al llegar al tope se avisa, aunque el emoji en pantalla siga siendo pulsable. */
  atCap?: boolean;
  /**
   * Qué botones deshabilitar. El ReactionBar es quien conoce el mapa de
   * reacciones del viewer, así que decide él: al llegar al tope se bloquean
   * los emojis nuevos, pero el viewer puede seguir quitando los suyos.
   */
  isDisabled?: (emoji: string) => boolean;
}) {
  const t = useTranslations("social");
  const [group, setGroup] = useState(0);
  const [query, setQuery] = useState("");

  const results: EmojiEntry[] = query.trim() ? searchEmojis(query) : emojisByGroup(group);

  return (
    <div className="flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("emojiPicker.back")}
          className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ←
        </button>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("emojiPicker.search")}
          aria-label={t("emojiPicker.search")}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground"
        />
      </div>

      {!query.trim() && (
        <div className="flex gap-1 overflow-x-auto">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                group === g.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {atCap && (
        <p className="text-[11px] text-muted-foreground">{t("emojiPicker.capReached")}</p>
      )}

      {results.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {t("emojiPicker.noResults")}
        </p>
      ) : (
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
          {results.map((entry) => (
            <button
              key={entry.e}
              type="button"
              disabled={isDisabled?.(entry.e) ?? false}
              aria-label={entry.n}
              title={entry.n}
              onClick={() => onPick(entry.e)}
              className="rounded p-1 text-lg leading-none transition-colors hover:bg-surface-muted disabled:opacity-40"
            >
              <span aria-hidden="true">{entry.e}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
