"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  EMOJI_GROUPS,
  emojisByGroup,
  searchEmojis,
  type EmojiEntry,
} from "@/lib/social/emoji-catalog";
import { isEmojiSupported } from "@/lib/social/emoji-support";

// Selector completo. Se carga con next/dynamic desde el ReactionBar para que el
// catálogo (153 KB en crudo, 1.906 entradas) no viaje en el bundle del feed.
//
// Sin virtualización a propósito: se pinta SOLO la categoría activa (la mayor,
// Caras, ronda 180 entradas) y la búsqueda corta en 100. Una ventana virtual
// para 1.900 botones es complejidad que este caso no paga.
//
// Ancho y columnas: `min-[1023px]:` es el corte de escritorio de este repo
// (ver post-aside.tsx), no `sm:`/`lg:`. En móvil, 19rem/8 columnas ya
// funcionaba bien; en escritorio hay sitio de sobra y un panel de ese ancho
// se queda pequeño sin motivo, así que crece a 28rem/12 columnas y algo más
// de alto visible (20rem en vez de 14rem).
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

  // Filtrado por soporte real del dispositivo, calculado en el render (nada
  // de useEffect: el repo exige set-state-in-effect limpio y este componente
  // ya vivía sin efectos). `isEmojiSupported` cachea a nivel de módulo, así
  // que memorizar aquí solo evita recrear el array filtrado en renders que no
  // cambian ni la categoría ni la búsqueda — la medición cara ya está resuelta
  // la primera vez que se ve cada emoji. Se filtra solo lo que se va a pintar
  // (categoría activa o resultados de búsqueda, como mucho un par de cientos),
  // nunca las 1.906 entradas del catálogo de golpe.
  const results: EmojiEntry[] = useMemo(() => {
    const raw = query.trim() ? searchEmojis(query) : emojisByGroup(group);
    return raw.filter((entry) => isEmojiSupported(entry.e));
  }, [query, group]);

  return (
    <div className="flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col gap-2 min-[1023px]:w-[28rem]">
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
        // Sigue necesitando desplazarse en móvil (9 categorías no caben en
        // 19rem), pero la barra no debe verse — mismo patrón que
        // post-aside.tsx. En escritorio (28rem) puede que ya quepan todas sin
        // scroll, pero el fix es el mismo en ambos casos.
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        // `overflow-x-hidden` explícito: si se deja en `visible` (el valor por
        // defecto), CSS lo computa como `auto` en cuanto el eje Y deja de ser
        // `visible` (por el `overflow-y-auto` de al lado). Esa barra horizontal
        // fantasma le roba unos px al ancho, el contenido desborda por muy
        // poco y aparece una barra que nadie pidió — en Windows, donde las
        // barras siempre ocupan sitio, eso se suma a la vertical y a la de la
        // tira de categorías: tres barras a la vez.
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-x-hidden overflow-y-auto min-[1023px]:max-h-80 min-[1023px]:grid-cols-12">
          {results.map((entry) => (
            <button
              key={entry.e}
              type="button"
              disabled={isDisabled?.(entry.e) ?? false}
              aria-label={entry.n}
              title={atCap && isDisabled?.(entry.e) ? t("emojiPicker.capReached") : entry.n}
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
