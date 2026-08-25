"use client";

import { useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { tallyOf, type ReactionsByEmoji } from "@/lib/social/interactions";
import { capReached, orderedReactions, summarize } from "@/lib/social/reaction-display";
import { QUICK_REACTIONS, QUICK_REACTION_NAMES } from "@/lib/social/reaction-constants";

// El catálogo entero (153 KB en crudo, 1.906 entradas) vive DENTRO de este
// chunk diferido. Por eso el ReactionBar importa reaction-constants y no
// emoji-catalog: si importara el catálogo, esos datos viajarían en el bundle
// del feed y la carga diferida no serviría de nada.
// `loading` ocupa el hueco del selector mientras llega el chunk: sin él, al
// pulsar «+» el botón se desmonta y no se pinta nada hasta que carga. El foco
// cae entonces a <body>, que queda FUERA del div que lleva el onKeyDown de
// Escape, así que con el chunk frío un usuario de teclado se queda varado sin
// poder cerrar. El placeholder mantiene el tamaño aproximado del picker
// (19rem/14rem en móvil, 28rem/20rem desde min-[1023px]: el mismo corte de
// escritorio que usa emoji-picker.tsx) para que el popover no salte de
// tamaño al resolver.
const EmojiPicker = dynamic(() => import("./emoji-picker").then((m) => m.EmojiPicker), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-[19rem] max-w-[calc(100vw-2rem)] items-center justify-center text-xs text-muted-foreground min-[1023px]:h-80 min-[1023px]:w-[28rem]">
      …
    </div>
  ),
});

// Reacciones con cualquier emoji, estilo Teams. Colapsado: los 3 emojis más
// votados + el total (pintarlos todos desbordaría la burbuja). Abierto: los ya
// reaccionados para sumarte de un clic, la fila rápida fija, y el «+» que
// cambia el contenido del popover por el catálogo — no abre un segundo
// flotante, que en 360 px no cabe.
export function ReactionBar({
  reactions,
  disabled,
  onToggle,
}: {
  reactions: ReactionsByEmoji;
  disabled?: boolean;
  onToggle: (emoji: string) => void;
}) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Posición del panel en ESCRITORIO, medida al abrir. En móvil no se usa: el
  // panel deja de colgar del botón (ver el `className` del diálogo más abajo).
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  const { top, total, viewerReacted } = summarize(reactions);
  const existing = orderedReactions(reactions);
  const atCap = capReached(reactions);

  // Foco pendiente sin useEffect: al volver del catálogo (onBack) marcamos la
  // intención, y el callback ref del botón «+» la consume en cuanto ese botón
  // vuelve a montarse (se desmonta mientras `browsing` está activo).
  const restorePlusFocus = useRef(false);

  function close() {
    setOpen(false);
    setBrowsing(false);
    triggerRef.current?.focus();
  }

  // Abre el popover y, de paso, mide dónde cabe en escritorio. Nada de
  // useEffect (lint set-state-in-effect): se mide aquí, en el manejador del
  // clic, con getBoundingClientRect() del propio botón — ANTES de que el
  // panel exista, así que no hay parpadeo de reposicionamiento.
  //
  // Con la sangría de un hilo anidado el botón puede estar muy a la derecha;
  // `left` se acota para que un panel de hasta 28rem (el ancho máximo, el que
  // usa el catálogo) quepa siempre entre los bordes del viewport. El cálculo
  // se hace aunque en ese momento estemos en móvil: el resultado solo lo lee
  // el CSS de escritorio (`min-[1023px]:left-[var(--panel-left)]`), así que
  // hacerlo de más no tiene coste ni efecto en móvil, donde el panel pasa a
  // ser una hoja inferior fija sin relación con el botón.
  function toggleOpen() {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const PANEL_W = 448; // 28rem: ancho máx. del panel en escritorio (EmojiPicker)
        const PANEL_H = 320; // 20rem: alto máx. del catálogo en escritorio
        const MARGIN = 16; // separación mínima con el borde del viewport
        setAnchor({
          left: clamp(rect.left, MARGIN, window.innerWidth - PANEL_W - MARGIN),
          top: clamp(rect.bottom + 4, MARGIN, window.innerHeight - PANEL_H - MARGIN),
        });
      }
    }
    setOpen((o) => !o);
  }

  function pick(emoji: string) {
    onToggle(emoji);
    close();
  }

  function backFromPicker() {
    restorePlusFocus.current = true;
    setBrowsing(false);
  }

  /** Un emoji nuevo se bloquea al llegar al tope; los tuyos siempre se quitan. */
  function blocked(emoji: string) {
    return Boolean(disabled) || (atCap && !tallyOf(reactions, emoji).viewerReacted);
  }

  return (
    <div
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("react")}
        onClick={toggleOpen}
        className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
          viewerReacted
            ? "border-accent text-accent"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {top.length > 0 ? (
          <>
            <span aria-hidden="true">{top.map((r) => r.emoji).join(" ")}</span>
            <span>{total}</span>
          </>
        ) : (
          <span aria-hidden="true">🙂</span>
        )}
      </button>

      {open && (
        <>
          {/* Cierra al pulsar fuera, sin useEffect (lint set-state-in-effect).
              En móvil el panel pasa a ser una hoja inferior a pantalla
              completa (ver el diálogo de abajo), así que aquí sí se oscurece
              el fondo — mismo criterio que event-followers.tsx. En
              escritorio sigue siendo un popover pequeño anclado al botón y el
              fondo se queda como estaba: transparente. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default bg-scrim min-[1023px]:bg-transparent"
          />
          <div
            role="dialog"
            aria-label={browsing ? t("emojiPicker.title") : t("react")}
            // Sin useEffect: `--panel-left/top` se calculan en `toggleOpen`
            // (el manejador de clic que abre el popover) y solo los lee el
            // `min-[1023px]:` de abajo. En móvil el panel es una hoja
            // inferior FIJA respecto al viewport (`inset-x-3` + `bottom-…`),
            // sin relación con la posición del botón: por eso la sangría del
            // hilo deja de importar del todo, no solo se acota. En
            // escritorio sigue anclado al botón, pero con `position: fixed`
            // y coordenadas ya acotadas al viewport, así que nunca se sale
            // por la derecha por mucho que anide el hilo.
            style={
              anchor
                ? ({
                    "--panel-left": `${anchor.left}px`,
                    "--panel-top": `${anchor.top}px`,
                  } as CSSProperties)
                : undefined
            }
            className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-card min-[1023px]:inset-x-auto min-[1023px]:bottom-auto min-[1023px]:left-[var(--panel-left)] min-[1023px]:top-[var(--panel-top)] min-[1023px]:max-h-none min-[1023px]:overflow-visible"
          >
            {browsing ? (
              <EmojiPicker
                onPick={pick}
                onBack={backFromPicker}
                atCap={atCap}
                isDisabled={blocked}
              />
            ) : (
              <div className="flex flex-col gap-1">
                {existing.length > 0 && (
                  // Mismo problema que la tira de categorías del picker: se
                  // desplaza en pantallas estrechas, pero la barra no debe
                  // verse (patrón de post-aside.tsx).
                  <div className="flex max-w-[15rem] items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {existing.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        disabled={blocked(r.emoji)}
                        aria-pressed={r.viewerReacted}
                        onClick={() => pick(r.emoji)}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
                          r.viewerReacted
                            ? "bg-accent/15 text-accent"
                            : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                        }`}
                      >
                        {/* Sin aria-hidden: es el único contenido del botón que
                            identifica el emoji para lectores de pantalla, que
                            resuelven el carácter con su propia tabla CLDR. */}
                        <span>{r.emoji}</span>
                        <span>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      disabled={blocked(emoji)}
                      aria-pressed={tallyOf(reactions, emoji).viewerReacted}
                      aria-label={QUICK_REACTION_NAMES[emoji]}
                      title={atCap ? t("emojiPicker.capReached") : QUICK_REACTION_NAMES[emoji]}
                      onClick={() => pick(emoji)}
                      className={`rounded-full px-2 py-1 text-sm transition-colors disabled:opacity-40 ${
                        tallyOf(reactions, emoji).viewerReacted
                          ? "bg-accent/15"
                          : "hover:bg-surface-muted"
                      }`}
                    >
                      <span aria-hidden="true">{emoji}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    ref={(node) => {
                      // Al volver del catálogo este botón se remonta; si
                      // `backFromPicker` dejó la marca, le devolvemos el foco
                      // aquí mismo (sin useEffect: el callback ref ya corre
                      // tras el commit, que es cuando el nodo existe).
                      if (node && restorePlusFocus.current) {
                        restorePlusFocus.current = false;
                        node.focus();
                      }
                    }}
                    aria-label={t("emojiPicker.open")}
                    title={t("emojiPicker.open")}
                    onClick={() => setBrowsing(true)}
                    className="rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Acota `value` a `[min, max]`. En viewports de escritorio (≥1023px) `max`
 * siempre es ≥ `min` para el uso de arriba, así que no hace falta blindarlo. */
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
